import { type ScreenAddress, screenTaskFrameUrl } from "./lesson-extras";

//! ═══════════════════════════════════════════════════════════════════════════
//! A TANÁRI GÉP MEGKERESÉSE A TEREM HÁLÓZATÁN
//! ═══════════════════════════════════════════════════════════════════════════
//! A BÖNGÉSZŐ NEM ÁRULJA EL A GÉP HELYI IP-JÉT (a WebRTC ma már véletlen
//! `.local` nevet ad), a szerverünk pedig csak az iskola nyilvános címét látja.
//! Ezért nem kiolvassuk, hanem MEGKERESSÜK: az iskolai hálózat szabályai
//! annyira szűkítik a lehetséges címeket, hogy néhány másodperc alatt végig
//! lehet próbálni őket.
//!
//!   • `10.0.<terem>.<gép>` — a harmadik szám többnyire a terem SZÁMA, de nem
//!     mindig (lásd `thirdOctetCandidates`);
//!   • a negyedik szám 1–25;
//!   • a ScreenTask a 7070-es vagy a 8080-as porton fut.
//!
//! A PRÓBA: válaszol-e bármi az adott címen (`fetch`), és ha igen, ad-e
//! `/ScreenTask.jpg` képet — egy nyomtató vagy router nem ad ott JPEG-et.
//! Ugyanott működik, ahol a néző (lásd `canViewInPage`).
//! ═══════════════════════════════════════════════════════════════════════════

export const SCHOOL_HOST_PREFIX = "10.0.";
export const DISCOVERY_PORTS = [7070, 8080] as const;
export const DISCOVERY_LAST_OCTET_MAX = 25;

//! Chrome egy célpont felé (közvetlen kapcsolatnál) legfeljebb 32 foglalatot
//! nyit — a többi a böngészőn belül sorban áll, és közben ketyegne az órája.
const PROBE_CONCURRENCY = 24;
//! A nem létező gépre menő kérés se választ, se hibát nem ad — ezért vágjuk el.
//! A ScreenTask EGYESÉVEL szolgálja ki a kéréseket, és közben a diákok nézői is
//! kérik a képet, ezért egy élő gépnek is kell némi idő.
const PROBE_TIMEOUT_MS = 4000;
//! Ennyit várunk legfeljebb, hogy a felhasználó rábökjön a Chrome helyi hálózati
//! engedélykérésére. Utána az órák mindenképp indulnak — különben egy soha meg
//! nem érkező jelzésre várva a keresés örökre beragadna.
const PERMISSION_WAIT_MS = 20_000;

//! ─── A HARMADIK SZÁM JELÖLTJEI ─────────────────────────────────────────────
//! Sorrend = valószínűség. Előbb, amit a tanár maga beírt a mezőbe
//! („10.0.112."), aztán a teremnév számai: egészben („a218" → 218), és ha az
//! nem fér bele egy oktettbe vagy mégsem az, az utolsó két jegye („305" → 5,
//! „218" → 18).
export function thirdOctetCandidates(room: string, typed = ""): number[] {
  const out: number[] = [];
  const add = (n: number) => {
    if (Number.isInteger(n) && n >= 0 && n <= 255 && !out.includes(n)) {
      out.push(n);
    }
  };

  const fromTyped = /^\s*(?:https?:\/\/)?10\.0\.(\d{1,3})(?:\D|$)/i.exec(typed);
  if (fromTyped) add(Number(fromTyped[1]));

  const groups = room.match(/\d+/g) ?? [];
  for (const group of groups) add(Number(group));
  for (const group of groups) {
    if (group.length >= 3) add(Number(group.slice(-2)));
  }
  return out;
}

//* Minden kipróbálandó cím, valószínűségi sorrendben.
export function discoveryAddresses(thirdOctets: number[]): ScreenAddress[] {
  const out: ScreenAddress[] = [];
  for (const third of thirdOctets) {
    for (let last = 1; last <= DISCOVERY_LAST_OCTET_MAX; last++) {
      for (const port of DISCOVERY_PORTS) {
        out.push({ host: `${SCHOOL_HOST_PREFIX}${third}.${last}`, port });
      }
    }
  }
  return out;
}

//! ─── A HELYI HÁLÓZATI ENGEDÉLY ─────────────────────────────────────────────
//! Chrome az első helyi kérésnél megkérdezi a felhasználót, és AMÍG A KÉRDÉS
//! NYITVA VAN, A KÉRÉSEK VÁRNAK. Ha közben ketyegne az időkorlát, minden próba
//! „nem válaszolt" lenne — ezért az órák csak az engedély után indulnak.
//!
//! A `change` ESEMÉNYBEN NEM BÍZUNK: Chrome ennél az engedélynél nem mindig
//! küldi el, és a keresés tőle függve örökre beragadt („2/50"). Helyette
//! lekérdezgetjük az állapotot, és az is kinyitja a kaput, ha bármelyik kérés
//! magától lezárult (a böngésző már nem tartja vissza). Felső korlát: 20 mp.
//!
//! Engedélykérés csak nyilvános `https` lapról a helyi hálózat felé van; a
//! `localhost`-ról vagy `http` lapról induló keresésnek nincs mire várnia.
const PERMISSION_NAMES = ["local-network-access", "local-network"];

async function localNetworkPermissionState(): Promise<PermissionState | null> {
  if (typeof navigator === "undefined" || !navigator.permissions) return null;
  for (const name of PERMISSION_NAMES) {
    try {
      const status = await navigator.permissions.query({
        name,
      } as unknown as PermissionDescriptor);
      return status.state;
    } catch {
      //* Ismeretlen név ebben a böngészőben — próbáljuk a következőt.
    }
  }
  return null;
}

function needsLocalNetworkPermission(): boolean {
  if (typeof window === "undefined") return false;
  const { protocol, hostname } = window.location;
  if (protocol !== "https:") return false;
  return !(
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.startsWith("127.") ||
    hostname === "[::1]"
  );
}

//! ─── EGY CÍM KIPRÓBÁLÁSA ────────────────────────────────────────────────────
//! KÉT LÉPÉS. Előbb egy `fetch`: ez BÁRMILYEN HTTP-válaszra teljesül — a
//! jelszavas ScreenTask 401-ére is, amire egy kép sosem töltene be. A
//! `targetAddressSpace: "local"` mondja meg Chrome-nak előre, hogy helyi
//! hálózatra megy (engedélykérés + kivétel a vegyes tartalom tilalma alól).
//! Ha válaszolt, a képpel megnézzük, TÉNYLEG ScreenTask-e.
type Outcome = "screentask" | "responded" | "silent";

function withTimeout(
  signal: AbortSignal,
  clock: Promise<void>,
): { signal: AbortSignal; dispose: () => void } {
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  signal.addEventListener("abort", onAbort);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;
  void clock.then(() => {
    if (!disposed) timer = setTimeout(onAbort, PROBE_TIMEOUT_MS);
  });
  if (signal.aborted) controller.abort();
  return {
    signal: controller.signal,
    dispose: () => {
      disposed = true;
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
    },
  };
}

//* `onSettled`: a kérés magától lezárult (válasz vagy hálózati hiba, nem a mi
//* időkorlátunk) — a böngésző tehát már nem tartja vissza engedélyre várva.
async function responds(
  address: ScreenAddress,
  clock: Promise<void>,
  signal: AbortSignal,
  onSettled: () => void,
): Promise<boolean> {
  const limit = withTimeout(signal, clock);
  try {
    await fetch(`http://${address.host}:${address.port}/`, {
      mode: "no-cors",
      cache: "no-store",
      credentials: "omit",
      referrerPolicy: "no-referrer",
      signal: limit.signal,
      targetAddressSpace: "local",
    } as RequestInit);
    onSettled();
    return true;
  } catch {
    if (!limit.signal.aborted) onSettled();
    return false;
  } finally {
    limit.dispose();
  }
}

function servesScreenshot(
  address: ScreenAddress,
  signal: AbortSignal,
): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image();
    const finish = (ok: boolean) => {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      img.onload = null;
      img.onerror = null;
      if (!ok) img.src = "";
      resolve(ok);
    };
    const onAbort = () => finish(false);
    const timer = setTimeout(onAbort, PROBE_TIMEOUT_MS);
    if (signal.aborted) return finish(false);
    signal.addEventListener("abort", onAbort);
    img.onload = () => finish(img.naturalWidth > 0);
    img.onerror = () => finish(false);
    img.src = screenTaskFrameUrl(address, `probe-${Date.now()}`);
  });
}

async function probe(
  address: ScreenAddress,
  clock: Promise<void>,
  signal: AbortSignal,
  onSettled: () => void,
): Promise<Outcome> {
  if (!(await responds(address, clock, signal, onSettled))) return "silent";
  return (await servesScreenshot(address, signal)) ? "screentask" : "responded";
}

export type DiscoveryProgress = {
  phase: "permission" | "searching";
  done: number;
  total: number;
};

export type DiscoveryResult =
  //! `confirmed: false` — válaszolt, de képet nem adott. Jelszavas ScreenTask
  //! lehet, de más eszköz is; a felület ezt kimondja.
  | { status: "found"; address: ScreenAddress; confirmed: boolean }
  | { status: "not-found" }
  | { status: "denied" }
  | { status: "aborted" };

export async function discoverScreen(
  addresses: ScreenAddress[],
  {
    signal,
    onProgress,
  }: { signal: AbortSignal; onProgress: (p: DiscoveryProgress) => void },
): Promise<DiscoveryResult> {
  const total = addresses.length;
  let done = 0;

  const initialState = await localNetworkPermissionState();
  if (initialState === "denied") return { status: "denied" };
  const waitsForPermission =
    needsLocalNetworkPermission() && initialState !== "granted";

  //* A saját jelünk: találat vagy megszakítás állítja le.
  const stop = new AbortController();
  const onOuterAbort = () => stop.abort();
  signal.addEventListener("abort", onOuterAbort);

  let openGate = () => {};
  const clock = new Promise<void>((resolve) => {
    openGate = resolve;
  });
  let phase: DiscoveryProgress["phase"] = "searching";
  let poll: ReturnType<typeof setInterval> | undefined;
  let cap: ReturnType<typeof setTimeout> | undefined;
  const startClocks = () => {
    clearInterval(poll);
    clearTimeout(cap);
    if (phase === "permission") {
      phase = "searching";
      onProgress({ phase, done, total });
    }
    openGate();
  };
  if (waitsForPermission) {
    phase = "permission";
    poll = setInterval(async () => {
      const state = await localNetworkPermissionState();
      if (state === "granted") startClocks();
      if (state === "denied") stop.abort();
    }, 250);
    cap = setTimeout(startClocks, PERMISSION_WAIT_MS);
  } else {
    openGate();
  }
  onProgress({ phase, done, total });

  let found: ScreenAddress | null = null;
  let maybe: ScreenAddress | null = null;
  let next = 0;
  const worker = async () => {
    while (!stop.signal.aborted && next < addresses.length) {
      const address = addresses[next++];
      const outcome = await probe(address, clock, stop.signal, startClocks);
      if (outcome === "screentask") {
        found ??= address;
        stop.abort();
        return;
      }
      if (outcome === "responded") maybe ??= address;
      done += 1;
      if (!stop.signal.aborted) onProgress({ phase, done, total });
    }
  };

  try {
    await Promise.all(
      Array.from({ length: Math.min(PROBE_CONCURRENCY, total) }, worker),
    );
  } finally {
    clearInterval(poll);
    clearTimeout(cap);
    signal.removeEventListener("abort", onOuterAbort);
  }

  if (found) return { status: "found", address: found, confirmed: true };
  if (signal.aborted) return { status: "aborted" };
  if (maybe) return { status: "found", address: maybe, confirmed: false };
  if ((await localNetworkPermissionState()) === "denied") {
    return { status: "denied" };
  }
  return { status: "not-found" };
}
