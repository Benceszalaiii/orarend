"use client";

import { Briefcase, GraduationCap } from "lucide-react";
import { useState } from "react";
import { DAY_NAMES, DAY_SHORT } from "@/components/timetable/shared";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  CLASSIC_DUAL_SCHEDULE,
  DUAL_WEEK_LETTERS,
  DUAL_WEEKDAYS,
  type DualSchedule,
  EMPTY_DUAL_SCHEDULE,
  hasAnyDualDay,
  isDualDay,
  toggleDualDay,
} from "@/lib/dual-schedule";
import { cn } from "@/lib/utils";

//* ---------------------------------------------------------------------------
//* A DUÁLIS BEOSZTÁS BEÁLLÍTÁSA
//* ---------------------------------------------------------------------------
//! A KÉRDÉS AZ ÜRES RÁCS. Egy legördülő listányi kész beosztás („szerda–péntek",
//! „hétfő–kedd", „csak csütörtök"…) mindig ki fog hagyni valakit, és aki
//! kimaradt, az rosszul állítja be magát. Két hét × öt nap viszont KIMERÍTŐ: a
//! diák pontosan azt jelöli be, ahogy jár, és nem kell egy előre gyártott
//! címkébe belegyömöszölnie magát.
//!
//! A RÁCS ADAT NÉLKÜL IS ÉRTHETŐ. Nem órarend, nem is kivonat belőle — két
//! üres hét, amit a diák tölt ki. Ezért nem is mutat órákat: az egyetlen
//! kérdése az, hogy AZ a nap iskolai vagy munkahelyi.

const cellBase =
  "relative flex h-12 items-center justify-center rounded-lg border text-xs font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 motion-reduce:transition-none";

export function DualScheduleGrid({
  value,
  weekLetter,
  todayDow,
  onChange,
  className,
}: {
  value: DualSchedule;
  /** A FOLYÓ hét jelölése a forrásból — csak tájékozódásra, a sor kiemelésére. */
  weekLetter: string;
  /** A mai nap ISO sorszáma (1–5), vagy `null` hétvégén. */
  todayDow: number | null;
  onChange: (next: DualSchedule) => void;
  className?: string;
}) {
  return (
    <div className={cn("space-y-2", className)}>
      {/*//* Fejléc: a napok. Az első oszlop a hét jelölésének helye. */}
      <div className="grid grid-cols-[3.25rem_repeat(5,minmax(0,1fr))] gap-1.5">
        <span />
        {DUAL_WEEKDAYS.map((dow, i) => (
          <span
            key={dow}
            className={cn(
              "flex items-center justify-center gap-1 text-xs font-medium",
              dow === todayDow ? "text-foreground" : "text-muted-foreground",
            )}
          >
            {DAY_SHORT[i]}
            {dow === todayDow && (
              <>
                {/*//* Piros csak élő szerepben: a mai nap jelzése. */}
                <span className="size-1.5 rounded-full bg-brand" aria-hidden />
                <span className="sr-only">(ma)</span>
              </>
            )}
          </span>
        ))}
      </div>

      {DUAL_WEEK_LETTERS.map((letter) => {
        const current = letter === weekLetter;
        return (
          <div
            key={letter}
            className="grid grid-cols-[3.25rem_repeat(5,minmax(0,1fr))] items-center gap-1.5"
          >
            <span className="flex flex-col leading-tight">
              <span className="text-sm font-semibold text-foreground">
                {letter} hét
              </span>
              {current && (
                <span className="text-[11px] text-muted-foreground">
                  ez a hét
                </span>
              )}
            </span>
            {DUAL_WEEKDAYS.map((dow, i) => {
              const on = isDualDay(value, letter, dow);
              return (
                <button
                  key={dow}
                  type="button"
                  aria-pressed={on}
                  //! A GOMB NEVE MONDJA KI A JELENTÉST. „A hét, szerda: duális"
                  //! — a rácsot képernyőolvasóval is végig lehet járni anélkül,
                  //! hogy a fejléceket fejben kellene tartani.
                  aria-label={`${letter} hét, ${DAY_NAMES[i].toLowerCase()}: ${
                    on ? "duális" : "iskola"
                  }`}
                  onClick={() => onChange(toggleDualDay(value, letter, dow))}
                  className={cn(
                    cellBase,
                    on
                      ? "border-primary/40 bg-primary/12 text-primary hover:bg-primary/18"
                      : "border-dashed border-border bg-card text-muted-foreground hover:bg-muted/50",
                    current && "ring-1 ring-inset ring-border",
                    dow === todayDow && current && "ring-brand/40",
                  )}
                >
                  {on ? (
                    <Briefcase className="size-4" aria-hidden />
                  ) : (
                    <GraduationCap className="size-4 opacity-40" aria-hidden />
                  )}
                </button>
              );
            })}
          </div>
        );
      })}

      {/*//* Jelmagyarázat: a rács két ikonja csak akkor adat, ha meg van nevezve. */}
      <p className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Briefcase className="size-3.5 text-primary" aria-hidden />
          duális — a munkahelyen
        </span>
        <span className="flex items-center gap-1.5">
          <GraduationCap className="size-3.5 opacity-40" aria-hidden />
          iskola — az órarend érvényes
        </span>
      </p>
    </div>
  );
}

//* A beosztás egy mondatban: „H, K" — a rács kivonata, kinyitás nélkül.
function daysLabel(days: number[]): string {
  if (days.length === 0) return "nincs duális nap";
  return days.map((d) => DAY_SHORT[d - 1]).join(", ");
}

//! A SÁV PANELJE. Ugyanaz a szótár, mint a hét többi paneljéé: cím, alatta a
//! tartalom. Három állapota van, és mindegyik ugyanazon a helyen áll —
//! kérdés (még nincs beállítva), kivonat (be van állítva), vagy a hiányzó
//! A/B-jelölés bevallása.
export function DualPanel({
  schedule,
  weekLetter,
  todayDow,
  classShort,
  onChange,
  className,
}: {
  /** `null` = ez az osztály még nincs beállítva. */
  schedule: DualSchedule | null;
  weekLetter: string;
  todayDow: number | null;
  classShort: string;
  onChange: (next: DualSchedule) => void;
  className?: string;
}) {
  const configured = schedule !== null;
  const any = schedule !== null && hasAnyDualDay(schedule);

  //! A PÁRBESZÉD EGY PÉLDÁNY, A PANELEN KÍVÜL. A panel törzse ÁTVÁLT, amint az
  //! első koppintás beállítottá teszi az osztályt (kérdésből kivonat lesz) — ha
  //! a párbeszéd abban a törzsben ülne, a React lecserélné, és a rács a diák
  //! szeme előtt ürülne ki, félbehagyva a beállítást. A nyitottság ezért itt
  //! áll, egy szinttel a váltás fölött.
  const [open, setOpen] = useState(false);

  return (
    <section aria-labelledby="dual-heading" className={className}>
      <div className="mb-3 flex items-baseline justify-between gap-4">
        <h2
          id="dual-heading"
          className="text-base font-semibold text-foreground"
        >
          Duális képzés
        </h2>
        {configured && (
          <span className="shrink-0 text-sm text-muted-foreground">
            {classShort}
          </span>
        )}
      </div>

      {!configured ? (
        //! A KÉRDÉST FEL KELL TENNI, MERT A HALLGATÁS IS VÁLASZ LENNE. Amíg
        //! nincs beállítva, a lap minden napot iskolai napnak vesz — ez a
        //! biztonságos irány, de a duális diáknak rossz. Ezért nem várunk arra,
        //! hogy magától megtalálja egy beállítás-menüben.
        <div className="rounded-xl border border-dashed border-border px-4 py-4">
          <p className="text-sm text-pretty text-muted-strong">
            Jársz duálisra? Ha megmondod, mely napokon vagy a munkahelyen, azok
            a napok nem az osztály órarendjét mutatják, és nem is számítanak
            bele a heti terhelésbe.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              className="touch-target"
              onClick={() => setOpen(true)}
            >
              Beállítom
            </Button>
            {/*//* A „nem" is válasz, és ugyanolyan olcsónak kell lennie, mint az
                //* „igen": egy üres beosztás beállítottnak számít, és a kérdés
                //* többé nem áll az útban. */}
            <Button
              variant="ghost"
              size="sm"
              className="touch-target"
              onClick={() => onChange(EMPTY_DUAL_SCHEDULE)}
            >
              Nem járok
            </Button>
          </div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          {any ? (
            <ul className="divide-y divide-border">
              {DUAL_WEEK_LETTERS.map((letter) => (
                <li
                  key={letter}
                  className={cn(
                    "flex items-center gap-3 px-4 py-2.5 text-sm",
                    letter === weekLetter && "bg-muted/40",
                  )}
                >
                  <span className="w-12 shrink-0 font-medium text-foreground">
                    {letter} hét
                  </span>
                  <span className="min-w-0 flex-1 truncate text-muted-strong">
                    {daysLabel(schedule[letter])}
                  </span>
                  {letter === weekLetter && (
                    <span className="shrink-0 text-xs text-muted-foreground">
                      ez a hét
                    </span>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-4 py-3 text-sm text-muted-strong">
              Nincs duális napod — minden nap az órarend szerint megy.
            </p>
          )}

          {/*//! AMIT NEM TUDUNK, AZT KIMONDJUK. A beosztás az A/B jelöléshez
              //! kötődik; ha a forrás erre a hétre nem adott jelölést (szünet,
              //! tanévkezdés), akkor NEM tudjuk megmondani, mikor vagy
              //! duálison — és inkább mutatjuk a teljes órarendet, mint hogy
              //! elrejtsünk egy napot tévedésből. */}
          {any && weekLetter !== "A" && weekLetter !== "B" && (
            <p className="border-t border-border px-4 py-3 text-xs text-pretty text-muted-foreground">
              Erre a hétre a forrás nem adott A/B jelölést, ezért a beosztás nem
              alkalmazható — a lap a teljes órarendet mutatja.
            </p>
          )}

          <div className="border-t border-border px-4 py-2.5">
            <Button
              variant="ghost"
              size="sm"
              className="-mx-2 touch-target"
              onClick={() => setOpen(true)}
            >
              Módosítom
            </Button>
          </div>
        </div>
      )}

      <DualSetupDialog
        open={open}
        onOpenChange={setOpen}
        schedule={schedule ?? EMPTY_DUAL_SCHEDULE}
        weekLetter={weekLetter}
        todayDow={todayDow}
        onChange={onChange}
      />
    </section>
  );
}

//! A VÁLTOZÁS AZONNAL ÉL. Nincs „Mentés" gomb: a rács koppintásra ír, és a
//! lap mögötte át is áll rá. Így a beállítás nem vak — a diák a párbeszéd
//! bezárása előtt látja, mit csinált.
function DualSetupDialog({
  open,
  onOpenChange,
  schedule,
  weekLetter,
  todayDow,
  onChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  schedule: DualSchedule;
  weekLetter: string;
  todayDow: number | null;
  onChange: (next: DualSchedule) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Mikor vagy duálison?</DialogTitle>
          <DialogDescription className="text-pretty">
            Koppints azokra a napokra, amelyeket a munkahelyen töltesz. A duális
            blokk kéthetente ismétlődik, ezért külön kell megadni az A és a B
            hetet — hogy melyik hét van éppen, azt a suli rendszeréből tudjuk.
          </DialogDescription>
        </DialogHeader>

        <DualScheduleGrid
          value={schedule}
          weekLetter={weekLetter}
          todayDow={todayDow}
          onChange={onChange}
        />

        <DialogFooter className="sm:justify-start">
          {/*//! A KLASSZIKUS BLOKK EGY KOPPINTÁS, DE NEM AZ ALAPÉRTELMEZÉS. A
              //! Jedlik duális osztályainak többsége így jár; aki nem, annak a
              //! rács ott van mellette. */}
          <Button
            variant="outline"
            size="sm"
            className="touch-target"
            onClick={() => onChange(CLASSIC_DUAL_SCHEDULE)}
          >
            Szokásos blokk (Sze–P, H–K)
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="touch-target"
            onClick={() => onChange(EMPTY_DUAL_SCHEDULE)}
          >
            Egyik sem
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
