"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import {
  DEFAULT_PRESET,
  getThemePresets,
  getThemePreviewCss,
  isValidPresetSlug,
  type ThemePreset,
} from "@/lib/theme-presets";

//! ═══════════════════════════════════════════════════════════════════════════
//! A PRESET-VÁLASZTÓ SZERVEROLDALI FELE
//! ═══════════════════════════════════════════════════════════════════════════
//! A választó kliens (a lapban ül, a többi beállítás mellett), a preset-lista
//! és az előnézeti CSS viszont a szerveré — ezért kellenek ezek az akciók.
//! Mindegyik UGYANARRA a `getThemePresets()`-re megy, tehát ugyanaz a napi
//! adat-gyorsítótár szolgálja ki: presetenként egy külső kérés, nem
//! felhasználónként.
//!
//! MUNKAMENET-KAPU MINDHÁROMRA. Az olvasások azért, hogy a tweakcn felé menő
//! forgalmat ne lehessen belépés nélkül generálni; az írás azért, mert saját
//! sort módosít.
//! ═══════════════════════════════════════════════════════════════════════════

async function viewerId(): Promise<string | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user.id ?? null;
}

/**
 * A belépett felhasználó jelenlegi presetje, üres sztringgel jelezve, hogy a
 * beépített palettán áll.
 *
 * //! A VÁLASZTÓ KLIENS, EZÉRT KELL EZ AZ AKCIÓ. A lapot a `StandingLine`
 * //! rendereli, ami `"use client"` — ott nem lehet közvetlenül adatbázist
 * //! olvasni. A lapba ágyazott `<style>` (`theme-style.tsx`) ettől
 * //! függetlenül szerveroldalon dől el; ez csak a KIJELÖLÉST mutatja meg.
 */
export async function getViewerPresetAction(): Promise<string> {
  const userId = await viewerId();
  if (!userId) return "";
  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: { themePreset: true },
  });
  return me?.themePreset ?? "";
}

/** A választható paletták listája (a beépített NÉLKÜL — azt a hívó teszi elé). */
export async function getThemePresetsAction(): Promise<ThemePreset[]> {
  if (!(await viewerId())) return [];
  return getThemePresets();
}

/**
 * Egy preset előnézeti CSS-e a futásidejű váltáshoz.
 *
 * Üres sztring = „nincs mit alkalmazni": vagy a beépített paletta a kérés
 * (annak nincs felülírása), vagy nem sikerült feloldani. A hívó a kettőt a
 * slug alapján különbözteti meg — üres válasz NEM-alapértelmezett slugra hiba.
 */
export async function getThemePreviewCssAction(slug: string): Promise<string> {
  if (!(await viewerId())) return "";
  //! Ugyanaz az alaki ellenőrzés, mint a mentésnél: a slug gyorsítótár-címkébe kerül.
  if (!isValidPresetSlug(slug)) return "";
  return getThemePreviewCss(slug);
}

/**
 * A választott tweakcn preset mentése a felhasználóhoz.
 *
 * A `null`/`DEFAULT_PRESET` a beépített palettát jelenti.
 */
export async function setThemePresetAction(slug: string | null): Promise<void> {
  const userId = await viewerId();
  if (!userId) {
    throw new Error("Először jelentkezz be.");
  }

  //* Vissza az alapértelmezettre.
  if (!slug || slug === DEFAULT_PRESET) {
    await prisma.user.update({
      where: { id: userId },
      data: { themePreset: null },
    });
    revalidatePath("/", "layout");
    return;
  }

  //! KÉT LÉPCSŐS ELLENŐRZÉS, ÉS MINDKETTŐ KELL. Az alaki (`isValidPresetSlug`)
  //! azt zárja ki, hogy a slug URL-t vagy gyorsítótár-címkét tudjon törni; a
  //! regiszter-ellenőrzés azt, hogy csak LÉTEZŐ tweakcn preset kerülhessen az
  //! adatbázisba. Enélkül egy tetszőleges sztring is bekerülne, és minden
  //! oldalletöltésnél kimenne egy hiábavaló külső kérés a nevében.
  if (!isValidPresetSlug(slug)) {
    throw new Error("Ismeretlen paletta.");
  }

  const presets = await getThemePresets();
  if (presets.length && !presets.some((p) => p.slug === slug)) {
    throw new Error("Ismeretlen paletta.");
  }

  await prisma.user.update({
    where: { id: userId },
    data: { themePreset: slug },
  });

  //! A PRESET A GYÖKÉRELRENDEZÉSBEN RENDEREL (`ThemeStyle`), ezért a layout
  //! szintjén kell érvényteleníteni — `revalidatePath("/")` önmagában csak a
  //! kezdőlapot ürítené, és a többi lapon a régi paletta maradna a
  //! kliensoldali router-gyorsítótárban.
  revalidatePath("/", "layout");
}
