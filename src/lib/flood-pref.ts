import { notifyPrefsChanged } from "./prefs-events";

//! ═══════════════════════════════════════════════════════════════════════════
//! AZ ÁRADÓ LAPVÁLTÁS — KÉRÉSRE, NEM ALAPBÓL
//! ═══════════════════════════════════════════════════════════════════════════
//! A lapváltás alatti áradás (`chrome/flood.ts`) minden „Hét"/„Ma"/hely
//! koppintásra ~1 mp-ig letakarja a lapot. Aki szünetben, két óra között nyitja
//! meg a telefonját, annak ez egy másodperc a tíz percből — ezért ALAPBÓL KI
//! VAN KAPCSOLVA, és csak az kapja, aki a Megjelenés lapon kéri.
//*
//! KÉSZÜLÉKHEZ KÖTÖTT, NEM SZINKRONIZÁLT. A mozgás a készüléken múlik: ami egy
//! asztali gépen élmény, az egy lassú telefonon teher. Ezért nem kerül a
//! `SyncedPrefs` közé.
//! ═══════════════════════════════════════════════════════════════════════════

export const FLOOD_STORAGE_KEY = "orarend:flood:v1";
export const DEFAULT_FLOOD = false;

export function loadFlood(): boolean {
  try {
    return window.localStorage.getItem(FLOOD_STORAGE_KEY) === "on";
  } catch {
    return DEFAULT_FLOOD;
  }
}

export function saveFlood(on: boolean): void {
  try {
    if (loadFlood() === on) return;
    if (on) window.localStorage.setItem(FLOOD_STORAGE_KEY, "on");
    else window.localStorage.removeItem(FLOOD_STORAGE_KEY);
    notifyPrefsChanged();
  } catch {
    /* privát módban nincs tárhely — a választás a lap bezárásáig sem él */
  }
}
