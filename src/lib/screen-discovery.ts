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
//! A PRÓBA UGYANAZ, MINT A NÉZŐ: a `/ScreenTask.jpg` képet töltjük be. Ha kép
//! jön, az biztosan ScreenTask — egy nyomtató vagy router nem ad ott JPEG-et.
//! Emiatt ugyanott működik, ahol a néző (lásd `canViewInPage`).
//! ═══════════════════════════════════════════════════════════════════════════

export const SCHOOL_HOST_PREFIX = "10.0.";
export const DISCOVERY_PORTS = [7070, 8080] as const;
export const DISCOVERY_LAST_OCTET_MAX = 25;

//* Egyszerre ennyi kép tölt — egy teljes harmadik szám (25 gép × 2 port) belefér.
const PROBE_CONCURRENCY = 50;
//! Egy élő ScreenTask a helyi hálózaton jóval hamarabb válaszol; a nem létező
//! gépre menő kérés viszont se `load`-ot, se `error`-t nem ad — ezért vágjuk el.
const PROBE_TIMEOUT_MS = 2500;

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
//! Chrome az első helyi kérésnél megkérdezi a felhasználót. AMÍG A KÉRDÉS NYITVA
//! VAN, A KÉRÉSEK VÁRNAK — ha közben ketyegne az időkorlát, minden próba
//! „nem válaszolt" lenne. Ezért az órát csak az engedély megadása után
//! indítjuk. A jogosultság neve Chrome-verziónként más, ezért mindkettőt
//! megpróbáljuk; ha egyik sincs, nincs mire várni.
async function localNetworkPermission(): Promise<PermissionStatus | null> {
  if (typeof navigator === "undefined" || !navigator.permissions) return null;
  for (const name of ["local-network-access", "local-network"]) {
    try {
      return await navigator.permissions.query({
        name,
      } as unknown as PermissionDescriptor);
    } catch {
      //* Ismeretlen név ebben a böngészőben — próbáljuk a következőt.
    }
  }
  return null;
}

function probe(
  address: ScreenAddress,
  clockStarted: Promise<void>,
  signal: AbortSignal,
): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = (found: boolean) => {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      img.onload = null;
      img.onerror = null;
      if (!found) img.src = "";
      resolve(found);
    };
    const onAbort = () => finish(false);
    if (signal.aborted) return resolve(false);
    signal.addEventListener("abort", onAbort);
    img.onload = () => finish(img.naturalWidth > 0);
    img.onerror = () => finish(false);
    img.src = screenTaskFrameUrl(address, `probe-${Date.now()}`);
    void clockStarted.then(() => {
      timer = setTimeout(() => finish(false), PROBE_TIMEOUT_MS);
    });
  });
}

export type DiscoveryProgress = {
  phase: "permission" | "searching";
  done: number;
  total: number;
};

export type DiscoveryResult =
  | { status: "found"; address: ScreenAddress }
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

  const permission = await localNetworkPermission();
  if (permission?.state === "denied") return { status: "denied" };

  //* A saját jelünk: találat, megszakítás vagy elutasított engedély állítja le.
  const stop = new AbortController();
  const onOuterAbort = () => stop.abort();
  signal.addEventListener("abort", onOuterAbort);
  let denied = false;

  const clockStarted = new Promise<void>((resolve) => {
    if (permission?.state !== "prompt") return resolve();
    onProgress({ phase: "permission", done, total });
    permission.addEventListener("change", function onChange() {
      if (permission.state === "prompt") return;
      permission.removeEventListener("change", onChange);
      if (permission.state === "denied") {
        denied = true;
        stop.abort();
      } else {
        onProgress({ phase: "searching", done, total });
      }
      resolve();
    });
  });
  if (permission?.state !== "prompt") {
    onProgress({ phase: "searching", done, total });
  }

  let found: ScreenAddress | null = null;
  let next = 0;
  const worker = async () => {
    while (!stop.signal.aborted && next < addresses.length) {
      const address = addresses[next++];
      if (await probe(address, clockStarted, stop.signal)) {
        found ??= address;
        stop.abort();
        return;
      }
      done += 1;
      if (!stop.signal.aborted) {
        onProgress({ phase: "searching", done, total });
      }
    }
  };

  try {
    await Promise.all(
      Array.from({ length: Math.min(PROBE_CONCURRENCY, total) }, worker),
    );
  } finally {
    signal.removeEventListener("abort", onOuterAbort);
  }

  if (found) return { status: "found", address: found };
  if (denied) return { status: "denied" };
  if (signal.aborted) return { status: "aborted" };
  return { status: "not-found" };
}
