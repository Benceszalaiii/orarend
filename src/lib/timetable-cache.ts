import type { TimetableView } from "./timetable";

//! ─── HELYI PÉLDÁNY AZ UTOLSÓ LEKÉRT HÉTRŐL ────────────────────────────────
//! A lap telepíthető (PWA), és a folyosón rendszeresen nincs térerő. A service
//! worker a lap VÁZÁT tartja meg — a HTML-t, a JS-t, a CSS-t —, adatot viszont
//! nem tud: az órarend `POST /timetable/cards`-ból jön, és a Cache API nem tárol
//! POST-választ. Az adat ezért ide kerül.
//!
//! Ez NEM offline mód: a mentett hét egy PILLANATKÉP, nem az igazság. A nézet
//! ezért mindig kiírja, mikor kelt — a lejárt adatot elhallgatni rosszabb, mint
//! nem mutatni semmit.

const CACHE_KEY = "orarend:week-cache:v1";
//* Ennyi hét marad meg. A napi használat egy-két hetet érint; a régebbi
//* bejegyzések csak a tárhelyet ennék.
const MAX_ENTRIES = 4;

export type CachedWeek = {
  view: TimetableView;
  /** Epoch ms — a lekérés pillanata. */
  fetchedAt: number;
};

type Store = Record<string, CachedWeek>;

function entryKey(classShort: string, weekStart: string): string {
  return `${classShort}|${weekStart}`;
}

function readStore(): Store {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as Store;
  } catch {
    return {};
  }
}

export function loadCachedWeek(
  classShort: string,
  weekStart: string,
): CachedWeek | null {
  if (!classShort) return null;
  const entry = readStore()[entryKey(classShort, weekStart)];
  //* Csak sikeres lekérést mentünk, de a tárolt alak régebbi verzióból is
  //* jöhet — a `days` megléte a legolcsóbb épség-ellenőrzés.
  if (!entry || !Array.isArray(entry.view?.days)) return null;
  return entry;
}

export function saveCachedWeek(
  classShort: string,
  weekStart: string,
  view: TimetableView,
): void {
  if (typeof window === "undefined" || !classShort || !view.ok) return;
  try {
    const store = readStore();
    store[entryKey(classShort, weekStart)] = { view, fetchedAt: Date.now() };

    //* Túlcsordulás esetén a LEGRÉGEBBEN lekért bejegyzés esik ki.
    const entries = Object.entries(store).sort(
      (a, b) => b[1].fetchedAt - a[1].fetchedAt,
    );
    const trimmed = Object.fromEntries(entries.slice(0, MAX_ENTRIES));
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(trimmed));
  } catch {
    /* tele van a tárhely vagy privát mód — a mentés kimarad, a lap működik */
  }
}

//! MENNYIRE RÉGI? Percben mérünk, mert a válasz mindig egy MONDAT lesz, nem egy
//! időbélyeg: „az imént" pontosabb és olvashatóbb, mint egy 14:32.
export function ageLabel(fetchedAt: number, now: number = Date.now()): string {
  const min = Math.max(0, Math.floor((now - fetchedAt) / 60000));
  if (min < 2) return "az imént";
  if (min < 60) return `${min} perce`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours} órája`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "tegnap" : `${days} napja`;
}
