"use client";
import { hu } from "date-fns/locale/hu";
import {
  AlertTriangle,
  BellRing,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CloudOff,
  // ExternalLink, //! a szakmai portál linkjével együtt visszakapcsolni
  Info,
  Merge,
  Users,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  type TouchEvent as ReactTouchEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { flushSync } from "react-dom";
import {
  SHEET_POPOVER,
  SheetDisclosure,
  SheetDivider,
  SheetItemBody,
  SheetRow,
  SheetSection,
  sheetItem,
} from "@/components/chrome/chrome-sheet";
import { SITE_BAR_MAX, StandingLine } from "@/components/chrome/standing-line";
import { StaleNote } from "@/components/ma/day-status";
import { SiteFooterLinks } from "@/components/site-footer";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Kbd } from "@/components/ui/kbd";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";
import { DUAL_LABEL, type DualStatus, dualBlockLesson } from "@/lib/dualis";
import type {
  CalendarEvent,
  TimetableError as TimetableErrorInfo,
  TimetableLesson,
  TimetablePeriod,
  TimetableSubject,
  TimetableSubjectKind,
  TimetableView,
} from "@/lib/timetable";
import {
  buildTimetableView,
  describeTimetableFailure,
  groupHalf,
  periodsOfDay,
  SUBJECT_WORDS,
  saveCachedSubject,
  subjectStoreKey,
} from "@/lib/timetable";
import {
  type CachedWeek,
  loadWeekOrCached,
  type WeekLoad,
} from "@/lib/timetable-cache";
import {
  type GhostBlock,
  type LessonRun,
  type MergePreference,
  preferenceRows,
  preferencesHiding,
  resolveDay,
} from "@/lib/timetable-merge";
import { reportClassUse } from "@/lib/usage";
import { useHiddenMenu } from "@/lib/use-hidden-menu";
import { cn } from "@/lib/utils";
import { GlanceNote, GlanceToggle } from "./glance-controls";
import { EventCard, LessonBlock } from "./lesson-block";
import { type FocusTarget, LessonSheet } from "./lesson-sheet";
import { GhostCard, MergeButton } from "./merge-controls";
import { type AgendaItem, sortAgenda } from "./now";
import { NowRail } from "./now-rail";
import { PreferencesMenu } from "./preferences-menu";
import {
  addDaysKey,
  CELL_RADIUS,
  DAY_NAMES,
  DAY_SHORT,
  dateFromKey,
  dateToKey,
  EASE,
  focusIsNextWeek,
  focusMondayKey,
  minLabel,
  mondayKey,
  todayKey,
  weekLabel,
} from "./shared";
import { useMergePreferences } from "./use-merge-preferences";
import {
  focusMorph,
  supportsViewTransition,
  weekTransition,
} from "./view-transition";

//* Beágyazott nézetben a rács idő-arányos, fix léptékkel.
const EMBED_PX_PER_MIN = 1.45;
//! TELJES NÉZET: a lépték FIX, és tömör — nem a képernyő magasságából számolt.
//! A 45 perces tanóra ~68 px-re lapul: elfér benne a tantárgy, az időpont és a
//! terem/tanár, a rácson viszont több óra látszik egyszerre, kevesebbet kell
//! görgetni.
const FULL_PX_PER_MIN = 1.5;
//! A LEGKISEBB LÉPTÉK. A teljes nézet a napot a képernyő magasságához igazítja —
//! de csak addig, amíg a kártya még MOND is valamit. Fekvő telefonon (390 px
//! magas ablak) a „férjen ki" szabály 0,5 px/percet adna: a 45 perces óra 22 px,
//! a tantárgy neve elfogy, az idősáv számai egymásra csúsznak. Ez alatt a határ
//! alatt tehát nem zsugorítunk tovább — inkább görögjön a lap. A kiférés
//! kényelem, az olvashatóság feltétel.
const MIN_PX_PER_MIN = 1.05;
//! NYOMTATÁS: fix lépték, hogy a teljes tanítási nap kiférjen egy fekvő A4-re.
//! (500 perc × 1,15 ≈ 575 px ≈ 152 mm, a 190 mm-es szedéstükörbe a fejléccel
//! együtt is belefér.)
const PRINT_PX_PER_MIN = 1.15;
//* A ragadó idősáv szélessége (px) — a nap-oszlop szélessége ebből számol.
const GUTTER = 48;
//! A NAPOSZLOP OLVASHATÓ ALSÓ HATÁRA. Ez alatt a tantárgy neve két betűre
//! csonkul („k…", „n…"), vagyis a rács pont azt az adatot dobja el, amiért
//! egyáltalán ránéznek. A nézet ezért nem egy töréspontnál vált egy napról
//! ötre: ANNYI napot mutat, amennyi ilyen oszlop kifér.
const MIN_COL = 176;
//! A KÖVETKEZŐ NAP KIKANDIKÁLÁSA. Ha nem fér ki mind az öt nap, a csonka
//! hatodik oszlop mondja meg, hogy van tovább. Ez a görgethetőség egyetlen
//! őszinte jelzése — nyíl és pötty nélkül, és nem vesz el helyet a hét elől.
const PEEK = 28;
//! Telefonon MARAD az egy nap. Két 190 px-es oszlop elférne, de a telefonos
//! kérdés nem „milyen a hetem", hanem „hova megyek most": egy teljes szélességű
//! oszlopon a kártya kiírja a termet ÉS a tanárt is, és a nap-sáv a navigáció.
const ONE_DAY_MAX = 560;
//* Ennél szélesebb ablakon a rács már nem nő tovább, hanem középre áll: öt
//* oszlop 400 px fölött nem lesz olvashatóbb, csak üresebb.
//* A rács keretének és a fejlécsávnak UGYANAZ a legnagyobb szélessége — a `/ma`
//* sávja is ebből él (lásd `chrome/standing-line.tsx`), különben a váltó a két lapon más
//* x-en állna.
const MAX_SHELL = SITE_BAR_MAX;

//! ─── A HÉT VÉGE NEM FAL ──────────────────────────────────────────────────
//! Telefonon a napok egyetlen szalagon állnak, és a hüvelykujj végiglapozza
//! őket — péntekig, ahol eddig megállt a világ. Pedig péntek után hétfő jön:
//! aki a hetet olvassa, annak a héthatár ugyanolyan lépés, mint a napé, csak
//! az eszköztár nyilaival lehetett megtenni. A szalag SZÉLSŐ napján túlhúzva
//! ezért a rács rugalmasan enged, a keletkező résbe pedig belóg a szomszéd
//! hét szélső napja; elengedve az a nap jön be. Visszafelé ugyanez: a hétfőn
//! túlhúzva az előző hét péntekje.
//* A gumiszalag legnagyobb kitérése (px) — efölött a húzás már nem mozdít.
const EDGE_PULL_MAX = 92;
//* Ennyi kitérés fölött enged a hét: itt a mozdulat már szándék, nem rezzenés.
const EDGE_PULL_TRIGGER = 54;
//! AKTIVÁLÁSI KÜSZÖB. Ennyi elmozdulásig nem döntünk irányt: a függőleges
//! görgetés első képpontjai is hoznak pár képpont vízszintes elcsúszást, és
//! abból nem lehet hetet lapozni. A kitérés is innen indul, nem a koppintástól
//! — különben a rács azonnal megugrana az ujj alatt.
const EDGE_PULL_ACTIVATE = 10;
//! ENNYI FÜGGŐLEGES ELMOZDULÁS UTÁN MÁR NEM A MIÉNK a mozdulat. Az ujj menet
//! közben is elkanyarodhat: ilyenkor a hét visszaenged, és a lap görget tovább.
const EDGE_PULL_ABORT = 44;
//* A résbe belógó szomszéd nap sávjának szélessége (px).
const EDGE_HINT_WIDTH = 60;

//! ─── EGY MOZDULAT = EGY NAP ──────────────────────────────────────────────
//! A natív lendület nem tud lapozni. A `scroll-snap-stop: always` papíron pont
//! ezt ígéri — a kifutás nem szaladhat át tapadási ponton —, a mobil WebKit
//! viszont a SAJÁT lendülete közben átfut rajta: egy határozott pöccintés két-
//! három napot vitt, és a szomszéd napot csak óvatosan adagolt, apró
//! mozdulatokkal lehetett eltalálni. Pont az ellenkezője annak, amiért a
//! lapozás van.
//!
//! A vízszintes mozdulatot ezért MI visszük (lásd a `useEffect`-et lentebb): az
//! ujj alatt a rács egy napnyi ablakban mozog, a felengedés pedig egész napra
//! áll be. Lendület nincs, tehát túlfutás sincs. A tapadás CSS-ben MARAD —
//! egér, érintőpad, billentyű, átméretezés mind abból él —, csak a húzás
//! idejére engedjük el.
//! A NAPI LAPOZÁS ÉS A HÉTHATÁR UGYANANNÁL A KÉPPONTNÁL DÖNT. Külön küszöbbel
//! a kettő közötti sávban a lapozás már elmozdíthatná a rácsot, és a héthatár
//! utána MÁS görgetés-állásból nézné meg, a szélén állunk-e — vagyis a két
//! mozdulat egyszerre indulhatna el.
const PAGE_ACTIVATE = EDGE_PULL_ACTIVATE;
//* Az oszlop ekkora hányadát áthúzva jön a következő nap; alatta visszaáll.
const PAGE_COMMIT_RATIO = 0.28;
//! …VAGY ENNYINÉL GYORSABB PÖCCINTÉS (px/ms). A rövid, határozott mozdulat
//! ugyanúgy szándék, mint a lassú áthúzás — enélkül a pöccintés érződne
//! süketnek, és pont azt vennénk el, amiért az ember pöccint.
const PAGE_COMMIT_VELOCITY = 0.4;
//* A felengedés utáni beállás hossza (ms).
const PAGE_SETTLE_MS = 300;
//* Ennyi néma idő (ms) után a felengedés már nem pöccintés, csak elengedés.
const PAGE_FLICK_STALE = 90;
//! AZ EGY NAPOS ABLAKON TÚL A RÁCS TELÍTŐDVE ENGED. Ugyanaz a gumiszalag-
//! képlet, mint a héthatáron, csak rövidebb úton: a húzás így magától mondja
//! meg, hogy egy mozdulat egy napot visz — nem kell hozzá se ütközés, se
//! magyarázat.
const PAGE_RESIST_MAX = 44;
const pageResist = (over: number) =>
  PAGE_RESIST_MAX * (1 - Math.exp(-over / PAGE_RESIST_MAX));
//! MEDDIG ÉL AZ ELŐRE LEKÉRT HÉT. A szomszéd hetet a szélső napra érve
//! előre lekérjük, hogy a mozdulat ne hálózatot várjon — de az órarend menet
//! közben is változhat (helyettesítés, elmaradt óra), ezért a példány nem él
//! tovább pár percnél.
const WEEK_PREFETCH_TTL = 5 * 60_000;

//! A layout-effekt a szerveren nem futtatható (és figyelmeztet is): ott az
//! effekt-változat áll be, ami sosem fut le renderelés közben.
const useIsoLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

type Day = TimetableView["days"][number];

type LayoutItem = {
  key: string;
  startMin: number;
  endMin: number;
  lane: number;
  lanes: number;
  run?: LessonRun;
  event?: CalendarEvent;
  ghost?: GhostBlock;
};

//! ─── FÉL OSZLOP A CSOPORTBONTOTT ÓRÁNAK ────────────────────────────────────
//! Az egész osztályos óra és a csak egy csoportnak szóló óra eddig UGYANÚGY
//! nézett ki: mindkettő kitöltötte a nap oszlopát. A rács ezzel elhallgatta a
//! csoportbontás legfontosabb tényét — hogy az osztály fele nem ül ott. Ahol a
//! bontott órák egymásra estek, a sávozás véletlenül megmutatta; ahol csak az
//! egyik csoportnak van órája (szerda első óra), ott semmi nem jelezte.
//!
//! A forrás `groupColumn`/`groupCount` párosa mondja meg, hányadik csoporté a
//! kártya (lásd `groupHalf`) — ebből lesz a fél oszlop ÉS az oldala. Az oldal
//! nem esztétika: attól olvasható a rács, hogy ugyanaz a csoport minden nap
//! ugyanott van, és a szemközti üres fél mindig ugyanazt jelenti.
type SideItem = { startMin: number; endMin: number };

//! AZ ÖSSZEVONT ÓRA VISSZAKAPJA A TELJES OSZLOPOT. A fél oszlop azt mondja ki,
//! hogy a szemközti fél MÁSÉ — ott a másik csoport órája áll, vagy állhatna. Ha
//! viszont a diák már összevonta az ütközést (`run.hidden` nem üres), a másik
//! csoport órája ELDÖNTÖTTEN nincs a rácson: a fél kártya mellett üres fél
//! marad, ami semmit nem jelent, csak elveszi a felét a helynek, amiben a terem
//! és a tanár is elférne. Az összevont óra ezért teljes szélességű.
const FULL = "full" as const;

type ItemSide = 0 | 1 | typeof FULL | null;

function itemSide(it: LayoutItem): ItemSide {
  if (it.run) {
    return it.run.hidden.length > 0 ? FULL : groupHalf(it.run.lesson);
  }
  //* A rejtett sáv szellemkártyája ugyanannyi helyet kap, mint az óra, amit
  //* eltakar — de csak akkor, ha minden benne rejlő óra ugyanazé a csoporté.
  if (it.ghost) {
    const halves = it.ghost.hidden.map((o) => groupHalf(o.lesson));
    const first = halves[0] ?? null;
    return first !== null && halves.every((h) => h === first) ? first : null;
  }
  return null;
}

function overlapping(a: SideItem, b: SideItem): boolean {
  return a.startMin < b.endMin && b.startMin < a.endMin;
}

//* Sikerül-e a klasztert a csoport-oldalak szerint kiosztani. Csak akkor, ha
//* MINDEN elemnek van oldala, és egy oldalon belül semmi nem fedi egymást —
//* különben a fél oszlop kártyákat takarna el, ami rosszabb a teljesnél. A
//* teljes oszlopot kérő (összevont) kártya senkivel nem fedhet át: ha mégis
//* van mellette óra, marad a sávozás, mert az mindkettőt megmutatja.
function assignBySide(cluster: LayoutItem[]): boolean {
  const sides = cluster.map(itemSide);
  if (sides.some((side) => side === null)) return false;
  for (let i = 0; i < cluster.length; i++) {
    for (let j = i + 1; j < cluster.length; j++) {
      if (!overlapping(cluster[i], cluster[j])) continue;
      if (sides[i] === sides[j] || sides[i] === FULL || sides[j] === FULL) {
        return false;
      }
    }
  }
  cluster.forEach((it, i) => {
    const side = sides[i];
    it.lane = side === FULL ? 0 : (side as number);
    it.lanes = side === FULL ? 1 : 2;
  });
  return true;
}

//* Napon belüli elrendezés: az időben átfedő elemek sávokra bomlanak.
function layoutDay(
  runs: LessonRun[],
  ghosts: GhostBlock[],
  events: CalendarEvent[],
): LayoutItem[] {
  const items: LayoutItem[] = [
    ...runs.map((r) => ({
      key: r.key,
      startMin: r.startMin,
      endMin: r.endMin,
      lane: 0,
      lanes: 1,
      run: r,
    })),
    ...ghosts.map((g) => ({
      key: g.key,
      startMin: g.startMin,
      endMin: g.endMin,
      lane: 0,
      lanes: 1,
      ghost: g,
    })),
    ...events.map((e) => ({
      key: `event-${e.id}`,
      startMin: e.startMin,
      endMin: e.endMin,
      lane: 0,
      lanes: 1,
      event: e,
    })),
  ].sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);

  //* Összefüggő átfedési klaszterek: egy klaszteren belül osztjuk sávokra a szélességet.
  let cluster: LayoutItem[] = [];
  let clusterEnd = -1;
  const flush = () => {
    //! ELŐBB A CSOPORT-OLDAL, csak utána a szabad helykeresés. Egyetlen bontott
    //! óra is így kap fél oszlopot (egyelemű klaszter), a két egymásra eső
    //! csoport pedig mindig ugyanabban a sorrendben áll — nem aszerint, melyik
    //! kezdődött előbb.
    if (assignBySide(cluster)) {
      cluster = [];
      return;
    }
    const laneEnds: number[] = [];
    for (const it of cluster) {
      let lane = laneEnds.findIndex((end) => end <= it.startMin);
      if (lane === -1) {
        lane = laneEnds.length;
        laneEnds.push(it.endMin);
      } else {
        laneEnds[lane] = it.endMin;
      }
      it.lane = lane;
    }
    for (const it of cluster) it.lanes = laneEnds.length;
    cluster = [];
  };

  for (const it of items) {
    if (cluster.length > 0 && it.startMin >= clusterEnd) flush();
    cluster.push(it);
    clusterEnd = Math.max(clusterEnd, it.endMin);
  }
  flush();

  return items;
}

//* ---------------------------------------------------------------------------
//* Az üres hét felirata
//* ---------------------------------------------------------------------------
//! ÜRES HÉT: MONDJUK KI AZ OKÁT, HA TUDJUK. A felirat eddig egyetlen
//! találgatás volt („szünet?") — mert a kártyák válaszából tényleg nem derül
//! ki. A tanév rendje viszont megmondja: ha a hét MINDEN napja tanítás nélküli,
//! akkor az a hét nem hiányos, hanem szünet, és rendszerint a nevét is tudjuk.
//! Ha viszont van tanítási nap, a „szünet?" kérdőjel HAMIS lenne — ott az
//! adathiány marad a hír.
function weekPlanLabel(days: Day[]): string {
  const known = days.filter((d) => d.teaching !== null);
  if (known.length === 0) return "Erre a hétre nincs órarendi adat (szünet?).";
  if (known.some((d) => d.teaching)) return "Erre a hétre nincs órarendi adat.";

  //* A szünet nevét a napok többsége viseli („Őszi szünet"); az egy napra szóló
  //* bejegyzés (egy ünnep neve) nem a hétről szól.
  const counts = new Map<string, number>();
  for (const day of known) {
    for (const note of new Set(day.notes)) {
      counts.set(note, (counts.get(note) ?? 0) + 1);
    }
  }
  const common = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  return common && common[1] >= 2
    ? `${common[0]} — ezen a héten nincs tanítás.`
    : "Ezen a héten nincs tanítás.";
}

//* ---------------------------------------------------------------------------
//* A NAP BEJEGYZÉSEI — EGY IKON MÖGÖTT
//* ---------------------------------------------------------------------------
//! A TANÉV RENDJE NEM FÉR BELE A FEJLÉCBE, ÉS NEM IS OTT A HELYE. A napra
//! kiírt bejegyzés egy-két teljes mondat („Szóbeli vizsgák kezdete az
//! általános felvételi eljárás keretében (Pontos időpont behívás alapján)") —
//! egy 176 px-es oszlopban ebből három szó látszik, a többi elvész, a rács
//! fejléce viszont minden nap magasabb lesz tőle. Egy ikon ellenben ANNYIT
//! mond, amennyit tud: „ezen a napon van bejegyzés", és a teljes szöveget
//! kattintásra adja — csonkítatlanul, ahogy az iskola írta.
//!
//! CSAK OTT VAN, AHOL VAN MIT MONDANI: a napok többségén nincs bejegyzés, és
//! ott a fejléc pontosan úgy néz ki, mint eddig.
function DayNotesButton({ day }: { day: Day }) {
  //* A tanítás hiánya a nap legfontosabb bejegyzése — a jegyzet rendszerint
  //* csak az OKA („Őszi szünet"), ezért a tény megy elöl.
  const lines =
    day.teaching === false ? ["Nincs tanítás", ...day.notes] : day.notes;
  if (lines.length === 0) return null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`${day.name} ${day.dateLabel} — a tanév rendjéből`}
          title={lines.join("\n")}
          className={cn(
            //* Papíron egy megnyithatatlan ikon csak zaj — a kinyomtatott hét
            //* a rácsért készül, nem a vezérlőkért.
            "absolute right-0.5 top-1.5 rounded-full p-1 transition-colors print:hidden",
            "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring motion-reduce:transition-none",
            day.teaching === false
              ? "text-muted-strong hover:text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Info className="size-3.5" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent align="center" className="w-[16rem] p-3">
        <p className="text-sm font-semibold text-foreground">
          {day.name} · {day.dateLabel}
        </p>
        {/*//* A forrás mondatai, vágatlanul — se rövidítve, se átfogalmazva. */}
        <ul className="mt-1.5 space-y-1 text-pretty text-xs text-muted-strong">
          {/* Kulcs: a sorszám is kell — két bejegyzés szövege egyezhet. */}
          {lines.map((line, i) => (
            <li key={`${i}-${line}`}>{line}</li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

//* ---------------------------------------------------------------------------
//* A nap körülménye telefonon — EGY SOR, MINDIG UGYANANNYI
//* ---------------------------------------------------------------------------
//! EZ A SOR A RÁCS FÖLÖTT ÁLL, TEHÁT A MAGASSÁGA A RÁCS HELYE. Amíg a tartalma
//! szabta meg, hányad soros, addig a hét öt napja öt KÜLÖNBÖZŐ magas fejlécet
//! adott — mérve 105 és 162 képpont között —, és a napok közti lapozás minden
//! húzásnál 57 képponttal rántotta függőlegesen a rácsot az ujj alatt. Ez volt
//! a lapozás „olcsó" érzete: nem a görgetés akadt meg, hanem a tartalom ugrált
//! alatta.
//!
//! MOSTANTÓL A SOR MAGASSÁGA ÁLLANDÓ, ÉS A LÉTE IS. Ezt a `day-status.tsx`
//! `ChangeRow`-ja már kimondta a `/ma`-n: ha egy sor csak akkor van ott, amikor
//! baj van, akkor a hiánya nem mond semmit. Itt ugyanaz a szabály — a sor
//! MINDIG ott van, a hangneme és a szövege vált, nem a léte —, és ráadásul ez
//! az egyetlen alak, amiben a rács teteje nem mozdul lapozás közben.
//!
//! AMI NEM FÉR KI, AZ NEM VESZIK EL. A tanév rendje egész mondatokban beszél;
//! egy sorban ebből a fele látszik. A teljes lista koppintásra nyílik — ugyanaz
//! a buborék, amit az asztali fejléc `DayNotesButton`-ja ad, ugyanazzal a
//! vágatlan szöveggel.
function DayCircumstance({ day }: { day: Day | undefined }) {
  //* Sorrend: a tény („nincs tanítás"), aztán az eltérő csengetés, aztán a
  //* tanév rendje — ez a fontossági sorrend, és ez látszik a csonkolás előtt.
  const parts = day
    ? ([
        day.teaching === false ? "Nincs tanítás" : null,
        day.bells ? `Csengetés: ${day.bells.name}` : null,
        ...day.notes,
      ].filter(Boolean) as string[])
    : [];

  //* A doboz mindkét ágban PONTOSAN ugyanaz — ezen múlik az állandó magasság.
  const box =
    "flex h-[24px] shrink-0 items-center gap-1.5 border-b border-border px-3 text-[11px] leading-[1.45] print:hidden";

  if (!day || parts.length === 0) {
    return (
      //* A hangsúly a `ChangeRow`-éval egyezik: halvány pipa, olvasható szöveg.
      <p className={cn(box, "text-muted-strong")}>
        <Check className="size-3 shrink-0 text-muted-foreground" aria-hidden />
        <span className="min-w-0 flex-1 truncate">Nincs külön tudnivaló</span>
      </p>
    );
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          title={parts.join("\n")}
          className={cn(
            box,
            "w-full text-left transition-colors",
            "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none",
            day.bells
              ? "text-brand hover:bg-brand/10"
              : "text-muted-strong hover:bg-muted/40",
          )}
        >
          {day.bells ? (
            <BellRing className="size-3 shrink-0" aria-hidden />
          ) : (
            <Info className="size-3 shrink-0" aria-hidden />
          )}
          <span className="min-w-0 flex-1 truncate">{parts.join(" · ")}</span>
          {/*//* Csak akkor ígér többet, ha tényleg van több mondanivaló — és
              //* csak a szemnek: a teljes szöveg amúgy is a gomb neve. */}
          {parts.length > 1 && (
            <span
              className="shrink-0 tabular-nums text-muted-strong"
              aria-hidden
            >
              +{parts.length - 1}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[18rem] p-3">
        <p className="text-sm font-semibold text-foreground">
          {day.name} · {day.dateLabel}
        </p>
        {/*//* A forrás mondatai, vágatlanul — se rövidítve, se átfogalmazva. */}
        <ul className="mt-1.5 space-y-1 text-pretty text-xs text-muted-strong">
          {parts.map((line, i) => (
            <li key={`${i}-${line}`}>{line}</li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

//* ---------------------------------------------------------------------------
//* A szomszéd hét szélső napja a héthatáron
//* ---------------------------------------------------------------------------
//! NEM JELZÉS ÉS NEM BUBORÉK: EZ A NAP, AHOVA A MOZDULAT VISZ. Ott áll, ahol a
//! szalag folytatódna, és pontosan annyit mozdul, amennyit a rács enged — így
//! nem „megjelenik", hanem BEJÖN, mint a következő oszlop. Ki is van írva,
//! melyik nap és mikor: a diák a mozdulat közben dönti el, hogy tényleg oda
//! akar-e menni, és a félbehagyott húzással vissza is megy vele.
//*
//* A helyzetét és az átlátszóságát a mozdulat írja (lásd „A HÉTHATÁR
//* ÁTHÚZÁSA"), ezért a nyugalmi állapot itt is stílusban van: a kereten kívül,
//* láthatatlanul.
function WeekEdgeHint({
  ref,
  side,
  dayShort,
  dateLabel,
}: {
  ref: React.Ref<HTMLDivElement>;
  side: "prev" | "next";
  dayShort: string;
  dateLabel: string;
}) {
  const Chevron = side === "next" ? ChevronRight : ChevronLeft;
  return (
    <div
      ref={ref}
      aria-hidden
      //* `group`: a „már elenged" állapotot a mozdulat a külső elemre írja
      //* (`data-armed`), a színek pedig belül követik.
      //! A VISSZAFELÉ ÁLLÓ SÁV AZ IDŐSÁV MÖGÜL BÚJIK ELŐ (`z-10`, a `z-20`-as
      //! idősáv alatt), és nem a keret szélétől, hanem az idősáv MELLŐL indul:
      //! a napok is ott kezdődnek, tehát a szomszéd nap is onnan jöhet. Előre
      //! haladva nincs mi mögé bújni — az a sáv a keret jobb széléről érkezik.
      className={cn(
        "group pointer-events-none absolute inset-y-0 flex flex-col items-center gap-1 border-border bg-card pt-3 print:hidden",
        side === "next" ? "right-0 z-30 border-l" : "z-10 border-r",
      )}
      style={{
        width: EDGE_HINT_WIDTH,
        left: side === "prev" ? GUTTER : undefined,
        transform: `translateX(${side === "next" ? EDGE_HINT_WIDTH : -EDGE_HINT_WIDTH}px)`,
        opacity: 0,
      }}
    >
      <span className="text-[13px] font-semibold leading-tight text-muted-strong transition-colors group-data-[armed=true]:text-foreground">
        {dayShort}
      </span>
      <span className="text-[10px] leading-tight tabular-nums text-muted-foreground">
        {dateLabel}
      </span>
      <Chevron className="mt-1 size-4 text-muted-foreground/70 transition-colors group-data-[armed=true]:text-primary" />
    </div>
  );
}

//* A szomszéd nap dátuma a nap-sávban megszokott alakban („09.15.").
function edgeDateLabel(dateKey: string): string {
  return `${dateKey.slice(5).replace("-", ".")}.`;
}

//* ---------------------------------------------------------------------------
//* Nap-fejléc cellája
//* ---------------------------------------------------------------------------
//! Lapozós módban a cella GOMB: ha a hétnek csak egy része látszik, a fejléc a
//! leggyorsabb út a péntekhez — ugyanaz a mozdulat, amit a nap-sáv ad egy nap
//! esetén. Ahol viszont az egész hét kifér, ott nincs hova ugrani: ott sima
//! felirat, mert a semmit nem csináló gomb rosszabb, mint a szöveg.
function DayHeadCell({
  day,
  style,
  paging,
  onJump,
  dualStatus,
}: {
  day: Day;
  style?: React.CSSProperties;
  paging: boolean;
  onJump?: () => void;
  //* Csak a duális lapon van megadva — az órarendi nézet fejléce változatlan.
  dualStatus?: DualStatus;
}) {
  const inner = (
    <>
      <div
        className={cn(
          "text-sm font-semibold",
          day.isToday ? "text-primary" : "text-foreground",
        )}
      >
        {day.name}
      </div>
      <div
        className={cn(
          "text-xs tabular-nums",
          day.isToday ? "font-medium text-primary/80" : "text-muted-strong",
        )}
      >
        {day.dateLabel}
      </div>
      {/*//! A JELÖLŐ MINDKÉT ÁLLAPOTOT KIÍRJA, nem csak a duálisat. Egy csak a
          //! duális napokon megjelenő jelvénynél a hiányzó jelvény kétértelmű
          //! lenne: „iskolai nap” vagy „még nincs adat”? Így a fejléc minden
          //! tanítási napról állít valamit. */}
      {dualStatus && (
        <div
          className={cn(
            "mt-1 rounded-[5px] px-1 py-px text-[10px] font-semibold leading-[1.4]",
            dualStatus === "dual"
              ? "bg-primary/15 text-primary"
              : dualStatus === "school"
                ? "bg-muted text-muted-strong"
                : "text-muted-foreground/60",
          )}
        >
          {DUAL_LABEL[dualStatus]}
        </div>
      )}
      {/*//! A CSENGETÉS VISZONT MARAD KIÍRVA. Nem jegyzet, hanem a nap
          //! szerkezete: ettől kezdődik máskor minden óra, és a rács vonalai is
          //! ezért futnak máshol ebben az oszlopban. Ezt egy ikon mögé rejteni
          //! annyi lenne, mint az eltérést elhallgatni. */}
      {day.bells && (
        <div
          title={`Csengetési rend ezen a napon: ${day.bells.name}`}
          className="mt-1 flex items-center justify-center gap-1 rounded-[5px] bg-brand/12 px-1 py-px text-[10px] font-semibold leading-[1.4] text-brand"
        >
          <BellRing className="size-2.5 shrink-0" aria-hidden />
          <span className="truncate">{day.bells.name}</span>
        </div>
      )}
      {day.isToday && (
        <span
          className="absolute inset-x-0 bottom-0 h-0.5 bg-primary"
          aria-hidden
        />
      )}
    </>
  );
  //! A KERET ÉS A TARTALOM KÜLÖNVÁLIK. Lapozós módban a cella maga a gomb volt
  //! — csakhogy a bejegyzések ikonja is gomb, és gomb gombban érvénytelen HTML
  //! (a böngésző szétszedi, a billentyűzetes bejárás elromlik). A szélességet és
  //! a keretet ezért a burkoló viszi, a kitöltést és a kattintást a tartalom, az
  //! ikon pedig a kettő MELLETT, a burkoló sarkában ül.
  const frame = cn(
    "relative min-w-0 border-l border-border/70",
    paging ? "shrink-0" : "flex-1 shrink",
    day.isToday && "bg-primary/[0.06]",
  );
  const pad = "px-2 py-2.5 text-center";
  return (
    <div className={frame} style={style}>
      {paging ? (
        <button
          type="button"
          onClick={onJump}
          aria-label={`Ugrás ide: ${day.name} ${day.dateLabel}`}
          className={cn(
            pad,
            "block w-full transition-colors hover:bg-muted/50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none",
          )}
        >
          {inner}
        </button>
      ) : (
        <div className={pad}>{inner}</div>
      )}
      <DayNotesButton day={day} />
    </div>
  );
}

//* A szűretlen nézet „döntései": egy állandó üres lista, hogy a feloldás
//* memója ne kapjon minden renderben új azonosságot.
const NO_PREFS: MergePreference[] = [];

export function TimetableCalendar({
  initialView,
  mode = "class",
  subjects,
  subjectsError,
  variant = "embedded",
  heading,
  trailing,
  dualStatusForDay,
  dualSetup,
  notifySetup,
  calendarSetup,
  initialStale = null,
}: {
  initialView: TimetableView;
  //! UGYANAZ A RÁCS KÉT KÉRDÉSRE. „Melyik osztály hol van" és „a tanárnak hol
  //! kell lennie" ugyanabból az adatból, ugyanazzal a rajzolással válaszolható
  //! meg — a különbség a FELIRATOKBAN, a VÁLASZTÓ listájában és abban van,
  //! melyik tárolóhoz tartoznak a beállítások. Ezért nincs második naptár:
  //! egy másolat előbb-utóbb máshogy rajzolná ugyanazt a hetet.
  mode?: TimetableSubjectKind;
  /** A választó listája: osztályok vagy tanárok, a `mode`-nak megfelelően. */
  subjects: TimetableSubject[];
  //* Ha a lista sem jött meg, a választó üres — a „válassz osztályt/tanárt”
  //* felszólítás ilyenkor félrevezető, ezért a lista hibáját is átvesszük.
  subjectsError?: TimetableErrorInfo;
  //* `fullscreen` a /orarend lapé: a rács kitölti a képernyőt, mobilon
  //* naponként lapozható. `embedded` az /event kártyáé.
  variant?: "embedded" | "fullscreen";
  //! A TELJES NÉZET ESZKÖZTÁRA A LAP FEJLÉCE IS. A `/orarend` 100dvh-s: minden
  //! képpont, amit a cím és a leírás elvesz, a rácstól megy. A lap ezért nem
  //! saját fejlécet rajzol, hanem BEADJA ide a címét (`heading`) és a jobb
  //! szélre kerülő hívását (`trailing`) — egyetlen sáv lesz belőle.
  //* Beágyazva egyik sincs átadva, így az /event kártyája változatlan.
  heading?: React.ReactNode;
  trailing?: React.ReactNode;
  //! DUÁLIS JELÖLÉS — DE A SZABÁLYT NEM A RÁCS ISMERI. Az `/orarend` a diák
  //! SAJÁT, kézzel beállított beosztását mutatja (`dualStatusFor`), és a
  //! szabály laponként más lehet. A rács ezért nem dönt, hanem KÉRDEZ — napra, a hét
  //! A/B-jelölésével és az ÉPPEN nézett osztállyal, mert a beosztás
  //! osztályonként külön van. `undefined` válasz = ezen a lapon (vagy ennél az
  //! osztálynál) nincs duális jelölés: a rács pontosan úgy néz ki, mint eddig.
  dualStatusForDay?: (day: {
    dayOfWeek: number;
    weekLetter: string;
    subjectShort: string;
  }) => DualStatus | undefined;
  //! A BEÁLLÍTÓ IS A SÁVBAN LAKIK, DE NEM A RÁCS TALÁLJA KI. Ugyanaz a határ,
  //! mint a `dualStatusForDay`-nél: a rács csak azt tudja, MELYIK osztály
  //! MELYIK hetét nézik éppen — a beosztás tárolása és a párbeszéd a lapé.
  //! Ezért nem komponenst kap, hanem egy hívást, amit a nézett osztállyal és
  //! héttel kérdez meg; ami nem ad vissza semmit, annál a sáv változatlan.
  dualSetup?: (ctx: {
    subjectShort: string;
    weekLetter: string;
  }) => React.ReactNode;
  //! AZ ÉRTESÍTÉS-HARANG UGYANEZEN A HATÁRON ÁLL. A rács azt tudja, MELYIK
  //! osztály órarendjét nézik éppen — a feliratkozás, az engedélykérés és a
  //! párbeszéd viszont a lapé (`components/pwa/notification-menu.tsx`). Ezért
  //! itt is hívás, nem komponens; ami nem ad vissza semmit, annál a sáv
  //! változatlan.
  notifySetup?: (ctx: { subjectShort: string }) => React.ReactNode;
  //! A NAPTÁR-FELIRATKOZÁS UGYANEZEN A HATÁRON ÁLL, EGY KÜLÖNBSÉGGEL: ITT A
  //! DÖNTÉSEKET IS ÁTADJUK. A feednek pontosan azt kell mutatnia, amit a rács —
  //! és a döntések listája ITT él (`useMergePreferences`), nem a lapon. A
  //! duális beosztást és a hálózati hívást viszont a lap intézi; ezért a rács a
  //! döntéseket ADJA, nem értelmezi.
  calendarSetup?: (ctx: {
    subjectShort: string;
    prefs: MergePreference[];
  }) => React.ReactNode;
  //! AZ ELSŐ HÉT IS JÖHET A MENTETT PÉLDÁNYBÓL. Az `initialView`-t a lap tölti
  //! be (`/orarend`), tehát csak Ő tudja, hálózatból jött-e vagy a készülékről
  //! — a rács enélkül elhallgatná a legelső, hidegen megnyitott hét korát.
  initialStale?: CachedWeek | null;
}) {
  const [view, setView] = useState<TimetableView>(initialView);
  //! HONNAN VAN AZ ÉPPEN MUTATOTT HÉT. Nem `null` = a készüléken tárolt
  //! példányból, mert a forrás nem volt elérhető. A rács ezt KIÍRJA: egy régi
  //! órarendet igazként mutatni rosszabb, mint hibát mutatni.
  const [stale, setStale] = useState<CachedWeek | null>(initialStale);

  //! ─── A LAP MOST MÁR MENET KÖZBEN IS SZÓLHAT ────────────────────────────────
  //! EZ AZ ÁLLAPOT EDDIG EGYSZER, A BELÉPÉSKOR VETTE ÁT A `initialStale`-t — és
  //! ez helyes is volt, amíg a lap CSAK KÉSZ nézettel léptette be a rácsot: a
  //! `TimetablePage` megvárta a hálózatot, tehát mire idáig jutottunk, már
  //! eldőlt, mentett-e a hét.
  //!
  //! MOSTANTÓL NEM ÍGY ÉRKEZIK. A lap a készüléken tárolt hetet AZONNAL
  //! kirajzolja, és a frisset alatta cseréli ki — vagyis a `initialStale`
  //! ÉLETBEN VÁLTOZIK: előbb a mentett példány, majd `null`, amikor a friss
  //! adat megjött. A kezdőérték ezt nem vette észre, és a rács azután is azt
  //! írta ki, hogy „mentett órarend", hogy már a friss hetet mutatta —
  //! ráadásul a mentett állapothoz tartozó újrapróbáló figyelők is fent
  //! maradtak, örökre.
  //*
  //! A PROP VÁLTOZÁSÁT KÖVETJÜK, NEM A PROPOT MAGÁT. A rács a saját lapozásán
  //! is állítja ezt az állapotot (`load`), és azt egy vak szinkron eltörölné.
  //! Ezért csak akkor nyúlunk hozzá, ha a KÜLDÖTT érték tényleg más lett, mint
  //! amit legutóbb küldtek.
  const sentStale = useRef(initialStale);
  useEffect(() => {
    if (sentStale.current === initialStale) return;
    sentStale.current = initialStale;
    setStale(initialStale);
  }, [initialStale]);
  const [selectedSubject, setSelectedSubject] = useState<string>(
    initialView.subject?.short ?? "",
  );
  //! A betöltés jelzése SAJÁT állapot, nem `useTransition`: a nézet cseréjét a
  //! View Transition visszahívásában, `flushSync`-kel kell elkötni (különben a
  //! böngésző a RÉGI DOM-ról készítené az „új" pillanatképet), és a `flushSync`
  //! nem futhat React-tranzakción belül. A látható viselkedés ugyanaz.
  const [pending, setPending] = useState(false);
  const reduce = useReducedMotion();
  //! A belépő animáció csak kliens-oldali hét-/osztályváltásnál fusson. Az első
  //! (SSR) render mindig látható legyen — különben JS nélkül üres maradna a rács.
  const [animateGrid, setAnimateGrid] = useState(false);
  //* Órarendi kiemelés: a hoverelt tantárgy órái kiemelve maradnak, a többi tompul.
  const [hoveredSubject, setHoveredSubject] = useState<string | null>(null);
  const fullscreen = variant === "fullscreen";

  //! A View Transitions API megléte csak a KLIENSEN dönthető el, ezért effektben
  //! állítjuk be: a szerver-HTML és az első render mindig az „nincs" ágon megy,
  //! így nincs hidratálási eltérés.
  const [canMorph, setCanMorph] = useState(false);
  useEffect(() => {
    setCanMorph(fullscreen && !reduce && supportsViewTransition());
  }, [fullscreen, reduce]);

  //* A megnyitott kártya részletlapja (csak teljes nézetben).
  const [focus, setFocus] = useState<FocusTarget | null>(null);
  //! A morfhoz a kártya VALÓDI DOM-eleme kell — a névátadás nem megy React
  //! attribútummal, mert a régi és az új pillanatkép KÖZÖTT kell megtörténnie.
  const cardRefs = useRef(new Map<string, HTMLElement>());
  const registerCard = useCallback((key: string, el: HTMLElement | null) => {
    if (el) cardRefs.current.set(key, el);
    else cardRefs.current.delete(key);
  }, []);

  const subjectShort = view.subject?.short ?? "";
  const words = SUBJECT_WORDS[mode];
  //! A HELYI TÁROLÓK KULCSA NEM AZ ALANY JELE, HANEM A NÉVTERES VÁLTOZATA. A
  //! heti pillanatkép, az összevonási döntések és (a lapon át) a duális
  //! beosztás mind egy szöveges kulcson ülnek — ha a tanári lap a puszta `AA`
  //! jelet írná be, egy jövőbeli, azonos nevű alany ráírna. Lásd
  //! `subjectStoreKey`.
  const storeKey = subjectStoreKey(mode, subjectShort);

  //! MELYIK OSZTÁLYT NÉZIK — ÉS SEMMI MÁST. Osztályonként és naponta egyszer
  //! eszközönként (a deduplikáció a `reportClassUse`-ban van).
  //*
  //! A TANÁRT NEM MÉRJÜK. A használati statisztika arra a kérdésre válaszol,
  //! hány diák nézi egy OSZTÁLY órarendjét (`/statisztika`); egy 88 fős tanári
  //! kar rövid jelei ott nem adatok, hanem személyek — és a végpont sem
  //! fogadná el őket (lásd `known-class.ts`).
  useEffect(() => {
    if (mode !== "class") return;
    reportClassUse(subjectShort);
  }, [mode, subjectShort]);

  const prefsApi = useMergePreferences({
    storeKey,
  });
  const { prefs, choose, hide, undo, undoMany, reset } = prefsApi;

  //* Melyik sorokat hagyta meg a diák a fejléc lapjában — a szűrés ott
  //* történik, ahol a sor születik (lásd `lib/use-hidden-menu.ts`).
  const menu = useHiddenMenu();

  //* Aktuális perc (a "most" vonalhoz) — csak a kliensen, hydration-biztosan.
  const [nowMin, setNowMin] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => {
      const d = new Date();
      setNowMin(d.getHours() * 60 + d.getMinutes());
    };
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, []);

  //! ─── EGY HÉT LEKÉRÉSE — ELŐRE IS ────────────────────────────────────────
  //! A héthatáron áthúzott mozdulat akkor EGY SZALAG, ha a következő hét már
  //! ott van, mire az ujj elengedi. A szomszéd hetet ezért a szélső napra érve
  //! előre lekérjük (lásd lentebb), és a lapozás ugyanezt az ígéretet találja
  //! itt: nem hálózatot vár, csak kirajzol.
  const weekCache = useRef(
    new Map<string, { at: number; view: Promise<WeekLoad> }>(),
  );
  const requestWeek = useCallback(
    (cls: string, week: string): Promise<WeekLoad> => {
      const key = `${mode}|${cls}|${week}`;
      const cached = weekCache.current.get(key);
      if (cached && Date.now() - cached.at < WEEK_PREFETCH_TTL) {
        return cached.view;
      }
      //! A MENTETT HÉT UGYANEZEN AZ ÚTON JÖN. Hálózat nélkül a
      //! `buildTimetableView` nevesített hibát ad, a készüléken viszont ott
      //! lehet ugyanennek a hétnek a legutóbbi példánya — a `/ma` mindig is
      //! abból rajzolt, a rács pedig hibát mutatott. A döntést a
      //! `loadWeekOrCached` hozza (lásd `lib/timetable-cache.ts`).
      const view = loadWeekOrCached(subjectStoreKey(mode, cls), week, () =>
        buildTimetableView({
          kind: mode,
          userClass: cls || null,
          weekStart: week,
          classOverride: cls || undefined,
        }),
      ).then((res) => {
        //! A HIBÁS VÁLASZT NEM TESSZÜK EL. A `buildTimetableView` a hálózati
        //! hibát is nevesített nézetként adja vissza — eltéve az „Újra" gomb
        //! ugyanazt a hibát kapná meg, hálózat nélkül, örökre.
        //! A MENTETT HETET SEM: az „Újra" pont attól ér valamit, hogy a
        //! visszatérő hálózatot MEGPRÓBÁLJA, nem a percekkel korábbi
        //! pillanatképet adja vissza másodszor is.
        if (!res.view.ok || res.cached) weekCache.current.delete(key);
        return res;
      });
      //* A kivétel a hívónál csapódik le (`load`); itt csak azért kezeljük le,
      //* hogy az előre kérésből ne legyen gazdátlan elutasítás.
      view.catch(() => weekCache.current.delete(key));
      weekCache.current.set(key, { at: Date.now(), view });
      //* A szomszédoknál többet nincs értelme tartani.
      if (weekCache.current.size > 4) {
        const oldest = weekCache.current.keys().next().value;
        if (oldest !== undefined) weekCache.current.delete(oldest);
      }
      return view;
    },
    [mode],
  );

  //* A héthatáron átérkező hét igazítása (lásd `landRef.current` lentebb, a
  //* görgetődoboz mellett) — a `load` már itt hivatkozik rá.
  const landRef = useRef<(edge: "start" | "end") => void>(() => {});

  //! A LAPOZÁS IRÁNYA vizuális információ: a rács arra csúszik ki, amerre mész.
  //! Osztályváltásnál nincs irány (`null`) — ott a rács tartalma cserélődik, nem
  //! a helye, tehát áttűnés a helyes mozdulat.
  const load = async (
    nextWeek: string,
    classOverride?: string,
    dir: "next" | "prev" | null = null,
    //! HOVA ÉRKEZZEN a hét vízszintesen. A nyilak és a naptár a hét TARTALMÁT
    //! cserélik — ott a görgetés ott marad, ahol volt (`null`), különben a
    //! csütörtököt néző diák minden lapozásnál a hétfőn kötne ki. A héthatáron
    //! áthúzott mozdulat viszont EGY NAPOT lép: péntek után a következő hét
    //! HÉTFŐJE jön, nem az öt nappal odébb eső péntekje.
    land: "start" | "end" | null = null,
  ) => {
    const cls = classOverride ?? selectedSubject;
    setAnimateGrid(true);
    setPending(true);
    try {
      const { view: res, cached } = await requestWeek(cls, nextWeek);
      const next = res.subject?.short ?? cls;
      weekTransition(
        () => {
          setView(res);
          setStale(cached);
          setSelectedSubject(next);
        },
        {
          enabled: canMorph,
          dir,
          after: land ? () => landRef.current(land) : undefined,
        },
      );
      //* A választást csak SIKERES betöltés után jegyezzük meg, hogy a
      //* következő megnyitás ne a `PUBLIC_DEFAULT_CLASS`-ra essen vissza.
      if (next) saveCachedSubject(mode, next);
    } catch (err) {
      //! Ide csak akkor jutunk, ha maga a betöltés dobott (a hálózati hibákat
      //! a `buildTimetableView` már nevesítve adja vissza) — a kivétel fajtáját
      //! itt sem dobjuk el, mert ez mondja meg, kinél van a hiba.
      setView((w) => ({
        ...w,
        ok: false,
        error: describeTimetableFailure(err),
      }));
      //* A hibaüzenet fölött nincs mit „régiként" jelölni.
      setStale(null);
    } finally {
      setPending(false);
    }
  };

  //! A `load` REF MÖGÖTT. Minden renderben új függvény keletkezik belőle; egy
  //! hatás függőségei közé téve az végtelen ciklusba esne. A ref-en keresztül
  //! a hatások mindig a FRISS `load`-ot hívják, de nem futnak újra miatta.
  const loadRef = useRef(load);
  loadRef.current = load;

  //! A MENTETT HÉTBŐL VISSZA KELL TALÁLNI A FRISSHEZ. A rács hálózat nélkül a
  //! készüléken tárolt hetet mutatja — de a térerő a folyosón perceken belül
  //! visszajön, és addig SEMMI nem kérdezné meg újra: a diák egy órával korábbi
  //! órarendet nézne, mert nem jutott eszébe frissíteni. A `/ma` ezt már így
  //! csinálja (láthatóságra újratölt); a rács mostantól ugyanígy.
  //*
  //* Csak amíg a nézet MENTETT: friss adatnál ez fölösleges forgalom lenne
  //* azon a kiszolgálón, amit egy iskola tart fenn.
  useEffect(() => {
    if (!stale) return;
    const retry = () => {
      if (document.visibilityState !== "visible") return;
      loadRef.current(view.weekStart);
    };
    window.addEventListener("online", retry);
    document.addEventListener("visibilitychange", retry);
    return () => {
      window.removeEventListener("online", retry);
      document.removeEventListener("visibilitychange", retry);
    };
  }, [stale, view.weekStart]);

  //* Hét-lapozás egy lépéssel — a gombok és a billentyűk közös bejárata.
  const step = (delta: number) =>
    load(
      addDaysKey(view.weekStart, delta * 7),
      undefined,
      delta > 0 ? "next" : "prev",
    );

  //! A HÉTHATÁR ÁTLÉPÉSE UGYANEZ A LÉPÉS, MÁS ÉRKEZÉSSEL. A nyíl a hetet
  //! cseréli, a mozdulat viszont a szalagon megy tovább: előre a hét elejére,
  //! visszafelé a végére érkezik.
  //* A figyelő EGYSZER kerül fel a görgetődobozra, a hét viszont minden
  //* renderben friss — a ref-en át hívjuk (ugyanaz a minta, mint a
  //* gyorsbillentyűknél).
  const edgeStepRef = useRef<(dir: 1 | -1) => void>(() => {});
  edgeStepRef.current = (dir: 1 | -1) => {
    if (pending) return;
    load(
      addDaysKey(view.weekStart, dir * 7),
      undefined,
      dir > 0 ? "next" : "prev",
      dir > 0 ? "start" : "end",
    );
  };
  //* A mozdulat kezelője a `pending`-et is a ref-ből olvassa: a figyelő nem
  //* iratkozhat fel újra minden betöltésnél.
  const pendingRef = useRef(pending);
  pendingRef.current = pending;

  const { days, periods, events, weekStart } = view;

  //! A „MOSTANI" HÉT NEM MINDIG A MAI. Hétvégén a mai hét öt tanítási napja
  //! már elmúlt, ezért a lap a következő hetet tekinti a mostaninak — ide tér
  //! vissza a „Ma" gomb, a `T` gyorsbillentyű és a lap „Mai hét" sora is
  //! (lásd `focusMondayKey`). A feliratok ilyenkor nem hazudnak „ma"-t: ahova
  //! visznek, abban a hétben a mai nap nincs benne.
  const focusWeek = focusMondayKey();
  const weekendFocus = focusIsNextWeek();

  const abWeek = days.find((d) => d.week === "A" || d.week === "B")?.week;
  //! A NAP SAJÁT JELÖLÉSE HIÁNYOZHAT (a Jedlikinfo üres `week`-et ad pl. egy
  //! tanítás nélküli hétfőre), a HÉTÉ viszont nem: a duális állapotot ezért a
  //! hét betűjéből számoljuk, nem a napéból.
  const savedDualOf = useCallback(
    (dayOfWeek: number): DualStatus | undefined =>
      dualStatusForDay?.({
        dayOfWeek,
        weekLetter: abWeek ?? "",
        subjectShort,
      }),
    [dualStatusForDay, abWeek, subjectShort],
  );

  //! ─── SZŰRETLEN PILLANTÁS ─────────────────────────────────────────────────
  //! Az összevonások és a duális beosztás NEM törlődnek, csak a rács nem
  //! alkalmazza őket, amíg a diák körül nem néz (lásd `glance-controls.tsx`).
  //! Semmi nem íródik a tárolóba: ez a nézet állapota, nem a beállításoké.
  //*
  //! AZ ALANYHOZ KÖTVE, NEM PUSZTA IGEN/NEM. A pillantás annak az alanynak szól,
  //! akinél elindult — egy másik osztályra váltva véget ér, és visszaváltva sem
  //! éled újra magától. És véget ér akkor is, ha nincs többé mit figyelmen
  //! kívül hagyni (pl. a diák közben minden szűrését visszavonta): egy
  //! „szűretlen" jelzés ott már semmit nem mondana, a következő döntése után
  //! viszont váratlanul újra elrejtené azt, amit épp beállított.
  const [glanceKey, setGlanceKey] = useState<string | null>(null);
  const canGlance =
    Boolean(view.subject) &&
    (prefs.length > 0 ||
      days.some((d) => savedDualOf(d.dayOfWeek) !== undefined));
  const glancing = canGlance && glanceKey === storeKey;
  if (glanceKey !== null && !glancing) setGlanceKey(null);

  //* A rács minden duális jelölése ezen át kérdez — szűretlenül egyik sincs.
  const dualOf = useCallback(
    (dayOfWeek: number) => (glancing ? undefined : savedDualOf(dayOfWeek)),
    [glancing, savedDualOf],
  );

  //! ─── A DUÁLIS NAP HELYÉN EGY BLOKK ÁLL ───────────────────────────────────
  //! Azon a napon a munkahelyen vagy: az osztály órarendje NEM a te napod. A
  //! rács ezért nem tesz úgy, mintha lenne órád — a nap óráit egyetlen
  //! 8:00–15:00 kártya váltja fel, óra-bontás nélkül.
  //!
  //! CSAK OTT, AHOL VAN MIT FELVÁLTANI. Egy adat nélküli hétre (szünet,
  //! forráshiba) nem találunk ki duális napokat: a hét üressége a hír, nem a
  //! munkahely.
  const scheduledLessons = useMemo(() => {
    if (!dualStatusForDay || view.lessons.length === 0) return view.lessons;
    const dualDays = days.filter((d) => savedDualOf(d.dayOfWeek) === "dual");
    if (dualDays.length === 0) return view.lessons;
    const dualDows = new Set(dualDays.map((d) => d.dayOfWeek));
    return [
      ...view.lessons.filter((l) => !dualDows.has(l.dayOfWeek)),
      ...dualDays.map(dualBlockLesson),
    ];
  }, [view.lessons, days, savedDualOf, dualStatusForDay]);
  //* Szűretlenül a forrás órái állnak a rácson, a duális napokon is.
  const lessons = glancing ? view.lessons : scheduledLessons;

  //! A RÁCS IDŐ-HATÁRAI: a tényleges órák (és beeső szakkör-alkalmak) tartománya.
  //! A csengetési rend (`periods`) a 0. és a 9. órát is tartalmazza, pedig az
  //! iskolai héten ezek többnyire üresek — azokat NEM húzzuk a rácsba, különben
  //! minden héten nagy, üres sáv jelenne meg előtte és utána. Csak akkor van
  //! hely a szélén, ha a hét valóban kezdődik/végződik korán vagy későn.
  const lessonMins = [
    ...lessons.map((l) => l.startMin),
    ...lessons.map((l) => l.endMin),
    ...events.map((e) => e.startMin),
    ...events.map((e) => e.endMin),
  ];
  const dayStart = lessonMins.length
    ? Math.min(...lessonMins) - 6
    : (min(periods.map((p) => p.startMin)) ?? 8 * 60) - 8;
  const dayEnd = lessonMins.length
    ? Math.max(...lessonMins) + 6
    : (max(periods.map((p) => p.endMin)) ?? 15 * 60) + 8;

  //* A morf-átmenet ezen az elemen ül (lásd view-transition.ts).
  const frameRef = useRef<HTMLDivElement>(null);
  //! ─── A RÁCS KÉT TENGELYE KÉT KÜLÖN KÉRDÉS ────────────────────────────────
  //! Eddig egyetlen töréspont (`sm`) döntött mindkettőről: alatta egy nap,
  //! fölötte öt. 640 px-en tehát az öt oszlop 118 px-re szorult — a tantárgy
  //! neve két betűre csonkult —, fekvő telefonon meg a „férjen ki magasságban"
  //! szabály lapította 22 px-esre a tanórát. A két tengelynek MÁS a szűkössége,
  //! ezért mostantól külön mérjük:
  //!  • vízszintesen ANNYI nap látszik, ahány olvasható oszlop kifér;
  //!  • függőlegesen a nap a képernyőhöz igazodik, de csak a lépték-határig.
  const [cols, setCols] = useState(5);
  const [colWidth, setColWidth] = useState<number | null>(null);
  const [fitScale, setFitScale] = useState<number | null>(null);
  //! A KIS VIEWPORT MÉRŐSZALAGJA. A `window.innerHeight` mobilon NEM állandó: a
  //! böngésző címsora görgetéskor be- és kicsúszik, és ezzel ~100 képponttal
  //! változtatja meg. Ha ebből számolnánk a léptéket, a rács MAGASSÁGA MOZOGNA
  //! görgetés közben — és egy `scroll-snap` doboz minden átméretezéskor újra
  //! tapad, vagyis a lap magától átlapozna a szomszéd napra. Pont ez volt a
  //! „nem lehet rendesen görgetni" hibája.
  //! A `100svh` a KIS viewport (kint a címsor): erre méretezve a rács akkor is
  //! kifér, amikor a címsor látszik, tehát függőleges görgetés — és vele a
  //! tapadás elbizonytalanodása — egyáltalán nem keletkezik. A mérőszalag egy
  //! 0 széles, rögzített elem: nem rajzol, nem foglal helyet, nem is látszik.
  const svhRef = useRef<HTMLDivElement>(null);
  //* A lap gyökere — a rács fölé kerülő sorok miatt ezt is figyeljük (lentebb).
  const rootRef = useRef<HTMLDivElement>(null);
  //! MÉRÉS FESTÉS ELŐTT. Az oszlopszám a keret TÉNYLEGES szélességéből jön, nem
  //! médialekérdezésből (így a beágyazott/osztott ablak is jól méretez) — de
  //! effektben mérve az első képkockán még az alapérték, öt nap látszana,
  //! telefonon egy teljes képernyőnyi ugrással. A layout-effekt ugyanabban a
  //! képkockában, festés előtt javít.
  useIsoLayoutEffect(() => {
    if (variant !== "fullscreen") return;
    const measure = () => {
      const f = frameRef.current;
      if (!f) return;

      //* — Vízszintes: hány nap fér ki olvashatóan
      const avail = f.clientWidth - GUTTER;
      const fits =
        f.clientWidth < ONE_DAY_MAX
          ? 1
          : Math.max(1, Math.min(5, Math.floor(avail / MIN_COL)));
      setCols(fits);
      //* Egy nap: teljes szélesség (a nap-sáv navigál, nincs mit kikandikálni).
      //* Öt nap: nincs tovább, tehát nincs kikandikálás sem.
      setColWidth(
        fits === 1 || fits === 5 ? avail / fits : (avail - PEEK) / fits,
      );

      //* — Függőleges: a nap a képernyőhöz igazodik, a lépték-határig
      const span = dayEnd - dayStart;
      if (span <= 0) return;
      //! A keret DOKUMENTUMBELI teteje kell, nem a képernyőbeli: görgetett
      //! állapotban mérve a `top` már negatív, és a lépték ugrálna görgetés
      //! közben — pont akkor, amikor a rács magassága nem mozdulhat.
      const docTop = f.getBoundingClientRect().top + window.scrollY;
      //* A mérőszalag a kis viewportot adja; ha a böngésző nem ismeri az `svh`
      //* egységet, marad a pillanatnyi magasság.
      const viewport = svhRef.current?.clientHeight || window.innerHeight;
      const room = Math.max(viewport - docTop, 220);
      setFitScale(Math.max(room / span, MIN_PX_PER_MIN));
    };
    //* `pending` csak azért a függőségben, mert a betöltés után a keret tényleges
    //* geometriája csak később áll be — ilyenkor újra mértünk.
    void pending;
    measure();
    const ro = new ResizeObserver(measure);
    if (frameRef.current) ro.observe(frameRef.current);
    //! ÉS AMI A RÁCS FÖLÖTT VAN. A kereten ülő figyelő csak a keret MÉRETÉT
    //! nézi — az viszont nem változik attól, hogy fölé beúszik egy sor. Márpedig
    //! a rács fölé BEÚSZIK: az offline jelzés (`StaleNote`), az üres hét
    //! felirata, a „most" sáv hangnemváltása mind ott van, és mindegyik
    //! LEJJEBB tolja a keretet. Újramérés nélkül a lépték a RÉGI `docTop`-ból
    //! maradt: a nap magassága nem szűkült, tehát a lap éppen annyival
    //! görgethetővé vált, amennyit az új sor elvett — és egy `mandatory`
    //! tapadású vízszintes doboz mellett ez a pár tíz képpontnyi függőleges
    //! görgetés minden ferde húzást a szomszéd napra ránt. („Offline jelzéssel
    //! lehetetlen a napok között görgetni.") A gyökeret figyelve minden fölé
    //! kerülő sor újramér, és a nap megint PONTOSAN kifér.
    //* A figyelő a saját eredményét is látja (a keret magassága a léptékből
    //* jön), de a mérés idempotens: a második futás ugyanazt adja, és az
    //* azonos értékre React már nem rajzol újra.
    if (rootRef.current) ro.observe(rootRef.current);
    window.addEventListener("resize", measure);
    //* Fekvőre fordítás után a méretek csak a következő képkockán állnak be.
    const onOrient = () => requestAnimationFrame(measure);
    window.addEventListener("orientationchange", onOrient);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("orientationchange", onOrient);
    };
  }, [variant, dayStart, dayEnd, pending]);

  //! ─── NYOMTATÁS ───────────────────────────────────────────────────────────
  //! A papírra a TELJES hét megy, fix léptékkel — az oszlopszám a képernyő
  //! szűkössége, a lapé nem az. A kapcsolást `flushSync` köti el, mert a
  //! `beforeprint` után a böngésző azonnal pillanatképet készít: egy szokásos,
  //! aszinkron állapotfrissítés még a régi rácsot nyomtatná ki.
  const [printing, setPrinting] = useState(false);
  useEffect(() => {
    if (variant !== "fullscreen") return;
    const set = (on: boolean) => {
      flushSync(() => setPrinting(on));
    };
    const before = () => set(true);
    const after = () => set(false);
    window.addEventListener("beforeprint", before);
    window.addEventListener("afterprint", after);
    //* Safari a `beforeprint` helyett a médialekérdezés váltását adja.
    const mq = window.matchMedia("print");
    const onChange = (e: MediaQueryListEvent) => set(e.matches);
    mq.addEventListener("change", onChange);
    return () => {
      window.removeEventListener("beforeprint", before);
      window.removeEventListener("afterprint", after);
      mq.removeEventListener("change", onChange);
    };
  }, [variant]);

  //! ─── MUTATÓESZKÖZ ────────────────────────────────────────────────────────
  //! A tantárgy-kiemelés egérrel remek, érintéssel viszont BERAGAD: a „hover"
  //! az utolsó koppintás helyén marad, és a fél rács tompán áll, amíg máshova
  //! nem koppintanak. Nem a képernyő szélességét kérdezzük — érintőkijelzős
  //! laptop is van —, hanem magát a mutatóeszközt.
  const [canHover, setCanHover] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(hover: hover) and (pointer: fine)");
    const sync = () => setCanHover(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  //* A nyomtatott lapon nincs görgetés és nincs szűk hely: mindig az öt nap megy.
  const effCols = printing ? 5 : cols;
  //* „Lapozós" mód: nem fér ki a hét, tehát vízszintesen görgethető és tapad.
  const paging = variant === "fullscreen" && !printing && effCols < 5;
  const pxPerMin = printing
    ? PRINT_PX_PER_MIN
    : variant === "fullscreen"
      ? (fitScale ?? FULL_PX_PER_MIN)
      : EMBED_PX_PER_MIN;
  //* A nap-oszlop és a fejléc-cellája UGYANEZT a szélességet kapja — a fejléc a
  //* rácson kívül él (lásd lentebb), a két sáv csak így marad egy vonalban.
  //* Szűk eszköztár: ugyanaz a mérés dönt róla, mint az oszlopszámról — egy nap
  //* fér ki, tehát a fejléc sora is szűk, tehát rövid hét-címke megy ki.
  const narrowBar = variant === "fullscreen" && cols === 1;
  //! ─── A TAPADÁS ─────────────────────────────────────────────────────────
  //! A `mandatory` az egyetlen jó igazítás: sosem maradsz két nap között, és
  //! sosem kell „pontosan" görgetni. Ezért NEM gyengítjük — sem mutatóeszköz,
  //! sem a lap görgetése miatt.
  //!
  //! DE A TAPADÁS NEM LAPOZ. Igazít. Hogy egy mozdulat pontosan egy napot
  //! vigyen, ahhoz a lendületet kell elvenni, azt pedig CSS-ből nem lehet: a
  //! `scroll-snap-stop: always` a mobil WebKit saját kifutása közben nem
  //! tartja meg a napokat. Érintésre ezért a húzást mi visszük (lásd „A
  //! VÍZSZINTES HÚZÁS A MIÉNK"), a tapadás pedig azt csinálja, amiben jó:
  //! egér, érintőpad, billentyű és átméretezés után egész napra állít.
  //!
  //! A régi ütközésnek két oka volt, és mindkettőt a forrásánál oldjuk meg:
  //!
  //!  1. A mobil böngésző címsora ki-be csúszott, ezzel átméretezte a rácsot, a
  //!     snap-doboz pedig minden átméretezéskor ÚJRA tapad — a lap magától
  //!     lapozott. Megoldás: a lépték a KIS viewporthoz (`100svh`) igazodik,
  //!     tehát a rács magassága görgetés közben meg sem mozdul (lásd `svhRef`).
  //!
  //!  2. Ahol a nap tényleg nem fér ki (fekvő telefon, nagyon hosszú nap, a
  //!     rács fölé beúszó sor), ott függőlegesen is görögni kell — és a felfelé
  //!     húzás sosem tökéletesen függőleges. A megoldás NEM az, hogy ilyenkor
  //!     elengedjük a tapadást: pont az volt a hiba. Lásd lentebb, „A TAPADÁST
  //!     NEM A LAP GÖRGETÉSE KAPCSOLJA. SOHA." A ferde mozdulatot ma az
  //!     irány-döntés zárja le: ami inkább függőleges, az a lapé, és marad
  //!     natív — a lapozásból semmit nem vesz el.
  const colStyle: React.CSSProperties | undefined = paging
    ? { width: colWidth ?? undefined, flex: "0 0 auto" }
    : undefined;

  const height = Math.max((dayEnd - dayStart) * pxPerMin, 320);
  const top = useCallback(
    (m: number) => (m - dayStart) * pxPerMin,
    [dayStart, pxPerMin],
  );
  //! A RÁCSON KÍVÜLI CSENGETÉSI SOROK. A `periods` a 0. és a 9. órát is
  //! tartalmazza, a rács idő-tartománya viszont a TÉNYLEGES órákból jön. Az
  //! ezen kívül eső óra-vonalak és sorszámok eddig is kirajzolódtak — abszolút
  //! pozícióban, a rács alja ALÁ —, és ezzel ~80 képponttal a képernyő alá
  //! nyújtották a lapot. Vagyis a „a nap kifér egy képernyőre" ígéret nem volt
  //! igaz, és a lap görgethetővé vált anélkül, hogy lett volna rajta bármi:
  //! pont ez a néma függőleges görgetés harcolt telefonon a nap-lapozással.
  const linesFor = (list: TimetablePeriod[]) => {
    const rows = list.filter(
      (p) => p.startMin >= dayStart && p.startMin <= dayEnd,
    );
    const lastLine = rows.length ? rows[rows.length - 1].endMin : null;
    //* A záróvonal csak akkor kell, ha a tartományon BELÜL van.
    return {
      rows,
      last: lastLine !== null && lastLine <= dayEnd ? lastLine : null,
    };
  };
  const { rows: gridPeriods, last: lastPeriodEnd } = linesFor(periods);

  //! ─── AMELYIK NAPON MÁS A CSENGETÉS, OTT MÁS A VONALZÓ IS ─────────────────
  //! A hét `periods` tömbje a szokásos rendet írja le — a forrás akkor is ezt
  //! küldi, ha egy nap rövidített órákon megy (lásd `withSchoolCalendar`). Az
  //! ilyen nap kártyái a VALÓDI időpontjukon állnak, tehát ha a vonalak a
  //! rendes rendből jönnének, a nap saját órái csúsznának el a saját
  //! vonalaihoz képest. Az eltérő nap ezért a SAJÁT csengetésével rajzolódik;
  //! a bal oldali ragadó idősáv marad a hét szokásos rendjén, mert az öt
  //! oszlopnak egy közös vonalzója van — a különbség pont ezért látszik.
  const periodsOf = useCallback(
    (day: Day) => periodsOfDay({ periods }, day),
    [periods],
  );

  //* Ha az API csak fallback napokat adott (hiba), a hét 5 tanítási napját mutatjuk.
  const gridDays: Day[] =
    days.length > 0
      ? days
      : Array.from({ length: 5 }, (_, i) => {
          const dateKey = addDaysKey(weekStart, i);
          return {
            name: DAY_NAMES[i],
            dateKey,
            dateLabel: dateKey.slice(5).replace("-", ".").concat("."),
            week: "",
            dayOfWeek: i + 1,
            isToday: dateKey === todayKey(),
            //* Tartalék nap: a tanév rendjéből semmit nem tudunk róla.
            teaching: null,
            notes: [],
            bells: null,
          };
        });

  //* Az ütközés-feloldás naponként fut le; a `prefs` bármely változása azonnal
  //* átrajzolja a rácsot (nincs újratöltés).
  const resolvedDays = useMemo(() => {
    const byDay = new Map<number, TimetableLesson[]>();
    for (const lesson of lessons) {
      byDay.set(lesson.dayOfWeek, [
        ...(byDay.get(lesson.dayOfWeek) ?? []),
        lesson,
      ]);
    }
    return new Map(
      gridDays.map((d) => [
        d.dayOfWeek,
        //! A csengetési rend KELL a feloldáshoz: ebből jönnek a többórás
        //! blokkon BELÜLI szünetek (a suli a dupla órát egy kártyaként adja
        //! vissza) — rövidített napon tehát a NAP SAJÁT rendjéből, különben a
        //! 40 perces órák közé 45 perces határokat húznánk.
        resolveDay(
          byDay.get(d.dayOfWeek) ?? [],
          glancing ? NO_PREFS : prefs,
          periodsOf(d),
        ),
      ]),
    );
  }, [lessons, prefs, glancing, gridDays, periodsOf]);

  //! A SZŰRÉSEK LISTÁJA A SAJÁT ÓRARENDHEZ MÉR, nem ahhoz, ami épp a rácson
  //! áll: egy szűretlen pillantás nem teheti „aktívvá" azt a döntést, amelyik
  //! órája amúgy egy duális napra esik.
  const rows = useMemo(
    () => preferenceRows(prefs, scheduledLessons),
    [prefs, scheduledLessons],
  );

  //! A "hozd vissza" gombok IDENTITÁST küldenek, nem klaszterkulcsot: egy órát
  //! elrejthet egy másik napon hozott döntés általánosítása is. Egy kattintás
  //! ezért több döntést is elenged — de EGY állapotfrissítésben, hogy a rács ne
  //! rajzolódjon újra döntésenként.
  const undoByIdentity = useCallback(
    (identities: string[]) => {
      undoMany(preferencesHiding(prefs, identities));
    },
    [prefs, undoMany],
  );

  //* --- Mobil: naponkénti lapozás (scroll-snap) --------------------------------
  const scrollRef = useRef<HTMLDivElement>(null);
  const dayRefs = useRef<(HTMLDivElement | null)[]>([]);
  //* A rácson KÍVÜLI nap-fejléc sínje — a rács vízszintes görgetését tükrözi.
  const headerTrackRef = useRef<HTMLDivElement>(null);
  //* A héthatáron belógó szomszéd nap sávjai (lásd `WeekEdgeHint`).
  const edgePrevRef = useRef<HTMLDivElement>(null);
  const edgeNextRef = useRef<HTMLDivElement>(null);
  //* A gumiszalag pillanatnyi kitérése — a fejléc sínje ugyanennyivel mozdul,
  //* hogy a nap-fejléc ne váljon el a saját oszlopától húzás közben.
  const edgeOffsetRef = useRef(0);
  const [activeDay, setActiveDay] = useState(0);

  //! MELYIK NAP LÁTSZIK — két úton, szándékosan.
  //!  • A nap-sávra kattintás AZONNAL beállítja (`goToDay`): ez determinisztikus,
  //!    nem függ attól, hogy a görgetés eseménye megérkezik-e.
  //!  • A natív swipe-ot a görgetés-esemény követi le (rAF-fel ritkítva).
  //! Az IntersectionObserver itt SZÁNDÉKOSAN nincs használva: a DESIGN.md
  //! ugyanezt a leckét már rögzítette (headless renderelőben nem fut le), és a
  //! jelölő nem függhet olyan API-tól, ami néma maradhat.
  const syncActiveDay = useCallback(() => {
    const container = scrollRef.current;
    if (!container) return;
    //* A látható nap az, amelyik bal széle a legközelebb van a görgetéshez.
    let best = 0;
    let bestDistance = Number.POSITIVE_INFINITY;
    dayRefs.current.forEach((el, i) => {
      if (!el) return;
      const distance = Math.abs(el.offsetLeft - GUTTER - container.scrollLeft);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = i;
      }
    });
    setActiveDay(best);
  }, []);

  //* A görgetés percenként több száz eseményt is adhat — képkockánként egyszer
  //* számolunk belőle.
  const scrollFrame = useRef<number | null>(null);
  //! A NAP-FEJLÉC A GÖRGETŐDOBOZON KÍVÜL ÜL. Belül nem lehet: a vízszintes
  //! `overflow` görgetési dobozt csinál a keretből, és a benne lévő
  //! `position: sticky` ehhez a dobozhoz igazodna — vagyis függőleges
  //! görgetéskor a fejléc elúszna a rács tetejével együtt. Kívül viszont
  //! magától nem követi a vízszintes lapozást: a sínjét ezért ELLENTÉTES
  //! irányban toljuk el ugyanannyival.
  //!
  //! A BAL IDŐSÁV NINCS ITT — az `position: sticky; left: 0`-val ragad, natívan.
  //! Ez nem szépészeti különbség: a swipe és a lendülete a kompozitor szálán
  //! fut, a `scroll` eseményre írt `transform` viszont a fő szálon, egy-két
  //! képkockával KÉSŐBB. Az idősáv így úszott a rács után, majd a mozdulat
  //! végén visszarándult — ettől érződött olcsónak az egész lapozás. A natív
  //! tapadás ugyanazon a szálon mozog, mint a görgetés: nem tud lemaradni.
  //! A fejléc-sín azért maradhat JS-es, mert csak két-öt oszlopos elrendezésben
  //! (tábla, fekvő telefon) van egyáltalán, ahol a görgetés nem érintéses
  //! lendület, hanem egér/érintőpad — ott a fő szál együtt fut a görgetéssel.
  const pinLeft = useCallback(() => {
    const container = scrollRef.current;
    const track = headerTrackRef.current;
    if (!container || !track) return;
    track.style.transform = `translateX(${edgeOffsetRef.current - container.scrollLeft}px)`;
  }, []);
  const handleScroll = useCallback(() => {
    if (scrollFrame.current !== null) return;
    scrollFrame.current = requestAnimationFrame(() => {
      scrollFrame.current = null;
      pinLeft();
      syncActiveDay();
    });
  }, [pinLeft, syncActiveDay]);
  useEffect(
    () => () => {
      if (scrollFrame.current !== null) {
        cancelAnimationFrame(scrollFrame.current);
      }
    },
    [],
  );

  //! FORGATÁS UTÁN NE MARADJ KÉT NAP KÖZÖTT. Ha megváltozik, hány nap fér ki,
  //! az oszlopok szélessége is más lesz — a régi görgetés-pozíció ilyenkor
  //! félúton áll meg. Ugyanahhoz a naphoz igazítunk vissza, amit néztél.
  const alignRef = useRef<(index: number) => void>(() => {});
  //* A látott nap ref-ben is: az igazítás a FRISS értéket olvassa, de nem
  //* indul újra minden lapozáskor — csak akkor, ha az elrendezés változott.
  const activeDayRef = useRef(0);
  activeDayRef.current = activeDay;
  useEffect(() => {
    if (variant !== "fullscreen") return;
    //* Az oszlopszám SZÁNDÉKOSAN kiváltó ok, nem felhasznált érték: csak az
    //* elrendezés változására igazítunk vissza, a görgetés közbeni apró
    //* szélesség-változás nem ránthatja el a lapot a kéz alól.
    void cols;
    const id = requestAnimationFrame(() =>
      alignRef.current(activeDayRef.current),
    );
    return () => cancelAnimationFrame(id);
  }, [variant, cols]);

  //! ─── A TAPADÁST NEM A LAP GÖRGETÉSE KAPCSOLJA. SOHA. ────────────────────
  //! Itt korábban egy „védőháló" ült: a `window` görgetésére kikapcsolta a
  //! tapadást, és 140 ms csend után vissza. MÉRVE, iPhone-on, ez maga volt a
  //! hiba, két egymást erősítő okból:
  //!
  //!  1. A 140 ms a lap UTOLSÓ görgetés-eseményétől számolt, a lendület viszont
  //!     a felengedés után még fél-két másodpercig ontja az eseményeket —
  //!     mindegyik újraindította az időzítőt. A tapadás tehát a FÜGGŐLEGES
  //!     lendület teljes hosszán ki volt kapcsolva.
  //!
  //!  2. És ami ennél is fontosabb: a WebKit a `scroll-snap-type` VISSZAÍRÁSÁRA
  //!     magától NEM tapad újra. Álló dobozon a tulajdonság megváltoztatása nem
  //!     görgetés — vagyis a nap ott maradt, ahol a kifutás hagyta, két nap
  //!     között, és csak egy KÉSŐBBI görgetés vagy elrendezés-változás
  //!     igazította a helyére. Innen jött a „sokáig tart, mire átvált".
  //!
  //! A tapadás ezért nem függ a lap görgetésétől, sem mutatóeszköztől, sem
  //! időzítőtől. Egyetlen dolog engedi el: a SAJÁT vízszintes húzásunk, a
  //! húzás pontos idejére (lásd rögtön lentebb) — és az mindig tapadási
  //! pontra érkezik, tehát a 2. pont csapdájába sem léphet: a
  //! visszakapcsoláskor nincs mit igazítani.

  //! ─── A VÍZSZINTES HÚZÁS A MIÉNK ──────────────────────────────────────────
  //! A miértje fentebb, a `PAGE_*` konstansoknál. A hogyanja:
  //!
  //! A FÜGGŐLEGES TENGELY VÉGIG NATÍV MARAD. A doboz `touch-action: pan-y`-t
  //! kap, vagyis a böngésző vízszintesen el sem indul — nincs kompozitor-
  //! görgetés, amit le kellene győznünk, és nincs két, egymás ellen mozgó
  //! réteg sem. Függőlegesen viszont pontosan úgy görget, mint eddig.
  //!
  //! A `touchmove` figyelő EZÉRT nem passzív, és csak ezért: `preventDefault`
  //! nélkül az iOS a bal képernyőszélről induló húzást a lap „vissza"
  //! mozdulatának venné — eddig ezt a doboz saját vízszintes görgetése nyelte
  //! el. A kezelő a MOZDULAT IRÁNYÁNAK ELDŐLTÉIG nem nyúl semmihez, és
  //! függőleges mozdulatnál az első sorában kilép: a lap görgetése így nem
  //! fizet a fő szálon semmit.
  const pageAnimRef = useRef<number | null>(null);
  //! A BEÁLLÁS BÁRMIKOR FÉLBESZAKÍTHATÓ. Új mozdulat, nap-sávra koppintás,
  //! átméretezés és héthatár is ELŐBBRE való nála.
  //!
  //! A `restoreSnap` azért paraméter, mert a két hívó két különböző dolgot
  //! akar. Aki NEM görget tovább (kilépő nézet, koppintás előtti takarítás),
  //! annak vissza kell adni a tapadást. Aki viszont épp AZÉRT szakítja félbe,
  //! mert most tesszük rá az ujjunkat, annak nem: a `mandatory` visszaírása a
  //! Chrome-ot azonnal a legközelebbi napra rántja — vagyis a rács pont a
  //! megfogás pillanatában ugrana egyet az ujj alatt.
  const stopPageAnim = useCallback((restoreSnap = true) => {
    if (pageAnimRef.current !== null) {
      cancelAnimationFrame(pageAnimRef.current);
      pageAnimRef.current = null;
    }
    if (!restoreSnap) return;
    const el = scrollRef.current;
    if (el) el.style.scrollSnapType = "";
  }, []);

  useEffect(() => {
    if (variant !== "fullscreen" || !paging) return;
    const el = scrollRef.current;
    if (!el) return;

    let tracking = false;
    let horizontal = false;
    //* Nálunk van-e ELENGEDVE a tapadás — a húzás és a félbeszakított beállás
    //* is ezen az egy jelzőn keresztül adja vissza.
    let released = false;
    let startX = 0;
    let startY = 0;
    //* A húzás nulla pontja: az IRÁNY ELDŐLTEKOR mért ujjpozíció, nem a
    //* koppintásé — különben a rács a küszöbnyi utat egy ugrással pótolná be.
    let anchorX = 0;
    //* A mozdulat kiindulási napja és a KÉT szomszédja, görgetés-koordinátában.
    let base = 0;
    let lower = 0;
    let upper = 0;
    let lastX = 0;
    let lastT = 0;
    let velocity = 0;

    const release = () => {
      if (!released) return;
      released = false;
      el.style.scrollSnapType = "";
    };

    //* A napok bal széle görgetés-koordinátában, a doboz határai közé zárva.
    //* (Kikandikálós elrendezésben az utolsó nap „helye" a doboz végén túl
    //* volna — oda görgetni nem lehet, tehát tapadási pontnak sem jó.)
    const stopsOf = () => {
      const limit = Math.max(0, el.scrollWidth - el.clientWidth);
      const list: number[] = [];
      for (const d of dayRefs.current) {
        if (d) list.push(Math.min(limit, Math.max(0, d.offsetLeft - GUTTER)));
      }
      return { list, limit };
    };

    const settle = (to: number) => {
      const from = el.scrollLeft;
      const delta = to - from;
      const done = () => {
        pageAnimRef.current = null;
        el.scrollLeft = to;
        pinLeft();
        release();
      };
      if (reduce || Math.abs(delta) < 0.5) {
        done();
        return;
      }
      const t0 = performance.now();
      const step = (now: number) => {
        const t = Math.min(1, (now - t0) / PAGE_SETTLE_MS);
        //* Ugyanaz a kifutó görbe, amivel a héthatár gumiszalagja is visszaáll.
        el.scrollLeft = from + delta * (1 - (1 - t) ** 5);
        pinLeft();
        if (t < 1) {
          pageAnimRef.current = requestAnimationFrame(step);
          return;
        }
        done();
      };
      pageAnimRef.current = requestAnimationFrame(step);
    };

    const onEnd = () => {
      if (!tracking && !horizontal) {
        release();
        return;
      }
      tracking = false;
      if (!horizontal) {
        release();
        return;
      }
      horizontal = false;
      const moved = el.scrollLeft - base;
      const dir = moved >= 0 ? 1 : -1;
      const target = dir > 0 ? upper : lower;
      const reach = Math.abs(target - base);
      //! A MEGÁLLÍTOTT UJJ NEM PÖCCINT. A sebesség az utolsó `touchmove`-ból
      //! való; aki áthúzta a napot, majd megállt és úgy engedte el, annak a
      //! régi sebessége lapoztatna helyette.
      const still = performance.now() - lastT > PAGE_FLICK_STALE;
      //* Az ujj balra visz előre, a görgetés viszont jobbra nő — a pöccintés
      //* iránya ezért a sebesség ELLENTETTJE.
      const flick = !still && -velocity * dir >= PAGE_COMMIT_VELOCITY;
      const commit =
        reach > 1 && (Math.abs(moved) >= reach * PAGE_COMMIT_RATIO || flick);
      settle(commit ? target : base);
    };

    const onStart = (event: TouchEvent) => {
      //* Második ujj a húzás közepén: a lapozás lezárul ott, ahol tart.
      if (horizontal) onEnd();
      tracking = false;
      horizontal = false;
      //! A FÉLBEHAGYOTT BEÁLLÁS AZONNAL ELENGED, DE A TAPADÁST NEM ADJA
      //! VISSZA: az ujj már a rácson van, és a visszaírás egy ugrással
      //! kezdené a mozdulatot. Ha a mozdulat mégsem vízszintes lesz, a
      //! kilépő ágak (`release`) rendezik el.
      stopPageAnim(false);
      if (event.touches.length !== 1 || pendingRef.current) {
        release();
        return;
      }
      //* Nincs mit lapozni: a hét kifér.
      if (el.scrollWidth - el.clientWidth <= 0) {
        release();
        return;
      }
      const touch = event.touches[0];
      startX = touch.clientX;
      startY = touch.clientY;
      lastX = startX;
      lastT = event.timeStamp;
      velocity = 0;
      tracking = true;
    };

    const onMove = (event: TouchEvent) => {
      if (!tracking) return;
      const touch = event.touches[0];
      if (!touch) return;
      //* A felengedés sebességét a mozdulat UTOLSÓ szakaszából olvassuk — a
      //* teljes útból számolt átlag a lassan induló, gyorsan záruló pöccintést
      //* nem ismerné fel.
      const dt = Math.max(1, event.timeStamp - lastT);
      velocity = (touch.clientX - lastX) / dt;
      lastX = touch.clientX;
      lastT = event.timeStamp;

      if (!horizontal) {
        const dx = touch.clientX - startX;
        const dy = touch.clientY - startY;
        if (Math.abs(dx) < PAGE_ACTIVATE && Math.abs(dy) < PAGE_ACTIVATE) {
          return;
        }
        //* A függőleges mozdulat a lapé — és marad natív.
        if (Math.abs(dy) >= Math.abs(dx)) {
          tracking = false;
          release();
          return;
        }
        const { list, limit } = stopsOf();
        //! A SZALAG SZÉLÉRŐL KIFELÉ NEM MI VISZÜNK: onnan a héthatár
        //! gumiszalagja következik (lásd lentebb). A két mozdulat ugyanezt a
        //! feltételt, ugyanennél a küszöbnél nézi meg — sosem indulhat el
        //! mindkettő.
        const outward =
          dx < 0 ? el.scrollLeft >= limit - 1 : el.scrollLeft <= 1;
        if (outward) {
          tracking = false;
          release();
          return;
        }
        base = list.reduce(
          (acc, stop) =>
            Math.abs(stop - el.scrollLeft) < Math.abs(acc - el.scrollLeft)
              ? stop
              : acc,
          el.scrollLeft,
        );
        //* A SZOMSZÉDOS tapadási pont mindkét irányban: ez az egy napos ablak.
        lower = list.reduce((acc, s) => (s < base - 1 && s > acc ? s : acc), 0);
        upper = list.reduce(
          (acc, s) => (s > base + 1 && s < acc ? s : acc),
          limit,
        );
        anchorX = touch.clientX;
        horizontal = true;
        //! A HÚZÁS IDEJÉRE ELENGEDJÜK A TAPADÁST. `mandatory` mellett a
        //! böngésző a KÉZI görgetés-írást is azonnal a legközelebbi pontra
        //! rántja — a rács nem az ujjat követné, hanem ugrálna két nap között.
        released = true;
        el.style.scrollSnapType = "none";
      }

      //! INNENTŐL A MOZDULAT A MIÉNK. A `preventDefault` az iOS bal széli
      //! „vissza" mozdulatát fogja meg; a vízszintes görgetést maga a
      //! `touch-action: pan-y` zárta ki, még a mozdulat legelején.
      if (event.cancelable) event.preventDefault();
      const wanted = base - (touch.clientX - anchorX);
      el.scrollLeft =
        wanted > upper
          ? upper + pageResist(wanted - upper)
          : wanted < lower
            ? lower - pageResist(lower - wanted)
            : wanted;
      //! A NAP-FEJLÉC UGYANEBBEN A KÉPKOCKÁBAN MOZDUL. A görgetés eseménye egy
      //! képkockával később érkezne (`handleScroll` → rAF), és a fejléc pont
      //! húzás közben válna el a saját oszlopától.
      pinLeft();
    };

    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd, { passive: true });
    el.addEventListener("touchcancel", onEnd, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
      stopPageAnim();
    };
  }, [variant, paging, reduce, pinLeft, stopPageAnim]);

  //! ─── A HÉTHATÁR ÁTHÚZÁSA ─────────────────────────────────────────────────
  //! A szalag SZÉLÉN a görgetés nem visz tovább — de a hét igen. Ez a mozdulat
  //! ezért csak ott indul, ahol a natív lapozásnak már úgyis vége van: a
  //! doboz a saját határán áll, és az ujj kifelé húz. Aki a hét közepéről
  //! indul, az napokat lapoz, ahogy eddig — a két gesztus sosem verseng.
  //!
  //! A FIGYELŐ PASSZÍV, ÉS EZ SZÁNDÉKOS. Egy `preventDefault`-ot igénylő
  //! (nem passzív) `touchmove` figyelővel a böngésző MINDEN görgetéskor
  //! megvárná a fő szálat, mielőtt egyáltalán elmozdítaná a rácsot — vagyis a
  //! napi lapozás simasága fizetne a héthatárért. Cserébe egy ferde húzás a
  //! lapot is görgetheti kicsit; ez a rosszabb esetben is csak pár képpont,
  //! és az irány-döntés (`EDGE_PULL_ABORT`) úgyis elengedi a mozdulatot,
  //! amint tényleg függőlegessé válik.
  //!
  //! A HELYI VISSZAPATTANÁST KIKAPCSOLJUK (`overscroll-x-none` a dobozon):
  //! különben a böngésző SAJÁT gumiszalagja is mozdítaná a rácsot, a miénk
  //! tetejébe. Mellékhaszon: a bal szélről induló „vissza" navigációt sem
  //! indítja el a lapozás.
  useEffect(() => {
    if (variant !== "fullscreen" || !paging) return;
    const el = scrollRef.current;
    if (!el) return;

    let tracking = false;
    let engaged = false;
    let dir: 1 | -1 = 1;
    let pull = 0;
    let startX = 0;
    let startY = 0;
    let settling: number | undefined;
    const EASE_CSS = "cubic-bezier(0.22, 1, 0.36, 1)";

    const hintOf = (d: 1 | -1) =>
      d === 1 ? edgeNextRef.current : edgePrevRef.current;

    const pinGutter = () => {
      const gutter = el.querySelector<HTMLElement>("[data-tt-gutter]");
      if (!gutter) return;
      gutter.style.transform = edgeOffsetRef.current
        ? `translateX(${-edgeOffsetRef.current}px)`
        : "";
    };

    const paint = () => {
      //! GUMISZALAG, NEM CSÚSZKA: a kitérés telítődik a húzással. Enélkül a hét
      //! korlátlanul elcsúszna az ujj alatt, majd a mozdulat végén nagyot
      //! rándulna vissza — a lapozás pont ettől érződik olcsónak.
      const off = EDGE_PULL_MAX * (1 - Math.exp(-pull / EDGE_PULL_MAX));
      edgeOffsetRef.current = -dir * off;
      el.style.transform = `translate3d(${edgeOffsetRef.current}px, 0, 0)`;
      //! AZ IDŐSÁV NEM MOZDUL A HÚZÁSSAL. A dobozt eltolva a `sticky left-0`
      //! idősáv is vele menne — előre húzva kicsúszna a keretből, vagyis a
      //! mozdulat közben pont az az adat tűnne el, amihez a napot olvassuk. A
      //! sáv ezért ugyanannyival vissza is kap: a NAPOK csúsznak alatta, ő áll.
      //! (Visszafelé húzva ez tartja meg a rést is a sáv MELLETT — a szomszéd
      //! nap oda jön be, ahol a napok amúgy is kezdődnek.)
      pinGutter();
      pinLeft();
      const node = hintOf(dir);
      if (!node) return;
      //* A szomszéd nap a keletkező RÉSBE csúszik be: a rács kitérése és a nap
      //* belógása ugyanaz a szám, ezért mozdul a kettő együtt.
      node.style.transform = `translateX(${dir * (EDGE_HINT_WIDTH - off)}px)`;
      node.style.opacity = "1";
      node.dataset.armed = pull >= EDGE_PULL_TRIGGER ? "true" : "false";
    };

    const settle = (d: 1 | -1) => {
      window.clearTimeout(settling);
      const ms = reduce ? 0 : 260;
      const ease = ms ? `transform ${ms}ms ${EASE_CSS}` : "";
      const node = hintOf(d);
      el.style.transition = ease;
      el.style.transform = "";
      edgeOffsetRef.current = 0;
      const gutter = el.querySelector<HTMLElement>("[data-tt-gutter]");
      if (gutter) gutter.style.transition = ease;
      pinGutter();
      const track = headerTrackRef.current;
      if (track) track.style.transition = ease;
      pinLeft();
      if (node) {
        node.style.transition = ms
          ? `${ease}, opacity 140ms linear ${ms - 140}ms`
          : "";
        node.style.transform = `translateX(${d * EDGE_HINT_WIDTH}px)`;
        node.style.opacity = "0";
        node.dataset.armed = "false";
      }
      settling = window.setTimeout(() => {
        el.style.transition = "";
        if (gutter) gutter.style.transition = "";
        if (track) track.style.transition = "";
        if (node) node.style.transition = "";
      }, ms + 60);
    };

    const onStart = (event: TouchEvent) => {
      tracking = false;
      engaged = false;
      pull = 0;
      if (event.touches.length !== 1 || pendingRef.current) return;
      //* Nincs mit lapozni: a hét kifér, tehát nincs héthatár sem.
      if (el.scrollWidth - el.clientWidth <= 0) return;
      startX = event.touches[0].clientX;
      startY = event.touches[0].clientY;
      tracking = true;
    };

    const onMove = (event: TouchEvent) => {
      if (!tracking) return;
      const touch = event.touches[0];
      if (!touch) return;
      const dx = touch.clientX - startX;
      const dy = touch.clientY - startY;
      if (!engaged) {
        //* A függőleges mozdulat a lapé, nem a hété.
        if (Math.abs(dy) > Math.abs(dx)) {
          tracking = false;
          return;
        }
        if (Math.abs(dx) < EDGE_PULL_ACTIVATE) return;
        const max = el.scrollWidth - el.clientWidth;
        //! CSAK A SZALAG VÉGÉRŐL, ÉS CSAK KIFELÉ. A határt a mozdulat
        //! MEGINDULÁSAKOR nézzük: aki a hét közepéről húzta idáig, annak ez
        //! még a napi lapozása — a héthatár a következő mozdulattól nyílik.
        const outward = dx < 0 ? el.scrollLeft >= max - 1 : el.scrollLeft <= 1;
        if (!outward) {
          tracking = false;
          return;
        }
        dir = dx < 0 ? 1 : -1;
        engaged = true;
        window.clearTimeout(settling);
        el.style.transition = "";
        const gutter = el.querySelector<HTMLElement>("[data-tt-gutter]");
        if (gutter) gutter.style.transition = "";
        const track = headerTrackRef.current;
        if (track) track.style.transition = "";
        const node = hintOf(dir);
        if (node) node.style.transition = "";
      }
      //* Menet közben elkanyarodó ujj: a hét visszaenged, a lap görget tovább.
      if (Math.abs(dy) > EDGE_PULL_ABORT) {
        const d = dir;
        tracking = false;
        engaged = false;
        pull = 0;
        settle(d);
        return;
      }
      pull = Math.max(0, (dir === 1 ? -dx : dx) - EDGE_PULL_ACTIVATE);
      paint();
    };

    const onEnd = () => {
      if (!engaged) {
        tracking = false;
        return;
      }
      const commit = pull >= EDGE_PULL_TRIGGER && !pendingRef.current;
      const d = dir;
      tracking = false;
      engaged = false;
      pull = 0;
      //* A gumiszalag azonnal elenged: innentől a hét-átmenet viszi a mozdulatot.
      settle(d);
      if (commit) edgeStepRef.current(d);
    };

    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: true });
    el.addEventListener("touchend", onEnd, { passive: true });
    el.addEventListener("touchcancel", onEnd, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
      window.clearTimeout(settling);
      el.style.transition = "";
      el.style.transform = "";
      edgeOffsetRef.current = 0;
      pinGutter();
    };
  }, [variant, paging, reduce, pinLeft]);

  //! ─── A NAP-FEJLÉCEN HÚZVA HETET LAPOZUNK ─────────────────────────────────
  //! A rácson indított mozdulat NAPOKAT lapoz, és hetet csak a szalag széléről
  //! visz (fentebb, a héthatár gumiszalagja). A fejléc-sor viszont nem görget
  //! sehova: ott az egész sáv magát a hetet jelöli, tehát a rajta induló
  //! oldalirányú mozdulatnak egy dolga lehet — hetet váltani, bárhonnan indult.
  //! Így a hét-lapozásnak van egy célpontja telefonon is, ahol a nyilak a nem
  //! ragadó eszköztárban maradnak: a fejléc viszont mindig kéznél van.
  //*
  //* A visszajelzés ugyanabból a telítődő képletből jön, mint a héthatáré, és
  //* a küszöbei is ugyanazok — a két mozdulat egyformán „fog meg".
  const headerSwipeRef = useRef<HTMLDivElement | null>(null);
  const headerSwipe = useRef({
    tracking: false,
    engaged: false,
    dir: 1 as 1 | -1,
    startX: 0,
    startY: 0,
    pull: 0,
    settling: undefined as number | undefined,
  });

  const paintHeaderSwipe = () => {
    const track = headerSwipeRef.current;
    if (!track) return;
    const g = headerSwipe.current;
    const off = EDGE_PULL_MAX * (1 - Math.exp(-g.pull / EDGE_PULL_MAX));
    track.style.transform = `translateX(${-g.dir * off}px)`;
  };

  //* Elengedés: a sor visszaáll a helyére. A hét cseréjét már NEM ez animálja
  //* — azt a `weekTransition` viszi, ahogy a nyilaknál is.
  const settleHeaderSwipe = () => {
    const g = headerSwipe.current;
    window.clearTimeout(g.settling);
    const track = headerSwipeRef.current;
    if (!track) return;
    const ms = reduce ? 0 : 260;
    track.style.transition = ms
      ? `transform ${ms}ms cubic-bezier(0.22, 1, 0.36, 1)`
      : "";
    track.style.transform = "";
    g.settling = window.setTimeout(() => {
      track.style.transition = "";
    }, ms + 60);
  };

  useEffect(() => () => window.clearTimeout(headerSwipe.current.settling), []);

  //! A FIGYELŐK A REACT-EN KERESZTÜL ÜLNEK FEL, mert itt nem kell
  //! `preventDefault` a mozgás közben: a fejléc vízszintesen nem görget, tehát
  //! nincs mit elvenni a böngészőtől. A `touchend` viszont már nem passzív —
  //! ott vissza KELL tartani a koppintást (lásd lentebb).
  const headerSwipeHandlers = {
    onTouchStart: (event: ReactTouchEvent<HTMLDivElement>) => {
      const g = headerSwipe.current;
      g.tracking = false;
      g.engaged = false;
      g.pull = 0;
      if (event.touches.length !== 1 || pending) return;
      window.clearTimeout(g.settling);
      const track = headerSwipeRef.current;
      if (track) track.style.transition = "";
      g.startX = event.touches[0].clientX;
      g.startY = event.touches[0].clientY;
      g.tracking = true;
    },
    onTouchMove: (event: ReactTouchEvent<HTMLDivElement>) => {
      const g = headerSwipe.current;
      if (!g.tracking) return;
      const touch = event.touches[0];
      if (!touch) return;
      const dx = touch.clientX - g.startX;
      const dy = touch.clientY - g.startY;
      if (!g.engaged) {
        //* A függőleges mozdulat a lapé, nem a hété.
        if (Math.abs(dy) > Math.abs(dx)) {
          g.tracking = false;
          return;
        }
        if (Math.abs(dx) < EDGE_PULL_ACTIVATE) return;
        g.dir = dx < 0 ? 1 : -1;
        g.engaged = true;
      }
      //* Menet közben elkanyarodó ujj: a hét visszaenged, a lap görget tovább.
      if (Math.abs(dy) > EDGE_PULL_ABORT) {
        g.tracking = false;
        g.engaged = false;
        g.pull = 0;
        settleHeaderSwipe();
        return;
      }
      g.pull = Math.max(0, (g.dir === 1 ? -dx : dx) - EDGE_PULL_ACTIVATE);
      paintHeaderSwipe();
    },
    onTouchEnd: (event: ReactTouchEvent<HTMLDivElement>) => {
      const g = headerSwipe.current;
      if (!g.engaged) {
        g.tracking = false;
        return;
      }
      //! EZ MÁR NEM KOPPINTÁS VOLT. A fejléc napjai kattinthatók (a `goToDay`
      //! odagörget) — a mozdulat végén keletkező kattintás tehát elrántaná a
      //! lapot egy olyan napra, amit a hüvelykujj csak útközben érintett.
      event.preventDefault();
      const commit = g.pull >= EDGE_PULL_TRIGGER && !pending;
      const dir = g.dir;
      g.tracking = false;
      g.engaged = false;
      g.pull = 0;
      settleHeaderSwipe();
      if (commit) step(dir);
    },
    onTouchCancel: () => {
      const g = headerSwipe.current;
      if (!g.engaged) {
        g.tracking = false;
        return;
      }
      g.tracking = false;
      g.engaged = false;
      g.pull = 0;
      settleHeaderSwipe();
    },
  };

  const goToDay = (index: number) => {
    const container = scrollRef.current;
    const el = dayRefs.current[index];
    if (!container || !el) return;
    //* A koppintás megmondta, melyik nap kell — egy futó beállás már nem szól
    //* bele. (A tapadást is ez adja vissza, mielőtt a sima görgetés indulna.)
    stopPageAnim();
    //* Optimista jelölés: a kattintás eredménye ne a görgetés-eseményen múljon.
    setActiveDay(index);
    container.scrollTo({
      left: el.offsetLeft - GUTTER,
      behavior: reduce ? "auto" : "smooth",
    });
  };
  //* Az átméretezés utáni visszaigazítás ugrás, nem mozdulat: nincs animáció.
  alignRef.current = (index: number) => {
    const container = scrollRef.current;
    const el = dayRefs.current[index];
    if (!container || !el) return;
    if (container.scrollWidth <= container.clientWidth) return;
    stopPageAnim();
    container.scrollTo({ left: el.offsetLeft - GUTTER, behavior: "auto" });
  };

  //! ─── HOVA ÉRKEZIK A HÉTHATÁRON ÁTLÉPETT MOZDULAT ─────────────────────────
  //! Előre lépve a hét ELEJÉRE (hétfő), visszafelé a VÉGÉRE (péntek): a szalag
  //! ott megy tovább, ahol az ujj elhagyta. Ez görgetés-pozíciót ÁLLÍT, nem
  //! animál — a mozdulatot a hét-átmenet viszi, és ez a függvény még annak a
  //! pillanatképe ELŐTT fut le (lásd `weekTransition` `after`).
  landRef.current = (edge: "start" | "end") => {
    const container = scrollRef.current;
    if (!container) return;
    stopPageAnim();
    //* A FRISS DOM napjai közül a szélső; üres hétre nincs hova érkezni.
    const index =
      edge === "start"
        ? dayRefs.current.findIndex((el) => el !== null)
        : dayRefs.current.reduce((acc, el, i) => (el ? i : acc), -1);
    const el = index < 0 ? null : dayRefs.current[index];
    if (!el || container.scrollWidth <= container.clientWidth) return;
    container.scrollLeft = el.offsetLeft - GUTTER;
    //! A „ma"-ugrás EGYSZERI, de a hatása az új hét napjaira újra lefutna — és
    //! a mai napra rántaná a lapot arról, ahova a mozdulat vitte. Aki a
    //! héthatárt átlépte, az megmondta, melyik napot akarja látni.
    jumpedRef.current = true;
    activeDayRef.current = index;
    setActiveDay(index);
  };

  //! Mobilon a mai napra ugrunk induláskor — a diák a MAI órarendjéért nyitja
  //! meg. Csak akkor, ha a betöltött hét tartalmazza a mai napot.
  //!
  //! AZ ELSŐ KÉPKOCKÁN MÉG NINCS HOVA UGRANI. Az oszlopszám mérése (`cols`,
  //! `colWidth`) csak a layout-effektben dől el, tehát a legelső commitban a
  //! rács még az öt napos, NEM görgethető változat — a lapozós doboz ekkor még
  //! meg sem született. A „megvolt már" jelzőt ezért csak akkor tesszük ki,
  //! amikor tényleg oda is igazítottunk; a mérés utáni újrafutásig (`colWidth`
  //! a függőségben) nyitva marad. Enélkül a hétfőn maradt a lap.
  const jumpedRef = useRef(false);
  useEffect(() => {
    if (variant !== "fullscreen" || jumpedRef.current) return;
    const index = gridDays.findIndex((d) => d.isToday);
    if (index < 0) return;
    const container = scrollRef.current;
    const el = dayRefs.current[index];
    if (!container || !el || container.scrollWidth <= container.clientWidth) {
      return;
    }
    jumpedRef.current = true;
    stopPageAnim();
    container.scrollTo({ left: el.offsetLeft - GUTTER, behavior: "auto" });
    //* A ref-et is KÉZZEL írjuk: az elrendezés-változás utáni visszaigazítás
    //* (`alignRef`) egy rAF-ban ezt olvassa, és az még a React újrarajzolása
    //* előtt lefuthat — különben a nulladik napra igazítana vissza.
    activeDayRef.current = index;
    setActiveDay(index);
  }, [variant, gridDays, colWidth, stopPageAnim]);

  //! ─── A SZOMSZÉD HÉT AKKOR KELL, AMIKOR A SZÉLÉRE ÉRSZ ────────────────────
  //! Nem minden hét megnyitásakor kérünk elő kettőt: az HÁROMSZOROSÁRA hizlalná
  //! a forgalmat azon a forráson, amit egy iskola tart fenn. A héthatár akkor
  //! válik elérhetővé, amikor a szalag SZÉLSŐ napján állsz — pontosan ekkor, és
  //! csak abba az egy irányba kérjük le a szomszédot. Jellemzően még azelőtt
  //! megérkezik, hogy a mozdulat elindulna.
  useEffect(() => {
    if (variant !== "fullscreen" || !paging || pending) return;
    const last = gridDays.length - 1;
    if (last < 1) return;
    const dir = activeDay <= 0 ? -1 : activeDay >= last ? 1 : 0;
    if (dir === 0) return;
    //* Lapozás közben a szélső nap átmenetileg is „aktív" lehet — a késleltetés
    //* miatt csak az kér elő, aki tényleg ott állt meg.
    const id = window.setTimeout(() => {
      requestWeek(selectedSubject, addDaysKey(weekStart, dir * 7)).catch(
        () => undefined,
      );
    }, 300);
    return () => window.clearTimeout(id);
  }, [
    variant,
    paging,
    pending,
    activeDay,
    gridDays.length,
    selectedSubject,
    weekStart,
    requestWeek,
  ]);

  //* Új hét/osztály betöltése után a keret újra renderelődhet görgetett állapotban:
  //* ilyenkor azonnal vissza kell tűzni a nap-fejléc sínjét, nehogy a lefordított
  //* helyzete a betöltés utáni első görgetésig a rossz pozícióban tétlenkedjen.
  //* (Az idősáv natívan ragad, azzal itt nincs teendő.)
  useEffect(() => {
    //* `weekStart`/`selectedSubject` csak azért kell a függőségben, mert ezek
    //* cserélik a rács kulcsát (keret-remount); a remount után itt tűzzük
    //* vissza a sínt, ha a görgetés pozíciója megmaradt.
    void weekStart;
    void selectedSubject;
    pinLeft();
  }, [pinLeft, weekStart, selectedSubject]);

  const hasSubject = Boolean(view.subject);
  //* A NYERS órákból: a duális blokkokat mi tettük a rácsra, azoktól a hét még
  //* ugyanolyan üres marad — a „nincs adat" jegyzet nem hazudhat róla.
  const noData = view.ok && view.lessons.length === 0 && events.length === 0;
  const isFocusWeek = weekStart === focusWeek;

  //! ─── A LAP „BEÁLLÍTÁSOK" SZAKASZA ─────────────────────────────────────────
  //! MIND A NÉGY SOR FELTÉTELES VOLT EDDIG IS, CSAK NEM UGYANAZÉRT. Az
  //! összevonás és a duális alany nélkül értelmetlen (`hasSubject`), az
  //! értesítés a tanári lapon belépéshez kötött (`notifySetup` ilyenkor nem
  //! érkezik) — és mostantól bármelyiket KIVEHETI a diák is, ha neki nem szól
  //! (lásd `lib/use-hidden-menu.ts`).
  //*
  //! EZÉRT A SZAKASZ IS FELTÉTELES LETT, A HAJSZÁLVONALÁVAL EGYÜTT. Egy üres
  //! „Beállítások" cím két vonal között pont az a rendezetlenség, ami elől ez a
  //! lap megszületett — és a sáv-alakban (`chrome-rail`) egy üres csoport két
  //! válaszfala egymás mellett állna.
  const showMerge = hasSubject && menu.shows("merge");
  const showDual = hasSubject && menu.shows("dual") && Boolean(dualSetup);
  //* A szűretlen nézet csak ott kínálkozik, ahol van mit figyelmen kívül
  //* hagyni — szűrés és duális beosztás nélkül ugyanazt a rácsot adná vissza.
  const showGlance = canGlance && menu.shows("glance");
  const showNotify = hasSubject && menu.shows("notify") && Boolean(notifySetup);
  //* A naptár-sor ugyanazon a három feltételen áll, mint a harang: kell alany,
  //* a diák nem rejtette el, és a lap ad hozzá vezérlőt (tanári lapon belépés
  //* nélkül nem ad — lásd `/api/naptar`).
  const showCalendar =
    hasSubject && menu.shows("calendar") && Boolean(calendarSetup);
  const showLegend = menu.shows("legend");
  const hasSettings =
    showMerge ||
    showDual ||
    showGlance ||
    showNotify ||
    showCalendar ||
    showLegend ||
    Boolean(trailing);

  //! ─── „MOST" NAPIREND ─────────────────────────────────────────────────────
  //! A „most" sáv és a rács UGYANARRA az adatra néz: a feloldott futamokra és a
  //! saját alkalmakra. Ezért nem a nyers `lessons` tömbből épül, hanem a már
  //! ütközés-feloldott `resolvedDays`-ből — különben a sáv olyan órát mondana be,
  //! amit a diák épp elrejtett.
  const agendaByDate = useMemo(() => {
    const map = new Map<string, AgendaItem[]>();
    for (const d of gridDays) {
      const runs = resolvedDays.get(d.dayOfWeek)?.runs ?? [];
      const items: AgendaItem[] = [
        ...runs.map((r) => ({
          key: r.key,
          kind: "lesson" as const,
          dateKey: d.dateKey,
          dayOfWeek: d.dayOfWeek,
          dayName: d.name,
          startMin: r.startMin,
          endMin: r.endMin,
          title: r.lesson.subjectShort || r.lesson.subject,
          fullTitle: r.lesson.subject || r.lesson.subjectShort,
          meta: [
            r.rooms.join(" · "),
            r.lesson.teacherShort || r.lesson.classShort,
          ].filter(Boolean),
          room: r.rooms.join(" · "),
          //* A rács sávján a rövid alak fér ki; a tanári lekérésnél a tanár
          //* mezői üresek, és ott az OSZTÁLY áll ugyanebben a szerepben.
          who: r.lesson.teacherShort
            ? ({ kind: "teacher", label: r.lesson.teacherShort } as const)
            : r.lesson.classShort
              ? ({ kind: "class", label: r.lesson.classShort } as const)
              : null,
          accentSeed: r.lesson.subjectShort || r.lesson.subject,
        })),
        ...events
          //* Az elmaradt alkalom nem „következik" — a rácson ott marad áthúzva.
          .filter((e) => e.dayOfWeek === d.dayOfWeek && !e.cancelled)
          .map((e) => ({
            key: `event-${e.id}`,
            kind: "event" as const,
            dateKey: d.dateKey,
            dayOfWeek: d.dayOfWeek,
            dayName: d.name,
            startMin: e.startMin,
            endMin: e.endMin,
            title: e.title,
            fullTitle: e.title,
            meta: [e.room, e.szakkorName].filter(Boolean),
            room: e.room,
            //* A szakkör „szemközti fele" a szakkör maga — se nem tanár, se
            //* nem osztály. A nevesített mező ezért marad üres; a lapos lista
            //* viszont továbbra is kiírja.
            who: null,
            accentSeed: e.szakkorSlug,
          })),
      ];
      map.set(d.dateKey, sortAgenda(items));
    }
    return map;
  }, [gridDays, resolvedDays, events]);

  const today = todayKey();
  const todayItems = agendaByDate.get(today) ?? [];
  const laterItems = useMemo(
    () =>
      gridDays
        .filter((d) => d.dateKey > today)
        .flatMap((d) => agendaByDate.get(d.dateKey) ?? []),
    [gridDays, agendaByDate, today],
  );
  const weekHasToday = gridDays.some((d) => d.isToday);
  //* A hét-szintvonal csak akkor van, ha a mai nap ebben a hétben van, ÉS a
  //* mostani perc egyáltalán beleesik a rács idő-tartományába.
  const showRuler =
    fullscreen &&
    weekHasToday &&
    nowMin !== null &&
    nowMin >= dayStart &&
    nowMin <= dayEnd;

  //! ─── RÉSZLETLAP: NYITÁS ÉS ZÁRÁS UGYANAZON AZ ÚTON ───────────────────────
  //! Mindkét irány ugyanabból a kártyából/kártyába morfol, ezért mindkettő a
  //! `cardRefs`-ből veszi az elemet. Ha a kártya közben eltűnt (más hét, feloldott
  //! ütközés), a morf elmarad — a tartalom attól még helyes.
  const openFocus = useCallback(
    (target: FocusTarget) => {
      focusMorph({
        enabled: canMorph,
        card: cardRefs.current.get(target.key) ?? null,
        direction: "open",
        commit: () => setFocus(target),
      });
    },
    [canMorph],
  );
  const closeFocus = useCallback(() => {
    if (!focus) return;
    focusMorph({
      enabled: canMorph,
      card: cardRefs.current.get(focus.key) ?? null,
      direction: "close",
      commit: () => setFocus(null),
    });
  }, [canMorph, focus]);

  //! ─── BILLENTYŰZET ────────────────────────────────────────────────────────
  //! Az órarendet hetekben olvassák, nem kattintásokban: a nyilak lapoznak, a
  //! `T` visszahoz a mai hétre, az 1–5 a napra ugrik. A billentyűk a
  //! jelmagyarázat-buborékban ki vannak írva — rejtett gyorsbillentyű nem
  //! funkció.
  //* A kezelő minden renderben friss, de a figyelő EGYSZER kerül fel: a ref-en
  //* keresztül hívjuk, így a lapozás nem iratkozik fel újra minden állapotváltásnál.
  const hotkeyRef = useRef<(event: KeyboardEvent) => void>(() => {});
  hotkeyRef.current = (event: KeyboardEvent) => {
    if (event.metaKey || event.ctrlKey || event.altKey || pending) return;
    const target = event.target as HTMLElement | null;
    //* Beviteli mezőben és nyitott párbeszédben a billentyű a mezőé.
    if (
      target?.closest(
        "input, textarea, select, [contenteditable='true'], [role='dialog'], [role='listbox']",
      )
    ) {
      return;
    }
    if (focus) return;

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      step(-1);
      return;
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      step(1);
      return;
    }
    if (event.key === "t" || event.key === "T") {
      event.preventDefault();
      load(focusWeek);
      return;
    }
    if (event.key >= "1" && event.key <= "5") {
      const index = Number(event.key) - 1;
      if (index < gridDays.length) {
        event.preventDefault();
        goToDay(index);
      }
    }
  };
  useEffect(() => {
    if (!fullscreen) return;
    const handler = (event: KeyboardEvent) => hotkeyRef.current(event);
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [fullscreen]);

  //* A beállítás-csoport tagjai — a sávban `sm`-től ikonsor, telefonon a

  return (
    <div
      ref={rootRef}
      className={cn(
        "flex flex-col bg-card",
        //! TELJES NÉZETBEN NINCS KÁRTYA-KERET, és ami fontosabb: nincs
        //! `overflow-hidden` sem. Az `overflow: hidden` görgetési dobozt csinál
        //! az elemből, és a benne lévő `position: sticky` ehhez a SOHA nem
        //! görgető dobozhoz igazodna — vagyis a „most" sáv és a nap-fejléc néma
        //! maradna. Az órarend itt maga a lap, nem egy kártya rajta: teljes
        //! szélességben ül, keret nélkül.
        //! ULTRASZÉLES KIJELZŐN a rács nem nő tovább. Öt oszlop 2400 px-en
        //! 470 px széles lenne: a kártya ugyanazt mondja, csak háromszor
        //! nagyobb üres felülettel, az eszköztár két végén álló gombok közé
        //! meg egy méternyi semmi kerül. A keret ezért középre áll, és a
        //! szélek `bg-card`-ja lesz a lap margója.
        fullscreen
          ? cn("mx-auto w-full border-t border-border tt-safe", MAX_SHELL)
          : "overflow-hidden rounded-2xl border border-border shadow-sm",
      )}
    >
      {/*//* A kis viewport mérőszalagja — lásd `svhRef`. Nem rajzol semmit. */}
      {fullscreen && (
        <div
          ref={svhRef}
          aria-hidden
          className="pointer-events-none invisible fixed left-0 top-0 h-[100svh] w-0 print:hidden"
        />
      )}

      {/*//! NYOMTATOTT FEJLÉC. A papíron nincs eszköztár — vagyis nincs, ami
          //! megmondja, KINEK és MELYIK hétnek az órarendje lóg a falon. Ez a
          //! sor csak nyomtatásban jelenik meg, és pontosan ezt mondja meg. */}
      {fullscreen && (
        <p className="hidden pb-2 text-[15px] font-bold text-foreground print:block">
          {view.subject?.name ?? view.subject?.short ?? "Órarend"}
          <span className="ml-2 font-medium text-muted-strong">
            {weekLabel(weekStart)}
          </span>
          {abWeek && (
            <span className="ml-2 font-medium text-muted-strong">
              · {abWeek} hét
            </span>
          )}
          {/*//* A papíron nincs jelzősor: ha szűretlenül nyomtatják, az is a
              //* fejlécbe kerül, különben a falon a diák saját órarendjének
              //* látszana. */}
          {glancing && (
            <span className="ml-2 font-medium text-muted-strong">
              · teljes órarend
            </span>
          )}
        </p>
      )}

      {/*//! A FEJLÉC EGY SOR — lásd `chrome/standing-line.tsx`. Ami eddig egy
          //! tördelő eszköztár volt (375 px-en HÁROM sor, 171 px, a 812-ből),
          //! az most egyetlen 44 px-es sor: „13C · aug. 31 – szept. 4.", a két
          //! nézetpirula és a fiók. Minden más — az alany, az identitás, a hét
          //! naptára, az összevonás, a duális, az értesítés és a jelmagyarázat —
          //! a sorra koppintva nyíló lapban van, NÉVVEL kiírva, gyakoriság
          //! szerint sorba rakva.
          //*
          //! A HETELŐ ASZTALON A SOR MELLETT MARAD (`onStep`), telefonon nem: ott
          //! a rács húzása lapoz. A „Ma" csak akkor létezik, ha nem a mai héten
          //! állunk — egy vezérlő, aminek van dolga. */}
      {fullscreen ? (
        <div className="shrink-0 border-b border-border print:hidden">
          <div className={cn("mx-auto w-full", MAX_SHELL)}>
            <StandingLine
              line={{
                //! AZ ALANY ÚGY ÁLL A SORBAN, AHOGY HÍVJÁK. Az osztály jele
                //! maga a neve („13C"), a tanáré viszont egy belső kód („AA")
                //! — az a sor elején nem mond semmit. Tanári lapon ezért a NÉV
                //! áll ott; a hosszát a sor felső korlátja fogja meg, nem egy
                //! rövidítés (lásd `standing-line.tsx`).
                subject:
                  (mode === "teacher"
                    ? view.subject?.name || view.subject?.short
                    : view.subject?.short) || words.oneCapital,
                context: weekLabel(weekStart, narrowBar),
                weekLetter: abWeek ?? undefined,
                //* Szűretlenül a szűrések száma nem igaz a rácsra — a sor
                //* ilyenkor a szűretlen jelzést viseli helyette.
                filtered: glancing ? 0 : rows.length,
                glance: glancing,
                offCurrent: !isFocusWeek,
                onReturn: () => load(focusWeek),
                returnLabel: weekendFocus ? "Hétfő" : "Ma",
                returnTitle: weekendFocus ? "Következő hét (T)" : "Mai hét (T)",
                onStep: (delta) => step(delta),
                disabled: pending,
              }}
              sheet={
                <>
                  <SheetSection title="Kit nézel">
                    {subjects.length > 0 && (
                      <SheetRow
                        icon={<Users className="size-4" />}
                        label={words.oneCapital}
                      >
                        {/*//! NATÍV `<select>`, nem buborékos lista. Ez az
                            //! egyetlen vezérlő, amit MINDEN eszközön, sokszor,
                            //! gyorsan használnak: mobilon a rendszer saját
                            //! kerekét kapja, billentyűvel a betűre ugrást és a
                            //! natív keresést — ezt egy egyedi lista sem adja
                            //! vissza. */}
                        <div className="relative">
                          <select
                            aria-label={words.oneCapital}
                            value={selectedSubject || ""}
                            disabled={pending}
                            onChange={(event) =>
                              load(weekStart, event.target.value)
                            }
                            className={cn(
                              "h-9 touch-target appearance-none rounded-full border border-input bg-transparent py-1 pr-7 pl-3 text-sm transition-colors outline-none",
                              mode === "teacher" ? "w-[160px]" : "w-[104px]",
                              "hover:bg-muted focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
                              "disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30 dark:hover:bg-input/50",
                              !selectedSubject && "text-muted-foreground",
                            )}
                          >
                            {!selectedSubject && (
                              <option value="" disabled>
                                {words.oneCapital}
                              </option>
                            )}
                            {subjects.map((c) => (
                              <option key={c.short} value={c.short}>
                                {c.name}
                              </option>
                            ))}
                          </select>
                          <ChevronDown
                            className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-muted-foreground"
                            aria-hidden
                          />
                        </div>
                      </SheetRow>
                    )}
                  </SheetSection>

                  <SheetDivider />

                  {/*//! A HÉT NAPTÁRA A LAPBAN, NEM EGY MÁSODIK BUBORÉKBAN. A
                      //! sor kimondja, melyik hetet nézed; ha ugrani akarsz,
                      //! ugyanott van a naptár is. */}
                  <SheetSection title="Melyik hetet">
                    <SheetDisclosure
                      summary={weekLabel(weekStart)}
                      action={
                        //! A „MAI HÉT" A CSUKOTT SORON IS OTT VAN. Ez a hét
                        //! leggyakoribb művelete; ha a naptár kinyitása lenne az
                        //! ára, a lap a gyakorit tenné drágábbá a ritkánál.
                        //* A sávban álló „Ma" ugyanez, csak ott CSAK akkor
                        //* látszik, ha elnavigáltunk — itt viszont mindig,
                        //* mert a lap a teljes leltár.
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={pending || isFocusWeek}
                          onClick={() => load(focusWeek)}
                          className={cn(
                            "h-8 shrink-0 touch-target rounded-full px-3 text-xs font-medium",
                            isFocusWeek
                              ? "text-muted-foreground"
                              : "bg-brand/15 text-brand hover:bg-brand/25",
                          )}
                        >
                          {weekendFocus
                            ? isFocusWeek
                              ? "Ez a következő hét"
                              : "Következő hét"
                            : isFocusWeek
                              ? "Ez a mai hét"
                              : "Mai hét"}
                        </Button>
                      }
                    >
                      <Calendar
                        mode="single"
                        locale={hu}
                        selected={dateFromKey(weekStart)}
                        defaultMonth={dateFromKey(weekStart)}
                        showOutsideDays
                        onSelect={(picked) => {
                          if (!picked) return;
                          load(mondayKey(dateToKey(picked)));
                        }}
                      />
                    </SheetDisclosure>
                  </SheetSection>

                  {hasSettings && (
                    <>
                      <SheetDivider />

                      <SheetSection title="Beállítások">
                        {/*//! MINDEGYIK VEZÉRLŐ MAGA A SORA. Nem sorba tett
                            //! gomb: a gomb VESZI FEL a sor alakját, benne az
                            //! ikonnal, a felirattal és a magyarázattal (lásd
                            //! `sheetItem`). Így a teljes szélesség
                            //! kattintható, és az ikon pontosan egyszer
                            //! szerepel soronként. */}
                        {showMerge && (
                          <PreferencesMenu
                            rows={rows}
                            onUndo={undo}
                            onReset={reset}
                          />
                        )}
                        {showDual &&
                          dualSetup?.({
                            subjectShort,
                            weekLetter: abWeek ?? "",
                          })}
                        {/*//* A két szűrés után áll, mert mindkettőt egyszerre
                            //* kapcsolja ki — ideiglenesen. */}
                        {showGlance && (
                          <GlanceToggle
                            active={glancing}
                            onToggle={() =>
                              setGlanceKey(glancing ? null : storeKey)
                            }
                          />
                        )}
                        {showNotify && notifySetup?.({ subjectShort })}
                        {showCalendar &&
                          calendarSetup?.({ subjectShort, prefs })}
                        {showLegend && <LegendMenu />}
                        {trailing}
                      </SheetSection>
                    </>
                  )}
                </>
              }
            />
          </div>
        </div>
      ) : (
        //* Kártya-nézetben a naptár nem lap, hanem elem: a fejléce a hívó
        //* címéből és a hetelőből áll, semmi másból.
        <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-border px-3 py-2.5 sm:px-4 print:hidden">
          {heading}
          <div className="ml-auto inline-flex items-center gap-0.5 rounded-full border border-border bg-card p-0.5">
            <Button
              variant="ghost"
              size="icon"
              className="size-8 rounded-full touch-target"
              aria-label="Előző hét"
              disabled={pending}
              onClick={() => step(-1)}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 touch-target rounded-full px-3 font-medium"
              disabled={pending}
              onClick={() => load(focusWeek)}
            >
              {weekendFocus ? "Hétfő" : "Ma"}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-8 rounded-full touch-target"
              aria-label="Következő hét"
              disabled={pending}
              onClick={() => step(1)}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
          <span className="text-sm font-semibold tabular-nums text-foreground">
            {weekLabel(weekStart, narrowBar)}
          </span>
          {pending && (
            <Spinner className="size-4 shrink-0 text-muted-foreground" />
          )}
        </div>
      )}

      {/*//! MEGMONDJUK, HA A HÉT A KÉSZÜLÉKRŐL JÖN. A rács ugyanúgy néz ki
          //! mentett és friss adattal — épp ezért kell EGY SOR, ami elárulja a
          //! különbséget. Ugyanaz a jelzés, mint a `/ma`-n (`StaleNote`), hogy
          //! a két lap ne mást mondjon ugyanarról az adatról. */}
      {stale && (
        <StaleNote
          fetchedAt={stale.fetchedAt}
          offline
          className="shrink-0 justify-center border-b border-border/60 bg-muted/30 px-4 py-1.5 print:hidden"
        />
      )}

      {/*//! A SZŰRETLEN NÉZET UGYANITT SZÓL, és ugyanabban a sorban ad kiutat —
          //! a lap kinyitása nélkül (lásd `GlanceNote`). */}
      {glancing && (
        <GlanceNote
          onExit={() => setGlanceKey(null)}
          className="shrink-0 border-b border-border/60 bg-primary/[0.06] px-4 py-1.5 print:hidden"
        />
      )}

      {/* Rács / állapotok */}
      {/*//! A SORREND SZÁMÍT. Az osztály hiánya a leggyakoribb ok, de NEM az
          //! egyetlen: ha a mentett osztály közben megszűnt, vagy a forrás áll,
          //! akkor a `subject` is üres marad — a semleges „válassz
          //! osztályt” felirat ilyenkor elhallgatná a valódi okot. Ezért előbb
          //! a nevesített hiba jön, és csak utána a felszólítás. */}
      {!view.ok && view.error && view.error.kind !== "no-class" ? (
        <CalendarError
          error={view.error}
          pending={pending}
          onRetry={() => load(weekStart)}
        />
      ) : !hasSubject && subjects.length === 0 && subjectsError ? (
        //* Nincs mit választani, mert a lista sem jött meg — a forrás hibája.
        <CalendarError
          error={subjectsError}
          pending={pending}
          onRetry={() => load(weekStart)}
        />
      ) : !hasSubject ? (
        <ChoosePrompt mode={mode} hasSubjects={subjects.length > 0} />
      ) : !view.ok ? (
        <CalendarError
          error={view.error}
          pending={pending}
          onRetry={() => load(weekStart)}
        />
      ) : (
        <div className="relative flex flex-col">
          {/*//! A RAGADÓ BLOKK. A lap görgethetővé vált, ezért ami görgetés
              //! közben is kell, az fent marad: mi megy MOST (a lap egyetlen
              //! sora, ami válaszol), és melyik oszlop melyik nap. Az eszköztár
              //! (hét, osztály, összevonások) szándékosan NEM ragad — azt egyszer
              //! állítja be az ember. z-40: a rács belső rétegei (kártya, „most"
              //! vonal, összevonás-gomb) alatta, a fix fejléc (z-50) fölötte. */}
          {fullscreen && (
            <div
              data-tt-sticky
              className="sticky top-site-header z-40 flex flex-col bg-card"
            >
              <NowRail
                className="print:hidden"
                today={todayItems}
                later={laterItems}
                inFocusWeek={weekStart === focusWeek}
                onToday={() => load(focusWeek)}
                onOpen={(key) => {
                  const item = todayItems.find((it) => it.key === key);
                  if (!item) return;
                  const day = gridDays.find((d) => d.dateKey === item.dateKey);
                  const dayLabel = day
                    ? `${day.name} ${day.dateLabel}`
                    : item.dayName;
                  if (item.kind === "event") {
                    const found = events.find(
                      (e) => `event-${e.id}` === item.key,
                    );
                    if (found) {
                      openFocus({
                        kind: "event",
                        key: item.key,
                        event: found,
                        dayLabel,
                      });
                    }
                    return;
                  }
                  const run = resolvedDays
                    .get(item.dayOfWeek)
                    ?.runs.find((r) => r.key === item.key);
                  if (run) {
                    openFocus({ kind: "lesson", key: item.key, run, dayLabel });
                  }
                }}
              />

              {/*//! EGY NAP LÁTSZIK (telefon): a nap-sáv A navigáció. Öt cél,
                  //! mind egy hüvelykujjnyira, és mindegyik megmondja a dátumát
                  //! is — a fejléc-sor itt csak megismételné azt az egy napot,
                  //! amit már úgyis nézel. */}
              {effCols === 1 && (
                //! A SÁV EGYBEN CSÚSZIK, A KERETE NEM: a gumiszalag a napokat
                //! viszi, az alsó vonal és a háttér a helyén marad. A
                //! `touch-pan-y` a böngésző saját oldalirányú mozdulatát
                //! (lapszéli „vissza") tartja távol a hét-lapozástól.
                <div
                  className="shrink-0 touch-pan-y overflow-hidden border-b border-border px-2 py-1 print:hidden"
                  {...headerSwipeHandlers}
                >
                  <div ref={headerSwipeRef} className="flex gap-1">
                    {gridDays.map((d, i) => (
                      <button
                        key={d.dateKey}
                        type="button"
                        onClick={() => goToDay(i)}
                        aria-current={activeDay === i ? "true" : undefined}
                        className={cn(
                          "flex min-w-0 flex-1 touch-target flex-col items-center justify-center rounded-lg px-1 py-1 text-center transition-colors",
                          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                          activeDay === i
                            ? "bg-primary/12 text-foreground"
                            : "text-muted-strong hover:bg-muted",
                        )}
                      >
                        <span className="text-[13px] font-semibold leading-tight">
                          {DAY_SHORT[i] ?? d.name.slice(0, 2)}
                        </span>
                        <span className="text-[10px] leading-tight tabular-nums">
                          {d.dateLabel.replace(/\.$/, "")}
                        </span>
                        {/*//! TELEFONON EZ AZ EGYETLEN NAP-FEJLÉC: az `effCols === 1`
                          //! ág helyett nem fut a `DayHeadCell` sor, tehát a
                          //! duális jelölésnek ITT kell megjelennie — különben a
                          //! lapozgatás közben sehol nem látszana. */}
                        {(() => {
                          const status = dualOf(d.dayOfWeek);
                          if (!status) return null;
                          return (
                            <span
                              className={cn(
                                "mt-0.5 rounded-[4px] px-1 text-[9px] font-semibold leading-[1.5]",
                                status === "dual"
                                  ? "bg-primary/15 text-primary"
                                  : status === "school"
                                    ? "bg-muted text-muted-strong"
                                    : "text-muted-foreground/60",
                              )}
                            >
                              {DUAL_LABEL[status]}
                            </span>
                          );
                        })()}
                        {/*//* A sávban egyetlen pötty fér el: azt mondja meg,
                          //* hogy van-e ezen a napon mondanivaló (esemény,
                          //* eltérő csengetés, tanítás nélküli nap). A szöveg a
                          //* sáv alatt, a KIVÁLASZTOTT napra áll ki. */}
                        {(d.bells ||
                          d.notes.length > 0 ||
                          d.teaching === false) && (
                          <span
                            className={cn(
                              "mt-0.5 size-1 rounded-full",
                              d.bells ? "bg-brand" : "bg-muted-foreground/60",
                            )}
                            aria-hidden
                          />
                        )}
                        {d.isToday && (
                          <span
                            className="mt-0.5 h-0.5 w-4 rounded-full bg-primary"
                            aria-hidden
                          />
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/*//! TELEFONON EGY NAP LÁTSZIK, ÉS ANNAK A NAPNAK A KÖRÜLMÉNYE
                  //! IS ELFÉR. A fejléc-cella (`DayPlanNote`) ilyenkor nem
                  //! rajzolódik ki, a rács mégis mutathat rövidített órákat vagy
                  //! egy tanítás nélküli napot — ezt a sor mondja ki, szavakkal.
                  //! Állandó magasságban és mindig: a rács teteje nem mozdulhat
                  //! attól, hogy melyik napra lapoztál (lásd `DayCircumstance`). */}
              {effCols === 1 && <DayCircumstance day={gridDays[activeDay]} />}

              {/*//! KETTŐ VAGY TÖBB NAP LÁTSZIK: a nap-fejléc mondja meg, melyik
                  //! oszlop melyik nap — és mivel a rácson KÍVÜL, a ragadó
                  //! blokkban ül, függőleges görgetéskor is fent marad. A
                  //! vízszintes lapozást a sínje `pinLeft`-ből követi le. */}
              {effCols >= 2 && (
                //! A HÚZÁS A SORT VISZI, A VONALÁT NEM — és a kilógó napokat a
                //! keret vágja le, különben a lap vízszintesen görgethetővé
                //! válna a mozdulat közben.
                <div
                  className="shrink-0 touch-pan-y overflow-hidden border-b border-border bg-card"
                  {...headerSwipeHandlers}
                >
                  <div ref={headerSwipeRef} className="flex">
                    <div className="w-12 shrink-0 bg-card" aria-hidden />
                    <div className="min-w-0 flex-1 overflow-hidden">
                      <div ref={headerTrackRef} data-day-track className="flex">
                        {gridDays.map((d, i) => (
                          <DayHeadCell
                            key={d.dateKey}
                            day={d}
                            style={colStyle}
                            paging={paging}
                            onJump={() => goToDay(i)}
                            dualStatus={dualOf(d.dayOfWeek)}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/*//! A FELIRAT A RAGADÓ FEJLÉC ALATT, A FOLYAMBAN ÁLL. Abszolút
              //! pozícióban (`top-20`) pont a ragadó blokk mögé esett, ami z-40
              //! — vagyis a hét egyetlen magyarázata láthatatlan volt. Üres
              //! héten amúgy sincs mit letakarnia: a rács alatta üres. */}
          {noData && (
            <div className="pointer-events-none z-20 mx-auto mt-4 w-fit max-w-[min(92%,32rem)] text-balance rounded-full border border-border bg-background/90 px-4 py-1.5 text-center text-sm text-muted-strong shadow-sm backdrop-blur">
              {weekPlanLabel(gridDays)}
            </div>
          )}

          <div
            ref={frameRef}
            //! A MORF-NÉV A KERETEN ÜL, nem a magas tartalmon: a view transition
            //! pillanatképe így nézetnyi marad. A rácstartalom több ezer pixel
            //! magas is lehet — arról készíteni pillanatképet hetente kétszer
            //! értelmetlen munka lenne a GPU-nak.
            style={canMorph ? { viewTransitionName: "tt-grid" } : undefined}
            className={cn(
              "flex flex-col transition-opacity duration-200",
              //! A GUMISZALAG KÍVÜLRE LÓG, ÉS ANNAK NEM SZABAD LÁTSZANIA. A
              //! héthatáron a rács eltolódik, a szomszéd nap sávja pedig a
              //! kereten KÍVÜLRŐL csúszik be — vágás nélkül mindkettő a lapra
              //! folyna, és vízszintes görgetést nyitna az egész oldalon. A
              //! `clip` (nem `hidden`) azért kell, mert az csak az EGYIK
              //! tengelyt zárja le: a rács függőlegesen görgethető marad.
              paging && "relative overflow-x-clip",
              pending && "opacity-55",
            )}
            aria-busy={pending}
          >
            {/*//* A szomszéd hét szélső napja — a húzás nyitotta résben. */}
            {paging && (
              <>
                <WeekEdgeHint
                  ref={edgePrevRef}
                  side="prev"
                  dayShort={DAY_SHORT[4]}
                  dateLabel={edgeDateLabel(addDaysKey(weekStart, -3))}
                />
                <WeekEdgeHint
                  ref={edgeNextRef}
                  side="next"
                  dayShort={DAY_SHORT[0]}
                  dateLabel={edgeDateLabel(addDaysKey(weekStart, 7))}
                />
              </>
            )}
            <div
              ref={scrollRef}
              data-tt-scroll
              onScroll={fullscreen ? handleScroll : undefined}
              className={cn(
                //! LAPOZÓS MÓD: a görgetés „beakad" a napokra — ez a natív
                //! swipe, JS gesztus nélkül. A `scroll-pl-12` KÖTELEZŐ a
                //! `snap-start` mellé: enélkül a böngésző a nap-oszlop bal
                //! szélét a KONTÉNER széléhez igazítja, vagyis pont a ragadó
                //! idősáv (w-12) ALÁ csúsztatja a nap első 48 pixelét. A
                //! görgetés-belső margó tolja el a „snapportot" az idősáv mellé.
                //! Ha kifér a hét, a görgetődoboz MEGSZŰNIK — nem esztétikából:
                //! az `overflow-x: auto` a függőleges tengelyt is görgetési
                //! dobozzá teszi, és a fölösleges doboz csak elrontja a
                //! görgetés-horgonyzást ott, ahol nincs is mit görgetni.
                fullscreen
                  ? paging &&
                      cn(
                        //! `overscroll-x-none`, nem `contain`: a `contain`
                        //! csak a LAPRA nem enged tovább, a doboz saját
                        //! visszapattanását meghagyja — az pedig a mi
                        //! gumiszalagunk tetejébe mozdítaná a rácsot (lásd „A
                        //! HÉTHATÁR ÁTHÚZÁSA").
                        "snap-x scroll-pl-12 overflow-x-auto overscroll-x-none",
                        //* Mindig kötelező tapadás — a részletes indoklás
                        //* fentebb, „A TAPADÁST NEM A LAP GÖRGETÉSE KAPCSOLJA".
                        "snap-mandatory",
                        //! A VÍZSZINTES ÉRINTÉS NEM A BÖNGÉSZŐÉ. A napi
                        //! lapozást mi visszük (lásd „A VÍZSZINTES HÚZÁS A
                        //! MIÉNK"), mert a natív lendület átfut a napokon. A
                        //! `pan-y` a böngészőnek szól: vízszintesen ne is
                        //! induljon el — függőlegesen viszont ugyanúgy ő
                        //! görget, a kompozitor szálán, mint eddig.
                        //*
                        //* A `pinch-zoom` KÜLÖN kell hozzá: a `pan-y` önmagában
                        //* a nagyítást is elvenné, a rács pedig pont az, amire
                        //* rá szoktak nagyítani.
                        "touch-pan-y touch-pinch-zoom",
                      )
                  : "overflow-x-auto",
              )}
            >
              <motion.div
                key={`${weekStart}-${selectedSubject}`}
                //! Ahol view transition fut, ott EZ NEM: két belépő mozdulat
                //! egymáson zajos. A Motion marad a tartalék (Firefox, beágyazott
                //! nézet), a morf pedig az elsődleges.
                initial={
                  animateGrid && !reduce && !canMorph
                    ? { opacity: 0, y: 8, scale: 0.992 }
                    : false
                }
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.32, ease: EASE }}
                //* `sm`-től nincs vízszintes görgető, tehát nem is lehet
                //* minimális szélesség: a napok a lap szélességét osztják el.
                className={cn("origin-top", !fullscreen && "min-w-[760px]")}
              >
                {/*//! FEJLÉC SOR — CSAK BEÁGYAZVA. A teljes nézetben a
                    //! nap-fejléc a görgetődobozon KÍVÜLRE költözött (lásd a
                    //! ragadó blokkot fentebb): odabent a függőleges görgetéskor
                    //! elúszna. A beágyazott kártya rácsa nem ragad sehol, ott
                    //! ez marad a fejléc. */}
                {!fullscreen && (
                  <div className="flex border-b border-border bg-card">
                    <div
                      className="relative z-10 w-12 shrink-0 bg-card"
                      aria-hidden
                    />
                    {gridDays.map((d) => (
                      <DayHeadCell
                        key={d.dateKey}
                        day={d}
                        paging={false}
                        dualStatus={dualOf(d.dayOfWeek)}
                      />
                    ))}
                  </div>
                )}

                {/*//! Test: idősáv + naposzlopok.
                    //! `w-max` LAPOZÓS MÓDBAN KÖTELEZŐ. Egy vízszintes
                    //! görgetődobozban a blokk-szintű gyerek szélessége a
                    //! DOBOZÉ marad (egy képernyőnyi), a nap-oszlopok pedig
                    //! túllógnak rajta. A `position: sticky` viszont a SAJÁT
                    //! szülődobozán belül ragad: egy képernyőnyi sor mellett az
                    //! idősáv az első oszlop után elengedne és kiúszna balra.
                    //! A `max-content` szélességgel a sor a teljes hetet
                    //! átfogja, tehát a tapadásnak végig van hova ragadnia.
                    //! (Mellékhaszon: a nap-vonal `inset-x-0`-ja is az egész
                    //! héten fut végig, nem csak a látható képernyőn.) */}
                <div
                  className={cn(
                    "relative flex bg-muted/25",
                    //* Nem lapozós módban a napok `flex-1`-gyel osztoznak a
                    //* lapon — ott a `max-content` összehúzná őket.
                    paging && "w-max",
                  )}
                >
                  {/* Idősáv (órák sorszáma + kezdés) */}
                  <div
                    data-tt-gutter
                    className={cn(
                      "z-20 w-12 shrink-0 border-r border-border bg-card",
                      //! `sticky left-0`: a natív tapadás a görgetéssel EGY
                      //! szálon mozog, tehát képkockára pontos — lásd
                      //! `pinLeft`. Csak lapozós módban: máshol nincs
                      //! vízszintes görgetés, viszont van `relative`-ra
                      //! szoruló, abszolút pozíciójú óraszám benne.
                      paging ? "sticky left-0" : "relative",
                    )}
                    style={{ height }}
                    aria-hidden
                  >
                    {gridPeriods.map((p) => (
                      <div
                        key={p.number}
                        className="absolute inset-x-0 flex flex-col items-end pr-2 leading-none"
                        style={{ top: top(p.startMin) }}
                      >
                        <span className="text-[13px] font-bold text-foreground/70">
                          {p.number}
                        </span>
                        <span className="mt-0.5 text-[10px] tabular-nums text-muted-strong">
                          {minLabel(p.startMin)}
                        </span>
                      </div>
                    ))}
                    {/*//* A pontos idő a RAGADÓ sávon ül: vízszintes görgetés
                        //* közben (mobil nap-lapozás) is a helyén marad. */}
                    {showRuler && nowMin !== null && (
                      <span
                        className="absolute right-1 z-10 -translate-y-1/2 rounded-[4px] bg-brand px-1 py-px text-[9px] font-bold leading-[1.35] tabular-nums text-brand-foreground"
                        style={{ top: top(nowMin) }}
                      >
                        {minLabel(nowMin)}
                      </span>
                    )}
                  </div>

                  {/*//! A HÉT SZINTVONALA. A tömör piros vonal továbbra is CSAK a
                      //! mai oszlopban van (az jelenti, hogy „most"); ez a halvány
                      //! szaggatott vonal az egész héten átfut, és azt mondja meg,
                      //! hol tart a NAP — így a hétfői oszlopra nézve is látod,
                      //! hogy a mostani napszakban mi szokott lenni. */}
                  {showRuler && nowMin !== null && (
                    <div
                      className="pointer-events-none absolute inset-x-0 z-[4] border-t border-dashed border-brand/25"
                      style={{ top: top(nowMin) }}
                      aria-hidden
                    />
                  )}

                  {gridDays.map((d, dayIndex) => {
                    const resolved = resolvedDays.get(d.dayOfWeek) ?? {
                      runs: [],
                      ghosts: [],
                      conflicts: [],
                    };
                    const dayEvents = events.filter(
                      (e) => e.dayOfWeek === d.dayOfWeek,
                    );
                    //* Rendes napon ez ugyanaz a tömb, amit a gutter mutat —
                    //* eltérő csengetésnél a nap saját vonalai.
                    const dayLines =
                      periodsOf(d) === periods
                        ? { rows: gridPeriods, last: lastPeriodEnd }
                        : linesFor(periodsOf(d));
                    const items = layoutDay(
                      resolved.runs,
                      resolved.ghosts,
                      dayEvents,
                    );
                    const showNow =
                      d.isToday &&
                      nowMin !== null &&
                      nowMin >= dayStart &&
                      nowMin <= dayEnd;
                    return (
                      <div
                        key={d.dateKey}
                        ref={(el) => {
                          dayRefs.current[dayIndex] = el;
                        }}
                        className={cn(
                          "relative min-w-0 border-l border-border/70",
                          fullscreen
                            ? paging
                              ? //! `snap-always`: egér és érintőpad mellett ez
                                //! tartja meg az „egy lépés = egy nap"
                                //! szabályt. Érintésre NEM elég — a mobil
                                //! WebKit a saját lendülete közben átfut
                                //! rajta —, ott a húzást mi visszük.
                                "shrink-0 snap-start snap-always"
                              : "flex-1 shrink"
                            : "flex-1",
                          d.isToday && "bg-primary/[0.05]",
                        )}
                        style={{ ...colStyle, height }}
                      >
                        {/*//! A DUÁLIS OSZLOP SÁVOZOTT, NEM SZÍNEZETT. Egy tömör
                            //! alapszín-tint itt összekeverhető lenne a mai nap
                            //! már meglévő tintjével (`bg-primary/[0.05]`) — a
                            //! rézsútos sávozás viszont semmi mással nem
                            //! téveszthető össze, és a mai + duális nap is
                            //! egyértelmű marad. Elsőként áll a sorban, tehát a
                            //! vonalak és a kártyák fölé rajzolódnak. */}
                        {dualOf(d.dayOfWeek) === "dual" && (
                          <div
                            className="pointer-events-none absolute inset-0"
                            style={{
                              backgroundImage:
                                "repeating-linear-gradient(135deg, color-mix(in oklab, var(--primary) 9%, transparent) 0 5px, transparent 5px 11px)",
                            }}
                            aria-hidden
                          />
                        )}

                        {/*//* Óra-elválasztó vonalak. Rendes napon a gutter
                            //* időcímkéivel egy vonalban; rövidített napon a
                            //* nap saját csengetése szerint — ott a gutterhez
                            //* képesti eltérés maga az információ. */}
                        {dayLines.rows.map((p) => (
                          <div
                            key={p.number}
                            className={cn(
                              "pointer-events-none absolute inset-x-0 border-t",
                              d.bells
                                ? "border-dashed border-brand/35"
                                : "border-border/45",
                            )}
                            style={{ top: top(p.startMin) }}
                          />
                        ))}
                        {dayLines.last !== null && (
                          <div
                            className={cn(
                              "pointer-events-none absolute inset-x-0 border-t",
                              d.bells
                                ? "border-dashed border-brand/35"
                                : "border-border/45",
                            )}
                            style={{ top: top(dayLines.last) }}
                          />
                        )}

                        {/* Kártyák */}
                        <AnimatePresence initial={false}>
                          {items.map((it) => {
                            const style = {
                              top: top(it.startMin) + 1.5,
                              height: Math.max(
                                (it.endMin - it.startMin) * pxPerMin - 3,
                                18,
                              ),
                              width: `calc(${100 / it.lanes}% - 3px)`,
                              left: `calc(${(100 / it.lanes) * it.lane}% + 1px)`,
                            };
                            //! IDŐ-MORFOLÓGIA — csak a MAI oszlopban értelmes:
                            //! máshol a „lefutott" jelentés nem létezik.
                            const onToday =
                              fullscreen && d.isToday && nowMin !== null;
                            const past = onToday && it.endMin <= nowMin;
                            const active =
                              onToday &&
                              it.startMin <= nowMin &&
                              nowMin < it.endMin;
                            const dayLabel = `${d.name} ${d.dateLabel}`;
                            if (it.event) {
                              const event = it.event;
                              return (
                                <EventCard
                                  key={it.key}
                                  event={event}
                                  style={style}
                                  past={past}
                                  active={active}
                                  roomFirst={fullscreen}
                                  registerCard={
                                    fullscreen
                                      ? (el) => registerCard(it.key, el)
                                      : undefined
                                  }
                                  onOpen={
                                    fullscreen
                                      ? () =>
                                          openFocus({
                                            kind: "event",
                                            key: it.key,
                                            event,
                                            dayLabel,
                                          })
                                      : undefined
                                  }
                                />
                              );
                            }
                            if (it.ghost) {
                              return (
                                <GhostCard
                                  key={it.key}
                                  ghost={it.ghost}
                                  style={style}
                                  onUndo={undoByIdentity}
                                />
                              );
                            }
                            const run = it.run as LessonRun;
                            return (
                              <LessonBlock
                                key={it.key}
                                run={run}
                                style={style}
                                pxPerMin={pxPerMin}
                                reduce={Boolean(reduce)}
                                past={past}
                                active={active}
                                roomFirst={fullscreen}
                                registerCard={
                                  fullscreen
                                    ? (el) => registerCard(it.key, el)
                                    : undefined
                                }
                                onOpen={
                                  fullscreen
                                    ? () =>
                                        openFocus({
                                          kind: "lesson",
                                          key: it.key,
                                          run,
                                          dayLabel,
                                        })
                                    : undefined
                                }
                                muted={
                                  hoveredSubject !== null &&
                                  (run.lesson.subjectShort ||
                                    run.lesson.subject) !== hoveredSubject
                                }
                                onHoverChange={
                                  canHover
                                    ? (subject, hovering) =>
                                        setHoveredSubject((cur) =>
                                          hovering
                                            ? subject
                                            : cur === subject
                                              ? null
                                              : cur,
                                        )
                                    : undefined
                                }
                                onUndoMerge={undoByIdentity}
                              />
                            );
                          })}
                        </AnimatePresence>

                        {/* Feloldatlan ütközések: az összevonás gombja */}
                        {/*//! Szűretlenül nincs: ott minden ütközés
                            //! „feloldatlan", és egy itt hozott döntés a
                            //! háttérben várakozó szűrésekhez íródna. */}
                        {!glancing &&
                          resolved.conflicts.map((cluster) => (
                            <MergeButton
                              key={`${d.dateKey}-${cluster.key}-${cluster.startMin}`}
                              cluster={cluster}
                              dayName={d.name}
                              top={top(cluster.startMin)}
                              height={
                                (cluster.endMin - cluster.startMin) * pxPerMin
                              }
                              onChoose={choose}
                            />
                          ))}

                        {/* "Most" vonal */}
                        {showNow && nowMin !== null && (
                          <div
                            className="pointer-events-none absolute inset-x-0 z-10 flex items-center"
                            style={{ top: top(nowMin) }}
                            aria-hidden
                          >
                            <span className="relative -ml-[3px] flex size-1.5">
                              {!reduce && (
                                <span className="absolute inline-flex size-full animate-ping rounded-full bg-brand/50" />
                              )}
                              <span className="relative inline-flex size-1.5 rounded-full bg-brand" />
                            </span>
                            <span className="h-px flex-1 bg-brand/70" />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            </div>
          </div>

          {/*//* Beágyazva a jelmagyarázat állandó sor marad (ott van rá hely);
              //* teljes nézetben a fejléc buborékjába költözött. */}
          {!fullscreen && (
            <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-border px-4 py-3 text-xs text-muted-strong">
              <LegendItems />
            </div>
          )}
        </div>
      )}

      {/* Részletlap — a megérintett kártyából morfol ki */}
      {focus && (
        <LessonSheet
          target={focus}
          mode={mode}
          viewedShort={subjectShort}
          morph={canMorph}
          onClose={closeFocus}
          onUndoMerge={undoByIdentity}
          onHide={glancing ? undefined : hide}
        />
      )}
    </div>
  );
}

//* ---------------------------------------------------------------------------
//* Jelmagyarázat — egy tartalom, két hordozó
//* ---------------------------------------------------------------------------
//* Beágyazva vízszintes sor a rács alatt, teljes nézetben buborék a fejlécben.
//* A `stacked` az utóbbi: ott minden tétel látszik (nincs szűk hely), egymás alatt.
function LegendItems({ stacked = false }: { stacked?: boolean }) {
  const row = stacked ? "flex items-center gap-2" : "flex items-center gap-1.5";
  return (
    <>
      <span className={row}>
        <span
          className={cn("size-3 shrink-0 border acc-tint", CELL_RADIUS)}
          style={{ ["--acc-h"]: 210 } as React.CSSProperties}
        />
        Tanóra
      </span>
      <span className={row}>
        <span
          className={cn("size-3 shrink-0 border acc-break", CELL_RADIUS)}
          style={{ ["--acc-h"]: 210 } as React.CSSProperties}
        />
        Szünet
      </span>
      <span className={row}>
        <span className="flex size-3.5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Merge className="size-2" aria-hidden />
        </span>
        Ütköző órák
      </span>
      <span
        className={cn(
          row,
          !stacked && "ml-auto hidden items-center gap-1.5 sm:flex",
        )}
      >
        <span className="size-1.5 shrink-0 rounded-full bg-brand" />
        Most
      </span>
    </>
  );
}

//! A jelmagyarázat ÉS a billentyűk egy helyen. A gyorsbillentyű, amit sehol nem
//! írunk ki, nem funkció — itt találja meg, aki keresi, és nem foglal helyet
//! annak, aki nem.
function LegendMenu() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" data-key="j" className={sheetItem()}>
          <Info className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <SheetItemBody
            label="Jelmagyarázat"
            hint="Mit jelentenek a jelölések"
          />
        </Button>
      </PopoverTrigger>
      <PopoverContent {...SHEET_POPOVER} className="w-[17rem] p-3">
        <p className="text-sm font-semibold text-foreground">Jelmagyarázat</p>
        <div className="mt-2 flex flex-col gap-1.5 text-xs text-muted-strong">
          <LegendItems stacked />
        </div>
        {/*//! BILLENTYŰ NINCS TELEFONON. A buborék tartalmának több mint fele
            //! négy gyorsbillentyű — érintőképernyőn egyikre sincs mód, viszont
            //! ~110 px-nyi görgetnivalót tesz egy amúgy rövid súgóba. A
            //! jelmagyarázat marad, a billentyűk `sm`-től jönnek elő. */}
        <p className="mt-3 hidden border-t border-border pt-3 text-sm font-semibold text-foreground sm:block">
          Billentyűk
        </p>
        <dl className="mt-2 hidden grid-cols-[auto_1fr] items-center gap-x-2.5 gap-y-1.5 text-xs text-muted-strong sm:grid">
          <dt className="flex gap-1">
            <Kbd>←</Kbd>
            <Kbd>→</Kbd>
          </dt>
          <dd>Előző / következő hét</dd>
          <dt>
            <Kbd>T</Kbd>
          </dt>
          <dd>Vissza a mai hétre</dd>
          <dt>
            <Kbd>1</Kbd>–<Kbd>5</Kbd>
          </dt>
          <dd>Ugrás a napra</dd>
          <dt>
            <Kbd>Esc</Kbd>
          </dt>
          <dd>Részletlap bezárása</dd>
          {/*//! A SÁV GOMBJAINAK IS VAN BILLENTYŰJE, ÉS ITT SEM MARADHAT
              //! KIMONDATLANUL — de tíz sorban felsorolni fölösleges: mindegyik
              //! ott áll a saját buborékában, abban a pillanatban, amikor az
              //! ember ránéz a gombra (`chrome/rail-tips.tsx`). Ez a sor csak
              //! azt mondja meg, hogy ÉRDEMES odanézni. */}
          <dt>
            <Kbd>betű</Kbd>
          </dt>
          <dd>Az eszköztár gombjai — a betű a buborékban áll</dd>
        </dl>
        {/*//! ITT NINCS LÁBLÉC, MERT A LAP NEM GÖRDÜL. A heti rács
            //! szándékosan a teljes képernyőt tölti ki: alá tett lábléc csak
            //! úgy lenne elérhető, ha a lapot görgethetővé tennénk — pont azt
            //! rontanánk el, amiért ez a nézet létezik. A lábjegyzetek ezért
            //! ebbe a buborékba költöznek, UGYANABBÓL a listából, amit a
            //! lábléc rajzol (`site-footer.tsx`): egy forrás, két megjelenés.
            //* Álló listaként, mert a buborék keskeny — vízszintesen a
            //* hivatkozások fele a második sorba törne. */}
        <div className="mt-3 border-t border-border pt-3">
          <SiteFooterLinks className="flex-col items-start gap-y-2.5" />
          <p className="mt-2.5 text-xs text-muted-foreground">
            Készítette Szalai Bence
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function min(values: number[]): number | null {
  return values.length ? Math.min(...values) : null;
}
function max(values: number[]): number | null {
  return values.length ? Math.max(...values) : null;
}

function ChoosePrompt({
  mode,
  hasSubjects,
}: {
  mode: TimetableSubjectKind;
  hasSubjects: boolean;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-16 text-center">
      <CalendarDays className="size-8 text-muted-foreground" aria-hidden />
      <p className="max-w-sm text-pretty text-sm text-muted-strong">
        {mode === "teacher"
          ? hasSubjects
            ? "Válaszd ki a nevedet a jobb felső sarokban, és megjelenik az órarended."
            : "Nincs kiválasztva tanár, és a tanárlista sem érhető el most."
          : hasSubjects
            ? "Válaszd ki az osztályod a jobb felső sarokban, és megjelenik az órarend."
            : "Nincs beállítva az osztályod, és az osztálylista sem érhető el most."}
      </p>
    </div>
  );
}

//! A HIBAKÉPERNYŐ HÁROM SZINTJE. Cím: mi történt. Mondat: kinél van a hiba —
//! ez a legfontosabb, mert a diák másképp reagál arra, hogy „a te osztályod
//! rossz", mint arra, hogy „az iskola szervere áll". Halvány sor alul: mit
//! tehet. A technikai részlet (HTTP-kód) a legvégén, apró betűvel — nem neki
//! szól, hanem annak, akinek jelenti a hibát.
const ERROR_FALLBACK: TimetableErrorInfo = {
  kind: "network",
  title: "Az órarend most nem elérhető",
  message:
    "A Jedlikinfo API nem érhető el — a hiba külső forrás miatt állt elő, nem ezen az oldalon.",
  retryable: true,
};

function CalendarError({
  error,
  pending,
  onRetry,
}: {
  error?: TimetableErrorInfo;
  pending?: boolean;
  onRetry: () => void;
}) {
  const info = error ?? ERROR_FALLBACK;
  //* Az „elszakadt a kapcsolat" fajta hibáknak saját ikonja van: egy pillantásból
  //* látszik, hogy nem az órarenddel, hanem az eléréssel van baj.
  const external =
    info.kind === "offline" ||
    info.kind === "network" ||
    info.kind === "timeout" ||
    info.kind === "server";
  const Icon = external ? CloudOff : AlertTriangle;

  return (
    <div
      role="alert"
      className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-16 text-center"
    >
      <Icon className="size-8 text-muted-foreground" aria-hidden />
      <div className="flex max-w-sm flex-col gap-1">
        <p className="text-pretty text-sm font-semibold text-foreground">
          {info.title}
        </p>
        <p className="text-pretty text-sm text-muted-strong">{info.message}</p>
        {info.hint && (
          <p className="text-pretty text-xs text-muted-foreground">
            {info.hint}
          </p>
        )}
      </div>
      {info.retryable && (
        <Button
          variant="outline"
          size="sm"
          onClick={onRetry}
          disabled={pending}
        >
          {pending ? "Betöltés…" : "Újra"}
        </Button>
      )}
      {info.detail && (
        <p className="font-mono text-[11px] text-muted-foreground/70">
          {info.detail}
        </p>
      )}
    </div>
  );
}
