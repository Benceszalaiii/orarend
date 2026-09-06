"use client";

import { Coffee } from "lucide-react";
import { durationLabel, rangeLabel } from "@/components/timetable/shared";
import { cn } from "@/lib/utils";
import type { TeacherWeek } from "./teacher-week";
import { hoursLabel } from "./week";
import { EmptyPanel, listGroup, rowBase, Section } from "./week-panels";

//* ---------------------------------------------------------------------------
//* A TANÁRI SÁV KÉT PANELJA
//* ---------------------------------------------------------------------------
//! UGYANAZ A NYELV, MÁS KÉRDÉSEK. A szekciócím, a listakeret, az üres állapot
//! és a sorok mértana a `week-panels.tsx`-ből jön — ezek a panelek ugyanabban
//! a hasábban állnak, mint „A hét" és az „Áthelyezve a héten", és nem
//! kezdhetnek másképp beszélni két sorral lejjebb.
//!
//! ÉS AMI ITT NINCS: AKCENTSZÍN. A tizenkét hue a TANTÁRGYAT azonosítja (lásd
//! `lib/accent.ts` és a `PRODUCT.md` második alapelve) — egy osztályra
//! ráhúzva azt állítaná, hogy a „13C" ugyanolyan fajta dolog, mint a
//! „Matematika", és a lap két helyen kezdene ugyanazzal a színnel két
//! különböző dolgot jelölni. Az osztály ezért betűvel áll, nem pöttyel.

//! OSZTÁLYAIM — A DIÁK „TANTÁRGYAK" PANELJÁNAK TANÁRI PÁRJA. A diáknak a heti
//! terhelés tantárgyanként oszlik; a tanárnak ez rendszerint EGY tantárgy és
//! sok osztály. Ugyanaz a kérdés („mire megy el a hetem"), másik tengely
//! mentén — és ez az a lista, amiből kiderül, hogy kedden három különböző
//! osztály jön egymás után.
export function ClassLoads({
  teacher,
  className,
}: {
  teacher: TeacherWeek;
  className?: string;
}) {
  const { classes } = teacher;
  const peak = Math.max(1, ...classes.map((c) => c.minutes));
  const totalMinutes = classes.reduce((sum, c) => sum + c.minutes, 0);

  return (
    <Section
      id="classes-heading"
      title="Osztályaim"
      aside={
        classes.length > 0
          ? `${classes.length} osztály · ${hoursLabel(totalMinutes)}`
          : undefined
      }
      className={className}
    >
      {classes.length === 0 ? (
        <EmptyPanel>
          Ezen a héten egyetlen osztályhoz sincs beírt órád.
        </EmptyPanel>
      ) : (
        <ul className={listGroup}>
          {classes.map((entry) => (
            <li
              key={entry.short}
              //! NEM GOMB, MERT NINCS HOVÁ VINNIE. „A hét" sorai napra
              //! ugranak — annak van célja. Egy osztályra koppintva viszont
              //! csak egy szűrés jönne, ami ezen a lapon nem létezik: a
              //! kattinthatóság ígéret, és üresen nem szabad megtenni.
              className={cn(
                rowBase,
                "relative overflow-hidden hover:bg-transparent",
              )}
            >
              {/*//! A TERHELÉS SÁVJA A SOR HÁTTERE, ugyanaz a semleges tónus,
                  //! mint „A hét" napsorainál — így a két panel egy mértéket
                  //! használ, és a szemnek nem kell átállnia köztük. */}
              <span
                className="pointer-events-none absolute inset-y-0 left-0 bg-foreground/6"
                style={{ width: `${(entry.minutes / peak) * 100}%` }}
                aria-hidden
              />
              {/*//* Az osztály jele a sor címe — betűvel, nem színnel. */}
              <span className="relative z-10 w-12 shrink-0 font-semibold text-foreground">
                {entry.short}
              </span>
              {/*//! MINDEN SOR UGYANAZT MONDJA, KÜLÖNBEN NEM LISTA. Először a
                  //! teljes név állt itt, ha eltért a jeltől — csakhogy a
                  //! forrás az osztályoknál rendszerint ugyanazt küldi
                  //! mindkét mezőben („09D" / „09D"), tehát a sorok TÖBBSÉGE
                  //! az óraszámot mutatta, egy-kettő meg egy nevet. Két
                  //! különböző mérték egy oszlopban: a szem nem tudja
                  //! összehasonlítani őket. A teljes név amúgy is ott van a
                  //! választóban; itt a TERHELÉS a kérdés. */}
              <span className="relative z-10 min-w-0 flex-1 truncate text-sm text-muted-strong">
                {entry.lessons} óra · {entry.days} nap
              </span>
              <span className="relative z-10 shrink-0 text-sm tabular-nums text-foreground">
                {hoursLabel(entry.minutes)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

//! LYUKASÓRÁK — AMI A DIÁK LAPJÁN NEM PANEL. A `day.ts` 25 perctől külön
//! szakaszként kezeli a hézagot, és a nap listáján ott is látszik. A HÉT
//! egészére összeszedve viszont csak a tanárnak van értelme: az ő napjában
//! valódi lyukak vannak, és „mikor érek rá ezen a héten" egy tanári órarend
//! leggyakoribb kérdése — a rácsból pedig csak öt oszlopot végigolvasva jön ki.
export function FreePeriods({
  teacher,
  onFocus,
  className,
}: {
  teacher: TeacherWeek;
  onFocus: (dateKey: string) => void;
  className?: string;
}) {
  const { free, freeMinutes } = teacher;

  return (
    <Section
      id="free-heading"
      title="Lyukasórák"
      aside={free.length > 0 ? hoursLabel(freeMinutes) : undefined}
      className={className}
    >
      {free.length === 0 ? (
        <EmptyPanel>
          Ezen a héten nincs lyukasórád — az óráid egymás után jönnek.
        </EmptyPanel>
      ) : (
        <ul className={listGroup}>
          {free.map((slot) => (
            <li key={`${slot.dateKey}-${slot.startMin}`}>
              <button
                type="button"
                onClick={() => onFocus(slot.dateKey)}
                className={rowBase}
              >
                <Coffee
                  className="size-4 shrink-0 text-muted-foreground"
                  aria-hidden
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-foreground">
                    {slot.dayName}
                  </span>
                  <span className="mt-0.5 block text-xs tabular-nums text-muted-strong">
                    {rangeLabel(slot.startMin, slot.endMin)}
                  </span>
                </span>
                <span className="shrink-0 text-sm tabular-nums text-foreground">
                  {durationLabel(slot.endMin - slot.startMin)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
