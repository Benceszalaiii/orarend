import { afterEach, describe, expect, test } from "bun:test";
import { FLOOD_STORAGE_KEY } from "@/lib/flood-pref";
import { installBrowser, uninstallBrowser } from "@/test/browser";
import { floodSupported, launchFlood, registerPillNav } from "./flood";

//! Az áradás maga DOM-animáció (clip-path, requestAnimationFrame) — azt itt
//! nem utánozzuk. Amit igen: a KAPU, ami eldönti, indulhat-e egyáltalán. Ha ez
//! téved, a lap vagy mozdulatlanul áll egy kattintás után, vagy kérés nélkül
//! árad (lásd `flood-pref.ts`: alapból kikapcsolva).

const g = globalThis as Record<string, unknown>;
const originalCss = g.CSS;
afterEach(() => {
  uninstallBrowser();
  g.CSS = originalCss;
});

function browser(
  options: { on?: boolean; reduced?: boolean; clipPath?: boolean } = {},
) {
  const b = installBrowser({
    media: { "(prefers-reduced-motion: reduce)": options.reduced === true },
  });
  if (options.on) b.localStorage.setItem(FLOOD_STORAGE_KEY, "on");
  g.CSS = { supports: () => options.clipPath !== false };
  return b;
}

describe("floodSupported", () => {
  test("szerveren nem", () => {
    expect(floodSupported()).toBe(false);
  });

  test("alapból (kérés nélkül) nem", () => {
    browser();
    expect(floodSupported()).toBe(false);
  });

  test("bekapcsolva igen", () => {
    browser({ on: true });
    expect(floodSupported()).toBe(true);
  });

  test("csökkentett mozgásnál soha", () => {
    browser({ on: true, reduced: true });
    expect(floodSupported()).toBe(false);
  });

  test("path() clip-path nélküli böngészőben nem", () => {
    browser({ on: true, clipPath: false });
    expect(floodSupported()).toBe(false);
  });
});

describe("launchFlood", () => {
  test("nem támogatottan false-t ad és nem navigál — a hívó navigál", () => {
    browser();
    let navigated = false;
    const el = {} as HTMLElement;
    expect(
      launchFlood({
        nav: el,
        cell: el,
        label: "Ma",
        navigate: () => {
          navigated = true;
        },
      }),
    ).toBe(false);
    expect(navigated).toBe(false);
  });
});

describe("registerPillNav", () => {
  test("a leiratkozó többször is hívható", () => {
    const off = registerPillNav({ isConnected: true } as HTMLElement);
    expect(() => {
      off();
      off();
    }).not.toThrow();
  });
});
