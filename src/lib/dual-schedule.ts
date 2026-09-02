//! ─── A DIÁK SAJÁT DUÁLIS BEOSZTÁSA ─────────────────────────────────────────
//! A `dualis.ts` egy KÖNYVSZERINTI blokkot fordít le (B hét szerda–péntek + A
//! hét hétfő–kedd). Ez a beosztás a Jedlik duális osztályainak többségére igaz,
//! de nem mindenkire: a cég, a szak és az évfolyam is eltolhatja, és egy nem
//! duális osztályra egyáltalán nem érvényes.
//!
//! EGY ÓRAREND-NÉZŐ NEM TALÁLGATHAT ARRÓL, HOGY A DIÁK HOL VAN. Ha rosszul
//! tippel, két irányban is árt: vagy elrejti a mai órákat egy iskolai napon,
//! vagy órarendet mutat egy olyan napra, amit a munkahelyen tölt. Ezért a
//! beosztást NEM kitaláljuk, hanem MEGKÉRDEZZÜK — a diák egy 2×5-ös rácson
//! (A hét / B hét × hétfő–péntek) bejelöli, mely napokon van duálison.
//!
//! A CIKLUS FÁZISÁT TOVÁBBRA IS A SULI ADJA. Csak azt tároljuk, hogy egy A és
//! egy B héten mely napok duálisak; hogy az adott hét A vagy B, azt a
//! Jedlikinfo hét-jelöléséből olvassuk ki. Így egy szünet miatti eltolódás
//! nem rontja el a beosztást — pont úgy, ahogy a `dualis.ts` is csinálja.

import type { DualStatus } from "./dualis";

export const DUAL_SCHEDULE_STORAGE_KEY = "orarend:dual-schedule:v1";

/** ISO nap-sorszámok (1 = hétfő … 5 = péntek) hetenként. */
export type DualSchedule = {
  /** Az A héten duálison töltött napok. */
  A: number[];
  /** A B héten duálison töltött napok. */
  B: number[];
};

export type DualWeekLetter = "A" | "B";

export const DUAL_WEEK_LETTERS: DualWeekLetter[] = ["A", "B"];
export const DUAL_WEEKDAYS = [1, 2, 3, 4, 5];

//! A KLASSZIKUS BLOKK CSAK AJÁNLAT, NEM ALAPÉRTELMEZÉS. Ugyanaz, amit a
//! `dualStatusOf` kódol: a duális blokk szerdán kezdődik és a következő kedden
//! ér véget. Egy koppintással kitölthető — de csak akkor lép életbe, ha a diák
//! rákoppintott.
export const CLASSIC_DUAL_SCHEDULE: DualSchedule = { A: [1, 2], B: [3, 4, 5] };

export const EMPTY_DUAL_SCHEDULE: DualSchedule = { A: [], B: [] };

export function isDualDay(
  schedule: DualSchedule,
  weekLetter: string,
  dayOfWeek: number,
): boolean {
  if (weekLetter !== "A" && weekLetter !== "B") return false;
  return schedule[weekLetter].includes(dayOfWeek);
}

export function hasAnyDualDay(schedule: DualSchedule): boolean {
  return schedule.A.length > 0 || schedule.B.length > 0;
}

/**
 * Egy nap duális állapota a diák SAJÁT beosztásából.
 *
 * @param schedule `null`, ha ez az osztály még nincs beállítva — ilyenkor a lap
 *   nem állít semmit: minden nap iskolai nap, ahogy egy nem duális osztálynál.
 * @param weekLetter a HÉT jelölése a forrásból (`"A"` / `"B"`). Ha hiányzik
 *   (szünet, tanévkezdés), a beosztás nem alkalmazható — `"unknown"`.
 */
export function dualStatusFor(
  schedule: DualSchedule | null,
  dayOfWeek: number,
  weekLetter: string,
): DualStatus {
  //! BEÁLLÍTÁS NÉLKÜL NINCS DUÁLIS NAP. A 09A diákja soha nem járt duálisra, és
  //! egy „ma a munkahelyen vagy" neki egyszerűen hazugság.
  if (!schedule || !hasAnyDualDay(schedule)) return "school";
  if (weekLetter !== "A" && weekLetter !== "B") return "unknown";
  return isDualDay(schedule, weekLetter, dayOfWeek) ? "dual" : "school";
}

export function toggleDualDay(
  schedule: DualSchedule,
  weekLetter: DualWeekLetter,
  dayOfWeek: number,
): DualSchedule {
  const days = schedule[weekLetter];
  const next = days.includes(dayOfWeek)
    ? days.filter((d) => d !== dayOfWeek)
    : [...days, dayOfWeek].sort((a, b) => a - b);
  return { ...schedule, [weekLetter]: next };
}

//* ---------------------------------------------------------------------------
//* TÁROLÁS — osztályonként, mint a csoportbontás-beállítás
//* ---------------------------------------------------------------------------
//! OSZTÁLYONKÉNT, NEM KÉSZÜLÉKENKÉNT. Az osztályválasztóval bárki átnézhet egy
//! másik osztály órarendjére; a saját duális beosztását ilyenkor ráhúzni arra a
//! hétre értelmetlen. A beosztás ahhoz az osztályhoz tartozik, amelyikbe jár.

type DualScheduleStore = Record<string, DualSchedule>;

function readStore(): DualScheduleStore {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(DUAL_SCHEDULE_STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    const out: DualScheduleStore = {};
    for (const [cls, value] of Object.entries(parsed as object)) {
      const schedule = sanitize(value);
      if (schedule) out[cls] = schedule;
    }
    return out;
  } catch {
    return {};
  }
}

//* A tárolt érték a felhasználó gépéről jön: bármi lehet benne. Csak a
//* hétköznapokat fogadjuk el, duplikátum nélkül, rendezve.
function sanitize(value: unknown): DualSchedule | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<Record<DualWeekLetter, unknown>>;
  const days = (input: unknown): number[] =>
    Array.isArray(input)
      ? [
          ...new Set(
            input.filter((d): d is number =>
              DUAL_WEEKDAYS.includes(d as number),
            ),
          ),
        ].sort((a, b) => a - b)
      : [];
  return { A: days(raw.A), B: days(raw.B) };
}

/** `null` = ez az osztály még nincs beállítva (nem ugyanaz, mint „nincs duális nap"). */
export function loadDualSchedule(classShort: string): DualSchedule | null {
  if (!classShort) return null;
  return readStore()[classShort] ?? null;
}

export function saveDualSchedule(
  classShort: string,
  schedule: DualSchedule,
): void {
  if (typeof window === "undefined" || !classShort) return;
  try {
    const store = readStore();
    store[classShort] = schedule;
    window.localStorage.setItem(
      DUAL_SCHEDULE_STORAGE_KEY,
      JSON.stringify(store),
    );
  } catch {}
}

/** Visszaáll a „még nincs beállítva" állapotba — a lap újra megkérdezi. */
export function forgetDualSchedule(classShort: string): void {
  if (typeof window === "undefined" || !classShort) return;
  try {
    const store = readStore();
    delete store[classShort];
    window.localStorage.setItem(
      DUAL_SCHEDULE_STORAGE_KEY,
      JSON.stringify(store),
    );
  } catch {}
}
