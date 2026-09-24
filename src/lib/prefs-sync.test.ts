import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  type FakeBrowser,
  installBrowser,
  json,
  stubFetch,
  uninstallBrowser,
} from "@/test/browser";
import { loadSyncMeta, saveSyncMeta } from "./prefs-local";
import { EMPTY_PREFS } from "./prefs-shared";
import {
  forgetSyncState,
  isApplyingSyncedPrefs,
  syncPrefs,
} from "./prefs-sync";
import { loadCachedClass, saveCachedClass } from "./timetable";

type Handler = (init?: RequestInit) => Response;
let b: FakeBrowser;
let stub: ReturnType<typeof stubFetch>;
let onGet: Handler;
let onPut: Handler[];
beforeEach(() => {
  b = installBrowser();
  onPut = [];
  stub = stubFetch((_, init) => {
    if (init?.method === "PUT") {
      const next = onPut.shift();
      if (!next) throw new Error("váratlan PUT");
      return next(init);
    }
    return onGet(init);
  });
});
afterEach(() => {
  stub.restore();
  uninstallBrowser();
});

const puts = () => stub.calls.filter((c) => c.init?.method === "PUT");
const putBody = (i: number) => JSON.parse(puts()[i].init?.body as string);

describe("syncPrefs", () => {
  test("kijelentkezett és hibás letöltés", async () => {
    onGet = () => new Response("", { status: 401 });
    expect(await syncPrefs("u1")).toEqual({ status: "signed-out" });
    onGet = () => new Response("", { status: 500 });
    expect(await syncPrefs("u1")).toEqual({ status: "error" });
    onGet = () => {
      throw new Error("offline");
    };
    expect(await syncPrefs("u1")).toEqual({ status: "error" });
  });

  test("üres készülék: a szerver beállításai jönnek le, feltöltés nélkül", async () => {
    onGet = () =>
      json({
        prefs: { ...EMPTY_PREFS, class: "12A" },
        revision: 4,
        updatedAt: "2026-09-01T00:00:00Z",
      });
    expect(await syncPrefs("u1")).toEqual({
      status: "ok",
      revision: 4,
      updatedAt: "2026-09-01T00:00:00Z",
    });
    expect(loadCachedClass()).toBe("12A");
    expect(puts()).toHaveLength(0);
    expect(loadSyncMeta()).toEqual({ revision: 4, userId: "u1" });
  });

  test("első szinkron ezen a fiókon: a helyi nyer, és felmegy", async () => {
    saveCachedClass("10B");
    onGet = () =>
      json({
        prefs: { ...EMPTY_PREFS, class: "12A", theme: "dark" },
        revision: 2,
        updatedAt: null,
      });
    onPut = [
      (init) =>
        json({
          prefs: JSON.parse(init?.body as string).prefs,
          revision: 3,
          updatedAt: "x",
        }),
    ];
    expect(await syncPrefs("u1")).toEqual({
      status: "ok",
      revision: 3,
      updatedAt: "x",
    });
    expect(putBody(0)).toMatchObject({
      baseRevision: 2,
      prefs: { class: "10B", theme: "dark" },
    });
    expect(loadCachedClass()).toBe("10B");
    expect(loadSyncMeta()).toEqual({ revision: 3, userId: "u1" });
  });

  test("a szerver újabb a legutóbbi szinkronnál: a távoli nyer", async () => {
    saveCachedClass("10B");
    saveSyncMeta({ revision: 1, userId: "u1" });
    onGet = () =>
      json({
        prefs: { ...EMPTY_PREFS, class: "12A" },
        revision: 5,
        updatedAt: null,
      });
    onPut = [
      (init) =>
        json({ prefs: JSON.parse(init?.body as string).prefs, revision: 6 }),
    ];
    const outcome = await syncPrefs("u1");
    expect(outcome.status).toBe("ok");
    expect(loadCachedClass()).toBe("12A");
  });

  test("más fiók jelölője nem számít", async () => {
    saveCachedClass("10B");
    saveSyncMeta({ revision: 99, userId: "másik" });
    onGet = () =>
      json({ prefs: { ...EMPTY_PREFS, class: "12A" }, revision: 5 });
    onPut = [
      (init) =>
        json({ prefs: JSON.parse(init?.body as string).prefs, revision: 6 }),
    ];
    await syncPrefs("u1");
    expect(putBody(0).prefs.class).toBe("10B");
  });

  test("ütközés: a friss szerverállapotra fésül, és egyszer újrapróbál", async () => {
    saveCachedClass("10B");
    onGet = () => json({ prefs: { ...EMPTY_PREFS }, revision: 1 });
    onPut = [
      () =>
        json(
          {
            current: { prefs: { ...EMPTY_PREFS, theme: "light" }, revision: 7 },
          },
          { status: 409 },
        ),
      (init) =>
        json({
          prefs: JSON.parse(init?.body as string).prefs,
          revision: 8,
          updatedAt: "y",
        }),
    ];
    expect(await syncPrefs("u1")).toEqual({
      status: "ok",
      revision: 8,
      updatedAt: "y",
    });
    expect(putBody(1)).toMatchObject({
      baseRevision: 7,
      prefs: { class: "10B", theme: "light" },
    });
    expect(b.localStorage.getItem("orarend:theme:v1")).toBe("light");
  });

  test("ismételt ütközés vagy hiba: error", async () => {
    saveCachedClass("10B");
    onGet = () => json({ prefs: EMPTY_PREFS, revision: 1 });
    onPut = [() => json({}, { status: 409 }), () => json({}, { status: 409 })];
    expect(await syncPrefs("u1")).toEqual({ status: "error" });
    onPut = [() => new Response("", { status: 500 })];
    expect(await syncPrefs("u1")).toEqual({ status: "error" });
  });

  test("kijelentkezés feltöltés közben", async () => {
    saveCachedClass("10B");
    onGet = () => json({ prefs: EMPTY_PREFS, revision: 1 });
    onPut = [() => new Response("", { status: 401 })];
    expect(await syncPrefs("u1")).toEqual({ status: "signed-out" });
  });

  test("a sérült szerverválasz üres beállításnak számít", async () => {
    onGet = () => json({ prefs: "szemét", revision: "x" });
    expect(await syncPrefs("u1")).toEqual({
      status: "ok",
      revision: 0,
      updatedAt: null,
    });
  });

  test("a szinkron alkalmazása alatt a jelző igaz, utána hamis", async () => {
    const seen: boolean[] = [];
    b.window.addEventListener("orarend:prefs-changed", () =>
      seen.push(isApplyingSyncedPrefs()),
    );
    onGet = () =>
      json({ prefs: { ...EMPTY_PREFS, class: "12A" }, revision: 1 });
    await syncPrefs("u1");
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every(Boolean)).toBe(true);
    expect(isApplyingSyncedPrefs()).toBe(false);
  });
});

describe("forgetSyncState", () => {
  test("csak a jelölőt dobja el, a beállításokat nem", () => {
    saveCachedClass("12A");
    saveSyncMeta({ revision: 1, userId: "u1" });
    forgetSyncState();
    expect(loadSyncMeta()).toBeNull();
    expect(loadCachedClass()).toBe("12A");
  });
});
