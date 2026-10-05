import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  type FakeBrowser,
  installBrowser,
  uninstallBrowser,
} from "@/test/browser";
import {
  DEFAULT_FILL_SPLIT,
  FILL_SPLIT_STORAGE_KEY,
  loadFillSplit,
  saveFillSplit,
} from "./fill-split-pref";

let b: FakeBrowser;
beforeEach(() => {
  b = installBrowser();
});
afterEach(uninstallBrowser);

describe("fill-split-pref", () => {
  test("alapból kikapcsolva", () => {
    expect(DEFAULT_FILL_SPLIT).toBe(false);
    expect(loadFillSplit()).toBe(false);
  });

  test("bekapcsolás „on”-t ír, kikapcsolás törli a kulcsot", () => {
    saveFillSplit(true);
    expect(b.localStorage.getItem(FILL_SPLIT_STORAGE_KEY)).toBe("on");
    expect(loadFillSplit()).toBe(true);
    saveFillSplit(false);
    expect(b.localStorage.getItem(FILL_SPLIT_STORAGE_KEY)).toBeNull();
    expect(loadFillSplit()).toBe(false);
  });

  test("csak valódi változáskor jelez", () => {
    saveFillSplit(false);
    expect(b.events).toEqual([]);
    saveFillSplit(true);
    saveFillSplit(true);
    expect(b.events).toEqual(["orarend:prefs-changed"]);
  });

  test("ismeretlen érték = kikapcsolva", () => {
    b.localStorage.setItem(FILL_SPLIT_STORAGE_KEY, "true");
    expect(loadFillSplit()).toBe(false);
  });

  test("dobó tárhely: alapérték, és nem dob", () => {
    b.localStorage.broken = true;
    expect(loadFillSplit()).toBe(DEFAULT_FILL_SPLIT);
    expect(() => saveFillSplit(true)).not.toThrow();
  });
});
