import { afterEach, describe, expect, test } from "bun:test";
import { installBrowser, uninstallBrowser } from "@/test/browser";
import {
  DEFAULT_VIEW,
  isViewRoute,
  LAST_VIEW_COOKIE,
  loadLastView,
  saveLastView,
  VIEW_ROUTES,
} from "./last-view";

afterEach(uninstallBrowser);

describe("isViewRoute", () => {
  test("csak ismert nézet", () => {
    for (const route of VIEW_ROUTES) expect(isViewRoute(route)).toBe(true);
    expect(isViewRoute("/admin")).toBe(false);
    expect(isViewRoute("")).toBe(false);
    expect(isViewRoute(null)).toBe(false);
    expect(isViewRoute(undefined)).toBe(false);
    expect(isViewRoute(DEFAULT_VIEW)).toBe(true);
  });
});

describe("a süti neve", () => {
  test("nincs benne kettőspont", () => {
    expect(LAST_VIEW_COOKIE).not.toContain(":");
  });
});

describe("loadLastView / saveLastView", () => {
  test("üres és ismeretlen emlék: null", () => {
    const b = installBrowser();
    expect(loadLastView()).toBeNull();
    b.localStorage.setItem("orarend:last-view:v1", "/nincs-ilyen");
    expect(loadLastView()).toBeNull();
  });

  test("mentés: süti ÉS localStorage, jelzéssel", () => {
    const b = installBrowser();
    saveLastView("/ma");
    expect(loadLastView()).toBe("/ma");
    expect(b.document.cookies).toHaveLength(1);
    const cookie = b.document.cookies[0];
    expect(cookie.startsWith(`${LAST_VIEW_COOKIE}=/ma;`)).toBe(true);
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Secure");
    expect(cookie).toMatch(/Max-Age=34560000/);
    expect(b.events).toEqual(["orarend:prefs-changed"]);
  });

  test("http-n nincs Secure (helyi fejlesztés)", () => {
    const b = installBrowser({ protocol: "http:" });
    saveLastView("/tanari");
    expect(b.document.cookies[0]).not.toContain("Secure");
  });

  //! A süti előbb íródik: a dobó localStorage nem viheti el.
  test("dobó tárhely mellett a süti megmarad", () => {
    const b = installBrowser();
    b.localStorage.broken = true;
    expect(() => saveLastView("/orarend")).not.toThrow();
    expect(b.document.cookies).toHaveLength(1);
    expect(loadLastView()).toBeNull();
  });
});
