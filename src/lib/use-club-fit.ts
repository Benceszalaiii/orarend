"use client";

import { useEffect, useState } from "react";
import type { FitWeek } from "./club-fit";
import { ownLessons } from "./club-fit";
import { type DualSchedule, loadDualSchedule } from "./dual-schedule";
import {
  buildTimetableView,
  mondayOf,
  subjectStoreKey,
  type TimetableView,
} from "./timetable";
import { loadCachedWeeks, loadWeekOrCached } from "./timetable-cache";
import { loadLocalPreferences } from "./timetable-merge";

//! ═══════════════════════════════════════════════════════════════════════════
//! A DIÁK HETEI A „BELEFÉR-E" KÉRDÉSHEZ
//! ═══════════════════════════════════════════════════════════════════════════
//! ELŐSZÖR A KÉSZÜLÉK. Aki nyitott már órarendet, annak a hetei ott vannak a
//! heti gyorsítótárban (`timetable-cache.ts`) — ezekből azonnal van válasz,
//! hálózat nélkül is. Ha a FOLYÓ hét hiányzik, azt lekérjük (ugyanazon az
//! úton, amin a rács, tehát utána a rács is gyorsabban nyílik).
//!
//! A DÖNTÉSEK MINDIG A MOSTANIAK. A mentett hét a mentéskori döntéseket
//! hordozza; ha azóta elrejtett egy csoportot, a szabad idejét a mostani
//! döntés szerint számoljuk (`loadLocalPreferences`).
//! ═══════════════════════════════════════════════════════════════════════════

//! A HIBA NEVET KAP. Ha a Jedlikinfo nem válaszol és a készüléken sincs
//! mentett hét, azt mondjuk ki — nem egy üres „nem tudjuk" sávot mutatunk.
export type FitWeeks =
  | { state: "none" }
  | { state: "loading" }
  | { state: "error" }
  | { state: "ready"; weeks: FitWeek[]; dual: DualSchedule | null };

function toFitWeek(view: TimetableView): FitWeek {
  return { days: view.days, lessons: view.lessons };
}

export function useClubFitWeeks(className: string | null): FitWeeks {
  const [result, setResult] = useState<FitWeeks>({ state: "none" });

  useEffect(() => {
    if (!className) {
      setResult({ state: "none" });
      return;
    }
    const storeKey = subjectStoreKey("class", className);
    const prefs = loadLocalPreferences(storeKey);
    //* A duális beosztás az osztályé, amibe a diák jár (`dual-schedule.ts`).
    const dual = loadDualSchedule(className);
    const own = (views: TimetableView[]): FitWeek[] =>
      views
        .filter((v) => v.ok && v.subject?.short === className)
        .map(toFitWeek)
        .map((w) => ({ ...w, lessons: ownLessons(w.lessons, prefs) }));

    const cached = loadCachedWeeks(storeKey).map((c) => c.view);
    const thisWeek = mondayOf();
    const hasCurrent = cached.some((v) => v.weekStart === thisWeek);
    setResult(
      cached.length > 0
        ? { state: "ready", weeks: own(cached), dual }
        : { state: "loading" },
    );
    if (hasCurrent) return;

    let alive = true;
    loadWeekOrCached(storeKey, thisWeek, () =>
      buildTimetableView({
        kind: "class",
        userClass: className,
        weekStart: thisWeek,
      }),
    )
      .then(({ view }) => {
        if (!alive) return;
        const others = cached.filter((v) => v.weekStart !== view.weekStart);
        if (!view.ok && others.length === 0) {
          setResult({ state: "error" });
          return;
        }
        setResult({ state: "ready", weeks: own([view, ...others]), dual });
      })
      .catch(() => {
        if (!alive) return;
        setResult(
          cached.length > 0
            ? { state: "ready", weeks: own(cached), dual }
            : { state: "error" },
        );
      });
    return () => {
      alive = false;
    };
  }, [className]);

  return result;
}
