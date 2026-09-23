//! ═══════════════════════════════════════════════════════════════════════════
//! MEMÓRIÁBAN ÉLŐ `@upstash/redis` A TESZTEKHEZ
//! ═══════════════════════════════════════════════════════════════════════════
//! A `preload.ts` ezzel cseréli le a valódi klienst, és beállítja a környezeti
//! változókat — így a tárolók (`calendar-store`, `push-store`, `usage-store`,
//! `webrtc-store`) a Redis-es águkon futnak, hálózat nélkül.
//!
//! CSAK AZOKAT A PARANCSOKAT tudja, amiket az app használ, és úgy, ahogy az
//! Upstash kliense: az érték JSON-ként kerül be, és olvasáskor — ha JSON-ként
//! értelmezhető — objektumként jön vissza (`automaticDeserialization`).
//!
//! Minden példány UGYANAZT a tárat látja (`resetRedis()` üríti), mert a
//! tárolók a modul betöltésekor egyszer hozzák létre a klienst.
//! ═══════════════════════════════════════════════════════════════════════════

type Entry = { value: unknown; expiresAt: number | null };

const data = new Map<string, Entry>();
export const redisCalls: { cmd: string; args: unknown[] }[] = [];
//* Igazra állítva minden parancs dob — a „nem elérhető tároló" utánzása.
export const redisControl = { broken: false };

export function resetRedis(): void {
  data.clear();
  redisCalls.length = 0;
  redisControl.broken = false;
}

//* A tár nyers tartalma (lejárt kulcsok nélkül) — ellenőrzéshez.
export function redisDump(): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of [...data.keys()]) {
    const value = live(key);
    if (value !== undefined) out[key] = value.value;
  }
  return out;
}

export function redisTtl(key: string): number | null {
  const entry = live(key);
  if (!entry?.expiresAt) return null;
  return Math.round((entry.expiresAt - Date.now()) / 1000);
}

function live(key: string): Entry | undefined {
  const entry = data.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt !== null && entry.expiresAt <= Date.now()) {
    data.delete(key);
    return undefined;
  }
  return entry;
}

function encode(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value);
}

function decode(raw: unknown): unknown {
  if (typeof raw !== "string") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

export class FakeRedis {
  constructor(_config?: unknown) {}

  private track(cmd: string, args: unknown[]): void {
    redisCalls.push({ cmd, args });
    if (redisControl.broken) throw new Error("redis down");
  }

  async get<T>(key: string): Promise<T | null> {
    this.track("get", [key]);
    const entry = live(key);
    return entry ? (decode(entry.value) as T) : null;
  }

  async mget<T extends unknown[]>(...keys: string[]): Promise<T> {
    this.track("mget", keys);
    return keys.map((k) => {
      const entry = live(k);
      return entry ? decode(entry.value) : null;
    }) as T;
  }

  async set(
    key: string,
    value: unknown,
    opts: { ex?: number; nx?: boolean } = {},
  ): Promise<"OK" | null> {
    this.track("set", [key, value, opts]);
    if (opts.nx && live(key)) return null;
    data.set(key, {
      value: encode(value),
      expiresAt: opts.ex ? Date.now() + opts.ex * 1000 : null,
    });
    return "OK";
  }

  async del(...keys: string[]): Promise<number> {
    this.track("del", keys);
    let n = 0;
    for (const k of keys) if (data.delete(k)) n++;
    return n;
  }

  async expire(key: string, seconds: number): Promise<number> {
    this.track("expire", [key, seconds]);
    const entry = live(key);
    if (!entry) return 0;
    entry.expiresAt = Date.now() + seconds * 1000;
    return 1;
  }

  private hash(key: string): Record<string, string> {
    const entry = live(key);
    if (!entry) {
      const fresh: Record<string, string> = {};
      data.set(key, { value: fresh, expiresAt: null });
      return fresh;
    }
    return entry.value as Record<string, string>;
  }

  async hincrby(key: string, field: string, by: number): Promise<number> {
    this.track("hincrby", [key, field, by]);
    const h = this.hash(key);
    const next = Number(h[field] ?? 0) + by;
    h[field] = String(next);
    return next;
  }

  async hgetall<T>(key: string): Promise<T | null> {
    this.track("hgetall", [key]);
    const entry = live(key);
    if (!entry) return null;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(entry.value as Record<string, string>)) {
      out[k] = decode(v);
    }
    return out as T;
  }

  private set_(key: string): Set<string> {
    const entry = live(key);
    if (!entry) {
      const fresh = new Set<string>();
      data.set(key, { value: fresh, expiresAt: null });
      return fresh;
    }
    return entry.value as Set<string>;
  }

  async sadd(key: string, ...members: string[]): Promise<number> {
    this.track("sadd", [key, ...members]);
    const s = this.set_(key);
    let n = 0;
    for (const m of members) {
      if (!s.has(m)) n++;
      s.add(m);
    }
    return n;
  }

  async srem(key: string, ...members: string[]): Promise<number> {
    this.track("srem", [key, ...members]);
    const entry = live(key);
    if (!entry) return 0;
    const s = entry.value as Set<string>;
    let n = 0;
    for (const m of members) if (s.delete(m)) n++;
    if (s.size === 0) data.delete(key);
    return n;
  }

  async smembers(key: string): Promise<string[]> {
    this.track("smembers", [key]);
    const entry = live(key);
    return entry ? [...(entry.value as Set<string>)] : [];
  }

  private list(key: string): string[] {
    const entry = live(key);
    if (!entry) {
      const fresh: string[] = [];
      data.set(key, { value: fresh, expiresAt: null });
      return fresh;
    }
    return entry.value as string[];
  }

  async rpush(key: string, ...values: unknown[]): Promise<number> {
    this.track("rpush", [key, ...values]);
    const l = this.list(key);
    l.push(...values.map(encode));
    return l.length;
  }

  async ltrim(key: string, start: number, stop: number): Promise<"OK"> {
    this.track("ltrim", [key, start, stop]);
    const l = this.list(key);
    const len = l.length;
    const from = start < 0 ? Math.max(0, len + start) : start;
    const to = stop < 0 ? len + stop : stop;
    const kept = l.slice(from, to + 1);
    l.length = 0;
    l.push(...kept);
    return "OK";
  }

  async llen(key: string): Promise<number> {
    this.track("llen", [key]);
    return (live(key)?.value as string[] | undefined)?.length ?? 0;
  }

  async lpop<T>(key: string, count?: number): Promise<T | null> {
    this.track("lpop", [key, count]);
    const entry = live(key);
    if (!entry) return null;
    const l = entry.value as string[];
    if (l.length === 0) return null;
    const taken = l.splice(0, count ?? 1).map(decode);
    if (l.length === 0) data.delete(key);
    return (count === undefined ? taken[0] : taken) as T;
  }

  pipeline() {
    const queue: (() => Promise<unknown>)[] = [];
    const self = this;
    const chain = new Proxy(
      {},
      {
        get(_, prop: string) {
          if (prop === "exec") {
            return async () => {
              const out: unknown[] = [];
              for (const run of queue) out.push(await run());
              return out;
            };
          }
          return (...args: unknown[]) => {
            const method = (self as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>)[prop];
            queue.push(() => method.apply(self, args));
            return chain;
          };
        },
      },
    );
    return chain as {
      exec<T = unknown[]>(): Promise<T>;
    } & Record<string, (...args: unknown[]) => unknown>;
  }
}
