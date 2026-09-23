import { beforeEach, describe, expect, spyOn, test } from "bun:test";
import { redisTtl, resetRedis } from "@/test/redis";
import {
  calendarStoreReady,
  leaseWindowRefresh,
  readFeed,
  readWindow,
  removeFeed,
  touchFeed,
  writeFeed,
  writeWindow,
} from "./calendar-store";

beforeEach(resetRedis);

const request = { kind: "class" as const, short: "12A", prefs: [], dual: null, userId: "u1" };

describe("calendar-store", () => {
  test("kész", () => {
    expect(calendarStoreReady()).toBe(true);
  });

  test("feed írás–olvasás, 400 napos lejárattal", async () => {
    await writeFeed("tok", request);
    const row = await readFeed("tok");
    expect(row).toMatchObject(request);
    expect(typeof row?.createdAt).toBe("number");
    expect(redisTtl("cal:feed:tok")).toBe(60 * 60 * 24 * 400);
  });

  test("átíráskor a létrehozás ideje megmarad", async () => {
    const clock = spyOn(Date, "now").mockReturnValue(1000);
    await writeFeed("tok", request);
    clock.mockReturnValue(5000);
    await writeFeed("tok", { ...request, short: "12B" });
    const row = await readFeed("tok");
    expect(row).toMatchObject({ short: "12B", createdAt: 1000, touchedAt: 5000 });
    clock.mockRestore();
  });

  test("touchFeed naponta legfeljebb egyszer ír", async () => {
    const clock = spyOn(Date, "now").mockReturnValue(1_000_000);
    await writeFeed("tok", request);
    const row = await readFeed("tok");
    if (!row) throw new Error("nincs sor");
    clock.mockReturnValue(1_000_000 + 60_000);
    await touchFeed("tok", row);
    expect((await readFeed("tok"))?.touchedAt).toBe(1_000_000);
    clock.mockReturnValue(1_000_000 + 25 * 3600 * 1000);
    await touchFeed("tok", row);
    expect((await readFeed("tok"))?.touchedAt).toBe(1_000_000 + 25 * 3600 * 1000);
    clock.mockRestore();
  });

  test("removeFeed", async () => {
    await writeFeed("tok", request);
    await removeFeed("tok");
    expect(await readFeed("tok")).toBeNull();
  });

  test("az ablak alanyonként, a tanár előtaggal", async () => {
    await writeWindow("teacher", "LM", []);
    expect(await readWindow("teacher", "LM")).toMatchObject({ weeks: [] });
    expect(await readWindow("class", "LM")).toBeNull();
    expect(redisTtl("cal:weeks:tanar:LM")).toBe(60 * 60 * 24 * 7);
  });

  test("a frissítési zár egyszerre egy kérésé", async () => {
    expect(await leaseWindowRefresh("class", "12A")).toBe(true);
    expect(await leaseWindowRefresh("class", "12A")).toBe(false);
    expect(await leaseWindowRefresh("class", "12B")).toBe(true);
  });
});
