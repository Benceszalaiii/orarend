"use client";

import { AlertTriangle, Coffee } from "lucide-react";
import {
  durationLabel,
  minLabel,
  rangeLabel,
} from "@/components/timetable/shared";
import { accentStyle } from "@/lib/accent";
import { cn } from "@/lib/utils";
import type { DayModel, DaySegment } from "./day";

//* ---------------------------------------------------------------------------
//* A MAI NAP — alakja és tételei
//* ---------------------------------------------------------------------------
//! KÉT RÉTEG, KÉT KÉRDÉS. A szalag a nap ALAKJÁRA felel („mikor végzek", „hol a
//! lyukasórám") — arányos, egyetlen pillantás. A lista a TÉTELEKRE („mi az,
//! hol van") — olvasható sorok, a szakkör-oldal sor-nyelvén.
//!
//! A SZALAG SEMLEGES. A tantárgy színe pöttyként és feliratként szólal meg a
//! listában; ha a szalag szakaszait is kifestené, a lap a heti rács
//! nagyítása lenne. A szalagon egyetlen szín van: a „most" piros vonalzója.

function pct(min: number, from: number, to: number): number {
  const span = to - from;
  if (span <= 0) return 0;
  return ((min - from) / span) * 100;
}

export function DayRibbon({
  day,
  nowMin,
  selectedKey,
  className,
}: {
  day: DayModel;
  nowMin: number | null;
  selectedKey: string | null;
  className?: string;
}) {
  const { firstMin, lastMin } = day;
  if (day.lessonCount === 0 || lastMin <= firstMin) return null;
  const nowVisible = nowMin !== null && nowMin >= firstMin && nowMin <= lastMin;

  return (
    <div className={cn("select-none", className)}>
      <div className="relative h-7 w-full rounded-md bg-muted/40" aria-hidden>
        {day.segments.map((seg) => {
          const style = {
            left: `${pct(seg.startMin, firstMin, lastMin)}%`,
            width: `${pct(seg.endMin, firstMin, lastMin) - pct(seg.startMin, firstMin, lastMin)}%`,
          };
          if (seg.kind === "gap") return null;
          const selected = seg.key === selectedKey;
          //* Ütköző órák (feloldatlan csoportbontás) sávokra osztoznak, hogy a
          //* szalag ne egyetlen tömbnek mutassa a döntést, ami még vár.
          const laneStyle =
            seg.lanes > 1
              ? {
                  top: `${(seg.lane / seg.lanes) * 100}%`,
                  height: `calc(${100 / seg.lanes}% - 1px)`,
                }
              : { top: 0, bottom: 0 };
          return (
            <span
              key={seg.key}
              className={cn(
                "absolute rounded-[3px] transition-colors",
                selected ? "bg-foreground/45" : "bg-foreground/18",
              )}
              style={{ ...style, ...laneStyle }}
            />
          );
        })}

        {nowVisible && (
          //* A nap egyetlen színes eleme: hol tartunk most.
          <span
            className="absolute inset-y-[-3px] z-10 w-0.5 -translate-x-1/2 rounded-full bg-brand"
            style={{ left: `${pct(nowMin, firstMin, lastMin)}%` }}
          />
        )}
      </div>
      <div className="mt-1 flex justify-between text-[11px] font-medium tabular-nums text-muted-foreground">
        <time dateTime={minLabel(firstMin)}>{minLabel(firstMin)}</time>
        <time dateTime={minLabel(lastMin)}>{minLabel(lastMin)}</time>
      </div>
    </div>
  );
}

export function DayList({
  day,
  nowMin,
  selectedKey,
  onSelect,
  className,
}: {
  day: DayModel;
  nowMin: number | null;
  selectedKey: string | null;
  onSelect: (key: string | null) => void;
  className?: string;
}) {
  if (day.segments.length === 0) return null;

  return (
    <ul
      className={cn(
        "divide-y divide-border overflow-hidden rounded-xl border border-border bg-card",
        className,
      )}
    >
      {day.segments.map((seg) => (
        <Row
          key={seg.key}
          seg={seg}
          nowMin={nowMin}
          selected={seg.kind === "lesson" && seg.key === selectedKey}
          onSelect={onSelect}
        />
      ))}
    </ul>
  );
}

function Row({
  seg,
  nowMin,
  selected,
  onSelect,
}: {
  seg: DaySegment;
  nowMin: number | null;
  selected: boolean;
  onSelect: (key: string | null) => void;
}) {
  if (seg.kind === "gap") {
    return (
      <li className="flex items-center gap-3 px-4 py-2.5 text-sm text-muted-foreground">
        <Coffee className="size-3.5 shrink-0" aria-hidden />
        <span className="min-w-0 flex-1">
          Lyukasóra · {durationLabel(seg.endMin - seg.startMin)}
        </span>
        <span className="shrink-0 tabular-nums">
          {rangeLabel(seg.startMin, seg.endMin)}
        </span>
      </li>
    );
  }

  const lesson = seg.run.lesson;
  const short = lesson.subjectShort || lesson.subject;
  const title = lesson.subject || short;
  const room = seg.run.rooms.join(" · ");
  //* A már lezárt órák halkulnak — a nap „elfogyása" magától olvasható.
  const past = nowMin !== null && nowMin >= seg.endMin;
  const running =
    nowMin !== null && nowMin >= seg.startMin && nowMin < seg.endMin;

  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(selected ? null : seg.key)}
        aria-pressed={selected}
        className={cn(
          "flex w-full items-center gap-3 px-4 py-3 text-left transition-colors",
          "hover:bg-muted/40 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none",
          selected && "bg-muted/60",
          past && "opacity-55",
        )}
      >
        {/*//* A tantárgy színe: pötty, nem felület. */}
        <span
          className="size-2 shrink-0 rounded-full acc-dot"
          style={accentStyle(short)}
          aria-hidden
        />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="min-w-0 truncate font-medium text-foreground">
              {title}
            </span>
            {running && (
              //* Piros csak élő szerepben.
              <span className="shrink-0 rounded-full bg-brand px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand-foreground">
                Most
              </span>
            )}
            {lesson.moved && (
              <span className="flex shrink-0 items-center gap-1 text-[11px] font-medium text-brand">
                <AlertTriangle className="size-3" aria-hidden />
                áthelyezve
              </span>
            )}
          </span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-strong">
            <span className="tabular-nums">
              {rangeLabel(seg.startMin, seg.endMin)}
            </span>
            {lesson.teacherShort && (
              <>
                <span aria-hidden>·</span>
                <span className="truncate">{lesson.teacherShort}</span>
              </>
            )}
          </span>
        </span>
        {room && (
          <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
            {room}
          </span>
        )}
      </button>
    </li>
  );
}
