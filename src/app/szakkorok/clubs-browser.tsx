"use client";

import { Briefcase, ChevronDown, DoorOpen, Search, Users } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { EmptyPanel, listGroup } from "@/components/ma/week-panels";
import { accentStyle } from "@/lib/accent";
import {
  type ClubFitVerdict,
  clubFit,
  type DayEnd,
  dayEnds,
  type SlotFit,
} from "@/lib/club-fit";
import {
  audienceLabel,
  CLUB_KIND_LABELS,
  CLUB_KINDS,
  type ClubKind,
  formatMinute,
  openFor,
  targetsClass,
  WEEKDAY_NAMES,
} from "@/lib/clubs";
import {
  fetchTimetableClasses,
  saveCachedClass,
  type TimetableClass,
} from "@/lib/timetable";
import { type FitWeeks, useClubFitWeeks } from "@/lib/use-club-fit";
import { cn } from "@/lib/utils";
import type { ClubCardData } from "./_components/club-card";
import {
  SlotVerdict,
  SOURCE_LABEL,
  SourceMark,
  useStudentClass,
  VERDICT_FILL,
  VERDICT_ORDER,
  VERDICT_TITLE,
} from "./_components/fit-marks";

//* ---------------------------------------------------------------------------
//* A SZAKKÖRLISTA — A HETEDHEZ MÉRVE
//* ---------------------------------------------------------------------------
//! AZ ELSŐ KÉRDÉS NEM AZ, HOGY „MI VAN", HANEM HOGY „MI FÉR BELE". A diák az
//! év elején leül, és azt keresi, amire tényleg el tud menni. A lap ezért az
//! osztálya hetéhez méri az összes szakkört (`club-fit.ts`, a készüléken), és
//! a „belefér" csoporttal KEZD. A többi csoport nem tűnik el: összecsukva,
//! darabszámmal ott áll alatta.
//!
//! A SÁV A SZŰRŐ IS. A négy szelet (belefér · részben · ütközik · nem tudjuk)
//! arányos, és mindegyik gomb: rákoppintva csak az a csoport marad. Nincs
//! külön szűrőpanel — ugyanaz az adat, amire rá lehet koppintani.
//!
//! A SÁV CSAK AZT SZÁMOLJA, AMIRE ELMEHETSZ: ami az osztályodnak (vagy az
//! évfolyamodnak) szól, és ami mindenkinek nyitott. A más évfolyamoknak
//! hirdetett szakkörök a lista végén állnak, saját ítélettel — nem rejtjük el
//! őket, de a „12 fér bele" nem ígérhet olyat, amire nem jelentkezhetsz.
//!
//! A SZŰRÉS ITT TÖRTÉNIK, NEM A SZERVEREN. Ötven szakkör kényelmesen elfér
//! egy válaszban, és a gépelésre azonnal reagáló lista többet ér egy
//! kérésenkénti körnél.

type KindFilter = "all" | ClubKind;
type ClubFitInfo = { verdict: ClubFitVerdict; slots: SlotFit[] };
type Group = {
  id: string;
  title: string;
  clubs: ClubCardData[];
  //* Összecsukva indul-e (a „belefér" nyitva, a többi csukva).
  collapsed: boolean;
};

const DAY_SHORT = ["", "H", "K", "Sze", "Cs", "P"];

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

//* A hét sorrendje: az első időpont napja és kezdete; időpont nélkül a végére.
function firstSlotKey(club: ClubCardData): number {
  const slot = club.slots[0];
  return slot ? slot.weekday * 1440 + slot.startMinute : 99_999;
}

export function ClubsBrowser({
  clubs,
  accountClass,
  teacher,
  approvals,
}: {
  clubs: ClubCardData[];
  //* A belépett diák osztálya a fiókból — a készülék választása felülírja.
  accountClass: string | null;
  //* A belépett tanár jele: neki nincs „heted", a saját szakkörei jönnek előre.
  teacher: string | null;
  //* A jóváhagyásra váró javaslatok, amiket ez a néző hagyhat jóvá.
  approvals: string[];
}) {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<KindFilter>("all");
  const [verdict, setVerdict] = useState<ClubFitVerdict | null>(null);
  const [className, setClassName] = useStudentClass(accountClass);

  const studentClass = teacher ? null : (className ?? null);
  const fitWeeks = useClubFitWeeks(studentClass);
  const fits = useMemo(() => {
    if (fitWeeks.state !== "ready") return null;
    return new Map<string, ClubFitInfo>(
      clubs.map((c) => [
        c.slug,
        clubFit(c.slots, fitWeeks.weeks, fitWeeks.dual),
      ]),
    );
  }, [clubs, fitWeeks]);

  const kinds = useMemo(
    () => CLUB_KINDS.filter((k) => clubs.some((c) => c.kind === k)),
    [clubs],
  );

  const matches = useMemo(() => {
    const q = normalize(query.trim());
    return clubs
      .filter((club) => {
        if (kind !== "all" && club.kind !== kind) return false;
        if (!q) return true;
        return normalize(
          [
            club.name,
            ...club.organizers.flatMap((o) => [o.name, o.short]),
            ...club.slots.map((s) => s.room ?? ""),
          ].join(" "),
        ).includes(q);
      })
      .sort((a, b) => firstSlotKey(a) - firstSlotKey(b));
  }, [clubs, query, kind]);

  const eligible = studentClass
    ? matches.filter(
        (c) => targetsClass(c, studentClass) || openFor(c, studentClass),
      )
    : matches;
  const others = studentClass
    ? matches.filter((c) => !eligible.includes(c))
    : [];

  const counts = Object.fromEntries(
    VERDICT_ORDER.map((v) => [
      v,
      fits ? eligible.filter((c) => fits.get(c.slug)?.verdict === v).length : 0,
    ]),
  ) as Record<ClubFitVerdict, number>;

  //! A SZŰRŐ NEM RAGADHAT BE ÜRES CSOPORTRA: ha a keresés kiürítette, elengedjük.
  const activeVerdict = verdict && counts[verdict] > 0 ? verdict : null;
  const searching = query.trim() !== "" || kind !== "all";
  const groups = buildGroups({
    eligible,
    others,
    fits,
    studentClass,
    teacher,
    approvals,
    verdict: activeVerdict,
  });

  return (
    <div className="mt-6 flex flex-col gap-6">
      {!teacher && (
        <FitPanel
          className={className}
          fitWeeks={fitWeeks}
          counts={counts}
          total={eligible.length}
          verdict={activeVerdict}
          onVerdict={(v) => setVerdict((cur) => (cur === v ? null : v))}
          onClass={(next) => {
            saveCachedClass(next);
            setClassName(next);
            setVerdict(null);
          }}
        />
      )}

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <label className="relative block sm:w-72">
            <span className="sr-only">Keresés</span>
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Név, tanár vagy terem"
              className="h-10 w-full rounded-full border border-input bg-background pr-3 pl-9 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            />
          </label>
          <fieldset className="-mx-4 flex min-w-0 gap-1.5 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 [&::-webkit-scrollbar]:hidden">
            <legend className="sr-only">Fajta</legend>
            {(["all", ...kinds] as const).map((k) => (
              <button
                key={k}
                type="button"
                aria-pressed={kind === k}
                onClick={() => setKind(k)}
                className={cn(
                  "h-8 shrink-0 whitespace-nowrap rounded-full border px-3 text-xs font-medium transition-colors touch-target focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                  kind === k
                    ? "border-foreground bg-foreground text-background"
                    : "border-border text-muted-strong hover:text-foreground",
                )}
              >
                {k === "all" ? "Mind" : CLUB_KIND_LABELS[k]}
              </button>
            ))}
          </fieldset>
        </div>
      </div>

      {matches.length === 0 ? (
        <EmptyPanel>
          {clubs.length === 0 ? (
            "Még nincs felvéve egy szakkör sem."
          ) : (
            <>
              Erre a keresésre nincs szakkör. Nincs ilyen?{" "}
              <a
                href="#ideas-heading"
                className="font-medium text-foreground underline underline-offset-4"
              >
                Írd fel az ötletek közé
              </a>
              , és a tanárok látják, hányan kérnék.
            </>
          )}
        </EmptyPanel>
      ) : (
        <div className="flex flex-col gap-8">
          {groups.map((group, index) => (
            <ClubGroup
              //* A kulcs a nyitott-csukott alapállapotot is visszaállítja, ha a
              //* szűrő vagy a keresés megváltozik.
              key={`${group.id}-${activeVerdict ?? ""}-${searching}`}
              group={group}
              fits={fits}
              startOpen={!group.collapsed || searching}
              //* A jelmagyarázat az első csoport alatt áll (lásd `ClubGroup`).
              legend={index === 0}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function buildGroups({
  eligible,
  others,
  fits,
  studentClass,
  teacher,
  approvals,
  verdict,
}: {
  eligible: ClubCardData[];
  others: ClubCardData[];
  fits: Map<string, ClubFitInfo> | null;
  studentClass: string | null;
  teacher: string | null;
  approvals: string[];
  verdict: ClubFitVerdict | null;
}): Group[] {
  //! A TANÁR: előbb a saját szakkörei és a rá váró javaslatok, aztán minden.
  if (teacher) {
    const pending = eligible.filter((c) => approvals.includes(c.slug));
    const own = eligible.filter(
      (c) =>
        !pending.includes(c) && c.organizers.some((o) => o.short === teacher),
    );
    const rest = eligible.filter(
      (c) => !pending.includes(c) && !own.includes(c),
    );
    return [
      {
        id: "pending",
        title: "Jóváhagyásra vár",
        clubs: pending,
        collapsed: false,
      },
      { id: "own", title: "A te szakköreid", clubs: own, collapsed: false },
      { id: "all", title: "Minden szakkör", clubs: rest, collapsed: false },
    ].filter((g) => g.clubs.length > 0);
  }

  if (!fits) {
    return [
      {
        id: "all",
        title: studentClass
          ? `Neked szól vagy bárkinek nyitott · ${studentClass}`
          : "Minden szakkör",
        clubs: eligible,
        collapsed: false,
      },
      {
        id: "others",
        title: "Más évfolyamoknak, szakmáknak",
        clubs: others,
        collapsed: true,
      },
    ].filter((g) => g.clubs.length > 0);
  }

  //* Csoporton belül előre, ami kifejezetten az osztályodnak szól.
  const aimed = (list: ClubCardData[]) =>
    studentClass
      ? [
          ...list.filter((c) => targetsClass(c, studentClass)),
          ...list.filter((c) => !targetsClass(c, studentClass)),
        ]
      : list;
  const verdicts = verdict ? [verdict] : VERDICT_ORDER;
  const firstOpen = VERDICT_ORDER.find((v) =>
    eligible.some((c) => fits.get(c.slug)?.verdict === v),
  );
  return [
    ...verdicts.map((v) => ({
      id: v,
      title: VERDICT_TITLE[v],
      clubs: aimed(eligible.filter((c) => fits.get(c.slug)?.verdict === v)),
      collapsed: verdict === null && v !== firstOpen,
    })),
    {
      id: "others",
      title: "Más évfolyamoknak",
      clubs: others.filter(
        (c) => verdict === null || fits.get(c.slug)?.verdict === verdict,
      ),
      collapsed: true,
    },
  ].filter((g) => g.clubs.length > 0);
}

//* ---------------------------------------------------------------------------
//* A SÁV
//* ---------------------------------------------------------------------------
function FitPanel({
  className,
  fitWeeks,
  counts,
  total,
  verdict,
  onVerdict,
  onClass,
}: {
  className: string | null | undefined;
  fitWeeks: FitWeeks;
  counts: Record<ClubFitVerdict, number>;
  total: number;
  verdict: ClubFitVerdict | null;
  onVerdict: (v: ClubFitVerdict) => void;
  onClass: (next: string) => void;
}) {
  const [classes, setClasses] = useState<TimetableClass[]>([]);
  useEffect(() => {
    let alive = true;
    void fetchTimetableClasses().then(({ classes }) => {
      if (alive) setClasses(classes);
    });
    return () => {
      alive = false;
    };
  }, []);

  const shell =
    "rounded-2xl border border-hero-foreground/15 bg-hero-foreground/[0.06] p-4 sm:p-5";

  //* Hidratálás előtt nem tudjuk, van-e mentett osztály — a hely már most
  //* akkora, amekkora lesz, hogy a lista ne ugorjon.
  if (className === undefined) {
    return (
      <div className={cn(shell, "h-[13.5rem] sm:h-[11.5rem]")} aria-hidden />
    );
  }

  if (className === null) {
    return (
      <section aria-labelledby="fit-heading" className={shell}>
        <h2 id="fit-heading" className="text-lg font-semibold text-foreground">
          Melyik osztályba jársz?
        </h2>
        <p className="mt-1 max-w-xl text-pretty text-sm text-muted-strong">
          Megmutatjuk, melyik szakkör fér bele a hetedbe — a saját órarended
          alapján, ezen a készüléken. Belépni nem kell.
        </p>
        <div className="mt-4">
          {classes.length > 0 ? (
            <ClassSelect classes={classes} value="" onChange={onClass} />
          ) : (
            <p className="text-sm text-muted-strong">
              Az osztálylista most nem érhető el.{" "}
              <Link
                href="/orarend"
                className="font-medium text-foreground underline underline-offset-4"
              >
                Válaszd ki az órarendben
              </Link>
              , és itt is megjelenik.
            </p>
          )}
        </div>
      </section>
    );
  }

  const switcher =
    classes.length > 0 ? (
      <ClassSelect classes={classes} value={className} onChange={onClass} />
    ) : (
      <span className="font-medium text-foreground">{className}</span>
    );

  if (fitWeeks.state === "error") {
    return (
      <section aria-labelledby="fit-heading" className={shell}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2
            id="fit-heading"
            className="text-lg font-semibold text-foreground"
          >
            Most nem tudjuk, mi fér bele
          </h2>
          {switcher}
        </div>
        <p className="mt-1 max-w-xl text-pretty text-sm text-muted-strong">
          A Jedlikinfo nem adta ki a {className} órarendjét, és ezen a
          készüléken sincs elmentett heted. Ez nem a te hibád; nézz vissza
          később. A lista attól még pontos: az időpontok az iskola órarendjéből
          és a vezető tanároktól jönnek.
        </p>
      </section>
    );
  }

  const ready = fitWeeks.state === "ready";
  const fitsCount = counts.fits;
  const ends = ready ? dayEnds(fitWeeks.weeks, fitWeeks.dual) : null;

  return (
    <section aria-labelledby="fit-heading" className={shell}>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h2
            id="fit-heading"
            className="text-lg font-semibold text-balance text-foreground"
            aria-live="polite"
          >
            {!ready
              ? `A ${className} órarendjét nézzük…`
              : fitsCount === 0
                ? "Egyik szakkör sem fér bele teljesen a hetedbe"
                : `${fitsCount} szakkör fér bele a hetedbe`}
          </h2>
          <p className="mt-0.5 text-sm text-muted-strong">
            {ready
              ? `${total} neked szóló vagy nyitott szakkörből, a csoportjaid szerint.`
              : "A saját csoportjaid szerint, ezen a készüléken."}
          </p>
        </div>
        {switcher}
      </div>

      {ends && <DualNote ends={ends} />}

      {/*//! A SÁV SZIGORÚAN ARÁNYOS: minden szelet pontosan a darabszámával nő,
          //! az üres csoportnak nincs szelete. A szeletekre is rá lehet
          //! koppintani (egérrel ez a természetes mozdulat), de a szűrő
          //! hozzáférhető alakja a felirat-sor alatta — a szelet ugyanazt a
          //! gombot nyomja meg, ezért a billentyűzet elől el van rejtve. */}
      <div
        className={cn(
          "mt-4 flex h-3 gap-0.5 overflow-hidden rounded-full",
          !ready && "animate-pulse bg-foreground/10 motion-reduce:animate-none",
        )}
      >
        {ready &&
          VERDICT_ORDER.map((v) =>
            counts[v] === 0 ? null : (
              <button
                key={v}
                type="button"
                tabIndex={-1}
                aria-hidden
                onClick={() => onVerdict(v)}
                style={{ flexGrow: counts[v], flexBasis: 0 }}
                className={cn(
                  "h-full min-w-1.5 cursor-pointer rounded-[2px] transition-opacity duration-200 hover:opacity-80 motion-reduce:transition-none",
                  VERDICT_FILL[v],
                  verdict && verdict !== v && "opacity-30",
                )}
              />
            ),
          )}
      </div>

      <fieldset
        className="mt-3 flex flex-wrap gap-x-1 gap-y-1"
        aria-busy={!ready}
      >
        <legend className="sr-only">Szűrés aszerint, belefér-e</legend>
        {VERDICT_ORDER.map((v) => {
          const n = counts[v];
          return (
            <button
              key={v}
              type="button"
              disabled={!ready || n === 0}
              aria-pressed={verdict === v}
              onClick={() => onVerdict(v)}
              className={cn(
                "inline-flex h-8 items-center gap-2 rounded-full border px-3 text-sm whitespace-nowrap sm:h-9 transition-colors touch-target focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none",
                verdict === v
                  ? "border-foreground/50 bg-foreground/10 text-foreground"
                  : "border-transparent text-muted-strong hover:bg-foreground/5 hover:text-foreground",
                "disabled:pointer-events-none disabled:opacity-45",
              )}
            >
              <span
                className={cn(
                  "size-2.5 shrink-0 rounded-[3px]",
                  VERDICT_FILL[v],
                )}
                aria-hidden
              />
              <span className="font-semibold tabular-nums text-foreground">
                {ready ? n : "–"}
              </span>
              {VERDICT_TITLE[v]}
            </button>
          );
        })}
      </fieldset>

      {ends && <DayEnds ends={ends} />}
    </section>
  );
}

//! A DUÁLIS NAPOK MIATTI ÜTKÖZÉS KIMONDVA. Egy „egyik sem fér bele" egy
//! duális diáknak ijesztő, ha nem látja az okát: ő a munkahelyén van azokon a
//! napokon. Megnevezzük a hetet és a napokat — és hogy a másik héten ettől még
//! eljárhat.
function DualNote({ ends }: { ends: DayEnd[] }) {
  const letters = [...new Set(ends.flatMap((d) => d.dual))].sort();
  if (letters.length === 0) return null;
  const parts = letters.map((letter) => {
    const days = ends.filter((d) => d.dual.includes(letter));
    return days.length === 5
      ? `${letter} héten egész héten`
      : `${letter} héten ${days
          .map((d) => WEEKDAY_NAMES[d.weekday].toLocaleLowerCase("hu"))
          .join(", ")}`;
  });
  const other = letters.length === 1 ? (letters[0] === "A" ? "B" : "A") : null;
  return (
    <p className="mt-2 flex max-w-xl items-start gap-1.5 text-pretty text-sm text-muted-strong">
      <Briefcase className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      <span>
        A duális beosztásod szerint {parts.join(" és ")} a munkahelyeden vagy,
        ezért az akkor tartott szakkörök ütközésnek számítanak.
        {other &&
          //* „Az A heteken", de „a B heteken" — a névelő a kiejtést követi.
          ` ${other === "A" ? "Az A" : "A B"} heteken attól még eljárhatsz.`}
      </span>
    </p>
  );
}

//! A „BELEFÉR" BIZONYÍTÉKA. Napról napra, meddig tart az utolsó órád (a
//! legkésőbbi az ismert hetekből) — ezt a számot veti össze a lap minden
//! szakkör kezdetével. Aki kételkedik, itt ellenőrzi.
function DayEnds({ ends }: { ends: DayEnd[] }) {
  //* Csak a sáv megjelenése után rajzolódik (a hetek a böngészőben jönnek),
  //* tehát a mai nap itt nem okoz hidratálási eltérést.
  const today = new Date().getDay();
  return (
    <div className="mt-3 border-t border-hero-foreground/10 pt-2.5 sm:mt-4 sm:pt-3">
      <p className="text-xs text-muted-strong">Az utolsó órád vége</p>
      <ol className="mt-1.5 grid grid-cols-5 gap-1">
        {ends.map((day) => {
          const allDual = day.dual.length === 2;
          return (
            <li key={day.weekday} className="min-w-0">
              <span className="sr-only">{WEEKDAY_NAMES[day.weekday]}: </span>
              <span
                className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground"
                aria-hidden
              >
                {DAY_SHORT[day.weekday]}
                {/*//* Piros csak élő szerepben: a mai nap, mint a /ma hetén. */}
                {day.weekday === today && (
                  <span className="size-1.5 rounded-full bg-brand" />
                )}
              </span>
              <span className="flex items-center gap-1 text-sm font-medium tabular-nums text-foreground">
                {allDual ? (
                  <>
                    <Briefcase className="size-3.5 shrink-0" aria-hidden />
                    <span className="truncate">Duális</span>
                  </>
                ) : day.lastEnd === null ? (
                  <span className="text-muted-strong">—</span>
                ) : (
                  formatMinute(day.lastEnd)
                )}
              </span>
              {day.dual.length === 1 && (
                <span className="flex items-center gap-1 text-[11px] text-muted-strong">
                  <Briefcase className="size-3 shrink-0" aria-hidden />
                  {day.dual[0]} hét
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

//* Natív `<select>`, mint az órarendben: mobilon a rendszer kereke, gépen a
//* betűre ugrás. A választás a készüléken marad, és az órarend is ezt nyitja.
function ClassSelect({
  classes,
  value,
  onChange,
}: {
  classes: TimetableClass[];
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <div className="relative w-fit shrink-0">
      <select
        aria-label="Osztály"
        value={value}
        onChange={(e) => e.target.value && onChange(e.target.value)}
        className="h-9 min-w-24 touch-target appearance-none rounded-full border border-hero-foreground/20 bg-background py-1 pr-8 pl-3 text-sm font-medium text-foreground outline-none transition-colors hover:bg-hero-foreground/10 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        {value === "" && (
          <option value="" disabled>
            Válassz osztályt
          </option>
        )}
        {classes.map((c) => (
          <option key={c.short} value={c.short}>
            {c.short}
          </option>
        ))}
      </select>
      <ChevronDown
        className="pointer-events-none absolute top-1/2 right-2.5 size-3.5 -translate-y-1/2 text-muted-strong"
        aria-hidden
      />
    </div>
  );
}

function SourceLegend() {
  return (
    <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-strong">
      {(["TIMETABLE", "ORGANIZER", "none"] as const).map((source) => (
        <span key={source} className="inline-flex items-center gap-1.5">
          <SourceMark source={source} />
          {SOURCE_LABEL[source].replace(/^./, (c) => c.toUpperCase())}
        </span>
      ))}
    </p>
  );
}

//* ---------------------------------------------------------------------------
//* A CSOPORTOK ÉS A SOROK
//* ---------------------------------------------------------------------------
function ClubGroup({
  group,
  fits,
  startOpen,
  legend,
}: {
  group: Group;
  fits: Map<string, ClubFitInfo> | null;
  startOpen: boolean;
  legend: boolean;
}) {
  const [open, setOpen] = useState(startOpen);
  const headingId = `group-${group.id}`;
  const listId = `${headingId}-list`;
  return (
    <section aria-labelledby={headingId}>
      <div className="mb-3 flex items-baseline justify-between gap-4">
        <h2 id={headingId} className="text-base font-semibold text-foreground">
          {group.title}
          <span className="ml-2 text-sm font-normal tabular-nums text-muted-foreground">
            {group.clubs.length}
          </span>
        </h2>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={listId}
          onClick={() => setOpen((v) => !v)}
          className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-sm text-muted-strong transition-colors touch-target hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
        >
          {open ? "Elrejtem" : "Mutasd"}
          <ChevronDown
            className={cn(
              "size-4 transition-transform duration-200 motion-reduce:transition-none",
              open && "rotate-180",
            )}
            aria-hidden
          />
        </button>
      </div>
      {open && (
        <ul id={listId} className={listGroup}>
          {group.clubs.map((club) => (
            <li key={club.slug}>
              <ClubRow
                club={club}
                fit={fits?.get(club.slug) ?? null}
                //! A „BELEFÉR" CSOPORTBAN NEM ISMÉTELJÜK a sor végén: ott
                //! minden időpont belefér, a fejléc már kimondta.
                slotVerdicts={group.id !== "fits"}
              />
            </li>
          ))}
        </ul>
      )}
      {/*//* A jelmagyarázat az első csoport UTÁN: a sorok telefonon is a
          //* képernyő alján kezdődjenek, a jelek magyarázata ráér alattuk. */}
      {legend && <SourceLegend />}
    </section>
  );
}

function ClubRow({
  club,
  fit,
  slotVerdicts,
}: {
  club: ClubCardData;
  fit: ClubFitInfo | null;
  slotVerdicts: boolean;
}) {
  const organizers = club.organizers.map((o) => o.name).join(", ");
  return (
    //! NINCS ELŐTÖLTÉS. A szakkör lapja a termei heti órarendjét is lekéri a
    //! Jedlikinfóból (az alkalmak igazolásához); ötven sor előtöltése ötven
    //! ilyen lekérést indítana pusztán attól, hogy valaki végiggörgette a listát.
    <Link
      href={`/szakkorok/${club.slug}`}
      prefetch={false}
      style={accentStyle(club.slug)}
      className="grid gap-x-8 gap-y-2.5 px-4 py-3.5 transition-colors hover:bg-muted/40 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none md:grid-cols-[minmax(0,1fr)_minmax(0,27rem)]"
    >
      <div className="min-w-0">
        <div className="flex items-start gap-2.5">
          <span
            className="acc-dot mt-[0.45rem] size-2 shrink-0 rounded-full"
            aria-hidden
          />
          <h3 className="min-w-0 text-pretty text-[15px] font-semibold leading-snug text-foreground">
            {club.name}
          </h3>
          {club.proposed && (
            <span className="mt-px shrink-0 rounded-full border border-dashed border-border px-2 py-0.5 text-[11px] font-medium text-muted-strong">
              Javaslat
            </span>
          )}
        </div>
        <p className="mt-1 pl-[1.125rem] text-pretty text-xs leading-relaxed text-muted-strong">
          {CLUB_KIND_LABELS[club.kind]} · {audienceLabel(club)}
          {organizers && ` · ${organizers}`}
          {club.memberCount > 0 && (
            <span className="ml-2 inline-flex items-center gap-1 tabular-nums whitespace-nowrap">
              <Users className="size-3" aria-hidden />
              {club.memberCount}
              <span className="sr-only"> tag</span>
            </span>
          )}
        </p>
      </div>

      {club.slots.length === 0 ? (
        <p className="flex items-center gap-2 pl-[1.125rem] text-sm text-muted-strong md:pl-0">
          <SourceMark source="none" />
          Egyeztetés alatt
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5 pl-[1.125rem] md:pl-0">
          {club.slots.map((slot, i) => (
            <li
              key={`${slot.weekday}-${slot.startMinute}-${slot.room}`}
              className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm"
            >
              <span className="inline-flex items-center gap-2 tabular-nums text-foreground">
                <SourceMark source={slot.source} />
                <span className="sr-only">{SOURCE_LABEL[slot.source]}: </span>
                <span className="w-[4.75rem] shrink-0">
                  {WEEKDAY_NAMES[slot.weekday]}
                </span>
                <span className="w-[5.75rem] shrink-0">
                  {formatMinute(slot.startMinute)}–
                  {formatMinute(slot.endMinute)}
                </span>
              </span>
              {slot.room && (
                <span className="inline-flex items-center gap-1 text-muted-strong">
                  <DoorOpen className="size-3.5" aria-hidden />
                  <span className="sr-only">terem </span>
                  {slot.room}
                </span>
              )}
              {slotVerdicts && fit?.slots[i] && (
                //* Mobilon mindig saját sorban, a nap alá igazítva — nem a
                //* terem hosszán múlik, hová törik.
                <SlotVerdict
                  fit={fit.slots[i]}
                  className="basis-full pl-4 md:ml-auto md:basis-auto md:pl-0"
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </Link>
  );
}
