//! ═══════════════════════════════════════════════════════════════════════════
//! EGY KÉZZEL ÖSSZERAKOTT „BÖNGÉSZŐ" A TESZTEKHEZ
//! ═══════════════════════════════════════════════════════════════════════════
//! A Bun nem ad `window`-t, `localStorage`-t, `document`-et. Egy teljes DOM
//! (happy-dom, jsdom) új függőség lenne néhány kulcs-érték íráshoz — ez a
//! modul csak annyit utánoz, amennyit a `src/lib` tárolói tényleg használnak.
//!
//! HASZNÁLAT: `beforeEach(() => installBrowser())`, `afterEach(uninstallBrowser)`.
//! A globálisokat MINDIG vissza kell venni: a Bun egy folyamatban futtatja
//! az összes tesztfájlt, és egy ottfelejtett `window` a szerveroldali
//! (`typeof window === "undefined"`) ágakat némán kikapcsolná a többi fájlban.
//! ═══════════════════════════════════════════════════════════════════════════

export class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  //* Igazra állítva minden hívás dob — a privát mód / tele tárhely utánzása.
  broken = false;

  get length(): number {
    return this.map.size;
  }
  clear(): void {
    this.guard();
    this.map.clear();
  }
  getItem(key: string): string | null {
    this.guard();
    return this.map.has(key) ? (this.map.get(key) as string) : null;
  }
  key(index: number): string | null {
    this.guard();
    return [...this.map.keys()][index] ?? null;
  }
  removeItem(key: string): void {
    this.guard();
    this.map.delete(key);
  }
  setItem(key: string, value: string): void {
    this.guard();
    this.map.set(key, String(value));
  }
  private guard(): void {
    if (this.broken) throw new DOMException("denied", "SecurityError");
  }
}

export type FakeBrowser = {
  window: EventTarget & Record<string, unknown>;
  localStorage: MemoryStorage;
  sessionStorage: MemoryStorage;
  document: {
    cookie: string;
    cookies: string[];
    documentElement: {
      classList: {
        toggle(name: string, on?: boolean): boolean;
        contains(name: string): boolean;
      };
      dataset: Record<string, string>;
      style: Record<string, string>;
    };
    visibilityState: string;
  } & EventTarget;
  navigator: { userAgent: string; standalone?: boolean } & Record<
    string,
    unknown
  >;
  //* `media` → `matches`. Ami nincs benne, az `false`.
  media: Record<string, boolean>;
  events: string[];
};

type Options = {
  userAgent?: string;
  protocol?: string;
  media?: Record<string, boolean>;
};

const KEYS = [
  "window",
  "localStorage",
  "sessionStorage",
  "document",
  "navigator",
] as const;
let saved: Map<string, PropertyDescriptor | undefined> | null = null;

export function installBrowser(options: Options = {}): FakeBrowser {
  if (saved) uninstallBrowser();
  const localStorage = new MemoryStorage();
  const sessionStorage = new MemoryStorage();
  const media: Record<string, boolean> = { ...(options.media ?? {}) };
  const events: string[] = [];

  const classes = new Set<string>();
  const cookies: string[] = [];
  const documentTarget = new EventTarget();
  const document = Object.assign(documentTarget, {
    cookies,
    documentElement: {
      classList: {
        toggle(name: string, on?: boolean) {
          const next = on ?? !classes.has(name);
          if (next) classes.add(name);
          else classes.delete(name);
          return next;
        },
        contains: (name: string) => classes.has(name),
      },
      dataset: {} as Record<string, string>,
      style: {} as Record<string, string>,
    },
    visibilityState: "visible",
  });
  Object.defineProperty(document, "cookie", {
    get: () => cookies.map((c) => c.split(";")[0]).join("; "),
    set: (value: string) => {
      cookies.push(value);
    },
    configurable: true,
  });

  const navigator = {
    userAgent: options.userAgent ?? "Mozilla/5.0 (X11; Linux x86_64) bun-test",
  } as FakeBrowser["navigator"];

  const target = new EventTarget();
  const originalDispatch = target.dispatchEvent.bind(target);
  const window = Object.assign(target, {
    localStorage,
    sessionStorage,
    document,
    navigator,
    location: {
      protocol: options.protocol ?? "https:",
      origin: `${options.protocol ?? "https:"}//orarend.test`,
      host: "orarend.test",
      hostname: "orarend.test",
      href: `${options.protocol ?? "https:"}//orarend.test/`,
      pathname: "/",
      search: "",
    },
    matchMedia: (query: string) => ({
      matches: media[query] === true,
      media: query,
      addEventListener() {},
      removeEventListener() {},
    }),
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
    setInterval: globalThis.setInterval,
    clearInterval: globalThis.clearInterval,
    atob: globalThis.atob,
    btoa: globalThis.btoa,
  }) as unknown as FakeBrowser["window"];
  window.dispatchEvent = (event: Event) => {
    events.push(event.type);
    return originalDispatch(event);
  };

  saved = new Map();
  const values: Record<(typeof KEYS)[number], unknown> = {
    window,
    localStorage,
    sessionStorage,
    document,
    navigator,
  };
  for (const key of KEYS) {
    saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, {
      value: values[key],
      configurable: true,
      writable: true,
    });
  }

  return {
    window,
    localStorage,
    sessionStorage,
    document: document as unknown as FakeBrowser["document"],
    navigator,
    media,
    events,
  };
}

export function uninstallBrowser(): void {
  if (!saved) return;
  for (const [key, descriptor] of saved) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else delete (globalThis as Record<string, unknown>)[key];
  }
  saved = null;
}

//* A `fetch` cseréje egy teszt idejére. Visszaadja a hívások listáját.
export type FetchCall = { url: string; init?: RequestInit };

export function stubFetch(
  handler: (url: string, init?: RequestInit) => Response | Promise<Response>,
): { calls: FetchCall[]; restore: () => void } {
  const original = globalThis.fetch;
  const calls: FetchCall[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    calls.push({ url, init });
    return handler(url, init);
  }) as typeof fetch;
  return {
    calls,
    restore: () => {
      globalThis.fetch = original;
    },
  };
}

export function json(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}
