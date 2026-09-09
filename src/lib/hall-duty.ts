//* ---------------------------------------------------------------------------
//* FOLYÓSÓÜGYELET (HALLMANAGEMENT)
//* ---------------------------------------------------------------------------
//! MIT AD VISSZA A VÉGPONT. A `GET hallmanagement/` egyetlen lapos tömböt küld,
//! amiben minden nap minden szünetének minden területére két sor van — egy az
//! A, egy a B hétre:
//!
//!   { id, day, break, area, responsibleTeacher, week }
//!
//!   day                — nagybetűs, ékezetes magyar névvel: "HÉTFŐ".."PÉNTEK"
//!                        (5 érték).
//!   break              — melyik szünetről van szó: "7.45-8.00" (a becsengetés
//!                        előtti reggeli ügyelet), "1.szünet".."6.szünet", és
//!                        "vezetői ügyelet" (8 érték naponta — ez a hét minden
//!                        napján ugyanaz a nyolc).
//!   area               — melyik területet felügyeli az ügyeletes:
//!                        "1.emelet", "2.emelet", "földszint és alagsor",
//!                        "A épület hátsó kapu", "B épület" (5 érték) — VAGY
//!                        `null` a "vezetői ügyelet" sorain, mert az nem egy
//!                        területhez, hanem a teljes napi ügyelethez tartozik.
//!   responsibleTeacher — a felelős tanár teljes neve, szabad szöveg.
//!   week               — "A" vagy "B": az órarendhez hasonlóan itt is A/B
//!                        hetes váltás van, ezért minden nap+szünet+terület
//!                        kombináció KÉTSZER szerepel, egyszer-egyszer minden
//!                        hétre.
//!
//! EBBŐL KÖVETKEZIK A DARABSZÁM: 5 nap × (7 terület-bontott szünet × 5 terület
//! + 1 vezetői ügyelet) × 2 hét = 5 × 36 × 2 = 360 sor (ellenőrizve). Ha ez a
//! szám megváltozik, az API bővült vagy szűkült — nem hibás lekérés.
//*
//! A TERÜLET A RENDEZŐ SZEMPONT, NEM A NAP. A felhasználót az érdekli, hogy egy
//! ADOTT területen (pl. "2.emelet") ki van kint mikor — nem az, hogy egy adott
//! nap mely területei vannak lefedve. A forrás nap → szünet → terület
//! sorrendben adja a sorokat; egy listának, ami ezt megjeleníti, terület → nap
//! → szünet sorrendre van szüksége — ezért kell a `getHallDutyByArea`
//! újracsoportosítás, nem elég a nyers választ kiírni.

import { API_BASE, SIDE_FETCH_TIMEOUT_MS as TIMEOUT_MS } from "./jedlik-api";

export type HallDutyDay = "HÉTFŐ" | "KEDD" | "SZERDA" | "CSÜTÖRTÖK" | "PÉNTEK";

export type HallDutyWeek = "A" | "B";

/** Egy sor a forrás válaszából, változatlan alakban. */
type RawHallDuty = {
  id: number;
  day: string;
  break: string;
  area: string | null;
  responsibleTeacher: string;
  week: string;
};

export type HallDutySlot = {
  id: number;
  day: HallDutyDay;
  /** "7.45-8.00", "1.szünet".."6.szünet", vagy "vezetői ügyelet". */
  breakName: string;
  /** A forrás területneve — `null`, ha ez a sor a "vezetői ügyelet". */
  area: string | null;
  teacher: string;
  week: HallDutyWeek;
};

//* A "vezetői ügyelet" soraihoz a forrás nem küld területnevet (`area: null`).
//* A csoportosításnak mégis kell egy kulcs, amivel ezeket külön csoportba
//* teheti — ezt a feliratot a FELÜLET adja hozzá, a forrás sosem küldi.
export const HALL_DUTY_NO_AREA_LABEL = "Vezetői ügyelet";

export type HallDutyAreaGroup = {
  /** A terület neve, vagy `HALL_DUTY_NO_AREA_LABEL` a vezetői ügyeletnek. */
  area: string;
  //* Nap → szünet → hét sorrendben — lásd `fetchHallDutyFresh` rendezését.
  slots: HallDutySlot[];
};

function parseSlot(raw: RawHallDuty): HallDutySlot | null {
  if (
    typeof raw?.id !== "number" ||
    typeof raw.day !== "string" ||
    typeof raw.break !== "string" ||
    typeof raw.responsibleTeacher !== "string" ||
    (raw.week !== "A" && raw.week !== "B")
  ) {
    return null;
  }
  return {
    id: raw.id,
    day: raw.day as HallDutyDay,
    breakName: raw.break,
    area: raw.area ?? null,
    teacher: raw.responsibleTeacher,
    week: raw.week,
  };
}

//* A hét napjainak sorrendje a listához — a forrás magyar neve ábécé szerint
//* NEM ezt a sorrendet adná (a "CSÜTÖRTÖK" ábécében a "HÉTFŐ" elé kerülne).
const DAY_ORDER: readonly HallDutyDay[] = [
  "HÉTFŐ",
  "KEDD",
  "SZERDA",
  "CSÜTÖRTÖK",
  "PÉNTEK",
];

//* A szünetek sorrendje sem ábécésorrend: a "7.45-8.00" a nap ELSŐ, becsengetés
//* előtti ügyelete, ezért a "1.szünet" elé kerül; a "vezetői ügyelet" pedig a
//* lista VÉGÉRE, mert az nem egy konkrét szünethez van kötve.
const BREAK_ORDER: readonly string[] = [
  "7.45-8.00",
  "1.szünet",
  "2.szünet",
  "3.szünet",
  "4.szünet",
  "5.szünet",
  "6.szünet",
  "vezetői ügyelet",
];

function orderIndex(order: readonly string[], value: string): number {
  const i = order.indexOf(value);
  return i === -1 ? order.length : i;
}

//! ─── GYORSÍTÓTÁR ────────────────────────────────────────────────────────────
//! Az ügyeleti beosztás tanévnyi állandó — pontosan úgy, mint az osztály- és
//! tanárlista (lásd `timetable.ts` `fetchTimetableSubjects`). Egy megnyitáson
//! belül nem kérdezzük meg újra; a HIBÁT nem tartjuk meg, hogy egy átmeneti
//! hálózati gond ne rögzítsen egy üres választ a nap hátralévő részére.
//*
//! CSAK A BÖNGÉSZŐBEN. Szerveroldalon ez a modulszintű gyorsítótár kérések
//! között élne tovább, és egy látogató válaszát adná a következőnek.
let cache: HallDutySlot[] | null = null;
let inFlight: Promise<HallDutySlot[]> | null = null;

/** Az ügyeleti beosztás minden sora, nap → szünet → hét sorrendben. */
export async function fetchHallDuty(): Promise<HallDutySlot[]> {
  if (typeof window === "undefined") return fetchHallDutyFresh();
  if (cache) return cache;
  if (inFlight) return inFlight;

  const promise = fetchHallDutyFresh()
    .then((slots) => {
      //* Csak a használható választ tesszük el — lásd fent.
      if (slots.length > 0) cache = slots;
      return slots;
    })
    .finally(() => {
      inFlight = null;
    });

  inFlight = promise;
  return promise;
}

async function fetchHallDutyFresh(): Promise<HallDutySlot[]> {
  try {
    const res = await fetch(`${API_BASE}/hallmanagement/`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as unknown;
    if (!Array.isArray(data)) return [];
    return data
      .map((row) => parseSlot(row as RawHallDuty))
      .filter((slot): slot is HallDutySlot => slot !== null)
      .sort(
        (a, b) =>
          orderIndex(DAY_ORDER, a.day) - orderIndex(DAY_ORDER, b.day) ||
          orderIndex(BREAK_ORDER, a.breakName) -
            orderIndex(BREAK_ORDER, b.breakName) ||
          a.week.localeCompare(b.week),
      );
  } catch {
    //* Offline, időtúllépés, értelmezhetetlen válasz — mind ugyanaz: erről
    //* nincs adatunk, a hívó üres listát kap, nem dobott hibát.
    return [];
  }
}

//! ─── TERÜLET SZERINTI CSOPORTOSÍTÁS ─────────────────────────────────────────
//! EZ AZ, AMIT A LISTA MEGJELENÍTÉSÉHEZ HASZNÁLNI KELL. A `fetchHallDuty` a
//! forrás sorrendjét adja (nap → szünet → hét); ez a függvény TERÜLET szerint
//! csoportosítja azokat, a csoportokon belül pedig megtartja a nap → szünet →
//! hét sorrendet, hogy egy „2.emelet” kártya a hét minden napját, azon belül
//! minden szünetét sorban mutassa.
//!
//! A csoportok sorrendje rögzített (`AREA_ORDER`): emelet szerint fentről le,
//! majd a kültéri pontok, a vezetői ügyelet pedig MINDIG a lista végén — az
//! nem fizikai területet fed le, ezért nem versenyezhet velük a helyéért.
const AREA_ORDER: readonly string[] = [
  "2.emelet",
  "1.emelet",
  "földszint és alagsor",
  "A épület hátsó kapu",
  "B épület",
];

function areaGroupIndex(area: string): number {
  if (area === HALL_DUTY_NO_AREA_LABEL) return AREA_ORDER.length + 1;
  return orderIndex(AREA_ORDER, area);
}

/**
 * Az ügyeleti beosztás területenkénti listája — ez az alak való a felületre:
 * egy kártya/szakasz területenként, benne a hét összes ügyeletével.
 *
 * A "vezetői ügyelet" (ahol a forrás `area: null`-t küld) saját csoportot kap
 * a `HALL_DUTY_NO_AREA_LABEL` néven, a lista végén.
 */
export async function getHallDutyByArea(): Promise<HallDutyAreaGroup[]> {
  const slots = await fetchHallDuty();

  //* A `Map` beszúrási sorrendben tartja a kulcsokat, és mivel a `slots` már
  //* nap → szünet → hét sorrendben jött, minden csoport belseje is az marad —
  //* nincs szükség külön rendezésre a csoportokon belül.
  const groups = new Map<string, HallDutySlot[]>();
  for (const slot of slots) {
    const key = slot.area ?? HALL_DUTY_NO_AREA_LABEL;
    const bucket = groups.get(key);
    if (bucket) bucket.push(slot);
    else groups.set(key, [slot]);
  }

  return [...groups.entries()]
    .map(([area, areaSlots]) => ({ area, slots: areaSlots }))
    .sort((a, b) => areaGroupIndex(a.area) - areaGroupIndex(b.area));
}

//* ---------------------------------------------------------------------------
//* MIKOR VAN EGY SZÜNET — EZT A FORRÁS NEM MONDJA MEG
//* ---------------------------------------------------------------------------
//! A `hallmanagement` VÉGPONTON NINCS EGYETLEN IDŐPONT SEM. A sorokban a szünet
//! NEVE áll („3.szünet”), nem a kezdete — abból viszont nem derül ki, hogy most
//! éppen tart-e. Márpedig a lapnak pont ez az EGY kérdése van: ki áll kint
//! MOST. Az időt tehát nem kapjuk, hanem levezetjük — két külön szabállyal,
//! mert a forrás kétféle nevet használ:
//!
//!   „7.45-8.00”  — A NÉV MAGA AZ IDŐ. A reggeli, becsengetés előtti ügyeletet
//!                  a forrás órában írja le; ezt szó szerint beolvassuk. Nem
//!                  köthető csengetéshez: a 0. óra (7:10–7:55) KÖZBEN kezdődik.
//!   „N.szünet”   — AZ N. ÓRA UTÁNI SZÜNET, vagyis az N. óra kicsengetésétől az
//!                  N+1. becsengetéséig. Az órahatárok az ADOTT NAP csengetési
//!                  rendjéből jönnek (`school-calendar.ts` `loadDayBells`), nem
//!                  egy beégetett táblázatból — rövidített napon a szünetek is
//!                  elcsúsznak, és a levezetés magától követi őket.
//!
//! MIÉRT BÍZHATÓ EZ MEG. A levezetés önmagát ellenőrzi: a beosztásban PONTOSAN
//! hat számozott szünet van („1.szünet”…„6.szünet”), a csengetési rendben pedig
//! pontosan hat rés az 1. és a 7. óra között (8:45–8:55, 9:40–9:50, 10:35–10:50,
//! 11:35–11:45, 12:30–12:40, 13:25–13:35). A kettő hézagmentesen fedi egymást,
//! és a reggeli ügyelet neve is pont a hiányzó hetedik sávot írja le. Ha a suli
//! valaha hetedik szünetre is tenne ügyeletet, az itt NEM némán rossz időt kap,
//! hanem `null`-t — lásd `breakSpanOf`.
//!
//! HA NINCS CSENGETÉSI REND, NINCS TALÁLGATÁS. A `loadDayBells` tanítás nélküli
//! napra `null`-t ad; ilyenkor a szünetek `startMin`-je is `null` marad. A
//! beosztás ettől még megjelenik (a NEVEK sorrendje ismert), csak élő „most”
//! nincs hozzá — ez az egyetlen becsületes válasz.

import type { TimetablePeriod } from "./timetable";

export type HallDutyPost = {
  area: string;
  teacher: string;
};

export type HallDutyBreakModel = {
  /** A forrás szünetneve — egyben a lista kulcsa a napon belül. */
  name: string;
  /** Percben éjféltől; `null`, ha a nap csengetése nem ismert. */
  startMin: number | null;
  endMin: number | null;
  /** Területenként egy ügyeletes, `AREA_ORDER` sorrendjében. */
  posts: HallDutyPost[];
};

export type HallDutyDayModel = {
  dateKey: string;
  /** A forrás napneve („HÉTFŐ”). */
  day: HallDutyDay;
  /** Az A/B hét betűje, amire ez a beosztás vonatkozik. */
  week: HallDutyWeek;
  /** A nap ügyeletei időrendben; a reggeli elöl, a 6. szünet a végén. */
  breaks: HallDutyBreakModel[];
  //! A VEZETŐI ÜGYELET NEM SZÜNET, HANEM A NAP EGÉSZE. Nincs se területe, se
  //! ideje: egyetlen tanár felel az egész tanítási napért. Ezért nem fér bele
  //! a `breaks` tömbbe — ott egy idő nélküli, hely nélküli sor lenne, ami a
  //! többivel egy oszlopban azt ÁLLÍTANÁ, hogy ugyanolyan fajta bejegyzés.
  leader: string | null;
};

//* A számozott szünet neve: „3.szünet”. A forrás nem tesz szóközt, de a minta
//* megengedő — egy jövőbeli „3. szünet” sem törheti el a lapot.
const NUMBERED_BREAK = /^(\d+)\.\s*szünet$/i;
//* A reggeli ügyelet neve maga a két időpont: „7.45-8.00”.
const LITERAL_RANGE = /^(\d{1,2})[.:](\d{2})\s*-\s*(\d{1,2})[.:](\d{2})$/;

/**
 * Egy szünet valós időhatárai percben, a nap csengetési rendje alapján.
 * `null`, ha ez a név nem köthető időhöz (vezetői ügyelet), vagy ha a
 * csengetési rendből hiányzik a hozzá tartozó óra.
 */
export function breakSpanOf(
  breakName: string,
  periods: readonly TimetablePeriod[],
): { startMin: number; endMin: number } | null {
  const literal = LITERAL_RANGE.exec(breakName.trim());
  if (literal) {
    const startMin = Number(literal[1]) * 60 + Number(literal[2]);
    const endMin = Number(literal[3]) * 60 + Number(literal[4]);
    return endMin > startMin ? { startMin, endMin } : null;
  }

  const numbered = NUMBERED_BREAK.exec(breakName.trim());
  if (!numbered) return null;

  const n = Number(numbered[1]);
  const before = periods.find((p) => p.number === n);
  const after = periods.find((p) => p.number === n + 1);
  //! MINDKÉT ÓRA KELL HOZZÁ. A szünet a kettő KÖZTI rés — ha a nap csengetése
  //! rövidebb (pl. „első 3 óra van csak megtartva”), a hatodik szünetnek nincs
  //! túlsó partja, és egy kitalált vég rosszabb, mint a bevallott hiány.
  if (!before || !after || after.startMin <= before.endMin) return null;
  return { startMin: before.endMin, endMin: after.startMin };
}

/** A hét napja a dátumból, a forrás saját elnevezésével. `null` hétvégén. */
export function hallDutyDayOf(dateKey: string): HallDutyDay | null {
  const [y, m, d] = dateKey.split("-").map(Number);
  if (!y || !m || !d) return null;
  //* ISO sorszám: hétfő 1 … vasárnap 7. A beosztás csak a tanítási hetet ismeri.
  const isoDow = ((new Date(y, m - 1, d).getDay() + 6) % 7) + 1;
  return DAY_ORDER[isoDow - 1] ?? null;
}

/**
 * Egy nap ügyeleti beosztása — a lap fő modellje.
 *
 * A `periods` az ADOTT nap csengetési rendje (`loadDayBells`); üres tömbbel a
 * beosztás megjelenik, de időhatárok nélkül.
 */
export function buildHallDutyDay(
  slots: readonly HallDutySlot[],
  input: {
    dateKey: string;
    day: HallDutyDay;
    week: HallDutyWeek;
    periods: readonly TimetablePeriod[];
  },
): HallDutyDayModel {
  const mine = slots.filter(
    (slot) => slot.day === input.day && slot.week === input.week,
  );

  const byBreak = new Map<string, HallDutySlot[]>();
  let leader: string | null = null;
  for (const slot of mine) {
    //* A területtelen sor a vezetői ügyelet — az nem a szünetek közé való.
    if (slot.area === null) {
      leader ??= slot.teacher;
      continue;
    }
    const bucket = byBreak.get(slot.breakName);
    if (bucket) bucket.push(slot);
    else byBreak.set(slot.breakName, [slot]);
  }

  const breaks: HallDutyBreakModel[] = [...byBreak.entries()]
    .map(([name, rows]) => {
      const span = breakSpanOf(name, input.periods);
      return {
        name,
        startMin: span?.startMin ?? null,
        endMin: span?.endMin ?? null,
        //! A TERÜLETEK SORRENDJE MINDEN SZÜNETBEN UGYANAZ. A beosztást
        //! FÜGGŐLEGESEN olvassák — „ki van a 2. emeleten egész nap” —, és ez
        //! csak akkor megy, ha a sorok szünetről szünetre egy helyen állnak.
        posts: rows
          .map((row) => ({ area: row.area ?? "", teacher: row.teacher }))
          .sort((a, b) => areaGroupIndex(a.area) - areaGroupIndex(b.area)),
      };
    })
    .sort(
      (a, b) =>
        orderIndex(BREAK_ORDER, a.name) - orderIndex(BREAK_ORDER, b.name),
    );

  return {
    dateKey: input.dateKey,
    day: input.day,
    week: input.week,
    breaks,
    leader,
  };
}

//* ---------------------------------------------------------------------------
//* A „MOST" — MELYIK ÜGYELET TART ÉPPEN
//* ---------------------------------------------------------------------------
//! UGYANAZ A NÉGY ÁLLAPOT, MINT A NAPI NÉZETBEN (`components/timetable/now.ts`),
//! csak az alany más: ott az ÓRA fut vagy készül, itt az ÜGYELET. A szótár
//! szándékosan közös — aki a `/ma` „most” dobozát érti, ezt is érti —, de a
//! számítás külön áll: az ügyeletnek nincs „lyukasórája”, és a szünetek közti
//! rés maga a TANÍTÁSI óra, nem egy hézag.
export type HallDutyNow =
  //* Éppen tart egy ügyelet: ezek a tanárok állnak kint ebben a percben.
  | {
      phase: "duty";
      current: HallDutyBreakModel;
      next: HallDutyBreakModel | null;
      span: { fromMin: number; toMin: number };
    }
  //* Óra van: a következő ügyelet a becsengetés utáni szünetben lesz.
  | {
      phase: "between";
      next: HallDutyBreakModel;
      span: { fromMin: number; toMin: number };
    }
  //* Még a nap első ügyelete előtt vagyunk.
  | {
      phase: "before";
      next: HallDutyBreakModel;
      span: { fromMin: number; toMin: number };
    }
  //* A nap utolsó ügyelete is véget ért.
  | { phase: "done" }
  //* Erre a napra nincs időzíthető beosztás (nincs csengetés, vagy nincs sor).
  | { phase: "none" };

//* Mennyivel a nap első ügyelete előtt kezdjen el visszaszámolni a lap. Ugyanaz
//* az egy óra, amit a napi nézet is használ (`now.ts` `LEAD_IN_MIN`).
const LEAD_IN_MIN = 60;

export function hallDutyNow(
  day: HallDutyDayModel,
  nowMin: number,
): HallDutyNow {
  //! CSAK AZ IDŐZÍTHETŐ SZÜNET JÁTSZIK. Amit a csengetési rend nem tudott
  //! elhelyezni, arról nem állítjuk, hogy most van vagy most nincs.
  const timed = day.breaks.filter(
    (b): b is HallDutyBreakModel & { startMin: number; endMin: number } =>
      b.startMin !== null && b.endMin !== null,
  );
  if (timed.length === 0) return { phase: "none" };

  const current = timed.find((b) => b.startMin <= nowMin && nowMin < b.endMin);
  if (current) {
    return {
      phase: "duty",
      current,
      next: timed.find((b) => b.startMin >= current.endMin) ?? null,
      span: { fromMin: current.startMin, toMin: current.endMin },
    };
  }

  const next = timed.find((b) => b.startMin > nowMin);
  if (!next) return { phase: "done" };

  //* Az előző ügyelet vége és a következő kezdete között tart az óra — a
  //* haladás-sáv EZT a szakaszt meríti, nem egy találomra vett órányi ablakot.
  const lastEnd = timed
    .filter((b) => b.endMin <= nowMin)
    .reduce((acc, b) => Math.max(acc, b.endMin), Number.NEGATIVE_INFINITY);

  if (lastEnd > Number.NEGATIVE_INFINITY) {
    return {
      phase: "between",
      next,
      span: { fromMin: lastEnd, toMin: next.startMin },
    };
  }

  return {
    phase: "before",
    next,
    span: { fromMin: next.startMin - LEAD_IN_MIN, toMin: next.startMin },
  };
}
