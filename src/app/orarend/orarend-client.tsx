"use client";

import { useEffect, useState } from "react";
import { TimetableCalendar } from "@/components/timetable/calendar";
import { Spinner } from "@/components/ui/spinner";
import {
  buildTimetableView,
  getTimetableClasses,
  loadCachedClass,
  PUBLIC_DEFAULT_CLASS,
  type TimetableClass,
  type TimetableView,
} from "@/lib/timetable";
import { MorphingInfinity } from "@/components/ui/morphing-infinity";
export function OrarendPage() {
  const [classes, setClasses] = useState<TimetableClass[]>([]);
  const [view, setView] = useState<TimetableView | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const cached = loadCachedClass() || PUBLIC_DEFAULT_CLASS;
    (async () => {
      try {
        const [cls, initialView] = await Promise.all([
          getTimetableClasses(),
          buildTimetableView({ userClass: cached }),
        ]);
        if (cancelled) return;
        setClasses(cls);
        setView(initialView);
      } catch {
        if (!cancelled) setError("Nem sikerült betölteni az órarendet.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    //! `min-h-[100dvh]` a képernyőé; a papíron viszont ez egy fél üres második
    //! lapot kényszerítene ki, ezért ott elengedjük.
    <main className="flex min-h-[100dvh] flex-col bg-card print:min-h-0">
      {view ? (
        <TimetableCalendar
          initialView={error ? { ...view, ok: false, error } : view}
          classes={classes}
          variant="fullscreen"
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
