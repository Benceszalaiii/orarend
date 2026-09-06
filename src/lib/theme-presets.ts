import "server-only";

//! ═══════════════════════════════════════════════════════════════════════════
//! FELHASZNÁLÓNKÉNTI PALETTA — tweakcn-presetek
//! ═══════════════════════════════════════════════════════════════════════════
//! A `globals.css` tweakcn-exportot hord (`:root` / `.dark` blokk). Ez a modul
//! UGYANEZEKET a tokeneket kéri le a tweakcn shadcn-regiszteréből, és a
//! kiválasztott preset értékeivel felülírja őket a dokumentumba ágyazott
//! `<style>`-ban. A CSS kaszkád intézi a többit: a beágyazott blokk a
//! stíluslap UTÁN jön, tehát nyer.
//!
//! //! MIÉRT NEM A BÖNGÉSZŐBEN, MINT A TÉMA ÉS A PALETTA. Mert ez a CSS
//! //! HARMADIK FÉLTŐL jön. A világos/sötét és a tantárgyszínek a mi
//! //! képleteink, azokat nyugodtan bízzuk a kliensre; egy idegen kiszolgáló
//! //! válaszát viszont MEG KELL SZŰRNI, mielőtt `<style>`-ba kerül, és a
//! //! szűrőnek ott a helye, ahol nem lehet megkerülni. Ennek az ára, hogy a
//! //! preset belépéshez kötött, és hogy a gyökérelrendezés kérésenként
//! //! rendereldik — a lap többi beállítása ettől függetlenül statikus marad.
//!
//! MI MARAD ÉRINTETLEN — és miért:
//! • `--brand`, `--brand-foreground`, `--hero*`, `--ink-on-primary`: a lap
//!   márkajelei. A piros CSELEKVÉST jelöl (a „most" vonala, a mai nap); ha egy
//!   preset felülírná, ugyanaz a jelölés témánként mást jelentene.
//! • `--font-*`: a betűket a `next/font` tölti (Geist + Lexend + Petit Formal
//!   Script). Egy preset „Inter, sans-serif"-je olyan fájlra hivatkozna, amit
//!   sosem töltünk be — a lap a rendszerbetűre esne vissza.
//! • `--acc-h` és a `--h-*` tokenek: a tantárgyszínek a MI palettáink dolga
//!   (`lib/appearance.ts`). Egy preset ide nyúlva kiütné a felhasználó saját,
//!   külön megválasztott palettáját.
//!
//! //! BIZTONSÁG: ha a tweakcn végpontja valaha kompromittálódik, a válaszuk a
//! //! mi oldalunkon `<style>`-ba kerülne — a CSS pedig képes adatot
//! //! szivárogtatni (attribútum-szelektor + `url()` háttérkép). Ezért a válasz
//! //! SOSEM megy át nyersen: szűrjük a tokenneveket (engedélyezőlista) és az
//! //! értékeket (karakter-tiltólista), és minden ismeretlen mezőt eldobunk.
//! ═══════════════════════════════════════════════════════════════════════════

const REGISTRY_URL = "https://tweakcn.com/r/registry.json";
const PRESET_URL = (slug: string) =>
  `https://tweakcn.com/r/themes/${slug}.json`;

//* A regiszter ritkán változik; a napi újratöltés bőven elég. A címke
//* (`revalidateTag`) adja a kézi ürítést, ha egy preset frissül.
export const THEME_REGISTRY_TAG = "tweakcn-registry";
export const themePresetTag = (slug: string) => `tweakcn-preset:${slug}`;
const ONE_DAY = 60 * 60 * 24;

//* Az alapértelmezés a `globals.css`-be épített paletta — ilyenkor NEM
//* ágyazunk be semmit, tehát nulla a többletköltsége annak, aki nem választ.
export const DEFAULT_PRESET = "orarend";

export type ThemePreset = {
  slug: string;
  title: string;
  description?: string;
  //* Előnézeti pöttyök a választóban — a preset saját színeivel.
  swatch: { light: string[]; dark: string[] };
};

//! CSAK EZEKET A TOKENEKET ÍRJUK FELÜL. Az `@theme inline` blokk
//! (`globals.css`) pontosan ezeket köti Tailwind-osztályokhoz — ami nincs a
//! listán, annak a beágyazása vagy hatástalan lenne, vagy a saját
//! rendszerünkbe nyúlna bele.
const ALLOWED_TOKENS = new Set([
  "background",
  "foreground",
  "card",
  "card-foreground",
  "popover",
  "popover-foreground",
  "primary",
  "primary-foreground",
  "secondary",
  "secondary-foreground",
  "muted",
  "muted-foreground",
  "accent",
  "accent-foreground",
  "destructive",
  "destructive-foreground",
  "border",
  "input",
  "ring",
  "chart-1",
  "chart-2",
  "chart-3",
  "chart-4",
  "chart-5",
  "radius",
  "spacing",
]);

//! AMI SOHA NEM JÖHET PRESETBŐL (akkor sem, ha egyszer felkerülne a fenti
//! listára egy elírás miatt): a márkajelek, a betűk és a tantárgyszínek.
const BLOCKED_TOKENS = new Set([
  "brand",
  "brand-foreground",
  "ink-on-primary",
  "hero",
  "hero-foreground",
  "hero-crest-glow",
  "hero-crest-aura",
  "font-sans",
  "font-mono",
  "font-script",
  "font-display",
  "acc-h",
  "h-ciklus",
  "h-prizma",
  "h-nyugodt",
]);

//! Egy CSS-érték nem tartalmazhat olyan karaktert, amivel ki lehet lépni a
//! deklarációból (`;`, `}`), új szabályt lehet nyitni (`{`, `@`), külső kérést
//! lehet indítani (`url(`, `image-set(`) vagy HTML-t lehet zárni (`<`).
const UNSAFE_VALUE =
  /[;{}<>\\]|url\s*\(|image-set\s*\(|@import|expression\s*\(/i;
const MAX_VALUE_LENGTH = 200;

//* A slug URL-be és gyorsítótár-címkébe kerül, ezért szigorú: csak kisbetű,
//* szám, kötőjel. (A regiszterbeli létezést a hívó külön ellenőrzi.)
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,48}$/;

export function isValidPresetSlug(slug: string): boolean {
  return SLUG_RE.test(slug);
}

type RegistryItem = {
  name?: unknown;
  title?: unknown;
  description?: unknown;
  cssVars?: {
    theme?: Record<string, unknown>;
    light?: Record<string, unknown>;
    dark?: Record<string, unknown>;
  };
};

function sanitizeVars(
  raw: Record<string, unknown> | undefined,
): [string, string][] {
  if (!raw) return [];

  const out: [string, string][] = [];

  for (const [key, value] of Object.entries(raw)) {
    const token = key.trim();

    if (BLOCKED_TOKENS.has(token)) continue;
    if (!ALLOWED_TOKENS.has(token)) continue;
    if (typeof value !== "string") continue;

    const clean = value.trim();
    if (!clean || clean.length > MAX_VALUE_LENGTH) continue;
    if (UNSAFE_VALUE.test(clean)) continue;

    out.push([token, clean]);
  }

  return out;
}

function declarations(vars: [string, string][]): string {
  return vars.map(([k, v]) => `--${k}:${v}`).join(";");
}

/**
 * A választóhoz: a tweakcn regiszter preset-listája (név, cím, előnézeti
 * színek). Napi újratöltéssel gyorsítótárazva — a lista lassan változik.
 */
export async function getThemePresets(): Promise<ThemePreset[]> {
  try {
    const res = await fetch(REGISTRY_URL, {
      next: { revalidate: ONE_DAY, tags: [THEME_REGISTRY_TAG] },
    });
    if (!res.ok) return [];

    const data = (await res.json()) as { items?: RegistryItem[] };

    return (data.items ?? [])
      .filter(
        (item): item is RegistryItem & { name: string } =>
          typeof item.name === "string" && isValidPresetSlug(item.name),
      )
      .map((item) => {
        const light = Object.fromEntries(sanitizeVars(item.cssVars?.light));
        const dark = Object.fromEntries(sanitizeVars(item.cssVars?.dark));
        const pick = (v: Record<string, string>) =>
          [v.background, v.primary, v.accent, v.secondary].filter(
            (c): c is string => !!c,
          );

        return {
          slug: item.name,
          title:
            typeof item.title === "string" && item.title
              ? item.title
              : item.name,
          description:
            typeof item.description === "string" ? item.description : undefined,
          swatch: { light: pick(light), dark: pick(dark) },
        };
      });
  } catch {
    //* A preset dísz, nem funkció: ha a tweakcn nem elérhető, a választó üresen
    //* marad, és mindenki a beépített palettán marad. Nem dobunk.
    return [];
  }
}

export type PresetTokens = {
  //* Téma-független tokenek (radius, spacing) — a `:root`-ba mennek.
  base: Record<string, string>;
  light: Record<string, string>;
  dark: Record<string, string>;
};

const EMPTY_TOKENS: PresetTokens = { base: {}, light: {}, dark: {} };

/**
 * Egy preset MEGSZŰRT tokenjei. Minden fogyasztó ezen az EGY lekérésen és EGY
 * szűrőn megy át; ha valaha külön útra kerülnének, a szűrő megkerülhetővé
 * válna.
 */
export async function getThemePresetTokens(
  slug: string,
): Promise<PresetTokens> {
  if (!slug || slug === DEFAULT_PRESET || !isValidPresetSlug(slug)) {
    return EMPTY_TOKENS;
  }

  try {
    const res = await fetch(PRESET_URL(slug), {
      next: { revalidate: ONE_DAY, tags: [themePresetTag(slug)] },
    });
    if (!res.ok) return EMPTY_TOKENS;

    const data = (await res.json()) as RegistryItem;

    return {
      base: Object.fromEntries(sanitizeVars(data.cssVars?.theme)),
      light: Object.fromEntries(sanitizeVars(data.cssVars?.light)),
      dark: Object.fromEntries(sanitizeVars(data.cssVars?.dark)),
    };
  } catch {
    return EMPTY_TOKENS;
  }
}

//* A tokenekből CSS. A szelektorok azért paraméterek, mert a két fogyasztónak
//* KÜLÖNBÖZŐ SÚLY kell ugyanabból a tartalomból (lásd a két hívót alább) — a
//* tokenek forrása és szűrése viszont közös marad.
function buildCss(
  tokens: PresetTokens,
  rootSelector: string,
  darkSelector: string,
): string {
  const rootVars = [
    ...Object.entries(tokens.base),
    ...Object.entries(tokens.light),
  ];
  const darkVars = Object.entries(tokens.dark);

  if (!rootVars.length && !darkVars.length) return "";

  const blocks: string[] = [];
  if (rootVars.length)
    blocks.push(`${rootSelector}{${declarations(rootVars)}}`);
  if (darkVars.length)
    blocks.push(`${darkSelector}{${declarations(darkVars)}}`);

  return blocks.join("");
}

/**
 * Egy preset beágyazható CSS-e. Üres sztringet ad, ha a slug ismeretlen, a
 * tweakcn nem válaszol, vagy semmi nem maradt a szűrés után — a hívó ilyenkor
 * egyszerűen nem rendereli a `<style>`-t.
 */
export async function getThemePresetCss(slug: string): Promise<string> {
  //! `.dark` UGYANAZ A SPECIFIKUSSÁG, mint a `globals.css`-ben — a sorrend
  //! dönt, és ez a blokk később jön, tehát nyer. A `dark` osztályt a festés
  //! előtti szkript teszi a `<html>`-re (`lib/appearance.ts`); a `@custom-variant`
  //! ehhez igazodik.
  //*
  //! A `:root` ÁG MOST MÁR VALÓDI VILÁGOS TÉMA. Amíg a lap csak sötétben
  //! futott, ez az ág néma volt; a világos mód óta a preset MINDKÉT
  //! olvasatában megszólal.
  return buildCss(await getThemePresetTokens(slug), ":root", ".dark");
}

/**
 * UGYANAZ a preset, de ELŐNÉZETRE: a választó ezt injektálja futásidőben,
 * amíg a felhasználó a listán lépked.
 *
 * A különbség egyetlen dolog: a SÚLY. A mentett preset `<style>`-ja a `<body>`
 * elején ül (`components/appearance/theme-style.tsx`), az előnézeti blokkot
 * viszont a kliens a `<head>`-be teszi — vagyis dokumentum-sorrendben ELŐBB.
 * Azonos specifikusság mellett a mentett blokk nyerne, és az előnézet néma
 * maradna. A duplázott szelektor (`:root:root`, `.dark.dark`) ugyanazt az
 * elemet célozza, csak eggyel nagyobb súllyal — így az előnézet a beszúrás
 * helyétől FÜGGETLENÜL érvényesül.
 *
 * //! Ugyanazon a `getThemePresetTokens`-en megy át, mint az éles CSS.
 */
export async function getThemePreviewCss(slug: string): Promise<string> {
  return buildCss(await getThemePresetTokens(slug), ":root:root", ".dark.dark");
}
