"use client";

import { useMotionValue } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type AgendaItem, nowState } from "@/components/timetable/now";
import {
  addDaysKey,
  dateFromKey,
  todayKey,
} from "@/components/timetable/shared";
import { useClock, useVisibilityEpoch } from "@/components/timetable/use-clock";
import type { DualSchedule } from "@/lib/dual-schedule";
import { describeRestDay, type RestDay } from "@/lib/rest-day";
import { loadSchoolPlan, type SchoolDayPlan } from "@/lib/school-calendar";
import {
  buildTimetableView,
  describeTimetableFailure,
  mondayOf,
  subjectStoreKey,
  type TimetableError,
  type TimetableSubjectKind,
  type TimetableView,
} from "@/lib/timetable";
import {
  type CachedWeek,
  loadCachedWeek,
  saveCachedWeek,
} from "@/lib/timetable-cache";
import { reportClassUse } from "@/lib/usage";
import { buildDayModel, type DayModel, focusDayKey, laterItemsOf } from "./day";
import type { RestNext } from "./rest-hero";
import { buildWeekModel } from "./week";

//* ---------------------------------------------------------------------------
//* A NAPI NÉZET GÉPEZETE — ALANY NÉLKÜL
//* ---------------------------------------------------------------------------
//! EZ A FÁJL A `/ma` KIEMELT FELE, ÉS SEMMI ÚJAT NEM CSINÁL. Ami benne áll, az
//! sorról sorra az volt, ami a `ma-client.tsx`-ben — a lekérés, a helyi
//! példány, a láthatóság-újratöltés, a napköteg felépítése, a „most", a
//! pihenőnapok, a hétvége szakasza és a hero őrszeme a holtsávjával.
//!
//! MIÉRT KÖLTÖZÖTT KI. A lap 1220 sor volt, és ebből nagyjából 900 nem tud
//! arról, KIÉ az órarend: ugyanaz a gépezet hajtja a diák napját és a tanárét.
//! A negyedik cellát (tanári „Ma") ebbe a fájlba toldani azt jelentette volna,
//! hogy minden `if (tanár)` ág átszövi a diák lapját is — a `/tanari`
//! pontosan ezt kerülte el annak idején a `mode`-dal, csak ott EGY komponens
//! bírta, itt nem.
//!
//! A HATÁR: ami ALANYFÜGGŐ, AZ NEM ITT VAN. Az alany kiválasztása, a lista
//! lekérése, a tárolás kulcsa, a hero alakja és a jobb sáv panelei mind a
//! hívó lapé. Ide csak az kerül, ami mindkettőnek szó szerint ugyanaz.

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

//! A HOLTSÁV — KÜLÖN HATÁR A MEGJELENÉSNEK ÉS AZ ELTŰNÉSNEK. Egyetlen határral
//! a sor a küszöb KÉT OLDALÁN áll: a hero alja néhány képpontos remegésre —
//! görgetéslendület, cím­sor-behúzás, a képernyő-billentyűzet — oda-vissza
//! lépi át a vonalat, és a sor be-ki villog. A megjelenés a `CHROME_H`-nál
//! történik, a visszahúzás viszont csak `CHROME_H + NOW_BAR_HYST`-nél: a két
//! érték közti sávban semmi nem vált, akármerre mozdul pár képpontot a lap.
const NOW_BAR_HYST = 28;

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

/** Egy nap a kötegből, mindkét olvasatában. */
export type DayPanel = {
  dateKey: string;
  day: DayModel | null;
  /** Ugyanaz a nap csoportbontás-döntések NÉLKÜL — az alany teljes órarendje. */
  dayAll: DayModel | null;
  mineKeys: Set<string>;
  hiddenCount: number;
};

export type RestEntry = { rest: RestDay; next: RestNext | null };

//* Osztozik-e valaki MÁS is ezen a percen: eldöntetlen csoportbontás jele.
function sameSlot(pool: AgendaItem[], item: AgendaItem): boolean {
  return pool.some((o) => o.key !== item.key && o.startMin === item.startMin);
}

export function useDayView({
  kind,
  subject,
  prefs,
  dualSchedule,
}: {
  kind: TimetableSubjectKind;
  /** Az alany rövid jele. Üres = még nincs kiválasztva; ilyenkor nincs lekérés. */
  subject: string;
  //! A TANÁRNAK MINDKETTŐ ÜRES, ÉS EZ NEM HIÁNY. A csoportbontás a diák
  //! választása (a tanár mind a három csoportot tartja), a duális beosztás
  //! pedig a diák saját, osztályonkénti beállítása — egy tanár készülékén a
  //! sok tanított osztály EGYIKÉRE sincs meg. Lásd `dual-schedule.ts`.
  prefs: Parameters<typeof buildDayModel>[1];
  dualSchedule: DualSchedule | null;
}) {
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

  const lastFetch = useRef(0);

  //! A HELYI PÉLDÁNY KULCSA NÉVTERES. Egy „AA" jelű tanár és egy „AA" nevű
  //! osztály ugyanabba a rekeszbe írna — a `subjectStoreKey` ugyanazt az
  //! előtagot teszi elé, amit az összevonási döntések is használnak.
  const cacheKey = useCallback(
    (short: string) => (short ? subjectStoreKey(kind, short) : ""),
    [kind],
  );

  const load = useCallback(
    async (subj: string, focus: string, opts?: { showPending?: boolean }) => {
      if (!subj) return;
      const weekStart = mondayOf(focus);
      if (opts?.showPending) setPending(true);
      lastFetch.current = Date.now();

      const local = loadCachedWeek(cacheKey(subj), weekStart);
      if (local) {
        setView((current) => current ?? local.view);
        setCached(local);
      }

      try {
        const fresh = await buildTimetableView({
          kind,
          userClass: subj,
          weekStart,
        });
        if (fresh.ok) {
          setView(fresh);
          setError(null);
          setCached(null);
          saveCachedWeek(cacheKey(subj), weekStart, fresh);
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
    [kind, cacheKey],
  );

  //! ALANYVÁLTÁSKOR A RÉGI HÉT NEM MARADHAT A KÉPEN. Enélkül a tanárválasztás
  //! után egy pillanatig az előző kolléga napja állna ott a friss dátum alatt
  //! — és aki épp akkor néz oda, azt hiszi, ez az övé.
  const shownSubject = useRef<string>("");
  useEffect(() => {
    if (!focusKey || !subject) return;
    if (shownSubject.current !== subject) {
      shownSubject.current = subject;
      setView(null);
      setCached(null);
      setError(null);
      setPreviewKey(null);
      setPickedKey(null);
    }
    void load(subject, focusKey, { showPending: true });
  }, [subject, focusKey, load]);

  useEffect(() => {
    if (!focusKey || !subject) return;
    const onShow = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastFetch.current < REFETCH_MIN_MS) return;
      void load(subject, focusKey);
    };
    document.addEventListener("visibilitychange", onShow);
    return () => document.removeEventListener("visibilitychange", onShow);
  }, [focusKey, subject, load]);

  const resolvedShort = view?.subject?.short;
  useEffect(() => {
    //! A HASZNÁLATI SZÁMLÁLÓ OSZTÁLYOKAT SZÁMOL. Egy tanár rövid jele nem
    //! osztálynév: a `/statisztika` sorai közé keverve nemcsak értelmetlen
    //! lenne, hanem egy néven nevezett EMBER napi megnyitásait tárolná — pont
    //! azt, amit a `PRODUCT.md` negyedik alapelve kizár.
    if (kind !== "class") return;
    reportClassUse(resolvedShort);
  }, [kind, resolvedShort]);

  const shownKey = pickedKey ?? focusKey;

  const week = useMemo(
    () => (view ? buildWeekModel(view, prefs, dualSchedule) : null),
    [view, prefs, dualSchedule],
  );

  //! A KÖTEG MINDEN NAPJA ELŐRE FELÉPÜL. Öt nap modellje két olvasatban (az
  //! alanyé és a teljes órarendé) tíz tiszta függvényhívás ugyanabból a már
  //! letöltött hétből — cserébe a lapozás közben nem kell számolni, a szomszéd
  //! nap a mozdulat első képkockájától kész.
  const panels = useMemo<DayPanel[]>(() => {
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

  const focusDay = useCallback((dateKey: string) => {
    setPickedKey(dateKey);
    setPreviewKey(null);
  }, []);

  //! A „MOST" CSAK MA IGAZ. Más napra lapozva a hero a nap első óráján áll meg
  //! — visszaszámlálni napokon át értelmetlen.
  const active = panels[index] ?? null;
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
    const out = new Map<string, RestEntry>();
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

      const pool = weekend
        ? (day?.items ?? [])
        : laterItemsOf(view, prefs, dateKey);
      const item = pool[0] ?? null;
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
              //! AZ ELSŐ ÓRA NEVE — CSAK HA EGYÉRTELMŰ. Feloldatlan
              //! csoportbontásnál két futam állítja ugyanarról a percről, hogy
              //! az övé; a `sortAgenda` ilyenkor az egyiket teszi előre, de
              //! attól még nem tudjuk, MELYIK a diáké. Egy találomra kiírt
              //! tantárgy rosszabb, mint a puszta időpont — ott inkább `null`.
              lesson: sameSlot(pool, item)
                ? null
                : {
                    title: item.fullTitle,
                    room: item.room,
                    accentSeed: item.accentSeed,
                    who: item.who,
                  },
            }
          : null,
      });
    }
    return out;
  }, [panels, view, prefs, isWeekend, focusKey, today]);

  //! A HÉTVÉGE SZAKASZA — KÉT VALÓDI VÉGPONT, egy sem kitalálva. Szombat
  //! éjfél az egyik; a másik a következő tanítási nap ELSŐ órája, az alany
  //! saját, csoportbontás-feloldott órarendjéből.
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
  const heroWatchRef = useRef<IntersectionObserver[]>([]);

  //! A FIGYELŐT AZ ELEM INDÍTJA, NEM EGY EFFEKT. Az őrszemet minden napon MÁSIK
  //! elem hordozza: napváltáskor a régi kikerül a fából, az új bekerül. Egy
  //! `useEffect`-nek ehhez ki kellene találnia, mikor cserélődött a `ref`
  //! tartalma — amit a React nem mond meg, csak a függőségekből lehetne
  //! kikövetkeztetni, és egy rossz sorrendű futásnál a figyelő némán elmarad.
  //! A visszahívásos `ref` viszont PONTOSAN a csatolás és a leválás
  //! pillanatában fut le: a figyelő így nem tud lemaradni az elemétől.
  //! KÉT FIGYELŐ, MERT KÉT HATÁR VAN. Egy `IntersectionObserver` csak a SAJÁT
  //! vonalának átlépését jelenti — a holtsáv másik széléről nem tudna. A
  //! `show` a `CHROME_H`-nál álló vonalat őrzi és csak BEKAPCSOL, a `hide` a
  //! `CHROME_H + NOW_BAR_HYST`-nél állót és csak KIKAPCSOL. A két vonal közt
  //! egyik sem mond semmit: ott az marad, ami volt.
  const watchHero = useCallback((el: HTMLDivElement | null) => {
    for (const observer of heroWatchRef.current) observer.disconnect();
    heroWatchRef.current = [];
    if (!el) return;
    const show = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) setHeroGone(true);
      },
      { rootMargin: `-${CHROME_H}px 0px 0px 0px`, threshold: 0 },
    );
    const hide = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setHeroGone(false);
      },
      {
        rootMargin: `-${CHROME_H + NOW_BAR_HYST}px 0px 0px 0px`,
        threshold: 0,
      },
    );
    show.observe(el);
    hide.observe(el);
    heroWatchRef.current = [show, hide];
  }, []);

  //! A SZÜNET HETE ÜRES HÉT — ÉS EDDIG ÖRÖKÖS PÖRGŐ KARIKA VOLT. A
  //! `timetable/cards` egy egész szünetre nem küld NAPOKAT sem, csak egy üres
  //! választ; a `buildTimetableView` ezt nevesített hibaként adja tovább, a
  //! köteg viszont nulla lapból épül fel, és a lap a betöltés-jelzőnél ragad.
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

  const reload = useCallback(
    (dateKey?: string) => {
      const target = dateKey ?? shownKey;
      if (!target) return;
      setEmptyPlan(undefined);
      void load(subject, target, { showPending: true });
    },
    [load, subject, shownKey],
  );

  return {
    view,
    cached,
    error,
    pending,
    clock,
    epoch,
    today,
    focusKey,
    shownKey,
    week,
    panels,
    index,
    active,
    progress,
    isToday,
    isWeekend,
    state,
    nowMs,
    todayDow,
    rests,
    weekendSpan,
    weekEmpty,
    emptyPlan,
    heroGone,
    watchHero,
    previewKey,
    setPreviewKey,
    pickIndex,
    focusDay,
    reload,
  };
}

export type DayViewState = ReturnType<typeof useDayView>;
