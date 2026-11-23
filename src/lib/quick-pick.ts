import { useSyncExternalStore } from "react";
import { notifyPrefsChanged, onPrefsChanged } from "./prefs-events";

//! ═══════════════════════════════════════════════════════════════════════════
//! GYORSVÁLASZTÁS — A VÁLASZTÓ KÉT ALAKJA KÖZÖTT A DIÁK DÖNT
//! ═══════════════════════════════════════════════════════════════════════════
//! A folyékony váltó alanyválasztója (`chrome/subject-quick-pick.tsx`) alapból
//! két koppintásos rácsként nyílik: évfolyam-sorok az osztályoknak, betű a
//! tanároknak, emelet a termeknek. Aki a böngésző saját listáját szokta meg
//! (görgetés + egy koppintás), az a buborék sarkából kikapcsolhatja — és a
//! Testreszabásban visszakapcsolhatja.
//*
//! A `null` „még sosem nyúlt hozzá": ilyenkor az alapértelmezés (BE) fut, és a
//! szinkron a másik készülék döntését átveheti (lásd `mergePrefs`).
//! ═══════════════════════════════════════════════════════════════════════════

export const QUICK_PICK_STORAGE_KEY = "orarend:quick-pick:v1";
export const DEFAULT_QUICK_PICK = true;

export function loadQuickPick(): boolean | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(QUICK_PICK_STORAGE_KEY);
    return raw === "1" ? true : raw === "0" ? false : null;
  } catch {
    return null;
  }
}

export function saveQuickPick(value: boolean): void {
  if (typeof window === "undefined") return;
  try {
    const next = value ? "1" : "0";
    if (window.localStorage.getItem(QUICK_PICK_STORAGE_KEY) === next) return;
    window.localStorage.setItem(QUICK_PICK_STORAGE_KEY, next);
    notifyPrefsChanged();
  } catch {
    /* privát módban nincs tárhely — marad az alapértelmezés */
  }
}

//* `useSyncExternalStore`: lapváltás után az új váltó azonnal a tárolt alakkal
//* rajzol, és a Testreszabás kapcsolója ugyanabban a képkockában hat.
export function useQuickPick(): boolean {
  return useSyncExternalStore(
    onPrefsChanged,
    () => loadQuickPick() ?? DEFAULT_QUICK_PICK,
    () => DEFAULT_QUICK_PICK,
  );
}
