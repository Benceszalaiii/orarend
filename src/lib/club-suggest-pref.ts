import { notifyPrefsChanged } from "./prefs-events";

//! ═══════════════════════════════════════════════════════════════════════════
//! BELEFÉRŐ SZAKKÖRÖK A RÁCSON — KÉRÉSRE, NEM ALAPBÓL
//! ═══════════════════════════════════════════════════════════════════════════
//! A rács a diák SAJÁT hete. A szakkör választható, ezért magától egyik sem
//! kerül rá — az sem, ami az osztályának vagy évfolyamának szól (`targetsClass`),
//! és a mindenkinek nyitott sem: attól, hogy szólhatna neki, még nem jár oda,
//! és a délután elárasztaná az órarendet. Aki viszont épp azt keresi, mire járhatna
//! a lyukasóráiban, annak a halvány javaslat a szabad sávokban pontosan a
//! válasz — ezért ez kapcsoló, és ALAPBÓL KI VAN KAPCSOLVA.
//!
//! KÉSZÜLÉKHEZ KÖTÖTT, mint az áradó lapváltás (`flood-pref.ts`): kereséskor
//! kapcsolják be, és ha egyszer megtalálta, amit keresett, kikapcsolja.
//! ═══════════════════════════════════════════════════════════════════════════

export const CLUB_SUGGEST_STORAGE_KEY = "orarend:club-suggest:v1";

export function loadClubSuggest(): boolean {
  try {
    return window.localStorage.getItem(CLUB_SUGGEST_STORAGE_KEY) === "on";
  } catch {
    return false;
  }
}

export function saveClubSuggest(on: boolean): void {
  try {
    if (loadClubSuggest() === on) return;
    if (on) window.localStorage.setItem(CLUB_SUGGEST_STORAGE_KEY, "on");
    else window.localStorage.removeItem(CLUB_SUGGEST_STORAGE_KEY);
    notifyPrefsChanged();
  } catch {
    /* privát módban nincs tárhely — a választás a lap bezárásáig sem él */
  }
}
