import { describe, expect, test } from "bun:test";
import {
  addDaysKey,
  DAY_NAMES,
  DAY_SHORT,
  dateFromKey,
  dateToKey,
  durationLabel,
  focusIsNextWeek,
  focusMondayKey,
  minLabel,
  mondayKey,
  pad,
  rangeLabel,
  weekLabel,
} from "./shared";

describe("pad / minLabel / rangeLabel", () => {
  test("kétjegyű alakok", () => {
    expect(pad(3)).toBe("03");
    expect(pad(12)).toBe("12");
    expect(minLabel(480)).toBe("08:00");
    expect(minLabel(595)).toBe("09:55");
    expect(minLabel(0)).toBe("00:00");
    expect(rangeLabel(480, 525)).toBe("08:00–08:45");
  });
});

describe("durationLabel", () => {
  test.each([
    [45, "45 perc"],
    [60, "1 óra"],
    [95, "1 óra 35 perc"],
    [0, "0 perc"],
  ])("%i → %s", (min, label) => {
    expect(durationLabel(min)).toBe(label);
  });
});

describe("napkulcsok", () => {
  test("mondayKey / addDaysKey", () => {
    expect(mondayKey("2026-09-19")).toBe("2026-09-14");
    expect(mondayKey("2026-09-14")).toBe("2026-09-14");
    expect(addDaysKey("2026-12-31", 1)).toBe("2027-01-01");
  });

  test("dateFromKey délben, dateToKey vissza", () => {
    const d = dateFromKey("2026-03-29");
    expect(d.getHours()).toBe(12);
    expect(dateToKey(d)).toBe("2026-03-29");
  });
});

describe("focusMondayKey / focusIsNextWeek", () => {
  test("hétköznap a mai hét, hétvégén a következő", () => {
    expect(focusMondayKey("2026-09-18")).toBe("2026-09-14");
    expect(focusMondayKey("2026-09-19")).toBe("2026-09-21");
    expect(focusMondayKey("2026-09-20")).toBe("2026-09-21");
    expect(focusIsNextWeek("2026-09-18")).toBe(false);
    expect(focusIsNextWeek("2026-09-19")).toBe(true);
    expect(focusIsNextWeek("2026-09-20")).toBe(true);
  });
});

describe("weekLabel", () => {
  test("teljes alak évvel", () => {
    const label = weekLabel("2026-09-14");
    expect(label).toContain("2026");
    expect(label).toContain("14");
    expect(label).toContain("18");
  });

  test("tömör alak egy hónapon belül csak a napot ismétli", () => {
    const label = weekLabel("2026-09-14", true);
    expect(label.endsWith("– 18.")).toBe(true);
    expect(label).not.toContain("2026");
  });

  test("hónaphatáron a második hónap is kiíródik", () => {
    const label = weekLabel("2026-09-28", true);
    expect(label).toContain("okt");
  });
});

describe("napnevek", () => {
  test("öt tanítási nap", () => {
    expect(DAY_NAMES).toHaveLength(5);
    expect(DAY_SHORT).toHaveLength(5);
  });
});
