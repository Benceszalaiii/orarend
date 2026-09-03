import {
  applyLocalPrefs,
  clearSyncMeta,
  collectLocalPrefs,
  loadSyncMeta,
  mergePrefs,
  saveSyncMeta,
} from "./prefs-local";
import {
  hasAnyPrefs,
  type PrefsEnvelope,
  type SyncedPrefs,
  sanitizePrefs,
} from "./prefs-shared";

//! ═══════════════════════════════════════════════════════════════════════════
//! A SZINKRON MENETE
//! ═══════════════════════════════════════════════════════════════════════════
//! Egy kör mindig ugyanaz a három lépés: LEKÉR — ÖSSZEFÉSÜL — VISSZAÍR.
//!
//! A legfontosabb szabály, ami minden ág mögött ott áll: A SZINKRON SOSEM
//! RONTHATJA EL AZT, AMI MÁR MŰKÖDIK. Ha a hálózat nincs, ha a munkamenet
//! lejárt, ha a szerver hibázik — a helyi beállítás marad, ahogy volt, és a lap
//! ugyanúgy használható, mint bejelentkezés nélkül. Ezért nincs egyetlen olyan
//! ág sem, ami hiba esetén TÖRÖLNE valamit a készülékről.
//! ═══════════════════════════════════════════════════════════════════════════

const ENDPOINT = "/api/beallitasok";

export type SyncOutcome =
  | { status: "ok"; revision: number; updatedAt: string | null }
  //* A munkamenet lejárt vagy nincs — nem hiba, csak nincs mit szinkronizálni.
  | { status: "signed-out" }
  | { status: "error" };

//! A KULCSOK SORRENDJE NEM JELENT KÜLÖNBSÉGET. Az összehasonlításhoz azt kell
//! tudnunk, hogy a TARTALOM más-e; egy `JSON.stringify` viszont a beszúrás
//! sorrendjét is beleszámítaná, és attól minden körben „változást" látnánk —
//! vagyis fölöslegesen írnánk vissza a szervernek.
function stableStringify(prefs: SyncedPrefs): string {
  const sortedRecord = <T>(record: Record<string, T>) =>
    Object.keys(record)
      .sort()
      .map((key) => [key, record[key]] as const);
  return JSON.stringify([
    prefs.class,
    prefs.lastView,
    sortedRecord(prefs.merge),
    sortedRecord(prefs.dual),
  ]);
}

function samePrefs(a: SyncedPrefs, b: SyncedPrefs): boolean {
  return stableStringify(a) === stableStringify(b);
}

function toEnvelope(value: unknown): PrefsEnvelope {
  const raw = (value ?? {}) as Partial<PrefsEnvelope>;
  return {
    prefs: sanitizePrefs(raw.prefs),
    revision: typeof raw.revision === "number" ? raw.revision : 0,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : null,
  };
}

async function fetchRemote(
  signal?: AbortSignal,
): Promise<PrefsEnvelope | "signed-out" | null> {
  try {
    const res = await fetch(ENDPOINT, {
      //! A `no-store` NEM optimalizálás, hanem helyesség: a beállítások
      //! személyre szólnak, és egy gyorsítótárazott válasz az előző
      //! bejelentkezés adatát hozná vissza egy fiókváltás után.
      cache: "no-store",
      signal,
    });
    if (res.status === 401) return "signed-out";
    if (!res.ok) return null;
    return toEnvelope(await res.json());
  } catch {
    //* Hálózati hiba / megszakítás — a hívó ilyenkor egyszerűen nem szinkronizál.
    return null;
  }
}

type PushResult =
  | { kind: "ok"; envelope: PrefsEnvelope }
  //* A szerver továbblépett: itt van, amire épp áll — fésüld össze, próbáld újra.
  | { kind: "conflict"; current: PrefsEnvelope }
  | { kind: "signed-out" }
  | { kind: "error" };

async function pushRemote(
  prefs: SyncedPrefs,
  baseRevision: number,
  signal?: AbortSignal,
): Promise<PushResult> {
  try {
    const res = await fetch(ENDPOINT, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prefs, baseRevision }),
      signal,
    });
    if (res.status === 401) return { kind: "signed-out" };
    if (res.status === 409) {
      const body = (await res.json().catch(() => null)) as {
        current?: unknown;
      } | null;
      return { kind: "conflict", current: toEnvelope(body?.current) };
    }
    if (!res.ok) return { kind: "error" };
    return { kind: "ok", envelope: toEnvelope(await res.json()) };
  } catch {
    return { kind: "error" };
  }
}

//! MELYIK OLDAL A FRISSEBB? Nem időbélyeget hasonlítunk össze — a készülékek
//! órája elcsúszhat, és egy rosszul járó telefon így felülírhatná a helyes
//! állapotot. Helyette azt nézzük, hogy a HELYI állapot melyik szerver-verzióra
//! épült (`SyncMeta.revision`), és ez megegyezik-e a szerver mostani
//! verziójával.
function decideNewer(
  local: SyncedPrefs,
  remoteRevision: number,
  userId: string,
): "local" | "remote" {
  //! ÜRES KÉSZÜLÉK SOSEM ÍR FELÜL. Ez a friss telepítés / új böngésző esete: a
  //! diák épp azért lépett be, hogy megkapja a beállításait. Ha itt a „helyi az
  //! újabb" ág futna, a belépés pont az ellenkezőjét csinálná — kitörölné a
  //! szerverről azt, amiért jött.
  if (!hasAnyPrefs(local)) return "remote";

  const meta = loadSyncMeta();

  //* Ez a készülék még sosem szinkronizált (ezzel a fiókkal). Van helyi
  //* beállítása, amit a diák épp használ — az legyen az erősebb, de a szerver
  //* bejegyzései a `mergePrefs`-ben így is megmaradnak.
  if (!meta || meta.userId !== userId) return "local";

  //* A helyi állapot a szerver MOSTANI verziójára épül, tehát azóta itt
  //* történt a változás.
  if (meta.revision >= remoteRevision) return "local";

  //* A szerver közben továbblépett — egy másik készüléken állítottak valamit.
  return "remote";
}

/**
 * Egy teljes szinkronkör: letölt, összefésül, visszaír, és a végén a készülék
 * és a szerver ugyanazt tartalmazza.
 *
 * @param userId A bejelentkezett felhasználó — a helyi jelölő ehhez kötődik,
 *   hogy egy fiókváltás után ne a régi fiók verziószámára építsünk.
 */
export async function syncPrefs(
  userId: string,
  signal?: AbortSignal,
): Promise<SyncOutcome> {
  const remote = await fetchRemote(signal);
  if (remote === "signed-out") return { status: "signed-out" };
  if (!remote) return { status: "error" };

  const local = collectLocalPrefs();
  const newer = decideNewer(local, remote.revision, userId);
  const merged = mergePrefs(local, remote.prefs, newer);

  //! A VISSZAÍRÁS AZONNAL MEGTÖRTÉNIK, még a feltöltés előtt. Ha a hálózat a
  //! következő lépésnél elszáll, a diák AKKOR IS látja a másik készülékén
  //! beállítottakat — a feltöltés a következő körben pótolható, a felhasználó
  //! várakoztatása nem.
  applyLocalPrefs(merged);

  //* Nincs mit feltölteni: a szerver már pontosan ezt tartalmazza.
  if (samePrefs(merged, remote.prefs)) {
    saveSyncMeta({ revision: remote.revision, userId });
    return {
      status: "ok",
      revision: remote.revision,
      updatedAt: remote.updatedAt,
    };
  }

  const pushed = await pushRemote(merged, remote.revision, signal);

  if (pushed.kind === "ok") {
    saveSyncMeta({ revision: pushed.envelope.revision, userId });
    return {
      status: "ok",
      revision: pushed.envelope.revision,
      updatedAt: pushed.envelope.updatedAt,
    };
  }

  if (pushed.kind === "signed-out") return { status: "signed-out" };

  //! EGYETLEN ÚJRAPRÓBÁLKOZÁS, NEM CIKLUS. Ütközés akkor van, ha közben egy
  //! másik készülék írt. Egy kör után a helyzet rendeződik; ha nem, a következő
  //! szinkron úgyis megpróbálja. Egy `while` itt két, egymást folyton
  //! felülíró készülék esetén végtelen ciklussá válhatna.
  if (pushed.kind === "conflict") {
    const resolved = mergePrefs(merged, pushed.current.prefs, "local");
    applyLocalPrefs(resolved);
    const retry = await pushRemote(resolved, pushed.current.revision, signal);
    if (retry.kind === "ok") {
      saveSyncMeta({ revision: retry.envelope.revision, userId });
      return {
        status: "ok",
        revision: retry.envelope.revision,
        updatedAt: retry.envelope.updatedAt,
      };
    }
    if (retry.kind === "signed-out") return { status: "signed-out" };
  }

  return { status: "error" };
}

/**
 * Kijelentkezéskor a helyi jelölőt eldobjuk.
 *
 * @remarks A BEÁLLÍTÁSOKAT NEM TÖRÖLJÜK. A kijelentkezés azt jelenti, hogy
 * innentől nem szinkronizálunk — nem azt, hogy a diák elveszíti az osztályát és
 * a csoportbontásait azon a gépen, amin épp dolgozik. A helyi tároló ugyanaz
 * marad, mint egy soha be nem jelentkezett látogatónál.
 */
export function forgetSyncState(): void {
  clearSyncMeta();
}
