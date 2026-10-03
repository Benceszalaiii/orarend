import { beforeEach, describe, expect, test } from "bun:test";
import { lesson } from "@/test/fixtures";
import { redisDel, redisDump, resetRedis } from "@/test/redis";
import {
  clubSubscribersOf,
  leaseChange,
  leaseClubChange,
  leaseClubReminder,
  leaseReminder,
  pushStoreReady,
  readClubGone,
  readSnapshot,
  readSubscription,
  readWeekCache,
  removeSubscription,
  saveSubscription,
  subscribedClubs,
  subscribedSubjects,
  subscribersOf,
  writeClubGone,
  writeSnapshot,
  writeWeekCache,
} from "./push-store";

beforeEach(resetRedis);

function sub(endpoint: string, classes: string[], teachers: string[] = []) {
  return {
    endpoint,
    p256dh: "k",
    auth: "a",
    classes,
    teachers,
    everyLesson: false,
  };
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
    expect(
      (await subscribersOf("class", "12A")).map((s) => s.endpoint).sort(),
    ).toEqual(["https://push/1", "https://push/2"]);
    expect((await readSubscription("https://push/1"))?.teachers).toEqual([
      "LM",
    ]);
  });

  test("az endpoint nem kerül a kulcsba (hash)", async () => {
    await saveSubscription(sub("https://push/secret", ["12A"]));
    expect(Object.keys(redisDump()).some((k) => k.includes("secret"))).toBe(
      false,
    );
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
    const first = (await readSubscription("https://push/1")) as unknown as {
      createdAt: number;
    };
    await Bun.sleep(2);
    await saveSubscription(sub("https://push/1", ["10B"]));
    expect(
      (
        (await readSubscription("https://push/1")) as unknown as {
          createdAt: number;
        }
      ).createdAt,
    ).toBe(first.createdAt);
  });

  test("endpoint-csere: a régi eltűnik", async () => {
    await saveSubscription(sub("https://push/old", ["12A"]));
    await saveSubscription(
      sub("https://push/new", ["12A"]),
      "https://push/old",
    );
    expect(await readSubscription("https://push/old")).toBeNull();
    expect(
      (await subscribersOf("class", "12A")).map((s) => s.endpoint),
    ).toEqual(["https://push/new"]);
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
      (k) =>
        k.startsWith("push:sub:") &&
        (redisDump()[k] as string).includes("push/1"),
    );
    redisDel(key as string);
    expect(
      (await subscribersOf("class", "12A")).map((s) => s.endpoint),
    ).toEqual(["https://push/2"]);
    expect((redisDump()["push:class:12A"] as Set<string>).size).toBe(1);
  });
});

describe("zárak", () => {
  test("egy emlékeztető egyszer megy ki", async () => {
    const day = "2026-09-14";
    expect(await leaseReminder("class", "12A", day, 480, "mat")).toBe(true);
    expect(await leaseReminder("class", "12A", day, 480, "mat")).toBe(false);
    expect(await leaseReminder("teacher", "12A", day, 480, "mat")).toBe(true);
    expect(await leaseReminder("class", "12A", day, 535, "mat")).toBe(true);
  });

  test("ugyanarra a percre más szöveg külön foglalás", async () => {
    //* A duálison lévő diák és az iskolában ülő osztálytársa ugyanarra a
    //* percre mást kap — az egyik nem nyelheti el a másikat.
    const day = "2026-09-14";
    expect(await leaseReminder("class", "12A", day, 480, "Duális")).toBe(true);
    expect(await leaseReminder("class", "12A", day, 480, "mat")).toBe(true);
    expect(await leaseReminder("class", "12A", day, 480, "Duális")).toBe(false);
  });

  test("egy változás-ujjlenyomat egyszer", async () => {
    expect(await leaseChange("class", "12A", "abc")).toBe(true);
    expect(await leaseChange("class", "12A", "abc")).toBe(false);
    expect(await leaseChange("class", "12A", "def")).toBe(true);
  });
});

describe("gyorsítótárak", () => {
  test("heti órák és lenyomat oda-vissza", async () => {
    await writeWeekCache("class", "12A", "2026-09-14", [lesson()], "B");
    const cached = await readWeekCache("class", "12A", "2026-09-14");
    expect(cached?.lessons).toEqual([lesson()]);
    expect(cached?.weekLetter).toBe("B");
    expect(await readWeekCache("class", "12A", "2026-09-21")).toBeNull();

    await writeSnapshot("teacher", "LM", "2026-09-14", { a: "b" });
    expect(await readSnapshot("teacher", "LM", "2026-09-14")).toEqual({
      a: "b",
    });
    expect(await readSnapshot("class", "LM", "2026-09-14")).toBeNull();
  });
});

describe("szakkörök", () => {
  const withClubs = (endpoint: string, clubs: string[]) => ({
    ...sub(endpoint, []),
    clubs,
  });

  test("a követett szakkör feliratkozói", async () => {
    await saveSubscription(withClubs("https://push/1", ["robotika", "dron"]));
    await saveSubscription(withClubs("https://push/2", ["robotika"]));
    expect((await subscribedClubs()).sort()).toEqual(["dron", "robotika"]);
    expect(
      (await clubSubscribersOf("robotika")).map((s) => s.endpoint).sort(),
    ).toEqual(["https://push/1", "https://push/2"]);
    //* A szakkör nem órarend-alany: az osztályok indexébe nem kerül.
    expect(await subscribedSubjects("class")).toEqual([]);
  });

  test("a levett szakkörből kikerül, a törléssel mindből", async () => {
    await saveSubscription(withClubs("https://push/1", ["robotika", "dron"]));
    await saveSubscription(withClubs("https://push/1", ["dron"]));
    expect(await clubSubscribersOf("robotika")).toEqual([]);
    await removeSubscription("https://push/1");
    expect(await clubSubscribersOf("dron")).toEqual([]);
  });

  test("a régi, szakkör nélküli sor sem hibázik", async () => {
    await saveSubscription(sub("https://push/1", ["12A"]));
    await removeSubscription("https://push/1");
    expect(await subscribedClubs()).toEqual([]);
  });

  test("egy alkalomra egyszer szól, egy változásra egyszer", async () => {
    expect(await leaseClubReminder("s1:2026-09-24")).toBe(true);
    expect(await leaseClubReminder("s1:2026-09-24")).toBe(false);
    expect(await leaseClubChange("robotika", "a|b")).toBe(true);
    expect(await leaseClubChange("robotika", "a|b")).toBe(false);
  });

  test("a kiesett alkalmak lenyomata hetenként", async () => {
    expect(await readClubGone("robotika", "2026-09-21")).toBeNull();
    await writeClubGone("robotika", "2026-09-21", ["a"]);
    expect(await readClubGone("robotika", "2026-09-21")).toEqual(["a"]);
    expect(await readClubGone("robotika", "2026-09-28")).toBeNull();
  });
});
