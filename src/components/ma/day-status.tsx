"use client";

import { AlertTriangle, Briefcase, Check, CloudOff } from "lucide-react";
import { minLabel } from "@/components/timetable/shared";
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

//! DUÁLIS NAP. Nem egy jelvény a fejlécben: ha a munkahelyen vagy, akkor a nap
//! órarendje NEM a te napod — ez a lap legfontosabb mondata azon a napon.
export function DualDay({
  isToday,
  className,
}: {
  isToday: boolean;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-2xl border border-hero-foreground/15 bg-hero-foreground/[0.06] p-5 sm:p-6",
        className,
      )}
    >
      <p className="flex items-center gap-2 text-sm font-medium text-hero-foreground/70">
        <Briefcase className="size-4" aria-hidden />
        Duális képzés
      </p>
      <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
        {isToday ? "Ma a munkahelyen vagy" : "A munkahelyen vagy"}
      </h2>
      <p className="mt-2 max-w-md text-sm text-hero-foreground/70">
        {isToday
          ? "A mai órarend nem rád vonatkozik — az az osztály iskolai napja."
          : "Ezt a napot a munkahelyen töltöd — az órarend nem rád vonatkozik."}
      </p>
    </section>
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
