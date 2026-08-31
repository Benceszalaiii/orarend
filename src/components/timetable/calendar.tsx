"use client";

import { hu } from "date-fns/locale/hu";
import {
  AlertTriangle,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  // ExternalLink, //! a szakmai portál linkjével együtt visszakapcsolni
  Info,
  Merge,
  Sparkles,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Kbd } from "@/components/ui/kbd";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import type {
  CalendarEvent,
  TimetableClass,
  TimetableLesson,
  TimetableView,
} from "@/lib/timetable";
import { buildTimetableView } from "@/lib/timetable";
import {
  type GhostBlock,
  type LessonRun,
  preferenceRows,
  preferencesHiding,
  resolveDay,
} from "@/lib/timetable-merge";
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
//* A ragadó idősáv szélessége (px) — a mobil nap-oszlop ebből számol.
const GUTTER = 48;

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

export function TimetableCalendar({
  initialView,
  classes,
  variant = "embedded",
  heading,
  trailing,
}: {
  initialView: TimetableView;
  classes: TimetableClass[];
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
  const prefsApi = useMergePreferences({
    classShort,
  });
  const { prefs, choose, undo, undoMany, reset } = prefsApi;

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
      const res = await buildTimetableView({
        userClass: cls || null,
        weekStart: nextWeek,
        classOverride: cls || undefined,
      });
      weekTransition(
        () => {
          setView(res);
          setSelectedClass(res.resolvedClass?.short ?? cls);
        },
        { enabled: canMorph, dir },
      );
    } catch {
      setView((w) => ({
        ...w,
        ok: false,
        error: "Nem sikerült betölteni az órarendet.",
      }));
    } finally {
      setPending(false);
    }
  };

  //* Hét-lapozás egy lépéssel — a gombok és a billentyűk közös bejárata.
  const step = (delta: number) =>
    load(
      addDaysKey(view.weekStart, delta * 7),
      undefined,
      delta > 0 ? "next" : "prev",
    );

  const { days, periods, lessons, events, weekStart } = view;

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
  //! TELJES NÉZET: a lépték a KÉPERNYŐRE igazodik — a nap (az első és az utolsó
  //! óra közötti tartomány) pontosan egy képernyőnyi legyen, vagyis egy normál,
  //! 8 tanórás napon 8 óra látszik egyszerre, görgetés nélkül. A tényleges
  //! tartomány (dayStart..dayEnd) a heti adatból jön, ezért a képpont/perc arányt
  //! futásidőben mérésből számoljuk; a beágyazott nézet marad fix léptékű.
  const [fitScale, setFitScale] = useState<number | null>(null);
  //* A nap-fejléc (sticky) magassága a számolt sáv fölött; mobilon rejtett.
  useEffect(() => {
    if (variant !== "fullscreen") return;
    const measure = () => {
      const f = frameRef.current;
      if (!f) return;
      const span = dayEnd - dayStart;
      if (span <= 0) return;
      const headerH =
        window.innerWidth >= 640
          ? (f.querySelector("[data-day-header]")?.getBoundingClientRect()
              .height ?? 48)
          : 0;
      const avail = Math.max(
        window.innerHeight - f.getBoundingClientRect().top - headerH,
        220,
      );
      setFitScale(avail / span);
    };
    //* `pending` csak azért a függőségben, mert a betöltés után a keret tényleges
    //* geometriája csak később áll be — ilyenkor újra mértünk.
    void pending;
    measure();
    const ro = new ResizeObserver(measure);
    if (frameRef.current) ro.observe(frameRef.current);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [variant, dayStart, dayEnd, pending]);

  const pxPerMin =
    variant === "fullscreen" ? (fitScale ?? FULL_PX_PER_MIN) : EMBED_PX_PER_MIN;

  const height = Math.max((dayEnd - dayStart) * pxPerMin, 320);
  const top = useCallback(
    (m: number) => (m - dayStart) * pxPerMin,
    [dayStart, pxPerMin],
  );
  const lastPeriodEnd = periods.length
    ? periods[periods.length - 1].endMin
    : dayEnd;

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
  const gutterRef = useRef<HTMLDivElement>(null);
  const headerGutterRef = useRef<HTMLDivElement>(null);
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
  //* A bal idősáv (és a fejléc-behúzása) MINDIG a képernyő bal szélén marad:
  //* vízszintes görgetéskor a `translateX(scrollLeft)` kompenzálja a görgetés
  //* által elmozdított távolságot. A `position: sticky; left: 0` egy vízszintes
  //* görgetődobozban nem megbízható, ezért ez a determinista, JS-es út.
  const pinLeft = useCallback(() => {
    const container = scrollRef.current;
    if (!container) return;
    const x = container.scrollLeft;
    if (gutterRef.current)
      gutterRef.current.style.transform = `translateX(${x}px)`;
    if (headerGutterRef.current)
      headerGutterRef.current.style.transform = `translateX(${x}px)`;
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

  //! Mobilon a mai napra ugrunk induláskor — a diák a MAI órarendjéért nyitja
  //! meg. Csak akkor, ha a betöltött hét tartalmazza a mai napot.
  const jumpedRef = useRef(false);
  useEffect(() => {
    if (variant !== "fullscreen" || jumpedRef.current) return;
    const index = gridDays.findIndex((d) => d.isToday);
    if (index < 0) return;
    jumpedRef.current = true;
    const container = scrollRef.current;
    const el = dayRefs.current[index];
    if (!container || !el || container.scrollWidth <= container.clientWidth) {
      return;
    }
    container.scrollTo({ left: el.offsetLeft - GUTTER, behavior: "auto" });
    setActiveDay(index);
  }, [variant, gridDays]);

  //* Új hét/osztály betöltése után a keret újra renderelődhet görgetett állapotban:
  //* ilyenkor azonnal vissza kell tűzni az idősávot, nehogy a lefordított helyzete
  //* a betöltés utáni első görgetésig a rossz pozícióban tétlenkedjen.
  useEffect(() => {
    //* `weekStart`/`selectedClass` csak azért kell a függőségben, mert ezek
    //* cserélik a rács kulcsát (keret-remount); a remount után itt tűzzük
    //* vissza az idősávot, ha a görgetés pozíciója megmaradt.
    void weekStart;
    void selectedClass;
    pinLeft();
  }, [pinLeft, weekStart, selectedClass]);

  const abWeek = days.find((d) => d.week === "A" || d.week === "B")?.week;
  const hasClass = Boolean(view.resolvedClass);
  const noData = view.ok && lessons.length === 0 && events.length === 0;
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
        fullscreen
          ? "border-t border-border"
          : "overflow-hidden rounded-2xl border border-border shadow-sm",
      )}
    >
      {/* Eszköztár — teljes nézetben ez a lap fejléce is */}
      <div
        className={cn(
          "flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-border px-3 py-2.5 sm:px-4",
          fullscreen && "gap-x-2 py-2 sm:gap-x-3",
        )}
      >
        {heading}
        <div className="inline-flex items-center gap-0.5 rounded-full border border-border bg-card p-0.5">
          <Button
            variant="ghost"
            size="icon"
            className="size-8 rounded-full"
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
              "h-8 rounded-full px-3 font-medium",
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
            className="size-8 rounded-full"
            aria-label="Következő hét"
            title={fullscreen ? "Következő hét (→)" : "Következő hét"}
            disabled={pending}
            onClick={() => step(1)}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>

        <div className="flex min-w-0 items-center gap-2">
          <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                disabled={pending}
                aria-label="Hét kiválasztása naptárból"
                className="group/date -mx-1 flex min-w-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[15px] font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-60"
              >
                <CalendarDays
                  className="size-4 shrink-0 text-muted-foreground"
                  aria-hidden
                />
                <span className="truncate">{weekLabel(weekStart)}</span>
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
          {pending && (
            <Spinner className="size-4 shrink-0 text-muted-foreground" />
          )}
        </div>

        <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
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
            <PreferencesMenu rows={rows} onUndo={undo} onReset={reset} />
          )}
          {classes.length > 0 && (
            <Select
              value={selectedClass || undefined}
              disabled={pending}
              onValueChange={(v) => load(weekStart, v)}
            >
              <SelectTrigger
                className="h-9 w-[104px] rounded-full data-[size=default]:h-9"
                aria-label="Osztály"
              >
                <SelectValue placeholder="Osztály" />
              </SelectTrigger>
              <SelectContent>
                {classes.map((c) => (
                  <SelectItem key={c.short} value={c.short}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {trailing}
        </div>
      </div>

      {/* Rács / állapotok */}
      {!hasClass ? (
        <ChoosePrompt hasClasses={classes.length > 0} />
      ) : !view.ok ? (
        <CalendarError
          message={view.error ?? "Az órarend most nem elérhető."}
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
            <div className="sticky top-site-header z-40 flex flex-col bg-card">
              <NowRail
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

              {/* Mobil nap-sáv: ugrás a napok között lapozás nélkül */}
              <div className="flex shrink-0 gap-1 border-b border-border px-2 py-1.5 sm:hidden">
                {gridDays.map((d, i) => (
                  <button
                    key={d.dateKey}
                    type="button"
                    onClick={() => goToDay(i)}
                    aria-current={activeDay === i ? "true" : undefined}
                    className={cn(
                      "flex min-w-0 flex-1 flex-col items-center rounded-lg px-1 py-1 text-center transition-colors",
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
              onScroll={fullscreen ? handleScroll : undefined}
              className={cn(
                //! Mobilon egy nap tölti ki a képernyőt, és a görgetés
                //! "beakad" a napokra — ez a natív swipe, JS gesztus nélkül.
                //! A `scroll-pl-12` KÖTELEZŐ a `snap-start` mellé: enélkül a
                //! böngésző a nap-oszlop bal szélét a KONTÉNER széléhez igazítja,
                //! vagyis pont a ragadó idősáv (w-12) ALÁ csúsztatja a nap első
                //! 48 pixelét. A görgetés-belső margó tolja el a "snapportot"
                //! az idősáv mellé.
                //! `sm`-TŐL NINCS VÍZSZINTES GÖRGETŐ, és ez nem esztétika: az
                //! `overflow-x: auto` a függőleges tengelyt is görgetési dobozzá
                //! teszi, a dobozon BELÜLI `position: sticky` pedig ehhez a soha
                //! nem görgető dobozhoz igazodna — vagyis a nap-fejléc nem
                //! ragadna. Mobilon ez nem gond: ott a nap-fejléc rejtve van, a
                //! nap-sáv mondja meg, hol vagy.
                fullscreen
                  ? "max-sm:snap-x max-sm:snap-mandatory max-sm:scroll-pl-12 max-sm:overflow-x-auto"
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
                {/* Fejléc sor */}
                {/* //! Mobilon a nap nevét a fölötte álló NAP-SÁV mondja el —
                    //! ez a sor ott csak ismételné, ráadásul ragadó elemként a
                    //! kártyák fölé úszna. `sm`-től, ahol mind az öt nap
                    //! egyszerre látszik, viszont ez az egyetlen fejléc. */}
                <div
                  data-day-header
                  className={cn(
                    "border-b border-border bg-card",
                    fullscreen
                      ? "top-site-header-rail sticky z-40 hidden sm:flex"
                      : "flex",
                  )}
                >
                  <div
                    ref={headerGutterRef}
                    className="relative z-10 w-12 shrink-0 bg-card"
                  />
                  {gridDays.map((d) => (
                    <div
                      key={d.dateKey}
                      className={cn(
                        "relative min-w-0 border-l border-border/70 px-2 py-2.5 text-center",
                        fullscreen
                          ? "w-[calc(100vw-3rem)] shrink-0 sm:w-auto sm:flex-1 sm:shrink"
                          : "flex-1",
                        d.isToday && "bg-primary/[0.06]",
                      )}
                    >
                      <div
                        className={cn(
                          "text-sm font-semibold",
                          d.isToday ? "text-primary" : "text-foreground",
                        )}
                      >
                        {d.name}
                      </div>
                      <div
                        className={cn(
                          "text-xs tabular-nums",
                          d.isToday
                            ? "font-medium text-primary/80"
                            : "text-muted-strong",
                        )}
                      >
                        {d.dateLabel}
                      </div>
                      {d.isToday && (
                        <span className="absolute inset-x-0 bottom-0 h-0.5 bg-primary" />
                      )}
                    </div>
                  ))}
                </div>

                {/* Test: idősáv + naposzlopok */}
                <div className="relative flex bg-muted/25">
                  {/* Idősáv (órák sorszáma + kezdés) */}
                  <div
                    ref={gutterRef}
                    className="relative z-20 w-12 shrink-0 border-r border-border bg-card"
                    style={{ height }}
                    aria-hidden
                  >
                    {periods.map((p) => (
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
                            ? "w-[calc(100vw-3rem)] shrink-0 snap-start sm:w-auto sm:flex-1 sm:shrink"
                            : "flex-1",
                          d.isToday && "bg-primary/[0.05]",
                        )}
                        style={{ height }}
                      >
                        {/* Óra-elválasztó vonalak (a gutter időcímkéivel egy vonalban) */}
                        {periods.map((p) => (
                          <div
                            key={p.number}
                            className="pointer-events-none absolute inset-x-0 border-t border-border/45"
                            style={{ top: top(p.startMin) }}
                          />
                        ))}
                        <div
                          className="pointer-events-none absolute inset-x-0 border-t border-border/45"
                          style={{ top: top(lastPeriodEnd) }}
                        />

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
                                onHoverChange={(subject, hovering) =>
                                  setHoveredSubject((cur) =>
                                    hovering
                                      ? subject
                                      : cur === subject
                                        ? null
                                        : cur,
                                  )
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
        Tanóra — a szín a tantárgy
      </span>
      <span
        className={cn(row, !stacked && "hidden items-center gap-1.5 sm:flex")}
      >
        <span
          className={cn(
            "flex size-3 shrink-0 items-center justify-center border acc-tint-strong",
            CELL_RADIUS,
          )}
          style={{ ["--acc-h"]: 22 } as React.CSSProperties}
        >
          <span className="size-1 rounded-full acc-dot" />
        </span>
        Szakkör-alkalmad
      </span>
      <span className={row}>
        <span
          className={cn("size-3 shrink-0 border acc-break", CELL_RADIUS)}
          style={{ ["--acc-h"]: 210 } as React.CSSProperties}
        />
        Szünet a blokkon belül
      </span>
      <span className={row}>
        <span className="flex size-3.5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Merge className="size-2" aria-hidden />
        </span>
        Ütköző órák — válassz
      </span>
      <span
        className={cn(row, !stacked && "hidden items-center gap-1.5 lg:flex")}
      >
        <Sparkles className="size-3 shrink-0 text-brand" />
        Közösségi óra jár
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
          className="size-9 rounded-full text-muted-foreground hover:text-foreground"
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

function CalendarError({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <AlertTriangle className="size-8 text-muted-foreground" aria-hidden />
      <p className="max-w-sm text-pretty text-sm text-muted-strong">
        {message}
      </p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        Újra
      </Button>
    </div>
  );
}
