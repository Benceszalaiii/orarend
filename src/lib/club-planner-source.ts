import "server-only";

import { ownLessons } from "./club-fit";
import {
  type PlannerPerson,
  type PlannerWeek,
  type RoomSuggestions,
  suggestClubRooms,
  suggestClubTimes,
  type TimeSuggestion,
} from "./club-planner";
import { bookingMatchesSlot, type ScheduleSlot } from "./club-schedule";
import { loadWeekOccupancy } from "./free-rooms-source";
import { type DualScheduleEntry, sanitizePrefs } from "./prefs-shared";
import prisma from "./prisma";
import { budapestNow } from "./push-plan";
import {
  addDays,
  getTimetableWeek,
  mondayOf,
  type TimetablePeriod,
  type TimetableWeek,
} from "./timetable";

//! ═══════════════════════════════════════════════════════════════════════════
//! SZAKKÖR-TERVEZŐ — A LEKÉRÉS
//! ═══════════════════════════════════════════════════════════════════════════
//! A tiszta számítás a `club-planner.ts`-ben; itt csak összeszedjük hozzá az
//! órarendeket.
//!
//! KÉT EGYMÁST KÖVETŐ HÉT, mert az A/B hét nem ugyanaz: a mostani (hétvégén
//! a jövő heti) és az utána következő. Mindkettő a teremkereső ablakán belül
//! van (`servableWeeks`), így a termek ugyanabból a seprésből jönnek.
//!
//! OSZTÁLYONKÉNT EGY LEKÉRÉS, NEM TAGONKÉNT. Egy osztály órarendje minden
//! tagjának ugyanaz; a különbség csak a csoportválasztás, és az a tag
//! szinkronizált beállításaiban van (`Preference.data.merge`), nem a
//! Jedlikinfóban. Egy 20 fős szakkör így jellemzően 5–8 osztály × 2 hét.
//! ═══════════════════════════════════════════════════════════════════════════

//* Ugyanaz a visszafogottság, mint a teremseprésnél: egy iskolai szerverre
//* nem zúdítunk párhuzamos kéréseket azért, mert elbírná.
const CONCURRENCY = 4;
//* Ennél több osztályból álló szakkörnél a maradék osztály tagjai
//* „nem tudjuk" lesznek — a korlát ne a szakkör méretén múljon.
const MAX_CLASSES = 24;

async function pooled<T, R>(
  items: readonly T[],
  run: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const worker = async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await run(items[index]);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, items.length) }, worker),
  );
  return results;
}

//! HÉTVÉGÉN A KÖVETKEZŐ HÉT — ugyanaz a döntés, mint a szakkör lapján.
export function planningWeeks(): string[] {
  const today = budapestNow().dayKey;
  const dow = new Date(`${today}T00:00:00Z`).getUTCDay();
  const first =
    dow === 0 || dow === 6 ? addDays(mondayOf(today), 7) : mondayOf(today);
  return [first, addDays(first, 7)];
}

type PlannerClub = {
  organizers: string[];
  classes: string[];
  slots: ScheduleSlot[];
  members: {
    id: string;
    name: string;
    className: string | null;
    merge: Record<string, { clusterKey: string; chosen: string }[]>;
    dual: Record<string, DualScheduleEntry>;
  }[];
};

async function loadPlannerClub(slug: string): Promise<PlannerClub | null> {
  const row = await prisma.club.findUnique({
    where: { slug },
    select: {
      classes: true,
      organizers: { select: { teacher: true } },
      slots: {
        select: {
          id: true,
          weekday: true,
          startMinute: true,
          endMinute: true,
          room: true,
          teachers: true,
          source: true,
        },
      },
      members: {
        select: {
          user: {
            select: {
              id: true,
              name: true,
              class: true,
              preference: { select: { data: true } },
            },
          },
        },
      },
    },
  });
  if (!row) return null;
  return {
    organizers: row.organizers.map((o) => o.teacher),
    classes: row.classes,
    slots: row.slots.map((s) => ({ ...s, validFrom: null, validUntil: null })),
    members: row.members.map(({ user }) => {
      const prefs = user.preference
        ? sanitizePrefs(user.preference.data)
        : null;
      return {
        id: user.id,
        name: user.name,
        className: user.class,
        merge: prefs?.merge ?? {},
        dual: prefs?.dual ?? {},
      };
    }),
  };
}

function plannerWeek(week: TimetableWeek): PlannerWeek | null {
  if (!week.ok) return null;
  return {
    days: week.days.map((d) => ({
      dayOfWeek: d.dayOfWeek,
      teaching: d.teaching,
    })),
    lessons: week.lessons,
  };
}

export type TimePlan =
  | {
      ok: true;
      //! MIBŐL SZÁMOLTUNK. Tag nélküli szakkörnél a célzott osztályokból —
      //! akkor egy „ráérő" egy egész osztályt jelent, és a felület ezt kimondja.
      basis: "members" | "classes" | "teachers";
      durationMin: number;
      suggestions: TimeSuggestion[];
      //* Tagok, akiknek nincs osztályuk a fiókjukban — nem tudunk róluk semmit.
      unplaced: number;
    }
  | { ok: false; error: string };

export async function planClubTimes(
  slug: string,
  durationMin: number,
): Promise<TimePlan> {
  const club = await loadPlannerClub(slug);
  if (!club) return { ok: false, error: "Nincs ilyen szakkör." };
  if (club.organizers.length === 0) {
    return { ok: false, error: "A szakkörnek nincs vezető tanára." };
  }

  const weeks = planningWeeks();
  const placed = club.members.filter((m) => m.className);
  const basis: "members" | "classes" | "teachers" =
    placed.length > 0
      ? "members"
      : club.classes.length > 0
        ? "classes"
        : "teachers";
  const classes = [
    ...new Set(
      basis === "members"
        ? placed.map((m) => m.className as string)
        : basis === "classes"
          ? club.classes
          : [],
    ),
  ].slice(0, MAX_CLASSES);

  type Job = { kind: "class" | "teacher"; short: string; weekStart: string };
  const jobs: Job[] = [
    ...club.organizers.flatMap((short) =>
      weeks.map((weekStart) => ({
        kind: "teacher" as const,
        short,
        weekStart,
      })),
    ),
    ...classes.flatMap((short) =>
      weeks.map((weekStart) => ({ kind: "class" as const, short, weekStart })),
    ),
  ];
  const results = await pooled(jobs, (job) =>
    getTimetableWeek(
      job.kind === "teacher"
        ? { kind: "teacher", teacher: job.short, weekStart: job.weekStart }
        : { kind: "class", class: job.short, weekStart: job.weekStart },
    ).catch(() => null),
  );

  const byKey = new Map<string, TimetableWeek[]>();
  let periods: TimetablePeriod[] = [];
  results.forEach((week, i) => {
    if (!week?.ok) return;
    if (periods.length === 0 && week.periods.length > 0) periods = week.periods;
    const key = `${jobs[i].kind}|${jobs[i].short}`;
    byKey.set(key, [...(byKey.get(key) ?? []), week]);
  });

  const teachers: PlannerPerson[] = club.organizers.map((short) => ({
    id: short,
    label: short,
    weeks: (byKey.get(`teacher|${short}`) ?? []).flatMap((w) => {
      const pw = plannerWeek(w);
      if (!pw) return [];
      //! A SZAKKÖR SAJÁT KÁRTYÁJA NEM ELFOGLALTSÁG. A vezető órarendjében a
      //! mostani időpont osztály nélküli kártyaként ott áll; ha foglaltnak
      //! számítana, a tervező pont a bevált időpontot zárná ki.
      const lessons = w.lessons.filter(
        (l) =>
          l.classShort !== "" ||
          !club.slots.some(
            (slot) =>
              slot.weekday === l.dayOfWeek &&
              slot.teachers.some(
                (t) =>
                  t.toLocaleLowerCase("hu") === short.toLocaleLowerCase("hu"),
              ) &&
              l.startMin < slot.endMinute &&
              slot.startMinute < l.endMin,
          ),
      );
      return [{ ...pw, lessons }];
    }),
  }));
  if (teachers.every((t) => t.weeks.length === 0)) {
    return {
      ok: false,
      error:
        "A vezető tanár órarendje most nem érhető el a Jedlikinfóban. Próbáld újra pár perc múlva.",
    };
  }

  const members: PlannerPerson[] =
    basis === "members"
      ? placed.map((m) => {
          const cls = m.className as string;
          const prefs = m.merge[cls] ?? [];
          const dual = m.dual[cls] ?? null;
          return {
            id: m.id,
            label: `${m.name} (${cls})`,
            dual,
            weeks: (byKey.get(`class|${cls}`) ?? []).flatMap((w) => {
              const pw = plannerWeek(w);
              //* A saját csoportválasztása szerint: aki a német TSZ-be jár,
              //* annak a német PZS ideje szabad.
              return pw
                ? [{ ...pw, lessons: ownLessons(w.lessons, prefs) }]
                : [];
            }),
          };
        })
      : classes.map((cls) => ({
          id: cls,
          label: cls,
          weeks: (byKey.get(`class|${cls}`) ?? []).flatMap((w) => {
            const pw = plannerWeek(w);
            return pw ? [pw] : [];
          }),
        }));

  return {
    ok: true,
    basis,
    durationMin,
    suggestions: suggestClubTimes({ members, teachers, periods, durationMin }),
    unplaced: club.members.length - placed.length,
  };
}

export type RoomPlan =
  | ({ ok: true } & RoomSuggestions)
  | { ok: false; error: string };

export async function planClubRooms(input: {
  slug: string;
  weekday: number;
  startMin: number;
  endMin: number;
  onlyComputers: boolean;
}): Promise<RoomPlan> {
  const club = await loadPlannerClub(input.slug);
  if (!club) return { ok: false, error: "Nincs ilyen szakkör." };

  const occupancies = (
    await Promise.all(
      planningWeeks().map((w) => loadWeekOccupancy(w).catch(() => null)),
    )
  ).filter((o) => o !== null);
  if (occupancies.length === 0) {
    return {
      ok: false,
      error:
        "A termek órarendje most nem érhető el a Jedlikinfóban. Próbáld újra pár perc múlva.",
    };
  }

  const organizers = new Set(
    club.organizers.map((t) => t.toLocaleLowerCase("hu")),
  );
  //* Ahol a vezető ezeken a heteken tanít — a seprésből, nem külön lekérésből.
  const teacherRooms = new Set<string>();
  for (const occ of occupancies) {
    for (const room of occ.rooms) {
      if (
        room.bookings.some((b) =>
          organizers.has(b.teacherShort.toLocaleLowerCase("hu")),
        )
      ) {
        teacherRooms.add(room.short);
      }
    }
  }

  return {
    ok: true,
    ...suggestClubRooms({
      occupancies,
      weekday: input.weekday,
      startMin: input.startMin,
      endMin: input.endMin,
      onlyComputers: input.onlyComputers,
      currentRooms: club.slots.flatMap((s) => (s.room ? [s.room] : [])),
      teacherRooms: [...teacherRooms],
      isOwnBooking: (booking, room) =>
        club.slots.some(
          (slot) =>
            slot.room !== null &&
            slot.room.toLocaleLowerCase("hu") ===
              room.toLocaleLowerCase("hu") &&
            bookingMatchesSlot(booking, slot),
        ),
    }),
  };
}
