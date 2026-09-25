import { z } from "zod";
import { looksLikeClass, looksLikeTeacher } from "./known-class";

//! ═══════════════════════════════════════════════════════════════════════════
//! SZAKKÖRÖK — A KÖZÖS RÉSZ
//! ═══════════════════════════════════════════════════════════════════════════
//! A szerver (létrehozás, kezdő adatok betöltése) és a böngésző (lista,
//! órarendi rács) ugyanebből a fájlból dolgozik: ugyanaz a bemeneti alak,
//! ugyanaz a „kinek szól" szabály. Nincs benne se adatbázis, se React, se
//! hálózat — ezért tesztelhető és mindkét oldalon behúzható.
//!
//! A séma-oldali indoklás (miért itt a kilét és a Jedlikinfóban az időpont) a
//! `prisma/schema.prisma` SZAKKÖRÖK fejlécében áll.
//! ═══════════════════════════════════════════════════════════════════════════

export const CLUB_KINDS = [
  "CLUB",
  "EXAM_PREP",
  "COMPETITION_PREP",
  "TUTORING",
  "CATCH_UP",
  "COMPETENCY",
] as const;

export type ClubKind = (typeof CLUB_KINDS)[number];

export const CLUB_KIND_LABELS: Record<ClubKind, string> = {
  CLUB: "Szakkör",
  EXAM_PREP: "Érettségi felkészítő",
  COMPETITION_PREP: "Versenyfelkészítő",
  TUTORING: "Korrepetálás",
  CATCH_UP: "Felzárkóztató",
  COMPETENCY: "Kompetenciafejlesztés",
};

//! A SZAKMAI IRÁNY (lásd `ClubTrack` a sémában).
export const CLUB_TRACKS = ["SOFTWARE", "NETWORK", "MECHANICAL"] as const;

export type ClubTrack = (typeof CLUB_TRACKS)[number];

export const CLUB_TRACK_LABELS: Record<ClubTrack, string> = {
  SOFTWARE: "Szoftverfejlesztő",
  NETWORK: "Rendszergazda, hálózat",
  MECHANICAL: "Gépész (CAD/CNC)",
};

export const CLUB_SLOT_SOURCES = ["TIMETABLE", "ORGANIZER"] as const;

export type ClubSlotSource = (typeof CLUB_SLOT_SOURCES)[number];

//* A Jedlikinfo `dayOfWeek`-je: 1 = hétfő. A 0. elem szándékosan üres, hogy az
//* index maga a nap legyen.
export const WEEKDAY_NAMES = [
  "",
  "Hétfő",
  "Kedd",
  "Szerda",
  "Csütörtök",
  "Péntek",
] as const;

//! A TECHNIKUM ÉVFOLYAMAI. A 9. a legkisebb, a 13. (technikusi év) a
//! legnagyobb — ami ezen kívül esik, az elírás, nem évfolyam.
export const MIN_GRADE = 9;
export const MAX_GRADE = 13;

//* ---------------------------------------------------------------------------
//* AZ URL-KULCS
//* ---------------------------------------------------------------------------
//! ÉKEZET NÉLKÜL, MERT AZ URL-BEN MEGOSZTJÁK. Egy `/szakkorok/drón-szakkör`
//! link a chat-alkalmazásokban `%C3%B3`-s kásává válik; a `dron-szakkor`
//! olvasható marad. Az ütközést (két azonos nevű szakkör) nem ez a függvény
//! oldja fel, hanem a létrehozás — ez csak az alapot adja.
const SLUG_MAX_LENGTH = 80;

export function clubSlug(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SLUG_MAX_LENGTH)
    .replace(/-+$/, "");
}

//* ---------------------------------------------------------------------------
//* KINEK SZÓL
//* ---------------------------------------------------------------------------

/** A `09A` alakú osztálynév évfolyama (`9`). Ismeretlen alaknál `null`. */
export function gradeOfClass(className: string): number | null {
  if (!looksLikeClass(className)) return null;
  const grade = Number.parseInt(className.slice(0, 2), 10);
  return grade >= MIN_GRADE && grade <= MAX_GRADE ? grade : null;
}

export type ClubAudience = {
  grades: readonly number[];
  classes: readonly string[];
  //* A versenyeknek nincs szakmai iránya — nekik hiányzik.
  tracks?: readonly ClubTrack[];
};

//! A BETŰ A SZAKMA. A → szoftverfejlesztő, B → rendszergazda/hálózat,
//! C → mindkettő (fele-fele), D és E → gépész. Minden évfolyamon ugyanígy.
//! A nyelvi előkészítő (`09NY`, `09KNY`) és minden más alak: nem tudjuk —
//! `null`, és akkor nem szűrünk ki semmit.
const TRACKS_BY_LETTER: Record<string, readonly ClubTrack[]> = {
  A: ["SOFTWARE"],
  B: ["NETWORK"],
  C: ["SOFTWARE", "NETWORK"],
  D: ["MECHANICAL"],
  E: ["MECHANICAL"],
};

export function tracksOfClass(className: string): readonly ClubTrack[] | null {
  const match = /^\d{2}([A-Z])$/.exec(className);
  return (match && TRACKS_BY_LETTER[match[1]]) || null;
}

//! A SZAKMA EGYEZIK-E. Irány nélküli szakkör mindenkinek jó; ismeretlen
//! szakmájú osztálynak (nyelvi előkészítő) minden jó — inkább mutatunk egy
//! fölöslegeset, mint hogy elrejtsük a valóban neki szólót.
export function fitsTrack(audience: ClubAudience, className: string): boolean {
  const tracks = audience.tracks ?? [];
  if (tracks.length === 0) return true;
  const own = tracksOfClass(className);
  return own === null || own.some((t) => tracks.includes(t));
}

//! „MINDENKINEK" = se évfolyam, se osztály. A szakmai irány ezt nem teszi
//! célzottá (a rácsra nem kerül ki magától), csak szűkíti, kinek javasoljuk:
//! lásd `openFor`.
export function isOpenToAll(audience: ClubAudience): boolean {
  return audience.grades.length === 0 && audience.classes.length === 0;
}

//* Nyitott szakkör, ami ennek az osztálynak a szakmájához is illik — a
//* javaslatok és a „nekem szól" szűrő ezt kérdezi.
export function openFor(audience: ClubAudience, className: string): boolean {
  return isOpenToAll(audience) && fitsTrack(audience, className);
}

//! AZ ÓRARENDI RÁCSRA KERÜLÉS SZABÁLYA. Csak akkor igaz, ha a szakkör
//! KIFEJEZETTEN ennek az osztálynak (vagy az évfolyamának) szól. A mindenkinek
//! nyitott szakkör itt `false`: ha az összes nyitott szakkör felkerülne minden
//! osztály rácsára, a délután elárasztaná az órarendet, és a diák a saját
//! óráit nem találná benne. Azokat a szakkörlista mutatja.
export function targetsClass(
  audience: ClubAudience,
  className: string,
): boolean {
  //* A kifejezetten felsorolt osztály mindig: azt a tanár maga választotta.
  if (audience.classes.includes(className)) return true;
  const grade = gradeOfClass(className);
  //! Az évfolyamon belül csak a szakmához illő osztályok — a „13. évf.
  //! szoftverfejlesztés" nem a 13D-é.
  return (
    grade !== null &&
    audience.grades.includes(grade) &&
    fitsTrack(audience, className)
  );
}

//* ---------------------------------------------------------------------------
//* IDŐPONT
//* ---------------------------------------------------------------------------

/** Perc éjféltől → `7:10`. */
export function formatMinute(minute: number): string {
  const h = Math.floor(minute / 60);
  const m = minute % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
}

export type ClubSlotTime = {
  weekday: number;
  startMinute: number;
  endMinute: number;
};

/** `Hétfő 7:10–7:55` */
export function formatSlot(slot: ClubSlotTime): string {
  const day = WEEKDAY_NAMES[slot.weekday] ?? "";
  return `${day} ${formatMinute(slot.startMinute)}–${formatMinute(slot.endMinute)}`;
}

//* ---------------------------------------------------------------------------
//* A BEMENET HATÁRA
//* ---------------------------------------------------------------------------
//! Ugyanaz a séma ellenőrzi a kezdő adatokat (`prisma/seed/clubs.ts`) és —
//! az 1. fázistól — a tanári létrehozó űrlapot. Ha a kettő külön szabályt
//! kapna, a betöltött adat olyasmit is tartalmazhatna, amit az űrlap
//! visszautasít, és az első szerkesztésnél elveszne.

//* A Jedlikinfo teremjelei rövidek (`203`, `B5`, `Stúdió`, `119-1`). Szabad
//* szöveg (cím, „Dök Tanya") nem teremjel — az a verseny `location`-je.
const ROOM_MAX_LENGTH = 16;
const DAY_MINUTES = 24 * 60;

export const clubSlotInputSchema = z
  .object({
    weekday: z.number().int().min(1).max(5),
    startMinute: z.number().int().min(0).max(DAY_MINUTES),
    endMinute: z.number().int().min(0).max(DAY_MINUTES),
    room: z.string().trim().min(1).max(ROOM_MAX_LENGTH).nullable(),
    teachers: z
      .array(z.string().refine(looksLikeTeacher, "Nem tanárjel"))
      .min(1)
      .max(4),
    source: z.enum(CLUB_SLOT_SOURCES),
  })
  .refine((s) => s.endMinute > s.startMinute, {
    message: "A vége a kezdés után legyen",
    path: ["endMinute"],
  })
  //! A JEDLIKINFÓBÓL IGAZOLT IDŐPONTNAK TEREM KELL: a terem órarendjéből
  //! illesztjük. Terem nélkül nincs mit megkeresni, és a slot örökre
  //! „nincs az órarendben" maradna.
  .refine((s) => s.source === "ORGANIZER" || s.room !== null, {
    message: "A Jedlikinfóból igazolt időponthoz terem kell",
    path: ["room"],
  });

export type ClubSlotInput = z.infer<typeof clubSlotInputSchema>;

export const clubInputSchema = z
  .object({
    name: z.string().trim().min(3).max(120),
    description: z.string().trim().max(4000).nullable(),
    kind: z.enum(CLUB_KINDS),
    grades: z.array(z.number().int().min(MIN_GRADE).max(MAX_GRADE)).max(5),
    classes: z
      .array(z.string().refine(looksLikeClass, "Nem osztálynév"))
      .max(30),
    tracks: z.array(z.enum(CLUB_TRACKS)).max(CLUB_TRACKS.length),
    audienceNote: z.string().trim().max(200).nullable(),
    //! AZ ELSŐ A FŐ VEZETŐ (`lead`). Legalább egy kell: vezető nélküli
    //! szakkört senki nem tud szerkeszteni, és senki nem hagyhatja jóvá.
    organizers: z
      .array(z.string().refine(looksLikeTeacher, "Nem tanárjel"))
      .min(1)
      .max(4),
    slots: z.array(clubSlotInputSchema).max(10),
  })
  .refine((c) => new Set(c.organizers).size === c.organizers.length, {
    message: "Egy tanár kétszer szerepel a vezetők között",
    path: ["organizers"],
  })
  //! A SLOT TANÁRA A VEZETŐK KÖZÜL VALÓ. Különben egy idegen tanár kártyája
  //! igazolhatná a szakkör időpontját.
  .refine(
    (c) =>
      c.slots.every((s) => s.teachers.every((t) => c.organizers.includes(t))),
    { message: "Az időpont tanára nem vezetője a szakkörnek", path: ["slots"] },
  );

export type ClubInput = z.infer<typeof clubInputSchema>;

//! KINEK SZÓL — EGY SORBAN. A lista kártyáján és a szakkör lapján ugyanaz a
//! mondat áll; az évfolyamok növekvő sorrendben, az osztályok utánuk.
export function audienceLabel(audience: ClubAudience): string {
  const tracks = CLUB_TRACKS.filter((t) => audience.tracks?.includes(t)).map(
    //* Csak a kezdőbetű kicsi — a „CAD/CNC" maradjon nagy.
    (t) =>
      CLUB_TRACK_LABELS[t].charAt(0).toLocaleLowerCase("hu") +
      CLUB_TRACK_LABELS[t].slice(1),
  );
  const who = whoLabel(audience);
  if (tracks.length === 0) return who;
  const track = `${tracks.join(" vagy ")} szak`;
  if (isOpenToAll(audience))
    return track.charAt(0).toLocaleUpperCase("hu") + track.slice(1);
  return `${who} · ${track}`;
}

function whoLabel(audience: ClubAudience): string {
  if (isOpenToAll(audience)) return "Mindenkinek";
  const grades = [...audience.grades].sort((a, b) => a - b);
  const parts: string[] = [];
  if (grades.length === 1) parts.push(`${grades[0]}. évfolyam`);
  if (grades.length > 1) {
    parts.push(
      `${grades.slice(0, -1).join("., ")}. és ${grades[grades.length - 1]}. évfolyam`,
    );
  }
  parts.push(...[...audience.classes].sort((a, b) => a.localeCompare(b, "hu")));
  return parts.join(", ");
}
