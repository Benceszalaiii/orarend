import type {
  TimetableDay,
  TimetableLesson,
  TimetableWeek,
} from "@/lib/timetable";

//* Egy óra minden mezővel kitöltve — a teszt csak azt írja felül, ami számít.
export function lesson(over: Partial<TimetableLesson> = {}): TimetableLesson {
  const base: TimetableLesson = {
    key: "",
    dateKey: "2026-09-14",
    dayOfWeek: 1,
    startMin: 480,
    endMin: 525,
    subject: "Matematika",
    subjectShort: "mat",
    teacher: "Lipták Mária",
    teacherShort: "LM",
    classShort: "",
    className: "",
    room: "102",
    group: "",
    groupColumn: 0,
    groupCount: 1,
    wholeClass: true,
    week: "AB",
    moved: false,
    kind: "class",
  };
  const out = { ...base, ...over };
  if (!over.key)
    out.key = `${out.dayOfWeek}-${out.startMin}-${out.groupColumn}-${out.subjectShort}`;
  return out;
}

export function day(over: Partial<TimetableDay> = {}): TimetableDay {
  const dateKey = over.dateKey ?? "2026-09-14";
  return {
    name: "Hétfő",
    dateKey,
    dateLabel: `${dateKey.slice(5).replace("-", ".")}.`,
    week: "A",
    dayOfWeek: 1,
    isToday: false,
    teaching: null,
    notes: [],
    bells: null,
    ...over,
  };
}

//* A hét öt napja a megadott hétfőtől.
export function weekDays(monday: string, letter = "A"): TimetableDay[] {
  const names = ["Hétfő", "Kedd", "Szerda", "Csütörtök", "Péntek"];
  return names.map((name, i) => {
    const d = new Date(`${monday}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + i);
    return day({
      name,
      dateKey: d.toISOString().slice(0, 10),
      dayOfWeek: i + 1,
      week: letter,
    });
  });
}

//* A Jedlik szokásos csengetése: 45 perces órák, 8:00-tól.
export const PERIODS = [
  { number: 1, startMin: 480, endMin: 525 },
  { number: 2, startMin: 535, endMin: 580 },
  { number: 3, startMin: 590, endMin: 635 },
  { number: 4, startMin: 650, endMin: 695 },
  { number: 5, startMin: 705, endMin: 750 },
  { number: 6, startMin: 760, endMin: 805 },
  { number: 7, startMin: 810, endMin: 855 },
];

export function week(over: Partial<TimetableWeek> = {}): TimetableWeek {
  const weekStart = over.weekStart ?? "2026-09-14";
  return {
    ok: true,
    kind: "class",
    subject: { short: "12A", name: "12.A" },
    weekStart,
    days: weekDays(weekStart),
    periods: PERIODS,
    lessons: [],
    ...over,
  };
}
