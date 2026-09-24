import { describe, expect, test } from "bun:test";
import {
  AXIS_W,
  BOARD_H,
  BOARD_W,
  COL_GAP,
  COL_W,
  colCenter,
  colLeft,
  DAY_END_MIN,
  DAY_START_MIN,
  DAYS,
  DUAL_BLOCKS,
  HEADER_H,
  heightOf,
  MONDAY,
  NEXT_EVENT,
  NOW_EVENT,
  NOW_MIN,
  PERIODS,
  PX_PER_MIN,
  SPLIT_MINE,
  SPLIT_OTHER,
  TUESDAY,
  topOf,
} from "./week";

describe("geometria", () => {
  test("oszlopok és a tábla mérete", () => {
    expect(colLeft(0)).toBe(AXIS_W);
    expect(colLeft(1) - colLeft(0)).toBe(COL_W + COL_GAP);
    expect(colCenter(2)).toBe(colLeft(2) + COL_W / 2);
    expect(colLeft(4) + COL_W).toBe(BOARD_W);
    expect(BOARD_H).toBe(HEADER_H + (DAY_END_MIN - DAY_START_MIN) * PX_PER_MIN);
  });

  test("időből pixel", () => {
    expect(topOf(DAY_START_MIN)).toBe(HEADER_H);
    expect(heightOf(480, 525)).toBeCloseTo(45 * PX_PER_MIN);
    expect(topOf(DAY_END_MIN)).toBeCloseTo(BOARD_H);
  });
});

describe("a bemutató hét", () => {
  const all = [...MONDAY, ...TUESDAY].flatMap((slot) =>
    "whole" in slot ? [slot.whole] : [slot.a, slot.b],
  );

  test("minden óra a nap keretén belül, és csengetéshez igazodik", () => {
    const starts = new Set(PERIODS.map((p) => p.start));
    const ends = new Set(PERIODS.map((p) => p.end));
    for (const l of all) {
      expect(l.startMin).toBeGreaterThanOrEqual(DAY_START_MIN);
      expect(l.endMin).toBeLessThanOrEqual(DAY_END_MIN);
      expect(starts.has(l.startMin)).toBe(true);
      expect(ends.has(l.endMin)).toBe(true);
    }
  });

  test("egyedi azonosítók, a helyes napon", () => {
    expect(new Set(all.map((l) => l.id)).size).toBe(all.length);
    for (const slot of MONDAY)
      for (const l of "whole" in slot ? [slot.whole] : [slot.a, slot.b])
        expect(l.dayOfWeek).toBe(1);
    for (const slot of TUESDAY)
      for (const l of "whole" in slot ? [slot.whole] : [slot.a, slot.b])
        expect(l.dayOfWeek).toBe(2);
  });

  test("a bontott órák párja egyszerre kezdődik és végződik", () => {
    for (const slot of [...MONDAY, ...TUESDAY]) {
      if ("whole" in slot) continue;
      expect([slot.a.startMin, slot.a.endMin]).toEqual([
        slot.b.startMin,
        slot.b.endMin,
      ]);
    }
  });

  test("a duális blokkok a duális napokra esnek", () => {
    const dualDays = DAYS.filter((d) => d.dual).map((d) => d.index + 1);
    expect(DUAL_BLOCKS.map((b) => b.dayOfWeek)).toEqual(dualDays);
  });

  test("a „most” az aktuális óra belsejében, a következő utána", () => {
    expect(NOW_EVENT).toBe(SPLIT_MINE);
    expect(SPLIT_OTHER.startMin).toBe(SPLIT_MINE.startMin);
    expect(NOW_MIN).toBeGreaterThan(NOW_EVENT.startMin);
    expect(NOW_MIN).toBeLessThan(NOW_EVENT.endMin);
    expect(NEXT_EVENT.startMin).toBeGreaterThanOrEqual(NOW_EVENT.endMin);
  });
});
