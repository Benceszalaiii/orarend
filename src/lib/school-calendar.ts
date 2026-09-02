//* ---------------------------------------------------------------------------
//* A TANÉV RENDJE ÉS A NAPI CSENGETÉSI REND
//* ---------------------------------------------------------------------------
//! AZ ÓRAREND NEM MONDJA MEG, MILYEN NAP VAN. A `timetable/cards` a kártyákat
//! adja vissza, és MINDIG a szokásos csengetési rendet mellékeli hozzá — akkor
//! is, ha aznap rövidített órák vannak. (Ellenőrizve: 2026-01-22-én a nap a 3-as
//! renden megy, 40 perces órákkal, a kártyák ideje helyes, a válasz `periods`
//! tömbje viszont a 8:00–8:45-ös rendes rendet írja le.) A rács vonalai és
//! óraszámai ilyenkor ELLENTMONDANAK a rájuk rajzolt kártyáknak.
//!
//! Két külön végpont tudja, amit a kártyák nem:
//!  • `GET timetable/calendarplan?year&month` — a tanév rendje naponként:
//!    tanítási nap-e, A/B hét, MELYIK csengetési rend van érvényben, és a napra
//!    kiírt iskolai események szövege.
//!  • `GET timetable/ringsystem/{dátum}` — az ADOTT napon érvényes csengetés
//!    (magyar kulcsokkal: `óra`, `becsengetés`, `kicsengetés`).
//!    `GET timetable/ringsystem` a rendek nevét adja („Normál", „30 perces
//!    órák"), hogy a jelölés ne egy azonosítót írjon ki.
//!
//! EZ KIEGÉSZÍTÉS, NEM AZ ÓRAREND. Ha bármelyik kérés elbukik, a rács
//! változatlanul, hiánytalanul kirajzolódik — ezért itt NINCS nevesített hiba
//! (`TimetableError`) és nincs újradobott kivétel: a hiányzó válasz egyszerűen
//! hiányzó jelölés. Amit nem tudunk, arról nem is állítunk semmit.

import { API_BASE, SIDE_FETCH_TIMEOUT_MS as TIMEOUT_MS } from "./jedlik-api";
import type { TimetablePeriod } from "./timetable";

/** Egy nap a tanév rendjéből. */
export type SchoolDayPlan = {
  /** `YYYY-MM-DD`. */
  dateKey: string;
  /** Tanítási nap-e (hétvége, ünnep és szünet esetén hamis). */
  teaching: boolean;
  /** Az aznap érvényes csengetési rend azonosítója (tanítás nélküli napon `null`). */
  ringSystemId: number | null;
  /** A napra kiírt iskolai bejegyzések, sorokra bontva. */
  notes: string[];
};

//* ---------------------------------------------------------------------------
//* GYORSÍTÓTÁR
//* ---------------------------------------------------------------------------
//! EGY HÓNAP EGYSZER. A hét-lapozás ugyanazt a hónapot kéri újra és újra, a
//! `/dualis` pedig EGY hétre három osztály órarendjét építi össze — ott
//! háromszor futna le ugyanaz a kérés. Az értesítéseket számoló háttérfeladat
//! (`/api/ertesites/tick`) meg osztályonként megy végig ugyanazon a héten.
//! A tanév rendje ezalatt nem változik: ez a térkép egyetlen kérésre húzza
//! össze mindet.
//*
//! HIBÁT NEM TÁROLUNK. Egy folyosón, térerő nélkül indított lekérés különben
//! fél órára rögzítené a „nincs adat" választ — pont akkor, amikor a hálózat a
//! következő percben visszajön.

const PLAN_TTL_MS = 30 * 60_000;
//* A csengetési rendek neve gyakorlatilag állandó — egy lapélet kibír.
const RINGS_TTL_MS = 12 * 60 * 60_000;

type CacheEntry = { at: number; value: unknown };

const cache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<unknown>>();

async function memo<T>(
  key: string,
  ttlMs: number,
  loader: () => Promise<T | null>,
): Promise<T | null> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as T;
  const running = inFlight.get(key);
  if (running) return running as Promise<T | null>;

  const run = (async () => {
    const value = await loader();
    if (value !== null) cache.set(key, { at: Date.now(), value });
    return value;
  })().finally(() => inFlight.delete(key));

  inFlight.set(key, run);
  return run as Promise<T | null>;
}

async function getJson(path: string): Promise<unknown | null> {
  try {
    const res = await fetch(`${API_BASE}/${path}`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    //* Offline, időtúllépés, értelmezhetetlen válasz — mind ugyanaz a válasz:
    //* erről a napról nincs kiegészítő adatunk.
    return null;
  }
}

//* ---------------------------------------------------------------------------
//* A TANÉV RENDJE
//* ---------------------------------------------------------------------------

type RawPlanDay = {
  date?: string;
  teachingDay?: boolean;
  ringSystemId?: number | null;
  events?: string | null;
};

function parsePlanDay(raw: RawPlanDay): SchoolDayPlan | null {
  const date = typeof raw.date === "string" ? raw.date.slice(0, 10) : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  return {
    dateKey: date,
    teaching: raw.teachingDay === true,
    ringSystemId:
      typeof raw.ringSystemId === "number" ? raw.ringSystemId : null,
    //* A forrás egyetlen szövegmezőben, sortörésekkel adja a nap bejegyzéseit.
    notes: (raw.events ?? "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean),
  };
}

async function loadMonth(
  year: number,
  month: number,
): Promise<SchoolDayPlan[] | null> {
  return memo(`plan:${year}-${month}`, PLAN_TTL_MS, async () => {
    const data = await getJson(
      `timetable/calendarplan?year=${year}&month=${month}`,
    );
    if (!Array.isArray(data)) return null;
    return data
      .map((row) => parsePlanDay((row ?? {}) as RawPlanDay))
      .filter((day): day is SchoolDayPlan => day !== null);
  });
}

//! A HÉT ÁTLÓGHAT A HÓNAPBÓL (pl. 2026-08-31 – 09-04), a végpont viszont
//! hónapot kér. A napokból ezért a szükséges hónapokat gyűjtjük ki — rendes
//! héten ez egy kérés, hónapfordulón kettő.
export async function loadSchoolPlan(
  dateKeys: readonly string[],
): Promise<Map<string, SchoolDayPlan>> {
  const months = new Map<string, { year: number; month: number }>();
  for (const key of dateKeys) {
    const [y, m] = key.split("-").map(Number);
    if (!y || !m) continue;
    months.set(`${y}-${m}`, { year: y, month: m });
  }

  const loaded = await Promise.all(
    [...months.values()].map(({ year, month }) => loadMonth(year, month)),
  );

  const byDate = new Map<string, SchoolDayPlan>();
  for (const days of loaded) {
    for (const day of days ?? []) byDate.set(day.dateKey, day);
  }
  return byDate;
}

//* ---------------------------------------------------------------------------
//* CSENGETÉSI REND
//* ---------------------------------------------------------------------------

type RawRingSystem = { id?: number; name?: string };

/** A csengetési rendek neve azonosító szerint (`1 → "Normál"`). */
export async function loadRingSystemNames(): Promise<Map<number, string>> {
  const list = await memo("rings:list", RINGS_TTL_MS, async () => {
    const data = await getJson("timetable/ringsystem");
    if (!Array.isArray(data)) return null;
    return data as RawRingSystem[];
  });
  const names = new Map<number, string>();
  for (const item of list ?? []) {
    if (typeof item?.id === "number" && typeof item.name === "string") {
      names.set(item.id, item.name.trim());
    }
  }
  return names;
}

//* A napi rend magyar kulcsokkal érkezik — a forrás alakját nem írjuk át,
//* csak lefordítjuk arra, amit a rács amúgy is használ (perc éjféltől).
type RawRing = {
  óra?: number;
  becsengetés?: string;
  kicsengetés?: string;
};

function minutesOf(value: string | undefined): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec((value ?? "").trim());
  if (!match) return null;
  const min = Number(match[1]) * 60 + Number(match[2]);
  return Number.isFinite(min) ? min : null;
}

//! EGY NAP TÉNYLEGES CSENGETÉSE. Tanítás nélküli napra a végpont nem tömböt,
//! hanem hibaobjektumot ad (`{"errorMessage":"Váratlan hiba"}`, HTTP 400) —
//! ezért nem a státusz, hanem a válasz ALAKJA dönt arról, hogy van-e rend.
export async function loadDayBells(
  dateKey: string,
): Promise<TimetablePeriod[] | null> {
  return memo(`rings:${dateKey}`, PLAN_TTL_MS, async () => {
    const data = await getJson(`timetable/ringsystem/${dateKey}`);
    if (!Array.isArray(data)) return null;
    const periods: TimetablePeriod[] = [];
    for (const raw of data as RawRing[]) {
      const startMin = minutesOf(raw?.becsengetés);
      const endMin = minutesOf(raw?.kicsengetés);
      if (
        typeof raw?.óra !== "number" ||
        startMin === null ||
        endMin === null
      ) {
        continue;
      }
      periods.push({ number: raw.óra, startMin, endMin });
    }
    return periods.length > 0 ? periods : null;
  });
}
