"use client";

import {
  Briefcase,
  CalendarCheck,
  ChevronDown,
  ChevronRight,
  Clock,
  DoorOpen,
  Search,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { EmptyPanel, listGroup } from "@/components/ma/week-panels";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { accentStyle } from "@/lib/accent";
import {
  type ClubFitVerdict,
  clubFit,
  type DayEnd,
  dayEnds,
  type SlotFit,
} from "@/lib/club-fit";
import { clubInWindow, type MapWindow, windowLabel } from "@/lib/club-week-map";
import {
  audienceLabel,
  CLUB_KIND_LABELS,
  CLUB_KINDS,
  type ClubKind,
  formatMinute,
  openFor,
  targetsClass,
  tracksOfClass,
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
  VERDICT_ORDER,
} from "./_components/fit-marks";
import { type MapHover, WeekMap } from "./_components/week-map";

//* ---------------------------------------------------------------------------
//* A SZAKKÖRLISTA — A HETEDHEZ MÉRVE
//* ---------------------------------------------------------------------------
//! A LISTA A FŐSZEREPLŐ, NEM A PANEL. A diák a szakköröket keresi; hogy mi
//! fér bele a hetébe, az egy kérdés, amit feltesz — nem egy fal, amin át kell
//! jutnia. A személyre szabás ezért EGY gomb a kereső mellett („10.A · 12 fér
//! bele a hetedbe"), és a hét-térkép ablakban nyílik.
//!
//! AZ ABLAK AZT MUTATJA, AMI LEHETSÉGES. A térképen csak az áll, amire
//! elmehetsz: ami az osztályodnak (évfolyamodnak) szól vagy nyitott, és nem
//! ütközik az óráiddal — a térkép nem azzal kezd, ami nem megy.
//!
//! A LISTÁT AZ RENDEZI, KINEK SZÓL — NEM AZ, HOGY BELEFÉR-E. Előbb, ami az
//! osztályodnak vagy évfolyamodnak szól, aztán ami a szakmádnak, aztán ami
//! mindenkinek nyitott. A más évfolyamoké és szakmáké a végén, összecsukva:
//! egy 13.-osnak a 9.-eseknek hirdetett szakkör zaj, de nem titok. Az, hogy
//! belefér-e a hetedbe, másodlagos adat: csoporton belül előre hozza a
//! beleférőt, és a sor végén áll — de csoportot nem alkot.
//!
//! A SZŰRÉS ITT TÖRTÉNIK, NEM A SZERVEREN. Ötven szakkör kényelmesen elfér
//! egy válaszban, és a gépelésre azonnal reagáló lista többet ér egy
//! kérésenkénti körnél.
//!
//! A HÉT-TÉRKÉP UGYANAZT A LISTÁT SZŰRI (`week-map.tsx`): egy nap, egy csomó
//! vagy egy kihúzott időablak. A kijelölt idő az ablak bezárása után is ott
//! áll a kereső mellett, és onnan is elenged.

type KindFilter = "all" | ClubKind;
type ClubFitInfo = { verdict: ClubFitVerdict; slots: SlotFit[] };
type Group = {
  id: string;
  title: string;
  clubs: ClubCardData[];
  //* Összecsukva indul-e (a „belefér" nyitva, a többi csukva).
  collapsed: boolean;
};

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
  const [timeWindow, setTimeWindow] = useState<MapWindow | null>(null);
  const [hover, setHover] = useState<MapHover>(null);
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

  //* Keresés és fajta — a térkép EZT látja, az időablakot a saját kerete
  //* mutatja rajta.
  const searched = useMemo(() => {
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
  const matches = timeWindow
    ? searched.filter((club) => clubInWindow(club.slots, timeWindow))
    : searched;

  const reachable = useCallback(
    (c: ClubCardData) =>
      studentClass !== null &&
      (targetsClass(c, studentClass) || openFor(c, studentClass)),
    [studentClass],
  );
  const eligible = studentClass ? matches.filter(reachable) : matches;
  const others = studentClass
    ? matches.filter((c) => !eligible.includes(c))
    : [];

  const counts = Object.fromEntries(
    VERDICT_ORDER.map((v) => [
      v,
      fits ? eligible.filter((c) => fits.get(c.slug)?.verdict === v).length : 0,
    ]),
  ) as Record<ClubFitVerdict, number>;

  const searching =
    query.trim() !== "" || kind !== "all" || timeWindow !== null;
  const groups = buildGroups({
    eligible,
    others,
    fits,
    studentClass,
    teacher,
    approvals,
  });

  //! A TÉRKÉP ALAPJA NEM SZŰKÜL GÉPELÉS KÖZBEN. A jelek helye attól függ,
  //! ki fér el egymás mellett; ha minden leütésre átrendeződnének, a térkép
  //! remegne. A keresésen kívül esők a helyükön maradnak, csak elhalványulnak.
  //! Ami ütközik, az viszont rá sem kerül: a térkép a lehetőségeket mutatja.
  const mapClubs = useMemo(
    () =>
      studentClass
        ? clubs.filter(
            (c) => reachable(c) && fits?.get(c.slug)?.verdict !== "clash",
          )
        : clubs,
    [clubs, studentClass, reachable, fits],
  );
  const lit = useMemo(() => new Set(searched.map((c) => c.slug)), [searched]);
  const onRowHover = useCallback(
    (slug: string | null) => setHover(slug ? { slug, from: "list" } : null),
    [],
  );

  return (
    <div className="mt-6 flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        {!teacher && (
          <FitWeek
            className={className}
            fitWeeks={fitWeeks}
            counts={counts}
            total={eligible.length}
            timeWindow={timeWindow}
            onTimeWindow={setTimeWindow}
            onClass={(next) => {
              saveCachedClass(next);
              setClassName(next);
            }}
            map={
              <WeekMap
                clubs={mapClubs}
                fits={fits}
                fitWeeks={fitWeeks}
                lit={lit}
                hover={hover}
                onHover={setHover}
                timeWindow={timeWindow}
                onTimeWindow={setTimeWindow}
              />
            }
          />
        )}
        <label className="relative block sm:w-64">
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
        {timeWindow && (
          //* A térképen kijelölt idő itt is ott áll: aki a lista közepén
          //* jár, annak is látszik, miért ennyi a sor — és innen is elenged.
          <button
            type="button"
            onClick={() => setTimeWindow(null)}
            className="inline-flex h-8 w-fit shrink-0 items-center gap-1.5 rounded-full border border-primary/60 bg-primary/10 pr-2 pl-3 text-xs font-medium whitespace-nowrap text-foreground tabular-nums transition-colors touch-target hover:bg-primary/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none"
          >
            <Clock className="size-3.5 text-primary" aria-hidden />
            {windowLabel(timeWindow)}
            <X className="size-3.5 text-muted-strong" aria-hidden />
            <span className="sr-only">: az időablak törlése</span>
          </button>
        )}
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

      {matches.length === 0 ? (
        <EmptyPanel>
          {clubs.length === 0 ? (
            "Még nincs felvéve egy szakkör sem."
          ) : timeWindow && searched.length > 0 ? (
            <>
              A kijelölt időben ({windowLabel(timeWindow)}) nincs szakkör.{" "}
              <button
                type="button"
                onClick={() => setTimeWindow(null)}
                className="font-medium text-foreground underline underline-offset-4"
              >
                Mutasd az egész hetet
              </button>
              .
            </>
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
              //* keresés megváltozik.
              key={`${group.id}-${searching}`}
              group={group}
              fits={fits}
              startOpen={!group.collapsed || searching}
              //* A jelmagyarázat az első csoport alatt áll (lásd `ClubGroup`).
              legend={index === 0}
              highlight={hover?.from === "map" ? hover.slug : null}
              onRowHover={onRowHover}
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
}: {
  eligible: ClubCardData[];
  others: ClubCardData[];
  fits: Map<string, ClubFitInfo> | null;
  studentClass: string | null;
  teacher: string | null;
  approvals: string[];
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

  if (!studentClass) {
    return [
      { id: "all", title: "Minden szakkör", clubs: eligible, collapsed: false },
    ].filter((g) => g.clubs.length > 0);
  }

  //! CSOPORTON BELÜL ELŐRE, AMI BELEFÉR — ez a másodlagos rend. Az ítélet
  //! sorrendje (`VERDICT_ORDER`), azon belül a hét sorrendje marad (a lista
  //! már így érkezik, és a `sort` stabil). Amíg a heted nem jött meg, csak a
  //! hét sorrendje számít.
  const byFit = (list: ClubCardData[]) =>
    fits
      ? [...list].sort(
          (a, b) =>
            fitRank(fits.get(a.slug)?.verdict) -
            fitRank(fits.get(b.slug)?.verdict),
        )
      : list;
  //* Nyelvi előkészítőnél nem tudjuk a szakmát — ott a szakmai irányú nyitott
  //* szakkör is a „mindenkinek" csoportba kerül, nem a „szakmádnak".
  const ownTracks = tracksOfClass(studentClass);
  const aimed = eligible.filter((c) => targetsClass(c, studentClass));
  const trade = eligible.filter(
    (c) => !aimed.includes(c) && ownTracks !== null && c.tracks.length > 0,
  );
  const open = eligible.filter((c) => !aimed.includes(c) && !trade.includes(c));
  return [
    {
      id: "aimed",
      title: `Neked szól · ${studentClass}`,
      clubs: byFit(aimed),
      collapsed: false,
    },
    {
      id: "trade",
      title: "A szakmádnak",
      clubs: byFit(trade),
      collapsed: false,
    },
    {
      id: "open",
      title: "Mindenkinek nyitott",
      clubs: byFit(open),
      collapsed: false,
    },
    //! A MÁS ÉVFOLYAMOKÉ ÉS SZAKMÁKÉ ÖSSZECSUKVA — megvan, de nem tolakszik.
    {
      id: "others",
      title: "Más évfolyamoknak, szakmáknak",
      clubs: byFit(others),
      collapsed: true,
    },
  ].filter((g) => g.clubs.length > 0);
}

function fitRank(verdict: ClubFitVerdict | undefined): number {
  return verdict ? VERDICT_ORDER.indexOf(verdict) : VERDICT_ORDER.length;
}

//* ---------------------------------------------------------------------------
//* A HETED — EGY GOMB ÉS EGY ABLAK
//* ---------------------------------------------------------------------------
function FitWeek({
  className,
  fitWeeks,
  counts,
  total,
  timeWindow,
  onTimeWindow,
  onClass,
  map,
}: {
  className: string | null | undefined;
  fitWeeks: FitWeeks;
  counts: Record<ClubFitVerdict, number>;
  total: number;
  timeWindow: MapWindow | null;
  onTimeWindow: (next: MapWindow | null) => void;
  onClass: (next: string) => void;
  //* A hét-térkép — az ablak alján áll minden állapotban, osztály nélkül is:
  //* akkor csak a szakkörök helye látszik, a heted nélkül.
  map: React.ReactNode;
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

  //* Hidratálás előtt nem tudjuk, van-e mentett osztály — a gomb helye már
  //* most akkora, amekkora lesz, hogy a kereső ne ugorjon.
  if (className === undefined) {
    return (
      <div
        className="h-10 w-full shrink-0 animate-pulse rounded-full bg-muted motion-reduce:animate-none sm:w-60"
        aria-hidden
      />
    );
  }

  const ready = fitWeeks.state === "ready";
  const label =
    className === null
      ? "Mi fér bele a hetembe?"
      : fitWeeks.state === "error"
        ? "a heted most nem érhető el"
        : !ready
          ? "a heted betöltése…"
          : counts.fits === 0
            ? "nézd meg, mi fér bele"
            : `${counts.fits} fér bele a hetedbe`;

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className="inline-flex h-10 w-full min-w-0 shrink-0 items-center gap-2 rounded-full border border-primary/40 bg-primary/[0.07] pr-2.5 pl-3 text-sm text-foreground transition-colors touch-target hover:bg-primary/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none sm:w-auto"
        >
          <CalendarCheck className="size-4 shrink-0 text-primary" aria-hidden />
          {className !== null && (
            <span className="font-semibold">{className}</span>
          )}
          <span
            className={cn(
              "min-w-0 truncate",
              className !== null && "text-muted-strong",
              ready && counts.fits > 0 && "tabular-nums",
            )}
          >
            {className !== null && <span aria-hidden>· </span>}
            {label}
          </span>
          <ChevronRight
            className="ml-auto size-4 shrink-0 text-muted-strong"
            aria-hidden
          />
        </button>
      </DialogTrigger>
      <DialogContent
        className="max-h-[calc(100dvh-2rem)] gap-0 overflow-y-auto p-4 sm:max-w-3xl sm:p-5"
        //! AZ ESC ELŐSZÖR A KIJELÖLÉST ENGEDI EL, mint a térképen; csak a
        //! második zárja az ablakot.
        onEscapeKeyDown={(e) => {
          if (!timeWindow) return;
          e.preventDefault();
          onTimeWindow(null);
        }}
      >
        <FitSummary
          className={className}
          classes={classes}
          fitWeeks={fitWeeks}
          counts={counts}
          total={total}
          timeWindow={timeWindow}
          onClass={onClass}
        />
        {map}
        <div className="mt-4 flex justify-end">
          <DialogClose asChild>
            <button
              type="button"
              className="inline-flex h-9 items-center rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              {timeWindow ? "Mutasd a listában" : "Kész"}
            </button>
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  );
}

//! A FEJLÉC A LEHETŐSÉGET MONDJA KI. „12 fér bele, 3 részben" — nem azt,
//! hány ütközik. Az ütközők a listában megvannak, összecsukva.
function FitSummary({
  className,
  classes,
  fitWeeks,
  counts,
  total,
  timeWindow,
  onClass,
}: {
  className: string | null;
  classes: TimetableClass[];
  fitWeeks: FitWeeks;
  counts: Record<ClubFitVerdict, number>;
  total: number;
  timeWindow: MapWindow | null;
  onClass: (next: string) => void;
}) {
  //* A bezáró gomb a jobb felső sarokban áll — a választó nem csúszhat alá.
  const head =
    "flex flex-wrap items-start justify-between gap-x-4 gap-y-2 pr-8";

  if (className === null) {
    return (
      <div>
        <DialogTitle className="text-lg leading-snug font-semibold text-foreground">
          Melyik osztályba jársz?
        </DialogTitle>
        <DialogDescription className="mt-1 max-w-xl text-pretty text-muted-strong">
          Megmutatjuk, melyik szakkör fér bele a hetedbe — a saját órarended
          alapján, ezen a készüléken. Belépni nem kell.
        </DialogDescription>
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
      </div>
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
      <div>
        <div className={head}>
          <DialogTitle className="text-lg leading-snug font-semibold text-foreground">
            Most nem tudjuk, mi fér bele
          </DialogTitle>
          {switcher}
        </div>
        <DialogDescription className="mt-1 max-w-xl text-pretty text-muted-strong">
          A Jedlikinfo nem adta ki a {className} órarendjét, és ezen a
          készüléken sincs elmentett heted. Ez nem a te hibád; nézz vissza
          később. A lista attól még pontos: az időpontok az iskola órarendjéből
          és a vezető tanároktól jönnek.
        </DialogDescription>
      </div>
    );
  }

  const ready = fitWeeks.state === "ready";
  const ends = ready ? dayEnds(fitWeeks.weeks, fitWeeks.dual) : null;
  const { fits, partly } = counts;
  const possible = fits + partly + counts.unknown;

  return (
    <div>
      <div className={head}>
        <div className="min-w-0">
          <DialogTitle
            className="text-lg leading-snug font-semibold text-balance text-foreground"
            aria-live="polite"
          >
            {!ready
              ? `A ${className} órarendjét nézzük…`
              : timeWindow && total === 0
                ? "A kijelölt időben nincs neked szóló szakkör"
                : fits > 0
                  ? `${fits} szakkör fér bele a hetedbe`
                  : possible > 0
                    ? "Ezekre a szakkörökre eljuthatsz"
                    : "Most egyik szakkör sem fér bele a hetedbe"}
          </DialogTitle>
          <DialogDescription className="mt-0.5 text-pretty text-muted-strong">
            {!ready
              ? "A saját csoportjaid szerint, ezen a készüléken."
              : `${fits > 0 && partly > 0 ? `További ${partly} részben. ` : ""}${
                  timeWindow
                    ? `A kijelölt időben (${windowLabel(timeWindow)}), a neked szóló és a nyitott szakkörökből.`
                    : "A neked szóló és a nyitott szakkörökből, a csoportjaid szerint."
                }`}
          </DialogDescription>
        </div>
        {switcher}
      </div>
      {ends && <DualNote ends={ends} />}
    </div>
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
        className="h-9 min-w-24 touch-target appearance-none rounded-full border border-input bg-background py-1 pr-8 pl-3 text-sm font-medium text-foreground outline-none transition-colors hover:bg-muted focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
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
  highlight,
  onRowHover,
}: {
  group: Group;
  fits: Map<string, ClubFitInfo> | null;
  startOpen: boolean;
  legend: boolean;
  //* A térképen épp megmutatott szakkör — a sora ugyanúgy kivilágosodik.
  highlight: string | null;
  onRowHover: (slug: string | null) => void;
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
                highlighted={highlight === club.slug}
                onHover={onRowHover}
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

//* Emlékeztetve: a térkép fölötti egérmozgás minden képkockán új kiemelést
//* küld, és ötven sor újrarajzolása ezt nem érdemli meg.
const ClubRow = memo(function ClubRow({
  club,
  fit,
  highlighted,
  onHover,
}: {
  club: ClubCardData;
  fit: ClubFitInfo | null;
  highlighted: boolean;
  onHover: (slug: string | null) => void;
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
      //* A sor fölött a térképen kigyúlnak a szakkör jelei (csak egérrel).
      onPointerEnter={(e) => e.pointerType === "mouse" && onHover(club.slug)}
      onPointerLeave={(e) => e.pointerType === "mouse" && onHover(null)}
      className={cn(
        "grid gap-x-8 gap-y-2.5 px-4 py-3.5 transition-colors hover:bg-muted/40 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none md:grid-cols-[minmax(0,1fr)_minmax(0,27rem)]",
        highlighted && "bg-muted/40",
      )}
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
              {fit?.slots[i] && (
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
});
