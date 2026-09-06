"use client";

import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import {
  applyAppearance,
  DEFAULT_PALETTE,
  DEFAULT_THEME,
  loadPalette,
  loadTheme,
  type Palette,
  savePalette,
  saveTheme,
  type Theme,
} from "@/lib/appearance";
import { onPrefsChanged } from "@/lib/prefs-events";

//! ═══════════════════════════════════════════════════════════════════════════
//! A MEGJELENÉS, MINT ÁLLAPOT
//! ═══════════════════════════════════════════════════════════════════════════
//! HÁROM DOLOGNAK KELL EGYSZERRE IGAZAT MONDANIA: a `<html>` attribútumainak
//! (amit a festés előtti szkript már beállított), a `localStorage`-nak (ami a
//! forrás), és ennek a React-állapotnak (amiből a menü rajzol). Ez a horog az
//! egyetlen hely, ahol a három összeér.
//!
//! //! AZ ELSŐ RENDERELÉS SZÁNDÉKOSAN AZ ALAPÉRTELMEZÉST MUTATJA. A `useState`
//! //! kezdőértéke nem olvashat `localStorage`-ot: a szerveren nincs, tehát a
//! //! kliens első renderelése eltérne a szerverétől, és a React eldobná a fát.
//! //! A valódi értéket a `useLayoutEffect` teszi be — az még FESTÉS ELŐTT fut,
//! //! tehát a menü sosem villan rossz kijelöléssel. A LAP maga eközben már rég
//! //! a helyes témában áll: azt nem ez rajzolja, hanem a `<head>` szkriptje.
//! ═══════════════════════════════════════════════════════════════════════════

export type Appearance = {
  theme: Theme;
  palette: Palette;
  setTheme: (theme: Theme) => void;
  setPalette: (palette: Palette) => void;
  /** Hamis, amíg a tárolóból nem olvastunk — a menü ilyenkor nem jelöl ki semmit. */
  ready: boolean;
};

export function useAppearance(): Appearance {
  const [theme, setThemeState] = useState<Theme>(DEFAULT_THEME);
  const [palette, setPaletteState] = useState<Palette>(DEFAULT_PALETTE);
  const [ready, setReady] = useState(false);

  //* A tárolóból az állapotba. Ugyanez fut a szinkron és a másik fül írása
  //* után is, ezért külön függvény.
  const pull = useCallback(() => {
    const nextTheme = loadTheme() ?? DEFAULT_THEME;
    const nextPalette = loadPalette() ?? DEFAULT_PALETTE;
    setThemeState(nextTheme);
    setPaletteState(nextPalette);
    //! ÚJRA RÁÍRJUK A `<html>`-RE, PEDIG A SZKRIPT MÁR MEGTETTE. Fejlesztésben
    //! a React szigorú módja egyszer újracsatolja a fát, és ilyenkor a
    //! `<html>` attribútumait visszaállítja arra, amit a JSX kimond — vagyis
    //! letörli, amit a szkript írt. Élesben ez a sor nem csinál semmit; ott a
    //! szinkron miatt van, ami a másik készülék választását hozza.
    applyAppearance(nextTheme, nextPalette);
    setReady(true);
  }, []);

  useLayoutEffect(() => {
    pull();
    return onPrefsChanged(pull);
  }, [pull]);

  //! A „RENDSZER" NEM EGYSZERI KÉRDÉS. Aki ezt választja, azt várja, hogy a
  //! lap KÖVESSE a készüléket — napnyugtakor, vagy amikor a telefon magától
  //! átvált. A médialekérdezésre ezért fel kell iratkozni; enélkül a lap a
  //! megnyitáskori állapotban ragadna a fül bezárásáig.
  useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const sync = () => applyAppearance("system", palette);
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, [theme, palette]);

  const setTheme = useCallback(
    (next: Theme) => {
      setThemeState(next);
      //* Előbb a képernyő, aztán a tároló: a koppintás visszajelzése ne várjon
      //* a `localStorage`-ra (ami privát módban dobhat is).
      applyAppearance(next, palette);
      saveTheme(next);
    },
    [palette],
  );

  const setPalette = useCallback(
    (next: Palette) => {
      setPaletteState(next);
      applyAppearance(theme, next);
      savePalette(next);
    },
    [theme],
  );

  return { theme, palette, setTheme, setPalette, ready };
}
