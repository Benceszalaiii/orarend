"use client";

import { AlertTriangle, Briefcase } from "lucide-react";
import { minLabel, rangeLabel } from "@/components/timetable/shared";
import { accentStyle } from "@/lib/accent";
import { TIMETABLE_SOURCE } from "@/lib/timetable";
import { cn } from "@/lib/utils";
import { hoursLabel, type WeekModel } from "./week";

//* ---------------------------------------------------------------------------
//* A HÉT PANELJEI — a napi nézet kiterjesztése, nem a rács ismétlése
//* ---------------------------------------------------------------------------
//! Egyik panel sem mutat órarendet: mindegyik olyan kérdésre felel, amit a rácson
//! csak végigolvasva lehetne megválaszolni. Melyik nap a nehéz; hol mozdult
//! valami a héten; mennyi egy tantárgy heti terhelése.

//* A szakkör-oldal szekció-nyelve: cím + halk kiegészítés, alatta a tartalom.
//* Nem kártya a kártyában — a keret a LISTÁÉ, nem a szekcióé.
function Section({
  id,
  title,
  aside,
  children,
  className,
}: {
  id: string;
  title: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section aria-labelledby={id} className={className}>
      <div className="mb-3 flex items-baseline justify-between gap-4">
        <h2 id={id} className="text-base font-semibold text-foreground">
          {title}
        </h2>
        {aside && (
          <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
            {aside}
          </span>
        )}
      </div>
      {children}
    </section>
  );
}

const listGroup =
  "divide-y divide-border overflow-hidden rounded-xl border border-border bg-card";
const rowBase =
  "flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none";

//* Halk üres-panel: a szekció megmarad (a hely tanít), de nem kiabál.
function EmptyPanel({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-xl border border-dashed border-border px-4 py-4 text-sm text-pretty text-muted-strong">
      {children}
    </p>
  );
}

//! A HÉT PULZUSA. Öt sor, napi terhelés szerinti sávval — egy pillantásból
//! látszik, melyik nap hosszú és melyik nap szabad. És mivel a napi nézet
//! bármelyik napra ráállítható, ez egyben a NAVIGÁCIÓ is: nem külön vezérlő,
//! hanem ugyanaz az adat, amire rá lehet koppintani.
export function WeekPulse({
  week,
  focusKey,
  todayDateKey,
  onFocus,
  className,
}: {
  week: WeekModel;
  focusKey: string;
  todayDateKey: string;
  onFocus: (dateKey: string) => void;
  className?: string;
}) {
  const peak = Math.max(1, ...week.days.map((d) => d.minutes));

  return (
    <Section
      id="week-heading"
      title="A hét"
      aside={`${hoursLabel(week.totalMinutes)} · ${week.totalLessons} óra`}
      className={className}
    >
      <ul className={listGroup}>
        {week.days.map((day) => {
          const focused = day.dateKey === focusKey;
          const isToday = day.dateKey === todayDateKey;
          return (
            <li key={day.dateKey}>
              <button
                type="button"
                onClick={() => onFocus(day.dateKey)}
                aria-current={focused ? "true" : undefined}
                className={cn(
                  rowBase,
                  "relative overflow-hidden",
                  focused && "bg-muted/60",
                )}
              >
                {/*//! A TERHELÉS SÁVJA A SOR HÁTTERE, nem külön grafikon: a
                    //! hosszabb nap sora hosszabban van kitöltve. Semleges
                    //! tónus — a szín ezen a lapon jelölés, nem felület. */}
                <span
                  className="pointer-events-none absolute inset-y-0 left-0 bg-foreground/6"
                  style={{ width: `${(day.minutes / peak) * 100}%` }}
                  aria-hidden
                />
                <span className="relative z-10 w-10 shrink-0 font-medium text-foreground">
                  {day.name.slice(0, 3)}
                </span>
                {isToday && (
                  <>
                    {/*//* Piros csak élő szerepben: a mai nap jelzése. */}
                    <span
                      className="relative z-10 -ml-1.5 size-1.5 shrink-0 rounded-full bg-brand"
                      aria-hidden
                    />
                    <span className="sr-only">(ma)</span>
                  </>
                )}

                <span className="relative z-10 min-w-0 flex-1 truncate text-sm text-muted-strong">
                  {day.dual === "dual" ? (
                    <span className="flex items-center gap-1.5 text-primary">
                      <Briefcase className="size-3.5 shrink-0" aria-hidden />
                      Duális
                    </span>
                  ) : day.lessonCount === 0 ? (
                    "Nincs óra"
                  ) : (
                    <span className="tabular-nums">
                      {rangeLabel(day.firstMin, day.lastMin)}
                    </span>
                  )}
                </span>

                {day.movedCount > 0 && (
                  <>
                    <AlertTriangle
                      className="relative z-10 size-3.5 shrink-0 text-brand"
                      aria-hidden
                    />
                    <span className="sr-only">
                      {day.movedCount} áthelyezett óra
                    </span>
                  </>
                )}
                <span className="relative z-10 shrink-0 text-sm tabular-nums text-foreground">
                  {day.dual === "dual" || day.lessonCount === 0
                    ? "—"
                    : hoursLabel(day.minutes)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

//! ÁTHELYEZVE — A HÉT EGÉSZÉBŐL. A napi sor csak a mai napot nézi; ez a panel
//! az egész hetet. Ugyanaz a szabály: mindig ott van, a hangneme vált, nem a
//! léte — mert a „nincs semmi" is válasz, és csak akkor ér valamit, ha
//! megbízhatóan ugyanott áll.
export function MovedThisWeek({
  week,
  onFocus,
  className,
}: {
  week: WeekModel;
  onFocus: (dateKey: string) => void;
  className?: string;
}) {
  return (
    <Section
      id="moved-heading"
      title="Áthelyezve a héten"
      aside={week.moved.length > 0 ? String(week.moved.length) : undefined}
      className={className}
    >
      {week.moved.length === 0 ? (
        <EmptyPanel>
          A {TIMETABLE_SOURCE} egyetlen ezen a héten esedékes órát sem jelölt
          áthelyezettként. Amit a suli nem jelöl meg, arról ez a lap sem tud.
        </EmptyPanel>
      ) : (
        <ul className={listGroup}>
          {week.moved.map((item) => (
            <li key={`${item.dateKey}-${item.run.key}`}>
              <button
                type="button"
                onClick={() => onFocus(item.dateKey)}
                className={rowBase}
              >
                <AlertTriangle
                  className="size-4 shrink-0 text-brand"
                  aria-hidden
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-foreground">
                    {item.run.lesson.subject || item.run.lesson.subjectShort}
                  </span>
                  <span className="mt-0.5 flex items-center gap-2 text-xs text-muted-strong">
                    <span>{item.dayName}</span>
                    <span aria-hidden>·</span>
                    <span className="tabular-nums">
                      {minLabel(item.run.startMin)}
                    </span>
                  </span>
                </span>
                {item.run.rooms[0] && (
                  <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
                    {item.run.rooms[0]}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

//! HETI TERHELÉS TANTÁRGYANKÉNT. A rácson ez tizenöt kártya elolvasása; itt egy
//! rendezett lista. A színek ugyanazok, mint a rácson — ugyanaz a tantárgy
//! ugyanaz a szín, más léptékben.
export function SubjectLoads({
  week,
  className,
}: {
  week: WeekModel;
  className?: string;
}) {
  const peak = Math.max(1, ...week.subjects.map((s) => s.minutes));
  //* Csak ott írjuk ki a csoportot, ahol ugyanaz a rövid név többször szerepel:
  //* egyébként a sor felesleges szót viselne.
  const ambiguous = new Set(
    week.subjects
      .map((s) => s.short)
      .filter((short, i, all) => all.indexOf(short) !== i),
  );

  return (
    <Section
      id="subjects-heading"
      title="Tantárgyak"
      aside={week.subjects.length > 0 ? "heti terhelés" : undefined}
      className={className}
    >
      {week.subjects.length === 0 ? (
        <EmptyPanel>Ezen a héten nincs iskolai órád.</EmptyPanel>
      ) : (
        <ul className={listGroup}>
          {week.subjects.map((subject) => (
            <li
              key={subject.key}
              className="relative flex items-center gap-3 overflow-hidden px-4 py-2.5"
              style={accentStyle(subject.short)}
              title={subject.label}
            >
              <span
                className="pointer-events-none absolute inset-y-0 left-0 bg-foreground/6"
                style={{ width: `${(subject.minutes / peak) * 100}%` }}
                aria-hidden
              />
              <span
                className="relative z-10 size-2 shrink-0 rounded-full acc-dot"
                aria-hidden
              />
              <span className="relative z-10 min-w-0 flex-1 truncate text-sm">
                {/*//! A TANTÁRGY SZÍNE SZÖVEGSZÍNKÉNT — nem kitöltésként. Ez a
                    //! lap egyetlen helye, ahol a szín a névre kerül, és pont
                    //! ezért olvasható jelölés marad. */}
                <span className="font-medium acc-text">{subject.short}</span>
                {ambiguous.has(subject.short) && subject.group && (
                  <span className="ml-1.5 text-xs text-muted-strong">
                    {subject.group}
                  </span>
                )}
              </span>
              <span className="relative z-10 shrink-0 text-sm tabular-nums text-foreground">
                {hoursLabel(subject.minutes)}
              </span>
            </li>
          ))}
        </ul>
      )}
      {week.hasDualDays && week.subjects.length > 0 && (
        //! MEGMONDJUK, MIT NEM SZÁMOLTUNK BELE. A duális napok órái nem a diák
        //! órái — de egy összesítés, ami ezt szó nélkül elhagyja, hibásnak
        //! látszik. Egy sor különbség a kettő között.
        <p className="mt-2 text-xs text-muted-foreground">
          A duális napok nem számítanak bele.
        </p>
      )}
    </Section>
  );
}
