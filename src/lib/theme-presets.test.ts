import { afterEach, describe, expect, test } from "bun:test";
import { json, stubFetch } from "@/test/browser";
import {
  DEFAULT_PRESET,
  getThemePresetCss,
  getThemePresets,
  getThemePresetTokens,
  getThemePreviewCss,
  isValidPresetSlug,
  THEME_REGISTRY_TAG,
  themePresetTag,
} from "./theme-presets";

let restore = () => {};
afterEach(() => restore());
function serve(handler: Parameters<typeof stubFetch>[0]) {
  const stub = stubFetch(handler);
  restore = stub.restore;
  return stub;
}

describe("isValidPresetSlug", () => {
  test.each([
    ["catppuccin", true],
    ["t3-chat", true],
    ["0x", true],
    ["-rossz", false],
    ["Nagy", false],
    ["../registry", false],
    ["a".repeat(50), false],
    ["", false],
  ])("%s → %p", (slug, ok) => {
    expect(isValidPresetSlug(slug)).toBe(ok);
  });
});

describe("getThemePresetTokens — a szűrő", () => {
  test("csak engedélyezett tokenek, biztonságos értékkel", async () => {
    serve(() =>
      json({
        cssVars: {
          theme: { radius: "0.5rem", "font-sans": "Comic Sans" },
          light: {
            background: " oklch(1 0 0) ",
            primary: "red;} body{display:none",
            accent: "url(https://evil.test/x.png)",
            secondary: "image-set('x.png' 1x)",
            muted: "expression(alert(1))",
            border: "@import 'x'",
            ring: "a\\62 c",
            input: "<script>",
            "chart-1": "x".repeat(201),
            "chart-2": 42,
            "acc-h": "120",
            "made-up": "blue",
            card: "",
          },
          dark: { background: "oklch(0.2 0 0)" },
        },
      }),
    );
    expect(await getThemePresetTokens("valami")).toEqual({
      base: { radius: "0.5rem" },
      light: { background: "oklch(1 0 0)" },
      dark: { background: "oklch(0.2 0 0)" },
    });
  });

  test("az alapértelmezett és az érvénytelen slug hálózat nélkül üres", async () => {
    const { calls } = serve(() => json({}));
    const empty = { base: {}, light: {}, dark: {} };
    expect(await getThemePresetTokens(DEFAULT_PRESET)).toEqual(empty);
    expect(await getThemePresetTokens("../x")).toEqual(empty);
    expect(await getThemePresetTokens("")).toEqual(empty);
    expect(calls).toHaveLength(0);
  });

  test("a lekérés a slug címkéjével gyorsítótárazódik", async () => {
    const { calls } = serve(() => json({}));
    await getThemePresetTokens("nord");
    expect(calls[0].url).toBe("https://tweakcn.com/r/themes/nord.json");
    expect(
      (calls[0].init as { next?: { tags?: string[] } }).next?.tags,
    ).toEqual([themePresetTag("nord")]);
  });

  test("hiba: üres", async () => {
    serve(() => new Response("", { status: 404 }));
    expect(await getThemePresetTokens("nord")).toEqual({
      base: {},
      light: {},
      dark: {},
    });
    restore();
    serve(() => {
      throw new Error("offline");
    });
    expect(await getThemePresetTokens("nord")).toEqual({
      base: {},
      light: {},
      dark: {},
    });
  });
});

describe("CSS", () => {
  const tokens = {
    cssVars: {
      theme: { radius: "1rem" },
      light: { background: "white", primary: "blue" },
      dark: { background: "black" },
    },
  };

  test("éles: :root és .dark", async () => {
    serve(() => json(tokens));
    expect(await getThemePresetCss("x")).toBe(
      ":root{--radius:1rem;--background:white;--primary:blue}.dark{--background:black}",
    );
  });

  test("előnézet: duplázott szelektor, ugyanazokkal a tokenekkel", async () => {
    serve(() => json(tokens));
    expect(await getThemePreviewCss("x")).toBe(
      ":root:root{--radius:1rem;--background:white;--primary:blue}.dark.dark{--background:black}",
    );
  });

  test("csak sötét tokenek, vagy semmi", async () => {
    serve(() => json({ cssVars: { dark: { ring: "gray" } } }));
    expect(await getThemePresetCss("x")).toBe(".dark{--ring:gray}");
    restore();
    serve(() => json({ cssVars: { light: { hero: "x" } } }));
    expect(await getThemePresetCss("x")).toBe("");
  });
});

describe("getThemePresets", () => {
  test("érvényes slugok, cím-tartalékkal, szűrt mintaszínekkel", async () => {
    const { calls } = serve(() =>
      json({
        items: [
          {
            name: "nord",
            title: "Nord",
            description: "Hideg",
            cssVars: {
              light: {
                background: "a",
                primary: "b",
                accent: "url(x)",
                secondary: "d",
              },
              dark: { background: "e" },
            },
          },
          { name: "cím-nélkül" },
          { name: "Rossz Slug" },
          { title: "nincs név" },
        ],
      }),
    );
    expect(await getThemePresets()).toEqual([
      {
        slug: "nord",
        title: "Nord",
        description: "Hideg",
        swatch: { light: ["a", "b", "d"], dark: ["e"] },
      },
    ]);
    expect(
      (calls[0].init as { next?: { tags?: string[] } }).next?.tags,
    ).toEqual([THEME_REGISTRY_TAG]);
  });

  test("a slug a cím, ha nincs cím", async () => {
    serve(() => json({ items: [{ name: "plain" }] }));
    expect((await getThemePresets())[0]).toMatchObject({
      slug: "plain",
      title: "plain",
      description: undefined,
    });
  });

  test("hiba: üres lista", async () => {
    serve(() => new Response("", { status: 500 }));
    expect(await getThemePresets()).toEqual([]);
  });
});
