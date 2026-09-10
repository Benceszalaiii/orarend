"use client";

import { Merge, Users } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  SheetDivider,
  SheetRow,
  SheetSection,
} from "@/components/chrome/chrome-sheet";
import { daySummary } from "@/components/ma/day";
import { DayList, DayRibbon } from "@/components/ma/day-list";
import {
  ChangeRow,
  DayPlanRow,
  DualHero,
  StaleNote,
} from "@/components/ma/day-status";
import {
  type DayRenderContext,
  DayView,
  dayTitle,
} from "@/components/ma/day-view";
import { DualPanel } from "@/components/ma/dual-setup";
import { ErrorPanel } from "@/components/ma/error-panel";
import { NowBlock } from "@/components/ma/now-block";
import { RestHero } from "@/components/ma/rest-hero";
import { SubjectPicker } from "@/components/ma/subject-picker";
import { useDayView } from "@/components/ma/use-day-view";
import {
  MovedThisWeek,
  SubjectLoads,
  WeekPulse,
} from "@/components/ma/week-panels";
import { NotificationMenu } from "@/components/pwa/notification-menu";
import { minLabel } from "@/components/timetable/shared";
import { useMergePreferences } from "@/components/timetable/use-merge-preferences";
import { MorphingInfinity } from "@/components/ui/morphing-infinity";
import {
  type DualSchedule,
  loadDualSchedule,
  saveDualSchedule,
} from "@/lib/dual-schedule";
import {
  fetchTimetableClasses,
  loadCachedClass,
  PUBLIC_DEFAULT_CLASS,
  saveCachedClass,
  type TimetableClass,
} from "@/lib/timetable";
import { useHiddenMenu } from "@/lib/use-hidden-menu";
import { cn } from "@/lib/utils";

//* ---------------------------------------------------------------------------
//* „Ma" — A DIÁK MAI NAPJA
//* ---------------------------------------------------------------------------
//! EZ A LAP MOSTANTÓL EGY ÖSSZERAKÁS, NEM EGY GÉPEZET. Ami eddig itt állt —
//! lekérés, gyorsítótár, napköteg, „most", pihenőnapok, a hero őrszeme — a
//! `use-day-view.ts`-be és a `day-view.tsx`-be költözött, ÁTÍRÁS NÉLKÜL. Ami
//! itt maradt, az pontosan az, ami csak a DIÁKÉ:
//!
//!   • az OSZTÁLY mint alany, a maga nyilvános alapértelmezésével;
//!   • a CSOPORTBONTÁS — a döntés, a „Teljes órarend" kapcsoló és az a mondat,
//!     ami az eldöntetlen bontásra figyelmeztet;
//!   • a DUÁLIS beosztás, ami a diák saját, osztályonkénti beállítása;
//!   • az ÉRTESÍTÉS, ami szerveroldalon osztályra van kulcsolva.
//!
//! Egyik sem értelmes a tanári lapon, és pont ezért nem `mode` lett belőlük.

export function StudentDay() {
  const [classes, setClasses] = useState<TimetableClass[]>([]);
  const [selectedClass, setSelectedClass] = useState("");

  //* A nyilvános alapértelmezés azért van, hogy a lap első megnyitásra is
  //* MUTASSON valamit — a diáknak nincs belépése, amiből az osztálya jönne.
  useEffect(() => {
    setSelectedClass(loadCachedClass() || PUBLIC_DEFAULT_CLASS);
    void fetchTimetableClasses().then((list) => setClasses(list.classes));
  }, []);

  const classShort = selectedClass;
  const { prefs, choose } = useMergePreferences({ storeKey: classShort });

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

  const dv = useDayView({
    kind: "class",
    subject: selectedClass,
    prefs,
    dualSchedule,
  });

  const [allGroups, setAllGroups] = useState(false);

  //* Melyik sorokat hagyta meg a diák a fejléc lapjában (`use-hidden-menu.ts`).
  const menu = useHiddenMenu();

  const sheet = (
    <>
      <SheetSection title="Kit nézel">
        <SheetRow icon={<Users className="size-4" />} label="Osztály">
          <SubjectPicker
            subjects={classes}
            value={selectedClass}
            disabled={dv.pending}
            label="Osztály"
            offlineHint="Az osztálylista most nem érhető el — csak a mentett osztályod látszik."
            onChange={(next) => {
              setSelectedClass(next);
              saveCachedClass(next);
            }}
          />
        </SheetRow>
      </SheetSection>
      {/*//! A SZAKASZ EGYETLEN SORBÓL ÁLL, EZÉRT EGYÜTT IS TŰNIK EL VELE. Ha a
          //! diák kikapcsolta az értesítést a testreszabóban (lásd
          //! `lib/menu-items.ts`), egy üres „Beállítások" cím maradna itt egy
          //! hajszálvonal alatt — cím anélkül, amit megnevezne. */}
      {menu.shows("notify") && (
        <>
          <SheetDivider />
          <SheetSection title="Beállítások">
            {/*//! A VEZÉRLŐ MAGA A SOR — nincs köré csomagolt `SheetRow`. Amíg
                //! volt, a felirat KÉTSZER jelent meg: egyszer a csomagolón,
                //! egyszer a gombon belül. Lásd `sheetItem`. */}
            <NotificationMenu
              subjects={classes}
              currentSubject={selectedClass}
            />
          </SheetSection>
        </>
      )}
    </>
  );

  return (
    <DayView
      dv={dv}
      lineSubject={selectedClass || "Osztály"}
      sheet={sheet}
      emptyFallback={
        dv.error ? (
          <ErrorPanel
            error={dv.error}
            pending={dv.pending}
            onRetry={() => dv.reload()}
          />
        ) : (
          <MorphingInfinity className="size-24 text-muted-foreground" />
        )
      }
      rail={(week) => (
        <>
          <WeekPulse
            week={week}
            focusKey={dv.shownKey ?? ""}
            todayDateKey={dv.today ?? ""}
            onFocus={dv.focusDay}
          />
          <DualPanel
            schedule={dualSchedule}
            weekLetter={week.weekLetter}
            todayDow={dv.todayDow}
            classShort={classShort}
            onChange={changeDualSchedule}
          />
          <MovedThisWeek week={week} onFocus={dv.focusDay} />
          <SubjectLoads week={week} onChoose={choose} />
        </>
      )}
      renderDay={(ctx) => (
        <StudentDayPanel
          ctx={ctx}
          dv={dv}
          allGroups={allGroups}
          onAllGroups={(next) => {
            setAllGroups(next);
            dv.setPreviewKey(null);
          }}
        />
      )}
    />
  );
}

//! EGY NAP, EGY LAP. Pontosan az, ami a `/ma` fő hasábjában áll — a cím, a
//! hero, a nap körülményei és az órák —, csak egy lapozható felületen.
function StudentDayPanel({
  ctx,
  dv,
  allGroups,
  onAllGroups,
}: {
  ctx: DayRenderContext;
  dv: ReturnType<typeof useDayView>;
  allGroups: boolean;
  onAllGroups: (next: boolean) => void;
}) {
  const { panel, isActive, isToday, onSentinel, weekendNote, rest, restSpan } =
    ctx;
  const { day, dayAll, mineKeys, hiddenCount } = panel;
  const { clock, epoch, previewKey, setPreviewKey, error, pending, cached } =
    dv;

  const dualDay = day?.dual === "dual";
  const shownDay = allGroups && dayAll ? dayAll : day;
  //* Az előnézet csak az AKTÍV napon él: a szomszéd lapok a saját első órájukat
  //* mutatják, mert ott nincs „most", amihez képest kiválasztani lehetne.
  const preview = !day
    ? null
    : isActive && previewKey
      ? (day.items.find((i) => i.key === previewKey) ?? null)
      : isToday
        ? null
        : (day.items[0] ?? null);

  return (
    <>
      <div className="pt-3 pb-8 sm:pt-4">
        <div className="min-w-0">
          <h2 className="text-2xl font-bold tracking-tight first-letter:uppercase sm:text-3xl">
            {dayTitle(panel.dateKey)}
          </h2>
          <p className="mt-1 text-sm text-hero-foreground/60">
            {/*//* A hero mondja ki, hogy hétvége van; ez a sor csak azt
                //* magyarázza meg, miért HÉTFŐ áll a dátum helyén. */}
            {weekendNote && "A következő tanítási nap · "}
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

        <div className="mt-6 lg:max-w-2xl">
          {dualDay ? (
            <DualHero nowSec={clock && isToday ? clock.sec : null} />
          ) : error && !day ? (
            <ErrorPanel
              error={error}
              pending={pending}
              onRetry={() => dv.reload(panel.dateKey)}
            />
          ) : rest ? (
            //! ITT EDDIG EGY ÜRES DOBOZ ÁLLT. Óra nélküli napon a `NowBlock`-nak
            //! nincs mit mutatnia: a „most" kiszámíthatatlan, az előnézetnek
            //! nincs mit előnéznie, és a blokk `aria-hidden` helykitöltővé
            //! esik össze. Az év napjainak közel fele ilyen.
            <RestHero
              rest={rest.rest}
              next={rest.next}
              span={restSpan}
              nowMs={dv.nowMs}
            />
          ) : (
            <NowBlock
              state={isActive ? dv.state : null}
              clock={clock}
              epoch={epoch}
              preview={preview}
              onClearPreview={isToday ? () => setPreviewKey(null) : () => {}}
              previewDismissable={isToday && previewKey !== null}
            />
          )}
        </div>
      </div>

      {/*//* Az őrszem: eddig tart a hero. Ami ez alá kerül, azt a lebegő
          //* fejléc „most" sora már összecsukva viszi tovább. */}
      {onSentinel && (
        <div ref={onSentinel} className="h-px w-full" aria-hidden />
      )}

      <section aria-label="A nap órái">
        <div className="mb-3 flex items-baseline justify-between gap-4">
          <h3 className="text-base font-semibold text-foreground">
            {isToday ? "A mai nap" : "A nap"}
            {dualDay && allGroups && (
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                az osztály órarendje
              </span>
            )}
          </h3>
          <div className="flex shrink-0 items-center gap-3">
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
                  onChange={(e) => onAllGroups(e.target.checked)}
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

        {day && <DayPlanRow day={day} isToday={isToday} className="mb-3" />}

        {day && day.dual !== "dual" && <ChangeRow day={day} className="mb-3" />}

        {day && day.dual !== "dual" && day.conflicts > 0 && (
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
              selectedKey={isActive ? previewKey : null}
              mineKeys={allGroups ? mineKeys : null}
              className="mb-3"
            />
            <DayList
              day={shownDay}
              nowMin={
                clock && isToday && day.dual !== "dual" ? clock.min : null
              }
              selectedKey={isActive ? previewKey : null}
              onSelect={setPreviewKey}
              mineKeys={allGroups ? mineKeys : null}
            />
            {allGroups && (
              <p className="mt-2 text-xs text-pretty text-muted-foreground">
                {hiddenCount > 0 ? (
                  <>
                    Az osztály teljes napja látszik. A szaggatott kártyák egy
                    másik csoporté —{" "}
                    {hiddenCount === 1 ? "egy órát" : `${hiddenCount} órát`}{" "}
                    rejtett el a csoportbontás-döntésed.
                  </>
                ) : (
                  "Az osztály teljes napja látszik — ezen a napon nincs másik csoportnak órája."
                )}
              </p>
            )}
          </>
        ) : (
          <p className="rounded-xl border border-dashed border-border px-4 py-5 text-sm text-pretty text-muted-strong">
            {!day
              ? "Erre a napra nincs adat."
              : hiddenCount > 0
                ? "Ezen a napon minden óra egy másik csoporté — a „Teljes órarend” megmutatja őket."
                : //! SZÜNETBEN A HIÁNY NEM REJTÉLY. „A forrás nem küldött órát"
                  //! azt sugallja, hogy valami elmaradt — pedig a tanév rendje
                  //! szerint ezen a napon NINCS mit küldeni. A mondat csak ott
                  //! marad gyanakvó, ahol tényleg indokolt.
                  rest
                  ? "Ezen a napon nincs kiírt óra."
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
    </>
  );
}
