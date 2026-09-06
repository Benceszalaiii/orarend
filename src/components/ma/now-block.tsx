"use client";

import {
  ArrowRight,
  CalendarClock,
  CalendarDays,
  GraduationCap,
  MapPin,
  Undo2,
  Users,
} from "lucide-react";
import Link from "next/link";
import { DrainBar } from "@/components/timetable/drain-bar";
import {
  type AgendaItem,
  countdownLabel,
  type NowState,
  spanFraction,
} from "@/components/timetable/now";
import {
  addDaysKey,
  durationLabel,
  minLabel,
  rangeLabel,
  todayKey,
} from "@/components/timetable/shared";
import type { Clock } from "@/components/timetable/use-clock";
import { Button } from "@/components/ui/button";
import { accentStyle } from "@/lib/accent";
import { cn } from "@/lib/utils";
import { GAP_MIN_MIN } from "./day";

//* ---------------------------------------------------------------------------
//* A HERO BLOKK — az idő a főszereplő
//* ---------------------------------------------------------------------------
//! Ugyanaz a szótár, mint a jedlik-szakkor kezdőlapján: áttetsző blokk a hero
//! fénymezején, nagy `tabular-nums` óra, alatta ikonos adatsor. A tantárgy
//! színe NEM fest felületet — az a heti rács nyelve, és nagyban a napi nézetet
//! a rács nagyításává tenné. Itt a szín pötty és felirat.
//!
//! PIROS CSAK ÉLŐ SZEREPBEN. A „Most" jelvény, a haladás-sáv és a nap
//! vonalzója viseli — semmi más.

const block =
  "group relative block overflow-hidden rounded-2xl border border-hero-foreground/15 bg-hero-foreground/[0.06] p-5 sm:p-6";

export function NowBlock({
  state,
  clock,
  epoch,
  preview,
  onClearPreview,
  previewDismissable = true,
  variant = "class",
}: {
  state: NowState | null;
  clock: Clock | null;
  epoch: number;
  preview: AgendaItem | null;
  onClearPreview: () => void;
  previewDismissable?: boolean;
  //! A HERO EGYETLEN KÜLÖNBSÉGE A KÉT ALANY KÖZT. Nem külön komponens: a
  //! doboz, az idő mérete, a haladás-sáv, a visszaszámláló és minden állapot
  //! ugyanaz — csak az azonosító sor cserél helyet a tantárgyéval, mert a
  //! folyosón a tanár nem azt keresi, MIT tanít, hanem KINEK és HOL.
  variant?: "class" | "teacher";
}) {
  const teacher = variant === "teacher";
  if (preview) {
    return (
      <section className={block} aria-label="Kiválasztott óra">
        <p className="text-sm font-medium text-hero-foreground/70">
          Kiválasztott óra
        </p>
        <TimeRow item={preview} lead={null} />
        <Facts item={preview} teacher={teacher} />
        <p className="mt-2 text-sm text-hero-foreground/60">
          {durationLabel(preview.endMin - preview.startMin)} hosszú
        </p>
        {previewDismissable && (
          <Button
            variant="outline"
            size="sm"
            onClick={onClearPreview}
            className="mt-4 h-8 touch-target rounded-full border-hero-foreground/25 bg-transparent px-3 text-xs"
          >
            <Undo2 aria-hidden />
            Vissza a mostra
          </Button>
        )}
      </section>
    );
  }

  //! HIDRATÁLÁS ELŐTT NEM TALÁLUNK KI IDŐPONTOT. A blokk a szerveren teljes
  //! magassággal, de üresen renderel — így nincs elugró elrendezés.
  if (!state || !clock) {
    return <div className={cn(block, "h-44")} aria-hidden />;
  }

  if (state.phase === "empty") {
    return (
      <Quiet title="Ma nincs órád" detail="A héten sincs több — pihenj." />
    );
  }

  const primary = state.phase === "lesson" ? state.current : state.next;
  if (!primary) {
    return <Quiet title="Mára vége" detail="A héten nincs több órád." />;
  }

  const running = state.phase === "lesson";
  const span = "span" in state ? state.span : null;
  const remainingSec = span ? Math.max(0, span.toMin * 60 - clock.sec) : 0;
  const countdown = countdownLabel(remainingSec);
  const gapLike = span !== null && span.toMin - span.fromMin >= GAP_MIN_MIN;

  //* A „mára vége" ág másik NAPRA mutat — ott a nap neve a hasznos adat.
  const dayLabel =
    state.phase === "done"
      ? primary.dateKey === addDaysKey(todayKey(), 1)
        ? "Holnap"
        : primary.dayName
      : null;

  return (
    <section className={block} aria-label={running ? "Most" : "Következik"}>
      {/*//! EGY MONDAT A KÉPERNYŐOLVASÓNAK. A visszaszámláló nem élő régió —
          //! másodpercenként felolvasva használhatatlan lenne. */}
      <p className="sr-only">
        {running ? "Most: " : "Következik: "}
        {primary.fullTitle}, {rangeLabel(primary.startMin, primary.endMin)}
        {primary.meta.length > 0 ? `, ${primary.meta.join(", ")}` : ""}.
      </p>

      <p className="text-sm font-medium text-hero-foreground/70">
        {running
          ? teacher
            ? "Most ezt tartod"
            : "Most ezen ülsz"
          : //! A HOSSZÚ HÉZAG NEM SZÜNET, ÉS A TANÁRNAK EZ NEM SZŐRSZÁLHASOGATÁS.
            //! A diák napján a két óra közti rés tíz perc; a tanárén simán két
            //! üres óra, amit be lehet osztani. Ugyanaz az állapot, más név —
            //! a küszöb ugyanaz a 25 perc, amitől a `day.ts` külön szakaszként
            //! kezeli a hézagot, tehát a hero és a nap listája nem mondhat
            //! kétfélét ugyanarról a résről.
            teacher && state.phase === "break" && gapLike
            ? "Lyukasórád van"
            : state.phase === "done"
              ? "A következő órád"
              : "Következő órád"}
      </p>

      <TimeRow item={primary} lead={running ? "Most" : dayLabel} />
      <Facts item={primary} teacher={teacher} />

      {state.phase !== "done" && span && (
        <p className="mt-3 text-sm text-hero-foreground/70">
          <span className="font-semibold tabular-nums text-hero-foreground">
            {countdown.value}
            {countdown.unit ? ` ${countdown.unit}` : ""}
          </span>{" "}
          {running ? "van hátra" : "múlva kezdődik"}
        </p>
      )}

      {/*//* A blokk alsó élén futó haladás-sáv: a szakasz eltelt része. */}
      {span && span.toMin > span.fromMin && (
        <DrainBar
          //! ÚJ SZAKASZ = ÚJ ELEM. Egy futó animáció fázisát nem lehet
          //! visszaállítani, csak újraindítani.
          key={`${epoch}-${span.fromMin}-${span.toMin}`}
          span={span}
          fraction={spanFraction(span, clock.min)}
          accentSeed={primary.accentSeed}
          //* Élő szakasz = márkapiros, a lap többi „most" jelzésével egy nyelven.
          className="h-1 !bg-brand"
        />
      )}
    </section>
  );
}

//! AZ IDŐ A LEGNAGYOBB ELEM. Nem a tantárgy neve: aki ide néz, azt tudja, mi
//! következik — azt akarja tudni, MIKOR.
function TimeRow({ item, lead }: { item: AgendaItem; lead: string | null }) {
  return (
    <div className="mt-3 flex items-center justify-between gap-4">
      <div className="flex items-baseline gap-3">
        {lead === "Most" ? (
          //* Piros csak élő szerepben.
          <span className="rounded-full bg-brand px-2.5 py-1 text-sm font-bold text-brand-foreground">
            Most
          </span>
        ) : lead ? (
          <span className="text-lg font-semibold capitalize text-hero-foreground/80">
            {lead}
          </span>
        ) : null}
        <time
          dateTime={minLabel(item.startMin)}
          className="text-4xl font-bold tracking-tight tabular-nums sm:text-5xl"
        >
          {minLabel(item.startMin)}
        </time>
      </div>
      <ArrowRight
        className="hidden size-5 shrink-0 text-hero-foreground/40 sm:block"
        aria-hidden
      />
    </div>
  );
}

function Facts({ item, teacher }: { item: AgendaItem; teacher: boolean }) {
  const { room, who } = item;
  const WhoIcon = who?.kind === "class" ? Users : GraduationCap;

  //! ─── A TANÁRI OLVASAT: AZ OSZTÁLY A FŐCÍM ───────────────────────────────
  //! A `lib/timetable.ts` `teacherLessons`-e ezt már kimondja a saját
  //! megjegyzésében: a tanár kártyáján az OSZTÁLY a hír, a tanár neve magától
  //! értetődik. A folyosón a tantárgyat tudja — azt keresi, kihez és hova
  //! megy. Ezért itt az osztály és a terem cserél helyet a tantárggyal.
  //*
  //* AMI NEM CSERÉL: az idő marad a doboz legnagyobb eleme (`TimeRow`), és a
  //* PÖTTY a tantárgy mellett marad. A tizenkét hue a tantárgyat azonosítja;
  //* az osztály mellé húzva ugyanaz a szín két különböző dolgot jelölne.
  if (teacher && who?.kind === "class") {
    return (
      <div className="mt-3 space-y-1">
        <p className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
          <span className="text-xl font-bold tracking-tight">{who.label}</span>
          {room && (
            <span className="rounded-[4px] bg-hero-foreground/12 px-1.5 py-px text-sm font-bold tabular-nums text-hero-foreground">
              {room}
            </span>
          )}
        </p>
        <p className="flex items-start gap-2 text-sm font-medium text-hero-foreground/80">
          <span
            className="mt-[0.45em] size-2 shrink-0 rounded-full acc-dot"
            style={accentStyle(item.accentSeed)}
            aria-hidden
          />
          <span className="min-w-0">{item.fullTitle}</span>
        </p>
        <p className="flex items-center gap-1.5 text-sm text-hero-foreground/70">
          <CalendarClock className="size-3.5" aria-hidden />
          <span className="tabular-nums">
            {rangeLabel(item.startMin, item.endMin)}
          </span>
        </p>
      </div>
    );
  }

  return (
    <div className="mt-3 space-y-1">
      {/*//! A PÖTTY A CÍM ELSŐ SORA MELLETT ÜL, nem fölötte. `flex-wrap`-pel a
          //! hosszú tantárgynév tördelése a pöttyöt egy saját, üres sorba
          //! lökte — az `items-start` és a sormagassághoz igazított felső
          //! margó az első sor mellett tartja. */}
      <p className="flex items-start gap-2 font-semibold">
        <span
          className="mt-[0.45em] size-2 shrink-0 rounded-full acc-dot"
          style={accentStyle(item.accentSeed)}
          aria-hidden
        />
        <span className="min-w-0">{item.fullTitle}</span>
      </p>
      <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-hero-foreground/70">
        <span className="flex items-center gap-1.5">
          <CalendarClock className="size-3.5" aria-hidden />
          <span className="tabular-nums">
            {rangeLabel(item.startMin, item.endMin)}
          </span>
        </span>
        {room && (
          <span className="flex items-center gap-1.5">
            <MapPin className="size-3.5" aria-hidden />
            <span className="tabular-nums">{room}</span>
          </span>
        )}
        {who && (
          <span className="flex items-center gap-1.5">
            <WhoIcon className="size-3.5" aria-hidden />
            {who.label}
          </span>
        )}
      </p>
    </div>
  );
}

function Quiet({ title, detail }: { title: string; detail: string }) {
  return (
    <section className={block}>
      <CalendarDays className="size-5 text-hero-foreground/50" aria-hidden />
      <h2 className="mt-3 text-2xl font-bold tracking-tight">{title}</h2>
      <p className="mt-1 text-sm text-hero-foreground/70">{detail}</p>
      <Link
        href="/orarend"
        className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-hero-foreground/80 underline-offset-4 hover:underline"
      >
        Heti órarend
        <ArrowRight className="size-3.5" aria-hidden />
      </Link>
    </section>
  );
}
