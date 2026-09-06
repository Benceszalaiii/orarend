//* ---------------------------------------------------------------------------
//* AZ ALANY — KINEK AZ ÓRARENDJÉT NÉZED
//* ---------------------------------------------------------------------------
//! KÉT MERŐLEGES KÉRDÉS, ÉS CSAK AZ EGYIK NÉZET. „Melyik nézet" (hét vagy ma)
//! és „kié az órarend" (osztály vagy tanár) nem ugyanaz a tengely — a régi sáv
//! épp attól csordult túl, hogy egy pirulasorba mosta a kettőt (lásd
//! `chrome/standing-line.tsx`). A nézet ÚTVONAL; az alany ez a beállítás.
//!
//! AMI AZ ALANYT ÚTVONALBA KÓDOLJA, AZ ÍRJA; A `/ma` OLVASSA. Az `/orarend`-re
//! érkezés `class`-t ír, a `/tanari` `teacher`-t, a `/ma` semmit — ő abból
//! dolgozik, amit a másik kettő hagyott. Így a `/ma` egyetlen útvonal marad,
//! mégis mindkét alanyt kiszolgálja, és a PWA `start_url` sem hasad ketté.
//!
//! A KÖVETKEZMÉNYT NEM HALLGATJUK EL: a tanári „Ma"-nak nincs megosztható
//! URL-je. Aki elküldi a linkjét egy kollégának, az a kolléga SAJÁT alanyának
//! napját nyitja meg. Ez az ára annak, hogy a nézetváltó két pirula maradjon.

import { notifyPrefsChanged } from "./prefs-events";

export type Identity = "class" | "teacher";

export const IDENTITY_STORAGE_KEY = "orarend:identity:v1";

export const DEFAULT_IDENTITY: Identity = "class";

export function isIdentity(value: unknown): value is Identity {
  return value === "class" || value === "teacher";
}

//* `null` = még soha nem járt olyan lapon, ami alanyt ír. A hívó dönti el, mit
//* kezd vele; a `/ma` az alapértelmezett osztály-olvasatot veszi.
export function loadIdentity(): Identity | null {
  try {
    const raw = window.localStorage.getItem(IDENTITY_STORAGE_KEY);
    return isIdentity(raw) ? raw : null;
  } catch {
    return null;
  }
}

export function saveIdentity(identity: Identity): void {
  try {
    //* Fölösleges írás nélkül: a `notifyPrefsChanged` a lap MINDEN
    //* beállítás-figyelőjét felébreszti, és az `/orarend` minden megnyitása
    //* ugyanazt az értéket írná vissza.
    if (window.localStorage.getItem(IDENTITY_STORAGE_KEY) === identity) return;
    window.localStorage.setItem(IDENTITY_STORAGE_KEY, identity);
    notifyPrefsChanged();
  } catch {
    /* privát módban nincs tárhely — ilyenkor minden lap az alapértelmezésen áll */
  }
}

//! A NÉZET ÚTVONALA AZ ALANYBÓL OLDÓDIK FEL. A „Hét" pirula ugyanaz a pirula
//! mindkét alanynak, csak nem ugyanoda visz. Ez az egyetlen hely, ahol ez a
//! leképezés le van írva — a `standing-line.tsx` és a nyitólap is innen kéri.
export function weekRouteFor(identity: Identity): "/orarend" | "/tanari" {
  return identity === "teacher" ? "/tanari" : "/orarend";
}
