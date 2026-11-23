import type { TimetableSubject, TimetableSubjectKind } from "./timetable";

//! ═══════════════════════════════════════════════════════════════════════════
//! A GYORSVÁLASZTÁS CSOPORTJAI — LEGFELJEBB KÉT KOPPINTÁS, GÖRGETÉS NÉLKÜL
//! ═══════════════════════════════════════════════════════════════════════════
//! Mérve 2026-11-23-án a Jedlikinfo listáin: 35 osztály, 91 tanár, 71 terem.
//!
//!   - OSZTÁLY: mind a 35 elfér EGY képernyőn évfolyam-soronként, tehát az
//!     évfolyam itt sor-felirat, nem külön lépés — egy koppintás.
//!   - TANÁR: A–Z betű, aztán a betű nevei. A legnagyobb betű (K) 16 név —
//!     két oszlopban görgetés nélkül.
//!   - TEREM: emelet, aztán a termek. A legnagyobb csoport (földszint) 24 —
//!     három oszlopban görgetés nélkül.
//*
//! A forrás egyikhez sem ad csoportot: az évfolyamot az osztály jele, a betűt
//! a vezetéknév, az emeletet a terem száma mondja meg. Ez a modul tiszta
//! függvényekből áll, hogy a szabály tesztelhető legyen.
//! ═══════════════════════════════════════════════════════════════════════════

export type PickItem = {
  subject: TimetableSubject;
  /** Ami a csempén áll — rövidebb, mint a teljes név, ha a csoport kimondja a többit. */
  label: string;
  /** Kis felirat a csempe alján (pl. „Könyvtár"). */
  hint?: string;
};

export type PickGroup = {
  key: string;
  label: string;
  items: PickItem[];
};

//* Ékezet nélkül, nagybetűvel: az „Á" az „A" alá, az „Ö" az „O" alá kerül.
function fold(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
}

//! ─── OSZTÁLYOK ────────────────────────────────────────────────────────────
//* „09A" → 9. évfolyam, „A"; „13.KE" → 13, „KE"; a többi (pl. „Nagyinet") Egyéb.
const CLASS_RE = /^(\d{1,2})\.?\s*(.+)$/;

export function classRows(subjects: readonly TimetableSubject[]): PickGroup[] {
  const rows = new Map<string, PickGroup>();
  const other: PickItem[] = [];
  for (const subject of subjects) {
    const m = subject.short.match(CLASS_RE);
    if (!m) {
      other.push({ subject, label: subject.name || subject.short });
      continue;
    }
    const year = String(Number(m[1]));
    const row = rows.get(year) ?? { key: year, label: `${year}.`, items: [] };
    row.items.push({ subject, label: m[2] });
    rows.set(year, row);
  }
  const sorted = [...rows.values()].sort(
    (a, b) => Number(a.key) - Number(b.key),
  );
  return other.length
    ? [...sorted, { key: "egyeb", label: "Egyéb", items: other }]
    : sorted;
}

//! ─── TANÁROK ──────────────────────────────────────────────────────────────
//! A NÉV ELEJÉN ÁLLHAT EGY OSZTÁLYJEL („10A Rotter Kristóf") — a duális
//! képzés kísérői így szerepelnek a forrásban. A betű a vezetéknévé, nem a
//! jelé, különben a „1" alá kerülnének.
export function teacherLetter(name: string): string {
  const parts = name.trim().split(/\s+/);
  const surname = /^\d+[A-Za-z.]*$/.test(parts[0] ?? "") ? parts[1] : parts[0];
  const letter = fold(surname ?? "").charAt(0);
  return /[A-Z]/.test(letter) ? letter : "#";
}

export const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

export function teacherGroups(
  subjects: readonly TimetableSubject[],
): PickGroup[] {
  const byLetter = new Map<string, PickItem[]>();
  for (const subject of subjects) {
    const letter = teacherLetter(subject.name || subject.short);
    const list = byLetter.get(letter) ?? [];
    list.push({ subject, label: subject.name || subject.short });
    byLetter.set(letter, list);
  }
  //! AZ ÁBÉCÉ TELJES, AZ ÜRES BETŰ IS OTT VAN. A betűk helye így sosem mozdul
  //! — a „K" mindig ugyanott van, a második használattól vakon is eltalálható.
  const groups = ALPHABET.map((letter) => ({
    key: letter,
    label: letter,
    items: sortByName(byLetter.get(letter) ?? []),
  }));
  const rest = byLetter.get("#");
  return rest?.length
    ? [...groups, { key: "#", label: "#", items: sortByName(rest) }]
    : groups;
}

function sortByName(items: PickItem[]): PickItem[] {
  return items.sort((a, b) => a.label.localeCompare(b.label, "hu"));
}

//! ─── TERMEK ───────────────────────────────────────────────────────────────
//! AZ EMELET A SZÁMBÓL JÖN, mert a forrás nem mondja meg: háromjegyű szám →
//! az első jegy az emelet (0 = földszint, „102" az első); egy-két jegyű →
//! földszint; „T…" → tanműhely; „B…" → B épület. Ami nem szám („3D Labor",
//! „tornacsarnok"), az Egyéb.
const ROOM_RE = /^(\d+(?:-\d+)?|[TB]\d+)(?=$|[\s-])(?:-es)?\s*(?:-\s*)?(.*)$/;

//* A terem rövid, kiírható alakja: a száma („43"), ha van; különben a neve.
//* A forrás `short` jele itt belső kód („Vf"), azt senki nem ismeri fel.
export function roomLabel(name: string): string {
  return name.match(ROOM_RE)?.[1] ?? name;
}

export function roomFloor(name: string): string {
  if (/^T\d/.test(name)) return "T";
  if (/^B\d/.test(name)) return "B";
  const m = name.match(/^(\d+)(?=$|[\s-])/);
  if (!m) return "X";
  return m[1].length === 3 ? m[1][0] : "0";
}

const FLOOR_ORDER = [
  "0",
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "B",
  "T",
  "X",
];

export function floorLabel(key: string): string {
  if (key === "0") return "Földszint";
  if (key === "B") return "B épület";
  if (key === "T") return "Tanműhely";
  if (key === "X") return "Egyéb";
  return `${key}. emelet`;
}

export function roomGroups(subjects: readonly TimetableSubject[]): PickGroup[] {
  const byFloor = new Map<string, PickItem[]>();
  for (const subject of subjects) {
    const name = subject.name || subject.short;
    const m = name.match(ROOM_RE);
    const item: PickItem = m
      ? { subject, label: m[1], hint: m[2].trim() || undefined }
      : { subject, label: name };
    const floor = roomFloor(name);
    const list = byFloor.get(floor) ?? [];
    list.push(item);
    byFloor.set(floor, list);
  }
  return FLOOR_ORDER.filter((key) => byFloor.has(key)).map((key) => ({
    key,
    label: floorLabel(key),
    items: (byFloor.get(key) ?? []).sort((a, b) =>
      a.label.localeCompare(b.label, "hu", { numeric: true }),
    ),
  }));
}

/** A választó csoportjai a lap alanya szerint. */
export function pickGroups(
  kind: TimetableSubjectKind,
  subjects: readonly TimetableSubject[],
): PickGroup[] {
  if (kind === "class") return classRows(subjects);
  if (kind === "teacher") return teacherGroups(subjects);
  return roomGroups(subjects);
}
