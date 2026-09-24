import { afterEach, describe, expect, test } from "bun:test";
import { installBrowser, uninstallBrowser } from "@/test/browser";
import {
  accentSeedHash,
  appearanceScript,
  applyAppearance,
  DEFAULT_PALETTE,
  DEFAULT_THEME,
  isPalette,
  isTheme,
  loadPalette,
  loadTheme,
  PALETTE_ACCENT,
  PALETTE_HUE,
  PALETTE_META,
  PALETTE_STORAGE_KEY,
  PALETTES,
  resolveTheme,
  savePalette,
  saveTheme,
  THEME_STORAGE_KEY,
  THEMES,
} from "./appearance";

afterEach(uninstallBrowser);

describe("őrök", () => {
  test("téma és paletta", () => {
    for (const t of THEMES) expect(isTheme(t)).toBe(true);
    for (const p of PALETTES) expect(isPalette(p)).toBe(true);
    expect(isTheme("sepia")).toBe(false);
    expect(isPalette("ciklus ")).toBe(false);
    expect(isTheme(DEFAULT_THEME)).toBe(true);
    expect(isPalette(DEFAULT_PALETTE)).toBe(true);
  });

  test("minden palettának van felirata", () => {
    for (const p of PALETTES) expect(PALETTE_META[p].label).toBeTruthy();
  });
});

describe("resolveTheme", () => {
  test("a konkrét választás önmaga", () => {
    expect(resolveTheme("light")).toBe("light");
    expect(resolveTheme("dark")).toBe("dark");
  });

  test("rendszer: szerveren sötét, böngészőben a média-lekérdezés", () => {
    expect(resolveTheme("system")).toBe("dark");
    installBrowser({ media: { "(prefers-color-scheme: dark)": false } });
    expect(resolveTheme("system")).toBe("light");
    installBrowser({ media: { "(prefers-color-scheme: dark)": true } });
    expect(resolveTheme("system")).toBe("dark");
  });
});

describe("accentSeedHash és a paletták", () => {
  test("determinisztikus, 32 bites előjel nélküli", () => {
    expect(accentSeedHash("")).toBe(0);
    expect(accentSeedHash("a")).toBe(97);
    expect(accentSeedHash("ab")).toBe(97 * 31 + 98);
    const long = accentSeedHash("Digitális kultúra".repeat(20));
    expect(long).toBeGreaterThanOrEqual(0);
    expect(long).toBeLessThan(2 ** 32);
    expect(Number.isInteger(long)).toBe(true);
  });

  test("ugyanaz a mag mindig ugyanazt a színt adja, 0–360 között", () => {
    for (const p of PALETTES) {
      for (const seed of ["mat", "tör", "Fizika", "x"]) {
        const a = PALETTE_ACCENT[p](seed);
        expect(PALETTE_ACCENT[p](seed)).toEqual(a);
        expect(a.h).toBeGreaterThanOrEqual(0);
        expect(a.h).toBeLessThan(360);
        expect(PALETTE_HUE[p](seed)).toBe(a.h);
      }
    }
  });

  test("a régi paletták szorzó és eltolás nélküliek", () => {
    for (const p of ["ciklus", "prizma", "nyugodt"] as const) {
      const a = PALETTE_ACCENT[p]("mat");
      expect(a.c).toBe(1);
      expect(a.l).toBe(0);
    }
  });
});

describe("tárolás", () => {
  test("oda-vissza, felesleges írás nélkül", () => {
    const b = installBrowser();
    expect(loadTheme()).toBeNull();
    expect(loadPalette()).toBeNull();
    saveTheme("light");
    saveTheme("light");
    savePalette("alkony");
    expect(loadTheme()).toBe("light");
    expect(loadPalette()).toBe("alkony");
    expect(b.events).toHaveLength(2);
  });

  test("ismeretlen tárolt érték: null", () => {
    const b = installBrowser();
    b.localStorage.setItem(THEME_STORAGE_KEY, "sepia");
    b.localStorage.setItem(PALETTE_STORAGE_KEY, "neon");
    expect(loadTheme()).toBeNull();
    expect(loadPalette()).toBeNull();
  });

  test("dobó tárhely", () => {
    const b = installBrowser();
    b.localStorage.broken = true;
    expect(loadTheme()).toBeNull();
    expect(loadPalette()).toBeNull();
    expect(() => saveTheme("dark")).not.toThrow();
    expect(() => savePalette("nyar")).not.toThrow();
  });
});

describe("applyAppearance", () => {
  test("szerveren nem dob", () => {
    expect(() => applyAppearance("dark", "ciklus")).not.toThrow();
  });

  test("a <html> osztálya, adatai és color-scheme-je", () => {
    const b = installBrowser({
      media: { "(prefers-color-scheme: dark)": false },
    });
    const root = b.document.documentElement;
    applyAppearance("dark", "prizma");
    expect(root.classList.contains("dark")).toBe(true);
    expect(root.dataset.theme).toBe("dark");
    expect(root.dataset.palette).toBe("prizma");
    expect(root.style.colorScheme).toBe("dark");
    applyAppearance("system", "nyar");
    expect(root.classList.contains("dark")).toBe(false);
    expect(root.dataset.theme).toBe("system");
    expect(root.style.colorScheme).toBe("light");
  });
});

describe("appearanceScript", () => {
  //* A festés előtti szkriptet ugyanazon a hamis böngészőn futtatjuk, mint
  //* amit az `applyAppearance` lát — a kettőnek ugyanazt kell eredményeznie.
  function run(storage: Record<string, string>, dark: boolean) {
    const b = installBrowser({
      media: { "(prefers-color-scheme: dark)": dark },
    });
    for (const [k, v] of Object.entries(storage)) b.localStorage.setItem(k, v);
    const g = globalThis as Record<string, unknown>;
    g.matchMedia = b.window.matchMedia;
    try {
      new Function(appearanceScript())();
    } finally {
      delete g.matchMedia;
    }
    return b.document.documentElement;
  }

  test("érvényes szintaxis, dobás nélkül", () => {
    expect(() => new Function(appearanceScript())).not.toThrow();
  });

  test("tárolt választás alkalmazása", () => {
    const root = run(
      { [THEME_STORAGE_KEY]: "light", [PALETTE_STORAGE_KEY]: "alkony" },
      true,
    );
    expect(root.classList.contains("dark")).toBe(false);
    expect(root.dataset.theme).toBe("light");
    expect(root.dataset.palette).toBe("alkony");
    expect(root.style.colorScheme).toBe("light");
  });

  test("szemét érték: alapértelmezés, a rendszer témájával", () => {
    const root = run(
      { [THEME_STORAGE_KEY]: "x", [PALETTE_STORAGE_KEY]: "y" },
      true,
    );
    expect(root.dataset.theme).toBe(DEFAULT_THEME);
    expect(root.dataset.palette).toBe(DEFAULT_PALETTE);
    expect(root.classList.contains("dark")).toBe(true);
  });
});
