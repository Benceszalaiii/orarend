import { describe, expect, test } from "bun:test";
import { lesson, week } from "@/test/fixtures";
import type { TimetableView } from "@/lib/timetable";
import { buildDayModel } from "./day";
import { buildTeacherWeek, clashesOf } from "./teacher-week";
import { buildWeekModel } from "./week";

function view(over: Partial<TimetableView> = {}): TimetableView {
  return { ...week({ kind: "teacher" }), events: [], prefs: [], persistence: "local", ...over };
}

function tl(over: Parameters<typeof lesson>[0]) {
  return lesson({ teacher: "", teacherShort: "", classShort: "12A", className: "12.A", ...over });
}

describe("buildTeacherWeek", () => {
  test("osztályonkénti terhelés és a lyukasórák", () => {
    const v = view({
      lessons: [
        tl({ dayOfWeek: 1, startMin: 480, endMin: 525 }),
        tl({ dayOfWeek: 1, startMin: 650, endMin: 695, classShort: "09B", className: "", subjectShort: "inf" }),
        tl({ dayOfWeek: 2, startMin: 480, endMin: 525 }),
        tl({ dayOfWeek: 2, startMin: 535, endMin: 580 }),
      ],
    });
    const result = buildTeacherWeek(v, buildWeekModel(v, [], null));
    expect(result.classes).toEqual([
      { short: "12A", name: "12.A", minutes: 135, lessons: 3, days: 2 },
      { short: "09B", name: "09B", minutes: 45, lessons: 1, days: 1 },
    ]);
    expect(result.free).toEqual([{ dateKey: "2026-09-14", dayName: "Hétfő", startMin: 525, endMin: 650 }]);
    expect(result.freeMinutes).toBe(125);
  });

  test("osztály nélküli óra nem számít osztálynak", () => {
    const v = view({ lessons: [tl({ classShort: "", className: "" })] });
    expect(buildTeacherWeek(v, buildWeekModel(v, [], null)).classes).toEqual([]);
  });
});

describe("clashesOf", () => {
  test("két osztály egy időben: ütközés, teremmel", () => {
    const v = view({
      lessons: [
        tl({ classShort: "12A", room: "214" }),
        tl({ classShort: "13C", room: "303", subjectShort: "inf", groupColumn: 1 }),
        tl({ startMin: 650, endMin: 695, classShort: "09B" }),
      ],
    });
    const day = buildDayModel(v, [], "2026-09-14", null);
    if (!day) throw new Error("nincs nap");
    const clashes = clashesOf(day.segments);
    expect(clashes).toHaveLength(1);
    expect(clashes[0].startMin).toBe(480);
    expect(clashes[0].endMin).toBe(525);
    expect(clashes[0].labels.sort()).toEqual(["12A · 214", "13C · 303"]);
  });

  test("egyedüli óra: nincs ütközés", () => {
    const v = view({ lessons: [tl({})] });
    const day = buildDayModel(v, [], "2026-09-14", null);
    expect(clashesOf(day?.segments ?? [])).toEqual([]);
  });
});
