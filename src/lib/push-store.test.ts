import { beforeEach, describe, expect, test } from "bun:test";
import { lesson } from "@/test/fixtures";
import { redisDump, resetRedis } from "@/test/redis";
import {
  leaseChange,
  leaseReminder,
  pushStoreReady,
  readSnapshot,
  readSubscription,
  readWeekCache,
  removeSubscription,
  saveSubscription,
  subscribedSubjects,
  subscribersOf,
  writeSnapshot,
  writeWeekCache,
} from "./push-store";

beforeEach(resetRedis);

function sub(endpoint: string, classes: string[], teachers: string[] = []) {
  return { endpoint, p256dh: "k", auth: "a", classes, teachers, everyLesson: false };
}

describe("feliratkozások", () => {
  test("kész", () => {
    expect(pushStoreReady()).toBe(true);
  });

  test("mentés: az alanyok indexe és a feliratkozók listája", async () => {
    await saveSubscription(sub("https://push/1", ["12A", "10B"], ["LM"]));
    await saveSubscription(sub("https://push/2", ["12A"]));
    expect((await subscribedSubjects("class")).sort()).toEqual(["10B", "12A"]);
    expect(await subscribedSubjects("teacher")).toEqual(["LM"]);
    expect((await subscribersOf("class", "12A")).map((s) => s.endpoint).sort()).toEqual([
      "https://push/1",
      "https://push/2",
    ]);
    expect((await readSubscription("https://push/1"))?.teachers).toEqual(["LM"]);
  });

  test("az endpoint nem kerül a kulcsba (hash)", async () => {
    await saveSubscription(sub("https://push/secret", ["12A"]));
    expect(Object.keys(redisDump()).some((k) => k.includes("secret"))).toBe(false);
  });

  test("módosításkor a leadott alanyból kikerül", async () => {
    await saveSubscription(sub("https://push/1", ["12A", "10B"]));
    await saveSubscription(sub("https://push/1", ["10B"]));
    expect(await subscribersOf("class", "12A")).toEqual([]);
    //* Az üres alany az indexből is kiesik (lusta takarítás).
    expect(await subscribedSubjects("class")).toEqual(["10B"]);
  });

  test("a létrehozás ideje megmarad", async () => {
    await saveSubscription(sub("https://push/1", ["12A"]));
    const first = (await readSubscription("https://push/1")) as { createdAt: number };
    await Bun.sleep(2);
    await saveSubscription(sub("https://push/1", ["10B"]));
    expect(((await readSubscription("https://push/1")) as { createdAt: number }).createdAt).toBe(first.createdAt);
  });

  test("endpoint-csere: a régi eltűnik", async () => {
    await saveSubscription(sub("https://push/old", ["12A"]));
    await saveSubscription(sub("https://push/new", ["12A"]), "https://push/old");
    expect(await readSubscription("https://push/old")).toBeNull();
    expect((await subscribersOf("class", "12A")).map((s) => s.endpoint)).toEqual(["https://push/new"]);
  });

  test("törlés", async () => {
    await saveSubscription(sub("https://push/1", ["12A"], ["LM"]));
    await removeSubscription("https://push/1");
    expect(await readSubscription("https://push/1")).toBeNull();
    expect(await subscribersOf("class", "12A")).toEqual([]);
    expect(await subscribersOf("teacher", "LM")).toEqual([]);
  });

  test("a lejárt feliratkozást a lista kitakarítja", async () => {
    await saveSubscription(sub("https://push/1", ["12A"]));
    await saveSubscription(sub("https://push/2", ["12A"]));
    const key = Object.keys(redisDump()).find(
      (k) => k.startsWith("push:sub:") && (redisDump()[k] as string).includes("push/1"),
    );
    const fake = new (await import("@upstash/redis")).Redis({} as never);
    await fake.del(key as string);
    expect((await subscribersOf("class", "12A")).map((s) => s.endpoint)).toEqual(["https://push/2"]);
    expect(redisDump()["push:class:12A"]).toEqual(new Set([key?.slice("push:sub:".length)]).size === 1 ? expect.any(Set) : undefined);
    expect((redisDump()["push:class:12A"] as Set<string>).size).toBe(1);
  });
});

describe("zárak", () => {
  test("egy emlékeztető egyszer megy ki", async () => {
    expect(await leaseReminder("class", "12A", "2026-09-14", 480)).toBe(true);
    expect(await leaseReminder("class", "12A", "2026-09-14", 480)).toBe(false);
    expect(await leaseReminder("teacher", "12A", "2026-09-14", 480)).toBe(true);
    expect(await leaseReminder("class", "12A", "2026-09-14", 535)).toBe(true);
  });

  test("egy változás-ujjlenyomat egyszer", async () => {
    expect(await leaseChange("class", "12A", "abc")).toBe(true);
    expect(await leaseChange("class", "12A", "abc")).toBe(false);
    expect(await leaseChange("class", "12A", "def")).toBe(true);
  });
});

describe("gyorsítótárak", () => {
  test("heti órák és lenyomat oda-vissza", async () => {
    await writeWeekCache("class", "12A", "2026-09-14", [lesson()]);
    const cached = await readWeekCache("class", "12A", "2026-09-14");
    expect(cached?.lessons).toEqual([lesson()]);
    expect(await readWeekCache("class", "12A", "2026-09-21")).toBeNull();

    await writeSnapshot("teacher", "LM", "2026-09-14", { a: "b" });
    expect(await readSnapshot("teacher", "LM", "2026-09-14")).toEqual({ a: "b" });
    expect(await readSnapshot("class", "LM", "2026-09-14")).toBeNull();
  });
});
