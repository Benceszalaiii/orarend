import { dualWeeksOf } from "./club-fit";
import { isComputerRoom } from "./computer-rooms";
import type { DualSchedule } from "./dual-schedule";
import type { RoomBooking, WeekOccupancy } from "./free-rooms";
import type { TimetablePeriod } from "./timetable";

//! ═══════════════════════════════════════════════════════════════════════════
//! SZAKKÖR-TERVEZŐ — MIKOR ÉS HOL
//! ═══════════════════════════════════════════════════════════════════════════
//! Két kérdés, amit a vezető tanár eddig fejben (vagy egy körkérdéssel)
//! válaszolt meg:
//!
//!   1. MIKOR ÉR RÁ A LEGTÖBB TAG, ÉS A TANÁR IS? A tagok osztályának
//!      órarendjéből (a saját csoportválasztásukkal szűrve) és a vezetők
//!      órarendjéből.
//!   2. MELYIK TEREM SZABAD AKKOR — hetente, nem csak egyszer? A teremkereső
//!      heti seprése adja.
//!
//! TÖBB HÉTBŐL, MERT AZ A/B HÉT NEM UGYANAZ (ugyanaz az érv, mint a
//! `club-fit.ts`-ben): a szakkör rendszeres, tehát egy időpont csak akkor jó
//! valakinek, ha EGYIK ismert héten sincs akkor órája. Egy terem ugyanígy.
//!
//! A TANÁR NEM ALKU TÁRGYA. Olyan időpontot, amikor valamelyik vezetőnek
//! órája van, nem javaslunk — a szakkör nélküle nem lesz meg. A tagok között
//! viszont a legtöbbet keressük, és kimondjuk, ki nem ér rá.
//!
//! TISZTA FÜGGVÉNYEK: se hálózat, se adatbázis, se `Date.now()`. A lekérést a
//! `club-planner-source.ts` végzi.
//! ═══════════════════════════════════════════════════════════════════════════

export type PlannerLesson = {
  dayOfWeek: number;
  startMin: number;
  endMin: number;
};

export type PlannerWeek = {
  days: { dayOfWeek: number; teaching: boolean | null }[];
  lessons: PlannerLesson[];
};

export type PlannerPerson = {
  id: string;
  label: string;
  //* A hetek, amikből az elfoglaltságát ismerjük. Üres = nem tudjuk.
  weeks: PlannerWeek[];
  //! A DUÁLIS NAP ITT IS A BEOSZTÁSBÓL ÜTKÖZIK, NEM A HETEKBŐL — ugyanaz az
  //! érv, mint a `club-fit.ts`-ben: egy B heti munkanap lehet, hogy egyik
  //! ismert hétből sem látszik, mégis kéthetente elmarad miatta a szakkör.
  //! `null`/hiányzó = nincs (vagy nem ismert) duális beosztása.
  dual?: DualSchedule | null;
};

export type TimeSuggestion = {
  weekday: number;
  startMin: number;
  endMin: number;
  /** Hány tag ér rá biztosan. */
  free: number;
  /** Akiknek órájuk van ebben a sávban (legalább az egyik héten). */
  busy: { id: string; label: string }[];
  /** Akiknek az órarendjéből erre a napra nem tudunk semmit. */
  unknown: number;
  total: number;
  //! A KÉNYELEM MÉRTÉKE: hány percet kell egy ráérő tagnak (vagy a tanárnak)
  //! ÖSSZESEN üresen várnia a szakkör miatt — a napja vége és a kezdés
  //! között, vagy a befejezés és az első órája között. A két óra közti
  //! lyukasórába eső szakkör nem kerül semmibe: ott úgyis bent van.
  /** Átlagos várakozás percben (a ráérők és a vezetők átlaga). */
  waitMinutes: number;
};

//* ---------------------------------------------------------------------------
//* A JELÖLT IDŐPONTOK
//* ---------------------------------------------------------------------------
//! A CSENGETÉSHEZ IGAZODUNK. Egy 14:37-kor kezdődő szakkör számtanilag lehet
//! a legjobb, de senki nem fogja megjegyezni; az órakezdés viszont mindenki
//! fejében ott van. Az utolsó óra után — ahol a legtöbb szakkör él — félórás
//! lépésekben megyünk tovább a nap végéig.
export const EARLIEST_START = 7 * 60;
export const LATEST_END = 17 * 60 + 30;
const AFTER_SCHOOL_STEP = 30;

export function candidateStarts(
  periods: readonly TimetablePeriod[],
  durationMin: number,
): number[] {
  const starts = new Set<number>();
  for (const p of periods) starts.add(p.startMin);
  const lastEnd = periods.reduce((max, p) => Math.max(max, p.endMin), 0);
  if (lastEnd > 0) {
    //* Az utolsó óra után tíz perccel (a szokásos szünet), aztán félóránként.
    for (
      let t = lastEnd + 10;
      t + durationMin <= LATEST_END;
      t += AFTER_SCHOOL_STEP
    ) {
      starts.add(t);
    }
  }
  return [...starts]
    .filter((s) => s >= EARLIEST_START && s + durationMin <= LATEST_END)
    .sort((a, b) => a - b);
}

//* Félig nyitott sávok: a 14:25-kor végződő óra nem ütközik a 14:25-kor
//* kezdődő szakkörrel.
function overlaps(
  a: { startMin: number; endMin: number },
  b: { startMin: number; endMin: number },
): boolean {
  return a.startMin < b.endMin && b.startMin < a.endMin;
}

type PersonVerdict =
  | { verdict: "free"; wait: number }
  | { verdict: "busy" }
  | { verdict: "unknown" };

//! EGY EMBER EGY SÁVBAN. Egyetlen héten egyetlen ütköző óra elég a
//! „nem ér rá"-hoz. Tanítás nélküli nap és óra nélküli tanítási nap nem tanú
//! (ugyanaz a szabály, mint a `slotFit`-ben); ha egyik hét sem tanú, nem
//! tudjuk. A várakozás a LEGROSSZABB hét szerint számít — aki A héten a
//! 8. óra után, B héten a 6. után végez, az B héten vár többet.
export function personAt(
  weeks: readonly PlannerWeek[],
  weekday: number,
  band: { startMin: number; endMin: number },
  dual: DualSchedule | null = null,
): PersonVerdict {
  //! Kéthetente úgyis elmarad miatta — ütközés, a hetektől függetlenül.
  if (dualWeeksOf(dual, weekday).length > 0) return { verdict: "busy" };
  let witnessed = false;
  let wait = 0;
  for (const week of weeks) {
    const day = week.days.find((d) => d.dayOfWeek === weekday);
    if (!day || day.teaching === false) continue;
    const lessons = week.lessons.filter((l) => l.dayOfWeek === weekday);
    if (lessons.length === 0) continue;
    if (lessons.some((l) => overlaps(l, band))) return { verdict: "busy" };
    witnessed = true;
    const before = lessons.filter((l) => l.endMin <= band.startMin);
    const after = lessons.filter((l) => l.startMin >= band.endMin);
    let weekWait = 0;
    if (before.length > 0 && after.length === 0) {
      weekWait = band.startMin - Math.max(...before.map((l) => l.endMin));
    } else if (after.length > 0 && before.length === 0) {
      weekWait = Math.min(...after.map((l) => l.startMin)) - band.endMin;
    }
    wait = Math.max(wait, weekWait);
  }
  return witnessed ? { verdict: "free", wait } : { verdict: "unknown" };
}

//* Van-e egyáltalán tanítás ezen a napon valamelyik ismert héten. Ha minden
//* ismert hét szerint szünnap, oda nem javaslunk rendszeres időpontot.
function someTeaching(
  people: readonly PlannerPerson[],
  weekday: number,
): boolean {
  let seen = false;
  for (const person of people) {
    for (const week of person.weeks) {
      const day = week.days.find((d) => d.dayOfWeek === weekday);
      if (!day) continue;
      seen = true;
      if (day.teaching !== false) return true;
    }
  }
  //* Semmit nem tudunk a napról: nem zárjuk ki.
  return !seen;
}

//! LEGFELJEBB KETTŐ EGY NAPRÓL. Különben az első öt javaslat mind ugyanaz a
//! kedd délután lenne öt csengetési sávban — a tanár pedig pont azt kérdezi,
//! MELYIK NAP a jó.
const PER_DAY = 2;

export function suggestClubTimes(input: {
  members: readonly PlannerPerson[];
  teachers: readonly PlannerPerson[];
  periods: readonly TimetablePeriod[];
  durationMin: number;
  weekdays?: readonly number[];
  limit?: number;
}): TimeSuggestion[] {
  const weekdays = input.weekdays ?? [1, 2, 3, 4, 5];
  const limit = input.limit ?? 5;
  const everyone = [...input.members, ...input.teachers];
  const all: TimeSuggestion[] = [];

  for (const weekday of weekdays) {
    if (!someTeaching(everyone, weekday)) continue;
    for (const startMin of candidateStarts(input.periods, input.durationMin)) {
      const band = { startMin, endMin: startMin + input.durationMin };

      let teacherWait = 0;
      let teachersKnown = 0;
      let teacherBusy = false;
      for (const teacher of input.teachers) {
        const v = personAt(teacher.weeks, weekday, band, teacher.dual);
        if (v.verdict === "busy") {
          teacherBusy = true;
          break;
        }
        if (v.verdict === "free") {
          teacherWait += v.wait;
          teachersKnown++;
        }
      }
      if (teacherBusy) continue;

      let free = 0;
      let unknown = 0;
      let memberWait = 0;
      const busy: { id: string; label: string }[] = [];
      for (const member of input.members) {
        const v = personAt(member.weeks, weekday, band, member.dual);
        if (v.verdict === "busy")
          busy.push({ id: member.id, label: member.label });
        else if (v.verdict === "unknown") unknown++;
        else {
          free++;
          memberWait += v.wait;
        }
      }
      //! SENKI NEM ÉR RÁ = NEM JAVASLAT. Ha akiről tudunk, mind foglalt, a
      //! sáv csak azért kerülne elő, mert a vezetőnek ott nincs várakozása —
      //! a tagok nélkül viszont nincs szakkör. (Ha senkiről nem tudunk
      //! semmit, marad: a „nem tudjuk" nem „nem ér rá".)
      if (free === 0 && busy.length > 0) continue;
      //* Akiről nem tudunk semmit, az az átlagot sem húzhatja le.
      const waiters = free + teachersKnown;
      all.push({
        weekday,
        startMin,
        endMin: band.endMin,
        free,
        busy,
        unknown,
        total: input.members.length,
        waitMinutes:
          waiters > 0 ? Math.round((memberWait + teacherWait) / waiters) : 0,
      });
    }
  }

  //! A SORREND: előbb a ráérők száma, aztán a várakozás, aztán a kevesebb
  //! bizonytalan, végül a korábbi nap és időpont — hogy ugyanarra a kérdésre
  //! mindig ugyanaz legyen a válasz.
  all.sort(
    (a, b) =>
      b.free - a.free ||
      a.waitMinutes - b.waitMinutes ||
      a.unknown - b.unknown ||
      a.weekday - b.weekday ||
      a.startMin - b.startMin,
  );

  const perDay = new Map<number, number>();
  const picked: TimeSuggestion[] = [];
  for (const s of all) {
    const n = perDay.get(s.weekday) ?? 0;
    if (n >= PER_DAY) continue;
    perDay.set(s.weekday, n + 1);
    picked.push(s);
    if (picked.length >= limit) break;
  }
  return picked;
}

//* ---------------------------------------------------------------------------
//* A SZABAD TERMEK
//* ---------------------------------------------------------------------------

export type RoomSuggestion = {
  short: string;
  name: string;
  computer: boolean;
  //! MIÉRT ELŐL. A szakkör mostani terme a legjobb (oda szoktak), utána egy
  //! terem, ahol a vezető úgyis tanít (ott a felszerelése) — a többi csak
  //! szabad.
  reason: "current" | "teacher" | null;
  /** Mettől szabad aznap (az előző foglalás vége); `null` = reggeltől. */
  freeFrom: number | null;
  /** Meddig szabad aznap (a következő foglalás kezdete); `null` = estig. */
  freeUntil: number | null;
};

export type RoomSuggestions = {
  free: RoomSuggestion[];
  //* A termek, amikről legalább egy héten nem tudunk semmit — nem szabadok,
  //* csak ismeretlenek (ugyanaz az elv, mint a teremkeresőben).
  unknown: string[];
};

const REASON_RANK = { current: 0, teacher: 1 } as const;

function roomOrder(a: string, b: string): number {
  return a.localeCompare(b, "hu", { numeric: true });
}

export function suggestClubRooms(input: {
  occupancies: readonly WeekOccupancy[];
  weekday: number;
  startMin: number;
  endMin: number;
  onlyComputers: boolean;
  //* A szakkör mostani termei — ezek elsők.
  currentRooms: readonly string[];
  //* A termek, ahol a vezető(k) ezeken a heteken tanítanak.
  teacherRooms: readonly string[];
  //! A SZAKKÖR SAJÁT KÁRTYÁJA NEM FOGLALJA A TERMET. Ha a szakkör most is
  //! ott van ebben a sávban, a teremnek szabadnak kell látszania — különben a
  //! tervező a mostani termét adná foglaltnak saját maga miatt.
  isOwnBooking?: (booking: RoomBooking, room: string) => boolean;
}): RoomSuggestions {
  const band = { startMin: input.startMin, endMin: input.endMin };
  const key = (s: string) => s.trim().toLocaleLowerCase("hu");
  const current = new Set(input.currentRooms.map(key));
  const teacher = new Set(input.teacherRooms.map(key));

  const unknown = new Set<string>();
  for (const occ of input.occupancies) {
    for (const short of occ.unknown) unknown.add(short);
  }

  //* A termek halmaza: bármelyik héten sepertük. Ami egy héten hiányzik a
  //* seprésből, az ismeretlen marad.
  const names = new Map<string, string>();
  for (const occ of input.occupancies) {
    for (const room of occ.rooms) names.set(room.short, room.name);
  }

  const free: RoomSuggestion[] = [];
  for (const [short, name] of names) {
    if (unknown.has(short)) continue;
    const computer = isComputerRoom(short);
    if (input.onlyComputers && !computer) continue;

    let clash = false;
    let missing = false;
    let freeFrom: number | null = null;
    let freeUntil: number | null = null;
    for (const occ of input.occupancies) {
      const day = occ.days.find((d) => d.dayOfWeek === input.weekday);
      if (day?.teaching === false) continue;
      const room = occ.rooms.find((r) => r.short === short);
      if (!room) {
        missing = true;
        break;
      }
      const today = room.bookings.filter(
        (b) => b.dayOfWeek === input.weekday && !input.isOwnBooking?.(b, short),
      );
      if (today.some((b) => overlaps(b, band))) {
        clash = true;
        break;
      }
      for (const b of today) {
        if (b.endMin <= band.startMin) {
          freeFrom = Math.max(freeFrom ?? 0, b.endMin);
        }
        if (b.startMin >= band.endMin) {
          freeUntil = Math.min(
            freeUntil ?? Number.POSITIVE_INFINITY,
            b.startMin,
          );
        }
      }
    }
    if (missing) {
      unknown.add(short);
      continue;
    }
    if (clash) continue;

    free.push({
      short,
      name,
      computer,
      reason: current.has(key(short))
        ? "current"
        : teacher.has(key(short))
          ? "teacher"
          : null,
      freeFrom,
      freeUntil,
    });
  }

  free.sort((a, b) => {
    const ra = a.reason ? REASON_RANK[a.reason] : 2;
    const rb = b.reason ? REASON_RANK[b.reason] : 2;
    return ra - rb || roomOrder(a.short, b.short);
  });

  return {
    free,
    unknown: [...unknown]
      .filter((short) => !input.onlyComputers || isComputerRoom(short))
      .sort(roomOrder),
  };
}
