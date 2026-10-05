import { describe, expect, test } from "bun:test";
import { coverSpans, HIDDEN, inkClips, SHOWN } from "./ink-clip";

describe("coverSpans", () => {
  test("a felirat tartományára szorít, a keskenyet eldobja", () => {
    expect(coverSpans(40, [[-10, 12]])).toEqual([[0, 12]]);
    expect(coverSpans(40, [[30, 90]])).toEqual([[30, 40]]);
    expect(coverSpans(40, [[50, 90]])).toEqual([]);
    expect(coverSpans(40, [[10, 10.2]])).toEqual([]);
  });

  test("az egymást érő sávokat összevonja, a többit rendezi", () => {
    expect(
      coverSpans(100, [
        [60, 80],
        [0, 20],
        [15, 30],
      ]),
    ).toEqual([
      [0, 30],
      [60, 80],
    ]);
  });
});

describe("inkClips", () => {
  test("takarás nélkül csak az alap látszik", () => {
    expect(inkClips(40, 16, [])).toEqual({ ink: HIDDEN, base: SHOWN });
  });

  test("egy sáv: ugyanaz a vágás, mint eddig", () => {
    const { ink, base } = inkClips(40, 16, [[10, 25]]);
    expect(ink).toBe("inset(-6px 15px -6px 10px)");
    expect(base.startsWith("polygon(evenodd,")).toBe(true);
  });

  test("teljes takarásnál az alap eltűnik", () => {
    expect(inkClips(40, 16, [[-5, 60]]).base).toBe(HIDDEN);
  });

  //! A leszakadó csepp a fő testtől külön sáv: a felirat MINDKETTŐ alatt
  //! tintával ír, különben fehér betű ül a fehér cseppen.
  test("két külön sáv: a tinta mindkettőben, az alap mindkettőn lyukas", () => {
    const { ink, base } = inkClips(40, 16, [
      [0, 8],
      [30, 40],
    ]);
    expect(ink).toBe(
      'path(evenodd, "M 0 -6 H 8 V 22 H 0 Z M 30 -6 H 40 V 22 H 30 Z")',
    );
    expect(base).toBe(
      'path(evenodd, "M -6 -6 H 46 V 22 H -6 Z M 0 -6 H 8 V 22 H 0 Z M 30 -6 H 40 V 22 H 30 Z")',
    );
  });
});
