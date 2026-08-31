const API_BASE = "/api/jedlik";
export const TIME_ZONE = "Europe/Budapest";
export const PUBLIC_DEFAULT_CLASS = "13C";

//* A korábban kiválasztott osztály megjegyzése: frissítéskor ne vesszen el az
//* utolsó választás, ha a képernyőt ismételten megnyitják.
const CLASS_STORAGE_KEY = "orarend:class:v1";

export function loadCachedClass(): string | null {
  try {
    return window.localStorage.getItem(CLASS_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function saveCachedClass(short: string): void {
  try {
    window.localStorage.setItem(CLASS_STORAGE_KEY, short);
  } catch {
    /* privát módban nincs tárhely — a választás ekkor nem marad meg */
  }
}

const FETCH_TIMEOUT_MS = 15_000;

type RawCard = {
  date: string;
  dateValue: string;
  fromPeriod: number;
  periodsCount: number;
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
  text: string;
  textTitle: string;
  rightBottom: string;
  rightBottomTitle: string;
  leftBottom: string;
  leftBottomTitle: string;
  centerTop: string;
  groupName: string;
  groupColumn: number;
  groupCount: number;
  week: string;
  dayOfWeek: number;
  startMinuteFromMidnight: number;
  endMinuteFromMidnight: number;
};

type RawPeriod = {
  number: number;
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
};

type RawDay = {
  name: string;
  date: string;
  week: string;
  dayOfWeek: number;
};

type RawCardsResponse = {
  full: boolean;
  fromDate: string;
  toDate: string;
  cards: RawCard[];
  days: RawDay[];
  periods: RawPeriod[];
};

export type TimetableClass = { short: string; name: string };

export type TimetablePeriod = {
  number: number;
  startMin: number;
  endMin: number;
};

export type TimetableDay = {
  name: string;
  dateKey: string;
  dateLabel: string;
  week: string;
  dayOfWeek: number;
  isToday: boolean;
};

export type TimetableLesson = {
  key: string;
  dayOfWeek: number;
  startMin: number;
  endMin: number;
  subject: string;
  subjectShort: string;
  teacher: string;
  teacherShort: string;
  room: string;
  group: string;
  groupColumn: number;
  groupCount: number;
  week: string;
};

export type TimetableWeek = {
  ok: boolean;
  error?: string;
  resolvedClass: TimetableClass | null;
  weekStart: string;
  days: TimetableDay[];
  periods: TimetablePeriod[];
  lessons: TimetableLesson[];
};

function pad(n: number) {
  return n < 10 ? `0${n}` : `${n}`;
}

function parseDateKey(dateKey: string): string {
  return dateKey.replaceAll(".", "-").slice(0, 10);
}

export function mondayOf(dateKey?: string): string {
  const base = dateKey ? parseDateKey(dateKey) : dateToKey(new Date());
  const [y, m, d] = base.split("-").map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d));
  const isoDow = ((utc.getUTCDay() + 6) % 7) + 1;
  utc.setUTCDate(utc.getUTCDate() - (isoDow - 1));
  return utc.toISOString().slice(0, 10);
}

export function addDays(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d));
  utc.setUTCDate(utc.getUTCDate() + days);
  return utc.toISOString().slice(0, 10);
}

function dateToKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function toDateKey(apiDate: string): string {
  return apiDate.replaceAll(".", "-").slice(0, 10);
}

function classKey(value: string): string {
  const trimmed = value.trim().toUpperCase();
  const match = trimmed.match(/^(\d{1,2})\s*[.\-/]?\s*([A-ZÁÉÍÓÖŐÚÜŰ]+)$/);
  if (match) {
    return `${pad(Number(match[1]))}${match[2]}`;
  }
  return trimmed.replace(/\s+/g, "");
}

export async function getTimetableClasses(): Promise<TimetableClass[]> {
  try {
    const res = await fetch(`${API_BASE}/timetable/classes`, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as TimetableClass[];
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export async function resolveClass(
  input: string | null | undefined,
): Promise<TimetableClass | null> {
  if (!input?.trim()) return null;
  const classes = await getTimetableClasses();
  if (classes.length === 0) {
    const guess = classKey(input);
    return { short: guess, name: guess };
  }
  const wanted = classKey(input);
  const exact = classes.find((c) => c.short === input.trim());
  if (exact) return exact;
  const byKey = classes.find((c) => classKey(c.short) === wanted);
  return byKey ?? null;
}

export async function getTimetableWeek(options: {
  class: string | null | undefined;
  weekStart?: string;
}): Promise<TimetableWeek> {
  const weekStart = mondayOf(options.weekStart);
  const resolved = await resolveClass(options.class);

  const empty: TimetableWeek = {
    ok: false,
    resolvedClass: resolved,
    weekStart,
    days: [],
    periods: [],
    lessons: [],
  };

  if (!resolved) {
    return {
      ...empty,
      error: "Nincs beállítva (vagy nem ismerhető fel) az osztályod.",
    };
  }

  let data: RawCardsResponse;
  try {
    const res = await fetch(`${API_BASE}/timetable/cards`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        class: resolved.short,
        classroom: "",
        teacher: "",
        full: false,
        fromDate: weekStart,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) {
      return {
        ...empty,
        error: "Az órarend most nem elérhető. Próbáld újra később.",
      };
    }
    data = (await res.json()) as RawCardsResponse;
  } catch {
    return { ...empty, error: "Nem sikerült elérni az órarend szolgáltatást." };
  }

  const todayKey = dateToKey(new Date());

  const days: TimetableDay[] = (data.days ?? []).map((d) => {
    const dateKey = toDateKey(d.date);
    return {
      name: d.name,
      dateKey,
      dateLabel: dateKey.slice(5).replace("-", ".").concat("."),
      week: d.week ?? "",
      dayOfWeek: d.dayOfWeek,
      isToday: dateKey === todayKey,
    };
  });

  const periods: TimetablePeriod[] = (data.periods ?? []).map((p) => ({
    number: p.number,
    startMin: p.startHour * 60 + p.startMinute,
    endMin: p.endHour * 60 + p.endMinute,
  }));

  const dayWeekOf = new Map(days.map((d) => [d.dayOfWeek, d.week] as const));

  const lessons: TimetableLesson[] = (data.cards ?? [])
    .filter((c) => {
      const dayWeek = dayWeekOf.get(c.dayOfWeek) ?? "";
      if (!dayWeek || !c.week || c.week === "AB") return true;
      return c.week.includes(dayWeek);
    })
    .map((c) => ({
      key: `${c.dayOfWeek}-${c.startMinuteFromMidnight}-${c.groupColumn}-${c.text}`,
      dayOfWeek: c.dayOfWeek,
      startMin: c.startMinuteFromMidnight,
      endMin: c.endMinuteFromMidnight,
      subject: c.textTitle || c.text,
      subjectShort: c.text,
      teacher: c.rightBottomTitle || c.rightBottom,
      teacherShort: c.rightBottom,
      room: c.leftBottom,
      group: c.groupName,
      groupColumn: c.groupColumn,
      groupCount: c.groupCount,
      week: c.week,
    }));

  return {
    ok: true,
    resolvedClass: resolved,
    weekStart,
    days,
    periods,
    lessons,
  };
}

export type CalendarEvent = {
  id: string;
  title: string;
  dayOfWeek: number;
  startMin: number;
  endMin: number;
  room: string;
  szakkorName: string;
  szakkorSlug: string;
  kozossegi: boolean;
  cancelled: boolean;
};

export type TimetableView = TimetableWeek & {
  events: CalendarEvent[];
  prefs: MergePreference[];
  persistence: "local";
};

import type { MergePreference } from "./timetable-merge";
import { loadLocalPreferences } from "./timetable-merge";

export async function buildTimetableView(input: {
  userClass: string | null;
  weekStart?: string;
  classOverride?: string;
}): Promise<TimetableView> {
  const cls = input.classOverride?.trim() || input.userClass;
  const week = await getTimetableWeek({
    class: cls,
    weekStart: input.weekStart,
  });
  const classShort = week.resolvedClass?.short ?? "";
  const prefs = classShort ? loadLocalPreferences(classShort) : [];
  return { ...week, events: [], prefs, persistence: "local" };
}
