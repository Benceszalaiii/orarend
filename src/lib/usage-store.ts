import { Redis } from "@upstash/redis";
import { shiftDayKey, usageDayKey } from "./usage-day";

//! CSAK A SZERVEREN. Ez a modul az írás-jogú tokent olvassa a környezetből —
//! kliens bundle-be SOHA nem kerülhet be.
import "server-only";

//* A Vercel marketplace Upstash-integrációja `REDIS_KV_*` néven adja ki a
//* változókat, nem az `UPSTASH_REDIS_REST_*` alapértelmezettként — ezért a
//* `Redis.fromEnv()` itt nem használható.
const url = process.env.REDIS_KV_REST_API_URL;
const token = process.env.REDIS_KV_REST_API_TOKEN;

//! A HIÁNYZÓ REDIS NEM HIBA, HANEM NÉMASÁG. A statisztika mellékes: ha a tároló
//! nincs beállítva (pl. friss klón `.env.local` nélkül), az app működjön
//! változatlanul, csak ne számoljon. Dobni itt annyit jelentene, hogy egy
//! elfelejtett env-változó elviszi az órarendet is.
const redis = url && token ? new Redis({ url, token }) : null;

export function usageStoreReady(): boolean {
  return redis !== null;
}

//* Napi bontásban tároljuk: `hasznalat:2026-09-02` hash, mezőnként egy osztály,
//* értéke az aznapi eszközök száma. Így későbbi trend is kirajzolható, és
//* egyetlen sor sem mond semmit egyetlen diákról.
function redisKey(dayKey: string): string {
  return `hasznalat:${dayKey}`;
}

//! MEDDIG TARTJUK MEG. Két tanév bőven elég ahhoz, hogy évek között is
//! összehasonlítható legyen, és közben a tároló nem nő a végtelenségig.
const RETENTION_SECONDS = 60 * 60 * 24 * 800;

export async function recordClassUse(short: string): Promise<void> {
  if (!redis) return;
  const key = redisKey(usageDayKey());
  await redis.hincrby(key, short, 1);
  //* Az `expire` minden íráskor újrahúzza a határidőt az aznapi kulcson; a
  //* kulcs a nap végén rögzül, onnantól visszaszámol.
  await redis.expire(key, RETENTION_SECONDS);
}

export type UsageDay = { date: string; classes: Record<string, number> };

export async function readUsage(days: number): Promise<UsageDay[]> {
  if (!redis) return [];
  const today = usageDayKey();
  const dates: string[] = [];
  for (let i = 0; i < days; i++) {
    dates.push(shiftDayKey(today, -i));
  }
  const results = await Promise.all(
    dates.map((date) => redis.hgetall<Record<string, number>>(redisKey(date))),
  );
  return dates.map((date, i) => ({ date, classes: results[i] ?? {} }));
}
