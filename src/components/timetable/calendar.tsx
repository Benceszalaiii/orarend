"use client";

import { hu } from "date-fns/locale/hu";
import {
  AlertTriangle,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CloudOff,
  // ExternalLink, //! a szakmai portál linkjével együtt visszakapcsolni
  Info,
  Merge,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { flushSync } from "react-dom";
import {
  SITE_BAR_CLUSTER,
  SITE_BAR_MAX,
  SITE_BAR_METRICS,
  SiteNav,
} from "@/components/site-nav";
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
  TimetableClass,
  TimetableError as TimetableErrorInfo,
  TimetableLesson,
  TimetableView,
} from "@/lib/timetable";
import {
  buildTimetableView,
  describeTimetableFailure,
  groupHalf,
  saveCachedClass,
} from "@/lib/timetable";
import {
  type GhostBlock,
  type LessonRun,
  preferenceRows,
  preferencesHiding,
  resolveDay,
} from "@/lib/timetable-merge";
import { reportClassUse } from "@/lib/usage";
import { cn } from "@/lib/utils";
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
//* sávja is ebből él (lásd `site-nav.tsx`), különben a váltó a két lapon más
//* x-en állna.
const MAX_SHELL = SITE_BAR_MAX;

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
      {day.isToday && (
        <span
          className="absolute inset-x-0 bottom-0 h-0.5 bg-primary"
          aria-hidden
        />
      )}
    </>
  );
  const base = cn(
    "relative min-w-0 border-l border-border/70 px-2 py-2.5 text-center",
    paging ? "shrink-0" : "flex-1 shrink",
    day.isToday && "bg-primary/[0.06]",
  );
  if (!paging) {
    return (
      <div className={base} style={style}>
        {inner}
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={onJump}
      style={style}
      aria-label={`Ugrás ide: ${day.name} ${day.dateLabel}`}
      className={cn(
        base,
        "transition-colors hover:bg-muted/50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none",
      )}
    >
      {inner}
    </button>
  );
}

export function TimetableCalendar({
  initialView,
  classes,
  classesError,
  variant = "embedded",
  heading,
  trailing,
  dualStatusForDay,
  dualSetup,
  notifySetup,
  loadView,
  reloadToken,
}: {
  initialView: TimetableView;
  classes: TimetableClass[];
  //* Ha az osztálylista sem jött meg, a választó üres — a „válassz osztályt”
  //* felszólítás ilyenkor félrevezető, ezért a lista hibáját is átvesszük.
  classesError?: TimetableErrorInfo;
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
  //! DUÁLIS JELÖLÉS — DE A SZABÁLYT NEM A RÁCS ISMERI. Ugyanaz a rajz két
  //! forrásból: a `/dualis` a KÖNYVSZERINTI blokkot mutatja (`dualStatusOf`),
  //! az `/orarend` viszont a diák SAJÁT, kézzel beállított beosztását
  //! (`dualStatusFor`). A rács ezért nem dönt, hanem KÉRDEZ — napra, a hét
  //! A/B-jelölésével és az ÉPPEN nézett osztállyal, mert a beosztás
  //! osztályonként külön van. `undefined` válasz = ezen a lapon (vagy ennél az
  //! osztálynál) nincs duális jelölés: a rács pontosan úgy néz ki, mint eddig.
  dualStatusForDay?: (day: {
    dayOfWeek: number;
    weekLetter: string;
    classShort: string;
  }) => DualStatus | undefined;
  //! A BEÁLLÍTÓ IS A SÁVBAN LAKIK, DE NEM A RÁCS TALÁLJA KI. Ugyanaz a határ,
  //! mint a `dualStatusForDay`-nél: a rács csak azt tudja, MELYIK osztály
  //! MELYIK hetét nézik éppen — a beosztás tárolása és a párbeszéd a lapé.
  //! Ezért nem komponenst kap, hanem egy hívást, amit a nézett osztállyal és
  //! héttel kérdez meg; ami nem ad vissza semmit (a `/dualis`, az `/event`),
  //! annál a sáv változatlan.
  dualSetup?: (ctx: {
    classShort: string;
    weekLetter: string;
  }) => React.ReactNode;
  //! AZ ÉRTESÍTÉS-HARANG UGYANEZEN A HATÁRON ÁLL. A rács azt tudja, MELYIK
  //! osztály órarendjét nézik éppen — a feliratkozás, az engedélykérés és a
  //! párbeszéd viszont a lapé (`components/pwa/notification-menu.tsx`). Ezért
  //! itt is hívás, nem komponens; ami nem ad vissza semmit (a `/dualis`, az
  //! `/event`), annál a sáv változatlan.
  notifySetup?: (ctx: { classShort: string }) => React.ReactNode;
  //! SAJÁT BETÖLTŐ. A `/dualis` nem egy osztály órarendjét lapozza, hanem egy
  //! TERVET, ami két osztály óráiból áll össze — a hét-lapozás viszont
  //! ugyanaz a mozdulat. Ha meg van adva, a rács ezen keresztül kér új hetet
  //! az `buildTimetableView` helyett; minden más (lapozás, billentyűk,
  //! nyomtatás) változatlanul működik.
  loadView?: (weekStart: string) => Promise<TimetableView>;
  //! ÚJRATÖLTÉSI JEL. A tervválasztó nem hetet vált, hanem ugyanannak a hétnek
  //! egy MÁSIK tervét kéri — hálózat nélkül. A szülő ennek az értéknek a
  //! változtatásával kéri újra a `loadView`-t az aktuális hétre.
  reloadToken?: string | number;
}) {
  const [view, setView] = useState<TimetableView>(initialView);
  const [selectedClass, setSelectedClass] = useState<string>(
    initialView.resolvedClass?.short ?? "",
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
  const [datePickerOpen, setDatePickerOpen] = useState(false);
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

  const classShort = view.resolvedClass?.short ?? "";

  //! MELYIK OSZTÁLYT NÉZIK — ÉS SEMMI MÁST. Osztályonként és naponta egyszer
  //! eszközönként (a deduplikáció a `reportClassUse`-ban van). A `loadView`
  //! ugyanaz a határ, mint a `saveCachedClass`-nál: a `/dualis` „osztálya" egy
  //! TERV azonosítója (`A`, `B`…), nem létező osztály — azt nincs mit mérni.
  useEffect(() => {
    if (loadView) return;
    reportClassUse(classShort);
  }, [classShort, loadView]);

  const prefsApi = useMergePreferences({
    classShort,
  });
  const { prefs, choose, hide, undo, undoMany, reset } = prefsApi;

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

  //! A LAPOZÁS IRÁNYA vizuális információ: a rács arra csúszik ki, amerre mész.
  //! Osztályváltásnál nincs irány (`null`) — ott a rács tartalma cserélődik, nem
  //! a helye, tehát áttűnés a helyes mozdulat.
  const load = async (
    nextWeek: string,
    classOverride?: string,
    dir: "next" | "prev" | null = null,
  ) => {
    const cls = classOverride ?? selectedClass;
    setAnimateGrid(true);
    setPending(true);
    try {
      const res = loadView
        ? await loadView(nextWeek)
        : await buildTimetableView({
            userClass: cls || null,
            weekStart: nextWeek,
            classOverride: cls || undefined,
          });
      const next = res.resolvedClass?.short ?? cls;
      weekTransition(
        () => {
          setView(res);
          setSelectedClass(next);
        },
        { enabled: canMorph, dir },
      );
      //* A választást csak SIKERES betöltés után jegyezzük meg, hogy a
      //* következő megnyitás ne a `PUBLIC_DEFAULT_CLASS`-ra essen vissza.
      //! SAJÁT BETÖLTŐNÉL NEM MENTÜNK: a `/dualis` „osztálya" egy terv, nem
      //! létező osztály — elmentve az `/orarend` következő megnyitása próbálná
      //! betölteni, és ismeretlen osztályra futna.
      if (next && !loadView) saveCachedClass(next);
    } catch (err) {
      //! Ide csak akkor jutunk, ha maga a betöltés dobott (a hálózati hibákat
      //! a `buildTimetableView` már nevesítve adja vissza) — a kivétel fajtáját
      //! itt sem dobjuk el, mert ez mondja meg, kinél van a hiba.
      setView((w) => ({
        ...w,
        ok: false,
        error: describeTimetableFailure(err),
      }));
    } finally {
      setPending(false);
    }
  };

  //! A TERVVÁLTÁS ÚJRATÖLTÉS, DE NEM HÁLÓZATI. A `loadView` a szülőnél a már
  //! letöltött hét nyers adatából állítja elő a másik tervet, tehát ez a
  //! „betöltés" azonnali. A `load` függvényt szándékosan NEM tesszük a
  //! függőségek közé: minden renderben új, és a hatás ettől végtelen ciklusba
  //! esne — a jelre viszont pontosan egyszer kell lefutnia.
  const loadRef = useRef(load);
  loadRef.current = load;
  const firstToken = useRef(true);
  useEffect(() => {
    if (reloadToken === undefined) return;
    if (firstToken.current) {
      firstToken.current = false;
      return;
    }
    loadRef.current(view.weekStart);
    //* `view.weekStart` szándékosan kimarad: a jel az egyetlen kiváltó ok, a
    //* hetet a friss `load` úgyis a ref-ből olvassa.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadToken]);

  //* Hét-lapozás egy lépéssel — a gombok és a billentyűk közös bejárata.
  const step = (delta: number) =>
    load(
      addDaysKey(view.weekStart, delta * 7),
      undefined,
      delta > 0 ? "next" : "prev",
    );

  const { days, periods, events, weekStart } = view;

  const abWeek = days.find((d) => d.week === "A" || d.week === "B")?.week;
  //! A NAP SAJÁT JELÖLÉSE HIÁNYOZHAT (a Jedlikinfo üres `week`-et ad pl. egy
  //! tanítás nélküli hétfőre), a HÉTÉ viszont nem: a duális állapotot ezért a
  //! hét betűjéből számoljuk, nem a napéból.
  const dualOf = useCallback(
    (dayOfWeek: number): DualStatus | undefined =>
      dualStatusForDay?.({
        dayOfWeek,
        weekLetter: abWeek ?? "",
        classShort,
      }),
    [dualStatusForDay, abWeek, classShort],
  );

  //! ─── A DUÁLIS NAP HELYÉN EGY BLOKK ÁLL ───────────────────────────────────
  //! Azon a napon a munkahelyen vagy: az osztály órarendje NEM a te napod. A
  //! rács ezért nem tesz úgy, mintha lenne órád — a nap óráit egyetlen
  //! 8:00–16:00 kártya váltja fel, óra-bontás nélkül. (Ugyanaz a döntés, ami a
  //! `/dualis` tervei mögött áll, csak ott a terv eleve enélkül épül fel.)
  //!
  //! CSAK OTT, AHOL VAN MIT FELVÁLTANI. Egy adat nélküli hétre (szünet,
  //! forráshiba) nem találunk ki duális napokat: a hét üressége a hír, nem a
  //! munkahely.
  const lessons = useMemo(() => {
    if (!dualStatusForDay || view.lessons.length === 0) return view.lessons;
    const dualDays = days.filter((d) => dualOf(d.dayOfWeek) === "dual");
    if (dualDays.length === 0) return view.lessons;
    const dualDows = new Set(dualDays.map((d) => d.dayOfWeek));
    return [
      ...view.lessons.filter((l) => !dualDows.has(l.dayOfWeek)),
      //* A `/dualis` terveiben már benne van ugyanez a blokk — a szűrés miatt
      //* az eredetit itt is a sajátunk váltja fel, azonos tartalommal.
      ...dualDays.map(dualBlockLesson),
    ];
  }, [view.lessons, days, dualOf, dualStatusForDay]);

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
  //! GÖRÖG-E FÜGGŐLEGESEN IS a rács. Ez nem statisztika: ettől függ, milyen
  //! erős a vízszintes tapadás (lásd a görgetődoboz osztályainál).
  const [vScroll, setVScroll] = useState(false);
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
      //! Függőleges görgetés CSAK akkor van, ha a lépték-határ ütött be — a
      //! címsor mozgása már nem csinál ilyet, mert a kis viewporthoz mérünk.
      setVScroll(MIN_PX_PER_MIN * span > room + 1);
    };
    //* `pending` csak azért a függőségben, mert a betöltés után a keret tényleges
    //* geometriája csak később áll be — ilyenkor újra mértünk.
    void pending;
    measure();
    const ro = new ResizeObserver(measure);
    if (frameRef.current) ro.observe(frameRef.current);
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
  //! A `mandatory` az egyetlen jó lapozás: a félbehagyott swipe is egész napra
  //! áll be, sosem maradsz két nap között, és sosem kell „pontosan" görgetni.
  //! Ezért NEM gyengítjük — sem mutatóeszköz, sem görgetés miatt.
  //!
  //! A régi ütközésnek két oka volt, és mindkettőt a forrásánál oldjuk meg:
  //!
  //!  1. A mobil böngésző címsora ki-be csúszott, ezzel átméretezte a rácsot, a
  //!     snap-doboz pedig minden átméretezéskor ÚJRA tapad — a lap magától
  //!     lapozott. Megoldás: a lépték a KIS viewporthoz (`100svh`) igazodik,
  //!     tehát a rács magassága görgetés közben meg sem mozdul (lásd `svhRef`).
  //!
  //!  2. Ahol a nap tényleg nem fér ki (fekvő telefon, nagyon hosszú nap), ott
  //!     függőlegesen is görögni kell — és a felfelé húzás sosem tökéletesen
  //!     függőleges. A pár képpontos vízszintes elcsúszást a `mandatory`
  //!     kötelezően kiigazítja a szomszéd napra. Megoldás lentebb: a tapadás a
  //!     függőleges görgetés IDEJÉRE szünetel, majd visszakapcsol — és mivel
  //!     közben a vízszintes pozíció nem mozdult el érdemben, a visszakapcsolás
  //!     ugyanarra a napra igazít vissza, ahol voltál.
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
  const gridPeriods = periods.filter(
    (p) => p.startMin >= dayStart && p.startMin <= dayEnd,
  );
  const lastLine = gridPeriods.length
    ? gridPeriods[gridPeriods.length - 1].endMin
    : null;
  //* A záróvonal csak akkor kell, ha a tartományon BELÜL van.
  const lastPeriodEnd =
    lastLine !== null && lastLine <= dayEnd ? lastLine : null;

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
        //! A csengetési rend KELL a feloldáshoz: ebből jönnek a többórás blokkon
        //! BELÜLI szünetek (a suli a dupla órát egy kártyaként adja vissza).
        resolveDay(byDay.get(d.dayOfWeek) ?? [], prefs, periods),
      ]),
    );
  }, [lessons, prefs, gridDays, periods]);

  const rows = useMemo(() => preferenceRows(prefs, lessons), [prefs, lessons]);

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
    track.style.transform = `translateX(${-container.scrollLeft}px)`;
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

  //! A TAPADÁS SZÜNETELTETÉSE FÜGGŐLEGES GÖRGETÉS ALATT.
  //! Csak ott kell, ahol egyáltalán VAN függőleges görgetés (`vScroll`) — a
  //! normál, kiférő napon a figyelő fel sem kerül. A lap görgetése közben a
  //! doboz nem tapad, tehát a mozdulat vízszintes összetevője nem visz sehova;
  //! a görgetés elülte után visszakapcsol, és a legközelebbi naphoz igazít —
  //! ez az az egy nap, ahol amúgy is álltál.
  //* A `scrollSnapType` közvetlenül a stíluson, nem állapotban: egy görgetés
  //* több száz eseményt ad, és ebből egyetlen React-újrarajzolás sem kell.
  useEffect(() => {
    if (variant !== "fullscreen" || !vScroll) return;
    const el = scrollRef.current;
    if (!el) return;
    let restore: number | undefined;
    const onScroll = () => {
      el.style.scrollSnapType = "none";
      window.clearTimeout(restore);
      restore = window.setTimeout(() => {
        el.style.scrollSnapType = "";
      }, 140);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.clearTimeout(restore);
      el.style.scrollSnapType = "";
    };
  }, [variant, vScroll]);

  const goToDay = (index: number) => {
    const container = scrollRef.current;
    const el = dayRefs.current[index];
    if (!container || !el) return;
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
    container.scrollTo({ left: el.offsetLeft - GUTTER, behavior: "auto" });
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
    container.scrollTo({ left: el.offsetLeft - GUTTER, behavior: "auto" });
    //* A ref-et is KÉZZEL írjuk: az elrendezés-változás utáni visszaigazítás
    //* (`alignRef`) egy rAF-ban ezt olvassa, és az még a React újrarajzolása
    //* előtt lefuthat — különben a nulladik napra igazítana vissza.
    activeDayRef.current = index;
    setActiveDay(index);
  }, [variant, gridDays, colWidth]);

  //* Új hét/osztály betöltése után a keret újra renderelődhet görgetett állapotban:
  //* ilyenkor azonnal vissza kell tűzni a nap-fejléc sínjét, nehogy a lefordított
  //* helyzete a betöltés utáni első görgetésig a rossz pozícióban tétlenkedjen.
  //* (Az idősáv natívan ragad, azzal itt nincs teendő.)
  useEffect(() => {
    //* `weekStart`/`selectedClass` csak azért kell a függőségben, mert ezek
    //* cserélik a rács kulcsát (keret-remount); a remount után itt tűzzük
    //* vissza a sínt, ha a görgetés pozíciója megmaradt.
    void weekStart;
    void selectedClass;
    pinLeft();
  }, [pinLeft, weekStart, selectedClass]);

  //* A „ma" csak akkor kérdés, ha a mai nap a nézett hétben van; a bizonytalan
  //* („unknown", jelöletlen hét) állapotról pedig nem írunk ki jelvényt.
  const todayDow = gridDays.find((d) => d.isToday)?.dayOfWeek;
  const todayStatus = todayDow !== undefined ? dualOf(todayDow) : undefined;
  const todayDual =
    todayStatus === "dual" || todayStatus === "school" ? todayStatus : null;

  const hasClass = Boolean(view.resolvedClass);
  //* A NYERS órákból: a duális blokkokat mi tettük a rácsra, azoktól a hét még
  //* ugyanolyan üres marad — a „nincs adat" jegyzet nem hazudhat róla.
  const noData = view.ok && view.lessons.length === 0 && events.length === 0;
  const isCurrentWeek = weekStart === mondayKey(todayKey());

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
          meta: [r.rooms.join(" · "), r.lesson.teacherShort].filter(Boolean),
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
      load(mondayKey(todayKey()));
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

  return (
    <div
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
          {view.resolvedClass?.name ?? view.resolvedClass?.short ?? "Órarend"}
          <span className="ml-2 font-medium text-muted-strong">
            {weekLabel(weekStart)}
          </span>
          {abWeek && (
            <span className="ml-2 font-medium text-muted-strong">
              · {abWeek} hét
            </span>
          )}
        </p>
      )}

      {/* Eszköztár — teljes nézetben ez a lap fejléce is */}
      {/*//! A SÁV NEM EGY TÖRDELŐ LISTA, HANEM KÉT HASÁB. Amíg egyetlen
          //! `flex-wrap` sor volt, a lapváltó a lista VÉGÉN ült, és hogy
          //! hányadik sorba esik, azt a mellette álló tartalom döntötte el: a
          //! hét-címke hossza, az A/B jelvény megléte, a duális gomb, a
          //! `/dualis` tervválasztója. Mérve: 375 px-en a harmadik sorban
          //! (126 px), 1024 px-en a másodikban (58 px), 1120 px-en az elsőben
          //! (13 px) — ugyanaz a gomb, három magasságban, tartalomtól függően.
          //! Egy törésponttal ezt nem lehet megfogni, mert a törés helye maga is
          //! tartalomfüggő.
          //*
          //* Ezért a NÉZET vezérlői (jelmagyarázat, szűrések, osztály, lapváltó)
          //* saját, `auto` szélességű hasábot kapnak a rács szélén, a HÉT
          //* vezérlői pedig a mellette lévő, szabadon tördelő hasábot. Az
          //* `items-start` miatt a jobb hasáb teteje mindig a sáv teteje —
          //* akárhány sorba tördel a bal oldal.
          //*
          //! A KÉT HASÁB CSAK `lg`-TŐL ÁLL EGYMÁS MELLETT, és ez mérés, nem
          //! ízlés: 768 px-en egymás mellé rakva a bal hasáb egy plusz sort
          //! tördelt, és a sáv 99-ről 131 px-re hízott — 32 px, amit egy
          //! 100dvh-s lapon a RÁCS fizet meg. `lg` alatt tehát egy hasáb van, és
          //! a nézet-vezérlők állnak elöl: ott a lapváltó és az osztály
          //! fontosabb, mint a hetelő. Így a sáv magassága egyetlen méretben sem
          //! nőtt — csak a sorok sorrendje változott.
          //*
          //! A FORRÁS SORRENDJE A TELEFONÉ. A nézet-vezérlők a DOM-ban is elöl
          //! állnak, nem `order`-rel felhozva — így billentyűvel és
          //! képernyőolvasóval ugyanabban a sorrendben jönnek, ahogy látszanak.
          //! `lg`-től a hét hasábja csúszik vizuálisan előre (`lg:order-1`); ott
          //! a két hasáb egy sávban ül egymás mellett, és a fókusz sorrendje
          //! „melyik nézet, melyik osztály → melyik hét" marad — a lapszintű
          //! vezérlő előbb, a nézeten belüli utána. */}
      <div
        className={cn(
          "grid shrink-0 grid-cols-1 items-start gap-y-2 border-b border-border px-3 py-2.5 sm:px-4 lg:grid-cols-[minmax(0,1fr)_auto]",
          //* Teljes nézetben ez a sáv a lap fejléce is — a mértana ezért a
          //* közös szerződésből jön, nem innen (lásd `site-nav.tsx`).
          fullscreen && cn(SITE_BAR_METRICS, "gap-y-2"),
          //* A papíron a hét maga a tartalom; a vezérlők nem nyomtathatók.
          "print:hidden",
        )}
      >
        {/*//! A NÉZET hasábja. Ugyanaz a mértan, mint a `/ma` sávjának jobb
            //! oldalán (lásd `SITE_BAR_CLUSTER`): a lapváltó a két lapon
            //! ugyanabban a magasságban és ugyanannál az x-nél áll. */}
        <div className={cn(SITE_BAR_CLUSTER, "lg:order-2")}>
          {/*//! A LAPVÁLTÓ MELLETTI VEZÉRLŐK TÖRDELHETNEK, A VÁLTÓ NEM. A
              //! `/dualis` egy 132 px-es tervválasztót és egy súgógombot is
              //! betesz ide: 375 px-en ez a csoport 424 px-re hízott, és eddig
              //! VÍZSZINTESEN tolta szét a lapot — a dokumentum 436 px széles
              //! lett egy 375 px-es kijelzőn. Ez a belső csoport ezért tördel;
              //! a váltó kívüle, a saját dobozában marad az első sorban. */}
          <div className="flex min-w-0 flex-wrap items-center justify-end gap-1.5 sm:gap-2">
            {/*//* Teljes nézetben a jelmagyarázat buborékba költözik: állandó sorként
              //* egy 100dvh-s lapon ~40 px-et venne el a rácstól, pedig egyszer
              //* olvassa el az ember. A billentyűk is itt vannak kiírva. */}
            {fullscreen && <LegendMenu />}
            {/*//! TODO: visszakapcsolni, ha a szakmai portál élesedik. Addig nem
              //! mutatunk linket egy nem létező oldalra. Az `ExternalLink`
              //! import is ki van kommentezve a fájl tetején. */}
            {/*
          <a
            href="https://szakkor.jedlik.eu"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            Az órarend a Jedlik Szakmai Portál része
            <ExternalLink className="size-3 shrink-0" aria-hidden />
          </a>
          */}
            {hasClass && (
              <PreferencesMenu
                rows={rows}
                onUndo={undo}
                onReset={reset}
                className="touch-target"
              />
            )}
            {/*//! NATÍV `<select>`, nem buborékos lista. Az osztályválasztó az
              //! egyetlen vezérlő, amit MINDEN eszközön, sokszor, gyorsan
              //! használnak: mobilon a rendszer saját kerekét kapja, billentyűvel
              //! a betűre ugrást és a natív keresést — ezt egy egyedi lista sem
              //! adja vissza. A megjelenést a `appearance-none` + saját nyíl
              //! tartja a többi eszköztár-gombbal egy sorban. */}
            {classes.length > 0 && (
              <div className="relative shrink-0">
                <select
                  aria-label="Osztály"
                  value={selectedClass || ""}
                  disabled={pending}
                  onChange={(event) => load(weekStart, event.target.value)}
                  className={cn(
                    "h-9 w-[104px] touch-target appearance-none rounded-full border border-input bg-transparent py-1 pr-7 pl-3 text-sm transition-colors outline-none",
                    "hover:bg-muted focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
                    "disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30 dark:hover:bg-input/50",
                    //* Placeholder-állapot: a „Osztály" felirat halványabb, mint egy
                    //* valódi választás — különben kiválasztottnak látszana.
                    !selectedClass && "text-muted-foreground",
                  )}
                >
                  {!selectedClass && (
                    <option value="" disabled>
                      Osztály
                    </option>
                  )}
                  {classes.map((c) => (
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
            )}
            {trailing}
          </div>
          {/*//! A VÁLTÓ A SÁVÉ, NEM A HÍVÓÉ. Amíg a lapok a `trailing`-ben adták
              //! be, a helye a mellé csomagolt tartalomtól függött — a `/dualis`
              //! tervválasztója például elé került, és vele együtt tördelt. Egy
              //! lapszintű vezérlő helye nem lehet a hívó fél döntése: teljes
              //! nézetben ez a sáv A LAP FEJLÉCE, tehát a váltó ide tartozik. */}
          {fullscreen && <SiteNav />}
        </div>

        {/* A HÉT hasábja — ez tördel, ha kell */}
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-2 sm:gap-x-3 lg:order-1">
          {heading}
          {/*//! A MAI NAP JELVÉNYE A RÁCSÉ, NEM A LAPÉ. A lap fejléce a
            //! betöltéskor egyszer épül fel — a rácsban viszont osztályt és
            //! hetet is lehet váltani, és egy ott ragadt „Ma: Duális" a másik
            //! osztály órarendje fölött már hazugság. Ezért ITT áll, ahol az
            //! ÉPPEN nézett hét A/B-jelölése és az ÉPPEN nézett osztály is
            //! ismert. Ha a mai nap nincs a nézett hétben, nincs is mit
            //! állítani: a jelvény ilyenkor eltűnik. */}
          {todayDual && (
            <span
              className={cn(
                "shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold max-sm:sr-only",
                todayDual === "dual"
                  ? "bg-primary/15 text-primary"
                  : "bg-muted text-muted-strong",
              )}
            >
              Ma: {DUAL_LABEL[todayDual]}
            </span>
          )}
          <div className="inline-flex items-center gap-0.5 rounded-full border border-border bg-card p-0.5">
            <Button
              variant="ghost"
              size="icon"
              className="size-8 rounded-full touch-target"
              aria-label="Előző hét"
              title={fullscreen ? "Előző hét (←)" : "Előző hét"}
              disabled={pending}
              onClick={() => step(-1)}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              aria-pressed={fullscreen ? isCurrentWeek : undefined}
              title={fullscreen ? "Mai hét (T)" : undefined}
              className={cn(
                "h-8 touch-target rounded-full px-3 font-medium",
                //* A mai hét megjelölése: a gomb megmondja, hogy MÁR ott vagy.
                fullscreen && isCurrentWeek && "bg-primary/12 text-primary",
              )}
              disabled={pending}
              onClick={() => load(mondayKey(todayKey()))}
            >
              Ma
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-8 rounded-full touch-target"
              aria-label="Következő hét"
              title={fullscreen ? "Következő hét (→)" : "Következő hét"}
              disabled={pending}
              onClick={() => step(1)}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>

          {/*//! SZŰK ESZKÖZTÁRON EZ A CSOPORT FELBOMLIK. Egyben a hét-címke, az
            //! A/B jelvény és a töltésjelző ~240 px — a lapozó gombokkal együtt
            //! nem fér ki 390 px-en, tehát az egész csoport a HARMADIK sorba
            //! esik. Egy 100dvh-s lapon a harmadik sor nem a fejlécből megy el,
            //! hanem a rácsból: ~44 px, és onnantól a rács függőlegesen is
            //! görög. `display: contents`-szel a három elem külön-külön tördel,
            //! így a sáv két sor marad. Ahol elfér, ott marad az egyben tartott,
            //! szorosan tördelő csoport. */}
          <div className="contents sm:flex sm:min-w-0 sm:items-center sm:gap-2">
            <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  disabled={pending}
                  aria-label="Hét kiválasztása naptárból"
                  className="group/date -mx-1 flex min-w-0 touch-target items-center gap-1.5 rounded-full px-2.5 py-1 text-[15px] font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-60"
                >
                  <CalendarDays
                    className="size-4 shrink-0 text-muted-foreground"
                    aria-hidden
                  />
                  <span className="truncate">
                    {weekLabel(weekStart, narrowBar)}
                  </span>
                  <ChevronDown
                    className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-data-[state=open]/date:rotate-180 motion-reduce:transition-none"
                    aria-hidden
                  />
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-auto p-0">
                <Calendar
                  mode="single"
                  locale={hu}
                  selected={dateFromKey(weekStart)}
                  defaultMonth={dateFromKey(weekStart)}
                  showOutsideDays
                  onSelect={(picked) => {
                    if (!picked) return;
                    setDatePickerOpen(false);
                    load(mondayKey(dateToKey(picked)));
                  }}
                />
              </PopoverContent>
            </Popover>
            {abWeek && (
              <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                {abWeek} hét
              </span>
            )}
            {/*//! A DUÁLIS BEÁLLÍTÓ A HÉT MELLÉ KERÜL, NEM A JOBB OLDALI CSOPORTBA.
              //! Két oka van, és mindkettő ugyanoda mutat. (1) JELENTÉS: a
              //! beosztás az A/B jelöléshez van kötve — az meg itt, a jelvényen
              //! áll; a jobb oldali csoport a NÉZETÉ (szűrés, osztály, lapváltó).
              //! (2) HELY: az a csoport egy 375 px-es telefonon már tele van, és
              //! NEM tördel — egy negyedik gomb ott a lapváltót vágná le a
              //! képernyő széléről. Itt viszont a sáv maga tördel: mobilon a
              //! jelvény mellé, üres helyre esik, plusz sor nélkül. */}
            {fullscreen &&
              hasClass &&
              dualSetup?.({ classShort, weekLetter: abWeek ?? "" })}
            {/*//! A HARANG A DUÁLIS BEÁLLÍTÓ MELLÉ KERÜL, UGYANAZÉRT. A jobb
              //! oldali csoport (szűrés, osztály, lapváltó) 375 px-en már tele
              //! van és NEM tördel — egy negyedik gomb ott a lapváltót vágná le
              //! a képernyő széléről. Ez a sor viszont tördel: mobilon a
              //! jelvény mellé, üres helyre esik. Jelentés szerint is ide
              //! tartozik: az értesítés a NÉZETT osztályról szól, az pedig itt,
              //! a hét sávjában dől el. */}
            {fullscreen && hasClass && notifySetup?.({ classShort })}
            {pending && (
              <Spinner className="size-4 shrink-0 text-muted-foreground" />
            )}
          </div>
        </div>
      </div>

      {/* Rács / állapotok */}
      {/*//! A SORREND SZÁMÍT. Az osztály hiánya a leggyakoribb ok, de NEM az
          //! egyetlen: ha a mentett osztály közben megszűnt, vagy a forrás áll,
          //! akkor a `resolvedClass` is üres marad — a semleges „válassz
          //! osztályt” felirat ilyenkor elhallgatná a valódi okot. Ezért előbb
          //! a nevesített hiba jön, és csak utána a felszólítás. */}
      {!view.ok && view.error && view.error.kind !== "no-class" ? (
        <CalendarError
          error={view.error}
          pending={pending}
          onRetry={() => load(weekStart)}
        />
      ) : !hasClass && classes.length === 0 && classesError ? (
        //* Nincs mit választani, mert a lista sem jött meg — a forrás hibája.
        <CalendarError
          error={classesError}
          pending={pending}
          onRetry={() => load(weekStart)}
        />
      ) : !hasClass ? (
        <ChoosePrompt hasClasses={classes.length > 0} />
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
                inCurrentWeek={weekHasToday}
                onToday={() => load(mondayKey(todayKey()))}
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
                <div className="flex shrink-0 gap-1 border-b border-border px-2 py-1 print:hidden">
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
                      {d.isToday && (
                        <span
                          className="mt-0.5 h-0.5 w-4 rounded-full bg-primary"
                          aria-hidden
                        />
                      )}
                    </button>
                  ))}
                </div>
              )}

              {/*//! KETTŐ VAGY TÖBB NAP LÁTSZIK: a nap-fejléc mondja meg, melyik
                  //! oszlop melyik nap — és mivel a rácson KÍVÜL, a ragadó
                  //! blokkban ül, függőleges görgetéskor is fent marad. A
                  //! vízszintes lapozást a sínje `pinLeft`-ből követi le. */}
              {effCols >= 2 && (
                <div className="flex shrink-0 border-b border-border bg-card">
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
              )}
            </div>
          )}

          {noData && (
            <div className="pointer-events-none absolute inset-x-0 top-20 z-20 mx-auto w-fit rounded-full border border-border bg-background/90 px-4 py-1.5 text-sm text-muted-strong shadow-sm backdrop-blur">
              Erre a hétre nincs órarendi adat (szünet?).
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
              pending && "opacity-55",
            )}
            aria-busy={pending}
          >
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
                        "snap-x scroll-pl-12 overflow-x-auto overscroll-x-contain",
                        //* Mindig kötelező tapadás — a részletes indoklás
                        //* fentebb, „A TAPADÁS" szakaszban.
                        "snap-mandatory",
                      )
                  : "overflow-x-auto",
              )}
            >
              <motion.div
                key={`${weekStart}-${selectedClass}`}
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
                              ? //! `snap-always`: a lendületes swipe sem
                                //! szaladhat át több napon. Egy mozdulat = egy
                                //! nap, akármekkora a lendület.
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

                        {/* Óra-elválasztó vonalak (a gutter időcímkéivel egy vonalban) */}
                        {gridPeriods.map((p) => (
                          <div
                            key={p.number}
                            className="pointer-events-none absolute inset-x-0 border-t border-border/45"
                            style={{ top: top(p.startMin) }}
                          />
                        ))}
                        {lastPeriodEnd !== null && (
                          <div
                            className="pointer-events-none absolute inset-x-0 border-t border-border/45"
                            style={{ top: top(lastPeriodEnd) }}
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
                        {resolved.conflicts.map((cluster) => (
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
          morph={canMorph}
          onClose={closeFocus}
          onUndoMerge={undoByIdentity}
          onHide={hide}
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
        <Button
          variant="ghost"
          size="icon"
          className="size-9 rounded-full touch-target text-muted-foreground hover:text-foreground"
          aria-label="Jelmagyarázat és billentyűk"
          title="Jelmagyarázat és billentyűk"
        >
          <Info className="size-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[17rem] p-3">
        <p className="text-sm font-semibold text-foreground">Jelmagyarázat</p>
        <div className="mt-2 flex flex-col gap-1.5 text-xs text-muted-strong">
          <LegendItems stacked />
        </div>
        <p className="mt-3 border-t border-border pt-3 text-sm font-semibold text-foreground">
          Billentyűk
        </p>
        <dl className="mt-2 grid grid-cols-[auto_1fr] items-center gap-x-2.5 gap-y-1.5 text-xs text-muted-strong">
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
        </dl>
        <Link
          href="/adatvedelem"
          className="mt-3 block border-t border-border pt-3 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
        >
          Adatvédelmi tájékoztató
        </Link>
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

function ChoosePrompt({ hasClasses }: { hasClasses: boolean }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-16 text-center">
      <CalendarDays className="size-8 text-muted-foreground" aria-hidden />
      <p className="max-w-sm text-pretty text-sm text-muted-strong">
        {hasClasses
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
