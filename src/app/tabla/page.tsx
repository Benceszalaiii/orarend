import { CalendarClock, DoorOpen, Trophy } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { accentStyle } from "@/lib/accent";
import { canBrowseClubs, clubsLaunched } from "@/lib/club-access";
import { type ClubSession, sessionsOfWeek } from "@/lib/club-schedule";
import { loadScheduleClubs, resolveActor } from "@/lib/club-store";
import { formatMinute } from "@/lib/clubs";
import { loadLiveCompetitions } from "@/lib/competition-store";
import {
  daysUntil,
  deadlineLabel,
  deadlineOf,
  openDeadlines,
} from "@/lib/competitions";
import { loadWeekOccupancy } from "@/lib/free-rooms-source";
import {
  type BoardSession,
  boardSessions,
  dayLabel,
  isoWeekday,
  pickBoardDay,
} from "@/lib/hallway-board";
import { budapestNow } from "@/lib/push-plan";
import { mondayOf } from "@/lib/timetable";
import { cn } from "@/lib/utils";
import { BoardClock } from "./board-clock";

export const metadata: Metadata = {
  title: "Folyosói tábla - Órarend",
  description:
    "A mai szakkörök termei és a közelgő nevezési határidők — az iskola kijelzőire.",
  robots: { index: false, follow: false },
};

//! MINDIG FRISS: a „most" és a „következik" a kérés percétől függ. A drága
//! rész (a termek heti seprése, a szakkörök listája) a saját gyorsítótárában
//! él, így egy percenkénti frissítés sem ér el a Jedlikinfóig.
export const dynamic = "force-dynamic";

//! ═══════════════════════════════════════════════════════════════════════════
//! A FOLYOSÓI TÁBLA
//! ═══════════════════════════════════════════════════════════════════════════
//! AKINEK NINCS MEG AZ APP, ANNAK IS. Egy kijelző a folyosón: ma milyen
//! szakkörök vannak, hol és mikor, és mire lehet még nevezni. Nincs rajta
//! semmi, ami egy diákról szólna — se tagság, se nevezés, csak az, ami a
//! szakkörlistán is nyilvános.
//!
//! TÁVOLRÓL OLVASHATÓ: nagy számok, kevés szó, egy nap. A hét a `/szakkorok`
//! dolga; ide az kerül, ami a képernyő előtt elsétálónak most számít.
//! ═══════════════════════════════════════════════════════════════════════════

const DEADLINE_LIMIT = 5;
//* „Hamarosan": ennyi napon belül kezdődő verseny.
const UPCOMING_DAYS = 14;

const STATUS_NOTE: Partial<Record<ClubSession["status"], string>> = {
  declared: "a vezető szerint",
  missing: "nincs az iskola órarendjében",
  unknown: "nem ellenőrizhető",
};

async function sessionsOfDay(
  clubs: Awaited<ReturnType<typeof loadScheduleClubs>>,
  dayKey: string,
): Promise<ClubSession[]> {
  const monday = mondayOf(dayKey);
  const occupancy = await loadWeekOccupancy(monday).catch(() => null);
  return sessionsOfWeek(clubs, occupancy, monday).filter(
    (s) => s.dateKey === dayKey,
  );
}

export default async function TablaPage() {
  const launched = clubsLaunched();
  if (!launched && !canBrowseClubs(await resolveActor(), false)) notFound();

  const now = new Date();
  const { dayKey: today, minutes } = budapestNow(now);
  const [clubs, competitions] = await Promise.all([
    loadScheduleClubs(),
    loadLiveCompetitions(),
  ]);

  //! A TANÍTÁS NÉLKÜLI NAP ALKALMA NEM „HÁTRALÉVŐ". Szünetben a mai nap
  //! nem tartja a kijelzőt egy üres ígérettel — a következő nap jön.
  const todays =
    isoWeekday(today) <= 5 ? await sessionsOfDay(clubs, today) : [];
  const target = pickBoardDay(
    today,
    () =>
      boardSessions(
        todays.filter((s) => s.status !== "no-school"),
        today,
        minutes,
      ).length > 0,
  );
  const daySessions =
    target === today ? todays : await sessionsOfDay(clubs, target);
  const noSchool =
    daySessions.length > 0 &&
    daySessions.every((s) => s.status === "no-school");
  const list = boardSessions(
    daySessions.filter((s) => s.status !== "no-school"),
    target,
    target === today ? minutes : null,
  );

  const deadlines = openDeadlines(competitions, now).slice(0, DEADLINE_LIMIT);
  const horizon = now.getTime() + UPCOMING_DAYS * 86_400_000;
  const upcoming = competitions
    .filter(
      (c) =>
        (c.status === "OPEN" || c.status === "CLOSED") &&
        c.startsAt.getTime() > now.getTime() &&
        c.startsAt.getTime() <= horizon,
    )
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
    .slice(0, 3);

  const label = dayLabel(target, today);
  const dateText = new Intl.DateTimeFormat("hu-HU", {
    timeZone: "Europe/Budapest",
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(new Date(`${target}T12:00:00Z`));

  return (
    <main className="flex min-h-[100dvh] flex-col bg-background px-6 py-6 text-foreground sm:px-10 lg:px-14 lg:py-10">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-5">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.14em] text-muted-strong">
            Jedlik · Szakkörök
          </p>
          <h1 className="mt-1 text-4xl font-bold tracking-tight lg:text-6xl">
            {label}{" "}
            <span className="text-2xl font-medium text-muted-strong lg:text-4xl">
              {dateText}
            </span>
          </h1>
        </div>
        <BoardClock />
      </header>

      <div className="mt-8 grid grow gap-10 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)] lg:gap-14">
        <section aria-labelledby="board-clubs">
          <h2 id="board-clubs" className="sr-only">
            Szakkörök
          </h2>
          {noSchool ? (
            <p className="text-2xl text-muted-strong lg:text-3xl">
              {label} az iskola rendje szerint nincs tanítás.
            </p>
          ) : list.length === 0 ? (
            <p className="text-2xl text-muted-strong lg:text-3xl">
              {label} nincs szakkör a listában.
            </p>
          ) : (
            <ol className="flex flex-col divide-y divide-border">
              {list.map((s) => (
                <BoardRow key={s.id} session={s} />
              ))}
            </ol>
          )}
        </section>

        <aside className="flex flex-col gap-10">
          <section aria-labelledby="board-deadlines">
            <h2
              id="board-deadlines"
              className="flex items-center gap-2 text-lg font-semibold text-muted-strong lg:text-xl"
            >
              <CalendarClock className="size-5" aria-hidden />
              Nevezési határidők
            </h2>
            {deadlines.length === 0 ? (
              <p className="mt-3 text-lg text-muted-strong">
                Most nincs nyitott nevezés.
              </p>
            ) : (
              <ul className="mt-3 flex flex-col gap-3">
                {deadlines.map((c) => {
                  const due = deadlineOf(c);
                  //* Ma vagy holnap jár le: ez az, amit a folyosón észre kell venni.
                  const urgent = daysUntil(due, now) <= 1;
                  return (
                    <li key={c.slug} className="flex flex-col">
                      <span className="text-xl font-semibold leading-snug lg:text-2xl">
                        {c.name}
                      </span>
                      <span
                        className={cn(
                          "text-base font-medium lg:text-lg",
                          urgent ? "text-destructive" : "text-muted-strong",
                        )}
                      >
                        {deadlineLabel(due, now)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {upcoming.length > 0 && (
            <section aria-labelledby="board-upcoming">
              <h2
                id="board-upcoming"
                className="flex items-center gap-2 text-lg font-semibold text-muted-strong lg:text-xl"
              >
                <Trophy className="size-5" aria-hidden />
                Hamarosan
              </h2>
              <ul className="mt-3 flex flex-col gap-3">
                {upcoming.map((c) => (
                  <li key={c.slug} className="flex flex-col">
                    <span className="text-xl font-semibold leading-snug lg:text-2xl">
                      {c.name}
                    </span>
                    <span className="text-base text-muted-strong lg:text-lg">
                      {new Intl.DateTimeFormat("hu-HU", {
                        timeZone: "Europe/Budapest",
                        month: "long",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      }).format(c.startsAt)}
                      {c.venue === "SCHOOL" && c.room ? ` · ${c.room}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      </div>

      <footer className="mt-10 border-t border-border pt-4 text-base text-muted-strong lg:text-lg">
        Minden szakkör és verseny:{" "}
        <span className="font-semibold text-foreground">
          jedlik.info/szakkorok
        </span>
      </footer>
    </main>
  );
}

function BoardRow({ session }: { session: BoardSession }) {
  const note = STATUS_NOTE[session.status];
  return (
    <li
      style={accentStyle(session.clubSlug)}
      className={cn(
        //* Keskeny kijelzőn a nagy kezdési idő oszlopa kimarad — a név alatt
        //* úgyis ott áll a teljes sáv, és a név kapja meg a helyet.
        "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 py-4 sm:grid-cols-[5.5rem_minmax(0,1fr)_auto] sm:gap-x-5 lg:grid-cols-[8rem_minmax(0,1fr)_auto] lg:py-5",
        session.phase === "later" && "opacity-80",
      )}
    >
      <span className="hidden text-2xl font-bold tabular-nums sm:block lg:text-4xl">
        {formatMinute(session.startMin)}
      </span>
      <span className="min-w-0">
        <span className="flex items-center gap-2.5">
          <span
            className="acc-dot size-2.5 shrink-0 rounded-full"
            aria-hidden
          />
          <span className="min-w-0 text-pretty break-words hyphens-auto text-xl font-semibold leading-tight lg:text-3xl">
            {session.clubName}
          </span>
        </span>
        <span className="mt-1 flex flex-wrap items-center gap-x-3 text-base text-muted-strong lg:text-lg">
          {session.phase === "now" && (
            <span className="rounded-full bg-primary px-2.5 py-0.5 text-sm font-semibold text-primary-foreground">
              Most
            </span>
          )}
          {session.phase === "next" && (
            <span className="rounded-full border border-primary px-2.5 py-0.5 text-sm font-semibold text-primary">
              Következik
            </span>
          )}
          <span className="tabular-nums">
            {formatMinute(session.startMin)}–{formatMinute(session.endMin)}
          </span>
          {note && <span>· {note}</span>}
        </span>
      </span>
      <span className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-1.5 text-2xl font-bold tabular-nums lg:text-4xl">
        <DoorOpen className="size-5 text-muted-strong lg:size-7" aria-hidden />
        {session.room}
      </span>
    </li>
  );
}
