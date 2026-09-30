import {
  budapestDayKey,
  type CompetitionStatus,
  deadlineOf,
} from "./competitions";

//! ═══════════════════════════════════════════════════════════════════════════
//! A HATÁRIDŐ-FOLYAM — A KÖVETKEZŐ HETEK EGY VONALON
//! ═══════════════════════════════════════════════════════════════════════════
//! A `/versenyek` tetején nem egy lista áll, hanem az idő: a folyó hét
//! hétfőjétől néhány héttel előre. Minden közelgő verseny egy sor; a sorban a
//! MOSTTÓL a nevezési határidőig tartó szakasz az, ami a diákon múlik — ennyi
//! ideje van még —, onnan pontozott vonal visz a verseny napjáig. A szakasz
//! hossza maga a hátralévő idő: egy pillantásból látszik, mi sürgős és mi ér
//! rá.
//!
//! TISZTA FÜGGVÉNYEK. A „most" paraméter, a helyek törtek (0 = a tengely
//! eleje, 1 = a vége); a pixel a böngésző dolga.
//! ═══════════════════════════════════════════════════════════════════════════

export const RIVER_MIN_WEEKS = 4;
export const RIVER_MAX_WEEKS = 10;
const DAY_MS = 86_400_000;

const MINUTE_FMT = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Budapest",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

//* Budapesti naptári nap sorszáma + a napon belüli tört: a tengely nem UTC-ben
//* számol, különben a határidő este kilenckor a következő napra csúszna.
export function budapestDayValue(date: Date): number {
  const key = budapestDayKey(date);
  const day =
    Date.UTC(
      Number(key.slice(0, 4)),
      Number(key.slice(5, 7)) - 1,
      Number(key.slice(8, 10)),
    ) / DAY_MS;
  const [h, m] = MINUTE_FMT.format(date).split(":").map(Number);
  return day + (h * 60 + m) / 1440;
}

export type RiverAxis = {
  /** A tengely eleje: a folyó hét hétfője, napsorszámban. */
  from: number;
  /** A vége, napsorszámban (kizáró). */
  to: number;
  /** A hétfők a tengelyen — a heti beosztás vonalai. */
  weeks: { day: number; label: string; month: string | null }[];
};

const MONTH_FMT = new Intl.DateTimeFormat("hu-HU", {
  timeZone: "UTC",
  month: "short",
});
const DAY_FMT = new Intl.DateTimeFormat("hu-HU", {
  timeZone: "UTC",
  day: "numeric",
});

//! A TENGELY A HÉT ELEJÉN INDUL, nem a mostnál: így a most vonala a héten
//! belül áll, és a hét napjai viszonyítanak. A vége a legkésőbbi közelgő
//! dátumig ér, legalább négy, legfeljebb tíz hétig — ami ennél később van,
//! az a sor végén nyíllal jelzi magát, és nem nyomja össze a többit.
export function riverAxis(now: Date, dates: readonly Date[]): RiverAxis {
  const today = Math.floor(budapestDayValue(now));
  //* 1970-01-01 csütörtök volt: a hét napja a sorszámból.
  const weekday = (((today + 3) % 7) + 7) % 7; // 0 = hétfő
  const from = today - weekday;
  const latest = Math.max(today, ...dates.map((d) => budapestDayValue(d)));
  const weeksNeeded = Math.ceil((latest - from + 1) / 7) + 1;
  const count = Math.min(
    RIVER_MAX_WEEKS,
    Math.max(RIVER_MIN_WEEKS, weeksNeeded),
  );
  const weeks: RiverAxis["weeks"] = [];
  let lastMonth = "";
  for (let i = 0; i < count; i++) {
    const day = from + i * 7;
    const date = new Date(day * DAY_MS);
    const month = MONTH_FMT.format(date);
    weeks.push({
      day,
      label: DAY_FMT.format(date).replace(/\.$/, ""),
      month: month !== lastMonth ? month : null,
    });
    lastMonth = month;
  }
  return { from, to: from + count * 7, weeks };
}

export function riverPosition(axis: RiverAxis, value: number): number {
  return (value - axis.from) / (axis.to - axis.from);
}

//* ---------------------------------------------------------------------------
//* A SOROK
//* ---------------------------------------------------------------------------
export type RiverContest = {
  slug: string;
  status: CompetitionStatus;
  startsAt: Date;
  registrationDeadline: Date | null;
};

export type RiverLane<T extends RiverContest> = {
  contest: T;
  /** Nevezhet-e még: nyitott, és a határidő a jövőben van. */
  open: boolean;
  /** Három napon belül jár le — élő szerep, piros. */
  soon: boolean;
  now: number;
  deadline: number;
  event: number;
};

export const SOON_DAYS = 3;

//! A FOLYAMBAN AZ ÁLL, AMI MÉG ELŐTTÜNK VAN: a nyitott vagy lezárt nevezésű
//! verseny, ami még nem kezdődött el. Előbb a nyitottak, a legsürgősebbel
//! kezdve; utánuk a lezártak a verseny napja szerint.
export function riverLanes<T extends RiverContest>(
  contests: readonly T[],
  now: Date,
): RiverLane<T>[] {
  const nowValue = budapestDayValue(now);
  return contests
    .filter(
      (c) =>
        (c.status === "OPEN" || c.status === "CLOSED") &&
        c.startsAt.getTime() > now.getTime(),
    )
    .map((contest) => {
      const deadline = deadlineOf(contest);
      const open =
        contest.status === "OPEN" && deadline.getTime() > now.getTime();
      return {
        contest,
        open,
        soon: open && deadline.getTime() - now.getTime() < SOON_DAYS * DAY_MS,
        now: nowValue,
        deadline: budapestDayValue(deadline),
        event: budapestDayValue(contest.startsAt),
      };
    })
    .sort((a, b) => {
      if (a.open !== b.open) return a.open ? -1 : 1;
      return a.open ? a.deadline - b.deadline : a.event - b.event;
    });
}
