import { describe, expect, test } from "bun:test";
import type { TimetableView } from "@/lib/timetable";
import { clusterKeyOf, lessonIdentity } from "@/lib/timetable-merge";
import { lesson, week } from "@/test/fixtures";
import { buildWeekModel, hoursLabel } from "./week";

function view(over: Partial<TimetableView> = {}): TimetableView {
  return { ...week(), events: [], prefs: [], persistence: "local", ...over };
}

describe("hoursLabel", () => {
  test.each([
    [45, "45p"],
    [60, "1ó"],
    [135, "2ó 15p"],
    [0, "0p"],
  ])("%i → %s", (m, label) => {
    expect(hoursLabel(m)).toBe(label);
  });
});

describe("buildWeekModel", () => {
  test("napok, percek, órák — a szünetek nélkül", () => {
    const v = view({
      lessons: [
        //* Dupla óra: 480–580, benne 10 perc szünet → 90 tanítási perc, 2 óra.
        lesson({ dayOfWeek: 1, startMin: 480, endMin: 525 }),
        lesson({ dayOfWeek: 1, startMin: 535, endMin: 580 }),
        lesson({
          dayOfWeek: 2,
          subjectShort: "tör",
          subject: "Történelem",
          teacherShort: "KB",
          moved: true,
          dateKey: "2026-09-15",
        }),
      ],
    });
    const model = buildWeekModel(v, [], null);
    expect(model.days).toHaveLength(5);
    expect(model.days[0]).toMatchObject({
      lessonCount: 1,
      minutes: 90,
      firstMin: 480,
      lastMin: 580,
      movedCount: 0,
    });
    expect(model.days[1]).toMatchObject({
      lessonCount: 1,
      minutes: 45,
      movedCount: 1,
    });
    expect(model.days[2]).toMatchObject({ lessonCount: 0, minutes: 0 });
    expect(model.totalMinutes).toBe(135);
    expect(model.totalLessons).toBe(3);
    expect(model.moved.map((m) => m.dayName)).toEqual(["Kedd"]);
    expect(model.weekLetter).toBe("A");
    expect(model.hasDualDays).toBe(false);
    expect(model.undecided).toBe(0);
  });

  test("tantárgyak csökkenő terhelés szerint", () => {
    const v = view({
      lessons: [
        lesson({ dayOfWeek: 1, startMin: 480, endMin: 525 }),
        lesson({ dayOfWeek: 2, startMin: 480, endMin: 525 }),
        lesson({
          dayOfWeek: 3,
          subjectShort: "tör",
          subject: "Történelem",
          teacherShort: "KB",
        }),
      ],
    });
    const rows = buildWeekModel(v, [], null).subjects;
    expect(
      rows.map((r) =>
        r.kind === "subject" ? [r.short, r.minutes, r.lessons] : null,
      ),
    ).toEqual([
      ["mat", 90, 2],
      ["tör", 45, 1],
    ]);
  });

  test("a duális nap kimarad az összesítésből", () => {
    const v = view({
      lessons: [
        lesson({ dayOfWeek: 1 }),
        lesson({ dayOfWeek: 3, subjectShort: "tör", teacherShort: "KB" }),
      ],
    });
    const model = buildWeekModel(v, [], { A: [1], B: [] });
    expect(model.hasDualDays).toBe(true);
    expect(model.days[0].dual).toBe("dual");
    expect(model.days[0].minutes).toBe(0);
    expect(model.days[0].lessonCount).toBe(1);
    expect(model.totalMinutes).toBe(45);
    expect(model.subjects).toHaveLength(1);
  });

  test("a döntetlen csoportbontás egy „split” sor, ágankénti terheléssel", () => {
    const ang1 = {
      subjectShort: "ang",
      subject: "Angol",
      group: "1",
      groupColumn: 0,
      groupCount: 2,
      wholeClass: false,
      teacherShort: "AA",
    };
    const ang2 = {
      subjectShort: "ném",
      subject: "Német",
      group: "2",
      groupColumn: 1,
      groupCount: 2,
      wholeClass: false,
      teacherShort: "BB",
    };
    const v = view({
      lessons: [
        lesson({ dayOfWeek: 1, ...ang1 }),
        lesson({ dayOfWeek: 1, ...ang2 }),
        lesson({ dayOfWeek: 2, ...ang1 }),
        lesson({ dayOfWeek: 2, ...ang2 }),
        lesson({ dayOfWeek: 3, ...ang1, startMin: 535, endMin: 580 }),
      ],
    });
    const model = buildWeekModel(v, [], null);
    expect(model.undecided).toBe(1);
    const split = model.subjects.find((r) => r.kind === "split");
    if (split?.kind !== "split") throw new Error("nincs split sor");
    expect(split.dayNames).toEqual(["Hétfő", "Kedd"]);
    expect(split.shorts.sort()).toEqual(["ang", "ném"]);
    expect(split.minutes).toBe(135);
    expect(split.minMinutes).toBe(90);
    expect(split.branches).toHaveLength(2);
    expect(split.branches[0].options[0]).toMatchObject({
      group: "1",
      teacher: "AA",
    });
    //* A versengő tárgyak nem jelennek meg külön sorként is.
    expect(model.subjects.filter((r) => r.kind === "subject")).toHaveLength(0);
  });

  test("a mentett döntés után nincs split", () => {
    const a = lesson({
      subjectShort: "ang",
      group: "1",
      groupColumn: 0,
      groupCount: 2,
      wholeClass: false,
      teacherShort: "AA",
    });
    const b = lesson({
      subjectShort: "ném",
      group: "2",
      groupColumn: 1,
      groupCount: 2,
      wholeClass: false,
      teacherShort: "BB",
    });
    const key = clusterKeyOf([lessonIdentity(a), lessonIdentity(b)]);
    const model = buildWeekModel(
      view({ lessons: [a, b] }),
      [{ clusterKey: key, chosen: lessonIdentity(a) }],
      null,
    );
    expect(model.undecided).toBe(0);
    expect(model.subjects.map((r) => r.kind === "subject" && r.short)).toEqual([
      "ang",
    ]);
  });
});
