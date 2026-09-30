"use client";

import { ArrowRight, MapPin, Users } from "lucide-react";
import Link from "next/link";
import type { CSSProperties } from "react";
import { listGroup } from "@/components/ma/week-panels";
import { accentStyle } from "@/lib/accent";
import { audienceLabel, type ClubAudience } from "@/lib/clubs";
import {
  CATEGORY_LABELS,
  deadlineLabel,
  deadlineOf,
  VENUE_LABELS,
} from "@/lib/competitions";
import {
  budapestDayValue,
  type RiverAxis,
  type RiverLane,
  riverPosition,
} from "@/lib/contest-river";
import { cn } from "@/lib/utils";
import type { ContestCardData, withDates } from "./contest-card";

//* ---------------------------------------------------------------------------
//* A HATÁRIDŐ-FOLYAM
//* ---------------------------------------------------------------------------
//! A SZAKASZ HOSSZA A HÁTRALÉVŐ IDŐ. Minden sor a MOSTTÓL indul (a piros
//! vonal, ahogy a `/ma` szalagján), és a nevezési határidőig tart — ennyi
//! ideje van a diáknak. Onnan pontozott vonal visz a verseny napjáig, ahol a
//! verseny saját színű pöttye áll. Ami három napon belül lejár, annak a
//! szakasza piros: élő szerep, cselekedni kell. Minden más fehér — a szín
//! nem díszít, hanem sürget.
//!
//! A SOR MAGA A LINK, és a szövege mindent kimond, amit a rajz mutat: a
//! képernyőolvasó a nevet, a határidőt és a verseny napját hallja, a vonalak
//! némák.

type Dated = ReturnType<typeof withDates>;
type Lane = RiverLane<Dated>;

const SHORT_DATE = new Intl.DateTimeFormat("hu-HU", {
  timeZone: "Europe/Budapest",
  month: "short",
  day: "numeric",
});
const FULL_WHEN = new Intl.DateTimeFormat("hu-HU", {
  timeZone: "Europe/Budapest",
  month: "long",
  day: "numeric",
  weekday: "long",
  hour: "numeric",
  minute: "2-digit",
});

function where(
  c: Pick<ContestCardData, "venue" | "room" | "location">,
): string {
  return c.venue === "SCHOOL"
    ? c.room
      ? `${c.room} terem`
      : VENUE_LABELS.SCHOOL
    : c.venue === "EXTERNAL"
      ? (c.location ?? VENUE_LABELS.EXTERNAL)
      : VENUE_LABELS.ONLINE;
}

export function DeadlineRiver({
  lanes,
  axis,
  now,
  eligible,
}: {
  lanes: Lane[];
  axis: RiverAxis;
  now: Date;
  eligible: (c: ClubAudience) => boolean;
}) {
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  const pos = (value: number) => clamp(riverPosition(axis, value));
  const nowPos = pos(budapestDayValue(now));
  const vars = {
    "--now": `${nowPos * 100}%`,
    "--nowf": nowPos,
    "--weeks": axis.weeks.length,
  } as CSSProperties;

  return (
    <div className="cr" style={vars}>
      {/*//* A tengely: hétfőnként egy vonás, a hónap neve az első hetén. */}
      <div className="cr-row cr-axis" aria-hidden>
        <span className="cr-name-col" />
        <div className="cr-track">
          {axis.weeks.map((w) => (
            <span
              key={w.day}
              //* Telefonon csak a hónap eleje kap feliratot: a keskeny
              //* tengelyen a „nov. 2" és a „9" különben „nov. 29"-nek olvasódna.
              className={cn("cr-week-label", !w.month && "cr-week-minor")}
              style={{ left: `${pos(w.day) * 100}%` }}
            >
              {w.month ? `${w.month} ${w.label}` : w.label}
            </span>
          ))}
          <span className="cr-now-label">ma</span>
        </div>
      </div>

      <ol className={cn(listGroup, "cr-list")}>
        {lanes.map((lane, index) => (
          <RiverRow
            key={lane.contest.slug}
            lane={lane}
            index={index}
            axis={axis}
            pos={pos}
            now={now}
            eligible={eligible(lane.contest)}
          />
        ))}
      </ol>
    </div>
  );
}

function RiverRow({
  lane,
  index,
  axis,
  pos,
  now,
  eligible,
}: {
  lane: Lane;
  index: number;
  axis: RiverAxis;
  pos: (value: number) => number;
  now: Date;
  eligible: boolean;
}) {
  const c = lane.contest;
  const deadline = deadlineOf(c);
  const start = pos(lane.now);
  const flag = pos(lane.deadline);
  const event = pos(lane.event);
  const beyond = riverPosition(axis, lane.event) > 1;
  const deadlineBeyond = riverPosition(axis, lane.deadline) > 1;
  const status = lane.open ? deadlineLabel(deadline, now) : "Nevezés lezárva";
  return (
    <li style={accentStyle(c.slug)}>
      <Link
        href={`/versenyek/${c.slug}`}
        prefetch={false}
        className={cn("cr-row cr-lane", !eligible && "cr-lane-dim")}
        style={{ "--i": index } as CSSProperties}
      >
        <span className="cr-name-col min-w-0">
          <span className="flex items-start gap-2">
            <span
              className="acc-dot mt-[0.4rem] size-2 shrink-0 rounded-full"
              aria-hidden
            />
            <span className="min-w-0 text-pretty text-[15px] font-semibold leading-snug text-foreground">
              {c.name}
            </span>
          </span>
          <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 pl-4 text-xs text-muted-strong">
            <span>
              {CATEGORY_LABELS[c.category]} · {audienceLabel(c)}
            </span>
            <span className="inline-flex items-center gap-1">
              <MapPin className="size-3" aria-hidden />
              {where(c)}
            </span>
            <span className="inline-flex items-center gap-1 tabular-nums">
              <Users className="size-3" aria-hidden />
              {c.entryCount}
              {c.capacity ? ` / ${c.capacity}` : ""}
              <span className="sr-only"> nevező</span>
            </span>
            {!eligible && <span>nem a te évfolyamodnak</span>}
          </span>
          {/*//* A rajz szöveges párja — a szem a vonalakból olvassa ki. */}
          <span className="sr-only">
            {lane.open
              ? `Nevezési határidő: ${FULL_WHEN.format(deadline)}, ${status}.`
              : "A nevezés lezárult."}{" "}
            A verseny: {FULL_WHEN.format(c.startsAt)}.
          </span>
        </span>

        <span className="cr-track" aria-hidden>
          {lane.open && (
            <span
              className={cn("cr-fuse", lane.soon && "cr-fuse-soon")}
              style={{
                left: `${start * 100}%`,
                width: `${Math.max(flag - start, 0.004) * 100}%`,
              }}
            />
          )}
          <span
            className="cr-link"
            style={{
              left: `${(lane.open ? flag : start) * 100}%`,
              width: `${Math.max(event - (lane.open ? flag : start), 0) * 100}%`,
            }}
          />
          {lane.open && !deadlineBeyond && (
            <span
              className={cn("cr-flag", lane.soon && "cr-flag-soon")}
              style={{ left: `${flag * 100}%` }}
            />
          )}
          <span
            className={cn(
              "cr-status",
              lane.soon && "cr-status-soon",
              !lane.open && "cr-status-closed",
            )}
            style={{ left: `${start * 100}%` }}
          >
            {status}
          </span>
          {lane.open && !deadlineBeyond && (
            <span className="cr-date" style={{ left: `${flag * 100}%` }}>
              {SHORT_DATE.format(deadline)}
            </span>
          )}
          {beyond ? (
            <span className="cr-event-beyond">
              {SHORT_DATE.format(c.startsAt)}
              <ArrowRight className="size-3" />
            </span>
          ) : (
            <>
              <span
                className="cr-event acc-dot"
                style={{ left: `${event * 100}%` }}
              />
              <span
                className="cr-event-label"
                data-flip={event > 0.82 ? "" : undefined}
                style={{ left: `${event * 100}%` }}
              >
                {SHORT_DATE.format(c.startsAt)}
              </span>
            </>
          )}
        </span>
      </Link>
    </li>
  );
}
