"use client";

import { useCallback, useEffect, useState } from "react";
import { NotificationMenu } from "@/components/pwa/notification-menu";
import { TimetableCalendar } from "@/components/timetable/calendar";
import { DualSetupButton } from "@/components/timetable/dual-menu";
import { focusMondayKey } from "@/components/timetable/shared";
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
  PUBLIC_DEFAULT_CLASS,
  subjectStoreKey,
  type TimetableError,
  type TimetableSubject,
  type TimetableSubjectKind,
  type TimetableView,
} from "@/lib/timetable";
import {
  type CachedWeek,
  loadCachedWeek,
  loadWeekOrCached,
} from "@/lib/timetable-cache";

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
  //! A TANÁRI HARANG BELÉPÉSHEZ KÖTÖTT, ÉS EZ NEM ÓVATOSSÁG. A tanári
  //! feliratkozás egy KONKRÉT EMBER munkanapját küldi percre pontosan egy
  //! készülékre; a végpont ezért csak iskolai belépéssel, tanárként igazolt
  //! fióktól fogadja el (lásd `/api/ertesites`). A felület ugyanezt a határt
  //! húzza meg — belépés nélkül a harang meg sem jelenik a tanári lapon,
  //! ahelyett hogy egy gombot kínálnánk, ami utána elutasítást kap.
  //*
  //* Az osztályos lapon nincs feltétel: az osztály órarendje amúgy is
  //* bárkinek megnyitható, az értesítés semmit nem ad hozzá, amit ne látna.
  const notifyAllowed = mode === "class" || sessionIsTeacher;
  const notifySetup = useCallback(
    ({ subjectShort }: { subjectShort: string }) => (
      <NotificationMenu
        mode={mode}
        subjects={subjects}
        currentSubject={subjectShort}
      />
    ),
    [subjects, mode],
  );

  //! ═════════════════════════════════════════════════════════════════════════
  //! AZ INDULÁS SORRENDJE — MÉRÉS UTÁN ÍRVA
  //! ═════════════════════════════════════════════════════════════════════════
  //! EZ A HATÁS EDDIG EGY LÁNC VOLT, ÉS MINDEN SZEME EGY ODA-VISSZA ÚT. A
  //! `/orarend` hideg indításán mérve (helyi kiszolgáló, hálózati késleltetés
  //! NÉLKÜL):
  //!
  //!     27 ms  classes       ← a lista
  //!     89 ms  classes       ← ugyanaz még egyszer, a feloldáshoz
  //!    107 ms  cards         ← CSAK EZUTÁN indulhatott az órarend
  //!    133 ms  calendarplan
  //!    245 ms  ─ eddig egy PÖRGŐ KARIKA állt a lapon
  //!
  //! A négy kérés EGYMÁST VÁRTA. Iskolai mobilhálózaton egy-egy szem nem 20,
  //! hanem 100-200 ms — a rács ott másfél másodperccel a lap megjelenése UTÁN
  //! rajzolódott ki, és a Vercel mezőadatában pontosan ez a különbség látszik
  //! a `/tanari`-hoz képest (ami alany nélkül egyetlen kérést sem indít).
  //!
  //! HÁROM DOLGOT VÁLTOZTATTUNK, ÉS EGYIK SEM ÚJ FUNKCIÓ:
  //!
  //! 1. A LISTA MÁR NEM KAPU. Az osztály-lapon az alany a lista NÉLKÜL is
  //!    tudható: vagy a készülék emlékszik rá, vagy a nyilvános
  //!    alapértelmezés (`PUBLIC_DEFAULT_CLASS`). Ezért a kártyák kérése az
  //!    ELSŐ pillanatban elindul, a listával PÁRHUZAMOSAN — a választó
  //!    ugyanúgy megtelik, csak nem tartja fel a rácsot.
  //! 2. A MENTETT HÉT AZ ELSŐ KÉPKOCKÁN OTT VAN. A `loadCachedWeek` a
  //!    `localStorage`-ból olvas, tehát NEM KELL RÁ VÁRNI. Aki két óra között
  //!    nyitja meg a lapot — vagyis a forgalom java —, a rácsot azonnal
  //!    látja, és a friss adat alatta cserélődik ki. A pörgő karika így csak
  //!    annak marad, akinél tényleg nincs mit mutatni.
  //! 3. A LISTA EGYSZER MEGY KI. A kétszeres lekérést a `timetable.ts`
  //!    oldotta meg (közös, még futó kérés) — itt annyi látszik belőle, hogy
  //!    a `buildTimetableView` feloldása már nem indít újabb kört.
  //!
  //! AMI NEM VÁLTOZOTT: a tanári lap TOVÁBBRA SEM TIPPEL. Akinél nincs
  //! emlékezett tanár, ott az alany csak a listából (és a belépés nevéből)
  //! derülhet ki — ott a régi sorrend fut tovább, mert ott tényleg kell.
  //! ═════════════════════════════════════════════════════════════════════════
  useEffect(() => {
    let cancelled = false;
    const focusWeek = focusMondayKey();

    //* Amit a lista nélkül is tudunk. Üres string = meg kell kérdezni.
    const known = subjectWithoutList(mode);

    //! A KÉT KÉRÉS EGYSZERRE INDUL, NEM EGYMÁS UTÁN.
    const listPromise = fetchTimetableSubjects(mode);
    const weekPromise = known
      ? loadWeekOrCached(subjectStoreKey(mode, known), focusWeek, () =>
          buildTimetableView({
            kind: mode,
            userClass: known,
            weekStart: focusWeek,
          }),
        )
      : null;

    //! A KÉSZÜLÉKEN LÉVŐ PÉLDÁNY MÁR MOST KIRAJZOLHATÓ — a hatás a hidratálás
    //! után fut, tehát ez nem okoz eltérést a kiszolgáló kimenetéhez képest.
    if (known) {
      const local = loadCachedWeek(subjectStoreKey(mode, known), focusWeek);
      if (local) {
        setView(local.view);
        setInitialStale(local);
      }
    }

    //* ── A VÁLASZTÓ ─────────────────────────────────────────────────────────
    (async () => {
      const list = await listPromise;
      if (cancelled) return;
      setSubjects(list.subjects);
      setSubjectsError(list.error);

      //! Csak akkor dől el ITT az alany, ha a lista nélkül nem volt tudható —
      //! a tanári lap első megnyitása. Az osztály-lapon a rács ekkorra már
      //! régen elindult a saját útján.
      if (known) return;

      const wanted = initialSubject({
        mode,
        subjects: list.subjects,
        sessionName,
        sessionIsTeacher,
      });

      //! NINCS ALANY, NINCS KÉRÉS. A tanári lap nem tippel rá senkire: aki
      //! először nyitja meg, a választót kapja, nem egy idegen órarendjét.
      if (!wanted) {
        setView((current) => current ?? emptyView(mode));
        return;
      }

      try {
        const late = await loadWeekOrCached(
          subjectStoreKey(mode, wanted),
          focusWeek,
          () =>
            buildTimetableView({
              kind: mode,
              userClass: wanted,
              weekStart: focusWeek,
            }),
        );
        if (cancelled) return;
        setView(late.view);
        setInitialStale(late.cached);
      } catch (err) {
        if (cancelled) return;
        setFatal(describeTimetableFailure(err));
        setView((current) => current ?? emptyView(mode));
      }
    })();

    //* ── A RÁCS ─────────────────────────────────────────────────────────────
    (async () => {
      if (!weekPromise) return;
      try {
        const first = await weekPromise;
        if (cancelled) return;
        setView(first.view);
        setInitialStale(first.cached);
      } catch (err) {
        //! Ide csak váratlan kivétel jut (a hálózati hibákat a hívott
        //! függvények már nevesítve adják vissza) — a fajtáját akkor is
        //! megőrizzük. A mentett hetet NEM írjuk felül vele: ha fentebb már
        //! kirajzoltuk, a diák inkább lásson egy régi hetet, mint egy hibát.
        if (cancelled) return;
        setFatal(describeTimetableFailure(err));
        setView((current) => current ?? emptyView(mode));
      }
    })();

    return () => {
      cancelled = true;
    };
    //! A MUNKAMENET KÉSŐBB ÉRKEZIK, ÉS EZ SZÁNDÉKOSAN NEM INDÍT ÚJRA. A
    //! névből csak az ELSŐ megnyitás tippje lesz; ha a válasz a lista után
    //! futna be, egy már kiválasztott alanyt írna felül a szeme előtt.
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
          notifySetup={notifyAllowed ? notifySetup : undefined}
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

//! ─── AMIT A LISTA NÉLKÜL IS TUDUNK ─────────────────────────────────────────
//! Ez az `initialSubject` első két lépése, kiemelve — mert ez a kettő NEM
//! IGÉNYEL HÁLÓZATOT, és épp ezért nem szabad hálózatra várnia:
//!   • a készüléken emlékezett alany (`localStorage`), bármelyik lapon;
//!   • az osztály-lapon a nyilvános alapértelmezés.
//! A tanári lap harmadik forrása (a belépés NEVE, a tanárlistához mérve) itt
//! szándékosan nincs benne: ahhoz kell a lista, tehát az marad a lassú úton.
function subjectWithoutList(mode: TimetableSubjectKind): string {
  const remembered = loadCachedSubject(mode);
  if (remembered) return remembered;
  return mode === "class" ? PUBLIC_DEFAULT_CLASS : "";
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
    weekStart: focusMondayKey(),
    days: [],
    periods: [],
    lessons: [],
    events: [],
    prefs: [],
    persistence: "local",
  };
}
