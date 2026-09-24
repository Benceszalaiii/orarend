import { describe, expect, test } from "bun:test";
import {
  DUAL_DAY_END_MIN,
  DUAL_DAY_START_MIN,
  DUAL_LABEL,
  dualBlockLesson,
  dualStatusOf,
} from "./dualis";

describe("dualStatusOf", () => {
  test("A hét: hétfő-kedd duális, a többi iskola", () => {
    expect([1, 2, 3, 4, 5].map((d) => dualStatusOf(d, "A"))).toEqual([
      "dual",
      "dual",
      "school",
      "school",
      "school",
    ]);
  });

  test("B hét: szerdától duális", () => {
    expect([1, 2, 3, 4, 5].map((d) => dualStatusOf(d, "B"))).toEqual([
      "school",
      "school",
      "dual",
      "dual",
      "dual",
    ]);
  });

  test("jelöletlen hét: ismeretlen", () => {
    expect(dualStatusOf(1, "")).toBe("unknown");
    expect(dualStatusOf(3, "AB")).toBe("unknown");
    expect(dualStatusOf(3, "a")).toBe("unknown");
  });

  test("minden állapotnak van felirata", () => {
    expect(Object.keys(DUAL_LABEL).sort()).toEqual([
      "dual",
      "school",
      "unknown",
    ]);
  });
});

describe("dualBlockLesson", () => {
  test("8:00–15:00 egész napos, egész osztályos blokk", () => {
    const lesson = dualBlockLesson({ dayOfWeek: 3, dateKey: "2026-09-16" });
    expect(lesson.key).toBe("dual-2026-09-16");
    expect(lesson.dateKey).toBe("2026-09-16");
    expect(lesson.dayOfWeek).toBe(3);
    expect(lesson.startMin).toBe(DUAL_DAY_START_MIN);
    expect(lesson.endMin).toBe(DUAL_DAY_END_MIN);
    expect(DUAL_DAY_START_MIN).toBe(480);
    expect(DUAL_DAY_END_MIN).toBe(900);
    expect(lesson.kind).toBe("dual");
    expect(lesson.wholeClass).toBe(true);
    expect(lesson.groupCount).toBe(1);
    expect(lesson.moved).toBe(false);
  });
});
