import type { CalendarFeedLinks } from "./calendar-shared";
import { loadDualSchedule } from "./dual-schedule";
import { subjectStoreKey, type TimetableSubjectKind } from "./timetable";
import { loadLocalPreferences } from "./timetable-merge";

//! ═══════════════════════════════════════════════════════════════════════════
//! A KIADOTT NAPTÁR-LINKEK — A KÉSZÜLÉKEN
//! ═══════════════════════════════════════════════════════════════════════════
//! Ez a tároló azt tudja, hogy EZ a böngésző melyik alanyra kért már linket.
//! Két dologra kell: hogy a felület a meglévő linket mutassa (ne gyártson
//! másodikat), és hogy a döntések megváltozásakor legyen mit frissíteni.
//!
//! ─── MIÉRT NEM SZINKRONIZÁLJUK A FIÓKKAL ───────────────────────────────────
//! A jegy TITOK: aki ismeri, látja az órarendet. A beállítás-szinkron csomagja
//! (`prefs-shared.ts`) ma kizárólag olyat hordoz, aminek a kiszivárgása
//! kellemetlen, de nem nyit hozzáférést — egy jegy betétele felértékelné azt a
//! végpontot, és egy ottani hibából onnantól nem „elállítódott beállítás"
//! lenne, hanem kiadott hozzáférés.
//!
//! A VELE JÁRÓ KÖVETKEZMÉNY KI VAN MONDVA A FELÜLETEN: a link ahhoz a
//! készülékhez tartozik, amelyiken készült. Másik készüléken a diák kérhet
//! sajátot — és aki BE VAN JELENTKEZVE, annál ez nem is jár hátránnyal: ott a
//! feed a fiók szinkronizált döntéseit olvassa, tehát bármelyik készülékről
//! hozott döntés azonnal érvényes rá (lásd `api/naptar/[token]/route.ts`).
//! ═══════════════════════════════════════════════════════════════════════════

const STORAGE_KEY = "orarend:calendar:v1";

export type StoredFeed = CalendarFeedLinks & {
  kind: TimetableSubjectKind;
  short: string;
  /** Fiókhoz kötött-e a feed (a felület ettől ígér többet vagy kevesebbet). */
  bound: boolean;
  //! AMIVEL A FRISSÍTÉS ÖSSZEHASONLÍT. Nem a döntések másolata — csak egy
  //! lenyomat: ebből kiderül, hogy kell-e feltöltés, anélkül hogy a listát
  //! kétszer tárolnánk (és anélkül, hogy a két példány elcsúszhatna).
  fingerprint: string;
  savedAt: number;
};

type Store = Record<string, StoredFeed>;

function readStore(): Store {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as Store;
  } catch {
    return {};
  }
}

function writeStore(store: Store): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    /* privát mód vagy tele a tárhely — a link ilyenkor nem marad meg */
  }
}

export function loadStoredFeed(storeKey: string): StoredFeed | null {
  if (!storeKey) return null;
  const feed = readStore()[storeKey];
  return feed && typeof feed.token === "string" ? feed : null;
}

export function saveStoredFeed(storeKey: string, feed: StoredFeed): void {
  if (!storeKey) return;
  const store = readStore();
  store[storeKey] = feed;
  writeStore(store);
}

export function forgetStoredFeed(storeKey: string): void {
  if (!storeKey) return;
  const store = readStore();
  delete store[storeKey];
  writeStore(store);
}

//* ---------------------------------------------------------------------------
//* A DÖNTÉSEK LENYOMATA
//* ---------------------------------------------------------------------------
//! MIÉRT KELL LENYOMAT EGYÁLTALÁN. A frissítés feltétel nélkül is futhatna
//! minden oldalbetöltéskor — csak épp minden megnyitás egy POST-ot jelentene
//! minden feliratkozásra, örökre, akkor is, ha semmi nem változott. A lenyomat
//! ezt egy `localStorage`-olvasásra és egy összehasonlításra cseréli.
function fingerprintOf(
  prefs: { clusterKey: string; chosen: string }[],
  dual: { A: number[]; B: number[] } | null,
): string {
  const decisions = [...prefs]
    //* A sorrend nem jelent különbséget (a `resolveDay` kulcs szerint keres),
    //* ezért rendezve hasonlítunk — különben egy visszavonás-újrafelvétel
    //* „változásnak" tűnne.
    .map((p) => `${p.clusterKey}=${p.chosen}`)
    .sort()
    .join(";");
  const dualPart = dual ? `${dual.A.join(",")}/${dual.B.join(",")}` : "-";
  return `${decisions}|${dualPart}`;
}

/** A készüléken ÉPP érvényes állapot egy alanyra — ezt töltjük fel. */
export function currentFeedState(
  kind: TimetableSubjectKind,
  short: string,
): {
  storeKey: string;
  prefs: { clusterKey: string; chosen: string }[];
  dual: { A: number[]; B: number[] } | null;
  fingerprint: string;
} {
  const storeKey = subjectStoreKey(kind, short);
  const prefs = storeKey ? loadLocalPreferences(storeKey) : [];
  const dual = storeKey ? loadDualSchedule(storeKey) : null;
  return { storeKey, prefs, dual, fingerprint: fingerprintOf(prefs, dual) };
}

//* ---------------------------------------------------------------------------
//* A VÉGPONT
//* ---------------------------------------------------------------------------

const ENDPOINT = "/api/naptar";

export type FeedResult =
  | { status: "ok"; feed: StoredFeed }
  //* Tanári feed belépés nélkül — a felület ezt külön mondja ki, nem „hiba"-ként.
  | { status: "teacher-session-required" }
  | { status: "unavailable" }
  | { status: "error" };

/**
 * Linket kér (vagy frissíti a meglévőt) egy alanyra, a készüléken ÉPP érvényes
 * döntésekkel.
 *
 * @param token A meglévő jegy, ha van — ilyenkor a szerver ugyanazt a sort
 *   írja át, tehát a már felvett naptár-feliratkozás érvényben marad.
 */
export async function requestFeed(input: {
  kind: TimetableSubjectKind;
  short: string;
  token?: string;
  signal?: AbortSignal;
}): Promise<FeedResult> {
  const state = currentFeedState(input.kind, input.short);
  if (!state.storeKey) return { status: "error" };

  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: input.kind,
        short: input.short,
        prefs: state.prefs,
        dual: state.dual,
        ...(input.token ? { token: input.token } : {}),
      }),
      signal: input.signal,
    });

    if (res.status === 403) return { status: "teacher-session-required" };
    if (res.status === 503) return { status: "unavailable" };
    if (!res.ok) return { status: "error" };

    const body = (await res.json()) as CalendarFeedLinks & { bound?: boolean };
    const feed: StoredFeed = {
      ...body,
      kind: input.kind,
      short: input.short,
      bound: body.bound === true,
      fingerprint: state.fingerprint,
      savedAt: Date.now(),
    };
    saveStoredFeed(state.storeKey, feed);
    return { status: "ok", feed };
  } catch {
    //* Hálózati hiba: a meglévő link érvényes marad, csak a frissítés maradt el.
    //* A következő megnyitás újrapróbálja.
    return { status: "error" };
  }
}

/** Visszavonja a linket: a sor eltűnik a szerverről ÉS a készülékről. */
export async function revokeFeed(feed: StoredFeed): Promise<boolean> {
  const storeKey = subjectStoreKey(feed.kind, feed.short);
  try {
    const res = await fetch(
      `${ENDPOINT}?token=${encodeURIComponent(feed.token)}`,
      { method: "DELETE" },
    );
    if (!res.ok) return false;
  } catch {
    return false;
  }
  //! A HELYI SOR CSAK A SIKERES TÖRLÉS UTÁN TŰNIK EL. Fordítva egy hálózati
  //! hibából az lenne, hogy a link ÉLŐ marad a szerveren, de a felületen már
  //! nem látszik — vagyis visszavonhatatlanná válna.
  forgetStoredFeed(storeKey);
  return true;
}

//! ─── A FRISSEN TARTÁS ──────────────────────────────────────────────────────
//! A döntés a link kiadása UTÁN is változik: a diák átállít egy összevonást,
//! elrejt egy órát. A szerveren álló pillanatkép ilyenkor elavul, és a naptár
//! egy órarendet mutatna, amit a rácson már nem így lát.
//*
//! CSAK AKKOR KÜLDÜNK, HA TÉNYLEG MÁS. A lenyomat dönt; változatlan
//! beállításnál egyetlen kérés sem indul. Aki nem kért linket, annál ez a
//! függvény egy `localStorage`-olvasás és semmi más.
export async function refreshStoredFeeds(): Promise<void> {
  const store = readStore();
  for (const [storeKey, feed] of Object.entries(store)) {
    if (typeof feed?.token !== "string") continue;
    //! A FIÓKHOZ KÖTÖTT FEEDET IS FRISSÍTJÜK, PEDIG ELVILEG NEM KELLENE. Ott a
    //! szerver a fiók szinkronizált döntéseit olvassa — DE CSAK HA VAN MIT: ha a
    //! `Preference` sorban még nincs bejegyzés erre az alanyra (a szinkron épp
    //! most fut, vagy elbukott), a végpont a tárolt pillanatképre esik vissza
    //! (lásd `api/naptar/[token]/route.ts`). Az a tartalék csak akkor ér
    //! valamit, ha friss — egy kérés döntésváltásonként ezért belefér.
    const state = currentFeedState(feed.kind, feed.short);
    if (state.storeKey !== storeKey) continue;
    if (state.fingerprint === feed.fingerprint) continue;
    await requestFeed({
      kind: feed.kind,
      short: feed.short,
      token: feed.token,
    });
  }
}
