"use client";

import { useCallback, useEffect, useState } from "react";
import { NotificationMenu } from "@/components/pwa/notification-menu";
import { TimetableCalendar } from "@/components/timetable/calendar";
import { DualSetupButton } from "@/components/timetable/dual-menu";
import { MorphingInfinity } from "@/components/ui/morphing-infinity";
import { useSession } from "@/lib/auth-client";
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
  fetchTimetableSubjects,
  loadCachedSubject,
  mondayOf,
  PUBLIC_DEFAULT_CLASS,
  subjectStoreKey,
  type TimetableError,
  type TimetableSubject,
  type TimetableSubjectKind,
  type TimetableView,
} from "@/lib/timetable";
import { type CachedWeek, loadWeekOrCached } from "@/lib/timetable-cache";

//! ═══════════════════════════════════════════════════════════════════════════
//! A HETI RÁCS LAPJA — KÉT ALANYRA, EGY PÉLDÁNYBAN
//! ═══════════════════════════════════════════════════════════════════════════
//! AZ `/orarend` ÉS A `/tanari` UGYANAZ A LAP. Ugyanaz a rács, ugyanaz a
//! lapozás, ugyanaz az offline tartalék, ugyanaz a duális beosztás — a
//! különbség annyi, hogy KI az órarend alanya: egy osztály vagy egy tanár.
//! Ez a különbség egyetlen `mode` értékben áll, és minden más ebből
//! következik: melyik listát töltjük, melyik tárolókulcsra írunk, és mit
//! mondanak a feliratok.
//!
//! MIÉRT NEM KÉT LAP. Mert a két lap MÁSKÉNT romlana el. Amikor a rács kapott
//! egy héthatáron áthúzható szalagot, egy előre lekérést és egy mentett-hét
//! jelzést, mindegyiket EGYSZER kellett megírni; egy második másolat ezek
//! egyikét sem kapta volna meg magától, és a tanári oldalról egy idő után
//! kiderült volna, hogy „ugyanaz, csak rosszabb".
//! ═══════════════════════════════════════════════════════════════════════════

export function TimetablePage({
  mode,
  heading,
}: {
  mode: TimetableSubjectKind;
  /** A sávban álló lapcím — a lap SAJÁT neve, nem a rácsé. */
  heading: string;
}) {
  const [subjects, setSubjects] = useState<TimetableSubject[]>([]);
  const [view, setView] = useState<TimetableView | null>(null);
  //* A lista és az órarend külön kérés — külön is tud elbukni, ezért a hibájuk
  //* sem közös. A rács mindig a saját hibáját mutatja; a lista hibája csak
  //* akkor kerül elő, ha emiatt nincs miből választani.
  const [subjectsError, setSubjectsError] = useState<
    TimetableError | undefined
  >();
  const [fatal, setFatal] = useState<TimetableError | null>(null);
  //! AZ ELSŐ HÉT IS JÖHET A KÉSZÜLÉKRŐL. A lapozást a rács intézi, de a
  //! LEGELSŐ hetet ez a hatás tölti be — hálózat nélkül eddig a „nem érhető el"
  //! lap jött, holott a mentett példány ott volt (a `/ma` abból rajzolt).
  const [initialStale, setInitialStale] = useState<CachedWeek | null>(null);

  //! A BEJELENTKEZÉS ITT NEM KAPU, HANEM TIPP. A tanári lap fiók nélkül is
  //! teljesen használható — de aki iskolai belépéssel jött, annak a nevét az
  //! iskola rendszere már megmondta (lásd `jedlik-ad.ts`), és értelmetlen
  //! lenne még egyszer megkérdezni tőle, hogy ki ő.
  const { data: session } = useSession();
  const sessionName = session?.user.name ?? null;
  const sessionIsTeacher = session?.user.isTeacher === true;

  //! A DUÁLIS JELÖLÉS CSAK AKKOR JELENIK MEG, HA A FELHASZNÁLÓ MAGA ÁLLÍTOTTA
  //! BE A BEOSZTÁSÁT (lásd `/ma`, `DualPanel`). Enélkül nem tudjuk, mely napok
  //! esnek a munkahelyre — és nem is TALÁLGATUNK: a lap pontosan úgy néz ki,
  //! mint enélkül. Beállítás után viszont jelvényt kap a nap fejlécében és egy
  //! 8:00–15:00 blokkot a nap helyén.
  //!
  //! A RÁCS MINDEN NAPRA KÉRDEZ, ÉS AZ ALANYT IS Ő TUDJA — a választó ugyanis
  //! benne ül, nem itt. A beosztás viszont ALANYONKÉNT külön van (lásd
  //! `dual-schedule.ts`): egy másik osztály órarendjét átnézve a saját duális
  //! napjaink ráhúzása értelmetlen lenne. Ezért alanyra válaszolunk — és
  //! amelyikhez nincs beállítás, arra `undefined`-dal, vagyis a rács pontosan
  //! úgy néz ki, mint eddig.
  //!
  //! A GYORSÍTÓTÁR ÁLLAPOT, MERT A BEOSZTÁS MÁR NEMCSAK ÍRÓDIK, HANEM VÁLTOZIK
  //! IS. A sávból MENET KÖZBEN íródik át — egy `ref`-ről pedig a React nem tud,
  //! és a rács a régi napokat rajzolná tovább. A térkép cseréje az egyetlen
  //! jel: tőle kap új azonosságot a `readSchedule`, azon át a
  //! `dualStatusForDay`, és ezért számol újra a naptár minden duális memója.
  const [schedules, setSchedules] = useState(
    () => new Map<string, DualSchedule | null>(),
  );

  //* A lusta betöltés NEM változás: ugyanazt a választ írja be, amit a hívó
  //* amúgy is megkapott, ezért a térképet helyben tölti fel — újrarajzolni
  //* nem kell tőle.
  const readSchedule = useCallback(
    (short: string) => {
      const key = subjectStoreKey(mode, short);
      let schedule = schedules.get(key);
      if (schedule === undefined) {
        schedule = loadDualSchedule(key);
        schedules.set(key, schedule);
      }
      return schedule;
    },
    [schedules, mode],
  );

  //* A beállítás azonnal él és azonnal íródik — nincs „Mentés" gomb, ahogy a
  //* `/ma` paneljén sincs: a párbeszéd mögött a rács már át is áll rá.
  const changeSchedule = useCallback(
    (short: string, next: DualSchedule) => {
      const key = subjectStoreKey(mode, short);
      if (!key) return;
      saveDualSchedule(key, next);
      setSchedules((prev) => new Map(prev).set(key, next));
    },
    [mode],
  );

  const dualStatusForDay = useCallback(
    ({
      dayOfWeek,
      weekLetter,
      subjectShort,
    }: {
      dayOfWeek: number;
      weekLetter: string;
      subjectShort: string;
    }) => {
      if (!subjectShort) return undefined;
      const schedule = readSchedule(subjectShort);
      //! CSAK AKKOR JELÖLÜNK, HA VAN MIT. Beállítás nélkül — és annál is, aki
      //! kimondta, hogy nincs duális napja — a rács nem állít semmit: egy
      //! minden napra kiírt „Iskola" nem információ, csak zaj.
      if (!schedule || !hasAnyDualDay(schedule)) return undefined;
      return dualStatusFor(schedule, dayOfWeek, weekLetter);
    },
    [readSchedule],
  );

  //! A BEÁLLÍTÓ A SÁVBAN, DE A VÁLASZ ITT SZÜLETIK. A naptár csak azt tudja,
  //! melyik alany melyik hetét nézik — a beosztás betöltése, mentése és a
  //! párbeszéd ezé a lapé (ugyanaz a rács, mint a `/ma` panelén).
  const dualSetup = useCallback(
    ({
      subjectShort,
      weekLetter,
    }: {
      subjectShort: string;
      weekLetter: string;
    }) => (
      <DualSetupButton
        //* Az alanyváltás új beosztást jelent: a párbeszéd ne az előzőével
        //* nyíljon ki tovább.
        key={subjectShort}
        mode={mode}
        schedule={readSchedule(subjectShort)}
        weekLetter={weekLetter}
        subjectShort={subjectShort}
        onChange={(next) => changeSchedule(subjectShort, next)}
      />
    ),
    [readSchedule, changeSchedule, mode],
  );

  //! UGYANAZ A HATÁR, MINT A DUÁLIS BEÁLLÍTÓNÁL: a rács csak azt tudja, melyik
  //! alanyt nézik — hogy szóljunk-e róla és mikor, az a harangé.
  //*
  //! ÉRTESÍTÉS CSAK OSZTÁLYRA. A feliratkozás a szerveren OSZTÁLYRA szól (lásd
  //! `push-store.ts` és `known-class.ts`): a napi órarend-emlékeztetőt egy
  //! osztály órarendjéből számolja a háttérfeladat. Egy tanári feliratkozás
  //! némán elveszne — ezért a harang a tanári lapon nem is jelenik meg,
  //! ahelyett hogy egy nem működő gombot kínálnánk.
  const notifySetup = useCallback(
    ({ subjectShort }: { subjectShort: string }) => (
      <NotificationMenu classes={subjects} currentClass={subjectShort} />
    ),
    [subjects],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await fetchTimetableSubjects(mode);
        if (cancelled) return;
        setSubjects(list.subjects);
        setSubjectsError(list.error);

        const wanted = initialSubject({
          mode,
          subjects: list.subjects,
          sessionName,
          sessionIsTeacher,
        });

        //! NINCS ALANY, NINCS KÉRÉS. A tanári lap nem tippel rá senkire: aki
        //! először nyitja meg, a választót kapja, nem egy idegen órarendjét.
        if (!wanted) {
          setView(emptyView(mode));
          return;
        }

        //* A hét kulcsa ugyanaz, amit a `/ma` ír (alany + hétfő), tehát a két
        //* lap UGYANAZT a mentett hetet találja meg.
        const first = await loadWeekOrCached(
          subjectStoreKey(mode, wanted),
          mondayOf(),
          () => buildTimetableView({ kind: mode, userClass: wanted }),
        );
        if (cancelled) return;
        setView(first.view);
        setInitialStale(first.cached);
      } catch (err) {
        //! Ide csak váratlan kivétel jut (a hálózati hibákat a hívott
        //! függvények már nevesítve adják vissza) — a fajtáját akkor is
        //! megőrizzük.
        if (!cancelled) {
          setFatal(describeTimetableFailure(err));
          setView((current) => current ?? emptyView(mode));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    //! A MUNKAMENET KÉSŐBB ÉRKEZIK, ÉS EZ SZÁNDÉKOSAN NEM INDÍT ÚJRA. A
    //! névből csak az ELSŐ megnyitás tippje lesz; ha a válasz a lista után
    //! futna be, egy már kiválasztott alanyt írna felül a szeme előtt.
    //* Az első futásnál a munkamenet többnyire megvan (a sáv fiókgombja
    //* ugyanezt a lekérdezést osztja meg), a tanári lap pedig amúgy is a
    //* mentett választásból indul, ha volt már ilyen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  return (
    //! `min-h-[100dvh]` a képernyőé; a papíron viszont ez egy fél üres második
    //! lapot kényszerítene ki, ezért ott elengedjük.
    <main className="flex min-h-[100dvh] flex-col bg-card pt-[env(safe-area-inset-top)] print:min-h-0">
      {view ? (
        <TimetableCalendar
          initialView={fatal ? { ...view, ok: false, error: fatal } : view}
          initialStale={fatal ? null : initialStale}
          mode={mode}
          subjects={subjects}
          subjectsError={subjectsError}
          variant="fullscreen"
          dualStatusForDay={dualStatusForDay}
          dualSetup={dualSetup}
          notifySetup={mode === "class" ? notifySetup : undefined}
          //* A „Ma: Duális/Iskola" jelvényt a rács rajzolja a cím mellé — ott
          //* ismert az ÉPPEN nézett hét és alany (lásd `TimetableCalendar`).
          heading={
            <h1 className="shrink-0 text-base font-bold tracking-tight text-foreground max-sm:sr-only">
              {heading}
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

//! ─── KIÉ AZ ELSŐ HÉT ───────────────────────────────────────────────────────
//! Három forrás, ebben a sorrendben, és a sorrend a lényeg:
//!   1. amit legutóbb ezen a készüléken választottak — ez a legerősebb jel,
//!      mert kimondott döntés volt;
//!   2. tanári lapon: az iskolai belépésből ismert NÉV, ha szerepel a
//!      tanárlistában (a listához mérés nélkül egy elgépelt vagy megváltozott
//!      névből „ismeretlen tanár" hibalap lenne, nem választó);
//!   3. osztály-lapon: a nyilvános alapértelmezés, hogy a lap első
//!      megnyitásra is MUTASSON valamit.
//* Tanári lapon szándékosan NINCS harmadik lépés: egy tetszőleges kolléga
//* órarendjét felütni köszönés helyett rosszabb, mint egy üres választó.
function initialSubject({
  mode,
  subjects,
  sessionName,
  sessionIsTeacher,
}: {
  mode: TimetableSubjectKind;
  subjects: TimetableSubject[];
  sessionName: string | null;
  sessionIsTeacher: boolean;
}): string {
  const remembered = loadCachedSubject(mode);
  if (remembered) return remembered;

  if (mode === "teacher") {
    if (!sessionIsTeacher || !sessionName) return "";
    const wanted = sessionName.trim().toLocaleLowerCase("hu");
    const match = subjects.find(
      (s) => s.name.trim().toLocaleLowerCase("hu") === wanted,
    );
    return match?.short ?? "";
  }

  return PUBLIC_DEFAULT_CLASS;
}

//* A kivételes ág tartaléka: nézet nélkül a naptár nem tud kirajzolódni, így a
//* hibaüzenetet sem tudná megmutatni. A hét a mostani — az „Újra” gomb így a
//* helyes hetet tölti újra.
function emptyView(kind: TimetableSubjectKind): TimetableView {
  return {
    ok: false,
    kind,
    subject: null,
    weekStart: mondayOf(),
    days: [],
    periods: [],
    lessons: [],
    events: [],
    prefs: [],
    persistence: "local",
  };
}
