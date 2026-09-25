"use client";

import { DoorOpen } from "lucide-react";
import Link from "next/link";
import { EmptyPanel, listGroup } from "@/components/ma/week-panels";
import type { FitWeek } from "@/lib/club-fit";
import { busyBands, type SlotFit, slotFit } from "@/lib/club-fit";
import {
  type ClubSessionStatus,
  SESSION_STATUS_SHORT,
  SESSION_STATUS_TEXT,
} from "@/lib/club-schedule";
import { type ClubSlotSource, formatMinute, WEEKDAY_NAMES } from "@/lib/clubs";
import { type FitWeeks, useClubFitWeeks } from "@/lib/use-club-fit";
import { cn } from "@/lib/utils";
import {
  SlotVerdict,
  SOURCE_LABEL,
  SourceMark,
  useStudentClass,
} from "../_components/fit-marks";

//* ---------------------------------------------------------------------------
//* IDŐPONTOK — A SZAKKÖR LAPJÁNAK KÖZEPE
//* ---------------------------------------------------------------------------
//! EGY SOR, HÁROM VÁLASZ. Minden rendszeres időponthoz: honnan tudjuk (forrás),
//! megvan-e ezen a héten (az iskola órarendje szerint), és belefér-e a te
//! napodba. Az utolsót nem kimondjuk, hanem MEGRAJZOLJUK: a napod órái halvány
//! sávként, alattuk a szakkör — ha a kettő fedi egymást, látszik, mivel.
//!
//! A KÉSZÜLÉKEN SZÁMOLJUK (`club-fit.ts`), ugyanazzal a függvénnyel, mint a
//! lista. A szerver nem tudja, melyik csoportba jársz — és nem is kell tudnia.

export type TimesSlot = {
  id: string;
  weekday: number;
  startMinute: number;
  endMinute: number;
  room: string | null;
  source: ClubSlotSource;
};

export type TimesSession = {
  slotId: string;
  dateKey: string;
  startMin: number;
  endMin: number;
  room: string;
  status: ClubSessionStatus;
};

const STATUS_TONE: Record<ClubSessionStatus, string> = {
  confirmed: "border-border text-muted-strong",
  declared: "border-dashed border-border text-muted-strong",
  missing: "border-destructive/40 text-destructive",
  "no-school": "border-destructive/40 text-destructive",
  unknown: "border-dashed border-border text-muted-foreground",
};

const DATE_FMT = new Intl.DateTimeFormat("hu-HU", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

export function ClubTimes({
  slots,
  sessions,
  weekLabel,
  accountClass,
  teacher,
}: {
  slots: TimesSlot[];
  sessions: TimesSession[];
  //* „ezen a héten" / „jövő héten" — hétvégén a következő hét számít.
  weekLabel: string;
  accountClass: string | null;
  teacher: boolean;
}) {
  const [className] = useStudentClass(accountClass);
  const studentClass = teacher ? null : (className ?? null);
  const fitWeeks = useClubFitWeeks(studentClass);

  return (
    <section aria-labelledby="times-heading">
      <div className="mb-3 flex items-baseline justify-between gap-4">
        <h2
          id="times-heading"
          className="text-base font-semibold text-foreground"
        >
          Időpontok
        </h2>
        {studentClass && (
          <span className="shrink-0 text-sm text-muted-foreground">
            a {studentClass} hetéhez mérve
          </span>
        )}
      </div>

      {slots.length === 0 ? (
        <EmptyPanel>
          Az időpont egyeztetés alatt van. Amint a vezető tanár megadja, itt
          látod — és azt is, belefér-e a hetedbe.
        </EmptyPanel>
      ) : (
        <ul className={listGroup}>
          {[...slots]
            .sort(
              (a, b) => a.weekday - b.weekday || a.startMinute - b.startMinute,
            )
            .map((slot) => (
              <li key={slot.id} className="px-4 py-3.5">
                <SlotRow
                  slot={slot}
                  session={sessions.find((s) => s.slotId === slot.id) ?? null}
                  weekLabel={weekLabel}
                  fitWeeks={fitWeeks}
                />
              </li>
            ))}
        </ul>
      )}

      {!teacher && className === null && slots.length > 0 && (
        <p className="mt-3 text-pretty text-xs text-muted-strong">
          <Link
            href="/szakkorok"
            className="font-medium text-foreground underline underline-offset-4"
          >
            Válaszd ki az osztályodat
          </Link>
          , és itt is látod, belefér-e a hetedbe.
        </p>
      )}
    </section>
  );
}

function SlotRow({
  slot,
  session,
  weekLabel,
  fitWeeks,
}: {
  slot: TimesSlot;
  session: TimesSession | null;
  weekLabel: string;
  fitWeeks: FitWeeks;
}) {
  const ready = fitWeeks.state === "ready";
  const fit = ready ? slotFit(slot, fitWeeks.weeks, fitWeeks.dual) : null;
  //* Ha a Jedlikinfo kártyája más időt mond, az iskoláé számít — és kimondjuk.
  const moved =
    session !== null &&
    (session.startMin !== slot.startMinute ||
      session.endMin !== slot.endMinute);

  return (
    <>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-[15px] font-semibold text-foreground">
          {WEEKDAY_NAMES[slot.weekday]}
        </span>
        <span className="text-[15px] tabular-nums text-foreground">
          {formatMinute(slot.startMinute)}–{formatMinute(slot.endMinute)}
        </span>
        {slot.room && (
          <span className="inline-flex items-center gap-1 text-sm text-muted-strong">
            <DoorOpen className="size-3.5 self-center" aria-hidden />
            <span className="sr-only">terem </span>
            {slot.room}
          </span>
        )}
      </div>
      <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-strong">
        <SourceMark source={slot.source} />
        {SOURCE_LABEL[slot.source].replace(/^./, (c) => c.toUpperCase())}
      </p>

      <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-strong">
        {session ? (
          <>
            <span className="first-letter:uppercase">
              {weekLabel},{" "}
              {DATE_FMT.format(new Date(`${session.dateKey}T00:00:00Z`))}
            </span>
            <span
              title={SESSION_STATUS_TEXT[session.status]}
              className={cn(
                "rounded-full border px-2 py-0.5",
                STATUS_TONE[session.status],
              )}
            >
              {SESSION_STATUS_SHORT[session.status]}
            </span>
            {moved && (
              <span className="tabular-nums text-foreground">
                az órarend szerint {formatMinute(session.startMin)}–
                {formatMinute(session.endMin)}
              </span>
            )}
          </>
        ) : (
          <span className="first-letter:uppercase">
            {weekLabel} nincs alkalma.
          </span>
        )}
      </p>
      {session && session.status !== "confirmed" && (
        <p className="mt-1 text-pretty text-xs text-muted-strong">
          {SESSION_STATUS_TEXT[session.status]}
        </p>
      )}

      {fitWeeks.state === "loading" && (
        <div
          className="mt-3 h-9 animate-pulse rounded-md bg-muted/40 motion-reduce:animate-none"
          aria-hidden
        />
      )}
      {fitWeeks.state === "error" && (
        <p className="mt-3 text-xs text-muted-strong">
          Most nem tudjuk, belefér-e: a Jedlikinfo nem adta ki az órarendedet.
        </p>
      )}
      {fit && ready && (
        <DayRuler slot={slot} fit={fit} weeks={fitWeeks.weeks} />
      )}
    </>
  );
}

//! A NAP VONALZÓJA. Fent a napod órái (minden ismert hétből összevonva,
//! semleges tónusban), lent a szakkör a saját színével. Ugyanaz a nyelv, mint a
//! `/ma` napi szalagja — csak itt két sáv áll egymás alatt, hogy az átfedés
//! egy pillantásból látszódjon.
function DayRuler({
  slot,
  fit,
  weeks,
}: {
  slot: TimesSlot;
  fit: SlotFit;
  weeks: readonly FitWeek[];
}) {
  const bands = busyBands(weeks, slot.weekday);
  const lo =
    Math.floor(
      Math.min(slot.startMinute, ...bands.map((b) => b.startMin)) / 60,
    ) * 60;
  const hi =
    Math.ceil(Math.max(slot.endMinute, ...bands.map((b) => b.endMin)) / 60) *
    60;
  const pct = (m: number) => ((m - lo) / (hi - lo)) * 100;
  const place = (a: number, b: number) => ({
    left: `${pct(a)}%`,
    width: `${pct(b) - pct(a)}%`,
  });
  const before = bands
    .filter((b) => b.endMin <= slot.startMinute)
    .at(-1)?.endMin;
  const dual = fit.verdict === "clash" && fit.dual;

  return (
    <div className="mt-3">
      <div className="relative h-9 rounded-md bg-muted/40" aria-hidden>
        {!dual &&
          bands.map((b) => (
            <span
              key={b.startMin}
              className="absolute top-1 h-3 rounded-[3px] bg-foreground/20"
              style={place(b.startMin, b.endMin)}
            />
          ))}
        {/*//* Az ütköző óra kiemelve: pontosan az, amit a sor alatta megnevez. */}
        {fit.verdict === "clash" && fit.lesson && (
          <span
            className="absolute top-1 h-3 rounded-[3px] bg-foreground/60"
            style={place(fit.lesson.startMin, fit.lesson.endMin)}
          />
        )}
        {dual && (
          <span className="absolute inset-x-1 top-1 h-3 rounded-[3px] border border-dashed border-foreground/30" />
        )}
        {/*//! A SZAKKÖR SÁVJA AZ ÍTÉLET SZÍNÉT VISELI, nem a szakkörét: kék, ha
            //! belefér; körvonal, ha ütközik; szaggatott, ha nem tudjuk. A
            //! szakkör színe a cím melletti pöttyé — felületet nem fest. */}
        <span
          className={cn(
            "absolute bottom-1 h-3 rounded-[3px]",
            fit.verdict === "fits"
              ? "bg-primary"
              : fit.verdict === "clash"
                ? "border border-foreground/60"
                : "border border-dashed border-foreground/40",
          )}
          style={place(slot.startMinute, slot.endMinute)}
        />
      </div>
      <div className="mt-1 flex justify-between text-[11px] font-medium tabular-nums text-muted-foreground">
        <span>{formatMinute(lo)}</span>
        <span>{formatMinute(hi)}</span>
      </div>
      <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
        <SlotVerdict fit={fit} />
        <span className="text-xs text-muted-strong">
          {fit.verdict === "fits"
            ? before !== undefined
              ? `előtte ${formatMinute(before)}-ig órád van`
              : "aznap előtte nincs órád"
            : fit.verdict === "clash" && fit.lesson
              ? `${formatMinute(fit.lesson.startMin)}–${formatMinute(fit.lesson.endMin)}`
              : dual
                ? "akkor ez az alkalom kimarad"
                : "erre a napra nincs ismert órarended"}
        </span>
      </p>
    </div>
  );
}
