import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { type FakeBrowser, installBrowser, uninstallBrowser } from "@/test/browser";
import { DEFAULT_FLOOD, FLOOD_STORAGE_KEY, loadFlood, saveFlood } from "./flood-pref";

let b: FakeBrowser;
beforeEach(() => {
  b = installBrowser();
});
afterEach(uninstallBrowser);

describe("flood-pref", () => {
  test("alapból kikapcsolva", () => {
    expect(DEFAULT_FLOOD).toBe(false);
    expect(loadFlood()).toBe(false);
  });

  test("bekapcsolás „on”-t ír, kikapcsolás törli a kulcsot", () => {
    saveFlood(true);
    expect(b.localStorage.getItem(FLOOD_STORAGE_KEY)).toBe("on");
    expect(loadFlood()).toBe(true);
    saveFlood(false);
    expect(b.localStorage.getItem(FLOOD_STORAGE_KEY)).toBeNull();
    expect(loadFlood()).toBe(false);
  });

  test("csak valódi változáskor jelez", () => {
    saveFlood(false);
    expect(b.events).toEqual([]);
    saveFlood(true);
    saveFlood(true);
    expect(b.events).toEqual(["orarend:prefs-changed"]);
  });

  test("ismeretlen érték = kikapcsolva", () => {
    b.localStorage.setItem(FLOOD_STORAGE_KEY, "true");
    expect(loadFlood()).toBe(false);
  });

  test("dobó tárhely: alapérték, és nem dob", () => {
    b.localStorage.broken = true;
    expect(loadFlood()).toBe(DEFAULT_FLOOD);
    expect(() => saveFlood(true)).not.toThrow();
  });
});
