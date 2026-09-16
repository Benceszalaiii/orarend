import "server-only";

import { JEDLIK_API_ORIGIN } from "./jedlik-api";
import { schoolRoleForEmail } from "./school-domain";
import {
  findTeacherForAccount,
  MIN_NAME_TOKENS,
  nameTokens,
  type TeacherRecord,
} from "./teacher-name";
import { TEACHER_EMAIL_PINS } from "./teacher-pins";

//! ═══════════════════════════════════════════════════════════════════════════
//! A TANÁRI JOG FORRÁSA — A JEDLIKINFO TANÁRLISTÁJA
//! ═══════════════════════════════════════════════════════════════════════════
//! A `@jedlik.eu` cím ÖNMAGÁBAN NEM TANÁR. A tantestületi domainen ülnek a
//! nem tanító munkatársak is (titkárság, rendszergazda, gazdasági iroda) —
//! nekik egy tanári naptár-feed vagy értesítés-feliratkozás (lásd
//! `/api/naptar`, `/api/ertesites`) nem jár. A domain csak azt mondja meg,
//! hogy ÉRDEMES-E megnézni a listát; a döntést a lista hozza.
//!
//! UGYANAZ A LISTA, AMIT A `/tanari` VÁLASZTÓJA MUTAT. Nem egy második,
//! kézzel karbantartott névsor: ami a választóban tanárként szerepel, az a
//! belépésnél is tanár, és egy új kolléga felvétele a Jedlikinfóba magától
//! eljut ide is.
//!
//! A LISTA SOHA NEM MEGY KI A BÖNGÉSZŐBE ebből a modulból — `server-only`.
//! A felhasználó csak a SAJÁT kanonikus nevét kapja meg (`user.teacherName`).
//! ═══════════════════════════════════════════════════════════════════════════

const TEACHERS_URL = `${JEDLIK_API_ORIGIN}/timetable/teachers`;

//! RÖVIDEBB, MINT AZ ÓRAREND 15 MÁSODPERCE. Ez a hívás a Google-visszatérés
//! kérésében fut: ameddig vár, addig a diák egy fehér lapot néz. Ha a lista
//! nem jön meg időben, az nem hiba — lásd `resolveSchoolIdentity`, a
//! „nem elérhető" ág nem minősít vissza senkit.
const TEACHERS_FETCH_TIMEOUT_MS = 5_000;

function isTeacherRecord(value: unknown): value is TeacherRecord {
  if (typeof value !== "object" || value === null) return false;
  const { short, name } = value as { short?: unknown; name?: unknown };
  return (
    typeof short === "string" &&
    short.trim() !== "" &&
    typeof name === "string" &&
    name.trim() !== ""
  );
}

/**
 * A tanárlista a Jedlikinfóból. `null` = nem elérhető (hálózati hiba, nem-200,
 * hibás JSON, nem tömb, vagy egyetlen értelmezhető sor sincs benne).
 *
 * A HIBÁS ALAKÚ SOROK KIESNEK, A TÖBBI MARAD. Egy rossz sor ne vigye el az
 * egész tantestület jogosultságát.
 */
export async function loadTeacherDirectory(): Promise<TeacherRecord[] | null> {
  try {
    const res = await fetch(TEACHERS_URL, {
      signal: AbortSignal.timeout(TEACHERS_FETCH_TIMEOUT_MS),
      //* Óránként egyszer — ugyanaz a ritmus, mint a `known-class.ts`-ben. A
      //* tantestület tanév közben alig változik, a belépés viszont gyakori.
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    const raw: unknown = await res.json();
    if (!Array.isArray(raw)) return null;
    const teachers = raw.filter(isTeacherRecord);
    return teachers.length > 0 ? teachers : null;
  } catch {
    return null;
  }
}

export type TeacherLookup =
  | { status: "matched"; teacher: TeacherRecord }
  | { status: "no-match" }
  //! A „NEM TUDJUK" NEM UGYANAZ, MINT A „NEM TANÁR". Külön ág, hogy a hívó
  //! ne tudja véletlenül összemosni a kettőt.
  | { status: "unavailable" };

type GoogleAccount = {
  email: string | null | undefined;
  name: string | null | undefined;
};

export async function lookupTeacherForAccount(
  account: GoogleAccount,
): Promise<TeacherLookup> {
  //* Üres vagy egyszavas névre a lista le sem kell: úgysem lehet találat —
  //* kivéve a kézzel rögzített címet, ahol a név nem számít.
  const pinned = TEACHER_EMAIL_PINS.has(
    account.email?.trim().toLowerCase() ?? "",
  );
  if (!pinned && nameTokens(account.name).length < MIN_NAME_TOKENS) {
    return { status: "no-match" };
  }
  const directory = await loadTeacherDirectory();
  if (!directory) return { status: "unavailable" };
  const teacher = findTeacherForAccount(account, directory, TEACHER_EMAIL_PINS);
  return teacher ? { status: "matched", teacher } : { status: "no-match" };
}

/**
 * Kényelmi alak: a tanár, vagy `null`. `null`-t ad akkor is, ha a lista nem
 * elérhető — JOGOSULTSÁG MÓDOSÍTÁSÁHOZ ezért a `resolveSchoolIdentity`-t
 * használd, ami a kettőt megkülönbözteti.
 */
export async function findTeacherForGoogleAccount(
  account: GoogleAccount,
): Promise<TeacherRecord | null> {
  const lookup = await lookupTeacherForAccount(account);
  return lookup.status === "matched" ? lookup.teacher : null;
}

export type SchoolIdentityFields = {
  isTeacher: boolean;
  teacherName: string | null;
};

/**
 * Mit kell a felhasználóra írni egy Google-fiókos belépésnél.
 *
 * - `@students.jedlik.eu` → diák: `{ isTeacher: false, teacherName: null }`
 *   (hálózat nélkül).
 * - `@jedlik.eu` + kézi rögzítés (`teacher-pins.ts`) vagy egyértelmű
 *   névtalálat a tanárlistában →
 *   `{ isTeacher: true, teacherName: <a LISTA neve, nem a Google-é> }`.
 * - `@jedlik.eu`, a lista megjött, de nincs találat →
 *   `{ isTeacher: false, teacherName: null }`.
 * - `null` = NE ÍRJ SEMMIT. Ez két esetben jön:
 *     • nem iskolai Google-cím — ide tartozik az AD-fiókok szintetikus
 *       `@jedlik-ad.invalid` címe is, akiknek a tanár-státuszát az iskolai
 *       AD mondja meg (`auth-jedlik.ts`), és azt ez a modul nem írhatja felül;
 *     • `@jedlik.eu`, de a tanárlista épp NEM ELÉRHETŐ. Egy Jedlikinfo-leállás
 *       nem ok arra, hogy egy tanárt diákká minősítsünk. Új fióknál ilyenkor
 *       az oszlop alapértéke (`false`/`null`) marad, és a következő belépés
 *       pótolja.
 */
export async function resolveSchoolIdentity(input: {
  email: string | null | undefined;
  name: string | null | undefined;
}): Promise<SchoolIdentityFields | null> {
  const role = schoolRoleForEmail(input.email);
  if (role === null) return null;
  if (role === "student") return { isTeacher: false, teacherName: null };

  const lookup = await lookupTeacherForAccount(input);
  switch (lookup.status) {
    case "matched":
      return { isTeacher: true, teacherName: lookup.teacher.name };
    case "no-match":
      return { isTeacher: false, teacherName: null };
    case "unavailable":
      return null;
  }
}
