"use client";

import { useCallback, useEffect, useState } from "react";
import { NotificationMenu } from "@/components/pwa/notification-menu";
import { TimetableCalendar } from "@/components/timetable/calendar";
import { DualSetupButton } from "@/components/timetable/dual-menu";
import { MorphingInfinity } from "@/components/ui/morphing-infinity";
import {
  type DualSchedule,
  dualStatusFor,
  hasAnyDualDay,
  loadDualSchedule,
  saveDualSchedule,
} from "@/lib/dual-schedule";
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
import { type CachedWeek, loadWeekOrCached } from "@/lib/timetable-cache";

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
  //! AZ ELSŐ HÉT IS JÖHET A KÉSZÜLÉKRŐL. A lapozást a rács intézi, de a
  //! LEGELSŐ hetet ez a hatás tölti be — hálózat nélkül eddig a „nem érhető el"
  //! lap jött, holott a mentett példány ott volt (a `/ma` abból rajzolt).
  const [initialStale, setInitialStale] = useState<CachedWeek | null>(null);

  //! A DUÁLIS JELÖLÉS CSAK AKKOR JELENIK MEG, HA A DIÁK MAGA ÁLLÍTOTTA BE A
  //! BEOSZTÁSÁT (lásd `/ma`, `DualPanel`). Enélkül nem tudjuk, mely napok
  //! esnek a munkahelyre — és nem is TALÁLGATUNK: az `/orarend` pontosan úgy
  //! néz ki, mint eddig. Beállítás után viszont jelvényt kap a nap fejlécében
  //! és egy 8:00–15:00 blokkot a nap helyén.
  //!
  //! A RÁCS MINDEN NAPRA KÉRDEZ, ÉS AZ OSZTÁLYT IS Ő TUDJA — az osztályváltó
  //! ugyanis benne ül, nem itt. A beosztás viszont OSZTÁLYONKÉNT külön van
  //! (lásd `dual-schedule.ts`): egy másik osztály órarendjét átnézve a saját
  //! duális napjaink ráhúzása értelmetlen lenne. Ezért osztályra válaszolunk —
  //! és amelyikhez nincs beállítás, arra `undefined`-dal, vagyis a rács
  //! pontosan úgy néz ki, mint eddig.
  //*
  //* A `localStorage` olvasása napi kérdésenként fölösleges munka lenne; a
  //* beosztás osztályonként egyszer kerül elő, és a lap élete végéig áll (a
  //* beállítás a `/ma`-n történik, onnan visszatérve ez a lap újraépül).
  //! A GYORSÍTÓTÁR ÁLLAPOT, MERT A BEOSZTÁS MÁR NEMCSAK ÍRÓDIK, HANEM VÁLTOZIK
  //! IS. Amíg a beállítás csak a `/ma`-n történt, egy `ref` elég volt: a lap
  //! visszatéréskor úgyis újraépült. A sávból viszont MENET KÖZBEN íródik át —
  //! egy `ref`-ről pedig a React nem tud, és a rács a régi napokat rajzolná
  //! tovább. A térkép cseréje az egyetlen jel: tőle kap új azonosságot a
  //! `readSchedule`, azon át a `dualStatusForDay`, és ezért számol újra a
  //! naptár minden duális memója.
  const [schedules, setSchedules] = useState(
    () => new Map<string, DualSchedule | null>(),
  );

  //* A lusta betöltés NEM változás: ugyanazt a választ írja be, amit a hívó
  //* amúgy is megkapott, ezért a térképet helyben tölti fel — újrarajzolni
  //* nem kell tőle.
  const readSchedule = useCallback(
    (classShort: string) => {
      let schedule = schedules.get(classShort);
      if (schedule === undefined) {
        schedule = loadDualSchedule(classShort);
        schedules.set(classShort, schedule);
      }
      return schedule;
    },
    [schedules],
  );

  //* A beállítás azonnal él és azonnal íródik — nincs „Mentés" gomb, ahogy a
  //* `/ma` paneljén sincs: a párbeszéd mögött a rács már át is áll rá.
  const changeSchedule = useCallback(
    (classShort: string, next: DualSchedule) => {
      if (!classShort) return;
      saveDualSchedule(classShort, next);
      setSchedules((prev) => new Map(prev).set(classShort, next));
    },
    [],
  );

  const dualStatusForDay = useCallback(
    ({
      dayOfWeek,
      weekLetter,
      classShort,
    }: {
      dayOfWeek: number;
      weekLetter: string;
      classShort: string;
    }) => {
      if (!classShort) return undefined;
      const schedule = readSchedule(classShort);
      //! CSAK AKKOR JELÖLÜNK, HA VAN MIT. Beállítás nélkül — és annál is, aki
      //! kimondta, hogy nem jár duálisra — a rács nem állít semmit: egy minden
      //! napra kiírt „Iskola" nem információ, csak zaj.
      if (!schedule || !hasAnyDualDay(schedule)) return undefined;
      return dualStatusFor(schedule, dayOfWeek, weekLetter);
    },
    [readSchedule],
  );

  //! A BEÁLLÍTÓ A SÁVBAN, DE A VÁLASZ ITT SZÜLETIK. A naptár csak azt tudja,
  //! melyik osztály melyik hetét nézik — a beosztás betöltése, mentése és a
  //! párbeszéd ezé a lapé (ugyanaz a rács, mint a `/ma` panelén).
  const dualSetup = useCallback(
    ({
      classShort,
      weekLetter,
    }: {
      classShort: string;
      weekLetter: string;
    }) => (
      <DualSetupButton
        //* Az osztályváltás új beosztást jelent: a párbeszéd ne az előző
        //* osztályéval nyíljon ki tovább.
        key={classShort}
        schedule={readSchedule(classShort)}
        weekLetter={weekLetter}
        classShort={classShort}
        onChange={(next) => changeSchedule(classShort, next)}
      />
    ),
    [readSchedule, changeSchedule],
  );

  //! UGYANAZ A HATÁR, MINT A DUÁLIS BEÁLLÍTÓNÁL: a rács csak azt tudja, melyik
  //! osztályt nézik — hogy szóljunk-e róla és mikor, az a harangé.
  const notifySetup = useCallback(
    ({ classShort }: { classShort: string }) => (
      <NotificationMenu classes={classes} currentClass={classShort} />
    ),
    [classes],
  );

  useEffect(() => {
    let cancelled = false;
    const cached = loadCachedClass() || PUBLIC_DEFAULT_CLASS;
    (async () => {
      try {
        const [list, first] = await Promise.all([
          fetchTimetableClasses(),
          //* A hét kulcsa ugyanaz, amit a `/ma` ír (osztály + hétfő), tehát a
          //* két lap UGYANAZT a mentett hetet találja meg.
          loadWeekOrCached(cached, mondayOf(), () =>
            buildTimetableView({ userClass: cached }),
          ),
        ]);
        if (cancelled) return;
        setClasses(list.classes);
        setClassesError(list.error);
        setView(first.view);
        setInitialStale(first.cached);
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
          initialStale={fatal ? null : initialStale}
          classes={classes}
          classesError={classesError}
          variant="fullscreen"
          dualStatusForDay={dualStatusForDay}
          dualSetup={dualSetup}
          notifySetup={notifySetup}
          //* A „Ma: Duális/Iskola" jelvényt a rács rajzolja a cím mellé — ott
          //* ismert az ÉPPEN nézett hét és osztály (lásd `TimetableCalendar`).
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
