"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { SiteNav } from "@/components/site-nav";
import { TimetableCalendar } from "@/components/timetable/calendar";
import { MorphingInfinity } from "@/components/ui/morphing-infinity";
import { buildDualPlans, type DualPlanSet, MAX_PLANS } from "@/lib/dual-plan";
import { DUAL_LABEL, dualStatusOf } from "@/lib/dualis";
import {
  mondayOf,
  type TimetableError,
  type TimetableView,
} from "@/lib/timetable";
import { cn } from "@/lib/utils";
import { PlanPicker } from "./plan-picker";

//! ─── A DUÁLIS LAP ──────────────────────────────────────────────────────────
//! Ugyanaz a rács, mint az `/orarend`-en, de nem EGY osztály órarendjét mutatja:
//! a 13A két csoportjából és a 13C-ből összeválogatott TERVEKET. Az
//! osztályválasztó helyén ezért a tervválasztó áll (A, B, C…), a hét-lapozás
//! és minden más viszont változatlan — a rács a `loadView` kampón keresztül
//! kapja a tervet.

const PLAN_ERROR: TimetableError = {
  kind: "payload",
  title: "Nem állítható össze terv",
  message:
    "A 13A és a 13C órarendjéből erre a hétre nem jött ki egyetlen tanítási napra eső terv sem.",
  hint: "Lehet, hogy szünet van, vagy a hét mindkét osztálynál üres. Nézz meg egy másik hetet.",
  retryable: true,
};

//* A tervből órarendi nézet: a rács ezt a formátumot ismeri.
function planToView(set: DualPlanSet, index: number): TimetableView {
  const plan = set.plans[index];
  return {
    ok: Boolean(plan),
    error: plan ? undefined : PLAN_ERROR,
    //! A rács ebből tudja, hogy VAN mit mutatni (`hasClass`) — a „válassz
    //! osztályt" felszólítás itt értelmetlen lenne. Nem valódi osztály, ezért
    //! a `loadView` mellett a rács nem is menti el (lásd `saveCachedClass`).
    resolvedClass: plan ? { short: plan.id, name: `${plan.id} terv` } : null,
    weekStart: set.weekStart,
    days: set.days,
    periods: set.periods,
    lessons: plan?.lessons ?? [],
    events: [],
    prefs: [],
    persistence: "local",
  };
}

export function DualisPage() {
  const [view, setView] = useState<TimetableView | null>(null);
  const [planSet, setPlanSet] = useState<DualPlanSet | null>(null);
  const [planIndex, setPlanIndex] = useState(0);
  //* A tervváltás nem hetet vált — ezzel a jellel kérjük a rácstól, hogy
  //* ugyanarra a hétre kérjen új nézetet (hálózat nélkül, gyorsítótárból).
  const [reloadToken, setReloadToken] = useState(0);
  const [todayLabel, setTodayLabel] = useState<{
    status: "dual" | "school";
    text: string;
  } | null>(null);

  //! A KIVÁLASZTOTT TERV REF-BEN IS. A `loadView`-t a rács hívja, és a
  //! hivatkozásának STABILNAK kell lennie (különben minden renderben új
  //! betöltő keletkezne) — a friss tervindexet ezért ref-ből olvassa, nem
  //! bezárt állapotból.
  const planIndexRef = useRef(0);
  //! HETENKÉNTI GYORSÍTÓTÁR. A tervek előállítása három lekérés + némi
  //! kombinatorika; a tervváltásnak viszont azonnalinak kell lennie. A hét
  //! nyers eredményét ezért megjegyezzük, és a váltás csak újraválaszt belőle.
  const cacheRef = useRef(new Map<string, DualPlanSet>());

  const loadPlans = useCallback(async (weekStart: string) => {
    const cached = cacheRef.current.get(weekStart);
    const set = cached ?? (await buildDualPlans(weekStart));
    if (!cached) cacheRef.current.set(weekStart, set);
    //* Új héten a korábbi tervindex túlfuthat a listán.
    const index = Math.min(
      planIndexRef.current,
      Math.max(0, set.plans.length - 1),
    );
    planIndexRef.current = index;
    setPlanSet(set);
    setPlanIndex(index);
    return planToView(set, index);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const first = await loadPlans(mondayOf());
      if (cancelled) return;
      setView(first);

      const today = first.days.find((d) => d.isToday);
      const weekLetter = first.days.find(
        (d) => d.week === "A" || d.week === "B",
      )?.week;
      if (today && weekLetter) {
        const status = dualStatusOf(today.dayOfWeek, weekLetter);
        if (status !== "unknown") {
          setTodayLabel({ status, text: DUAL_LABEL[status] });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadPlans]);

  const choosePlan = (index: number) => {
    planIndexRef.current = index;
    setPlanIndex(index);
    setReloadToken((t) => t + 1);
  };

  return (
    <main className="flex min-h-[100dvh] flex-col bg-card print:min-h-0">
      {view ? (
        <TimetableCalendar
          initialView={view}
          //! ÜRES OSZTÁLYLISTA: így a rács nem rajzol osztályválasztót. A
          //! helyét a tervválasztó veszi át a `trailing`-ben.
          classes={[]}
          variant="fullscreen"
          dual
          loadView={loadPlans}
          reloadToken={reloadToken}
          trailing={
            <>
              {planSet && planSet.plans.length > 0 && (
                <PlanPicker
                  plans={planSet.plans}
                  index={planIndex}
                  onSelect={choosePlan}
                  unreachable={planSet.unreachable}
                />
              )}
              <SiteNav />
            </>
          }
          heading={
            <div className="flex shrink-0 items-center gap-2 max-sm:sr-only">
              <h1
                className="text-base font-bold tracking-tight text-foreground"
                title="B hét szerda–péntek és A hét hétfő–kedd: duális képzés."
              >
                Duális
              </h1>
              {todayLabel && (
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold",
                    todayLabel.status === "dual"
                      ? "bg-primary/15 text-primary"
                      : "bg-muted text-muted-strong",
                  )}
                >
                  Ma: {todayLabel.text}
                </span>
              )}
              {planSet && planSet.plans.length >= MAX_PLANS && (
                //* Őszinte jelzés: a lista meg van vágva, nem ennyi terv van.
                <span
                  className="shrink-0 text-xs text-muted-foreground"
                  title={`Csak a legjobb ${MAX_PLANS} terv látszik.`}
                >
                  top {MAX_PLANS}
                </span>
              )}
            </div>
          }
        />
      ) : (
        <div className="flex flex-1 items-center justify-center py-16">
          <MorphingInfinity className="size-24 text-muted-foreground" />
        </div>
      )}
    </main>
  );
}
