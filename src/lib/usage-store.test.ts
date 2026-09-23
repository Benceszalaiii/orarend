import { describe, expect, test } from "bun:test";
import { rankUsage, readUsage, recordClassUse, usageStoreReady } from "./usage-store";

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

//* A tesztkörnyezetben nincs Redis — ilyenkor minden művelet csendben semmi.
describe("Redis nélkül", () => {
  test("nem kész, nem ír, üreset olvas", async () => {
    expect(usageStoreReady()).toBe(false);
    await expect(recordClassUse("12A")).resolves.toBeUndefined();
    expect(await readUsage(7)).toEqual([]);
  });
});
