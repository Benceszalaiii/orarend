"use client";

import { useEffect, useState } from "react";
import { SiteNav } from "@/components/site-nav";
import { TimetableCalendar } from "@/components/timetable/calendar";
import { MorphingInfinity } from "@/components/ui/morphing-infinity";
import {
  buildTimetableView,
  describeTimetableFailure,
  fetchTimetableClasses,
  loadCachedClass,
  mondayOf,
  PUBLIC_DEFAULT_CLASS,
  type TimetableClass,
  type TimetableError,
  type TimetableView,
} from "@/lib/timetable";

export function OrarendPage() {
  const [classes, setClasses] = useState<TimetableClass[]>([]);
  const [view, setView] = useState<TimetableView | null>(null);
  //* Az osztálylista és az órarend külön kérés — külön is tud elbukni, ezért a
  //* hibájuk sem közös. A rács mindig a saját hibáját mutatja; a lista hibája
  //* csak akkor kerül elő, ha emiatt nincs miből választani.
  const [classesError, setClassesError] = useState<
    TimetableError | undefined
  >();
  const [fatal, setFatal] = useState<TimetableError | null>(null);

  useEffect(() => {
    let cancelled = false;
    const cached = loadCachedClass() || PUBLIC_DEFAULT_CLASS;
    (async () => {
      try {
        const [list, initialView] = await Promise.all([
          fetchTimetableClasses(),
          buildTimetableView({ userClass: cached }),
        ]);
        if (cancelled) return;
        setClasses(list.classes);
        setClassesError(list.error);
        setView(initialView);
      } catch (err) {
        //! Ide csak váratlan kivétel jut (a hálózati hibákat a hívott függvények
        //! már nevesítve adják vissza) — a fajtáját akkor is megőrizzük.
        if (!cancelled) {
          setFatal(describeTimetableFailure(err));
          setView((current) => current ?? emptyView());
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    //! `min-h-[100dvh]` a képernyőé; a papíron viszont ez egy fél üres második
    //! lapot kényszerítene ki, ezért ott elengedjük.
    <main className="flex min-h-[100dvh] flex-col bg-card pt-[env(safe-area-inset-top)] print:min-h-0">
      {view ? (
        <TimetableCalendar
          initialView={fatal ? { ...view, ok: false, error: fatal } : view}
          classes={classes}
          classesError={classesError}
          variant="fullscreen"
          //* A három nézet közti váltó az eszköztár jobb szélén ül — ez az
          //* egyetlen hely, ahonnan a másik két lap egyáltalán elérhető.
          trailing={<SiteNav />}
          heading={
            <h1 className="shrink-0 text-base font-bold tracking-tight text-foreground max-sm:sr-only">
              Órarend
            </h1>
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

//* A kivételes ág tartaléka: nézet nélkül a naptár nem tud kirajzolódni, így a
//* hibaüzenetet sem tudná megmutatni. A hét a mostani — az „Újra” gomb így a
//* helyes hetet tölti újra.
function emptyView(): TimetableView {
  return {
    ok: false,
    resolvedClass: null,
    weekStart: mondayOf(),
    days: [],
    periods: [],
    lessons: [],
    events: [],
    prefs: [],
    persistence: "local",
  };
}
