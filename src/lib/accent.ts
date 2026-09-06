import {
  DEFAULT_PALETTE,
  PALETTE_HUE,
  PALETTES,
  type Palette,
} from "./appearance";

//! ═══════════════════════════════════════════════════════════════════════════
//! A TANTÁRGY SZÍNE — HÁROM KÉPLET, DE A VÁLASZTÁS A CSS-É
//! ═══════════════════════════════════════════════════════════════════════════
//! A KÁRTYA MIND A HÁROM SZÍNÉT MAGÁVAL HOZZA, ÉS EZ NEM PAZARLÁS. A kézenfekvő
//! megoldás az lenne, hogy a JS kiszámolja az AKTUÁLIS paletta szerinti fokot,
//! és egyetlen `--acc-h`-t ír ki. Csak épp a paletta a böngészőben lakik
//! (`localStorage`), a kártyák egy része viszont a SZERVEREN rendereldik (a
//! nyitólap hete), ahol ez az érték nem ismert. A szerver a saját tippjét
//! írná ki, a kliens a valódit — a React ezt eltérésnek látja, és a
//! hidratálás a lap egy darabját eldobja.
//!
//! EZÉRT A JS NEM DÖNT, CSAK FELKÍNÁL. Kiírja mind a hármat, a `<html>`-en ülő
//! `data-palette` pedig kiválasztja, melyik legyen az `--acc-h` — lásd
//! `globals.css`, „A PALETTA VÁLASZTÓJA". Ez háromszor annyi bájt kártyánként
//! (tömörítés után elenyésző, mert minden kártyán ugyanaz a három név áll), és
//! cserébe:
//!   • a szerver és a kliens UGYANAZT a HTML-t adja, tehát nincs eltérés;
//!   • a paletta váltása nem rendereli újra a hetet — egy attribútum a
//!     `<html>`-en, és a rács azonnal átvált;
//!   • a festés előtti szkript már a helyes palettát állítja be, tehát a
//!     kártyák SOSEM villannak fel más színnel.
//!
//! //! AMI EBBŐL KÖVETKEZIK: `--acc-h`-t SOHA ne írjunk ki innen soron belüli
//! //! stílusként. A soron belüli stílus erősebb minden osztálynál, tehát pont
//! //! azt a szabályt ütné ki, ami a palettát váltja — a beállítás némán
//! //! hatástalan lenne. (Ahol egy MINTA kell fix színnel — a jelmagyarázat a
//! //! `calendar.tsx`-ben —, ott ugyanezt a három tokent adjuk, csak rögzített
//! //! maggal.)
//! ═══════════════════════════════════════════════════════════════════════════

/**
 * Egy tantárgy foka EGY adott palettán. A CSS-t nem használó fogyasztóknak
 * való — ma egyetlen ilyen van, a nyitólap vászonra festett fénykamrája
 * (`app/home/_components/light-field.tsx`), ahol nincs elem, amin egy
 * osztály választhatna.
 */
export function accentHue(
  seed: string,
  palette: Palette = DEFAULT_PALETTE,
): number {
  return PALETTE_HUE[palette](seed);
}

//* A tokennevek a paletták nevéből jönnek, hogy a CSS oldalán ne kelljen
//* fejben tartani a sorrendet: `--h-ciklus`, `--h-prizma`, `--h-nyugodt`.
export const hueTokenName = (palette: Palette) => `--h-${palette}`;

/**
 * A kártyára kerülő három szín. A hívó változatlanul soron belüli stílusként
 * teríti szét (`style={accentStyle(seed)}`); a különbség csak annyi, hogy most
 * három szám megy ki egy helyett, és a választást a CSS végzi.
 */
export function accentStyle(seed: string): React.CSSProperties {
  const style: Record<string, number> = {};
  for (const palette of PALETTES) {
    style[hueTokenName(palette)] = PALETTE_HUE[palette](seed);
  }
  return style as React.CSSProperties;
}
