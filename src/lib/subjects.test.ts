import { describe, expect, test } from "bun:test";
import type { RoomBooking, WeekOccupancy } from "./free-rooms";
import {
  buildSubjectIndex,
  filterSubjects,
  findSubject,
  foldSearch,
  rankSubjects,
} from "./subjects";

//! ═══════════════════════════════════════════════════════════════════════════
//! REGRESSZIÓS TESZT — MIÉRT ÉPP EZ
//! ═══════════════════════════════════════════════════════════════════════════
//!  • A NÉV AZ AZONOSÍTÓ, NEM A JEL. A „Matematika" és a „Szakmai matematika"
//!    a forrásban egyaránt `mat` — ha a jel szerint gyűjtenénk, a két tárgy
//!    tanárai egy listába folynának.
//!  • A KÉT HÉT UNIÓJA. A B hetes óra csak a B héten van ott; ha az egyik hét
//!    elveszne, a tárgy fél tanári kara is vele menne.
//!  • A SZAKKÖR. Osztály nélküli kártya — a tanára attól még tanítja a tárgyat.
//! ═══════════════════════════════════════════════════════════════════════════

const booking = (over: Partial<RoomBooking>): RoomBooking => ({
  dateKey: "2026-09-28",
  dayOfWeek: 1,
  startMin: 480,
  endMin: 525,
  subject: "Matematika",
  subjectShort: "mat",
  classShort: "10E",
  teacher: "Mária Ivett Lipták",
  teacherShort: "LM",
  week: "AB",
  ...over,
});

const week = (
  weekStart: string,
  bookings: RoomBooking[],
  over: Partial<WeekOccupancy> = {},
): WeekOccupancy => ({
  weekStart,
  fetchedAt: 1_000,
  days: [],
  periods: [],
  rooms: [{ short: "102", name: "102", bookings }],
  unknown: [],
  ...over,
});

describe("buildSubjectIndex", () => {
  test("tárgyanként a tanárok és az osztályok, rendezve", () => {
    const index = buildSubjectIndex([
      week("2026-09-28", [
        booking({ classShort: "11A" }),
        booking({ classShort: "09B" }),
        booking({
          classShort: "10E",
          teacher: "Anett Ágoston",
          teacherShort: "AA",
        }),
        //* Ugyanaz az óra kétszer (dupla óra) — egyszer számít.
        booking({ classShort: "09B" }),
      ]),
    ]);

    expect(index.subjects).toHaveLength(1);
    const math = index.subjects[0];
    expect(math.name).toBe("Matematika");
    expect(math.short).toBe("mat");
    expect(math.teachers.map((t) => t.short)).toEqual(["AA", "LM"]);
    expect(math.teachers[1].classes).toEqual(["09B", "11A"]);
    expect(math.classes.map((c) => c.short)).toEqual(["09B", "10E", "11A"]);
    expect(math.classes[1].teachers).toEqual(["AA"]);
  });

  test("az azonos jelű, de más nevű tárgy külön marad", () => {
    const index = buildSubjectIndex([
      week("2026-09-28", [
        booking({}),
        booking({ subject: "Szakmai matematika", teacherShort: "BB" }),
      ]),
    ]);
    expect(index.subjects.map((s) => s.name)).toEqual([
      "Matematika",
      "Szakmai matematika",
    ]);
    expect(index.subjects[1].teachers.map((t) => t.short)).toEqual(["BB"]);
  });

  test("a két hét uniója, a régebbi kelte", () => {
    const index = buildSubjectIndex([
      week("2026-09-28", [booking({ week: "A" })], { fetchedAt: 5_000 }),
      week(
        "2026-10-05",
        [booking({ week: "B", classShort: "12C", teacherShort: "CC" })],
        { fetchedAt: 2_000, unknown: ["tor"] },
      ),
    ]);
    expect(index.weeks).toEqual(["2026-09-28", "2026-10-05"]);
    expect(index.fetchedAt).toBe(2_000);
    expect(index.unknown).toEqual(["tor"]);
    expect(index.subjects[0].classes.map((c) => c.short)).toEqual([
      "10E",
      "12C",
    ]);
  });

  test("a szakkör tanára osztály nélkül is ott van", () => {
    const index = buildSubjectIndex([
      week("2026-09-28", [
        booking({
          subject: "Tehetséggondozó szakkör",
          subjectShort: "tgsz",
          classShort: "",
        }),
      ]),
    ]);
    const club = index.subjects[0];
    expect(club.teachers.map((t) => t.short)).toEqual(["LM"]);
    expect(club.teachers[0].classes).toEqual([]);
    expect(club.classes).toEqual([]);
  });

  test("se tanár, se osztály: kimarad", () => {
    const index = buildSubjectIndex([
      week("2026-09-28", [
        booking({ classShort: "", teacher: "", teacherShort: "" }),
        booking({ subject: "" }),
      ]),
    ]);
    expect(index.subjects).toEqual([]);
  });
});

describe("keresés", () => {
  const index = buildSubjectIndex([
    week("2026-09-28", [
      booking({ subject: "Történelem", subjectShort: "tör" }),
      booking({}),
    ]),
  ]);

  test("ékezet és kisbetű nélkül is talál", () => {
    expect(foldSearch("  Történelem ")).toBe("tortenelem");
    expect(
      filterSubjects(index.subjects, "tortenel").map((s) => s.name),
    ).toEqual(["Történelem"]);
    expect(filterSubjects(index.subjects, "MAT").map((s) => s.name)).toEqual([
      "Matematika",
    ]);
    expect(filterSubjects(index.subjects, "")).toHaveLength(2);
  });

  test("a pontos név megbocsátóan", () => {
    expect(findSubject(index.subjects, "tortenelem")?.name).toBe("Történelem");
    expect(findSubject(index.subjects, "torte")).toBeNull();
    expect(findSubject(index.subjects, " ")).toBeNull();
  });
});

describe("rangsor", () => {
  test("több tanár előre, egyenlőnél több osztály, aztán a név", () => {
    const index = buildSubjectIndex([
      week("2026-09-28", [
        booking({ subject: "Angol", teacherShort: "A1", classShort: "9A" }),
        booking({ subject: "Biológia", teacherShort: "B1", classShort: "9A" }),
        booking({ subject: "Biológia", teacherShort: "B1", classShort: "9B" }),
        booking({ subject: "Kémia", teacherShort: "K1", classShort: "9A" }),
        booking({ subject: "Matematika", teacherShort: "M1" }),
        booking({ subject: "Matematika", teacherShort: "M2" }),
      ]),
    ]);
    expect(rankSubjects(index.subjects).map((s) => s.name)).toEqual([
      "Matematika",
      "Biológia",
      "Angol",
      "Kémia",
    ]);
    //* Az eredeti tömb nem mozdul — az API ábécérendje megmarad.
    expect(index.subjects.map((s) => s.name)).toEqual([
      "Angol",
      "Biológia",
      "Kémia",
      "Matematika",
    ]);
  });
});
