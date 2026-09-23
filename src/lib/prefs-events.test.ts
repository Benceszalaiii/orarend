import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { installBrowser, uninstallBrowser } from "@/test/browser";
import { notifyPrefsChanged, onPrefsChanged } from "./prefs-events";

describe("szerveren (nincs window)", () => {
  test("a jelzés nem dob, a feliratkozás üres leiratkozót ad", () => {
    expect(() => notifyPrefsChanged()).not.toThrow();
    const off = onPrefsChanged(() => {});
    expect(typeof off).toBe("function");
    expect(() => off()).not.toThrow();
  });
});

describe("böngészőben", () => {
  beforeEach(() => installBrowser());
  afterEach(uninstallBrowser);

  test("a saját lap jelzése eljut a figyelőhöz", () => {
    let calls = 0;
    const off = onPrefsChanged(() => calls++);
    notifyPrefsChanged();
    notifyPrefsChanged();
    expect(calls).toBe(2);
    off();
  });

  test("a másik fül `storage` eseménye is ébreszt", () => {
    let calls = 0;
    const off = onPrefsChanged(() => calls++);
    window.dispatchEvent(new Event("storage"));
    expect(calls).toBe(1);
    off();
  });

  test("leiratkozás után mindkét forrás elhallgat", () => {
    let calls = 0;
    const off = onPrefsChanged(() => calls++);
    off();
    notifyPrefsChanged();
    window.dispatchEvent(new Event("storage"));
    expect(calls).toBe(0);
  });
});
