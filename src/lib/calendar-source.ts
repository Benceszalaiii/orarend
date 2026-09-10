import { type FeedWeek, feedEvents, feedName } from "./calendar-feed";
import {
  type CalendarFeedRow,
  leaseWindowRefresh,
  readWindow,
  type StoredWeek,
  writeWindow,
} from "./calendar-store";
import { buildIcs } from "./ics";
import { budapestNow } from "./push-plan";
import {
  addDays,
  getTimetableWeek,
  mondayOf,
  type TimetableSubjectKind,
} from "./timetable";

//! CSAK A SZERVEREN: ez a modul a Jedlikinfót hívja közvetlenül (nincs böngésző
//! és nincs átirányító), és az írás-jogú tárolót használja.
import "server-only";

//! ═══════════════════════════════════════════════════════════════════════════
//! A FEED ADATFORRÁSA — ÓRÁNKÉNT EGYSZER, ALANYONKÉNT EGYSZER
//! ═══════════════════════════════════════════════════════════════════════════
//! HÁROM KORLÁT TARTJA KORDÁBAN AZ EGÉSZET, és egyik sem cserélhető ki a
//! másikra:
//!
//!  1. ABLAK — öt hét, se több. Ez tartja VÉGESEN a lekérhető hetek számát:
//!     enélkül elég lenne száz különböző dátumot végigkérni. Ugyanaz a
//!     megfontolás és ugyanazok a számok, mint a teremkeresőnél
//!     (`free-rooms-source.ts`).
//!  2. ÓRÁS FRISSESSÉG — egy alany öt hete óránként legfeljebb egyszer kerül
//!     lekérésre, FÜGGETLENÜL attól, hány feliratkozója van. Száz diák
//!     ugyanarra az osztályra ugyanannyi kérés a suli szerverének, mint egy.
//!  3. FOGLALÁS — egyszerre egy frissítés fut egy alanyra (`leaseWindowRefresh`).
//!
//! A legrosszabb eset így alanyonként 5 kérés óránként; a szokásos eset ennek a
//! töredéke, mert a legtöbb feliratkozó néhány népszerű osztályra jut.
//!
//! ─── AMIT A NAPTÁR-FEED ROSSZABBAN TŰR, MINT BÁRMELYIK MÁS NÉZET ───────────
//! AZ ÜRES VÁLASZ ITT TÖRLÉS. A lap hibát tud mutatni („a Jedlikinfo nem
//! érhető el"), a naptárnak viszont nincs hova kiírni egy hibát: ő a kapott
//! listát veszi igazságnak, és amit nem talál benne, azt KIVESZI a naptárból.
//! Egy ötperces külső kimaradásból így az lenne, hogy a diák telefonjáról
//! eltűnik az egész heti órarendje.
//!
//! Ezért ez a modul SOHA nem ad üres ablakot azért, mert a forrás épp nem
//! válaszol: a lejárt példányt adja, és a frissítést a válasz UTÁN próbálja meg
//! újra (lásd `after()` a végponton).
//! ═══════════════════════════════════════════════════════════════════════════

//! MENNYIRE ÁLLHAT AZ ADAT MINÁLUNK. Ez az, amit ígérni lehet — az, hogy a
//! naptáralkalmazás milyen sűrűn kérdez, NEM a mi döntésünk (az Apple Naptár
//! tiszteli a `REFRESH-INTERVAL`-t, a Google Naptár jóval ritkábban olvas
//! újra). A felületen ezért a mi oldalunkról beszélünk, nem a naptáráról.
export const FEED_REFRESH_MINUTES = 60;
const FRESH_MS = FEED_REFRESH_MINUTES * 60 * 1000;

//* Ugyanaz az ablak, mint a teremkeresőben: a múlt hét még érdekes (a naptárban
//* ott álló órák ne tűnjenek el visszamenőleg), előre három hét pedig több,
//* mint amennyit a Jedlikinfo rendszerint feltöltve tart.
const WEEKS_BACK = 1;
const WEEKS_FORWARD = 3;

//! MEDDIG VIHETŐ TOVÁBB EGY ELBUKOTT HÉT. Ha egyetlen hét lekérése hibázik, az
//! ELŐZŐ példányból visszük tovább — különben egy pillanatnyi hiba törölné azt
//! a hetet a diák naptárából. Örökre viszont nem vihető: egy hét múlva az adat
//! már nem „kicsit régi", hanem állítás valamiről, amit nem tudunk.
const CARRY_MAX_MS = 7 * 24 * 60 * 60 * 1000;

function windowWeekStarts(): string[] {
  //! A SZERVER UTC-BEN FUT, AZ ISKOLA NEM. A `mondayOf()` paraméter nélkül a
  //! SZERVER naptári napjából indul — vasárnap 23:00 és éjfél között (budapesti
  //! hétfő hajnali 1) az még az előző nap, tehát az ablak egy héttel korábbra
  //! csúszna: a következő hét kiesne a naptárból, pont amikor kezdődik.
  //! Ugyanaz a megfontolás, mint a `push-plan.ts`-ben és a
  //! `free-rooms-source.ts`-ben — ezért ugyanabból a forrásból is vesszük a
  //! napot.
  const monday = mondayOf(budapestNow().dayKey);
  const starts: string[] = [];
  for (let i = -WEEKS_BACK; i <= WEEKS_FORWARD; i++) {
    starts.push(addDays(monday, i * 7));
  }
  return starts;
}

function toFeedWeek(week: {
  weekStart: string;
  days: FeedWeek["days"];
  periods: FeedWeek["periods"];
  lessons: FeedWeek["lessons"];
}): FeedWeek {
  //* Csak az a négy mező kerül a tárolóba, amiből esemény lesz — a
  //* `TimetableWeek` többi része (hiba, alany, `ok`) itt se nem kell, se nem
  //* érdekes.
  return {
    weekStart: week.weekStart,
    days: week.days,
    periods: week.periods,
    lessons: week.lessons,
  };
}

export type FeedWindow = {
  weeks: StoredWeek[];
  /** A legutóbbi frissítési kör ideje, vagy `null`, ha még soha nem volt. */
  fetchedAt: number | null;
  /** Egy óránál újabb-e. Hamis = kiszolgálható, de frissítésre vár. */
  fresh: boolean;
};

/**
 * A kiszolgáláshoz használható ablak — AZONNAL, hálózat nélkül, ha van mentett
 * példány.
 *
 * @remarks Ha `fresh` hamis, a hívó dolga elindítani a frissítést a válasz
 * elküldése UTÁN (`after()`): a naptárnak nem kell megvárnia öt lekérést.
 */
export async function servableWindow(
  kind: TimetableSubjectKind,
  short: string,
): Promise<FeedWindow> {
  const cached = await readWindow(kind, short);
  if (!cached) return { weeks: [], fetchedAt: null, fresh: false };
  return {
    weeks: cached.weeks,
    fetchedAt: cached.fetchedAt,
    fresh: Date.now() - cached.fetchedAt < FRESH_MS,
  };
}

/**
 * Lekéri az öt hetet, és eltárolja. Akkor is visszaadja a legjobb elérhető
 * ablakot, ha a frissítés nem indult el (más kérés épp fut) vagy elbukott.
 */
export async function refreshWindow(
  kind: TimetableSubjectKind,
  short: string,
): Promise<FeedWindow> {
  const before = await readWindow(kind, short);

  //* Aki nem kapta meg a foglalást, nem indít másodikat: a másik futás
  //* eredményét a következő lekérés úgyis megtalálja.
  if (!(await leaseWindowRefresh(kind, short))) {
    return {
      weeks: before?.weeks ?? [],
      fetchedAt: before?.fetchedAt ?? null,
      fresh: false,
    };
  }

  const previous = new Map(before?.weeks.map((w) => [w.weekStart, w]) ?? []);
  const now = Date.now();
  const weeks: StoredWeek[] = [];
  let fetched = 0;

  //! SORBAN, NEM EGYSZERRE. Ugyanaz a döntés, mint a push-tickben: nem azért,
  //! mert a forrás lassú, hanem mert egy iskolai szerverre nem zúdítunk öt
  //! párhuzamos kapcsolatot azért, mert elbírná. Ez a kör a válasz UTÁN fut,
  //! tehát nem várakoztat senkit.
  for (const weekStart of windowWeekStarts()) {
    const week = await getTimetableWeek({
      kind,
      class: kind === "class" ? short : undefined,
      teacher: kind === "teacher" ? short : undefined,
      weekStart,
    });

    if (week.ok) {
      weeks.push({ ...toFeedWeek({ ...week, weekStart }), fetchedAt: now });
      fetched += 1;
      continue;
    }

    //! A HIBA NEM ÜRES HÉT. Ha a forrás nem válaszolt erre a hétre, az előző
    //! példány megy tovább — egy pillanatnyi hibából nem lehet „ezen a héten
    //! nincs órád". (A „nincs adat erre a hétre" VÁLASZ is ide esik: a
    //! Jedlikinfo szünetre és fel nem töltött hétre is hibát ad, és ilyenkor a
    //! korábbi példány sem hazudik többet, mint az üresség.)
    const carried = previous.get(weekStart);
    if (carried && now - carried.fetchedAt < CARRY_MAX_MS) {
      weeks.push(carried);
    }
  }

  //! EGYETLEN SIKER NÉLKÜL NEM ÍRUNK. Ha mind az öt hét elbukott, a forrás van
  //! baj — ilyenkor a mentett ablakhoz hozzá sem nyúlunk, tehát a határideje
  //! sem indul újra, és a feed a korábbi (lejárt, de igaz) példányt adja
  //! tovább.
  if (fetched === 0) {
    return {
      weeks: before?.weeks ?? [],
      fetchedAt: before?.fetchedAt ?? null,
      fresh: false,
    };
  }

  await writeWindow(kind, short, weeks);
  return { weeks, fetchedAt: now, fresh: true };
}

//! ─── A FEED SZÖVEGE ────────────────────────────────────────────────────────
//! A SZŰRÉS ITT, KÉRÉSENKÉNT FUT, és ez szándékos: az ablak alanyonként közös,
//! a DÖNTÉS viszont feliratkozónként más. Ez a néhány milliszekundum az ára
//! annak, hogy a drága rész (hálózat) megosztható legyen.
export function renderFeed(input: {
  row: CalendarFeedRow;
  window: FeedWindow;
  stamp?: number;
}): string {
  const { row, window } = input;
  const events = feedEvents({
    kind: row.kind,
    short: row.short,
    weeks: window.weeks,
    prefs: row.prefs,
    dual: row.dual,
  });

  return buildIcs({
    name: feedName(row.kind, row.short),
    //* Egy mondat, amit a naptár a feliratkozás adatlapján mutat. A frissesség
    //* itt van kimondva, mert a naptár saját ütemezéséről mi nem dönthetünk.
    description: `A ${row.short} órarendje a saját csoportválasztásaiddal. Az adat óránként frissül a forrásból.`,
    events,
    stamp: input.stamp ?? Date.now(),
    refreshMinutes: FEED_REFRESH_MINUTES,
  });
}
