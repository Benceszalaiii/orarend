import { loadAllDualSchedules, saveDualSchedule } from "./dual-schedule";
import { loadLastView, saveLastView } from "./last-view";
import { type SyncedPrefs, sanitizePrefs } from "./prefs-shared";
import { loadCachedClass, saveCachedClass } from "./timetable";
import {
  loadAllLocalPreferences,
  saveLocalPreferences,
} from "./timetable-merge";

//! ═══════════════════════════════════════════════════════════════════════════
//! A HELYI TÁROLÓ ÉS A SZINKRON KÖZÖTTI HÍD
//! ═══════════════════════════════════════════════════════════════════════════
//! A beállítások IGAZI helye továbbra is a `localStorage`, öt külön kulcs alatt
//! — mert a lapnak bejelentkezés nélkül is működnie kell, offline is, és a
//! meglévő komponensek onnan olvasnak. Ez a modul nem vezet be új tárolót,
//! csak ÖSSZESZEDI ezt az ötöt egyetlen csomaggá (feltöltéshez), illetve
//! SZÉTOSZTJA egy letöltött csomagot vissza a helyükre.
//!
//! MIÉRT NEM EGY ÚJ, KÖZÖS KULCS: azzal minden meglévő olvasót át kellene írni,
//! és a bejelentkezés nélküli használat (a többség!) egy fölösleges réteget
//! kapna. A híd olcsóbb, és ha a szinkron egyszer megszűnne, az alkalmazás
//! többi része észre sem venné.
//! ═══════════════════════════════════════════════════════════════════════════

/** Összeszedi a készülék jelenlegi beállításait egy feltölthető csomagba. */
export function collectLocalPrefs(): SyncedPrefs {
  if (typeof window === "undefined") {
    return sanitizePrefs(null);
  }
  //! A `sanitizePrefs` a KIMENŐ irányban is fut. Nemcsak a szervert védi: a
  //! helyi tárolóban is lehet régi vagy sérült érték (kézzel szerkesztve, egy
  //! korábbi verzióból maradva), és nincs értelme olyat feltölteni, amit a
  //! szerver úgyis eldobna — a kliens ilyenkor azt hinné, sikerült.
  return sanitizePrefs({
    class: loadCachedClass(),
    lastView: loadLastView(),
    merge: loadAllLocalPreferences(),
    dual: loadAllDualSchedules(),
  });
}

/**
 * Ráírja a letöltött beállításokat a helyi tárolóra.
 *
 * @remarks A hívó felelőssége eldönteni, hogy EGYÁLTALÁN ráírja-e — lásd
 * `prefs-sync.ts`. Ez a függvény nem kérdez vissza, csak végrehajt.
 */
export function applyLocalPrefs(prefs: SyncedPrefs): void {
  if (typeof window === "undefined") return;

  if (prefs.class) saveCachedClass(prefs.class);
  if (prefs.lastView) saveLastView(prefs.lastView);

  for (const [classShort, list] of Object.entries(prefs.merge)) {
    saveLocalPreferences(classShort, list);
  }

  for (const [classShort, schedule] of Object.entries(prefs.dual)) {
    saveDualSchedule(classShort, schedule);
  }
}

//! ─── AZ ÖSSZEFÉSÜLÉS ───────────────────────────────────────────────────────
//! KÉT KÉSZÜLÉK, EGY SOR: az összefésülés szabálya nem lehet „a frissebb nyer
//! mindenben", mert azzal a telefonon beállított duális beosztás eltűnne
//! attól, hogy a gépen később átkattintottunk egy másik osztályra.
//!
//! Ezért MEZŐNKÉNT döntünk, és az irány mindig a MEGŐRZÉS felé hajlik:
//!   - `class` és `lastView`: egyetlen érték, itt tényleg a frissebb nyer —
//!     ezek amúgy is „hol jártam legutóbb" jellegűek, nem beállítások.
//!   - `merge` és `dual`: OSZTÁLYONKÉNT külön bejegyzések, és két készülék
//!     jellemzően MÁS osztályokat állított be. Ezeket ezért egyesítjük;
//!     ütközésnél (ugyanaz az osztály mindkét oldalon) a frissebb oldal nyer.
//!
//! Amit ez a szabály nem old meg: ha ugyanazt az osztályt két készüléken
//! egyszerre, MÁSHOGY állítják be, az egyik változat elveszik. Ez tudatos
//! kompromisszum — a bejegyzésenkénti időbélyeg ára (minden beállítás mellé egy
//! `updatedAt`) nem áll arányban azzal, milyen ritkán fordul ez elő egy
//! órarend-nézőben.
export function mergePrefs(
  local: SyncedPrefs,
  remote: SyncedPrefs,
  /** Melyik oldal az újabb. A `remote` akkor, ha a szerver sora frissebb. */
  newer: "local" | "remote",
): SyncedPrefs {
  const winner = newer === "local" ? local : remote;
  const loser = newer === "local" ? remote : local;

  return {
    class: winner.class ?? loser.class,
    lastView: winner.lastView ?? loser.lastView,
    //* A vesztes oldal bejegyzései alapként; a győztesé fölé írva.
    merge: { ...loser.merge, ...winner.merge },
    dual: { ...loser.dual, ...winner.dual },
  };
}

//! ─── A HELYI ÁLLAPOT JELÖLŐJE ──────────────────────────────────────────────
//! Ahhoz, hogy eldöntsük, a szerver vagy a készülék frissebb-e, tudnunk kell,
//! MELYIK szerver-verzióra épül a jelenlegi helyi állapot. Ez az a szám, amit
//! a szerver a legutóbbi sikeres szinkronnál adott.
//*
//* Kizárólag a szinkron használja; ha hiányzik (első belépés, törölt tároló),
//* az azt jelenti: „ez a készülék még sosem szinkronizált".

const SYNC_META_KEY = "orarend:sync-meta:v1";

export type SyncMeta = {
  /** A szerver `Preference.revision` értéke a legutóbbi sikeres szinkronkor. */
  revision: number;
  /** Melyik felhasználóé volt — fiókváltásnál a régi jelölő nem érvényes. */
  userId: string;
};

export function loadSyncMeta(): SyncMeta | null {
  try {
    const raw = window.localStorage.getItem(SYNC_META_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof (parsed as SyncMeta).revision === "number" &&
      typeof (parsed as SyncMeta).userId === "string"
    ) {
      return parsed as SyncMeta;
    }
    return null;
  } catch {
    return null;
  }
}

export function saveSyncMeta(meta: SyncMeta): void {
  try {
    window.localStorage.setItem(SYNC_META_KEY, JSON.stringify(meta));
  } catch {
    /* privát módban nincs tárhely — a szinkron ilyenkor minden alkalommal
       „még sosem szinkronizált" állapotból indul, ami helyes, csak lassabb */
  }
}

export function clearSyncMeta(): void {
  try {
    window.localStorage.removeItem(SYNC_META_KEY);
  } catch {
    /* nincs mit takarítani */
  }
}
