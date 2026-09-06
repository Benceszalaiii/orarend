import { notifyPrefsChanged } from "./prefs-events";

//! ═══════════════════════════════════════════════════════════════════════════
//! A MEGJELENÉS — VILÁGOS/SÖTÉT ÉS A TANTÁRGYSZÍNEK KÉPLETE
//! ═══════════════════════════════════════════════════════════════════════════
//! KÉT FÜGGETLEN TENGELY, EGY HELYEN LEÍRVA. A „téma" a FELÜLETRŐL szól (a lap
//! világos vagy sötét alapon áll), a „paletta" az ADATRÓL (melyik tantárgy
//! milyen színt kap). A kettő szándékosan nem egy beállítás: aki napközben
//! világosban nézi, attól még ugyanazt a tizenkét árnyalatot akarja látni, és
//! aki halkabb színeket kér, attól még maradhat sötétben.
//!
//! MINDKETTŐ A BÖNGÉSZŐBEN LAKIK (`localStorage`), nem cookie-ban és nem a
//! szerveren. Ennek az az ára, hogy a kiszolgáló nem tudja előre, mit fog
//! látni a felhasználó — cserébe viszont a lap MINDEN oldala statikus marad,
//! belépés nélkül is működik, és offline is a helyes témával indul. A
//! villanást a `<head>`-be tett, festés ELŐTT lefutó szkript zárja ki
//! (`components/appearance/appearance-script.tsx`).
//!
//! AMI VISZONT A SZERVEREN DŐL EL: a tweakcn-preset (`lib/theme-presets.ts`).
//! Az belépéshez kötött, mert harmadik féltől jövő CSS-t kell szűrni hozzá —
//! azt nem bízzuk a kliensre.
//! ═══════════════════════════════════════════════════════════════════════════

//! ─── A TÉMA ────────────────────────────────────────────────────────────────

export type Theme = "system" | "light" | "dark";

export const THEMES = ["system", "light", "dark"] as const;

//! AZ ALAPÉRTELMEZÉS A RENDSZERÉ, NEM A MIÉNK. A lap sokáig csak sötét volt (a
//! `<html>`-en kézzel ott ült a `dark` osztály), és ez egy órarendnél nem
//! semleges döntés: reggel, napfényben, a folyosón nézik. Amíg a felhasználó
//! nem mond mást, azt vesszük, amit a készülékén már beállított.
export const DEFAULT_THEME: Theme = "system";

export const THEME_STORAGE_KEY = "orarend:theme:v1";

export function isTheme(value: unknown): value is Theme {
  return THEMES.includes(value as Theme);
}

/** A választás FELOLDVA — ezt viseli a `<html>` a `dark` osztály alakjában. */
export function resolveTheme(theme: Theme): "light" | "dark" {
  if (theme !== "system") return theme;
  //* Szerveren nincs `matchMedia`; ott a sötét a tartalék, mert a lap eddig is
  //* azon állt — a szkript a böngészőben úgyis felülírja festés előtt.
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

//! ─── A PALETTA ─────────────────────────────────────────────────────────────

export type Palette = "ciklus" | "prizma" | "nyugodt";

export const PALETTES = ["ciklus", "prizma", "nyugodt"] as const;

//* A `ciklus` az, ami eddig is volt — aki nem nyúl a beállításhoz, annak a lap
//* semmit nem változik.
export const DEFAULT_PALETTE: Palette = "ciklus";

export const PALETTE_STORAGE_KEY = "orarend:palette:v1";

export function isPalette(value: unknown): value is Palette {
  return PALETTES.includes(value as Palette);
}

export const PALETTE_META: Record<Palette, { label: string; hint: string }> = {
  ciklus: {
    label: "Ciklus",
    hint: "Tizenkét kézzel válogatott árnyalat",
  },
  prizma: {
    label: "Prizma",
    hint: "Minden tantárgy saját színt kap",
  },
  nyugodt: {
    label: "Nyugodt",
    hint: "Egyetlen hideg családban marad",
  },
};

//! ─── A KÖZÖS MAG: A TANTÁRGY SZÁMA ─────────────────────────────────────────
//! MIND A HÁROM KÉPLET UGYANEBBŐL A SZÁMBÓL INDUL, és ez nem spórolás. Ha
//! palettánként más lenne a szórás, ugyanaz a tantárgy nem csak MÁS színt
//! kapna a váltás után, hanem más SZOMSZÉDOKAT is: ami eddig egyedül állt a
//! napban, az hirtelen összeolvadna a mellette lévővel. Egy mag, három
//! leképezés — a tantárgyak egymáshoz mért viszonya megmarad.
//*
//* A képlet maga a régi `accentHue`-ból való, változatlanul: `hash * 31 + kód`.
//* Nem kriptográfiai, nem is kell annak lennie — annyi a dolga, hogy rövid,
//* egymáshoz hasonló tantárgyrövidítéseket („mat", „mag") szétszórjon.
export function accentSeedHash(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return hash;
}

//! ─── 1. CIKLUS — A RÉGI, KÉZZEL VÁLOGATOTT KÖR ─────────────────────────────
//! Nem egyenletes osztás, és pont ez a lényege: az OKLCH körén a sárga-zöld
//! szakasz sokkal gyorsabban vált érzékelt színt, mint a kék, ezért ott
//! sűrűbbek, a kékben ritkábbak a lépések. Egyenletes 30°-os osztásnál a hét
//! fele kékesnek látszana.
const CIKLUS_HUES = [258, 232, 210, 192, 172, 150, 128, 96, 72, 45, 22, 4];

//! ─── 2. PRIZMA — MINDENKINEK SAJÁT SZÍN ────────────────────────────────────
//! A ciklus tizenkét rekesze egy nagy órarendben ELFOGY: tizenhárom tantárgynál
//! biztosan van két egyforma színű, és ha épp egymás mellé esnek, a rács
//! hazudik — a szín itt AZONOSÍTÓ, nem dísz.
//*
//! EZÉRT ITT NINCSENEK REKESZEK. A `137.508` az aranyszög: bármely két
//! egymást követő érték a lehető legtávolabb esik a körön, tehát a szomszédos
//! kivonatok is jól elválnak. A `% 360` után egész fokra kerekítünk — a
//! tizedesnek nincs látható haszna, a HTML-be viszont minden kártyán bekerülne.
//*
//! ÁRA, KIMONDVA: a teljes kör azt is jelenti, hogy a sárga-zöld szakasz is
//! játszik. Ott az OKLCH azonos világossággal telítettebbnek látszik, tehát a
//! rács tarkább lesz, mint a `ciklus`. Aki ezt választja, pont ezt kéri.
const GOLDEN_ANGLE = 137.508;

//! ─── 3. NYUGODT — EGY CSALÁDON BELÜL ───────────────────────────────────────
//! A HARMADIK KÉPLET NEM „MÉG EGY SZÍNSOR", HANEM AZ ELLENKEZŐ IRÁNY. Egy
//! teljes hét kirakva harminc-negyven kártya; tizenkét különböző színárnyalattal
//! a rács tarka mozaik, amin nincs hova pihentetni a szemet. Ez a paletta a
//! lap saját kobaltja körüli hideg sávban marad (türkiz → indigó), és a
//! tantárgyakat ezen belül különbözteti meg.
//*
//! AMIT EZÉRT FELADUNK, AZT MONDJUK KI: nyolc rekesz száz fokon osztozik,
//! tehát két tantárgy színe KÖZELEBB kerül egymáshoz, mint a `ciklus`-ban. Aki
//! a színt azonosításra használja, annak a `prizma` való; ez a paletta azoknak
//! szól, akiknek a szín hangulat, és a nap alakját a helyzet és a felirat adja.
const NYUGODT_HUES = [172, 187, 202, 217, 232, 247, 262, 277];

/**
 * A három képlet, palettánként. Mindegyik ugyanazt a szerződést tartja:
 * ugyanaz a mag MINDIG ugyanazt a fokot adja, hálózat és állapot nélkül.
 */
export const PALETTE_HUE: Record<Palette, (seed: string) => number> = {
  ciklus: (seed) => CIKLUS_HUES[accentSeedHash(seed) % CIKLUS_HUES.length],
  prizma: (seed) => Math.round((accentSeedHash(seed) * GOLDEN_ANGLE) % 360),
  nyugodt: (seed) => NYUGODT_HUES[accentSeedHash(seed) % NYUGODT_HUES.length],
};

//! ─── A TÁROLÓ ──────────────────────────────────────────────────────────────
//! Ugyanaz a minta, mint a `last-view.ts`-ben és az `identity.ts`-ben: ismeretlen
//! érték = nincs érték. A tárolóba kerülhetett régi verzióból származó vagy
//! kézzel írt szöveg; abból nem csinálunk hibát, csak elfelejtjük.

export function loadTheme(): Theme | null {
  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isTheme(raw) ? raw : null;
  } catch {
    return null;
  }
}

export function saveTheme(theme: Theme): void {
  try {
    if (window.localStorage.getItem(THEME_STORAGE_KEY) === theme) return;
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    notifyPrefsChanged();
  } catch {
    /* privát módban nincs tárhely — a választás a lap bezárásáig él */
  }
}

export function loadPalette(): Palette | null {
  try {
    const raw = window.localStorage.getItem(PALETTE_STORAGE_KEY);
    return isPalette(raw) ? raw : null;
  } catch {
    return null;
  }
}

export function savePalette(palette: Palette): void {
  try {
    if (window.localStorage.getItem(PALETTE_STORAGE_KEY) === palette) return;
    window.localStorage.setItem(PALETTE_STORAGE_KEY, palette);
    notifyPrefsChanged();
  } catch {
    /* ugyanaz: a beállítás nem funkció, nem dobunk tőle hibát */
  }
}

//! ─── A DOKUMENTUMRA ÍRÁS ───────────────────────────────────────────────────
//! EGY HELYEN, MERT HÁROM HÍVÓJA VAN: a festés előtti szkript (szövegként, lásd
//! lentebb), a beállítómenü (azonnali visszajelzés), és a szinkron (amikor a
//! másik készülékről érkezik a választás). Ha bármelyik máshogy írná a
//! `<html>`-t, a három között némán szétcsúszna az állapot.
//*
//* A `dark` OSZTÁLY MARAD A MECHANIZMUS, nem `data-theme`: a Tailwind
//* `dark:` változata (`@custom-variant dark (&:is(.dark *))`) és a `.dark
//* .acc-*` szabályok mind erre néznek. A `data-theme` MELLÉ kerül, és mást
//* mond: nem azt, hogy mi LÁTSZIK, hanem hogy mit VÁLASZTOTT a felhasználó —
//* a menünek erre van szüksége, hogy a „Rendszer" gomb be tudjon jelölődni.

export function applyAppearance(theme: Theme, palette: Palette): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const resolved = resolveTheme(theme);

  root.classList.toggle("dark", resolved === "dark");
  root.dataset.theme = theme;
  root.dataset.palette = palette;
  //! A `color-scheme` NEM DÍSZ: ettől lesz sötét a görgetősáv, a legördülő
  //! lista és minden más, amit a böngésző maga rajzol. Eddig soron belüli
  //! stílusként ült a `<html>`-en (`layout.tsx`), fixen `dark`-on.
  root.style.colorScheme = resolved;
}

//! ─── UGYANEZ, DE SZÖVEGKÉNT ────────────────────────────────────────────────
//! A festés előtti szkript nem importálhat: a `<head>`-ben, a csomag betöltése
//! ELŐTT fut. Ezért itt megismételjük — de nem kézzel bemásolt kulcsokkal,
//! hanem a fenti konstansokból generálva. Ha a kulcs vagy az alapértelmezés
//! változik, ez a szöveg VELE változik.
//*
//* Szándékosan tömör és ES5-es: ez a szkript blokkolja a festést, minden bájt
//* és minden elemzési lépés a lap első képének a késleltetése.
export function appearanceScript(): string {
  return [
    "(function(){try{",
    `var s=localStorage,t=s.getItem(${JSON.stringify(THEME_STORAGE_KEY)}),p=s.getItem(${JSON.stringify(PALETTE_STORAGE_KEY)});`,
    `if(${JSON.stringify(THEMES)}.indexOf(t)<0)t=${JSON.stringify(DEFAULT_THEME)};`,
    `if(${JSON.stringify(PALETTES)}.indexOf(p)<0)p=${JSON.stringify(DEFAULT_PALETTE)};`,
    'var d=t==="dark"||(t==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);',
    "var r=document.documentElement;",
    'r.classList.toggle("dark",d);r.dataset.theme=t;r.dataset.palette=p;',
    'r.style.colorScheme=d?"dark":"light";',
    "}catch(e){}})()",
  ].join("");
}
