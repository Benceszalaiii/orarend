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
import { ChangeRow, DualDay, StaleNote } from "@/components/ma/day-status";
import { NowBlock } from "@/components/ma/now-block";
import { buildWeekModel } from "@/components/ma/week";
import {
  MovedThisWeek,
  SubjectLoads,
  WeekPulse,
} from "@/components/ma/week-panels";
import { SiteNav } from "@/components/site-nav";
import { nowState } from "@/components/timetable/now";
import { dateFromKey, minLabel, todayKey } from "@/components/timetable/shared";
import { useClock, useVisibilityEpoch } from "@/components/timetable/use-clock";
import { Button } from "@/components/ui/button";
import { MorphingInfinity } from "@/components/ui/morphing-infinity";
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
import { loadLocalPreferences } from "@/lib/timetable-merge";
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
//! A CSOPORTBONTÁST ITT CSAK OLVASSUK. A feloldás vezérlői a heti nézetben
//! vannak; ha marad eldöntetlen ütközés, ez a lap nem találgat, hanem
//! átküld oda.

//* Két lekérés közti legrövidebb idő, ha a lap újra láthatóvá válik.
const REFETCH_MIN_MS = 60_000;

const dayFmt = new Intl.DateTimeFormat("hu-HU", {
  month: "short",
  day: "numeric",
  weekday: "long",
});

export function MaPage() {
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

  const classShort = view?.resolvedClass?.short ?? selectedClass;
  const prefs = useMemo(
    () => (classShort ? loadLocalPreferences(classShort) : []),
    [classShort],
  );

  //* A megjelenített nap: a kiválasztott, vagy ha nincs, az alapértelmezett.
  const shownKey = pickedKey ?? focusKey;

  const day = useMemo(
    () => (view && shownKey ? buildDayModel(view, prefs, shownKey) : null),
    [view, prefs, shownKey],
  );
  const later = useMemo(
    () => (view && shownKey ? laterItemsOf(view, prefs, shownKey) : []),
    [view, prefs, shownKey],
  );
  const week = useMemo(
    () => (view ? buildWeekModel(view, prefs) : null),
    [view, prefs],
  );

  const isToday = shownKey !== null && today !== null && shownKey === today;

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
      <section className="relative w-full overflow-hidden pt-[env(safe-area-inset-top)] text-hero-foreground">
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

        <div className="relative z-10 mx-auto w-full max-w-5xl px-4 pt-5 pb-8 sm:px-6 sm:pt-6">
          {/*//! TELEFONON A VEZÉRLŐK ÁLLNAK ELÖL, A CÍM ALATTUK TELJES
              //! SZÉLESSÉGBEN. Egy sorba zsúfolva a dátum két sorba tört, és a
              //! „14:20-ig" a kötőjelnél szakadt szét — a cím kapja a
              //! szélességet, a vezérlők pedig a saját sorukat. */}
          <div className="flex flex-wrap items-start gap-x-3 gap-y-3">
            <div className="order-2 min-w-0 sm:order-1 sm:flex-1">
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

            <div className="order-1 flex w-full items-center justify-end gap-2 sm:order-2 sm:w-auto">
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

          {/*//! AZ IDŐ A FŐSZEREPLŐ. A blokk nem nyúlik a teljes szélességig: a
              //! nagy óra olvasható blokk-méretben a legerősebb, nem elnyújtva. */}
          <div className="mt-6 lg:max-w-2xl">
            {error && !day ? (
              <ErrorPanel
                error={error}
                pending={pending}
                onRetry={() =>
                  void load(selectedClass, shownKey, { showPending: true })
                }
              />
            ) : day?.dual === "dual" ? (
              <DualDay isToday={isToday} />
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
                {day && day.dual === "dual" && (
                  <span className="ml-2 text-sm font-normal text-muted-foreground">
                    az osztály órarendje
                  </span>
                )}
              </h2>
              <Link
                href="/orarend"
                className="text-sm text-primary hover:underline"
              >
                Heti órarend
              </Link>
            </div>

            {/*//! A NAPI ELLENŐRZÉS — mindig ott, akkor is, ha nincs hír. */}
            {day && day.dual !== "dual" && (
              <ChangeRow day={day} className="mb-3" />
            )}

            {day && day.dual !== "dual" && day.conflicts > 0 && (
              <Link
                href="/orarend"
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
                  Feloldom
                </span>
              </Link>
            )}

            {day && day.lessonCount > 0 ? (
              <>
                <DayRibbon
                  day={day}
                  nowMin={
                    clock && isToday && day.dual !== "dual" ? clock.min : null
                  }
                  selectedKey={previewKey}
                  className="mb-3"
                />
                <DayList
                  day={day}
                  nowMin={
                    clock && isToday && day.dual !== "dual" ? clock.min : null
                  }
                  selectedKey={previewKey}
                  onSelect={setPreviewKey}
                />
              </>
            ) : (
              <p className="rounded-xl border border-dashed border-border px-4 py-5 text-sm text-pretty text-muted-strong">
                {day
                  ? "A forrás nem küldött órát erre a napra."
                  : "Erre a napra nincs adat."}
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
            //* válasz. Követés és navigáció, nem cselekvés. */}
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
            <MovedThisWeek
              week={week}
              onFocus={(dateKey) => {
                setPickedKey(dateKey);
                setPreviewKey(null);
              }}
            />
            <SubjectLoads week={week} />
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
          "h-8 w-[84px] touch-target appearance-none rounded-full border border-hero-foreground/20 bg-transparent py-1 pr-6 pl-2.5 text-xs transition-colors outline-none",
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
