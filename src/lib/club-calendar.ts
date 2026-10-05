import "server-only";

import {
  clubFeedEvents,
  type ScheduleClub,
  scheduleOnlyOccupancy,
  sessionsOfWeek,
} from "./club-schedule";
import { loadScheduleClubs } from "./club-store";
import { loadRoomsWeek } from "./free-rooms-source";
import type { IcsEvent } from "./ics";
import type { TimetableSubjectKind } from "./timetable";

//! ═══════════════════════════════════════════════════════════════════════════
//! SZAKKÖRÖK A NAPTÁR-FEEDBEN
//! ═══════════════════════════════════════════════════════════════════════════
//! A FEED ÍGÉRETE: „pontosan azok az órák, amiket a rácson is látsz" (README).
//! A rács alapból csak azt a szakkört mutatja, ami az alanyé — tanárnál a
//! saját szakkörei. Az osztálynak szóló szakkör választható, nem az osztály
//! órája, ezért az osztály-feedbe nem kerül szakkör.
//!
//! A KÖVETETT SZAKKÖRÖK SEM KERÜLNEK IDE: a követés a böngészőben él, a feed
//! jegye viszont egy szerveren tárolt sor. Aki egy követett szakkört a
//! naptárában akar, annak a szakkör saját feedje való (`naptar.ics`).
//! ═══════════════════════════════════════════════════════════════════════════

type FeedWeekDays = {
  weekStart: string;
  days: readonly {
    dateKey: string;
    dayOfWeek: number;
    week: string;
    teaching: boolean | null;
  }[];
};

function clubsFor(
  clubs: readonly ScheduleClub[],
  short: string,
): ScheduleClub[] {
  const teacher = short.toLocaleUpperCase("hu");
  return clubs.filter((club) => club.organizers.includes(teacher));
}

//* Soha nem dob: a szakkörök hiánya nem viheti el a feedet.
export async function clubEventsForFeed(
  kind: TimetableSubjectKind,
  short: string,
  weeks: readonly FeedWeekDays[],
): Promise<IcsEvent[]> {
  if (kind !== "teacher") return [];
  try {
    const clubs = clubsFor(await loadScheduleClubs(), short);
    if (clubs.length === 0) return [];
    const rooms = clubs.flatMap((c) =>
      c.slots.flatMap((s) =>
        s.source === "TIMETABLE" && s.room ? [s.room] : [],
      ),
    );
    const events: IcsEvent[] = [];
    for (const week of weeks) {
      const occupancy =
        (await loadRoomsWeek(rooms, week.weekStart).catch(() => null)) ??
        scheduleOnlyOccupancy(week.weekStart, week.days, rooms);
      events.push(
        ...clubFeedEvents(sessionsOfWeek(clubs, occupancy, week.weekStart)),
      );
    }
    return events;
  } catch {
    return [];
  }
}
