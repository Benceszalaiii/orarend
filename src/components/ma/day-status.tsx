"use client";

import { AlertTriangle, Briefcase, Check, CloudOff } from "lucide-react";
import { minLabel } from "@/components/timetable/shared";
import { DUAL_DAY_END_MIN, DUAL_DAY_START_MIN } from "@/lib/dualis";
import { TIMETABLE_SOURCE } from "@/lib/timetable";
import { ageLabel } from "@/lib/timetable-cache";
import { cn } from "@/lib/utils";
import type { DayModel } from "./day";

//* ---------------------------------------------------------------------------
//* A NAPI ELLENŐRZÉS SORA
//* ---------------------------------------------------------------------------
//! EGY SOR, KÉT HANGNEM. A Jedlikinfo `movedCard` jelölése az EGYETLEN elsődleges
//! forrásból jövő jelzés az áthelyezett órákról, és ritkán van bekapcsolva —
//! vagyis ez a sor a napok túlnyomó részén „nincs semmi" lesz.
//!
//! Ezért NEM üresen álló dobozként épült meg. Ha egy figyelmeztetés csak akkor
//! jelenik meg, amikor baj van, akkor a hiánya nem mond semmit: nem lehet tudni,
//! hogy nincs változás, vagy csak nem néztük meg. A sor ezért MINDIG ott van,
//! azonos helyen, és a hangneme vált — nem a léte.
//*
//* A megfogalmazás szándékosan óvatos: „nincs jelzett változás", nem „semmi nem
//* változott". Amit a suli nem jelöl meg, arról mi sem tudunk.

export function ChangeRow({
  day,
  className,
}: {
  day: DayModel;
  className?: string;
}) {
  if (day.moved.length === 0) {
    return (
      <p
        className={cn(
          "flex items-center gap-2 text-sm text-muted-strong",
          className,
        )}
        title={`A ${TIMETABLE_SOURCE} nem jelölt meg egyetlen mai órát sem áthelyezettként.`}
      >
        <Check className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        Nincs jelzett változás
      </p>
    );
  }

  const first = day.moved[0];
  const rest = day.moved.length - 1;
  return (
    <p
      className={cn(
        "flex items-center gap-2 rounded-xl border border-brand/40 bg-brand/10 px-4 py-3 text-sm text-foreground",
        className,
      )}
      //! A figyelmeztetés megjelenése VALÓDI hír: a képernyőolvasó is kapja meg,
      //! de udvariasan — nem szakítja félbe, amit épp olvas.
      aria-live="polite"
    >
      <AlertTriangle className="size-4 shrink-0 text-brand" aria-hidden />
      <span className="min-w-0 flex-1 text-pretty">
        <span className="font-medium">Áthelyezve:</span>{" "}
        {first.lesson.subject || first.lesson.subjectShort}
        {first.rooms[0] ? ` · ${first.rooms[0]}` : ""} ·{" "}
        <span className="tabular-nums">{minLabel(first.startMin)}</span>
        {rest > 0 && ` · és még ${rest}`}
      </span>
    </p>
  );
}

//* ---------------------------------------------------------------------------
//* A DUÁLIS NAP — egy téglalap, nem egy nap órarendje
//* ---------------------------------------------------------------------------
//! AMI EZEN A NAPON IGAZ: 8-TÓL 4-IG A MUNKAHELYEN VAGY. Ennyi. Az osztály
//! órarendje nem a te napod, tehát nem is az áll a nap helyén — de a helyére
//! sem kerülhet egy fél képernyős kártya, ami nyolc órányi „Duális képzés"-t
//! mond ugyanazzal a hanggal, ahogy a rács egy 45 perces matekot. A munkanap
//! egyetlen tömb, egyetlen adattal: mikor kezdődik és mikor ér véget.
//!
//! A SZALAG NYELVÉN. Ugyanaz a forma, mint a nap szalagja (`DayRibbon`): sáv,
//! alatta a két végpont. Így a duális nap és az iskolai nap ugyanabban a
//! sorban, ugyanabban a magasságban áll — a kettő közti különbség a TARTALOM,
//! nem a lap szerkezete.
export function DualBlock({
  //* A „most" vonalzója csak MA igaz — más napra `null` jön.
  nowMin,
  className,
}: {
  nowMin: number | null;
  className?: string;
}) {
  const span = DUAL_DAY_END_MIN - DUAL_DAY_START_MIN;
  //* A munkanapon belül tartunk-e: csak akkor van mit jelölni.
  const nowVisible =
    nowMin !== null &&
    nowMin >= DUAL_DAY_START_MIN &&
    nowMin <= DUAL_DAY_END_MIN;

  return (
    <div className={cn("select-none", className)}>
      <div className="relative flex h-12 w-full items-center justify-center overflow-hidden rounded-lg border border-primary/35 bg-primary/12 px-3">
        <span className="flex min-w-0 items-center gap-2 text-sm font-semibold text-primary">
          <Briefcase className="size-4 shrink-0" aria-hidden />
          <span className="truncate">Duális képzés</span>
        </span>
        {nowVisible && (
          //* A nap egyetlen márkaszínű eleme: hol tartunk most.
          <span
            className="absolute inset-y-[-3px] z-10 w-0.5 -translate-x-1/2 rounded-full bg-brand"
            style={{ left: `${((nowMin - DUAL_DAY_START_MIN) / span) * 100}%` }}
            aria-hidden
          />
        )}
      </div>
      <div className="mt-1 flex justify-between text-[11px] font-medium tabular-nums text-muted-foreground">
        <time dateTime={minLabel(DUAL_DAY_START_MIN)}>
          {minLabel(DUAL_DAY_START_MIN)}
        </time>
        <time dateTime={minLabel(DUAL_DAY_END_MIN)}>
          {minLabel(DUAL_DAY_END_MIN)}
        </time>
      </div>
    </div>
  );
}

//! MENNYIRE FRISS AZ ADAT. Csak akkor jelenik meg, ha van mit bevallani: a most
//! lekért órarend nem érdemel külön sort, egy tegnapi viszont igen.
export function StaleNote({
  fetchedAt,
  offline,
  className,
}: {
  fetchedAt: number;
  offline: boolean;
  className?: string;
}) {
  return (
    <p
      className={cn(
        "flex items-center gap-1.5 text-xs text-muted-foreground",
        className,
      )}
    >
      <CloudOff className="size-3.5 shrink-0" aria-hidden />
      {offline ? "Offline · " : ""}
      mentett órarend, {ageLabel(fetchedAt)} frissítve
    </p>
  );
}
