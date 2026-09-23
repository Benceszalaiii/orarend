import { beforeEach, describe, expect, test } from "bun:test";
import { redisDump, redisTtl, resetRedis } from "@/test/redis";
import { shiftDayKey, usageDayKey } from "./usage-day";
import { rankUsage, readUsage, recordClassUse, usageStoreReady } from "./usage-store";

beforeEach(resetRedis);

describe("rankUsage", () => {
  test("napokon átívelő összeg, csökkenő sorrend", () => {
    expect(
      rankUsage([
        { date: "2026-09-14", classes: { "12A": 3, "10B": 1 } },
        { date: "2026-09-13", classes: { "10B": 5, "9C": 2 } },
      ]),
    ).toEqual([
      { class: "10B", count: 6 },
      { class: "12A", count: 3 },
      { class: "9C", count: 2 },
    ]);
  });

  test("a Redis szövegként adott számait is összeadja", () => {
    expect(
      rankUsage([
        { date: "a", classes: { "12A": "2" as unknown as number } },
        { date: "b", classes: { "12A": 3 } },
      ]),
    ).toEqual([{ class: "12A", count: 5 }]);
  });

  test("üres bemenet", () => {
    expect(rankUsage([])).toEqual([]);
  });
});

describe("Redisszel", () => {
  test("kész", () => {
    expect(usageStoreReady()).toBe(true);
  });

  test("a mai napra számol, lejárati idővel", async () => {
    await recordClassUse("12A");
    await recordClassUse("12A");
    await recordClassUse("10B");
    const key = `hasznalat:${usageDayKey()}`;
    expect(redisDump()[key]).toEqual({ "12A": "2", "10B": "1" });
    expect(redisTtl(key)).toBe(60 * 60 * 24 * 800);
  });

  test("readUsage: a mai naptól visszafelé, üres napokkal", async () => {
    await recordClassUse("12A");
    const days = await readUsage(3);
    const today = usageDayKey();
    expect(days.map((d) => d.date)).toEqual([today, shiftDayKey(today, -1), shiftDayKey(today, -2)]);
    expect(days[0].classes).toEqual({ "12A": 1 });
    expect(days[1].classes).toEqual({});
    expect(rankUsage(days)).toEqual([{ class: "12A", count: 1 }]);
  });
});
