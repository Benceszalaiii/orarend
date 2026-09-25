import { notifyPrefsChanged } from "./prefs-events";

//! ═══════════════════════════════════════════════════════════════════════════
//! A KÖVETETT SZAKKÖRÖK — A KÉSZÜLÉKEN
//! ═══════════════════════════════════════════════════════════════════════════
//! A KÖVETÉS NEM TAGSÁG, ÉS NEM KELL HOZZÁ FIÓK. A tag (`ClubMember`) nyilvánosan
//! vállalja, hogy odajár; a követő csak tudni akar róla — a szakkör felkerül a
//! rácsára (akkor is, ha nem az ő évfolyamának szól), és ha kéri, értesítést
//! kap róla. Ez a lap „minden, amit tudni kell, belépés nélkül" elve
//! (PRODUCT.md, 4. alapelv): a követés a böngészőben él, mint az osztály.
//!
//! BELÉPVE A TÖBBI KÉSZÜLÉKRE IS ÁTJÖN — a beállítás-szinkronnal
//! (`prefs-shared.ts`, `clubs` mező), ugyanúgy, mint az elrejtett sorok.
//!
//! A LISTA EGY DÖNTÉS, NEM BEJEGYZÉSEK HALMAZA (lásd `mergePrefs`): két
//! készülék unióját venni azt jelentené, hogy egy leállított követés a másik
//! készülék régi listájából mindig visszaszivárog.
//! ═══════════════════════════════════════════════════════════════════════════

export const CLUB_FOLLOW_STORAGE_KEY = "orarend:club-follow:v1";

//* A rácsra kerülő szakkörök felső határa — egy kérés paramétere is ez.
export const MAX_FOLLOWED_CLUBS = 20;

//* A `clubSlug` kimenetének alakja: kisbetű, szám, egyszeres kötőjelek.
const SLUG_SHAPE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SLUG_MAX_LENGTH = 80;

export function looksLikeClubSlug(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= SLUG_MAX_LENGTH &&
    SLUG_SHAPE.test(value)
  );
}

//* Rendezett, duplikátummentes, korlátos — így két készülék ugyanazt a
//* halmazt ugyanazzal a szöveggel írja le (a szinkron lenyomata ezt várja).
export function sanitizeFollowed(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter(looksLikeClubSlug))]
    .sort()
    .slice(0, MAX_FOLLOWED_CLUBS);
}

//! ─── KÉT LISTA, UGYANAZ A GÉPEZET ──────────────────────────────────────────
//! A versenyek követése pontosan ugyanígy működik (a verseny címe ugyanolyan
//! alakú slug), csak külön kulcson: a kettő nem keveredhet, mert egy szakkör
//! és egy verseny ugyanazt a címet is kaphatja.
export const CONTEST_FOLLOW_STORAGE_KEY = "orarend:contest-follow:v1";

function loadList(key: string): string[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return null;
    return sanitizeFollowed(JSON.parse(raw));
  } catch {
    return null;
  }
}

function saveList(key: string, slugs: readonly string[]): void {
  if (typeof window === "undefined") return;
  try {
    const next = JSON.stringify(sanitizeFollowed([...slugs]));
    if (window.localStorage.getItem(key) === next) return;
    window.localStorage.setItem(key, next);
    notifyPrefsChanged();
  } catch {
    /* privát módban nincs tárhely — a követés ilyenkor a lap életéig sem él */
  }
}

function setIn(key: string, slug: string, on: boolean): string[] {
  const current = loadList(key) ?? [];
  const next = on ? [...current, slug] : current.filter((s) => s !== slug);
  saveList(key, next);
  return sanitizeFollowed(next);
}

/** `null` = ezen a készüléken még soha nem követett semmit. */
export function loadFollowedClubs(): string[] | null {
  return loadList(CLUB_FOLLOW_STORAGE_KEY);
}

export function saveFollowedClubs(slugs: readonly string[]): void {
  saveList(CLUB_FOLLOW_STORAGE_KEY, slugs);
}

export function setClubFollowed(slug: string, on: boolean): string[] {
  return setIn(CLUB_FOLLOW_STORAGE_KEY, slug, on);
}

export function loadFollowedContests(): string[] | null {
  return loadList(CONTEST_FOLLOW_STORAGE_KEY);
}

export function saveFollowedContests(slugs: readonly string[]): void {
  saveList(CONTEST_FOLLOW_STORAGE_KEY, slugs);
}

export function setContestFollowed(slug: string, on: boolean): string[] {
  return setIn(CONTEST_FOLLOW_STORAGE_KEY, slug, on);
}
