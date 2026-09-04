//! ─── DUÁLIS KÉPZÉS ─────────────────────────────────────────────────────────
//! A duális blokk kéthetente ismétlődik, és NEM naptári hétre esik: szerdán
//! kezdődik és a következő kedden ér véget. A Jedlikinfo A/B jelölésével
//! kifejezve ez pontosan: B hét szerda–péntek + A hét hétfő–kedd.
//!
//! A ciklus fázisát ezért NEM mi számoljuk egy rögzített kezdődátumból: az A/B
//! váltás szünet vagy tanévkezdés miatt eltolódhat, és azt a suli rendszere
//! úgyis tudja. Mi csak lefordítjuk a már meglévő hét-jelölést arra, hogy az
//! adott nap munkahelyen vagy iskolában telik-e.

import type { TimetableLesson } from "./timetable";

export type DualStatus =
  | "dual" //* duális képzés — a munkahelyen
  | "school" //* iskolai nap — a rács órái érvényesek
  | "unknown"; //* a hét nincs A/B-vel jelölve (szünet, tanévkezdés)

export const DUAL_LABEL: Record<DualStatus, string> = {
  dual: "Duális",
  school: "Iskola",
  unknown: "?",
};

/**
 * Egy tanítási nap duális állapota a hét A/B jelöléséből.
 *
 * @param dayOfWeek ISO nap (1 = hétfő … 5 = péntek)
 * @param weekLetter a HÉT jelölése (`"A"` / `"B"`), nem a napé — a Jedlikinfo
 *   egyes napokra üres jelölést ad (pl. tanítás nélküli hétfő), a hét egésze
 *   viszont mindig egyértelmű.
 */
export function dualStatusOf(
  dayOfWeek: number,
  weekLetter: string,
): DualStatus {
  if (weekLetter !== "A" && weekLetter !== "B") return "unknown";
  if (weekLetter === "B") return dayOfWeek >= 3 ? "dual" : "school";
  return dayOfWeek <= 2 ? "dual" : "school";
}

//! A MUNKANAP HATÁRAI — EGY HELYEN. A duális napot két lap rajzolja meg (a
//! heti rács kártyaként, a `/ma` egyetlen téglalapként); ha a két szám két
//! helyen állna, előbb-utóbb elcsúsznának egymástól.
export const DUAL_DAY_START_MIN = 8 * 60;
export const DUAL_DAY_END_MIN = 15 * 60;

//! A DUÁLIS NAP EGYETLEN BLOKK. Azon a napon nincs órarend — a munkahelyen
//! vagy —, tehát a rács sem tesz úgy, mintha lenne: egy 8:00–15:00 kártya áll
//! a nap helyén, óra-bontás nélkül.
export function dualBlockLesson(day: {
  dayOfWeek: number;
  dateKey: string;
}): TimetableLesson {
  return {
    key: `dual-${day.dateKey}`,
    dateKey: day.dateKey,
    dayOfWeek: day.dayOfWeek,
    startMin: DUAL_DAY_START_MIN,
    endMin: DUAL_DAY_END_MIN,
    subject: "Duális képzés",
    subjectShort: "Duális",
    teacher: "",
    teacherShort: "",
    //* A duális nap nem egy osztály órája — se tanára, se osztálya nincs.
    classShort: "",
    className: "",
    room: "",
    group: "",
    groupColumn: 0,
    groupCount: 1,
    //* A duális blokk az EGÉSZ osztályé — nincs csoportbontása, tehát a rácson
    //* sem fél oszlop, és nem is rejthető el „nem az én csoportom" címen.
    wholeClass: true,
    week: "",
    //* Nem a Jedlikinfóból jön, tehát áthelyezettként sem lehet megjelölve.
    moved: false,
    kind: "dual",
  };
}
