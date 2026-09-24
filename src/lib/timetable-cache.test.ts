import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import {
  type FakeBrowser,
  installBrowser,
  uninstallBrowser,
} from "@/test/browser";
import { week } from "@/test/fixtures";
import type { TimetableView } from "./timetable";
import {
  ageLabel,
  loadCachedWeek,
  loadWeekOrCached,
  saveCachedWeek,
} from "./timetable-cache";

function view(over: Partial<TimetableView> = {}): TimetableView {
  return { ...week(), events: [], prefs: [], persistence: "local", ...over };
}

describe("ageLabel", () => {
  const now = 10 * 24 * 3600_000;
  test.each([
    [0, "az imént"],
    [90_000, "az imént"],
    [5 * 60_000, "5 perce"],
    [3 * 3600_000, "3 órája"],
    [25 * 3600_000, "tegnap"],
    [3 * 24 * 3600_000, "3 napja"],
    [-60_000, "az imént"],
  ])("%p ms", (ago, label) => {
    expect(ageLabel(now - ago, now)).toBe(label);
  });
});

describe("mentett hét", () => {
  let b: FakeBrowser;
  beforeEach(() => {
    b = installBrowser();
  });
  afterEach(uninstallBrowser);

  test("oda-vissza, alanyonként és hetenként", () => {
    saveCachedWeek("12A", "2026-09-14", view());
    expect(loadCachedWeek("12A", "2026-09-14")?.view.subject?.short).toBe(
      "12A",
    );
    expect(loadCachedWeek("12A", "2026-09-21")).toBeNull();
    expect(loadCachedWeek("10B", "2026-09-14")).toBeNull();
    expect(loadCachedWeek("", "2026-09-14")).toBeNull();
  });

  test("hibás hetet nem ment", () => {
    saveCachedWeek("12A", "2026-09-14", view({ ok: false }));
    expect(loadCachedWeek("12A", "2026-09-14")).toBeNull();
  });

  test("legfeljebb négy bejegyzés, a legrégebbi esik ki", () => {
    const clock = spyOn(Date, "now");
    [
      "2026-09-07",
      "2026-09-14",
      "2026-09-21",
      "2026-09-28",
      "2026-10-05",
    ].forEach((w, i) => {
      clock.mockReturnValue(1000 + i);
      saveCachedWeek("12A", w, view({ weekStart: w }));
    });
    clock.mockRestore();
    expect(loadCachedWeek("12A", "2026-09-07")).toBeNull();
    expect(loadCachedWeek("12A", "2026-10-05")).not.toBeNull();
    expect(
      Object.keys(
        JSON.parse(b.localStorage.getItem("orarend:week-cache:v1") as string),
      ),
    ).toHaveLength(4);
  });

  test("régi formátum: hiányzó mezők alapértékkel, a régi resolvedClass-ból alany", () => {
    const legacy = {
      ...view(),
      kind: undefined,
      subject: undefined,
      resolvedClass: { short: "09B", name: "9.B" },
      days: [
        {
          name: "Hétfő",
          dateKey: "2026-09-14",
          dateLabel: "",
          week: "A",
          dayOfWeek: 1,
          isToday: false,
        },
      ],
    };
    b.localStorage.setItem(
      "orarend:week-cache:v1",
      JSON.stringify({ "09B|2026-09-14": { view: legacy, fetchedAt: 5 } }),
    );
    const cached = loadCachedWeek("09B", "2026-09-14");
    expect(cached?.view.kind).toBe("class");
    expect(cached?.view.subject).toEqual({ short: "09B", name: "9.B" });
    expect(cached?.view.days[0]).toMatchObject({
      teaching: null,
      notes: [],
      bells: null,
    });
  });

  test("sérült tár: null", () => {
    b.localStorage.setItem(
      "orarend:week-cache:v1",
      JSON.stringify({ "12A|2026-09-14": { view: {} } }),
    );
    expect(loadCachedWeek("12A", "2026-09-14")).toBeNull();
    b.localStorage.setItem("orarend:week-cache:v1", "nem json");
    expect(loadCachedWeek("12A", "2026-09-14")).toBeNull();
  });
});

describe("loadWeekOrCached", () => {
  beforeEach(() => installBrowser());
  afterEach(uninstallBrowser);

  const offline = view({
    ok: false,
    error: { kind: "network", title: "", message: "", retryable: true },
  });
  const unknown = view({
    ok: false,
    error: { kind: "unknown-class", title: "", message: "", retryable: false },
  });

  test("friss siker: elmenti, nem jelöli mentettnek", async () => {
    const result = await loadWeekOrCached("12A", "2026-09-14", async () =>
      view(),
    );
    expect(result.cached).toBeNull();
    expect(loadCachedWeek("12A", "2026-09-14")).not.toBeNull();
  });

  test("elérhetetlen forrás: a mentett példány", async () => {
    saveCachedWeek("12A", "2026-09-14", view());
    const result = await loadWeekOrCached(
      "12A",
      "2026-09-14",
      async () => offline,
    );
    expect(result.cached).not.toBeNull();
    expect(result.view.ok).toBe(true);
  });

  test("nem hálózati hiba: a hiba marad, nincs tartalék", async () => {
    saveCachedWeek("12A", "2026-09-14", view());
    const result = await loadWeekOrCached(
      "12A",
      "2026-09-14",
      async () => unknown,
    );
    expect(result.cached).toBeNull();
    expect(result.view.ok).toBe(false);
  });

  test("dobó lekérés: mentett példány, vagy továbbdobás", async () => {
    const boom = async (): Promise<TimetableView> => {
      throw new Error("boom");
    };
    await expect(loadWeekOrCached("12A", "2026-09-14", boom)).rejects.toThrow(
      "boom",
    );
    saveCachedWeek("12A", "2026-09-14", view());
    expect(
      (await loadWeekOrCached("12A", "2026-09-14", boom)).cached,
    ).not.toBeNull();
  });

  test("elérhetetlen és nincs mentett: a hibás nézet", async () => {
    const result = await loadWeekOrCached(
      "12A",
      "2026-09-14",
      async () => offline,
    );
    expect(result).toEqual({ view: offline, cached: null });
  });
});
