"use client";

import { ChevronDown, Merge, RotateCw } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  buildDayModel,
  daySummary,
  focusDayKey,
  laterItemsOf,
} from "@/components/ma/day";
import { DayList, DayRibbon } from "@/components/ma/day-list";
import {
  ChangeRow,
  DayPlanRow,
  DualHero,
  StaleNote,
} from "@/components/ma/day-status";
import { DualPanel } from "@/components/ma/dual-setup";
import { NowBlock } from "@/components/ma/now-block";
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
import { dateFromKey, minLabel, todayKey } from "@/components/timetable/shared";
import { useClock, useVisibilityEpoch } from "@/components/timetable/use-clock";
import { useMergePreferences } from "@/components/timetable/use-merge-preferences";
import { Button } from "@/components/ui/button";
import { MorphingInfinity } from "@/components/ui/morphing-infinity";
import {
  type DualSchedule,
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
//* „Ma" — a napi nézet
//* ---------------------------------------------------------------------------
//! A `/orarend` MINDEN órát megmutat, de semmit nem összesít, és a napi
//! kérdésekre („mi megy most", „hova megyek utána") KERESNI kell benne a
//! választ. Ez a lap nem ugyanaz kicsiben: a bal oldalán a mai nap él, a
//! jobb oldalán pedig olyan panelek, amikre a rácsból csak végigolvasva
//! lehetne felelni — melyik nap nehéz, hol mozdult valami a héten, mennyi egy
//! tantárgy heti terhelése.
//!
//! A NAP VÁLASZTHATÓ. A hét pulzusa nem dísz, hanem a navigáció: bármelyik
//! napra rá lehet állni, és a bal oldal átáll rá. A „most" viszont csak MA
//! igaz — más napon a panel a nap első óráján áll meg, és ezt ki is mondja.
//!
//! A CSOPORTBONTÁS ITT IS ELDŐL. Sokáig csak olvastuk: az eldöntetlen ütközést
//! a lap átküldte a heti rácsra. Csakhogy a „Tantárgyak" panel épp abból él,
//! hogy melyik óra a TIÉD — feloldatlan bontásnál két egyforma sort mutatott
//! ugyanarról a tantárgyról, és olyan heti terhelést állított, amit senki nem
//! visel. Ezért a döntés odakerült, ahol a kár keletkezik: a panel sorából
//! választani lehet. Ugyanaz a tárolás, ugyanaz a modell, mint a rácson — a
//! visszavonás pedig továbbra is a heti nézet beállításaiban.

//* Két lekérés közti legrövidebb idő, ha a lap újra láthatóvá válik.
const REFETCH_MIN_MS = 60_000;

const dayFmt = new Intl.DateTimeFormat("hu-HU", {
  month: "short",
  day: "numeric",
  weekday: "long",
});

//* ---------------------------------------------------------------------------
//* „Ma" — AZ EGYHASÁBOS ALAK (`/design`)
//* ---------------------------------------------------------------------------
//! A `/ma` KORÁBBI ELRENDEZÉSE, félretéve. Ugyanaz az adat, ugyanazok a
//! komponensek (`components/ma/*`), csak a lap szerkezete más: itt a nap egy
//! folyamatos hasáb, napköteg és lebegő „most" sor nélkül. A nézetváltóban
//! szándékosan NEM szerepel, és `noindex` — nem a diákok lapja, hanem az a
//! forma, amihez a mostani `/ma` mérhető.

export function DesignPage() {
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

  //! A NAP, AMIT MUTATUNK. Hétköznap ez a mai; hétvégén a következő tanítási
  //! nap. A hét ebből következik, nem fordítva.
  //* Kliens-oldali érték (a látogató naptára szerint) — a szerveren nem
  //* számoljuk ki, hogy ne legyen hidratálási eltérés.
  const [focusKey, setFocusKey] = useState<string | null>(null);
  //* A nap, amit a hét paneljéből kiválasztottak. `null` = maradjon az
  //* alapértelmezett (ma, hétvégén a következő tanítási nap).
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

      //! ELŐSZÖR A MENTETT PÉLDÁNY, AZONNAL. A folyosón a hálózat lassú vagy
      //! nincs; egy üres képernyő a lekérés két másodpercéig pont azt a
      //! pillanatot veszi el, amiért a lapot megnyitották.
      const local = loadCachedWeek(cls, weekStart);
      if (local) {
        setView((current) => current ?? local.view);
        setCached(local);
      }

      try {
        const fresh = await buildTimetableView({
          userClass: cls,
          weekStart,
        });
        if (fresh.ok) {
          setView(fresh);
          setError(null);
          setCached(null);
          saveCachedWeek(cls, weekStart, fresh);
        } else {
          //! A HIBA NEM TÖRLI A MENTETT ADATOT. Ha van tegnapi órarendünk, azt
          //! mutatjuk tovább — megjelölve, hogy mikori. Kevesebbet mondani,
          //! mint amennyit tudunk, itt nem óvatosság, hanem kár.
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

  //! VISSZATÉRÉSKOR ÚJRA — DE NEM MINDEN VISSZATÉRÉSKOR. A lapot a zsebből
  //! veszik elő, és az órarend addigra órákkal korábbi lehet. Viszont a
  //! lapváltás olcsó és gyakori: fék nélkül egy ide-oda kapcsolgatás percenként
  //! tucatnyi kérést küldene EGY iskolai szerverre, ami nem a miénk. Az órarend
  //! napon belül alig változik, egy perc türelmi idő bőven elég.
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

  const classShort = view?.subject?.short ?? selectedClass;

  //! MELYIK OSZTÁLYT NÉZIK — ÉS SEMMI MÁST. Csak a FELOLDOTT osztályt jelezzük:
  //! a `selectedClass` még lehet elgépelt vagy ismeretlen, azt nincs értelme
  //! beleszámolni. A deduplikáció (osztályonként naponta egyszer eszközönként) a
  //! `reportClassUse`-ban van.
  const resolvedShort = view?.subject?.short;
  useEffect(() => {
    reportClassUse(resolvedShort);
  }, [resolvedShort]);

  //! A DÖNTÉSEK OSZTÁLYHOZ KÖTVE ÉLNEK, és ez a lap már ír is közéjük: a
  //! „Tantárgyak" panel sorából kiválasztható, melyik csoportra jár a diák.
  //! Ugyanaz a horog, mint a heti rácson — így a két nézet ugyanabból a
  //! tárolóból dolgozik, és egy itt hozott döntés ott is látszik.
  const { prefs, choose } = useMergePreferences({ storeKey: classShort });

  //! A DUÁLIS BEOSZTÁS A DIÁKÉ, NEM SZABÁLYÉ. Amíg nincs beállítva (`null`), a
  //! lap egyetlen napot sem nyilvánít duálissá — inkább mutasson egy fölösleges
  //! órarendet egy munkahelyi napon, mint hogy elrejtse valakinek a mai óráit.
  //! A `state` csak azért létezik, hogy a beállítás azonnal átrajzolja a lapot;
  //! az igazság a localStorage-ban van.
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

  //* A megjelenített nap: a kiválasztott, vagy ha nincs, az alapértelmezett.
  const shownKey = pickedKey ?? focusKey;

  const day = useMemo(
    () =>
      view && shownKey
        ? buildDayModel(view, prefs, shownKey, dualSchedule)
        : null,
    [view, prefs, shownKey, dualSchedule],
  );
  //! A NAP KÉT OLVASATA. A feloldott nap az, ami a DIÁKÉ — ezen áll a „most", a
  //! napi összefoglaló, minden. A másik az OSZTÁLYÉ: minden csoport órája, úgy,
  //! ahogy a forrás küldte. A kettő nem versenyez: a lap az elsőt mutatja, a
  //! másodikat egy gombbal elő lehet hívni — mert az „elrejtettem egy órát"
  //! csak akkor becsületes döntés, ha vissza is lehet nézni, mit rejt el.
  const dayAll = useMemo(
    () =>
      view && shownKey ? buildDayModel(view, [], shownKey, dualSchedule) : null,
    [view, shownKey, dualSchedule],
  );
  const [allGroups, setAllGroups] = useState(false);
  //* A saját órák kulcsai: ebből tudja a lista, melyik kártya nem a diáké.
  const mineKeys = useMemo(
    () =>
      new Set(
        (day?.segments ?? [])
          .filter((seg) => seg.kind === "lesson")
          .map((seg) => seg.key),
      ),
    [day],
  );
  const hiddenCount =
    dayAll && day ? Math.max(0, dayAll.lessonCount - day.lessonCount) : 0;
  const shownDay = allGroups && dayAll ? dayAll : day;

  const later = useMemo(
    () => (view && shownKey ? laterItemsOf(view, prefs, shownKey) : []),
    [view, prefs, shownKey],
  );
  const week = useMemo(
    () => (view ? buildWeekModel(view, prefs, dualSchedule) : null),
    [view, prefs, dualSchedule],
  );

  const isToday = shownKey !== null && today !== null && shownKey === today;
  //! A DUÁLIS NAP NEM AZ OSZTÁLY NAPJA. Ha a diák saját beosztása szerint a
  //! munkahelyen van, a lap NEM az osztály óráit mutatja neki: azok azon a
  //! napon nem róla szólnak. A nap helyén egyetlen 8:00–15:00 téglalap áll —
  //! az osztály órarendje pedig egy koppintással előhívható marad („Teljes
  //! órarend"), mert elrejteni és letagadni nem ugyanaz.
  const dualDay = day?.dual === "dual";

  //* A beállító rács a MAI napot emeli ki, nem a nézettet: az oszlop-jelölés
  //* tájékozódás („hol tartunk a ciklusban"), nem a kiválasztás visszhangja.
  const todayDow = useMemo(() => {
    if (!today) return null;
    const dow = ((dateFromKey(today).getDay() + 6) % 7) + 1;
    return dow <= 5 ? dow : null;
  }, [today]);

  //! A „MOST" CSAK MA IGAZ. Hétvégén a lap a következő tanítási napot mutatja —
  //! ott visszaszámlálni napokon át értelmetlen, ezért a panel a nap első
  //! óráján áll meg.
  const state =
    clock && day && isToday ? nowState(day.items, later, clock.min) : null;

  const preview = useMemo(() => {
    if (!day) return null;
    if (previewKey) return day.items.find((i) => i.key === previewKey) ?? null;
    if (!isToday) return day.items[0] ?? null;
    return null;
  }, [day, previewKey, isToday]);

  if (!view || !shownKey) {
    return (
      <main className="flex min-h-[100dvh] items-center justify-center bg-background">
        <MorphingInfinity className="size-24 text-muted-foreground" />
      </main>
    );
  }

  return (
    //! A JEDLIK-SZAKKÖR KEZDŐLAP SZÓTÁRA. Fent a hero fénymezője, benne az idő
    //! a főszereplő; alatta csendes munkafelület, `lg`-től fő hasáb + keskeny
    //! sáv. A DOM-ban a fő hasáb áll elöl, így a mobil olvasási sorrend
    //! egyben prioritás-sorrend is.
    <main className="min-h-[100dvh] bg-background tt-safe">
      {/*//* Az `/orarend` keretét egy 1 px-es felső vonal indítja; enélkül a
          //* váltó ezen a lapon pontosan ennyivel magasabban ülne. Vonalat nem
          //* húzunk ide — a fénymező tetejét elvágná —, csak a hiányzó pixelt
          //* pótoljuk, hogy a két sáv egy magasságban legyen. */}
      <section className="relative w-full overflow-hidden pt-[calc(env(safe-area-inset-top)+1px)] text-hero-foreground">
        {/* A negyedelt címer-mező visszfénye: piros fent balra, kék lent jobbra */}
        <div
          aria-hidden
          className="pointer-events-none absolute -top-40 -left-40 size-96 rounded-full bg-[radial-gradient(circle,oklch(0.55_0.2_27/0.14),transparent_70%)]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -right-32 -bottom-48 size-120 rounded-full bg-[radial-gradient(circle,var(--hero-crest-aura),transparent_70%)]"
        />
        {/*//* Lágy alsó fade: a színátmenetek élét a --background felé olvasztja. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-linear-to-b from-transparent to-background"
        />

        {/*//! A FEJLÉCSÁV AZ ABLAKÉ, NEM A HASÁBÉ. A lap tartalma `max-w-5xl`
            //! középre zárt hasáb — de a sávot ez eddig magával vitte, és
            //! 1280 px-en a váltó 1122 px-nél állt, míg az `/orarend` teljes
            //! szélességű eszköztárában 1264-nél: 141 px ugrás egyetlen
            //! koppintásra. A sáv ezért kilép a hasábból, és ugyanazt a
            //! legnagyobb szélességet, margót és térközt kapja, mint a másik
            //! lap eszköztára (`SITE_BAR_*`, lásd `site-nav.tsx`). A sáv két
            //! vége az ablak két széléhez tapad; a hasáb alatta kezdődik. */}
        <div
          className={cn(
            "relative z-10 mx-auto flex w-full items-center",
            SITE_BAR_MAX,
            SITE_BAR_METRICS,
          )}
        >
          {/*//* A terméknév ugyanaz a bal horgony, mint az `/orarend` sávjában —
              //* és ugyanúgy elrejtőzik telefonon, ahol a hely a vezérlőké. A
              //* lap CÍME a dátum, az alatta lévő hasáb tetején. */}
          <span className="shrink-0 text-base font-bold tracking-tight max-sm:sr-only">
            Órarend
          </span>
          <div className={cn("ml-auto", SITE_BAR_CLUSTER)}>
            {/*//* Ha nem a mai napot nézzük, az út vissza mindig egy koppintás. */}
            {pickedKey && pickedKey !== today && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPickedKey(null)}
                className="h-8 shrink-0 touch-target rounded-full border-hero-foreground/25 bg-transparent px-3 text-xs"
              >
                Ma
              </Button>
            )}
            {/*//! A HARANG ITT VAN A LEGINKÁBB A HELYÉN. Ez a lap arra felel,
                //! hogy „mi megy most, mi jön utána" — az óra előtti
                //! emlékeztető pontosan ugyanez a kérdés, csak akkor, amikor a
                //! lap nincs nyitva. A vezérlő az OSZTÁLYVÁLASZTÓ mellé kerül,
                //! mert az értesítés a kiválasztott osztályról szól: a kettő
                //! ugyanazt az alanyt osztja. */}
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

        <div className="relative z-10 mx-auto w-full max-w-5xl px-4 pt-3 pb-8 sm:px-6 sm:pt-4">
          {/*//* A cím kapja a teljes szélességet: a vezérlők fölötte, a saját
              //* sávjukban ülnek, így a dátum nem tör két sorba, és a
              //* „14:20-ig" sem szakad szét a kötőjelnél. */}
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight first-letter:uppercase sm:text-3xl">
              {dayFmt.format(dateFromKey(shownKey))}
            </h1>
            <p className="mt-1 text-sm text-hero-foreground/60">
              {!isToday &&
                !pickedKey &&
                "Hétvége — a következő tanítási nap · "}
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

          {/*//! AZ IDŐ A FŐSZEREPLŐ. A blokk nem nyúlik a teljes szélességig: a
              //! nagy óra olvasható blokk-méretben a legerősebb, nem elnyújtva. */}
          {/*//! DUÁLIS NAPON IS ÁLL A HERO — csak más műszerrel. A nagy óra
              //! kérdése („mennyi van még hátra") a munkahelyen töltött napon
              //! szó szerint ugyanaz; ami hiányzik, az a futó ÓRA, nem a
              //! kérdés. A `DualHero` ugyanerre a helyre, ugyanekkora számmal
              //! a munkanapot válaszolja — a nap listája helyén lentebb ezért
              //! már nem áll második sáv ugyanerről. */}
          <div className="mt-6 lg:max-w-2xl">
            {dualDay ? (
              <DualHero nowSec={clock && isToday ? clock.sec : null} />
            ) : error && !day ? (
              <ErrorPanel
                error={error}
                pending={pending}
                onRetry={() =>
                  void load(selectedClass, shownKey, { showPending: true })
                }
              />
            ) : (
              <NowBlock
                state={state}
                clock={clock}
                epoch={epoch}
                preview={preview}
                onClearPreview={isToday ? () => setPreviewKey(null) : () => {}}
                previewDismissable={isToday && previewKey !== null}
              />
            )}
          </div>
        </div>
      </section>

      <div className="mx-auto w-full max-w-5xl px-4 pb-10 sm:px-6 lg:grid lg:grid-cols-[minmax(0,1fr)_19rem] lg:items-start lg:gap-8">
        <div className="space-y-10">
          <section aria-labelledby="today-heading">
            <div className="mb-3 flex items-baseline justify-between gap-4">
              <h2
                id="today-heading"
                className="text-base font-semibold text-foreground"
              >
                {isToday ? "A mai nap" : "A nap"}
                {/*//* Duális napon a lista csak akkor az OSZTÁLYÉ, ha elő is
                    //* hívták — enélkül a cím a téglalapra mondaná ugyanezt. */}
                {dualDay && allGroups && (
                  <span className="ml-2 text-sm font-normal text-muted-foreground">
                    az osztály órarendje
                  </span>
                )}
              </h2>
              <div className="flex shrink-0 items-center gap-3">
                {/*//! „MIT REJTETTEM EL?" — EGY KAPCSOLÓ, NEM EGY JELVÉNY
                    //! MINDEN KÁRTYÁN. A csoportbontás feloldása egész órákat
                    //! vesz ki a napból; kártyánkénti jelvénnyel ez apró
                    //! felkiáltójelek sorozata lenne, itt viszont egyetlen
                    //! kérdés az egész napra.
                    //!
                    //! ALAPBÓL KIKAPCSOLVA, DE MINDIG OTT. A lap a diák SAJÁT
                    //! napját mutatja — más csoport órája alapértelmezés
                    //! szerint nincs benne. A jelölőnégyzet viszont akkor is
                    //! látszik, ha épp nincs mit felfedni: így nem kell
                    //! kitalálni, hogy a hiányzó óra hova lett, és nem egy
                    //! eltűnő-felbukkanó gombra kell vadászni. */}
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
                      onChange={(e) => {
                        setAllGroups(e.target.checked);
                        setPreviewKey(null);
                      }}
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

            {/*//! A NAP KÖRÜLMÉNYEI. Duális napon is kimegy: hogy az iskolában
                //! rövidítettek az órák, az a munkahelyi napra nem tartozik, de
                //! a „nincs tanítás" és a napra kiírt esemény igen — a lap
                //! ilyenkor is EZT a napot mutatja. */}
            {day && <DayPlanRow day={day} isToday={isToday} className="mb-3" />}

            {/*//! A NAPI ELLENŐRZÉS — mindig ott, akkor is, ha nincs hír. */}
            {day && day.dual !== "dual" && (
              <ChangeRow day={day} className="mb-3" />
            )}

            {day && day.dual !== "dual" && day.conflicts > 0 && (
              //! A DÖNTÉS INNEN EGY KOPPINTÁS. Amíg a feloldás csak a rácson
              //! volt meg, ez a sor kiküldte a diákot a lapról egy másikra —
              //! most a saját „Tantárgyak" paneljére mutat, ahol a választás
              //! mellett az is ott áll, mennyi órát jelent.
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
              //! A MUNKANAPOT A HERO MONDTA KI, ITT MÁR CSAK A KÖVETKEZMÉNYE
              //! ÁLL. A nap listájának a helyén nem ismételjük meg a sávot:
              //! egy lapon egy műszer mutassa ugyanazt az időt. Ami itt hozzá
              //! jön, az a MIÉRT üres a lista — és hogy az osztályé egy
              //! kapcsolóval előhívható.
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
                  selectedKey={previewKey}
                  mineKeys={allGroups ? mineKeys : null}
                  className="mb-3"
                />
                <DayList
                  day={shownDay}
                  nowMin={
                    clock && isToday && day.dual !== "dual" ? clock.min : null
                  }
                  selectedKey={previewKey}
                  onSelect={setPreviewKey}
                  mineKeys={allGroups ? mineKeys : null}
                />
                {allGroups && (
                  //* A visszaút mindig kimondva: mi látszik most és miért.
                  <p className="mt-2 text-xs text-pretty text-muted-foreground">
                    {hiddenCount > 0 ? (
                      <>
                        Az osztály teljes napja látszik. A szaggatott kártyák
                        egy másik csoporté —{" "}
                        {hiddenCount === 1 ? "egy órát" : `${hiddenCount} órát`}{" "}
                        rejtett el a csoportbontás-döntésed.
                      </>
                    ) : (
                      //* Üres kéz: ha nincs mit felfedni, ezt is ki kell mondani
                      //* — különben úgy tűnne, a kapcsoló nem működik.
                      "Az osztály teljes napja látszik — ezen a napon nincs másik csoportnak órája."
                    )}
                  </p>
                )}
              </>
            ) : (
              <p className="rounded-xl border border-dashed border-border px-4 py-5 text-sm text-pretty text-muted-strong">
                {/*//! A CSEND OKÁT IS MEGMONDJUK. Ha a napnak VAN órája, csak
                    //! mind egy másik csoporté, a „nem küldött órát" hazugság
                    //! lenne — és a diák a forrást hibáztatná a saját döntése
                    //! helyett. A „Teljes órarend" ilyenkor is ott van fent. */}
                {!day
                  ? "Erre a napra nincs adat."
                  : hiddenCount > 0
                    ? "Ezen a napon minden óra egy másik csoporté — a „Teljes órarend” megmutatja őket."
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
        </div>

        {/*//* Másodlagos sáv: a hét — amire a rácsból csak végigolvasva lenne
            //* válasz. Követés és navigáció; az egyetlen cselekvés a duális
            //* beosztás, mert az nem a forrásból jön, hanem a diáktól. */}
        {week && (
          <div className="mt-10 space-y-10 lg:mt-0">
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
        )}
      </div>
    </main>
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
  //! HA A LISTA NEM JÖTT MEG, A VÁLASZTÓ NEM TŰNHET EL NYOMTALANUL. Üres
  //! listával a `<select>` használhatatlan — de a diáknak akkor is látnia kell,
  //! MELYIK osztály órarendjét nézi. Ilyenkor néma címke áll a helyén.
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

//! A HIBA MEGMONDJA, KINÉL VAN. Ugyanaz a szótár, mint a heti nézetben: a
//! `TimetableError` már tartalmazza a címet, a magyarázatot és azt, hogy van-e
//! értelme újra próbálni — itt csak megjelenítjük.
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
      <h2 className="text-xl font-bold tracking-tight">{error.title}</h2>
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
