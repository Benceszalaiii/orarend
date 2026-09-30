"use client";

import { CalendarClock, MapPin, Users } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { EmptyPanel, listGroup } from "@/components/ma/week-panels";
import { accentStyle } from "@/lib/accent";
import {
  audienceLabel,
  type ClubAudience,
  isOpenToAll,
  targetsClass,
} from "@/lib/clubs";
import {
  CATEGORY_LABELS,
  COMPETITION_CATEGORIES,
  type CompetitionCategory,
  type CompetitionStatus,
  formatWhen,
  STATUS_LABELS,
  VENUE_LABELS,
} from "@/lib/competitions";
import { riverAxis, riverLanes } from "@/lib/contest-river";
import { loadCachedClass } from "@/lib/timetable";
import { cn } from "@/lib/utils";
import { type ContestCardData, withDates } from "./_components/contest-card";
import { DeadlineRiver } from "./_components/deadline-river";

//* ---------------------------------------------------------------------------
//* A VERSENYLISTA
//* ---------------------------------------------------------------------------
//! A HATÁRIDŐ-FOLYAM ÁLL ELÖL (`deadline-river.tsx`). A „mit kell MOST
//! megtennem" kérdésre nem egy lista felel, hanem az idő: a következő hetek
//! egy vonalon, minden közelgő verseny egy sor, a nevezésig hátralévő idő a
//! sor hossza. Ha a diák osztálya ismert, előbb az áll, amire NEVEZHET is (a
//! neki szóló vagy a mindenkinek nyitott); a más évfolyamoknak szólók
//! halványan utánuk.
//!
//! ALATTA, ami már nem határidő: a lezajlottak az eredménnyel, az elmaradók,
//! és a tanárnak a saját piszkozatai — sorokban, ugyanazzal a nyelvvel, mint
//! a szakkörök listája.
//!
//! A „MOST" A SZERVERTŐL JÖN. A „3 nap múlva jár le" felirat a szerveren és a
//! böngészőben ugyanabból a pillanatból számolódik — különben éjfél körül a
//! kettő más napot mondana, és a hidratálás elcsúszna. Utána a böngésző
//! percenként lépteti: a most vonala és a feliratok élnek.

type Filter = "all" | CompetitionCategory;

const LATER_SECTIONS: {
  status: CompetitionStatus | "started";
  title: string;
}[] = [
  { status: "started", title: "Elkezdődött" },
  { status: "FINISHED", title: "Lezajlott" },
  { status: "CANCELLED", title: "Elmarad" },
  { status: "DRAFT", title: "Piszkozataid — a diákok még nem látják" },
];

//* Percenként lép, a szerver pillanatából indulva.
function useMinuteNow(initial: Date): Date {
  const [now, setNow] = useState(initial);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

export function ContestsBrowser({
  contests,
  now: nowIso,
}: {
  contests: ContestCardData[];
  now: string;
}) {
  const serverNow = useMemo(() => new Date(nowIso), [nowIso]);
  const now = useMinuteNow(serverNow);
  const [filter, setFilter] = useState<Filter>("all");
  const [className, setClassName] = useState<string | null>(null);
  useEffect(() => setClassName(loadCachedClass()), []);

  const eligible = (c: ClubAudience) =>
    !className || isOpenToAll(c) || targetsClass(c, className);

  const categories = COMPETITION_CATEGORIES.filter((k) =>
    contests.some((c) => c.category === k),
  );
  const shown = contests.filter(
    (c) => filter === "all" || c.category === filter,
  );
  const dated = shown.map(withDates);
  const lanes = riverLanes(dated, now);
  //* Előbb, amire nevezhetsz — a sorrend a két csoporton belül megmarad.
  const ordered = [
    ...lanes.filter((l) => eligible(l.contest)),
    ...lanes.filter((l) => !eligible(l.contest)),
  ];
  const axis = riverAxis(
    now,
    lanes.flatMap((l) => [l.contest.startsAt]),
  );
  const inRiver = new Set(lanes.map((l) => l.contest.slug));
  const later = (status: (typeof LATER_SECTIONS)[number]["status"]) =>
    shown.filter((c) =>
      status === "started"
        ? (c.status === "OPEN" || c.status === "CLOSED") && !inRiver.has(c.slug)
        : c.status === status,
    );

  return (
    <div className="mt-8">
      {categories.length > 1 && (
        <fieldset className="mb-6 flex flex-wrap gap-1.5">
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

      {contests.length === 0 ? (
        <EmptyPanel>Még nincs meghirdetett verseny.</EmptyPanel>
      ) : (
        <div className="flex flex-col gap-10">
          <section aria-labelledby="deadline-heading">
            <h2
              id="deadline-heading"
              className="mb-3 flex flex-wrap items-center gap-x-2 text-sm font-semibold text-muted-strong"
            >
              <CalendarClock className="size-4" aria-hidden />
              Nevezési határidők
              {className && (
                <span className="font-normal text-muted-foreground">
                  · előbb, amire {className}-ként nevezhetsz
                </span>
              )}
            </h2>
            {ordered.length > 0 ? (
              <DeadlineRiver
                lanes={ordered}
                axis={axis}
                now={now}
                eligible={eligible}
              />
            ) : (
              <EmptyPanel>
                {shown.length === 0
                  ? "Ezen a területen nincs verseny."
                  : "Most nincs közelgő verseny. Ha egy tanár meghirdet egyet, itt jelenik meg a nevezési határidejével."}
              </EmptyPanel>
            )}
          </section>

          {LATER_SECTIONS.map(({ status, title }) => {
            const list = later(status);
            if (list.length === 0) return null;
            //* A lezajlottakból a legfrissebb elöl; a többinél a legközelebbi.
            const rows = status === "FINISHED" ? [...list].reverse() : list;
            return (
              <section key={status} aria-label={title}>
                <h2 className="mb-3 text-sm font-semibold text-muted-strong">
                  {title}
                  <span className="ml-2 font-normal tabular-nums text-muted-foreground">
                    {list.length}
                  </span>
                </h2>
                <ul className={listGroup}>
                  {rows.map((c) => (
                    <li key={c.slug}>
                      <ContestRow contest={c} eligible={eligible(c)} />
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

function ContestRow({
  contest,
  eligible,
}: {
  contest: ContestCardData;
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
        "grid gap-x-8 gap-y-1.5 px-4 py-3.5 transition-colors hover:bg-muted/40 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none md:grid-cols-[minmax(0,1fr)_auto]",
        (c.status === "CANCELLED" || !eligible) && "opacity-70",
      )}
    >
      <span className="min-w-0">
        <span className="flex items-start gap-2">
          <span
            className="acc-dot mt-[0.4rem] size-2 shrink-0 rounded-full"
            aria-hidden
          />
          <span
            className={cn(
              "min-w-0 text-pretty text-[15px] font-semibold leading-snug text-foreground",
              c.status === "CANCELLED" && "line-through",
            )}
          >
            {c.name}
          </span>
        </span>
        <span className="mt-1 block pl-4 text-xs text-muted-strong">
          {CATEGORY_LABELS[c.category]} · {audienceLabel(c)}
          {!eligible && " · nem a te évfolyamodnak"}
        </span>
      </span>
      <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 pl-4 text-sm text-muted-strong md:justify-end md:pl-0">
        <span className="tabular-nums text-foreground">
          {formatWhen(c.startsAt)}
        </span>
        <span className="inline-flex items-center gap-1">
          <MapPin className="size-3.5 shrink-0" aria-hidden />
          {where}
        </span>
        <span className="inline-flex items-center gap-1 tabular-nums">
          <Users className="size-3.5" aria-hidden />
          {c.entryCount}
          <span className="sr-only"> nevező</span>
        </span>
        <span className="text-xs">{STATUS_LABELS[c.status]}</span>
      </span>
    </Link>
  );
}
