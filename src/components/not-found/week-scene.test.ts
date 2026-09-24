import { describe, expect, test } from "bun:test";
import {
  DAY_END,
  DAY_SPAN,
  DAY_START,
  GLYPH_CARDS,
  GLYPH_LANES,
  PERIODS,
  WEEK_CARDS,
} from "./week-scene";

describe("a hét jelenete", () => {
  test("a csengetés egymás után, átfedés nélkül", () => {
    for (let i = 1; i < PERIODS.length; i++) {
      expect(PERIODS[i].startMin).toBeGreaterThan(PERIODS[i - 1].endMin);
      expect(PERIODS[i].number).toBe(i);
    }
    expect(DAY_SPAN).toBe(DAY_END - DAY_START);
  });

  test("minden kártya egy hétköznapon, érvényes sávban, a nap keretén belül", () => {
    expect(new Set(WEEK_CARDS.map((c) => c.id)).size).toBe(WEEK_CARDS.length);
    for (const c of WEEK_CARDS) {
      expect(c.day).toBeGreaterThanOrEqual(0);
      expect(c.day).toBeLessThanOrEqual(4);
      expect(c.lane).toBeLessThan(c.lanes);
      expect(c.startMin).toBeLessThan(c.endMin);
      expect(c.startMin).toBeGreaterThanOrEqual(DAY_START);
      expect(c.endMin).toBeLessThanOrEqual(DAY_END);
    }
  });

  test("ugyanabban a sávban nincs két átfedő kártya", () => {
    for (const a of WEEK_CARDS) {
      for (const b of WEEK_CARDS) {
        if (
          a === b ||
          a.day !== b.day ||
          a.lane !== b.lane ||
          a.lanes !== b.lanes
        )
          continue;
        const overlap = a.startMin < b.endMin && b.startMin < a.endMin;
        expect(overlap).toBe(false);
      }
    }
  });
});

describe("a 404 számjegyei", () => {
  test("egyedi azonosítók, tizenöt hasábon belül, érvényes időkkel", () => {
    expect(GLYPH_LANES).toBe(3);
    expect(new Set(GLYPH_CARDS.map((c) => c.id)).size).toBe(GLYPH_CARDS.length);
    for (const c of GLYPH_CARDS) {
      expect(c.col).toBeGreaterThanOrEqual(0);
      expect(c.col).toBeLessThan(15);
      expect(c.startMin).toBeLessThan(c.endMin);
    }
  });

  test("három számjegy, mindegyik saját színmaggal", () => {
    expect(new Set(GLYPH_CARDS.map((c) => c.seed)).size).toBeGreaterThanOrEqual(
      2,
    );
    expect(new Set(GLYPH_CARDS.map((c) => c.id.split("-")[0])).size).toBe(3);
  });
});
