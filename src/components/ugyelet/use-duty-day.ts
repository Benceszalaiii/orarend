"use client";

import { useMotionValue } from "motion/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  addDaysKey,
  DAY_NAMES,
  focusMondayKey,
  todayKey,
} from "@/components/timetable/shared";
import { useClock, useVisibilityEpoch } from "@/components/timetable/use-clock";
import {
  buildHallDutyDay,
  fetchHallDuty,
  type HallDutyDayModel,
  type HallDutyNow,
  type HallDutySlot,
  type HallDutyWeek,
  hallDutyDayOf,
  hallDutyNow,
} from "@/lib/hall-duty";
import {
  loadDayBells,
  loadSchoolPlan,
  type SchoolDayPlan,
} from "@/lib/school-calendar";
import type { TimetablePeriod } from "@/lib/timetable";

//* ---------------------------------------------------------------------------
//* A FOLYOSÓÜGYELET GÉPEZETE
//* ---------------------------------------------------------------------------
//! HÁROM FORRÁSBÓL ÁLL ÖSSZE EGY NAP, ÉS EGYIK SEM HELYETTESÍTI A MÁSIKAT:
//!
//!   1. `hallmanagement`          — KI ügyel, HOL, MELYIK szünetben, MELYIK
//!      (`lib/hall-duty.ts`)        héten. Tanévnyi állandó, egyszer kérjük le.
//!   2. `timetable/calendarplan`  — MELYIK hét van most (A vagy B), és tanítási
//!      (`school-calendar.ts`)      nap-e egyáltalán. Az ügyeleti tábla két
//!                                  hetes ciklusú: e betű nélkül a fele
//!                                  beosztás rossz tanárt mutatna.
//!   3. `timetable/ringsystem/…`  — MIKOR vannak a szünetek EZEN a napon.
//!      (`school-calendar.ts`)      Enélkül a lap tudja, ki ügyel, de nem tudja,
//!                                  hogy most éppen tart-e.
//!
//! MINDHÁROM ELMARADHAT, ÉS MINDHÁROM MÁST VESZ EL. Beosztás nélkül nincs lap;
//! hétbetű nélkül nincs miből választani a két beosztás közül; csengetés nélkül
//! a beosztás megjelenik, csak élő „most” nincs hozzá. A lap ezt a három
//! fokozatot KÜLÖN kezeli — egyetlen „nem sikerült” üzenet mindhármat
//! ugyanolyan végzetesnek mutatná, holott csak az első az.

/** A napsávban álló öt nap. */
export type DutyWeekDay = {
  dateKey: string;
  name: string;
  /** A vezetői ügyeletes tanár erre a napra; a jobb sáv listája ebből él. */
  leader: string | null;
  /** Tanítási nap-e a tanév rendje szerint; `null` = nem tudjuk. */
  teaching: boolean | null;
  //! A BEOSZTÁS MIND AZ ÖT NAPRA FELÉPÜL, NEM CSAK A MUTATOTTRA. A napköteg a
  //! szomszéd lapokat is kirajzolja (attól sima a lapozás) — ha csak az aktív
  //! nap kapna modellt, a még meg sem érintett csütörtök „nincs beosztás”
  //! felirattal állna a lapozás alatt. Az adat pedig megvan hozzá: az ügyeleti
  //! tábla az egész hetet tartalmazza, és a hét betűje napról napra ugyanaz.
  /** Ennek a napnak az ügyeleti beosztása; `null`, amíg nincs elég adat. */
  model: HallDutyDayModel | null;
  /** A nap terve a tanév rendjéből (tanítás, jegyzetek, csengetési rend). */
  plan: SchoolDayPlan | null;
};

export type DutyDayState = {
  /** `null`, amíg a böngésző órája meg nem szólalt (a szerveren nincs „ma”). */
  today: string | null;
  /** A mutatott nap dátuma. */
  shownKey: string | null;
  /** A hét öt napja a napsávnak. */
  days: DutyWeekDay[];
  index: number;
  /** Az A/B hét betűje; üres, ha a tanév rendje nem mondta meg. */
  weekLetter: string;
  //* A mutatott nap beosztása és terve a `days[index]`-ben áll — a lap onnan
  //* olvassa, hogy a szomszéd lapok ugyanabból az egy forrásból éljenek.
  now: HallDutyNow | null;
  clock: ReturnType<typeof useClock>;
  epoch: number;
  /** Igaz, amíg az ügyeleti tábla első lekérése tart. */
  pending: boolean;
  /** Igaz, ha a tábla lekérése lefutott, de egyetlen sort sem hozott. */
  failed: boolean;
  isToday: boolean;
  progress: ReturnType<typeof useMotionValue<number>>;
  pickIndex: (next: number) => void;
};

export function useDutyDay(): DutyDayState {
  const clock = useClock();
  const epoch = useVisibilityEpoch();
  const progress = useMotionValue(0);

  const [today, setToday] = useState<string | null>(null);
  const [weekStart, setWeekStart] = useState<string | null>(null);
  const [index, setIndex] = useState(0);

  const [slots, setSlots] = useState<HallDutySlot[] | null>(null);
  const [plans, setPlans] = useState<Map<string, SchoolDayPlan>>(new Map());
  //! A CSENGETÉS A RENDHEZ TARTOZIK, NEM A NAPHOZ — ezért a rend AZONOSÍTÓJA a
  //! kulcs, nem a dátum. Egy rendes héten mind az öt nap ugyanazon a renden
  //! megy, tehát ez EGYETLEN kérés az egész hétre; ha egy nap kilóg
  //! (rövidített órák), az kap egy másodikat. Dátumra kulcsolva ugyanez öt
  //! kérés lenne, öt azonos válaszért.
  const [bellsByRing, setBellsByRing] = useState<
    Map<number, TimetablePeriod[]>
  >(new Map());

  //! A HÉTVÉGE A KÖVETKEZŐ HETET KÉRDEZI. Szombaton az „ügyel-e most valaki”
  //! válasza triviálisan nem — akit érdekel a beosztás, az a HÉTFŐI-t nézi.
  //! Ugyanaz a döntés, mint az órarendé (`focusMondayKey`), és ugyanonnan jön,
  //! hogy a két lap ne mondjon két különböző „mostani hetet”.
  useEffect(() => {
    const key = todayKey();
    const monday = focusMondayKey(key);
    setToday(key);
    setWeekStart(monday);
    //* A hét napjai közül a mai álljon elöl; hétvégén a hétfő (az `index` 0).
    const offset = Math.round(
      (Date.parse(`${key}T00:00:00`) - Date.parse(`${monday}T00:00:00`)) /
        86_400_000,
    );
    setIndex(offset >= 0 && offset <= 4 ? offset : 0);
  }, []);

  //* Az ügyeleti tábla tanévnyi állandó — egyszer, a lap életére.
  useEffect(() => {
    let alive = true;
    void fetchHallDuty().then((rows) => {
      if (alive) setSlots(rows);
    });
    return () => {
      alive = false;
    };
  }, []);

  //* A tanév rendje a hét ÖT napjára egyszerre jön (egy havi kérés fedi le).
  useEffect(() => {
    if (!weekStart) return;
    let alive = true;
    const keys = [0, 1, 2, 3, 4].map((i) => addDaysKey(weekStart, i));
    void loadSchoolPlan(keys).then((map) => {
      if (alive) setPlans(map);
    });
    return () => {
      alive = false;
    };
  }, [weekStart]);

  //! EGY KÉRÉS RENDENKÉNT, NEM NAPONKÉNT. A hét napjait a csengetési rendjük
  //! szerint csoportosítjuk, és RENDENKÉNT egyetlen napot kérdezünk meg —
  //! rendes héten ez egy kérés, ami mind az ötöt kiszolgálja. (A `loadDayBells`
  //! amúgy is megjegyzi a választ, de az öt kérés akkor is elmenne.)
  useEffect(() => {
    if (!weekStart || plans.size === 0) return;
    let alive = true;

    const representative = new Map<number, string>();
    for (const i of [0, 1, 2, 3, 4]) {
      const dateKey = addDaysKey(weekStart, i);
      const plan = plans.get(dateKey);
      //* Tanítás nélküli napra a végpont hibaobjektumot ad — meg se kérdezzük.
      if (!plan?.teaching || typeof plan.ringSystemId !== "number") continue;
      if (!representative.has(plan.ringSystemId)) {
        representative.set(plan.ringSystemId, dateKey);
      }
    }
    if (representative.size === 0) return;

    void Promise.all(
      [...representative].map(
        async ([id, dateKey]) => [id, await loadDayBells(dateKey)] as const,
      ),
    ).then((entries) => {
      if (!alive) return;
      const next = new Map<number, TimetablePeriod[]>();
      for (const [id, periods] of entries) if (periods) next.set(id, periods);
      setBellsByRing(next);
    });

    return () => {
      alive = false;
    };
  }, [weekStart, plans]);

  const days: DutyWeekDay[] = useMemo(() => {
    if (!weekStart) return [];
    return [0, 1, 2, 3, 4].map((i) => {
      const dateKey = addDaysKey(weekStart, i);
      const plan = plans.get(dateKey) ?? null;
      const dayName = hallDutyDayOf(dateKey);
      const week = plan?.week;
      const known = slots && dayName && (week === "A" || week === "B");
      //* A vezetői ügyeletes a napsáv MELLETT is kell (jobb sáv listája), ezért
      //* itt oldjuk fel — a napok modellje amúgy is végigmegy a héten.
      const leader = known
        ? (slots.find(
            (s) => s.day === dayName && s.week === week && s.area === null,
          )?.teacher ?? null)
        : null;
      const periods =
        typeof plan?.ringSystemId === "number"
          ? (bellsByRing.get(plan.ringSystemId) ?? [])
          : [];
      return {
        dateKey,
        name: DAY_NAMES[i] ?? "",
        leader,
        teaching: plan ? plan.teaching : null,
        plan,
        //! HÉT NÉLKÜL NEM TALÁLGATUNK. Az A és a B hét beosztása MÁS tanárokat
        //! ad ugyanarra a szünetre; ha a tanév rendje nem mondta meg, melyik
        //! van, egy találomra választott betű a lap felét csendben hamissá
        //! tenné. Csengetés nélkül viszont ÉPÜL a modell — csak időpontok
        //! nélkül (lásd `breakSpanOf`).
        model: known
          ? buildHallDutyDay(slots, {
              dateKey,
              day: dayName,
              week: week as HallDutyWeek,
              periods,
            })
          : null,
      };
    });
  }, [weekStart, plans, slots, bellsByRing]);

  const shown = days[index] ?? null;
  const shownKey = shown?.dateKey ?? null;
  const shownPlan = shown?.plan ?? null;
  const weekLetter = shownPlan?.week ?? "";
  const day = shown?.model ?? null;

  const isToday = today !== null && shownKey === today;

  //* A „most” csak a MAI napon értelmes: egy csütörtöki beosztás fölött a
  //* keddi óra állása semmit nem mond.
  const now = useMemo(() => {
    if (!day || !clock || !isToday) return null;
    if (shownPlan && !shownPlan.teaching) return null;
    return hallDutyNow(day, clock.min);
  }, [day, clock, isToday, shownPlan]);

  const pickIndex = useCallback((next: number) => {
    setIndex(Math.min(Math.max(next, 0), 4));
  }, []);

  return {
    today,
    shownKey,
    days,
    index,
    weekLetter,
    now,
    clock,
    epoch,
    pending: slots === null,
    failed: slots !== null && slots.length === 0,
    isToday,
    progress,
    pickIndex,
  };
}
