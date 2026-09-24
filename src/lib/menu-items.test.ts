import { afterEach, describe, expect, test } from "bun:test";
import { installBrowser, uninstallBrowser } from "@/test/browser";
import {
  DEFAULT_HIDDEN_MENU,
  isMenuItemId,
  loadHiddenMenu,
  MENU_GROUP_TITLE,
  MENU_HIDDEN_STORAGE_KEY,
  MENU_ITEMS,
  sanitizeHiddenMenu,
  saveHiddenMenu,
} from "./menu-items";

describe("a lista szerződései", () => {
  test("egyedi jelek, minden csoportnak van címe", () => {
    const ids = MENU_ITEMS.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const item of MENU_ITEMS) {
      expect(MENU_GROUP_TITLE[item.group]).toBeTruthy();
      expect(item.label.length).toBeGreaterThan(0);
    }
  });

  test("az alapból rejtett sorok ismert jelek", () => {
    for (const id of DEFAULT_HIDDEN_MENU) expect(isMenuItemId(id)).toBe(true);
  });
});

describe("sanitizeHiddenMenu", () => {
  test("nem tömb: üres", () => {
    expect(sanitizeHiddenMenu("duty")).toEqual([]);
    expect(sanitizeHiddenMenu(null)).toEqual([]);
    expect(sanitizeHiddenMenu({ 0: "duty" })).toEqual([]);
  });

  test("ismeretlen és duplikált jel ki, sorrend a MENU_ITEMS-é", () => {
    expect(
      sanitizeHiddenMenu(["screens", "duty", "nope", 3, "duty", "merge"]),
    ).toEqual(["merge", "duty", "screens"]);
  });

  test("ugyanaz a halmaz más sorrendben ugyanazt adja", () => {
    expect(sanitizeHiddenMenu(["home", "legend"])).toEqual(
      sanitizeHiddenMenu(["legend", "home"]),
    );
  });
});

describe("tárolás", () => {
  afterEach(uninstallBrowser);

  test("szerveren null és néma", () => {
    expect(loadHiddenMenu()).toBeNull();
    expect(() => saveHiddenMenu(["duty"])).not.toThrow();
  });

  test("üres tároló: null (= alapértelmezés), mentés után a rendezett lista", () => {
    const b = installBrowser();
    expect(loadHiddenMenu()).toBeNull();
    saveHiddenMenu(["rooms", "merge"]);
    expect(loadHiddenMenu()).toEqual(["merge", "rooms"]);
    expect(b.localStorage.getItem(MENU_HIDDEN_STORAGE_KEY)).toBe(
      '["merge","rooms"]',
    );
  });

  test("azonos tartalomra nincs új írás és jelzés", () => {
    const b = installBrowser();
    saveHiddenMenu(["merge", "rooms"]);
    saveHiddenMenu(["rooms", "merge"]);
    expect(b.events).toHaveLength(1);
  });

  test("hibás JSON: null", () => {
    const b = installBrowser();
    b.localStorage.setItem(MENU_HIDDEN_STORAGE_KEY, "{nem json");
    expect(loadHiddenMenu()).toBeNull();
  });

  test("a mentett szemét tisztítva jön vissza", () => {
    const b = installBrowser();
    b.localStorage.setItem(MENU_HIDDEN_STORAGE_KEY, '["x","duty"]');
    expect(loadHiddenMenu()).toEqual(["duty"]);
  });
});
