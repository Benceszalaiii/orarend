import { describe, expect, test } from "bun:test";
import {
  candidateStarts,
  type PlannerLesson,
  type PlannerPerson,
  type PlannerWeek,
  personAt,
  suggestClubRooms,
  suggestClubTimes,
} from "./club-planner";
import type { RoomBooking, WeekOccupancy } from "./free-rooms";

const PERIODS = [
  { number: 0, startMin: 430, endMin: 475 }, // 7:10–7:55
  { number: 1, startMin: 480, endMin: 525 }, // 8:00–8:45
  { number: 2, startMin: 535, endMin: 580 }, // 8:55–9:40
  { number: 3, startMin: 590, endMin: 635 }, // 9:50–10:35
  { number: 6, startMin: 760, endMin: 805 }, // 12:40–13:25
  { number: 7, startMin: 815, endMin: 860 }, // 13:35–14:20
  { number: 8, startMin: 870, endMin: 915 }, // 14:30–15:15
];

const DAYS = [1, 2, 3, 4, 5].map((dayOfWeek) => ({
  dayOfWeek,
  teaching: true as boolean | null,
}));

function lesson(
  dayOfWeek: number,
  startMin: number,
  endMin: number,
): PlannerLesson {
  return { dayOfWeek, startMin, endMin };
}

function week(lessons: PlannerLesson[], days = DAYS): PlannerWeek {
  return { days, lessons };
}

function person(id: string, weeks: PlannerWeek[]): PlannerPerson {
  return { id, label: id, weeks };
}

describe("candidateStarts", () => {
  test("órakezdések, aztán félóránként a nap végéig", () => {
    const starts = candidateStarts(PERIODS, 45);
    expect(starts.slice(0, 4)).toEqual([430, 480, 535, 590]);
    //* 15:15 + 10 = 15:25, aztán 15:55 … amíg 17:30-ig belefér.
    expect(starts).toContain(925);
    expect(starts).toContain(955);
    expect(Math.max(...starts) + 45).toBeLessThanOrEqual(17 * 60 + 30);
  });
});

describe("personAt", () => {
  test("egy héten ütköző óra elég a foglaltsághoz", () => {
    const a = week([lesson(1, 480, 525)]);
    const b = week([lesson(1, 480, 525), lesson(1, 900, 945)]);
    expect(personAt([a, b], 1, { startMin: 900, endMin: 945 })).toEqual({
      verdict: "busy",
    });
  });

  test("a nap vége utáni várakozás a legrosszabb hét szerint", () => {
    const a = week([lesson(1, 480, 525)]); // 8:45-kor végez
    const b = week([lesson(1, 480, 890)]); // 14:50-kor végez
    expect(personAt([a, b], 1, { startMin: 900, endMin: 945 })).toEqual({
      verdict: "free",
      wait: 900 - 525,
    });
  });

  test("lyukasórában nincs várakozás", () => {
    const w = week([lesson(1, 480, 525), lesson(1, 845, 890)]);
    expect(personAt([w], 1, { startMin: 590, endMin: 635 })).toEqual({
      verdict: "free",
      wait: 0,
    });
  });

  test("tanítás nélküli vagy óra nélküli nap nem tanú", () => {
    const off = week(
      [lesson(1, 480, 525)],
      DAYS.map((d) => (d.dayOfWeek === 1 ? { ...d, teaching: false } : d)),
    );
    expect(personAt([off], 1, { startMin: 480, endMin: 525 })).toEqual({
      verdict: "unknown",
    });
    expect(personAt([week([])], 1, { startMin: 480, endMin: 525 })).toEqual({
      verdict: "unknown",
    });
  });

  test("duális nap a beosztásból ütközik, a hetektől függetlenül", () => {
    //* Egy üres, óra nélküli hét sem tanú semmi mellett — a duális beosztás
    //* mégis ütközést jelent, mert kéthetente úgyis a munkahelyen van.
    const dual = { A: [], B: [3] };
    expect(
      personAt([week([])], 3, { startMin: 480, endMin: 525 }, dual),
    ).toEqual({ verdict: "busy" });
    //* A többi napon a beosztás nem szól bele.
    expect(
      personAt([week([])], 1, { startMin: 480, endMin: 525 }, dual),
    ).toEqual({ verdict: "unknown" });
  });
});

describe("suggestClubTimes", () => {
  //* Hétfőn mindenki 7:10-től 14:20-ig bent van (a 0. óra sem szabad),
  //* kedden csak egy 8:55-ös órája van.
  const busyDay = [1, 3, 4, 5].flatMap((d) => [lesson(d, 430, 860)]);
  const members = ["a", "b", "c"].map((id) =>
    person(id, [week([...busyDay, lesson(2, 535, 580)])]),
  );

  test("a tanár órája kizárja a sávot", () => {
    const teacher = person("T", [week([lesson(2, 535, 1000)])]);
    const out = suggestClubTimes({
      members,
      teachers: [teacher],
      periods: PERIODS,
      durationMin: 45,
      limit: 20,
    });
    for (const s of out) {
      const clash = s.weekday === 2 && s.startMin < 1000 && 535 < s.endMin;
      expect(clash).toBe(false);
    }
  });

  test("a legtöbb ráérő elöl, azon belül a kevesebb várakozás", () => {
    const partial = person("d", [week([...busyDay, lesson(2, 480, 1000)])]);
    const teacher = person("T", [week([lesson(1, 480, 860)])]);
    const [best, second] = suggestClubTimes({
      members: [...members, partial],
      teachers: [teacher],
      periods: PERIODS,
      durationMin: 45,
    });
    //* Hétfő 14:30: mind a négyen végeztek 14:20-kor, a tanár is.
    expect(best).toMatchObject({ weekday: 1, startMin: 870, free: 4 });
    expect(best.waitMinutes).toBe(10);
    expect(second.free).toBeLessThanOrEqual(4);
  });

  test("napokként legfeljebb két javaslat", () => {
    const out = suggestClubTimes({
      members,
      teachers: [person("T", [week([lesson(3, 480, 525)])])],
      periods: PERIODS,
      durationMin: 45,
      limit: 10,
    });
    const perDay = new Map<number, number>();
    for (const s of out)
      perDay.set(s.weekday, (perDay.get(s.weekday) ?? 0) + 1);
    for (const n of perDay.values()) expect(n).toBeLessThanOrEqual(2);
  });

  test("a duális beosztású tag azon a napon foglaltnak számít", () => {
    //* „zoli" szerdán (3) B héten duálison van; a heteiből ez nem látszana.
    const zoli: PlannerPerson = {
      id: "zoli",
      label: "zoli",
      weeks: [week([])],
      dual: { A: [], B: [3] },
    };
    const anna = person("anna", [week([lesson(3, 480, 525)])]);
    const out = suggestClubTimes({
      members: [zoli, anna],
      teachers: [person("T", [week([])])],
      periods: PERIODS,
      durationMin: 45,
      weekdays: [3],
      limit: 50,
    });
    expect(out.length).toBeGreaterThan(0);
    for (const s of out) {
      expect(s.free).toBe(1);
      expect(s.busy.map((b) => b.label)).toEqual(["zoli"]);
    }
  });

  test("a foglalt tagot néven mondja", () => {
    const blocker = person("zoli", [week([lesson(1, 480, 1050)])]);
    const anna = person("anna", [week([lesson(1, 480, 525)])]);
    const out = suggestClubTimes({
      members: [blocker, anna],
      teachers: [person("T", [week([lesson(1, 480, 525)])])],
      periods: PERIODS,
      durationMin: 45,
      weekdays: [1],
      limit: 50,
    });
    const blocked = out.find((s) => s.busy.length > 0);
    expect(blocked?.busy.map((b) => b.label)).toEqual(["zoli"]);
  });

  test("ahol mindenki órán ül, oda nem javasol — a tanár lyukasórájába sem", () => {
    //* A vezetőnek hétfőn 9:50-kor lyukasórája van, az osztálynak viszont
    //* órája — ott nincs kivel megtartani.
    const cls = person("13A", [week([lesson(1, 480, 915)])]);
    const teacher = person("T", [
      week([lesson(1, 480, 580), lesson(1, 650, 915)]),
    ]);
    const out = suggestClubTimes({
      members: [cls],
      teachers: [teacher],
      periods: PERIODS,
      durationMin: 45,
      weekdays: [1],
      limit: 50,
    });
    expect(out.length).toBeGreaterThan(0);
    for (const s of out) {
      expect(s.free).toBe(1);
      //* A 0. óra (7:10) vagy az osztály napja utáni idő.
      expect(s.endMin <= 480 || s.startMin >= 915).toBe(true);
    }
  });

  test("ha senkiről nem tudunk semmit, a sáv marad", () => {
    const out = suggestClubTimes({
      members: [person("x", [])],
      teachers: [person("T", [week([lesson(2, 480, 525)])])],
      periods: PERIODS,
      durationMin: 45,
      weekdays: [2],
    });
    expect(out.length).toBeGreaterThan(0);
    expect(out[0]).toMatchObject({ free: 0, unknown: 1 });
  });
});

function booking(patch: Partial<RoomBooking>): RoomBooking {
  return {
    dateKey: "2026-09-21",
    dayOfWeek: 2,
    startMin: 900,
    endMin: 945,
    subject: "Matematika",
    subjectShort: "",
    classShort: "10A",
    teacher: "",
    teacherShort: "XY",
    week: "",
    ...patch,
  };
}

function occupancy(
  rooms: { short: string; bookings: RoomBooking[] }[],
  unknown: string[] = [],
): WeekOccupancy {
  return {
    weekStart: "2026-09-21",
    fetchedAt: 0,
    days: DAYS.map((d) => ({
      ...d,
      dateKey: "",
      name: "",
      week: "",
    })),
    periods: PERIODS,
    rooms: rooms.map((r) => ({ ...r, name: r.short })),
    unknown,
  };
}

describe("suggestClubRooms", () => {
  const base = {
    weekday: 2,
    startMin: 900,
    endMin: 945,
    onlyComputers: false,
    currentRooms: [] as string[],
    teacherRooms: [] as string[],
  };

  test("csak a mindkét héten szabad terem", () => {
    const a = occupancy([
      { short: "101", bookings: [] },
      { short: "102", bookings: [] },
    ]);
    const b = occupancy([
      { short: "101", bookings: [booking({})] },
      { short: "102", bookings: [booking({ startMin: 960, endMin: 1005 })] },
    ]);
    const out = suggestClubRooms({ ...base, occupancies: [a, b] });
    expect(out.free.map((r) => r.short)).toEqual(["102"]);
    expect(out.free[0].freeUntil).toBe(960);
  });

  test("gépterem-szűrő és az ismeretlen terem", () => {
    const occ = occupancy(
      [
        { short: "101", bookings: [] },
        { short: "B5", bookings: [] },
      ],
      ["102"],
    );
    const out = suggestClubRooms({
      ...base,
      occupancies: [occ],
      onlyComputers: true,
    });
    expect(out.free.map((r) => r.short)).toEqual(["B5"]);
    expect(out.unknown).toEqual(["102"]);
  });

  test("a mostani terem és a tanár terme elöl; a saját kártya nem foglal", () => {
    const own = booking({ classShort: "", teacherShort: "BNM" });
    const occ = occupancy([
      { short: "101", bookings: [] },
      { short: "207", bookings: [booking({ dayOfWeek: 1 })] },
      { short: "305", bookings: [own] },
    ]);
    const out = suggestClubRooms({
      ...base,
      occupancies: [occ],
      currentRooms: ["305"],
      teacherRooms: ["207"],
      isOwnBooking: (b) => b === own,
    });
    expect(out.free.map((r) => [r.short, r.reason])).toEqual([
      ["305", "current"],
      ["207", "teacher"],
      ["101", null],
    ]);
  });
});
