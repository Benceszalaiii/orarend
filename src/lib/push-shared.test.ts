import { describe, expect, test } from "bun:test";
import {
  DEFAULT_PREFS,
  LEAD_MINUTES,
  LEAD_WINDOW_MINUTES,
  MAX_CLASSES,
  MAX_TEACHERS,
  maxSubjects,
  prefsEmpty,
  subjectsOf,
} from "./push-shared";

describe("push-shared", () => {
  test("az alapbeállítás üres", () => {
    expect(prefsEmpty(DEFAULT_PREFS)).toBe(true);
    expect(prefsEmpty({ ...DEFAULT_PREFS, classes: ["12A"] })).toBe(false);
    expect(prefsEmpty({ ...DEFAULT_PREFS, teachers: ["LM"] })).toBe(false);
  });

  test("subjectsOf fajtánként, és védett a hiányzó mezővel szemben", () => {
    const prefs = { classes: ["12A"], teachers: ["LM"], everyLesson: false };
    expect(subjectsOf(prefs, "class")).toEqual(["12A"]);
    expect(subjectsOf(prefs, "teacher")).toEqual(["LM"]);
    const legacy = { classes: ["12A"], everyLesson: true } as never;
    expect(subjectsOf(legacy, "teacher")).toEqual([]);
  });

  test("maxSubjects", () => {
    expect(maxSubjects("class")).toBe(MAX_CLASSES);
    expect(maxSubjects("teacher")).toBe(MAX_TEACHERS);
  });

  //* Az ablak a cron-lépésnél szélesebb kell legyen, de az előfutásnál szűkebb.
  test("az emlékeztető ablaka az előfutáson belül marad", () => {
    expect(LEAD_WINDOW_MINUTES).toBeLessThanOrEqual(LEAD_MINUTES);
    expect(LEAD_WINDOW_MINUTES).toBeGreaterThan(0);
  });
});
