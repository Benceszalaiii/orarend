"use client";

import { CalendarClock, MapPin, Users } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { accentStyle } from "@/lib/accent";
import { audienceLabel, isOpenToAll, targetsClass } from "@/lib/clubs";
import {
  CATEGORY_LABELS,
  COMPETITION_CATEGORIES,
  type CompetitionCategory,
  deadlineLabel,
  deadlineOf,
  formatWhen,
  openDeadlines,
  STATUS_LABELS,
  VENUE_LABELS,
} from "@/lib/competitions";
import { loadCachedClass } from "@/lib/timetable";
import { cn } from "@/lib/utils";
import { type ContestCardData, withDates } from "./_components/contest-card";

//* ---------------------------------------------------------------------------
//* A VERSENYLISTA
//* ---------------------------------------------------------------------------
//! A HATÁRIDŐ-SÁV ÁLL ELÖL. A lista többi része a „mi van" kérdésre válaszol;
//! a sáv arra, hogy „mit kell MOST megtennem" — a nyitott nevezések a
//! legsürgősebbel kezdve, a hátralévő napokkal. Ha a diák osztálya ismert, a
//! sávban csak az marad, amire NEVEZHET is (a neki szóló vagy a mindenkinek
//! nyitott): egy 13.-osoknak szóló határidő egy 9.-esnek zaj.
//!
//! A „MOST" A SZERVERTŐL JÖN. A „3 nap múlva jár le" felirat a szerveren és a
//! böngészőben ugyanabból a pillanatból számolódik — különben éjfél körül a
//! kettő más napot mondana, és a hidratálás elcsúszna.

type Filter = "all" | CompetitionCategory;

const OPEN_SECTIONS = [
  { status: "OPEN", title: "Nevezés nyitva" },
  { status: "CLOSED", title: "Nevezés lezárva, hamarosan" },
  { status: "FINISHED", title: "Lezajlott" },
  { status: "CANCELLED", title: "Elmarad" },
  { status: "DRAFT", title: "Piszkozataid — a diákok még nem látják" },
] as const;

export function ContestsBrowser({
  contests,
  now: nowIso,
}: {
  contests: ContestCardData[];
  now: string;
}) {
  const now = useMemo(() => new Date(nowIso), [nowIso]);
  const [filter, setFilter] = useState<Filter>("all");
  const [className, setClassName] = useState<string | null>(null);
  useEffect(() => setClassName(loadCachedClass()), []);

  const eligible = (c: ContestCardData) =>
    !className || isOpenToAll(c) || targetsClass(c, className);

  const categories = COMPETITION_CATEGORIES.filter((k) =>
    contests.some((c) => c.category === k),
  );
  const shown = contests.filter(
    (c) => filter === "all" || c.category === filter,
  );
  const deadlines = openDeadlines(
    shown.filter(eligible).map(withDates),
    now,
  ).slice(0, 6);

  return (
    <div className="mt-8">
      {deadlines.length > 0 && (
        <section aria-labelledby="deadline-heading" className="mb-10">
          <h2
            id="deadline-heading"
            className="mb-3 flex items-center gap-2 text-sm font-semibold text-muted-strong"
          >
            <CalendarClock className="size-4" aria-hidden />
            Nevezési határidők
            {className && (
              <span className="font-normal text-muted-foreground">
                · amire {className}-ként nevezhetsz
              </span>
            )}
          </h2>
          <ol className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
            {deadlines.map((c) => {
              const deadline = deadlineOf(c);
              const days = Math.ceil(
                (deadline.getTime() - now.getTime()) / 86_400_000,
              );
              return (
                <li key={c.slug} style={accentStyle(c.slug)}>
                  <Link
                    href={`/versenyek/${c.slug}`}
                    prefetch={false}
                    className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
                  >
                    <span
                      className="acc-dot size-2 shrink-0 rounded-full"
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">
                        {c.name}
                      </span>
                      <span className="text-xs text-muted-strong">
                        {formatWhen(deadline)}
                      </span>
                    </span>
                    <span
                      className={cn(
                        "shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-medium tabular-nums",
                        days <= 3
                          ? "border-brand/50 text-foreground"
                          : "border-border text-muted-strong",
                      )}
                    >
                      {deadlineLabel(deadline, now)}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ol>
        </section>
      )}

      {categories.length > 1 && (
        <fieldset className="mb-8 flex flex-wrap gap-1.5">
          <legend className="sr-only">Terület</legend>
          {(["all", ...categories] as const).map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={filter === k}
              onClick={() => setFilter(k)}
              className={cn(
                "h-8 rounded-full border px-3 text-xs font-medium transition-colors touch-target focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                filter === k
                  ? "border-foreground bg-foreground text-background"
                  : "border-border text-muted-strong hover:text-foreground",
              )}
            >
              {k === "all" ? "Mind" : CATEGORY_LABELS[k]}
            </button>
          ))}
        </fieldset>
      )}

      {shown.length === 0 ? (
        <p className="text-sm text-muted-strong">
          {contests.length === 0
            ? "Még nincs meghirdetett verseny."
            : "Ezen a területen nincs verseny."}
        </p>
      ) : (
        <div className="flex flex-col gap-10">
          {OPEN_SECTIONS.map(({ status, title }) => {
            const list = shown.filter((c) => c.status === status);
            if (list.length === 0) return null;
            //* A lezajlottakból a legfrissebb elöl; a többinél a legközelebbi.
            const ordered = status === "FINISHED" ? [...list].reverse() : list;
            return (
              <section key={status}>
                <h2 className="mb-3 text-sm font-semibold text-muted-strong">
                  {title}
                  <span className="ml-2 font-normal tabular-nums text-muted-foreground">
                    {list.length}
                  </span>
                </h2>
                <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {ordered.map((c) => (
                    <li key={c.slug}>
                      <ContestCard
                        contest={c}
                        now={now}
                        eligible={eligible(c)}
                      />
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ContestCard({
  contest,
  now,
  eligible,
}: {
  contest: ContestCardData;
  now: Date;
  eligible: boolean;
}) {
  const c = withDates(contest);
  const where =
    c.venue === "SCHOOL"
      ? c.room
        ? `${c.room} terem`
        : VENUE_LABELS.SCHOOL
      : c.venue === "EXTERNAL"
        ? (c.location ?? VENUE_LABELS.EXTERNAL)
        : VENUE_LABELS.ONLINE;
  return (
    <Link
      href={`/versenyek/${c.slug}`}
      prefetch={false}
      style={accentStyle(c.slug)}
      className={cn(
        "flex h-full flex-col gap-2 rounded-xl border border-border bg-card p-4 transition-colors hover:border-foreground/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        (c.status === "CANCELLED" || !eligible) && "opacity-70",
      )}
    >
      <div className="flex items-start gap-2">
        <span
          className="acc-dot mt-1.5 size-2 shrink-0 rounded-full"
          aria-hidden
        />
        <h3
          className={cn(
            "min-w-0 flex-1 text-pretty text-[15px] font-semibold leading-snug",
            c.status === "CANCELLED" && "line-through",
          )}
        >
          {c.name}
        </h3>
      </div>
      <p className="text-xs text-muted-strong">
        {CATEGORY_LABELS[c.category]} · {audienceLabel(c)}
      </p>
      <p className="text-sm tabular-nums">{formatWhen(c.startsAt)}</p>
      <p className="inline-flex items-center gap-1 text-sm text-muted-strong">
        <MapPin className="size-3.5 shrink-0" aria-hidden />
        <span className="truncate">{where}</span>
      </p>
      <p className="mt-auto flex items-center justify-between gap-2 pt-1 text-xs text-muted-strong">
        <span>
          {c.status === "OPEN"
            ? deadlineLabel(deadlineOf(c), now)
            : STATUS_LABELS[c.status]}
          {!eligible && " · nem a te évfolyamodnak"}
        </span>
        <span className="inline-flex shrink-0 items-center gap-1 tabular-nums">
          <Users className="size-3.5" aria-hidden />
          {c.entryCount}
          {c.capacity ? ` / ${c.capacity}` : ""}
        </span>
      </p>
    </Link>
  );
}
