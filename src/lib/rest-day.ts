//* ---------------------------------------------------------------------------
//* A PIHENŐNAP — mi ez a nap, ha nincs rajta óra
//* ---------------------------------------------------------------------------
//! AZ ÜRES NAP NEM EGYFÉLE. „Nincs órád" ugyanaz a mondat a hétvégére, a téli
//! szünetre és egy olyan keddre, amiről a forrás egyszerűen nem küldött
//! kártyát — pedig a diák számára ez három különböző nap. Ez a modul dönti el,
//! MELYIK, egyetlen helyen, tiszta függvényként: óra nélkül, hálózat nélkül,
//! ugyanazzal az eredménnyel a szerveren és a kliensen.
//!
//! A FORRÁS SZAVA ELSŐ. A tanév rendje (`school-calendar.ts`) a napra kiírt
//! bejegyzésekkel érkezik — ha az iskola azt írja, „Téli szünet", akkor a lap
//! nem talál ki mást. A naptári ablak csak akkor dönt, ha a forrás hallgat.
//!
//! ÉS AMIT NEM TUDUNK, AZT NEM ÁLLÍTJUK. A szünet VÉGÉT ez a modul sosem
//! találja ki: a betöltött hét öt napján túl nem lát, egy „hétfőn újra
//! tanítás" pedig a téli szünet közepén egyszerűen hazugság lenne.

import { dateFromKey } from "@/components/timetable/shared";

/** A pihenőnap fajtája — a lap ebből választ hangnemet. */
export type RestKind =
  //* Szombat vagy vasárnap: a hét ismétlődő, megszokott szünete.
  | "weekend"
  //* Több napos iskolai szünet (őszi, téli, tavaszi, nyári).
  | "break"
  //* Egyetlen tanítás nélküli nap: ünnep, tanítás nélküli munkanap.
  | "holiday"
  //* Tanítási nap, amin ennek a diáknak mégsincs órája.
  | "free";

/** A szünet évszaka — ebből jön a lap hangulata és a háttér mozgása. */
export type RestSeason =
  | "christmas"
  | "newyear"
  | "autumn"
  | "spring"
  | "summer"
  | "none";

export type RestDay = {
  kind: RestKind;
  season: RestSeason;
  /** A pihenő megnevezése, lehetőleg a forrás saját szavával. */
  label: string;
  /** A nagy sor, ha az idő nem veszi át a helyét. */
  headline: string;
  /** Egy mondat alatta — sosem mentegetőzés, sosem bizonytalankodás. */
  note: string;
};

//! ÉKEZET NÉLKÜL HASONLÍTUNK. A forrás hol „Téli szünet"-et, hol „TÉLI
//! SZÜNET"-et ír, és egy hiányzó ékezet nem tehet két különböző napot a
//! naptárból.
function fold(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

//* Hónap–nap párként, hogy az ablakok évtől függetlenül olvashatók maradjanak.
function md(dateKey: string): number {
  const d = dateFromKey(dateKey);
  return (d.getMonth() + 1) * 100 + d.getDate();
}

//! A NAPTÁRI ABLAKOK TÁGABBAK A SZÜNETEKNÉL. Nem a szünet HATÁRÁT jelölik ki —
//! azt a forrás mondja meg —, hanem azt, hogy egy tanítás nélküli nap MELYIK
//! évszakba esik. Ezért nyugodtan érnek túl a tényleges szüneteken: ami nem
//! szünet, az ide el sem jut.
function seasonOf(dateKey: string): RestSeason {
  const key = md(dateKey);
  //* Az év két végén átfordul: december 15-től január 6-ig egy ablak.
  if (key >= 1215 || key <= 106) {
    return key >= 1230 || key <= 102 ? "newyear" : "christmas";
  }
  if (key >= 1018 && key <= 1108) return "autumn";
  if (key >= 320 && key <= 430) return "spring";
  if (key >= 615 && key <= 831) return "summer";
  return "none";
}

//* A forrás szavai. Az egyezés SORREND-ÉRZÉKENY: a „téli szünet" előbb dönt,
//* mint a puszta „szünet".
const NAMED: Array<{ match: string; season: RestSeason; label: string }> = [
  { match: "teli szunet", season: "christmas", label: "Téli szünet" },
  { match: "karacsony", season: "christmas", label: "Karácsony" },
  { match: "oszi szunet", season: "autumn", label: "Őszi szünet" },
  { match: "tavaszi szunet", season: "spring", label: "Tavaszi szünet" },
  { match: "husvet", season: "spring", label: "Húsvét" },
  { match: "nyari szunet", season: "summer", label: "Nyári szünet" },
  { match: "szunet", season: "none", label: "Szünet" },
];

//! A KARÁCSONYI SZÜNET NEM EGY HANGULAT, HANEM HÁROM. December 23-án a szünet
//! még előtte áll az ünnepnek, 25-én maga az ünnep, 31-én már az évfordulón. A
//! lap ezt a NAPBÓL tudja, nem véletlenszerűen váltogatja — ugyanaz a nap
//! kétszer megnyitva ugyanazt mondja.
function winterHeadline(dateKey: string): { headline: string; note: string } {
  const key = md(dateKey);
  if (key >= 1224 && key <= 1226) {
    return {
      headline: "Áldott karácsonyt!",
      note: "Ma nincs iskola — és a jövő héten sem kell sietned sehova.",
    };
  }
  if (key === 1231 || key === 101) {
    return {
      headline: "Boldog új évet!",
      note: "Az órarend megvár. Kezdd a következő évet kipihenten.",
    };
  }
  if (key >= 1227 && key <= 1230) {
    return {
      headline: "Két ünnep között",
      note: "A leglassabb hét az évben. Használd ki.",
    };
  }
  if (key <= 106) {
    return {
      headline: "Még tart a szünet",
      note: "A tanítás januárban indul újra — addig a naptár a tiéd.",
    };
  }
  return {
    headline: "Kezdődik a szünet",
    note: "Ünnepekig hátra van pár nap — de iskola már nincs közte.",
  };
}

const SEASON_COPY: Record<
  Exclude<RestSeason, "christmas" | "newyear">,
  { headline: string; note: string }
> = {
  autumn: {
    headline: "Őszi szünet",
    note: "Egy hét óra nélkül. A hétfő majd szól, ha visszatér.",
  },
  spring: {
    headline: "Tavaszi szünet",
    note: "Az órarend szünetel — a tavasz nem.",
  },
  summer: {
    headline: "Nyári szünet",
    note: "A leghosszabb szünet az évben. Nyugodtan csukd be ezt a lapot.",
  },
  none: {
    headline: "Ma nincs tanítás",
    note: "A tanév rendje szerint ez a nap kimarad.",
  },
};

export function describeRestDay(input: {
  dateKey: string;
  /** Hétvége-e a nap. */
  weekend: boolean;
  /** Tanítási nap-e a tanév rendje szerint; `null` = nem tudjuk. */
  teaching: boolean | null;
  /** A napra kiírt iskolai bejegyzések, a forrás szavaival. */
  notes: string[];
  /** Ez a nap a mai nap-e — a hangnem második személye ezen múlik. */
  isToday: boolean;
}): RestDay {
  const { dateKey, weekend, teaching, notes, isToday } = input;

  if (weekend) {
    //! A HÉTVÉGE NEM SZÜNET. Minden héten visszatér, tehát a lapon sem
    //! viselkedhet ünnepként: itt nem az ÉVSZAK az érdekes, hanem hogy mennyi
    //! van még belőle — azt pedig a hero műszere mondja meg, nem ez a szöveg.
    return {
      kind: "weekend",
      season: "none",
      label: "Hétvége",
      headline: "Hétvége",
      note: "Nincs óra, nincs csengő.",
    };
  }

  const haystack = fold(notes.join(" · "));
  const named = NAMED.find((row) => haystack.includes(row.match)) ?? null;
  const season =
    named && named.season !== "none" ? named.season : seasonOf(dateKey);

  //! MI SZÁMÍT SZÜNETNEK. Vagy az iskola mondja ki („szünet"), vagy a nap egy
  //! olyan naptári ablakba esik, ami önmagában sem lehet más (karácsony, nyár).
  //! Egy márciusi ünnepnap ettől ünnepnap marad — és nem kap se havat, se
  //! szirmot.
  const isBreak =
    teaching === false &&
    (named !== null ||
      season === "christmas" ||
      season === "newyear" ||
      season === "summer");

  if (teaching === false) {
    const copy =
      season === "christmas" || season === "newyear"
        ? winterHeadline(dateKey)
        : SEASON_COPY[
            season === "autumn" || season === "spring" || season === "summer"
              ? season
              : "none"
          ];
    return {
      kind: isBreak ? "break" : "holiday",
      //* Ünnepnapon nincs évszak-hangulat: az évszak a SZÜNETÉ.
      season: isBreak ? season : "none",
      label:
        named?.label ??
        notes[0] ??
        (isBreak ? "Szünet" : "Tanítás nélküli nap"),
      headline: copy.headline,
      note: copy.note,
    };
  }

  //! TANÍTÁSI NAP, ÓRA NÉLKÜL. Ilyenkor nem ünneplünk: ez vagy egy ritka üres
  //! nap, vagy a forrás nem küldött kártyát. A lap ezért csak annyit mond,
  //! amennyit tud — és a következő órára mutat.
  return {
    kind: "free",
    season: "none",
    label: "Szabadnap",
    headline: isToday ? "Ma nincs órád" : "Ezen a napon nincs órád",
    note: "A tanév rendje szerint ez tanítási nap — órát mégsem írtak ki rá.",
  };
}
