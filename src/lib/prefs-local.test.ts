import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { type FakeBrowser, installBrowser, uninstallBrowser } from "@/test/browser";
import { loadPalette, loadTheme } from "./appearance";
import { loadDualSchedule } from "./dual-schedule";
import { loadIdentity } from "./identity";
import { loadLastView } from "./last-view";
import { loadHiddenMenu } from "./menu-items";
import {
  applyLocalPrefs,
  clearSyncMeta,
  collectLocalPrefs,
  loadSyncMeta,
  mergePrefs,
  saveSyncMeta,
} from "./prefs-local";
import { EMPTY_PREFS, type SyncedPrefs } from "./prefs-shared";
import { loadCachedClass, loadCachedTeacher, saveCachedClass } from "./timetable";
import { loadLocalPreferences, saveLocalPreferences } from "./timetable-merge";

describe("szerveren", () => {
  test("üres csomag, és az alkalmazás néma", () => {
    expect(collectLocalPrefs()).toEqual(EMPTY_PREFS);
    expect(() => applyLocalPrefs({ ...EMPTY_PREFS, class: "12A" })).not.toThrow();
  });
});

describe("böngészőben", () => {
  let b: FakeBrowser;
  beforeEach(() => {
    b = installBrowser();
  });
  afterEach(uninstallBrowser);

  test("collectLocalPrefs mindent összeszed és tisztít", () => {
    saveCachedClass("12A");
    b.localStorage.setItem("orarend:teacher:v1", "rossz tanár");
    b.localStorage.setItem("orarend:theme:v1", "dark");
    saveLocalPreferences("12A", [{ clusterKey: "k", chosen: "c" }]);
    expect(collectLocalPrefs()).toEqual({
      ...EMPTY_PREFS,
      class: "12A",
      theme: "dark",
      merge: { "12A": [{ clusterKey: "k", chosen: "c" }] },
    });
  });

  test("applyLocalPrefs visszaírja, és a megjelenést is alkalmazza", () => {
    const prefs: SyncedPrefs = {
      class: "10B",
      teacher: "LM",
      lastView: "/ma",
      identity: "teacher",
      theme: "light",
      palette: "nyar",
      merge: { "10B": [{ clusterKey: "k", chosen: "c" }] },
      dual: { "10B": { A: [1], B: [] } },
      hiddenMenu: ["duty", "rooms"],
    };
    applyLocalPrefs(prefs);
    expect(loadCachedClass()).toBe("10B");
    expect(loadCachedTeacher()).toBe("LM");
    expect(loadLastView()).toBe("/ma");
    expect(loadIdentity()).toBe("teacher");
    expect(loadTheme()).toBe("light");
    expect(loadPalette()).toBe("nyar");
    expect(loadLocalPreferences("10B")).toEqual([{ clusterKey: "k", chosen: "c" }]);
    expect(loadDualSchedule("10B")).toEqual({ A: [1], B: [] });
    expect(loadHiddenMenu()).toEqual(["duty", "rooms"]);
    expect(b.document.documentElement.dataset.palette).toBe("nyar");
    expect(b.document.documentElement.dataset.theme).toBe("light");
    //* Oda-vissza: amit alkalmaztunk, azt gyűjtjük be.
    expect(collectLocalPrefs()).toEqual(prefs);
  });

  test("a null mezők nem írnak felül", () => {
    saveCachedClass("12A");
    applyLocalPrefs({ ...EMPTY_PREFS });
    expect(loadCachedClass()).toBe("12A");
    expect(b.document.documentElement.dataset.theme).toBeUndefined();
  });

  test("csak a paletta jön: a helyi témával alkalmaz", () => {
    b.localStorage.setItem("orarend:theme:v1", "dark");
    applyLocalPrefs({ ...EMPTY_PREFS, palette: "alkony" });
    expect(b.document.documentElement.dataset.theme).toBe("dark");
    expect(b.document.documentElement.dataset.palette).toBe("alkony");
  });

  test("szinkron-jelölő oda-vissza, sérült: null", () => {
    expect(loadSyncMeta()).toBeNull();
    saveSyncMeta({ revision: 3, userId: "u1" });
    expect(loadSyncMeta()).toEqual({ revision: 3, userId: "u1" });
    clearSyncMeta();
    expect(loadSyncMeta()).toBeNull();
    b.localStorage.setItem("orarend:sync-meta:v1", JSON.stringify({ revision: "3", userId: "u1" }));
    expect(loadSyncMeta()).toBeNull();
    b.localStorage.setItem("orarend:sync-meta:v1", "{");
    expect(loadSyncMeta()).toBeNull();
  });

  test("dobó tárhely: a jelölő műveletei némák", () => {
    b.localStorage.broken = true;
    expect(loadSyncMeta()).toBeNull();
    expect(() => saveSyncMeta({ revision: 1, userId: "u" })).not.toThrow();
    expect(() => clearSyncMeta()).not.toThrow();
  });
});

describe("mergePrefs", () => {
  const local: SyncedPrefs = {
    ...EMPTY_PREFS,
    class: "12A",
    theme: "dark",
    merge: { "12A": [{ clusterKey: "l", chosen: "l" }], "10B": [{ clusterKey: "x", chosen: "x" }] },
  };
  const remote: SyncedPrefs = {
    ...EMPTY_PREFS,
    class: "13C",
    palette: "prizma",
    merge: { "12A": [{ clusterKey: "r", chosen: "r" }] },
    hiddenMenu: ["duty"],
  };

  test("mezőnként az újabb, ami hiányzik, a régebbiből", () => {
    expect(mergePrefs(local, remote, "local")).toEqual({
      ...EMPTY_PREFS,
      class: "12A",
      theme: "dark",
      palette: "prizma",
      merge: { "12A": [{ clusterKey: "l", chosen: "l" }], "10B": [{ clusterKey: "x", chosen: "x" }] },
      hiddenMenu: ["duty"],
    });
  });

  test("alanyonként az újabb lista nyer, a többi megmarad", () => {
    const merged = mergePrefs(local, remote, "remote");
    expect(merged.class).toBe("13C");
    expect(merged.merge).toEqual({
      "12A": [{ clusterKey: "r", chosen: "r" }],
      "10B": [{ clusterKey: "x", chosen: "x" }],
    });
  });
});
