import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { type FakeBrowser, installBrowser, uninstallBrowser } from "@/test/browser";
import {
  CLASSIC_DUAL_SCHEDULE,
  DUAL_SCHEDULE_STORAGE_KEY,
  dualStatusFor,
  EMPTY_DUAL_SCHEDULE,
  forgetDualSchedule,
  hasAnyDualDay,
  isDualDay,
  loadAllDualSchedules,
  loadDualSchedule,
  saveDualSchedule,
  toggleDualDay,
} from "./dual-schedule";

describe("isDualDay / hasAnyDualDay", () => {
  test("a klasszikus beosztás: B hét minden napja", () => {
    expect(isDualDay(CLASSIC_DUAL_SCHEDULE, "B", 1)).toBe(true);
    expect(isDualDay(CLASSIC_DUAL_SCHEDULE, "A", 1)).toBe(false);
    expect(hasAnyDualDay(CLASSIC_DUAL_SCHEDULE)).toBe(true);
    expect(hasAnyDualDay(EMPTY_DUAL_SCHEDULE)).toBe(false);
  });

  test("ismeretlen hét: sosem duális", () => {
    expect(isDualDay(CLASSIC_DUAL_SCHEDULE, "", 1)).toBe(false);
    expect(isDualDay(CLASSIC_DUAL_SCHEDULE, "C", 1)).toBe(false);
  });
});

describe("dualStatusFor", () => {
  test("beállítatlan vagy üres beosztás: mindig iskola", () => {
    expect(dualStatusFor(null, 1, "B")).toBe("school");
    expect(dualStatusFor(EMPTY_DUAL_SCHEDULE, 1, "")).toBe("school");
  });

  test("beállított beosztás jelöletlen héten: ismeretlen", () => {
    expect(dualStatusFor(CLASSIC_DUAL_SCHEDULE, 1, "")).toBe("unknown");
  });

  test("a saját beosztás szerint", () => {
    const schedule = { A: [2], B: [4, 5] };
    expect(dualStatusFor(schedule, 2, "A")).toBe("dual");
    expect(dualStatusFor(schedule, 2, "B")).toBe("school");
    expect(dualStatusFor(schedule, 5, "B")).toBe("dual");
  });
});

describe("toggleDualDay", () => {
  test("be- és kikapcsol, rendezve, a másik hetet nem érinti", () => {
    let s = toggleDualDay(EMPTY_DUAL_SCHEDULE, "A", 4);
    s = toggleDualDay(s, "A", 1);
    expect(s).toEqual({ A: [1, 4], B: [] });
    s = toggleDualDay(s, "A", 4);
    expect(s).toEqual({ A: [1], B: [] });
  });

  test("nem módosítja a bemenetet", () => {
    const before = { A: [1], B: [2] };
    toggleDualDay(before, "A", 3);
    expect(before).toEqual({ A: [1], B: [2] });
  });
});

describe("tárolás", () => {
  let b: FakeBrowser;
  beforeEach(() => {
    b = installBrowser();
  });
  afterEach(uninstallBrowser);

  test("beállítatlan osztály: null, üres név: null", () => {
    expect(loadDualSchedule("12A")).toBeNull();
    expect(loadDualSchedule("")).toBeNull();
  });

  test("osztályonként külön, és jelez", () => {
    saveDualSchedule("12A", { A: [1], B: [] });
    saveDualSchedule("12B", CLASSIC_DUAL_SCHEDULE);
    expect(loadDualSchedule("12A")).toEqual({ A: [1], B: [] });
    expect(loadAllDualSchedules()).toEqual({
      "12A": { A: [1], B: [] },
      "12B": CLASSIC_DUAL_SCHEDULE,
    });
    expect(b.events).toHaveLength(2);
  });

  test("elfelejtés: vissza a beállítatlan állapotba", () => {
    saveDualSchedule("12A", CLASSIC_DUAL_SCHEDULE);
    forgetDualSchedule("12A");
    expect(loadDualSchedule("12A")).toBeNull();
  });

  test("üres osztálynévre nem ír", () => {
    saveDualSchedule("", CLASSIC_DUAL_SCHEDULE);
    forgetDualSchedule("");
    expect(b.localStorage.getItem(DUAL_SCHEDULE_STORAGE_KEY)).toBeNull();
  });

  test("a tárolt szemetet tisztítja", () => {
    b.localStorage.setItem(
      DUAL_SCHEDULE_STORAGE_KEY,
      JSON.stringify({
        "12A": { A: [5, 1, 1, 9, "2"], B: "x" },
        "12B": null,
        "12C": 3,
      }),
    );
    expect(loadAllDualSchedules()).toEqual({ "12A": { A: [1, 5], B: [] } });
  });

  test("hibás JSON és dobó tárhely: üres", () => {
    b.localStorage.setItem(DUAL_SCHEDULE_STORAGE_KEY, "{");
    expect(loadAllDualSchedules()).toEqual({});
    b.localStorage.broken = true;
    expect(loadAllDualSchedules()).toEqual({});
    expect(() => saveDualSchedule("12A", CLASSIC_DUAL_SCHEDULE)).not.toThrow();
  });
});

describe("szerveren", () => {
  test("üres és néma", () => {
    expect(loadAllDualSchedules()).toEqual({});
    expect(() => saveDualSchedule("12A", CLASSIC_DUAL_SCHEDULE)).not.toThrow();
    expect(() => forgetDualSchedule("12A")).not.toThrow();
  });
});
