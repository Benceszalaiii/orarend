"use client";

import { ChevronDown, Merge, RotateCw } from "lucide-react";
import { useMotionValue } from "motion/react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  buildDayModel,
  daySummary,
  focusDayKey,
  laterItemsOf,
} from "@/components/ma/day";
import { DayDeck } from "@/components/ma/day-deck";
import { DayList, DayRibbon } from "@/components/ma/day-list";
import {
  ChangeRow,
  DayPlanRow,
  DualHero,
  StaleNote,
} from "@/components/ma/day-status";
import { DayStrip } from "@/components/ma/day-strip";
import { DualPanel } from "@/components/ma/dual-setup";
import { NowBar } from "@/components/ma/now-bar";
import { NowBlock } from "@/components/ma/now-block";
import { RestHero, type RestNext } from "@/components/ma/rest-hero";
import { buildWeekModel } from "@/components/ma/week";
import {
  MovedThisWeek,
  SubjectLoads,
  WeekPulse,
} from "@/components/ma/week-panels";
import { NotificationMenu } from "@/components/pwa/notification-menu";
import {
  SITE_BAR_CLUSTER,
  SITE_BAR_MAX,
  SITE_BAR_METRICS,
  SiteNav,
} from "@/components/site-nav";
import { nowState } from "@/components/timetable/now";
import {
  addDaysKey,
  dateFromKey,
  minLabel,
  todayKey,
} from "@/components/timetable/shared";
import { useClock, useVisibilityEpoch } from "@/components/timetable/use-clock";
import { useMergePreferences } from "@/components/timetable/use-merge-preferences";
import { Button } from "@/components/ui/button";
import { MorphingInfinity } from "@/components/ui/morphing-infinity";
import {
  type DualSchedule,
  loadDualSchedule,
  saveDualSchedule,
} from "@/lib/dual-schedule";
import { describeRestDay, type RestDay } from "@/lib/rest-day";
import { loadSchoolPlan, type SchoolDayPlan } from "@/lib/school-calendar";
import {
  buildTimetableView,
  describeTimetableFailure,
  fetchTimetableClasses,
  loadCachedClass,
  mondayOf,
  PUBLIC_DEFAULT_CLASS,
  saveCachedClass,
  type TimetableClass,
  type TimetableError,
  type TimetableView,
} from "@/lib/timetable";
import {
  type CachedWeek,
  loadCachedWeek,
  saveCachedWeek,
} from "@/lib/timetable-cache";
import { reportClassUse } from "@/lib/usage";
import { cn } from "@/lib/utils";

//* ---------------------------------------------------------------------------
//* „Ma" — A MAI NAP EGY KÉPERNYŐN (`/ma`)
//* ---------------------------------------------------------------------------
//! EZ A LAP EGY ÁTRENDEZÉS EREDMÉNYE. A modell (`day.ts`, `week.ts`), a
//! kártyák, a panelek és a szövegek végig ugyanazok maradtak; ami megváltozott,
//! az a lap SZERKEZETE. Az előző alak megtekinthető a `/design` alatt — nem
//! azért, mert bármelyik „a régi", hanem mert a két elrendezés ugyanabból az
//! adatból dolgozik, és így összehasonlítható marad.
//!
//! AMIN VÁLTOZTAT, ÉS MIÉRT — három mérésből következő okból (375×812-es
//! telefonon, a 13C csütörtöki napjával):
//!
//! 1. A NAP VÁLTÁSA MÁSFÉL KÉPERNYŐVEL A HAJTÁS ALATT VOLT. Az egyetlen
//!    napválasztó („A hét" panel sora) a lap tetejétől 1250 képpontra kezdődik,
//!    miközben a lap FŐ TENGELYE maga a nap. Itt a nap tartalma a fogantyú:
//!    oldalra húzva lapoz, fent pedig egy napsáv mutatja, hol tartunk — a panel
//!    ettől függetlenül a helyén marad.
//!
//! 2. A „MOST" ELGÖRDÜLT ÉS NEM JÖTT VISSZA. A hero a 153–386. képpont közt áll,
//!    alatta 2300 képpontnyi lap. Aki a nap listájáig vagy a tantárgyakig
//!    lejjebb néz, elveszíti azt az egy adatot, amiért a lapot megnyitotta. Itt
//!    a hero kigördülésekor a válasz ÖSSZECSUKÓDIK egy áttetsző sorba a lap
//!    tetején, és egy koppintással visszanyílik.
//!
//! 3. A FEJLÉC ELTŰNT A GÖRGETÉSSEL. Az osztályválasztó, az értesítés és a
//!    nézetváltó a lap tetején ragadt; a nézetváltó pedig az a vezérlő, amit
//!    egymás után kétszer nyomnak meg (lásd `site-nav.tsx`). Itt a fejléc
//!    marad — áttetsző rétegként, ami alatt a tartalom fut tovább.
//!
//! ÉS AMIT HOZZÁTESZ: VÁLASZ AZ ÜRES NAPOKRA IS. Óra nélküli napon a hero
//! korábban egy üres, `aria-hidden` téglalappá esett össze — hétvégén, a négy
//! szünetben és minden ünnepen, vagyis az év napjainak közel felén. A pihenőnap
//! saját hero blokkot kapott (`rest-hero.tsx`, `rest-day.ts`).
//!
//! AMI KIMARADT. A „Ma" gomb: a napsávban a mai nap piros pöttyöt kap, és egy
//! koppintásra elérhető — külön gomb ugyanarra a munkára két vezérlő lenne.

//* Két lekérés közti legrövidebb idő, ha a lap újra láthatóvá válik.
const REFETCH_MIN_MS = 60_000;

//! A LEBEGŐ FEJLÉC MAGASSÁGA — ennyivel korábban számít „elgördültnek" a hero.
//! Enélkül a „most" sor pont akkor jelenne meg, amikor a hero ALJA elhagyja a
//! képernyőt, vagyis miután már a fejléc alá csúszott: két rétegben állna
//! ugyanaz az adat egy fél másodpercig.
//*
//* Mért érték: 99 px telefonon (durva mutatóeszközön 44 px-es vezérlőkkel),
//* 91 px egérrel. Egyetlen szám nem lehet mindkettő, és nem is kell: ez csak a
//* váltás PILLANATÁT tolja el pár képponttal, nem a réteg helyét.
const CHROME_H = 92;

//! A NAP KEZDETE, NEM A NAP KÖZEPE. A `dateFromKey` szándékosan DÉLRE horgonyoz
//! (`12:00`): az órarend napokat hasonlít, és délben egyetlen óraátállítás sem
//! tolja át a dátumot a szomszéd napra. Aki viszont IDŐTARTAMOT mér — hány óra
//! van még a hétvégéből —, annak a nap ELSŐ pillanata kell, különben minden
//! szakasz tizenkét órával elcsúszik.
function midnightOf(dateKey: string): Date {
  const d = dateFromKey(dateKey);
  d.setHours(0, 0, 0, 0);
  return d;
}

const dayFmt = new Intl.DateTimeFormat("hu-HU", {
  month: "short",
  day: "numeric",
  weekday: "long",
});

export function MaPage() {
  const [classes, setClasses] = useState<TimetableClass[]>([]);
  const [selectedClass, setSelectedClass] = useState("");
  const [view, setView] = useState<TimetableView | null>(null);
  //* Honnan van a jelenleg mutatott órarend: friss lekérésből vagy a helyi
  //* példányból. A kettő NEM ugyanaz, és a lap ezt nem hallgatja el.
  const [cached, setCached] = useState<CachedWeek | null>(null);
  const [error, setError] = useState<TimetableError | null>(null);
  const [pending, setPending] = useState(false);
  const [previewKey, setPreviewKey] = useState<string | null>(null);

  const clock = useClock();
  const epoch = useVisibilityEpoch();

  const [focusKey, setFocusKey] = useState<string | null>(null);
  const [pickedKey, setPickedKey] = useState<string | null>(null);
  const [today, setToday] = useState<string | null>(null);
  useEffect(() => {
    const key = todayKey();
    setToday(key);
    setFocusKey(focusDayKey(key));
  }, []);

  const load = useCallback(
    async (cls: string, focus: string, opts?: { showPending?: boolean }) => {
      const weekStart = mondayOf(focus);
      if (opts?.showPending) setPending(true);
      lastFetch.current = Date.now();

      const local = loadCachedWeek(cls, weekStart);
      if (local) {
        setView((current) => current ?? local.view);
        setCached(local);
      }

      try {
        const fresh = await buildTimetableView({ userClass: cls, weekStart });
        if (fresh.ok) {
          setView(fresh);
          setError(null);
          setCached(null);
          saveCachedWeek(cls, weekStart, fresh);
        } else {
          setError(fresh.error ?? null);
          if (!local) setView(fresh);
        }
      } catch (err) {
        setError(describeTimetableFailure(err));
      } finally {
        setPending(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (!focusKey) return;
    const cls = loadCachedClass() || PUBLIC_DEFAULT_CLASS;
    setSelectedClass(cls);
    void load(cls, focusKey);
    void fetchTimetableClasses().then((list) => setClasses(list.classes));
  }, [focusKey, load]);

  const lastFetch = useRef(0);
  useEffect(() => {
    if (!focusKey || !selectedClass) return;
    const onShow = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastFetch.current < REFETCH_MIN_MS) return;
      void load(selectedClass, focusKey);
    };
    document.addEventListener("visibilitychange", onShow);
    return () => document.removeEventListener("visibilitychange", onShow);
  }, [focusKey, selectedClass, load]);

  const classShort = view?.resolvedClass?.short ?? selectedClass;
  const resolvedShort = view?.resolvedClass?.short;
  useEffect(() => {
    reportClassUse(resolvedShort);
  }, [resolvedShort]);

  const { prefs, choose } = useMergePreferences({ classShort });

  const [dualSchedule, setDualSchedule] = useState<DualSchedule | null>(null);
  useEffect(() => {
    setDualSchedule(classShort ? loadDualSchedule(classShort) : null);
  }, [classShort]);

  const changeDualSchedule = useCallback(
    (next: DualSchedule) => {
      if (!classShort) return;
      saveDualSchedule(classShort, next);
      setDualSchedule(next);
    },
    [classShort],
  );

  const shownKey = pickedKey ?? focusKey;
  const [allGroups, setAllGroups] = useState(false);

  const week = useMemo(
    () => (view ? buildWeekModel(view, prefs, dualSchedule) : null),
    [view, prefs, dualSchedule],
  );

  //! A KÖTEG MINDEN NAPJA ELŐRE FELÉPÜL. Öt nap modellje két olvasatban (a
  //! diáké és az osztályé) tíz tiszta függvényhívás ugyanabból a már letöltött
  //! hétből — cserébe a lapozás közben nem kell számolni, a szomszéd nap a
  //! mozdulat első képkockájától kész.
  const panels = useMemo(() => {
    if (!view || !week) return [];
    return week.days.map((weekDay) => {
      const day = buildDayModel(view, prefs, weekDay.dateKey, dualSchedule);
      const dayAll = buildDayModel(view, [], weekDay.dateKey, dualSchedule);
      const mineKeys = new Set(
        (day?.segments ?? [])
          .filter((seg) => seg.kind === "lesson")
          .map((seg) => seg.key),
      );
      return {
        dateKey: weekDay.dateKey,
        day,
        dayAll,
        mineKeys,
        hiddenCount:
          dayAll && day ? Math.max(0, dayAll.lessonCount - day.lessonCount) : 0,
      };
    });
  }, [view, week, prefs, dualSchedule]);

  const index = useMemo(() => {
    const found = panels.findIndex((p) => p.dateKey === shownKey);
    return found >= 0 ? found : 0;
  }, [panels, shownKey]);

  //* A köteg tört állása — a napsáv jelölője ebből mozog, képkockánként.
  const progress = useMotionValue(0);

  const pickIndex = useCallback(
    (next: number) => {
      const target = panels[next];
      if (!target) return;
      setPickedKey(target.dateKey);
      setPreviewKey(null);
    },
    [panels],
  );

  //! A „MOST" CSAK MA IGAZ. Más napra lapozva a hero a nap első óráján áll meg
  //! — visszaszámlálni napokon át értelmetlen.
  const active = panels[index];
  const isToday =
    active?.dateKey != null && today != null && active.dateKey === today;
  const later = useMemo(
    () =>
      view && active && isToday
        ? laterItemsOf(view, prefs, active.dateKey)
        : [],
    [view, prefs, active, isToday],
  );
  const state =
    clock && active?.day && isToday
      ? nowState(active.day.items, later, clock.min)
      : null;

  const todayDow = useMemo(() => {
    if (!today) return null;
    const dow = ((dateFromKey(today).getDay() + 6) % 7) + 1;
    return dow <= 5 ? dow : null;
  }, [today]);

  //! HÉTVÉGÉN A KÖVETKEZŐ HÉT ÁLL A LAPON — DE A VÁLASZ A HÉTVÉGÉRŐL SZÓL.
  //! A `focusDayKey` szombaton és vasárnap a következő hétfőre visz, mert a
  //! rács kérdése („mi jön") csak ott értelmes. A hero kérdése viszont a MAI
  //! napé: aki szombaton nyitja meg a lapot, nem hétfőt él, hanem hétvégét. A
  //! kettő nem mond ellent egymásnak — a lap a hétfőt MUTATJA, a hero pedig a
  //! hétvégét MÉRI, egészen az első hétfői becsengetésig.
  const isWeekend = useMemo(() => {
    if (!today) return false;
    const dow = dateFromKey(today).getDay();
    return dow === 0 || dow === 6;
  }, [today]);

  //* A pillanat ezredmásodpercben. A napokon átnyúló távolság NEM 24 óra
  //* többszöröse (nyári időszámítás), ezért a hero valódi időbélyegekkel
  //* számol — a mai éjfél és az órajel együtt pontosan a mostot adja.
  const nowMs = useMemo(
    () =>
      today && clock ? midnightOf(today).getTime() + clock.sec * 1000 : null,
    [today, clock],
  );

  //! MI EZ A NAP, HA NINCS RAJTA ÓRA. Három különböző napfajta három
  //! különböző választ érdemel (lásd `rest-hero.tsx`); hogy melyik melyik, azt
  //! a `rest-day.ts` dönti el. Itt csak az dől el, MELYIK LAPRA kerül — és
  //! hogy mi az a következő óra, amire mutathat.
  const rests = useMemo(() => {
    const out = new Map<string, { rest: RestDay; next: RestNext | null }>();
    if (!view) return out;
    for (const panel of panels) {
      const { day, dateKey } = panel;
      if (day?.dual === "dual") continue;
      //! A HÉTVÉGE KÁRTYÁJA A KÖVETKEZŐ TANÍTÁSI NAP LAPJÁN ÁLL, mert magának a
      //! szombatnak nincs lapja a kötegben. Ha viszont az a nap maga is
      //! pihenőnap (szünet első hétfője), akkor az ERŐSEBB állítás: a lap a
      //! szünetről beszél, nem a hétvégéről, ami épp beleolvad.
      const weekend =
        isWeekend && dateKey === focusKey && (day?.lessonCount ?? 0) > 0;
      if (!weekend && (!day || day.lessonCount > 0)) continue;

      const item = weekend
        ? (day?.items[0] ?? null)
        : (laterItemsOf(view, prefs, dateKey)[0] ?? null);
      out.set(dateKey, {
        rest: describeRestDay({
          dateKey,
          weekend,
          teaching: day?.teaching ?? null,
          notes: day?.notes ?? [],
          isToday: dateKey === today,
        }),
        next: item
          ? {
              dateKey: item.dateKey,
              dayName: item.dayName,
              startMin: item.startMin,
              relative:
                today && item.dateKey === addDaysKey(today, 1)
                  ? "Holnap"
                  : null,
            }
          : null,
      });
    }
    return out;
  }, [panels, view, prefs, isWeekend, focusKey, today]);

  //! A HÉTVÉGE SZAKASZA — KÉT VALÓDI VÉGPONT, egy sem kitalálva. Szombat
  //! éjfél az egyik; a másik a következő tanítási nap ELSŐ órája, a diák saját,
  //! csoportbontás-feloldott órarendjéből. Ezért mond mást ez a sáv annak, aki
  //! nulladik órára jár, mint annak, aki nem.
  const weekendSpan = useMemo(() => {
    if (!isWeekend || !today || !focusKey) return null;
    const entry = rests.get(focusKey);
    if (!entry || entry.rest.kind !== "weekend" || !entry.next) return null;
    const from = midnightOf(today);
    //* Vasárnap a hétvége már szombaton elkezdődött.
    if (from.getDay() === 0) from.setDate(from.getDate() - 1);
    //* Éjfélhez adott PERCEK: a `setMinutes` a túlcsordulást órákra váltja, így
    //* a 480. perc pontosan 8:00 lesz.
    const to = midnightOf(entry.next.dateKey);
    to.setMinutes(entry.next.startMin);
    return { fromMs: from.getTime(), toMs: to.getTime() };
  }, [isWeekend, today, focusKey, rests]);

  //! A HERO ELGÖRDÜLÉSE INDÍTJA A SORT — nem a görgetés mértéke. Az őrszem a
  //! hero alatt áll az AKTÍV napon; ha az kicsúszik a lebegő fejléc alól, a
  //! „most" sor előbukkan, ha visszajön, eltűnik. Két ugyanolyan érték soha nem
  //! áll egyszerre a képen.
  const [heroGone, setHeroGone] = useState(false);
  const heroWatchRef = useRef<IntersectionObserver | null>(null);
  //! A SZÜNET HETE ÜRES HÉT — ÉS EDDIG ÖRÖKÖS PÖRGŐ KARIKA VOLT. A
  //! `timetable/cards` egy egész szünetre nem küld NAPOKAT sem, csak egy üres
  //! választ; a `buildTimetableView` ezt nevesített hibaként adja tovább, a
  //! köteg viszont nulla lapból épül fel, és a lap a betöltés-jelzőnél ragad.
  //! A téli szünet két hete alatt tehát pont az a felület nem jelent meg, amit
  //! ez a munka megírt.
  //!
  //! ÉS NEM TALÁLGATUNK. Hogy azért nincs adat, mert szünet van, azt nem az
  //! üres válaszból következtetjük ki — megkérdezzük a TANÉV RENDJÉT, ami
  //! pontosan erre való (`school-calendar.ts`). Ha az azt mondja, nincs
  //! tanítás, akkor a lap a szünetről beszél; ha nem mondja, vagy nem érhető
  //! el, marad a nevesített hiba.
  const [emptyPlan, setEmptyPlan] = useState<SchoolDayPlan | null | undefined>(
    undefined,
  );
  const weekEmpty = view !== null && view.days.length === 0;
  useEffect(() => {
    if (!weekEmpty || !focusKey) return;
    let alive = true;
    void loadSchoolPlan([focusKey]).then((plan) => {
      if (alive) setEmptyPlan(plan.get(focusKey) ?? null);
    });
    return () => {
      alive = false;
    };
  }, [weekEmpty, focusKey]);

  //! A FIGYELŐT AZ ELEM INDÍTJA, NEM EGY EFFEKT. Az őrszemet minden napon MÁSIK
  //! elem hordozza: napváltáskor a régi kikerül a fából, az új bekerül. Egy
  //! `useEffect`-nek ehhez ki kellene találnia, mikor cserélődött a `ref`
  //! tartalma — amit a React nem mond meg, csak a függőségekből lehetne
  //! kikövetkeztetni, és egy rossz sorrendű futásnál a figyelő némán elmarad.
  //! A visszahívásos `ref` viszont PONTOSAN a csatolás és a leválás
  //! pillanatában fut le: a figyelő így nem tud lemaradni az elemétől.
  const watchHero = useCallback((el: HTMLDivElement | null) => {
    heroWatchRef.current?.disconnect();
    heroWatchRef.current = null;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setHeroGone(!entry.isIntersecting),
      { rootMargin: `-${CHROME_H}px 0px 0px 0px`, threshold: 0 },
    );
    observer.observe(el);
    heroWatchRef.current = observer;
  }, []);

  //! ÜRES HÉT: A LAP NEM PÖRÖG TOVÁBB, HANEM VÁLASZOL. A napköteg itt nem
  //! épülhet fel — nincs miből —, de a kérdés, amivel a lapot megnyitották,
  //! ettől még kap választ: vagy a szünetét, vagy a hibáét.
  if (weekEmpty && shownKey && emptyPlan !== undefined) {
    return (
      <EmptyWeekScreen
        dateKey={shownKey}
        isToday={shownKey === today}
        plan={emptyPlan}
        classes={classes}
        selectedClass={selectedClass}
        pending={pending}
        error={error}
        onRetry={() =>
          void load(selectedClass, shownKey, { showPending: true })
        }
        onClass={(next) => {
          setSelectedClass(next);
          saveCachedClass(next);
          setEmptyPlan(undefined);
          setView(null);
          void load(next, shownKey, { showPending: true });
        }}
      />
    );
  }

  if (!view || !shownKey || !week || panels.length === 0) {
    return (
      <main className="flex min-h-[100dvh] items-center justify-center bg-background">
        <MorphingInfinity className="size-24 text-muted-foreground" />
      </main>
    );
  }

  return (
    <main className="relative min-h-[100dvh] bg-background tt-safe">
      {/*//! A FÉNYMEZŐ A LAPÉ, NEM A HERO DOBOZÁÉ. Az eredeti elrendezésben a
          //! negyedelt címer visszfénye a hero szekció háttere volt — itt a hero
          //! a napköteg belsejébe került, és vele együtt lapozna. Egy háttér, ami
          //! oldalra csúszik a tartalommal, nem háttér: ezért díszrétegként áll a
          //! lap tetején, rögzített magassággal, alsó elolvadással. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[30rem] overflow-hidden"
      >
        <div className="absolute -top-40 -left-40 size-96 rounded-full bg-[radial-gradient(circle,oklch(0.55_0.2_27/0.14),transparent_70%)]" />
        <div className="absolute -right-32 bottom-0 size-120 rounded-full bg-[radial-gradient(circle,var(--hero-crest-aura),transparent_70%)]" />
        <div className="absolute inset-x-0 bottom-0 h-40 bg-linear-to-b from-transparent to-background" />
      </div>

      {/*//! A LEBEGŐ FEJLÉC. Áttetsző réteg, ami alatt a lap tartalma fut
          //! tovább — nem egy elvett csík a lap tetejéből. A széle nem vonal,
          //! hanem elhalványuló él (`ma-chrome`): keret csak ott, ahol a
          //! lebegő felület tényleg takar valamit. */}
      <div className="ma-chrome sticky top-0 z-30 text-hero-foreground">
        <div
          className={cn(
            "mx-auto flex w-full items-center",
            SITE_BAR_MAX,
            SITE_BAR_METRICS,
          )}
        >
          <span className="shrink-0 text-base font-bold tracking-tight max-sm:sr-only">
            Órarend
          </span>
          <div className={cn("ml-auto", SITE_BAR_CLUSTER)}>
            <NotificationMenu classes={classes} currentClass={selectedClass} />
            <ClassPicker
              classes={classes}
              value={selectedClass}
              disabled={pending}
              onChange={(next) => {
                setSelectedClass(next);
                saveCachedClass(next);
                setPreviewKey(null);
                setPickedKey(null);
                setView(null);
                void load(next, shownKey, { showPending: true });
              }}
            />
            <SiteNav />
          </div>
        </div>

        {/*//! A NAPSÁV A KÖTEG FÖLÖTT ÁLL, NEM AZ ABLAK FÖLÖTT. A fejléc FELSŐ
            //! sora szándékosan az ablaké (`SITE_BAR_MAX`, lásd `site-nav.tsx`):
            //! a nézetváltónak a lap két szélén kell ülnie, hogy a `/orarend`
            //! ugyanoda tegye. A napsáv viszont nem a lapról szól, hanem a
            //! KÖTEGRŐL — egy vezérlő a dolog mellett álljon, amit mozgat.
            //! `SITE_BAR_MAX`-szal 1280 px-en öt fül feszült ki 1248 képpontra
            //! egy 688 képpontos köteg fölött: háromkarakteres címkék 250
            //! képpontonként, a jelölő pedig egy tenyérnyi folt a köteg mellett.
            //!
            //! Ezért a sáv UGYANAZT a hasábot és UGYANAZT a rácsot kapja, mint a
            //! tartalom — nem hasonló számokat, hanem ugyanazt a sávdefiníciót,
            //! így az igazodás szerkezetből következik, nem egyeztetésből. */}
        <div className="mx-auto w-full max-w-5xl px-4 pb-1.5 sm:px-6 lg:grid lg:grid-cols-[minmax(0,1fr)_19rem] lg:gap-8">
          <div className="min-w-0">
            <DayStrip
              days={week.days}
              index={index}
              progress={progress}
              todayDateKey={today ?? ""}
              onPick={pickIndex}
            />
            <NowBar
              visible={heroGone}
              state={state}
              clock={clock}
              epoch={epoch}
              day={active?.day ?? null}
              isToday={isToday}
              dayName={active?.day?.dayName ?? ""}
              onReturn={() =>
                window.scrollTo({
                  top: 0,
                  behavior: window.matchMedia(
                    "(prefers-reduced-motion: reduce)",
                  ).matches
                    ? "auto"
                    : "smooth",
                })
              }
            />
          </div>
        </div>
      </div>

      <div className="relative z-10 mx-auto w-full max-w-5xl px-4 pb-10 sm:px-6 lg:grid lg:grid-cols-[minmax(0,1fr)_19rem] lg:items-start lg:gap-8">
        {/*//! A NAP MAGA A FOGANTYÚ. A dátumtól a nap listájáig minden EGY lap:
            //! oldalra húzva a cím, a hero és az órák együtt mozdulnak. Ha a
            //! hero állva maradna és csak a lista lapozna, a lap két különböző
            //! napról beszélne ugyanabban a pillanatban. */}
        <DayDeck
          keys={panels.map((p) => p.dateKey)}
          index={index}
          onIndexChange={(next) => pickIndex(next)}
          progress={progress}
          //! A TELJES SZÉLESSÉGŰ FOGANTYÚ CSAK EGY HASÁBOS ELRENDEZÉSBEN AZ.
          //! Telefonon a köteg kilép a hasáb margójából, hogy a húzás a képernyő
          //! széléig érjen — a hüvelykujj onnan indul. `lg`-től viszont a köteg
          //! egy RÁCSCELLA: ugyanez a negatív margó 24 képponttal benyúlt a
          //! sávok közé (a 32 képpontos hézagból 8 maradt), és a köteg vágóéle
          //! a szomszéd hasáb alá lógott. Ott a köteg a cellája, semmi több.
          className="-mx-4 sm:-mx-6 lg:mx-0"
          renderPanel={(i) => {
            const panel = panels[i];
            if (!panel) return null;
            return (
              <div className="px-4 sm:px-6 lg:px-0">
                <DayPanelBody
                  panel={panel}
                  isActive={i === index}
                  isToday={panel.dateKey === today}
                  onSentinel={i === index ? watchHero : null}
                  //! A HÉTVÉGE-JELÖLÉS A FÓKUSZ LAPJÁÉ, NEM MINDEN NEM-MAI
                  //! NAPÉ. A korábbi feltétel („nem ma") a hét MIND A NÉGY
                  //! másik lapjára kiírta a „Hétvége" előtagot: szerdán a keddi
                  //! lapra lapozva is hétvége állt a dátum alatt.
                  weekendNote={isWeekend && panel.dateKey === focusKey}
                  rest={rests.get(panel.dateKey) ?? null}
                  restSpan={panel.dateKey === focusKey ? weekendSpan : null}
                  nowMs={nowMs}
                  allGroups={allGroups}
                  onAllGroups={(next) => {
                    setAllGroups(next);
                    setPreviewKey(null);
                  }}
                  previewKey={previewKey}
                  onPreview={setPreviewKey}
                  clock={clock}
                  epoch={epoch}
                  state={i === index ? state : null}
                  error={error}
                  pending={pending}
                  onRetry={() =>
                    void load(selectedClass, panel.dateKey, {
                      showPending: true,
                    })
                  }
                  cached={cached}
                />
              </div>
            );
          }}
        />

        {/*//* Másodlagos sáv: a hét — amire a rácsból csak végigolvasva lenne
            //* válasz. A napváltás innen is megy, csak most nem ez az EGYETLEN
            //* útja: ami itt marad, az a nap TERHELÉSE, nem a helyzet. */}
        {/*//! A RITMUS MONDJA MEG, HOL VÁLT A TÉMA. Eddig 40 képpont választotta
            //! el a napot a héttől, és ugyanaz a 40 választotta el a hét két
            //! panelját egymástól: négy egyforma hézag, tehát öt egyenrangú
            //! blokk — pedig az első határ RÉGIÓT vált („a napom" → „a hetem"),
            //! a többi csak témát a régión belül. A nagy hézag most a régió
            //! határán van, a panelek közti pedig szűkebb: a tagolás így
            //! olvasható anélkül, hogy keretet kéne köré rakni. */}
        <div className="mt-14 space-y-8 lg:mt-0">
          <WeekPulse
            week={week}
            focusKey={shownKey}
            todayDateKey={today ?? ""}
            onFocus={(dateKey) => {
              setPickedKey(dateKey);
              setPreviewKey(null);
            }}
          />
          <DualPanel
            schedule={dualSchedule}
            weekLetter={week.weekLetter}
            todayDow={todayDow}
            classShort={classShort}
            onChange={changeDualSchedule}
          />
          <MovedThisWeek
            week={week}
            onFocus={(dateKey) => {
              setPickedKey(dateKey);
              setPreviewKey(null);
            }}
          />
          <SubjectLoads week={week} onChoose={choose} />
        </div>
      </div>
    </main>
  );
}

//! AZ ÜRES HÉT LAPJA. Nincs napköteg, nincs napsáv, nincs „most" — a hét
//! egyetlen napjáról sincs kártya. Ami marad, az a lap két állandó eleme: a
//! fejléc (osztályváltás, értesítés, nézetváltó) és EGY válasz. A válasz vagy a
//! szüneté — a tanév rendje szerint —, vagy a hibáé; egy harmadik lehetőség
//! (üres rács) nincs, mert arról nem derülne ki, baj van-e.
function EmptyWeekScreen({
  dateKey,
  isToday,
  plan,
  classes,
  selectedClass,
  pending,
  error,
  onRetry,
  onClass,
}: {
  dateKey: string;
  isToday: boolean;
  /** A nap a tanév rendjéből; `null` = nem érhető el. */
  plan: SchoolDayPlan | null;
  classes: TimetableClass[];
  selectedClass: string;
  pending: boolean;
  error: TimetableError | null;
  onRetry: () => void;
  onClass: (next: string) => void;
}) {
  const rest =
    plan && !plan.teaching
      ? describeRestDay({
          dateKey,
          weekend: false,
          teaching: false,
          notes: plan.notes,
          isToday,
        })
      : null;

  return (
    <main className="relative min-h-[100dvh] bg-background tt-safe">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[30rem] overflow-hidden"
      >
        <div className="absolute -top-40 -left-40 size-96 rounded-full bg-[radial-gradient(circle,oklch(0.55_0.2_27/0.14),transparent_70%)]" />
        <div className="absolute -right-32 bottom-0 size-120 rounded-full bg-[radial-gradient(circle,var(--hero-crest-aura),transparent_70%)]" />
        <div className="absolute inset-x-0 bottom-0 h-40 bg-linear-to-b from-transparent to-background" />
      </div>

      <div className="ma-chrome sticky top-0 z-30 text-hero-foreground">
        <div
          className={cn(
            "mx-auto flex w-full items-center",
            SITE_BAR_MAX,
            SITE_BAR_METRICS,
          )}
        >
          <span className="shrink-0 text-base font-bold tracking-tight max-sm:sr-only">
            Órarend
          </span>
          <div className={cn("ml-auto", SITE_BAR_CLUSTER)}>
            <NotificationMenu classes={classes} currentClass={selectedClass} />
            <ClassPicker
              classes={classes}
              value={selectedClass}
              disabled={pending}
              onChange={onClass}
            />
            <SiteNav />
          </div>
        </div>
      </div>

      <div className="relative z-10 mx-auto w-full max-w-5xl px-4 pt-3 pb-10 sm:px-6 sm:pt-4">
        <h2 className="text-2xl font-bold tracking-tight first-letter:uppercase sm:text-3xl">
          {dayFmt.format(dateFromKey(dateKey))}
        </h2>
        <p className="mt-1 text-sm text-hero-foreground/60">
          {rest ? rest.label : "Erre a hétre nem érkezett órarend"}
        </p>
        <div className="mt-6 lg:max-w-2xl">
          {rest ? (
            <RestHero rest={rest} next={null} span={null} nowMs={null} />
          ) : error ? (
            <ErrorPanel error={error} pending={pending} onRetry={onRetry} />
          ) : (
            <MorphingInfinity className="size-24 text-muted-foreground" />
          )}
        </div>
      </div>
    </main>
  );
}

type Panel = {
  dateKey: string;
  day: ReturnType<typeof buildDayModel>;
  dayAll: ReturnType<typeof buildDayModel>;
  mineKeys: Set<string>;
  hiddenCount: number;
};

//! EGY NAP, EGY LAP. Pontosan az, ami a `/ma` fő hasábjában áll — a cím, a
//! hero, a nap körülményei és az órák —, csak most egy lapozható felületen. A
//! komponensek és a szövegek változatlanok; ez a fájl nem ír át semmit, csak
//! másképp rakja egymás mellé.
function DayPanelBody({
  panel,
  isActive,
  isToday,
  onSentinel,
  weekendNote,
  rest,
  restSpan,
  nowMs,
  allGroups,
  onAllGroups,
  previewKey,
  onPreview,
  clock,
  epoch,
  state,
  error,
  pending,
  onRetry,
  cached,
}: {
  panel: Panel;
  isActive: boolean;
  isToday: boolean;
  onSentinel: ((el: HTMLDivElement | null) => void) | null;
  weekendNote: boolean;
  /** Pihenőnap-e ez a lap, és ha igen, mire mutat. `null` = rendes tanítási nap. */
  rest: { rest: RestDay; next: RestNext | null } | null;
  restSpan: { fromMs: number; toMs: number } | null;
  nowMs: number | null;
  allGroups: boolean;
  onAllGroups: (next: boolean) => void;
  previewKey: string | null;
  onPreview: (key: string | null) => void;
  clock: ReturnType<typeof useClock>;
  epoch: number;
  state: ReturnType<typeof nowState> | null;
  error: TimetableError | null;
  pending: boolean;
  onRetry: () => void;
  cached: CachedWeek | null;
}) {
  const { day, dayAll, mineKeys, hiddenCount } = panel;
  const dualDay = day?.dual === "dual";
  const shownDay = allGroups && dayAll ? dayAll : day;
  //* Az előnézet csak az AKTÍV napon él: a szomszéd lapok a saját első órájukat
  //* mutatják, mert ott nincs „most", amihez képest kiválasztani lehetne.
  const preview = !day
    ? null
    : isActive && previewKey
      ? (day.items.find((i) => i.key === previewKey) ?? null)
      : isToday
        ? null
        : (day.items[0] ?? null);

  return (
    <>
      <div className="pt-3 pb-8 sm:pt-4">
        <div className="min-w-0">
          <h2 className="text-2xl font-bold tracking-tight first-letter:uppercase sm:text-3xl">
            {dayFmt.format(dateFromKey(panel.dateKey))}
          </h2>
          <p className="mt-1 text-sm text-hero-foreground/60">
            {/*//* A hero mondja ki, hogy hétvége van; ez a sor csak azt
                //* magyarázza meg, miért HÉTFŐ áll a dátum helyén. */}
            {weekendNote && "A következő tanítási nap · "}
            {day ? daySummary(day, isToday) : "Nincs adat erre a napra"}
            {day && day.lessonCount > 0 && day.dual !== "dual" && (
              <>
                {" · "}
                <span className="whitespace-nowrap tabular-nums">
                  {minLabel(day.lastMin)}-ig
                </span>
              </>
            )}
          </p>
        </div>

        <div className="mt-6 lg:max-w-2xl">
          {dualDay ? (
            <DualHero nowSec={clock && isToday ? clock.sec : null} />
          ) : error && !day ? (
            <ErrorPanel error={error} pending={pending} onRetry={onRetry} />
          ) : rest ? (
            //! ITT EDDIG EGY ÜRES DOBOZ ÁLLT. Óra nélküli napon a `NowBlock`-nak
            //! nincs mit mutatnia: a „most" kiszámíthatatlan, az előnézetnek
            //! nincs mit előnéznie, és a blokk `aria-hidden` helykitöltővé
            //! esik össze. Az év napjainak közel fele ilyen.
            <RestHero
              rest={rest.rest}
              next={rest.next}
              span={restSpan}
              nowMs={nowMs}
            />
          ) : (
            <NowBlock
              state={state}
              clock={clock}
              epoch={epoch}
              preview={preview}
              onClearPreview={isToday ? () => onPreview(null) : () => {}}
              previewDismissable={isToday && previewKey !== null}
            />
          )}
        </div>
      </div>

      {/*//* Az őrszem: eddig tart a hero. Ami ez alá kerül, azt a lebegő
          //* fejléc „most" sora már összecsukva viszi tovább. */}
      {onSentinel && (
        <div ref={onSentinel} className="h-px w-full" aria-hidden />
      )}

      <section aria-label="A nap órái">
        <div className="mb-3 flex items-baseline justify-between gap-4">
          <h3 className="text-base font-semibold text-foreground">
            {isToday ? "A mai nap" : "A nap"}
            {dualDay && allGroups && (
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                az osztály órarendje
              </span>
            )}
          </h3>
          <div className="flex shrink-0 items-center gap-3">
            {dayAll && dayAll.lessonCount > 0 && (
              <label
                className={cn(
                  "flex cursor-pointer select-none items-center gap-1.5 text-xs font-medium transition-colors",
                  "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring motion-reduce:transition-none",
                  allGroups
                    ? "text-primary"
                    : "text-muted-strong hover:text-foreground",
                )}
              >
                <input
                  type="checkbox"
                  checked={allGroups}
                  onChange={(e) => onAllGroups(e.target.checked)}
                  className="size-3.5 shrink-0 cursor-pointer accent-primary focus-visible:outline-none"
                />
                Teljes órarend
              </label>
            )}
            <Link
              href="/orarend"
              className="text-sm text-primary hover:underline"
            >
              Heti órarend
            </Link>
          </div>
        </div>

        {day && <DayPlanRow day={day} isToday={isToday} className="mb-3" />}

        {day && day.dual !== "dual" && <ChangeRow day={day} className="mb-3" />}

        {day && day.dual !== "dual" && day.conflicts > 0 && (
          <a
            href="#subjects-heading"
            className={cn(
              "mb-3 flex items-start gap-2 rounded-xl border border-primary/30 bg-primary/8 px-4 py-3 text-sm leading-snug text-foreground transition-colors",
              "hover:bg-primary/12 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none",
            )}
          >
            <Merge
              className="mt-0.5 size-4 shrink-0 text-primary"
              aria-hidden
            />
            <span className="min-w-0 flex-1 text-pretty">
              {day.conflicts === 1
                ? "Egy csoportbontás eldöntetlen"
                : `${day.conflicts} csoportbontás eldöntetlen`}{" "}
              <span className="text-muted-strong">
                — a „most” pontatlan lehet, amíg nem választod ki, melyik
                csoportra jársz.
              </span>
            </span>
            <span className="shrink-0 self-center font-medium text-primary">
              Kiválasztom
            </span>
          </a>
        )}

        {dualDay && !allGroups ? (
          <p className="text-sm text-pretty text-muted-foreground">
            Az osztály órarendje nem rád vonatkozik.
            {dayAll &&
              dayAll.lessonCount > 0 &&
              " A „Teljes órarend” megmutatja, mi megy ilyenkor az osztálynak."}
          </p>
        ) : shownDay && day && shownDay.lessonCount > 0 ? (
          <>
            <DayRibbon
              day={shownDay}
              nowMin={
                clock && isToday && day.dual !== "dual" ? clock.min : null
              }
              selectedKey={isActive ? previewKey : null}
              mineKeys={allGroups ? mineKeys : null}
              className="mb-3"
            />
            <DayList
              day={shownDay}
              nowMin={
                clock && isToday && day.dual !== "dual" ? clock.min : null
              }
              selectedKey={isActive ? previewKey : null}
              onSelect={onPreview}
              mineKeys={allGroups ? mineKeys : null}
            />
            {allGroups && (
              <p className="mt-2 text-xs text-pretty text-muted-foreground">
                {hiddenCount > 0 ? (
                  <>
                    Az osztály teljes napja látszik. A szaggatott kártyák egy
                    másik csoporté —{" "}
                    {hiddenCount === 1 ? "egy órát" : `${hiddenCount} órát`}{" "}
                    rejtett el a csoportbontás-döntésed.
                  </>
                ) : (
                  "Az osztály teljes napja látszik — ezen a napon nincs másik csoportnak órája."
                )}
              </p>
            )}
          </>
        ) : (
          <p className="rounded-xl border border-dashed border-border px-4 py-5 text-sm text-pretty text-muted-strong">
            {!day
              ? "Erre a napra nincs adat."
              : hiddenCount > 0
                ? "Ezen a napon minden óra egy másik csoporté — a „Teljes órarend” megmutatja őket."
                : //! SZÜNETBEN A HIÁNY NEM REJTÉLY. „A forrás nem küldött órát"
                  //! azt sugallja, hogy valami elmaradt — pedig a tanév rendje
                  //! szerint ezen a napon NINCS mit küldeni. A mondat csak ott
                  //! marad gyanakvó, ahol tényleg indokolt.
                  rest
                  ? "Ezen a napon nincs kiírt óra."
                  : "A forrás nem küldött órát erre a napra."}
          </p>
        )}

        {cached && (
          <StaleNote
            fetchedAt={cached.fetchedAt}
            offline={!!error}
            className="mt-3"
          />
        )}
      </section>
    </>
  );
}

//! NATÍV `<select>`, mint a heti nézetben: mobilon a rendszer saját kerekét
//! kapja, billentyűvel a betűre ugrást — ezt egy egyedi lista sem adja vissza.
function ClassPicker({
  classes,
  value,
  disabled,
  onChange,
}: {
  classes: TimetableClass[];
  value: string;
  disabled: boolean;
  onChange: (next: string) => void;
}) {
  if (classes.length === 0) {
    return value ? (
      <span
        className="shrink-0 rounded-full border border-hero-foreground/20 px-2.5 py-1 text-xs text-hero-foreground/70"
        title="Az osztálylista most nem érhető el — csak a mentett osztályod látszik."
      >
        {value}
      </span>
    ) : null;
  }
  return (
    <div className="relative shrink-0">
      <select
        aria-label="Osztály"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className={cn(
          "h-9 w-[84px] touch-target appearance-none rounded-full border border-hero-foreground/20 bg-transparent py-1 pr-6 pl-2.5 text-xs transition-colors outline-none",
          "hover:bg-hero-foreground/10 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
          "disabled:cursor-not-allowed disabled:opacity-50",
        )}
      >
        {classes.map((c) => (
          <option key={c.short} value={c.short}>
            {c.name}
          </option>
        ))}
      </select>
      <ChevronDown
        className="pointer-events-none absolute top-1/2 right-2 size-3.5 -translate-y-1/2 text-hero-foreground/50"
        aria-hidden
      />
    </div>
  );
}

//! A HIBA MEGMONDJA, KINÉL VAN. Ugyanaz a szótár, mint a heti nézetben.
function ErrorPanel({
  error,
  pending,
  onRetry,
}: {
  error: TimetableError;
  pending: boolean;
  onRetry: () => void;
}) {
  return (
    <section className="rounded-2xl border border-hero-foreground/15 bg-hero-foreground/[0.06] p-5 sm:p-6">
      <h3 className="text-xl font-bold tracking-tight">{error.title}</h3>
      <p className="mt-2 max-w-md text-sm text-hero-foreground/70">
        {error.message}
      </p>
      {error.hint && (
        <p className="mt-1 max-w-md text-sm text-hero-foreground/60">
          {error.hint}
        </p>
      )}
      {error.retryable && (
        <Button
          variant="outline"
          size="sm"
          onClick={onRetry}
          disabled={pending}
          className="mt-4 h-8 touch-target rounded-full border-hero-foreground/25 bg-transparent px-3 text-xs"
        >
          <RotateCw className={cn(pending && "animate-spin")} aria-hidden />
          Újra
        </Button>
      )}
      {error.detail && (
        <p className="mt-3 font-mono text-[11px] text-hero-foreground/45">
          {error.detail}
        </p>
      )}
    </section>
  );
}
