"use client";

import { AlertTriangle, GraduationCap } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  SheetDivider,
  SheetRow,
  SheetSection,
} from "@/components/chrome/chrome-sheet";
import { daySummary } from "@/components/ma/day";
import { DayList, DayRibbon } from "@/components/ma/day-list";
import { ChangeRow, DayPlanRow, StaleNote } from "@/components/ma/day-status";
import {
  type DayRenderContext,
  DayView,
  dayTitle,
} from "@/components/ma/day-view";
import { ErrorPanel } from "@/components/ma/error-panel";
import { NowBlock } from "@/components/ma/now-block";
import { RestHero } from "@/components/ma/rest-hero";
import { SubjectPicker } from "@/components/ma/subject-picker";
import { ClassLoads, FreePeriods } from "@/components/ma/teacher-panels";
import { buildTeacherWeek, clashesOf } from "@/components/ma/teacher-week";
import { useDayView } from "@/components/ma/use-day-view";
import { MovedThisWeek, WeekPulse } from "@/components/ma/week-panels";
import { NotificationMenu } from "@/components/pwa/notification-menu";
import { minLabel, rangeLabel } from "@/components/timetable/shared";
import { MorphingInfinity } from "@/components/ui/morphing-infinity";
import { useSession } from "@/lib/auth-client";
import {
  fetchTimetableTeachers,
  loadCachedTeacher,
  saveCachedTeacher,
  type TimetableSubject,
} from "@/lib/timetable";
import { cn } from "@/lib/utils";

//* ---------------------------------------------------------------------------
//* „Ma" — A TANÁR MAI NAPJA
//* ---------------------------------------------------------------------------
//! A NEGYEDIK CELLA. A mátrix — KIÉ (diák/tanár) × MELYIK (hét/ma) — eddig
//! három lapon állt: `/orarend`, `/tanari`, `/ma`. Ez a negyedik, és nem új
//! útvonalon: az alany tárolt beállítás (`lib/identity.ts`), a `/ma` abból
//! dönti el, melyik napot mutassa.
//!
//! MÁS KÉRDÉS, UGYANAZ AZ ADAT. A diák azt kérdezi, mi a következő órája; a
//! tanár tudja a tantárgyát, és azt kérdezi: MELYIK OSZTÁLY, MELYIK TEREM.
//! Ezért a hero itt az osztállyal kezd (`NowBlock variant="teacher"`), a nap
//! kártyáin az osztály áll a tanár nevének helyén, és a sáv az osztályokat meg
//! a lyukasórákat összesíti a tantárgyak helyett.
//!
//! ÉS AMI ITT NINCS, AZ SZÁNDÉKOSAN NINCS:
//!
//!  • CSOPORTBONTÁS. A diáknak kérdés („melyik csoportra jársz?"), a tanárnak
//!    nem az: ha egy osztály három csoportját ő tartja, az EGY óra, amin ott
//!    kell lennie — a `teacherLessons` ezt már összevonta. Nincs „Teljes
//!    órarend" kapcsoló, nincs eldöntetlen-bontás figyelmeztetés.
//!  • DUÁLIS. A beosztás a diák saját, OSZTÁLYONKÉNTI helyi beállítása; egy
//!    tanár készülékén a sok tanított osztály egyikére sincs meg. Kitalálni
//!    pedig nem szabad (lásd `dual-schedule.ts`).
//!
//! AZ ÉRTESÍTÉS VISZONT MÁR ITT VAN — DE CSAK BELÉPVE. Ugyanaz a két jelzés,
//! mint a diáknál (óra előtt tíz perccel, és ha változik az órarend), csak a
//! szövege szól másról: nála az OSZTÁLY és a TEREM a hír, nem a tantárgy
//! (lásd `teacherReminderText` a `push-plan.ts`-ben). A feltétel viszont nem
//! kényelmi kérdés: egy tanári feliratkozás EGY EMBER munkanapját küldi el egy
//! készülékre percre pontosan, ezért csak iskolai belépéssel, tanárként
//! igazolt fiók állíthatja be (`/api/ertesites`). Aki nincs belépve, annál a
//! harang meg sem jelenik — egy gomb, ami utána elutasítást kap, rosszabb a
//! hiányzó gombnál.
//!
//! AMI VISZONT ITT VAN, ÉS A DIÁK LAPJÁN NINCS: az ÜTKÖZÉS. Két különböző
//! osztály ugyanabban a percben nem választás, hanem baj — órarendi hiba vagy
//! helyettesítés. A `teacherLessons` szándékosan nem vonja össze őket, ez a
//! lap pedig nevesíti.

export function TeacherDay() {
  const [teachers, setTeachers] = useState<TimetableSubject[]>([]);
  const [selected, setSelected] = useState("");
  //* Amíg a lista és az emlék nem dőlt el, a lap nem állíthatja, hogy „nincs
  //* kiválasztott tanár" — az üres választó ilyenkor téves válasz lenne.
  const [resolved, setResolved] = useState(false);

  const { data: session } = useSession();
  const sessionName = session?.user.name ?? null;
  const sessionIsTeacher = session?.user.isTeacher === true;

  useEffect(() => {
    let alive = true;
    void fetchTimetableTeachers().then((list) => {
      if (!alive) return;
      setTeachers(list.subjects);

      //! HÁROM LÉPCSŐ, ÉS A HARMADIK SZÁNDÉKOSAN HIÁNYZIK — ugyanaz a szabály,
      //! amit a `timetable-page.tsx` `initialSubject`-je követ. Először az
      //! emlék; utána az iskolai belépésből ismert NÉV, ha szerepel a
      //! tanárlistában; harmadik lépés pedig NINCS. Egy tetszőleges kolléga
      //! órarendjét felütni köszönés helyett rosszabb, mint egy üres választó.
      const remembered = loadCachedTeacher();
      if (remembered) {
        setSelected(remembered);
        setResolved(true);
        return;
      }
      if (sessionIsTeacher && sessionName) {
        const wanted = sessionName.trim().toLocaleLowerCase("hu");
        const match = list.subjects.find(
          (s) => s.name.trim().toLocaleLowerCase("hu") === wanted,
        );
        if (match) {
          setSelected(match.short);
          saveCachedTeacher(match.short);
        }
      }
      setResolved(true);
    });
    return () => {
      alive = false;
    };
  }, [sessionIsTeacher, sessionName]);

  const dv = useDayView({
    kind: "teacher",
    subject: selected,
    //! ÜRES MINDKETTŐ, ÉS EZ NEM HIÁNY — lásd a fájl fejlécét. A modell
    //! ugyanaz a `buildDayModel`, csak nincs mit feloldani és nincs mit
    //! duálisnak jelölni.
    prefs: [],
    dualSchedule: null,
  });

  const teacherWeek = useMemo(
    () => (dv.view && dv.week ? buildTeacherWeek(dv.view, dv.week) : null),
    [dv.view, dv.week],
  );

  const picker = (
    <SubjectPicker
      subjects={teachers}
      value={selected}
      disabled={dv.pending}
      label="Tanár"
      placeholder="Válassz tanárt"
      width="w-[170px]"
      offlineHint="A tanárlista most nem érhető el — csak a mentett tanár látszik."
      onChange={(next) => {
        setSelected(next);
        saveCachedTeacher(next);
      }}
    />
  );

  const sheet = (
    <>
      <SheetSection title="Kit nézel">
        <SheetRow icon={<GraduationCap className="size-4" />} label="Tanár">
          {picker}
        </SheetRow>
      </SheetSection>
      {sessionIsTeacher && (
        <>
          <SheetDivider />
          <SheetSection title="Beállítások">
            {/*//! A VEZÉRLŐ MAGA A SOR — nincs köré csomagolt `SheetRow`,
                //! ugyanúgy, mint a diák lapján (lásd `sheetItem`). */}
            <NotificationMenu
              mode="teacher"
              subjects={teachers}
              currentSubject={selected}
            />
          </SheetSection>
        </>
      )}
    </>
  );

  //! AZ ÉRKEZÉSI ÁLLAPOT, NEM HIBAÁLLAPOT. A diák lapja nyilvános
  //! alapértelmezéssel indul, mert bármelyik osztály órarendje bárkinek szól.
  //! Egy tanár neve viszont EGY emberé: alapértelmezésnek választani valakit
  //! nem semleges, hanem téves állítás arról, hogy kinek a napját nézzük.
  const empty = resolved && !selected && (
    <>
      <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
        Kinek a napja?
      </h2>
      <p className="mt-2 max-w-md text-sm text-pretty text-hero-foreground/70">
        Válaszd ki magad a listából — a következő megnyitáskor már a te napoddal
        indul a lap. Belépve az iskolai fiókkal ez magától kitöltődik.
      </p>
      {/*//* A „Hét" a fejléc mátrixában áll, két centivel feljebb, névvel
          //* kiírva — egy mondat, ami ugyanoda mutat, itt már csak zaj. */}
      <div className="mt-6">{picker}</div>
    </>
  );

  return (
    <DayView
      dv={dv}
      lineSubject={
        //* A sor a NÉV rövid alakját viseli, mint a `/tanari` — a teljes név
        //* 25 karakternél a hét dátumát nyomná ki a sorból.
        selected || "Tanár"
      }
      sheet={sheet}
      standalone={empty || undefined}
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
          {teacherWeek && <ClassLoads teacher={teacherWeek} />}
          {teacherWeek && (
            <FreePeriods teacher={teacherWeek} onFocus={dv.focusDay} />
          )}
          <MovedThisWeek week={week} onFocus={dv.focusDay} />
        </>
      )}
      renderDay={(ctx) => <TeacherDayPanel ctx={ctx} dv={dv} />}
    />
  );
}

//! EGY NAP, EGY LAP — a diákéval azonos szerkezetben, hogy aki mindkettőt
//! használja (a legtöbb tanár osztályfőnök is), ne kelljen újratanulnia.
function TeacherDayPanel({
  ctx,
  dv,
}: {
  ctx: DayRenderContext;
  dv: ReturnType<typeof useDayView>;
}) {
  const { panel, isActive, isToday, onSentinel, weekendNote, rest, restSpan } =
    ctx;
  const { day } = panel;
  const { clock, epoch, previewKey, setPreviewKey, error, pending, cached } =
    dv;

  const clashes = useMemo(() => (day ? clashesOf(day.segments) : []), [day]);

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
            {weekendNote && "A következő tanítási nap · "}
            {day ? daySummary(day, isToday) : "Nincs adat erre a napra"}
            {day && day.lessonCount > 0 && (
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
          {error && !day ? (
            <ErrorPanel
              error={error}
              pending={pending}
              onRetry={() => dv.reload(panel.dateKey)}
            />
          ) : rest ? (
            <RestHero
              rest={rest.rest}
              next={rest.next}
              span={restSpan}
              nowMs={dv.nowMs}
            />
          ) : (
            <NowBlock
              variant="teacher"
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

      {onSentinel && (
        <div ref={onSentinel} className="h-px w-full" aria-hidden />
      )}

      <section aria-label="A nap órái">
        <div className="mb-3 flex items-baseline justify-between gap-4">
          <h3 className="text-base font-semibold text-foreground">
            {isToday ? "A mai nap" : "A nap"}
          </h3>
          <Link href="/tanari" className="text-sm text-primary hover:underline">
            Heti órarend
          </Link>
        </div>

        {day && <DayPlanRow day={day} isToday={isToday} className="mb-3" />}

        {/*//! AZ ÜTKÖZÉS A DIÁK CSOPORTBONTÁS-MONDATÁNAK HELYÉN ÁLL, DE NEM
            //! KÉRDEZ. Ott a mondat végén egy „Kiválasztom" áll, mert van mit
            //! választani; itt nincs — mindkét óra a tanáré, és az egyiket
            //! eltüntetni pont az az információvesztés lenne, amit a
            //! `teacherLessons` elkerült. A hangnem is más: piros, mert ez
            //! nem beállítási hiány, hanem a napba írt hiba. */}
        {clashes.map((clash) => (
          <p
            key={clash.startMin}
            className={cn(
              "mb-3 flex items-start gap-2 rounded-xl border border-brand/40 bg-brand/10 px-4 py-3",
              "text-sm leading-snug text-pretty text-foreground",
            )}
          >
            <AlertTriangle
              className="mt-0.5 size-4 shrink-0 text-brand"
              aria-hidden
            />
            <span className="min-w-0 flex-1">
              <span className="font-medium">
                Két órád ütközik{" "}
                <span className="tabular-nums">
                  {rangeLabel(clash.startMin, clash.endMin)}
                </span>
                :
              </span>{" "}
              <span className="text-muted-strong">
                {clash.labels.join(" és ")}. A {""}
                forrás mindkettőt a te órádként küldi — helyettesítés vagy
                órarendi hiba.
              </span>
            </span>
          </p>
        ))}

        {day && <ChangeRow day={day} className="mb-3" />}

        {day && day.lessonCount > 0 ? (
          <>
            <DayRibbon
              day={day}
              nowMin={clock && isToday ? clock.min : null}
              selectedKey={isActive ? previewKey : null}
              mineKeys={null}
              className="mb-3"
            />
            <DayList
              day={day}
              nowMin={clock && isToday ? clock.min : null}
              selectedKey={isActive ? previewKey : null}
              onSelect={setPreviewKey}
              mineKeys={null}
            />
          </>
        ) : (
          <p className="rounded-xl border border-dashed border-border px-4 py-5 text-sm text-pretty text-muted-strong">
            {!day
              ? "Erre a napra nincs adat."
              : rest
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
