"use client";

import { rangeLabel } from "@/components/timetable/shared";
import type { HallDutyDayModel } from "@/lib/hall-duty";
import { cn } from "@/lib/utils";
import { breakPhase, PostList } from "./duty-now";

//* ---------------------------------------------------------------------------
//* A NAP ÜGYELETEI — A HALADÁS MAGA A LISTA
//* ---------------------------------------------------------------------------
//! A LISTA NEM TÁBLÁZAT, ÉS EZ MÉRLEGELÉS UTÁN VAN ÍGY. A beosztás természetes
//! alakja egy rács lenne: sorok a szünetek, oszlopok az öt terület. Telefonon
//! viszont öt oszlop tanárnevekkel vagy csonkul, vagy oldalra görget — és egy
//! ügyeleti beosztást a folyosón néznek meg, nem asztali gépen. Ezért szünetenként
//! EGY kártya áll, benne az öt poszt egymás alatt; a területek sorrendje minden
//! kártyán ugyanaz (lásd `buildHallDutyDay`), tehát a függőleges olvasat — „hol
//! van a 2. emelet egész nap” — a kártyák között is megmarad.
//!
//! A MÚLT HALVÁNYUL, A JELEN KERETET KAP. Ez a lap „progresszív” fele: a nap
//! nem egy statikus tábla, hanem egy menet, amin végighalad a délelőtt. Ami
//! elmúlt, az nem tűnik el (visszanézni is kell), csak hátrébb lép.

export function DutyDayList({
  day,
  nowMin,
  className,
}: {
  day: HallDutyDayModel;
  /** A mai perc, ha a mutatott nap MA van — különben `null`. */
  nowMin: number | null;
  className?: string;
}) {
  if (day.breaks.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border px-4 py-5 text-sm text-pretty text-muted-strong">
        Erre a napra nem érkezett ügyeleti beosztás.
      </p>
    );
  }

  return (
    <ol className={cn("flex flex-col gap-2", className)}>
      {day.breaks.map((slot) => {
        const phase = breakPhase(slot, nowMin);
        return (
          <li
            key={slot.name}
            className={cn(
              "relative overflow-hidden rounded-xl border px-4 py-3 transition-colors motion-reduce:transition-none",
              phase === "now"
                ? "border-brand/40 bg-brand/[0.07]"
                : "border-border bg-foreground/[0.02]",
              //! A MÚLT NEM SZÜRKE, HANEM HALVÁNY. Egy külön „múlt” szín
              //! harmadik jelentést vinne a lapra; az áttetszőség ugyanazt
              //! mondja el eggyel kevesebb tokennel.
              phase === "past" && "opacity-55",
            )}
          >
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="flex items-baseline gap-2 text-sm font-semibold text-foreground">
                {slot.startMin !== null && slot.endMin !== null ? (
                  <span className="tabular-nums">
                    {rangeLabel(slot.startMin, slot.endMin)}
                  </span>
                ) : (
                  <span className="text-muted-strong">{slot.name}</span>
                )}
                {slot.startMin !== null && (
                  <span className="text-xs font-medium text-muted-foreground">
                    {slot.name}
                  </span>
                )}
              </h3>
              {phase === "now" && (
                //* Piros csak élő szerepben.
                <span className="shrink-0 rounded-full bg-brand px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand-foreground">
                  Most
                </span>
              )}
            </div>

            <PostList posts={slot.posts} className="mt-2" compact />
          </li>
        );
      })}
    </ol>
  );
}
