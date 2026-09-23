import { describe, expect, test } from "bun:test";
import {
  type AgendaItem,
  countdownLabel,
  longCountdownLabel,
  nowState,
  sortAgenda,
  spanFraction,
} from "./now";

function item(startMin: number, endMin: number, over: Partial<AgendaItem> = {}): AgendaItem {
  return {
    key: `${over.dateKey ?? "2026-09-14"}-${startMin}`,
    kind: "lesson",
    dateKey: "2026-09-14",
    dayOfWeek: 1,
    dayName: "Hétfő",
    startMin,
    endMin,
    title: "mat",
    fullTitle: "Matematika",
    meta: [],
    room: "102",
    who: null,
    accentSeed: "mat",
    ...over,
  };
}

describe("sortAgenda", () => {
  test("nap, kezdés, vég szerint — másolatot ad", () => {
    const a = item(600, 645);
    const b = item(480, 525);
    const c = item(480, 580);
    const d = item(470, 500, { dateKey: "2026-09-15" });
    const input = [d, a, c, b];
    expect(sortAgenda(input)).toEqual([b, c, a, d]);
    expect(input[0]).toBe(d);
  });
});

describe("nowState", () => {
  const first = item(480, 525);
  const second = item(535, 580);
  const tomorrow = item(480, 525, { dateKey: "2026-09-15", dayOfWeek: 2 });

  test("üres nap, üres jövő: empty", () => {
    expect(nowState([], [], 500)).toEqual({ phase: "empty" });
  });

  test("üres nap, van holnap: done + dayEmpty", () => {
    expect(nowState([], [tomorrow], 500)).toEqual({ phase: "done", next: tomorrow, dayEmpty: true });
  });

  test("első óra előtt egy órás felvezetés", () => {
    expect(nowState([second, first], [], 400)).toEqual({
      phase: "before",
      next: first,
      span: { fromMin: 420, toMin: 480 },
    });
  });

  test("óra közben: a jelenlegi és a következő", () => {
    expect(nowState([first, second], [], 500)).toEqual({
      phase: "lesson",
      current: first,
      next: second,
      span: { fromMin: 480, toMin: 525 },
    });
  });

  test("a vég pillanata már szünet", () => {
    expect(nowState([first, second], [], 525)).toEqual({
      phase: "break",
      next: second,
      span: { fromMin: 525, toMin: 535 },
    });
  });

  test("átfedésnél a később végződő az aktuális", () => {
    const long = item(480, 580);
    const state = nowState([first, long], [], 500);
    expect(state.phase === "lesson" && state.current).toBe(long);
  });

  test("utolsó óra után: done, a következő napra mutat", () => {
    expect(nowState([first], [tomorrow], 700)).toEqual({ phase: "done", next: tomorrow, dayEmpty: false });
    expect(nowState([first], [], 700)).toEqual({ phase: "done", next: null, dayEmpty: false });
  });
});

describe("spanFraction", () => {
  test("0 és 1 közé szorítva", () => {
    const span = { fromMin: 480, toMin: 520 };
    expect(spanFraction(span, 470)).toBe(0);
    expect(spanFraction(span, 490)).toBe(0.25);
    expect(spanFraction(span, 999)).toBe(1);
  });

  test("nulla hosszú idősáv: kész", () => {
    expect(spanFraction({ fromMin: 5, toMin: 5 }, 0)).toBe(1);
  });
});

describe("countdownLabel", () => {
  test.each([
    [0, { value: "0:00", unit: "" }],
    [59.2, { value: "1:00", unit: "" }],
    [65, { value: "1:05", unit: "" }],
    [599, { value: "9:59", unit: "" }],
    [600, { value: "10", unit: "perc" }],
    [601, { value: "11", unit: "perc" }],
    [3600, { value: "1 ó 0 p", unit: "" }],
    [5400, { value: "1 ó 30 p", unit: "" }],
    [-5, { value: "0:00", unit: "" }],
  ])("%p mp", (sec, label) => {
    expect(countdownLabel(sec)).toEqual(label);
  });
});

describe("longCountdownLabel", () => {
  test.each([
    [30, { value: "1", unit: "perc" }],
    [0, { value: "1", unit: "perc" }],
    [125, { value: "3", unit: "perc" }],
    [3600, { value: "1 óra", unit: "" }],
    [3660, { value: "1 óra", unit: "1 perc" }],
    [86400, { value: "1 nap", unit: "" }],
    [2 * 86400 + 3 * 3600, { value: "2 nap", unit: "3 óra" }],
  ])("%p mp", (sec, label) => {
    expect(longCountdownLabel(sec)).toEqual(label);
  });
});
