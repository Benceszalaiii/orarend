import { describe, expect, test } from "bun:test";
import {
  accentHue,
  accentStyle,
  chromaTokenName,
  hueTokenName,
  lightnessTokenName,
} from "./accent";
import { PALETTE_ACCENT, PALETTE_HUE, PALETTES } from "./appearance";

describe("tokennevek", () => {
  test("a paletta nevéből", () => {
    expect(hueTokenName("ciklus")).toBe("--h-ciklus");
    expect(chromaTokenName("alkony")).toBe("--c-alkony");
    expect(lightnessTokenName("nyar")).toBe("--l-nyar");
  });
});

describe("accentHue", () => {
  test("alapból a ciklus paletta", () => {
    expect(accentHue("mat")).toBe(PALETTE_HUE.ciklus("mat"));
    expect(accentHue("mat", "prizma")).toBe(PALETTE_HUE.prizma("mat"));
  });
});

describe("accentStyle", () => {
  const style = accentStyle("Fizika") as Record<string, number>;

  test("minden palettának kiírja a fokát", () => {
    for (const p of PALETTES) {
      expect(style[hueTokenName(p)]).toBe(PALETTE_ACCENT[p]("Fizika").h);
    }
  });

  //! Az `--acc-h`-t SOHA nem írhatja ki — azt a CSS választja.
  test("nincs --acc-h", () => {
    expect("--acc-h" in style).toBe(false);
  });

  test("a szorzó és az eltolás csak eltérő értéknél kerül ki", () => {
    for (const p of PALETTES) {
      const { c, l } = PALETTE_ACCENT[p]("Fizika");
      expect(chromaTokenName(p) in style).toBe(c !== 1);
      expect(lightnessTokenName(p) in style).toBe(l !== 0);
    }
    //* A régi három paletta kártyánként egyetlen bájttal sem nehezebb.
    for (const p of ["ciklus", "prizma", "nyugodt"] as const) {
      expect(chromaTokenName(p) in style).toBe(false);
      expect(lightnessTokenName(p) in style).toBe(false);
    }
  });
});
