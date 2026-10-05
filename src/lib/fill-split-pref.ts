import { notifyPrefsChanged } from "./prefs-events";

//! ═══════════════════════════════════════════════════════════════════════════
//! A MAGÁNYOS BONTOTT ÓRA KITÖLTI AZ OSZLOPOT — KÉRÉSRE, NEM ALAPBÓL
//! ═══════════════════════════════════════════════════════════════════════════
//! A csoportbontott óra a rácson fél oszlopot kap (lásd `groupHalf` és a
//! `calendar.tsx` fél-oszlop szakaszát): így látszik, hogy az osztály fele nem
//! ül ott. Ez igaz jelzés — de ha egy osztály hetének szinte MINDEN órája
//! bontott, és a másik csoport sávja üres (a 13C egy-egy hete ilyen), a rács
//! kettévágottnak tűnik: minden kártya mellett egy semmit sem mondó üres fél,
//! a kártyán pedig fele annyi hely a teremnek és a tanárnak.
//!
//! EZÉRT KAPCSOLÓ, ÉS ALAPBÓL KI VAN KAPCSOLVA. Aki kéri, annak a magányos
//! bontott óra teljes szélességű; ahol a két csoport órája ténylegesen egymásra
//! esik, ott a két fél oszlop megmarad — azt eltakarni hazugság lenne.
//!
//! KÉSZÜLÉKHEZ KÖTÖTT, NEM SZINKRONIZÁLT, mint a beleférő szakkörök
//! (`club-suggest-pref.ts`): a hely a képernyőn múlik — ami egy keskeny
//! telefonon segít, az egy széles asztali rácson fölösleges.
//! ═══════════════════════════════════════════════════════════════════════════

export const FILL_SPLIT_STORAGE_KEY = "orarend:fill-split:v1";
export const DEFAULT_FILL_SPLIT = false;

export function loadFillSplit(): boolean {
  try {
    return window.localStorage.getItem(FILL_SPLIT_STORAGE_KEY) === "on";
  } catch {
    return DEFAULT_FILL_SPLIT;
  }
}

export function saveFillSplit(on: boolean): void {
  try {
    if (loadFillSplit() === on) return;
    if (on) window.localStorage.setItem(FILL_SPLIT_STORAGE_KEY, "on");
    else window.localStorage.removeItem(FILL_SPLIT_STORAGE_KEY);
    notifyPrefsChanged();
  } catch {
    /* privát módban nincs tárhely — a választás a lap bezárásáig sem él */
  }
}
