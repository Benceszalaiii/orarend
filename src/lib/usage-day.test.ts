import { describe, expect, test } from "bun:test";
import { shiftDayKey, usageDayKey } from "./usage-day";

describe("usageDayKey", () => {
  test("YYYY-MM-DD alak", () => {
    expect(usageDayKey(new Date("2026-09-14T10:00:00Z"))).toBe("2026-09-14");
  });

  //! A lényeg: a budapesti éjfél utáni első órák UTC-ben még az előző nap.
  test("budapesti naphatár, nem UTC (nyári idő, +2)", () => {
    expect(usageDayKey(new Date("2026-09-13T22:30:00Z"))).toBe("2026-09-14");
    expect(usageDayKey(new Date("2026-09-13T21:59:00Z"))).toBe("2026-09-13");
  });

  test("budapesti naphatár télen (+1)", () => {
    expect(usageDayKey(new Date("2026-01-14T23:30:00Z"))).toBe("2026-01-15");
    expect(usageDayKey(new Date("2026-01-14T22:59:00Z"))).toBe("2026-01-14");
  });
});

describe("shiftDayKey", () => {
  test("előre és hátra", () => {
    expect(shiftDayKey("2026-09-14", -1)).toBe("2026-09-13");
    expect(shiftDayKey("2026-09-14", 7)).toBe("2026-09-21");
    expect(shiftDayKey("2026-09-14", 0)).toBe("2026-09-14");
  });

  test("hónap-, év- és szökőnap-határ", () => {
    expect(shiftDayKey("2026-03-01", -1)).toBe("2026-02-28");
    expect(shiftDayKey("2028-03-01", -1)).toBe("2028-02-29");
    expect(shiftDayKey("2026-12-31", 1)).toBe("2027-01-01");
  });

  test("az óraátállítás napja sem csúszik el", () => {
    expect(shiftDayKey("2026-03-29", 1)).toBe("2026-03-30");
    expect(shiftDayKey("2026-10-25", -1)).toBe("2026-10-24");
    expect(shiftDayKey("2026-10-26", -1)).toBe("2026-10-25");
  });
});
