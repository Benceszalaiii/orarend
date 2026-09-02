//! AZ ÓRAREND ELEMZŐJE — EGY PÉLDÁNYBAN. Ez a modul a böngészőben és a
//! szerveren is fut: az órarend-értesítéseket kiszámoló háttérfeladat
//! (`/api/ertesites/tick`) UGYANAZT az elemzőt használja, mint a lap; egy
//! második, önálló másolat előbb-utóbb más órarendet mutatna, mint amit a diák
//! a képernyőn lát. Hogy az API útja mindkét oldalon jó legyen, azt egyetlen
//! hely dönti el: `jedlik-api.ts`.

import { API_BASE, FETCH_TIMEOUT_MS, JEDLIK_API_ORIGIN } from "./jedlik-api";
import {
  loadDayBells,
  loadRingSystemNames,
  loadSchoolPlan,
  type SchoolDayPlan,
} from "./school-calendar";

export { JEDLIK_API_ORIGIN };

export const TIME_ZONE = "Europe/Budapest";
export const PUBLIC_DEFAULT_CLASS = "13C";

//* A korábban kiválasztott osztály megjegyzése: frissítéskor ne vesszen el az
//* utolsó választás, ha a képernyőt ismételten megnyitják.
const CLASS_STORAGE_KEY = "orarend:class:v1";

export function loadCachedClass(): string | null {
  try {
    return window.localStorage.getItem(CLASS_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function saveCachedClass(short: string): void {
  try {
    window.localStorage.setItem(CLASS_STORAGE_KEY, short);
  } catch {
    /* privát módban nincs tárhely — a választás ekkor nem marad meg */
  }
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
  | "no-class" //* nincs (vagy nem ismerhető fel) osztály — nálunk van a labda
  | "unknown-class" //* az osztály nincs a Jedlikinfo listájában
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
      hint: "Ellenőrizd a kiválasztott osztályt és a hetet.",
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

export type TimetableClass = { short: string; name: string };

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
  teacher: string;
  teacherShort: string;
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
  resolvedClass: TimetableClass | null;
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

export type TimetableClassList = {
  classes: TimetableClass[];
  error?: TimetableError;
};

//! A LISTA HIBÁJA IS SZÁMÍT: ha nincs osztálylista, a választó üresen marad, és
//! a felhasználónak tudnia kell, hogy ez sem az ő hibája. Ezért a hiba itt nem
//! vész el — a hívó dönti el, mutatja-e.
export async function fetchTimetableClasses(): Promise<TimetableClassList> {
  try {
    const res = await fetch(`${API_BASE}/timetable/classes`, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) {
      return { classes: [], error: timetableHttp(res.status, res.statusText) };
    }
    const data = (await res.json()) as TimetableClass[];
    if (!Array.isArray(data)) {
      return {
        classes: [],
        error: timetablePayload("az osztálylista nem tömb"),
      };
    }
    return { classes: data };
  } catch (err) {
    return { classes: [], error: describeTimetableFailure(err) };
  }
}

export async function getTimetableClasses(): Promise<TimetableClass[]> {
  return (await fetchTimetableClasses()).classes;
}

type ResolvedClass = {
  resolved: TimetableClass | null;
  error?: TimetableError;
};

async function resolveClassResult(
  input: string | null | undefined,
): Promise<ResolvedClass> {
  if (!input?.trim()) {
    return {
      resolved: null,
      error: {
        kind: "no-class",
        title: "Nincs kiválasztott osztály",
        message: "Nincs beállítva (vagy nem ismerhető fel) az osztályod.",
        hint: "Válaszd ki az osztályt a fenti listából.",
        retryable: false,
      },
    };
  }
  const { classes, error: listError } = await fetchTimetableClasses();
  //! Ha maga a lista sem jött meg, NEM állunk meg: az órarend-kérés lehet, hogy
  //! így is sikerül. Ha mégsem, a kártyák hibája úgyis pontosabb lesz ennél.
  if (classes.length === 0) {
    const guess = classKey(input);
    return { resolved: { short: guess, name: guess }, error: listError };
  }
  const wanted = classKey(input);
  const exact = classes.find((c) => c.short === input.trim());
  if (exact) return { resolved: exact };
  const byKey = classes.find((c) => classKey(c.short) === wanted);
  if (byKey) return { resolved: byKey };
  return {
    resolved: null,
    error: {
      kind: "unknown-class",
      title: "Ismeretlen osztály",
      message: `A(z) „${input.trim()}” osztály nincs a ${TIMETABLE_SOURCE} osztálylistájában.`,
      hint: "Válassz a listából egy létező osztályt.",
      detail: `${classes.length} osztály a listában`,
      retryable: false,
    },
  };
}

export async function resolveClass(
  input: string | null | undefined,
): Promise<TimetableClass | null> {
  return (await resolveClassResult(input)).resolved;
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
  class: string | null | undefined;
  weekStart?: string;
}): Promise<TimetableWeek> {
  const weekStart = mondayOf(options.weekStart);
  const { resolved, error: resolveError } = await resolveClassResult(
    options.class,
  );

  const empty: TimetableWeek = {
    ok: false,
    resolvedClass: resolved,
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
      body: JSON.stringify({
        class: resolved.short,
        classroom: "",
        teacher: "",
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
        message: `A ${TIMETABLE_SOURCE} API nem küldött órarendet a(z) ${resolved.short} osztályra erre a hétre.`,
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

  const lessons: TimetableLesson[] = (data.cards ?? [])
    .filter((c) => {
      const dayWeek = dayWeekOf.get(c.dayOfWeek) ?? "";
      if (!dayWeek || !c.week || c.week === "AB") return true;
      return c.week.includes(dayWeek);
    })
    .map((c) => ({
      key: `${c.dayOfWeek}-${c.startMinuteFromMidnight}-${c.groupColumn}-${c.text}`,
      dateKey: toDateKey(c.date),
      dayOfWeek: c.dayOfWeek,
      startMin: c.startMinuteFromMidnight,
      endMin: c.endMinuteFromMidnight,
      subject: c.textTitle || c.text,
      subjectShort: c.text,
      teacher: c.rightBottomTitle || c.rightBottom,
      teacherShort: c.rightBottom,
      room: c.leftBottom,
      group: c.groupName,
      groupColumn: c.groupColumn,
      groupCount: c.groupCount,
      wholeClass: (c.groupCount ?? 1) <= 1,
      week: c.week,
      moved: c.movedCard === true,
      kind: c.type ?? "class",
    }));

  return {
    ok: true,
    resolvedClass: resolved,
    weekStart,
    days,
    periods,
    lessons,
  };
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
  userClass: string | null;
  weekStart?: string;
  classOverride?: string;
}): Promise<TimetableView> {
  const cls = input.classOverride?.trim() || input.userClass;
  const week = await getTimetableWeek({
    class: cls,
    weekStart: input.weekStart,
  });
  const classShort = week.resolvedClass?.short ?? "";
  const prefs = classShort ? loadLocalPreferences(classShort) : [];
  return { ...week, events: [], prefs, persistence: "local" };
}
