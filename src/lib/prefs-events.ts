//! ─── „A BEÁLLÍTÁS MEGVÁLTOZOTT" JELZÉS ──────────────────────────────────────
//! A beállításokat sok különböző hely írja (az osztályválasztó, a
//! csoportbontás-menü, a duális rács, a nézetváltó), és egyikük sem tud a
//! szinkronról — nem is kell tudnia. Ez a modul az EGYETLEN kapcsolat közöttük:
//! az írók „szóltam"-ot jeleznek, a szinkron pedig figyeli.
//!
//! MIÉRT NEM IDŐZÍTETT ÖSSZEHASONLÍTÁS: a `localStorage` másodpercenkénti
//! újraolvasása és összevetése működne, de az akkumulátort enné, és mindig
//! késne is egy kicsit. Egy esemény pontos és ingyen van.
//!
//! MIÉRT NEM ELÉG A BÖNGÉSZŐ `storage` ESEMÉNYE: az kizárólag a TÖBBI fülön
//! sül el, azon nem, amelyik írt — épp a fontos esetet hagyná ki.

const EVENT_NAME = "orarend:prefs-changed";

/** Jelzi, hogy valamelyik szinkronizált beállítás megváltozott ezen a lapon. */
export function notifyPrefsChanged(): void {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new Event(EVENT_NAME));
  } catch {
    /* nagyon régi böngésző — a szinkron ilyenkor a lap elhagyásakor fut le */
  }
}

/** @returns A leiratkozó függvény. */
export function onPrefsChanged(handler: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(EVENT_NAME, handler);
  //* A többi fül írásáról a böngésző `storage` eseménye szól — így két
  //* megnyitott fül sem tud egymás beállításain átírni.
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener(EVENT_NAME, handler);
    window.removeEventListener("storage", handler);
  };
}
