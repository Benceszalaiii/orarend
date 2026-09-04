//! AZ ÓRAREND ELEMZŐJE — EGY PÉLDÁNYBAN. Ez a modul a böngészőben és a
//! szerveren is fut: az órarend-értesítéseket kiszámoló háttérfeladat
//! (`/api/ertesites/tick`) UGYANAZT az elemzőt használja, mint a lap; egy
//! második, önálló másolat előbb-utóbb más órarendet mutatna, mint amit a diák
//! a képernyőn lát. Hogy az API útja mindkét oldalon jó legyen, azt egyetlen
//! hely dönti el: `jedlik-api.ts`.

import { API_BASE, FETCH_TIMEOUT_MS, JEDLIK_API_ORIGIN } from "./jedlik-api";
import { notifyPrefsChanged } from "./prefs-events";
import {
  loadDayBells,
  loadRingSystemNames,
  loadSchoolPlan,
  type SchoolDayPlan,
} from "./school-calendar";

export { JEDLIK_API_ORIGIN };

export const TIME_ZONE = "Europe/Budapest";
export const PUBLIC_DEFAULT_CLASS = "13C";

//* ---------------------------------------------------------------------------
//* KINEK AZ ÓRARENDJE — OSZTÁLYÉ VAGY TANÁRÉ
//* ---------------------------------------------------------------------------
//! UGYANAZ A FORRÁS, UGYANAZ A VÁLASZ, MÁS ALANY. A `timetable/cards` végpont
//! HÁROM szűrőt ismer (`class`, `teacher`, `classroom`), és mindháromra
//! ugyanolyan alakú kártyákat ad vissza — csak a kártya két alsó sarkának
//! JELENTÉSE cserélődik meg (lásd `cardSubject` lentebb). Ezért nincs külön
//! „tanári elemző": egyetlen modul tudja mindkettőt, és így nem tud a két
//! nézet elcsúszni egymástól.
//*
//* A `classroom` szándékosan nincs bevezetve: terem-órarendre eddig nem volt
//* kérés, és egy nem használt harmadik ág csak abban segítene, hogy némán
//* elromoljon.
export type TimetableSubjectKind = "class" | "teacher";

/** Az órarend alanya — egy osztály vagy egy tanár, ahogy a forrás nevezi. */
export type TimetableSubject = { short: string; name: string };

//* A régi név megmarad: az osztály-nézet kódja mindenütt ezt használja, és a
//* két típus SZÓ SZERINT ugyanaz — a forrás mindkét listát `{short, name}`
//* alakban adja.
export type TimetableClass = TimetableSubject;

//! MELYIK LISTA MELYIK VÉGPONTON VAN. Egy helyen, mert a lista és a
//! kártya-lekérés szűrője együtt jár: ha az egyik elcsúszna, a másik némán egy
//! üres órarendet adna vissza.
const SUBJECT_PATH: Record<TimetableSubjectKind, string> = {
  class: "timetable/classes",
  teacher: "timetable/teachers",
};

//* A felületen megjelenő szavak. A hibaüzenetek és a felszólítások mind innen
//* veszik a nevet — így egy „osztály" felirat nem maradhat ott a tanári lapon.
export const SUBJECT_WORDS: Record<
  TimetableSubjectKind,
  {
    /** „osztály" / „tanár" — alanyeset, kisbetűvel. */
    one: string;
    /** Ugyanaz nagy kezdőbetűvel: gombfelirat, `aria-label`. */
    oneCapital: string;
    /** „osztálylista" / „tanárlista". */
    list: string;
    /** „az osztálylistájában" / „a tanárlistájában" — ragozva. */
    listIn: string;
    /** Tárgyeset: „osztályt" / „tanárt". */
    accusative: string;
  }
> = {
  class: {
    one: "osztály",
    oneCapital: "Osztály",
    list: "osztálylista",
    listIn: "osztálylistájában",
    accusative: "osztályt",
  },
  teacher: {
    one: "tanár",
    oneCapital: "Tanár",
    list: "tanárlista",
    listIn: "tanárlistájában",
    accusative: "tanárt",
  },
};

//* A korábban kiválasztott osztály/tanár megjegyzése: frissítéskor ne vesszen
//* el az utolsó választás, ha a képernyőt ismételten megnyitják.
const SUBJECT_STORAGE_KEY: Record<TimetableSubjectKind, string> = {
  class: "orarend:class:v1",
  teacher: "orarend:teacher:v1",
};

export function loadCachedSubject(
  kind: TimetableSubjectKind,
): string | null {
  try {
    return window.localStorage.getItem(SUBJECT_STORAGE_KEY[kind]);
  } catch {
    return null;
  }
}

export function saveCachedSubject(
  kind: TimetableSubjectKind,
  short: string,
): void {
  try {
    window.localStorage.setItem(SUBJECT_STORAGE_KEY[kind], short);
    notifyPrefsChanged();
  } catch {
    /* privát módban nincs tárhely — a választás ekkor nem marad meg */
  }
}

export function loadCachedClass(): string | null {
  return loadCachedSubject("class");
}

export function saveCachedClass(short: string): void {
  saveCachedSubject("class", short);
}

export function loadCachedTeacher(): string | null {
  return loadCachedSubject("teacher");
}

export function saveCachedTeacher(short: string): void {
  saveCachedSubject("teacher", short);
}

//! ─── EGY KULCSTÉR, KÉT ALANY ───────────────────────────────────────────────
//! A helyi tárolók (heti gyorsítótár, összevonási döntések, duális beosztás)
//! mind egyetlen szöveges kulcsra járnak, és eddig ez a kulcs az OSZTÁLY jele
//! volt. A tanár rövid jele (`AA`, `BNM`) alakra nem ütközik egyetlen
//! osztálynévvel sem (azok számjeggyel kezdődnek) — a névtér mégis kimondott,
//! nem véletlen: egy jövőbeli harmadik alany (terem) így nem tud csendben
//! ráírni egy osztály beállításaira.
export function subjectStoreKey(
  kind: TimetableSubjectKind,
  short: string,
): string {
  if (!short) return "";
  return kind === "teacher" ? `tanar:${short}` : short;
}

//* ---------------------------------------------------------------------------
//* HIBÁK
//*
//! Az órarend adatait NEM mi állítjuk elő: a Jedlikinfo API-ról jönnek. Ha ott
//! valami elromlik, a felhasználó ezen az oldalon látja a hibát — ezért minden
//! üzenetnek meg kell mondania, hogy KINÉL van a baj, és van-e értelme várni.
//! Egyetlen „valami hiba történt" felirat helyett a hiba fajtáját visszük végig.
//* ---------------------------------------------------------------------------

export const TIMETABLE_SOURCE = "Jedlikinfo";
export const TIMETABLE_SOURCE_HOST = "jedlikinfo.jedlik.eu";

export type TimetableErrorKind =
  //* nincs (vagy nem ismerhető fel) osztály/tanár — nálunk van a labda
  | "no-class"
  //* a kért osztály/tanár nincs a Jedlikinfo listájában
  | "unknown-class"
  | "offline" //* az eszköz van hálózat nélkül
  | "network" //* a Jedlikinfo nem érhető el
  | "timeout" //* elérhető, de nem válaszolt időben
  | "server" //* 5xx — a Jedlikinfo hibát jelzett
  | "request" //* 4xx — a kérést utasította el
  | "payload"; //* válaszolt, de értelmezhetetlent

export type TimetableError = {
  kind: TimetableErrorKind;
  /** Rövid cím: mi történt. */
  title: string;
  /** Egy mondat arról, hogy ez mit jelent és kinél van a hiba. */
  message: string;
  /** Mit tehet ilyenkor a felhasználó. */
  hint?: string;
  /** Technikai részlet (HTTP-kód, kivétel neve) — hibajelentéshez. */
  detail?: string;
  /** Van-e értelme az „Újra” gombnak. */
  retryable: boolean;
};

//* Minden külső eredetű hiba ugyanezt a mondatot viseli, hogy a felhasználó
//* egy pillanat alatt lássa: nem ő rontott el semmit, és nem is ez az oldal.
const EXTERNAL = "a hiba külső forrás miatt állt elő";

export function timetableOffline(): TimetableError {
  return {
    kind: "offline",
    title: "Nincs internetkapcsolat",
    message: `Az eszközöd offline, ezért a ${TIMETABLE_SOURCE} API nem érhető el.`,
    hint: "Kapcsolódj újra a hálózathoz, majd nyomd meg az Újra gombot.",
    retryable: true,
  };
}

function timetableTimeout(): TimetableError {
  return {
    kind: "timeout",
    title: `A ${TIMETABLE_SOURCE} API nem válaszol`,
    message: `A ${TIMETABLE_SOURCE} API ${Math.round(FETCH_TIMEOUT_MS / 1000)} másodpercen belül nem válaszolt — ${EXTERNAL}.`,
    hint: "Az iskolai szerver ilyenkor túlterhelt vagy karbantartás alatt van. Próbáld újra pár perc múlva.",
    detail: `időtúllépés ${FETCH_TIMEOUT_MS} ms után`,
    retryable: true,
  };
}

function timetableUnreachable(detail?: string): TimetableError {
  return {
    kind: "network",
    title: `A ${TIMETABLE_SOURCE} API nem érhető el`,
    message: `A ${TIMETABLE_SOURCE} API nem érhető el — ${EXTERNAL}, nem ezen az oldalon.`,
    hint: `Ha az internetkapcsolatod működik, akkor a ${TIMETABLE_SOURCE_HOST} nem válaszol. Próbáld újra később.`,
    detail,
    retryable: true,
  };
}

function timetablePayload(detail?: string): TimetableError {
  return {
    kind: "payload",
    title: `Értelmezhetetlen válasz a ${TIMETABLE_SOURCE} API-tól`,
    message: `A ${TIMETABLE_SOURCE} API a vártól eltérő adatot küldött — ${EXTERNAL}.`,
    hint: `Ha ez tartósan így marad, valószínűleg megváltozott a ${TIMETABLE_SOURCE} API. Ilyenkor az újratöltés sem segít.`,
    detail,
    retryable: true,
  };
}

//! A HTTP-kód a leghasznosabb dolog, amit a felhasználó továbbadhat, ha jelent
//! egy hibát — ezért mindig kiírjuk, akkor is, ha neki magának nem mond semmit.
function timetableHttp(status: number, statusText?: string): TimetableError {
  const detail = `HTTP ${status}${statusText ? ` ${statusText}` : ""}`;
  if (status >= 500) {
    return {
      kind: "server",
      title: `A ${TIMETABLE_SOURCE} API hibát jelzett`,
      message: `A ${TIMETABLE_SOURCE} szervere hibával válaszolt (${detail}) — ${EXTERNAL}, nem ezen az oldalon.`,
      hint: "Ez rendszerint magától rendeződik. Próbáld újra néhány perc múlva.",
      detail,
      retryable: true,
    };
  }
  if (status === 429) {
    return {
      kind: "request",
      title: "Túl sok kérés",
      message: `A ${TIMETABLE_SOURCE} API átmenetileg korlátozza a lekérdezéseket (${detail}) — ${EXTERNAL}.`,
      hint: "Várj egy kicsit, mielőtt újra próbálod.",
      detail,
      retryable: true,
    };
  }
  if (status === 401 || status === 403) {
    return {
      kind: "request",
      title: `A ${TIMETABLE_SOURCE} API elutasította a kérést`,
      message: `A ${TIMETABLE_SOURCE} API nem engedélyezte a lekérdezést (${detail}) — ${EXTERNAL}.`,
      hint: "Elképzelhető, hogy az órarend csak iskolai belépéssel érhető el.",
      detail,
      retryable: false,
    };
  }
  if (status === 404) {
    return {
      kind: "request",
      title: "Nincs ilyen órarend",
      message: `A ${TIMETABLE_SOURCE} API nem találta a kért órarendet (${detail}).`,
      hint: "Ellenőrizd a kiválasztott alanyt és a hetet.",
      detail,
      retryable: false,
    };
  }
  return {
    kind: "request",
    title: `A ${TIMETABLE_SOURCE} API elutasította a kérést`,
    message: `A ${TIMETABLE_SOURCE} API hibás kérésként utasította el a lekérdezést (${detail}) — ${EXTERNAL}.`,
    detail,
    retryable: true,
  };
}

//! A `fetch` mindenféle okból dobhat; a névből (`TimeoutError`, `AbortError`,
//! `TypeError`) derül ki, hogy a hálózat, az időkorlát vagy a válasz feldolgozása
//! bukott el. Ezt itt EGY helyen fordítjuk le emberi mondatra.
export function describeTimetableFailure(err: unknown): TimetableError {
  const name = err instanceof Error ? err.name : "";
  if (name === "TimeoutError" || name === "AbortError") {
    return timetableTimeout();
  }
  if (name === "SyntaxError") {
    return timetablePayload("a válasz nem érvényes JSON");
  }
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return timetableOffline();
  }
  return timetableUnreachable(
    err instanceof Error && err.message ? `${name}: ${err.message}` : undefined,
  );
}

type RawCard = {
  date: string;
  dateValue: string;
  fromPeriod: number;
  periodsCount: number;
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
  text: string;
  textTitle: string;
  rightBottom: string;
  rightBottomTitle: string;
  leftBottom: string;
  leftBottomTitle: string;
  centerTop: string;
  groupName: string;
  groupColumn: number;
  groupCount: number;
  week: string;
  dayOfWeek: number;
  startMinuteFromMidnight: number;
  endMinuteFromMidnight: number;
  //! A JEDLIKINFO SAJÁT „ÁTHELYEZVE" JELÖLÉSE. Nincs helyettesítés-végpont
  //! (`timetable/substitutions` → 404), ez az EGYETLEN elsődleges forrásból jövő
  //! jelzés arról, hogy egy óra elmozdult a rendes helyéről. Ritkán van
  //! bekapcsolva — ezért a rá épülő figyelmeztetésnek akkor is értelmesnek kell
  //! lennie, amikor egyetlen óra sincs megjelölve.
  movedCard?: boolean;
  //* `"class"` a tanóra; egyéb értékek (vizsga, rendezvény) előfordulhatnak,
  //* ezért nyitva hagyjuk.
  type?: string;
};

type RawPeriod = {
  number: number;
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
};

type RawDay = {
  name: string;
  date: string;
  week: string;
  dayOfWeek: number;
};

type RawCardsResponse = {
  full: boolean;
  fromDate: string;
  toDate: string;
  cards: RawCard[];
  days: RawDay[];
  periods: RawPeriod[];
};

export type TimetablePeriod = {
  number: number;
  startMin: number;
  endMin: number;
};

export type TimetableDay = {
  name: string;
  dateKey: string;
  dateLabel: string;
  week: string;
  dayOfWeek: number;
  isToday: boolean;
  //! ─── AMIT A TANÉV RENDJE TUD, AZ ÓRAREND VISZONT NEM ─────────────────────
  //! A `timetable/cards` a kártyákat adja, és nem mond semmit arról, MILYEN nap
  //! van: hogy tanítás van-e egyáltalán, hogy rövidítettek-e az órák, és hogy
  //! történik-e aznap valami az iskolában. Ez a három mező a
  //! `timetable/calendarplan` és a `timetable/ringsystem` válaszából jön (lásd
  //! `school-calendar.ts`), és mindegyik ELMARADHAT: ha az a két kérés nem
  //! sikerül, a nap pontosan úgy néz ki, mint eddig.
  /** Tanítási nap-e a tanév rendje szerint. `null` = nem tudjuk. */
  teaching: boolean | null;
  /** A tanév rendjének bejegyzései erre a napra (iskolai események). */
  notes: string[];
  //! CSAK AZ ELTÉRÉS KERÜL IDE. Ha a nap a hét szokásos csengetési rendjén megy,
  //! ez `null`: a rács a hét közös rendjével rajzol, és nincs mit jelölni. Ami
  //! itt áll, az mindig HÍR — rövidített órák, más kezdés.
  bells: {
    id: number;
    /** A rend neve a forrás szerint („30 perces órák"). */
    name: string;
    /** A napra érvényes csengetés; üres, ha a nevét tudjuk, a rendjét nem. */
    periods: TimetablePeriod[];
  } | null;
};

export type TimetableLesson = {
  key: string;
  //* A NAP, amelyre az óra esik (`YYYY-MM-DD`). A heti rács a `dayOfWeek`-kel
  //* dolgozik, a napi nézetnek viszont a dátum kell — a kártya amúgy is hozza.
  dateKey: string;
  dayOfWeek: number;
  startMin: number;
  endMin: number;
  subject: string;
  subjectShort: string;
  //! A KÁRTYA „MÁSIK FELE" — ÉS EZ NÉZETENKÉNT MÁS. Az OSZTÁLY órarendjén a
  //! kérdés az, ki tartja az órát: ott a tanár áll a kártyán, és az osztály
  //! magától értetődik. A TANÁR órarendjén fordítva: a tanár magától értetődik
  //! (ő nézi), a hír az, MELYIK OSZTÁLYHOZ megy be. Ezért a két mező nem
  //! egymás alternatívája, hanem egyszerre van jelen — mindig az van kitöltve,
  //! amelyik az adott nézetben MOND valamit, a másik üres.
  teacher: string;
  teacherShort: string;
  /** Az osztály jele (`09B`) — a TANÁR nézetében; osztály-nézetben üres. */
  classShort: string;
  /** Az osztály teljes neve, ha a forrás mást ad, mint a jelét. */
  className: string;
  room: string;
  group: string;
  groupColumn: number;
  groupCount: number;
  //! CSAK EGY CSOPORTÉ, VAGY AZ EGÉSZ OSZTÁLYÉ — EZT A FORRÁS MEGMONDJA.
  //! Az egész osztályos kártyán `groupCount === 1` (a csoport neve ilyenkor
  //! „Egész osztály"), a bontott órán 2 vagy több, és a `groupColumn` mondja
  //! meg, hányadik csoporté. Nem mi következtetjük ki: ebből a két mezőből
  //! derül ki, hogy egy óra elrejthető-e („ez nem az én csoportom"), és hogy a
  //! rácson fél oszlopot kap-e.
  wholeClass: boolean;
  week: string;
  //* A forrás „áthelyezve" jelölése, változatlanul továbbadva. Nem mi
  //* következtetjük ki: vagy a Jedlikinfo mondja, vagy nincs.
  moved: boolean;
  //* A kártya fajtája a forrás szerint (rendszerint `"class"`).
  kind: string;
};

//! MELYIK FÉL OSZLOP A CSOPORTÉ. A bontott óra fél oszlopot kap a rácson — de
//! ez csak akkor mond igazat, ha ugyanaz a csoport MINDIG ugyanazon az oldalon
//! áll. Ezért nem a rajzolás sorrendje dönt, hanem a forrás oszlop-indexe: a
//! bontás első fele bal, a második jobb. Egész osztályos órán nincs oldal —
//! az a teljes oszlopot birtokolja.
export function groupHalf(lesson: {
  wholeClass: boolean;
  groupColumn: number;
  groupCount: number;
}): 0 | 1 | null {
  if (lesson.wholeClass || lesson.groupCount <= 1) return null;
  return lesson.groupColumn * 2 >= lesson.groupCount ? 1 : 0;
}

//! A NAPRA ÉRVÉNYES CSENGETÉSI REND — EGY HELYEN ELDÖNTVE. A hét `periods`
//! tömbje a szokásos rend; a kilógó napé a napon áll (lásd
//! `withSchoolCalendar`). Minden nézet — a heti rács, a napi lap, a heti
//! összesítés — ugyanezt a választ kapja, különben ugyanarra a rövidített
//! napra más-más órahatárokat számolnának.
export function periodsOfDay(
  week: { periods: TimetablePeriod[] },
  day: Pick<TimetableDay, "bells">,
): TimetablePeriod[] {
  return day.bells && day.bells.periods.length > 0
    ? day.bells.periods
    : week.periods;
}

export type TimetableWeek = {
  ok: boolean;
  error?: TimetableError;
  /** Kinek az órarendje ez — osztályé vagy tanáré. */
  kind: TimetableSubjectKind;
  //! AZ ALANY NEVE NEM „AZ OSZTÁLY". Amíg egyetlen nézet volt, a mező
  //! `resolvedClass` néven futott; a tanári rács fölött ez a név HAZUDNA — és
  //! ez a modul pont attól használható két nézetre, hogy sehol nem állít
  //! többet, mint amit tud.
  subject: TimetableSubject | null;
  weekStart: string;
  days: TimetableDay[];
  periods: TimetablePeriod[];
  lessons: TimetableLesson[];
};

function pad(n: number) {
  return n < 10 ? `0${n}` : `${n}`;
}

function parseDateKey(dateKey: string): string {
  return dateKey.replaceAll(".", "-").slice(0, 10);
}

export function mondayOf(dateKey?: string): string {
  const base = dateKey ? parseDateKey(dateKey) : dateToKey(new Date());
  const [y, m, d] = base.split("-").map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d));
  const isoDow = ((utc.getUTCDay() + 6) % 7) + 1;
  utc.setUTCDate(utc.getUTCDate() - (isoDow - 1));
  return utc.toISOString().slice(0, 10);
}

export function addDays(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d));
  utc.setUTCDate(utc.getUTCDate() + days);
  return utc.toISOString().slice(0, 10);
}

function dateToKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function toDateKey(apiDate: string): string {
  return apiDate.replaceAll(".", "-").slice(0, 10);
}

function classKey(value: string): string {
  const trimmed = value.trim().toUpperCase();
  const match = trimmed.match(/^(\d{1,2})\s*[.\-/]?\s*([A-ZÁÉÍÓÖŐÚÜŰ]+)$/);
  if (match) {
    return `${pad(Number(match[1]))}${match[2]}`;
  }
  return trimmed.replace(/\s+/g, "");
}

export type TimetableSubjectList = {
  subjects: TimetableSubject[];
  error?: TimetableError;
};

//* A régi hívók az `classes` néven olvassák ugyanezt a listát.
export type TimetableClassList = {
  classes: TimetableClass[];
  error?: TimetableError;
};

//! A LISTA HIBÁJA IS SZÁMÍT: ha nincs osztály- (vagy tanár-) lista, a választó
//! üresen marad, és a felhasználónak tudnia kell, hogy ez sem az ő hibája.
//! Ezért a hiba itt nem vész el — a hívó dönti el, mutatja-e.
export async function fetchTimetableSubjects(
  kind: TimetableSubjectKind,
): Promise<TimetableSubjectList> {
  const words = SUBJECT_WORDS[kind];
  try {
    const res = await fetch(`${API_BASE}/${SUBJECT_PATH[kind]}`, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) {
      return { subjects: [], error: timetableHttp(res.status, res.statusText) };
    }
    const data = (await res.json()) as TimetableSubject[];
    if (!Array.isArray(data)) {
      return {
        subjects: [],
        error: timetablePayload(`a ${words.list} nem tömb`),
      };
    }
    return { subjects: data };
  } catch (err) {
    return { subjects: [], error: describeTimetableFailure(err) };
  }
}

export async function fetchTimetableClasses(): Promise<TimetableClassList> {
  const { subjects, error } = await fetchTimetableSubjects("class");
  return { classes: subjects, error };
}

export async function fetchTimetableTeachers(): Promise<TimetableSubjectList> {
  return fetchTimetableSubjects("teacher");
}

export async function getTimetableClasses(): Promise<TimetableClass[]> {
  return (await fetchTimetableClasses()).classes;
}

export async function getTimetableTeachers(): Promise<TimetableSubject[]> {
  return (await fetchTimetableTeachers()).subjects;
}

type ResolvedSubject = {
  resolved: TimetableSubject | null;
  error?: TimetableError;
};

//! ─── AZ ALANY FELISMERÉSE ──────────────────────────────────────────────────
//! Az osztályt a diák sokféleképp írhatja le („13.C", „13 c", „13C"), ezért
//! ott egy alaknormalizálás dönt (`classKey`). A TANÁR rövid jele (`AA`,
//! `BNM`, `GÉ`) viszont nem gépelős mező: a listából választják ki. Ami mégis
//! érkezhet — egy másik készülékről szinkronizált, azóta megszűnt jel, vagy
//! kézzel írt cím — arra a kisbetű/nagybetű és a NÉV szerinti egyezés a
//! tartalék; találgatni nem találgatunk.
function subjectKey(kind: TimetableSubjectKind, value: string): string {
  return kind === "class"
    ? classKey(value)
    : value.trim().toLocaleUpperCase("hu");
}

async function resolveSubjectResult(
  kind: TimetableSubjectKind,
  input: string | null | undefined,
): Promise<ResolvedSubject> {
  const words = SUBJECT_WORDS[kind];
  if (!input?.trim()) {
    return {
      resolved: null,
      error: {
        kind: "no-class",
        title: `Nincs kiválasztott ${words.one}`,
        message:
          kind === "class"
            ? "Nincs beállítva (vagy nem ismerhető fel) az osztályod."
            : "Nincs kiválasztva, kinek az órarendjét mutassuk.",
        hint: `Válaszd ki a(z) ${words.accusative} a fenti listából.`,
        retryable: false,
      },
    };
  }
  const { subjects, error: listError } = await fetchTimetableSubjects(kind);
  //! Ha maga a lista sem jött meg, NEM állunk meg: az órarend-kérés lehet, hogy
  //! így is sikerül. Ha mégsem, a kártyák hibája úgyis pontosabb lesz ennél.
  if (subjects.length === 0) {
    const guess = subjectKey(kind, input);
    return { resolved: { short: guess, name: guess }, error: listError };
  }
  const wanted = subjectKey(kind, input);
  const exact = subjects.find((c) => c.short === input.trim());
  if (exact) return { resolved: exact };
  const byKey = subjects.find((c) => subjectKey(kind, c.short) === wanted);
  if (byKey) return { resolved: byKey };
  //* Csak a tanárnál: a teljes név is azonosít („Ágoston Anett"). Az iskolai
  //* belépés ezt adja vissza, nem a rövid jelet — lásd `/tanari`.
  if (kind === "teacher") {
    const byName = subjects.find(
      (c) => c.name.toLocaleLowerCase("hu") === input.trim().toLocaleLowerCase("hu"),
    );
    if (byName) return { resolved: byName };
  }
  return {
    resolved: null,
    error: {
      kind: "unknown-class",
      title: `Ismeretlen ${words.one}`,
      message: `A(z) „${input.trim()}” ${words.one} nincs a ${TIMETABLE_SOURCE} ${words.listIn}.`,
      hint: `Válassz a listából egy létező ${words.accusative}.`,
      detail: `${subjects.length} elem a listában`,
      retryable: false,
    },
  };
}

export async function resolveClass(
  input: string | null | undefined,
): Promise<TimetableClass | null> {
  return (await resolveSubjectResult("class", input)).resolved;
}

export async function resolveTeacher(
  input: string | null | undefined,
): Promise<TimetableSubject | null> {
  return (await resolveSubjectResult("teacher", input)).resolved;
}

//* ---------------------------------------------------------------------------
//* A NAPOK KÖRÜLMÉNYEI — TANÉV RENDJE + CSENGETÉSI REND
//* ---------------------------------------------------------------------------
//! MIÉRT KELL EGYÁLTALÁN. A `timetable/cards` válaszában a `periods` MINDIG a
//! szokásos csengetést írja le, akkor is, ha aznap rövidítettek az órák — a
//! kártyák ideje viszont a valódi renddel jön. Ilyenkor a rács vonalai és a
//! rájuk rajzolt kártyák ELLENTMONDANAK egymásnak, és a diák a vonalnak hisz.
//! A tanév rendje mondja meg, melyik napon melyik rend van érvényben; az
//! eltérő napokra a tényleges csengetést is lekérjük.
//!
//! CSAK AZ ELTÉRÉSRE KÉRDEZÜNK RÁ. Rendes héten mind az öt nap ugyanazon a
//! renden megy — ott a hét közös `periods` tömbje pontos, és EGYETLEN további
//! kérés sem indul. Ha egy nap kilóg a hét többi napja közül, csak arra az
//! egyre kérjük le a csengetést.
//* Ennek egy határa van, és vállaljuk: ha a hét MINDEN napja ugyanarra az
//* eltérő rendre váltana, nem lenne mihez képest kilógnia — ilyet a tanév
//* rendjében egyszer sem találtunk, és a kártyák ideje ekkor is helyes marad.
function samePeriods(a: TimetablePeriod[], b: TimetablePeriod[]): boolean {
  return (
    a.length === b.length &&
    a.every(
      (p, i) =>
        p.number === b[i].number &&
        p.startMin === b[i].startMin &&
        p.endMin === b[i].endMin,
    )
  );
}

async function withSchoolCalendar(
  days: TimetableDay[],
  weekPeriods: TimetablePeriod[],
): Promise<TimetableDay[]> {
  const plan = await loadSchoolPlan(days.map((d) => d.dateKey));
  if (plan.size === 0) return days;

  //* A hét „szokásos" rendje a legtöbb napon érvényes rend — a rács vonalzója ezt
  //* mutatja. Holtversenynél a kisebb azonosító nyer, hogy a válasz ne a napok
  //* sorrendjén múljon.
  const counts = new Map<number, number>();
  for (const day of days) {
    const id = plan.get(day.dateKey)?.ringSystemId;
    if (typeof id === "number") counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  const baseline =
    [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0] ??
    null;

  const odd = days.filter((day) => {
    const id = plan.get(day.dateKey)?.ringSystemId;
    return typeof id === "number" && id !== baseline;
  });

  const [names, bells] = await Promise.all([
    odd.length > 0 ? loadRingSystemNames() : new Map<number, string>(),
    Promise.all(
      odd.map(
        async (day) => [day.dateKey, await loadDayBells(day.dateKey)] as const,
      ),
    ).then((entries) => new Map(entries)),
  ]);

  return days.map((day) => {
    const planned: SchoolDayPlan | undefined = plan.get(day.dateKey);
    if (!planned) return day;
    const id = planned.ringSystemId;
    const dayPeriods = bells.get(day.dateKey) ?? null;
    //! A JELÖLÉS CSAK AKKOR HÍR, HA TÉNYLEG MÁS. Két rend viselhet külön
    //! azonosítót azonos csengetéssel — abból a diáknak semmi nem következik,
    //! és egy hamis „rövidített órák" jelvény rosszabb, mint a semmi.
    const differs =
      typeof id === "number" &&
      id !== baseline &&
      (dayPeriods === null || !samePeriods(dayPeriods, weekPeriods));
    return {
      ...day,
      teaching: planned.teaching,
      notes: planned.notes,
      bells:
        differs && typeof id === "number"
          ? {
              id,
              name: names.get(id) ?? `${id}. csengetési rend`,
              periods: dayPeriods ?? [],
            }
          : null,
    };
  });
}

export async function getTimetableWeek(options: {
  //! MELYIK ALANY — ÉS EZ MARADHAT KIMONDATLAN. A régi hívók (`/ma`, az
  //! értesítés-számoló) osztályt kérnek, és nem is tudnak másról; nekik a
  //! hiányzó `kind` továbbra is „osztály".
  kind?: TimetableSubjectKind;
  /** Az osztály jele — `kind: "class"` (vagy hiányzó `kind`) esetén. */
  class?: string | null;
  /** A tanár rövid jele vagy neve — `kind: "teacher"` esetén. */
  teacher?: string | null;
  weekStart?: string;
}): Promise<TimetableWeek> {
  const kind: TimetableSubjectKind = options.kind ?? "class";
  const wanted = kind === "teacher" ? options.teacher : options.class;
  const words = SUBJECT_WORDS[kind];
  const weekStart = mondayOf(options.weekStart);
  const { resolved, error: resolveError } = await resolveSubjectResult(
    kind,
    wanted,
  );

  const empty: TimetableWeek = {
    ok: false,
    kind,
    subject: resolved,
    weekStart,
    days: [],
    periods: [],
    lessons: [],
  };

  if (!resolved) {
    return { ...empty, error: resolveError ?? timetableUnreachable() };
  }

  let data: RawCardsResponse;
  try {
    const res = await fetch(`${API_BASE}/timetable/cards`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      //! A HÁROM SZŰRŐBŐL PONTOSAN EGY VAN KITÖLTVE. A végpont mindhármat
      //! ismeri, és ami üresen marad, arra nem szűkít — két kitöltött mezőből
      //! nem metszet lesz, hanem kiszámíthatatlan válasz.
      body: JSON.stringify({
        class: kind === "class" ? resolved.short : "",
        classroom: "",
        teacher: kind === "teacher" ? resolved.short : "",
        full: false,
        fromDate: weekStart,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) {
      return { ...empty, error: timetableHttp(res.status, res.statusText) };
    }
    data = (await res.json()) as RawCardsResponse;
  } catch (err) {
    return { ...empty, error: describeTimetableFailure(err) };
  }

  //! Az API 200-nal is küldhet olyat, amiben nincs se nap, se csengetési rend
  //! (pl. szünet, vagy elrontott osztálynév). Üres rács helyett — amiről nem
  //! derül ki, hogy hiba-e — ezt is nevesített hibaként mutatjuk meg.
  if (!Array.isArray(data?.days) || data.days.length === 0) {
    return {
      ...empty,
      error: {
        kind: "payload",
        title: "Nincs adat erre a hétre",
        message: `A ${TIMETABLE_SOURCE} API nem küldött órarendet erre a hétre (${words.one}: ${resolved.short}).`,
        hint: "Lehet, hogy szünet van, vagy még nincs feltöltve a hét. Nézz meg egy másik hetet.",
        detail: `hét: ${weekStart}`,
        retryable: true,
      },
    };
  }

  const todayKey = dateToKey(new Date());

  const rawDays: TimetableDay[] = (data.days ?? []).map((d) => {
    const dateKey = toDateKey(d.date);
    return {
      name: d.name,
      dateKey,
      dateLabel: dateKey.slice(5).replace("-", ".").concat("."),
      week: d.week ?? "",
      dayOfWeek: d.dayOfWeek,
      isToday: dateKey === todayKey,
      //* Alapállapot: amit a kártyák válaszából tudunk, és semmi többet. A
      //* tanév rendje ezután kerül rá — ha megjön.
      teaching: null,
      notes: [],
      bells: null,
    };
  });

  const periods: TimetablePeriod[] = (data.periods ?? []).map((p) => ({
    number: p.number,
    startMin: p.startHour * 60 + p.startMinute,
    endMin: p.endHour * 60 + p.endMinute,
  }));

  //! A NAP KÖRÜLMÉNYEI KÜLÖN KÉRÉSBŐL JÖNNEK, ÉS EL IS MARADHATNAK. A hét
  //! ettől nem lesz kevésbé kész: a `withSchoolCalendar` a napokat adja vissza,
  //! nem hibát, és amit nem tudott meg, arról nem állít semmit.
  const days = await withSchoolCalendar(rawDays, periods);

  const dayWeekOf = new Map(days.map((d) => [d.dayOfWeek, d.week] as const));

  const cards = (data.cards ?? []).filter((c) => {
    const dayWeek = dayWeekOf.get(c.dayOfWeek) ?? "";
    if (!dayWeek || !c.week || c.week === "AB") return true;
    return c.week.includes(dayWeek);
  });

  const lessons =
    kind === "teacher" ? teacherLessons(cards) : cards.map(classLesson);

  return {
    ok: true,
    kind,
    subject: resolved,
    weekStart,
    days,
    periods,
    lessons,
  };
}

//* ---------------------------------------------------------------------------
//* A KÁRTYÁBÓL ÓRA — NÉZETENKÉNT MÁS OLVASAT
//* ---------------------------------------------------------------------------
//! A KÁRTYA KÉT ALSÓ SARKA NÉZETFÜGGŐ, ÉS EZT SEHOL NEM ÍRJÁK LE. A forrás
//! ugyanazt a `leftBottom` / `rightBottom` mezőpárt küldi mindkét lekérésre,
//! csak MÁST ért rajta:
//!
//!   osztály órarendje:  bal = TEREM,    jobb = TANÁR
//!   tanár órarendje:    bal = OSZTÁLY,  jobb = TEREM
//!
//! Ez nem következtetés: a `type` mező is ezt mondja (`"class"` / `"teacher"`),
//! és a válaszok végignézve egyetlen kivétel sincs. Ha valaha megfordulna, ez
//! az a két függvény, ami hazudni kezd — máshol nem kell keresni.
function baseLesson(c: RawCard) {
  return {
    dateKey: toDateKey(c.date),
    dayOfWeek: c.dayOfWeek,
    startMin: c.startMinuteFromMidnight,
    endMin: c.endMinuteFromMidnight,
    subject: c.textTitle || c.text,
    subjectShort: c.text,
    week: c.week,
    //* A forrás „áthelyezve" jelölése, változatlanul továbbadva. Nem mi
    //* következtetjük ki: vagy a Jedlikinfo mondja, vagy nincs.
    moved: c.movedCard === true,
    //* A kártya fajtája a forrás szerint (rendszerint `"class"`).
    kind: c.type ?? "class",
  };
}

function classLesson(c: RawCard): TimetableLesson {
  return {
    ...baseLesson(c),
    key: `${c.dayOfWeek}-${c.startMinuteFromMidnight}-${c.groupColumn}-${c.text}`,
    teacher: c.rightBottomTitle || c.rightBottom,
    teacherShort: c.rightBottom,
    //* Az osztály nézetében az osztály magától értetődik — nem írjuk ki.
    classShort: "",
    className: "",
    room: c.leftBottom,
    group: c.groupName,
    groupColumn: c.groupColumn,
    groupCount: c.groupCount,
    wholeClass: (c.groupCount ?? 1) <= 1,
  };
}

//! ─── A TANÁRNAK A CSOPORTBONTÁS NEM VÁLASZTÁS ──────────────────────────────
//! A diák órarendjén a bontott óra KÉRDÉS: melyik csoportba jársz? A rács
//! ezért fél oszlopot ad neki, és az összevonás gombja fel is teszi a kérdést.
//! A TANÁR órarendjén ugyanez az adat egészen mást jelent: ha egy osztály
//! három csoportját ő tartja, a forrás HÁROM kártyát küld — azonos időben,
//! azonos teremben, azonos tantárgyból. Nem három választható lehetőség: EGY
//! óra, amin ott kell lennie.
//*
//* Ezért a tanári nézetben ezeket a kártyákat összevonjuk, és ami marad, az
//* teljes oszlopot kap. Amit NEM vonunk össze: két különböző osztály (vagy
//* tantárgy, vagy terem) ugyanabban a percben. Az ütközés — órarendi hiba
//* vagy helyettesítés —, és pont azt nem szabad eltüntetni a szeme elől.
function teacherLessons(cards: RawCard[]): TimetableLesson[] {
  const buckets = new Map<string, RawCard[]>();
  for (const c of cards) {
    const key = [
      c.dayOfWeek,
      c.week,
      c.startMinuteFromMidnight,
      c.endMinuteFromMidnight,
      c.leftBottom,
      c.text,
      c.rightBottom,
    ].join("|");
    const bucket = buckets.get(key);
    if (bucket) bucket.push(c);
    else buckets.set(key, [c]);
  }

  return [...buckets.values()].map((bucket) => {
    const c = bucket[0];
    const classShort = c.leftBottom;
    //* Hány csoportot fed le a tanár ebből az osztályból. Ha mindet, akkor az
    //* óra az EGÉSZ osztályé — a csoport neve ilyenkor semmit nem tenne hozzá.
    const covered = new Set(bucket.map((x) => x.groupColumn)).size;
    const wholeClass = (c.groupCount ?? 1) <= 1 || covered >= c.groupCount;
    return {
      ...baseLesson(c),
      key: `${c.dayOfWeek}-${c.startMinuteFromMidnight}-${classShort}-${c.text}`,
      //* A tanári lapon a tanár neve magától értetődik — a kártyán az OSZTÁLY
      //* a hír, ezért a tanár mezői üresen maradnak.
      teacher: "",
      teacherShort: "",
      classShort,
      className: c.leftBottomTitle || classShort,
      room: c.rightBottom,
      group: wholeClass ? "" : c.groupName,
      //! TELJES OSZLOP, MÉG RÉSZLEGES BONTÁSNÁL IS. A fél oszlop azt jelenti:
      //! „az osztály másik fele máshol van" — a tanárnak ebből semmi nem
      //! következik, ő ott áll az óráján. A csoport NEVE megmarad (a kártyán
      //! ki is íródik), a rács fél oszlopa nem.
      groupColumn: 0,
      groupCount: 1,
      wholeClass,
    };
  });
}

export type CalendarEvent = {
  id: string;
  title: string;
  dayOfWeek: number;
  startMin: number;
  endMin: number;
  room: string;
  szakkorName: string;
  szakkorSlug: string;
  kozossegi: boolean;
  cancelled: boolean;
};

export type TimetableView = TimetableWeek & {
  events: CalendarEvent[];
  prefs: MergePreference[];
  persistence: "local";
};

import type { MergePreference } from "./timetable-merge";
import { loadLocalPreferences } from "./timetable-merge";

export async function buildTimetableView(input: {
  /** Kinek az órarendje. Hiányzik = osztály (a régi hívók). */
  kind?: TimetableSubjectKind;
  userClass: string | null;
  weekStart?: string;
  classOverride?: string;
}): Promise<TimetableView> {
  const kind = input.kind ?? "class";
  const wanted = input.classOverride?.trim() || input.userClass;
  const week = await getTimetableWeek({
    kind,
    class: kind === "class" ? wanted : null,
    teacher: kind === "teacher" ? wanted : null,
    weekStart: input.weekStart,
  });
  //* Az összevonási döntések ALANYONKÉNT külön állnak — a tanár döntései nem
  //* keveredhetnek egy azonos nevű osztályéval (lásd `subjectStoreKey`).
  const storeKey = week.subject
    ? subjectStoreKey(kind, week.subject.short)
    : "";
  const prefs = storeKey ? loadLocalPreferences(storeKey) : [];
  return { ...week, events: [], prefs, persistence: "local" };
}
