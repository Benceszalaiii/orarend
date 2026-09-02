"use client";

import {
  AlertTriangle,
  BellRing,
  Briefcase,
  CalendarDays,
  Check,
  CloudOff,
} from "lucide-react";
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
//* A NAP KÖRÜLMÉNYEI — a tanév rendjéből
//* ---------------------------------------------------------------------------
//! EZ NEM AZ ÓRAREND, HANEM AZ, AMI KÖRÜLVESZI. A kártyák nem mondják meg, hogy
//! aznap rövidítettek-e az órák, hogy van-e egyáltalán tanítás, és hogy
//! történik-e valami az iskolában — ezt a tanév rendje tudja
//! (`school-calendar.ts`).
//!
//! ÉS ITT NINCS HELYFENNTARTÁS, a `ChangeRow`-val ellentétben. Ott a hiány
//! kétértelmű lenne („nincs változás" vagy „nem néztük meg"?), mert a sor egy
//! ELLENŐRZÉS eredményét mutatja. Ez a sor viszont nem ellenőriz semmit: ha a
//! naphoz nincs bejegyzés, akkor nincs — ezt nem kell kimondani.
export function DayPlanRow({
  day,
  isToday,
  className,
}: {
  day: DayModel;
  isToday: boolean;
  className?: string;
}) {
  const off = day.teaching === false;
  if (!off && !day.bells && day.notes.length === 0) return null;

  const title = off
    ? isToday
      ? "Ma nincs tanítás"
      : "Ezen a napon nincs tanítás"
    : day.bells
      ? `Eltérő csengetési rend — ${day.bells.name}`
      : "A tanév rendjéből";

  return (
    <div
      className={cn(
        "rounded-xl border px-4 py-3 text-sm",
        day.bells
          ? "border-brand/40 bg-brand/10 text-foreground"
          : "border-border bg-muted/40 text-foreground",
        className,
      )}
    >
      <p className="flex items-center gap-2 font-medium">
        {day.bells ? (
          <BellRing className="size-4 shrink-0 text-brand" aria-hidden />
        ) : (
          <CalendarDays
            className="size-4 shrink-0 text-muted-foreground"
            aria-hidden
          />
        )}
        {title}
      </p>
      {/*//* A bejegyzések a forrás szövegével, sorról sorra — se rövidítve, se
          //* átfogalmazva: az iskola mondatai. */}
      {day.notes.length > 0 && (
        <ul className="mt-1.5 space-y-0.5 text-pretty text-muted-strong">
          {day.notes.map((note, i) => (
            <li key={`${i}-${note}`}>{note}</li>
          ))}
        </ul>
      )}
    </div>
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
//!
//! HOL TARTOK A NAPBAN. A vonalzó megmutatja a HELYET, de nem mondja meg a
//! MENNYIT: egy szalag közepén álló vonalból senki nem olvas le három óra húsz
//! percet. Az iskolai napon ezt a `NowBlock` mondja ki („… van hátra"), a
//! duális napon viszont nincs futó óra, amire az kiülhetne — a szalag alatti
//! sor mondja el helyette, ugyanazzal a két adattal: mennyi telt el, mennyi
//! van hátra — a címke alatt, A BLOKKON BELÜL: a munkanapról szóló adat nem
//! kerülhet a szalag alá, a nap végpontjai közé, mert ott az órarend
//! időtengelye beszél. Csak MA és csak a munkaidőn belül: máskor nincs mit
//! visszaszámolni.

//* Rövid alak, mert hármasban áll a két végponttal egy sorban: a `durationLabel`
//* teljes szavai („3 óra 20 perc") két példányban kitolnák a telefon sorát.
function gapLabel(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60);
  return h === 0 ? `${m} p` : `${h} ó ${m % 60} p`;
}

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
  const elapsed = nowVisible ? nowMin - DUAL_DAY_START_MIN : 0;
  const fraction = elapsed / span;

  return (
    <div className={cn("select-none", className)}>
      <div className="relative flex h-12 w-full items-center justify-center overflow-hidden rounded-lg border border-primary/35 bg-primary/12 px-3">
        {nowVisible && (
          //* AZ ELTELT RÉSZ, HALKAN. A vonalzó a pont, ez a mennyiség — épp
          //* csak annyival sötétebb a sáv alapjánál, hogy a szem lássa a
          //* határt, de ne váljon második, hangos felületté.
          <span
            className="absolute inset-y-0 left-0 bg-primary/15"
            style={{ width: `${fraction * 100}%` }}
            aria-hidden
          />
        )}
        <span className="relative flex min-w-0 flex-col items-center leading-tight">
          <span className="flex min-w-0 items-center gap-2 text-sm font-semibold text-primary">
            <Briefcase className="size-4 shrink-0" aria-hidden />
            <span className="truncate">Duális képzés</span>
          </span>
          {nowVisible && (
            //* A KÉT SZÁM A BLOKKON BELÜL, a címke alatt: a munkanap egyetlen
            //* eleme, tehát az róla szóló adat is benne áll, nem mellette.
            <span className="mt-0.5 max-w-full truncate text-[11px] font-bold tabular-nums text-primary/85">
              {gapLabel(elapsed)} telt el ·{" "}
              {gapLabel(DUAL_DAY_END_MIN - nowMin)} van hátra
            </span>
          )}
        </span>
        {nowVisible && (
          //* A nap egyetlen márkaszínű eleme: hol tartunk most.
          <span
            className="absolute inset-y-[-3px] z-10 w-0.5 -translate-x-1/2 rounded-full bg-brand"
            style={{ left: `${fraction * 100}%` }}
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
