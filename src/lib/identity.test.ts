import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  type FakeBrowser,
  installBrowser,
  uninstallBrowser,
} from "@/test/browser";
import {
  IDENTITY_STORAGE_KEY,
  isIdentity,
  loadIdentity,
  saveIdentity,
  weekRouteFor,
} from "./identity";

describe("isIdentity / weekRouteFor", () => {
  test("csak a két ismert alany", () => {
    expect(isIdentity("class")).toBe(true);
    expect(isIdentity("teacher")).toBe(true);
    expect(isIdentity("student")).toBe(false);
    expect(isIdentity(null)).toBe(false);
  });

  test("a Hét pirula alanyonként más útvonal", () => {
    expect(weekRouteFor("class")).toBe("/orarend");
    expect(weekRouteFor("teacher")).toBe("/tanari");
  });
});

describe("tárolás", () => {
  let b: FakeBrowser;
  beforeEach(() => {
    b = installBrowser();
  });
  afterEach(uninstallBrowser);

  test("üres tárolóban null", () => {
    expect(loadIdentity()).toBeNull();
  });

  test("oda-vissza, és csak változáskor jelez", () => {
    saveIdentity("teacher");
    saveIdentity("teacher");
    expect(loadIdentity()).toBe("teacher");
    expect(b.events).toHaveLength(1);
    saveIdentity("class");
    expect(loadIdentity()).toBe("class");
    expect(b.events).toHaveLength(2);
  });

  test("szemét érték = null", () => {
    b.localStorage.setItem(IDENTITY_STORAGE_KEY, "admin");
    expect(loadIdentity()).toBeNull();
  });

  test("dobó tárhely", () => {
    b.localStorage.broken = true;
    expect(loadIdentity()).toBeNull();
    expect(() => saveIdentity("class")).not.toThrow();
  });
});
