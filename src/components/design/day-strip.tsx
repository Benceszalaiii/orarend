"use client";

import { type MotionValue, motion, useTransform } from "motion/react";
import type { WeekDay } from "@/components/ma/week";
import { cn } from "@/lib/utils";

//* ---------------------------------------------------------------------------
//* A NAPSÁV — hol vagyok, hova mehetek
//* ---------------------------------------------------------------------------
//! EGY SÁV, KÉT MUNKA. Először: MUTATÓ. A napköteg húzható, de a húzás önmagában
//! nem árulja el, hogy az öt napból hányadikon állunk, és hogy van-e még előre.
//! Másodszor: AFFORDANCIA. Ha a lapozásnak nincs látható nyoma, senki nem
//! próbálja meg — a sáv az, ami elmondja, hogy ez a lap oldalra is jár.
//!
//! A JELÖLŐ AZ UJJAL EGYÜTT CSÚSZIK, nem a döntés után ugrik. A köteg tört
//! indexét kapja meg motion-értékként, és `translateX`-szel követi: a mozdulat
//! KÖZBEN látszik, melyik nap felé tart a lap — nem csak utólag, hogy hova
//! érkezett. (Ez a „mutasd a mozdulat irányát" szabály: a köztes képkockák a
//! végállapotra mutatnak, nem vakon interpolálnak.)
//!
//! MIÉRT NEM ELÉG „A HÉT" PANEL. Az lentebb áll, és a nap TERHELÉSÉRŐL szól —
//! ott a hosszú sáv az adat. Ez a sáv fent van, mindig, és a HELYZETRŐL szól.
//! A kettő nem ugyanaz a kérdés, ezért nem is ugyanaz a vezérlő; ami közös,
//! az az adat, és mindkettő ugyanoda ír.

export function DayStrip({
  days,
  index,
  progress,
  todayDateKey,
  onPick,
  className,
}: {
  days: WeekDay[];
  index: number;
  progress: MotionValue<number>;
  todayDateKey: string;
  onPick: (index: number) => void;
  className?: string;
}) {
  const count = Math.max(1, days.length);
  //* A jelölő a SAJÁT szélességének százalékával tolódik: se `left`, se
  //* `width` nem változik, a mozgás végig a kompozitoron marad.
  const shift = useTransform(progress, (p) => `${p * 100}%`);

  return (
    <div
      role="tablist"
      aria-label="A hét napjai"
      className={cn("relative flex w-full items-stretch", className)}
    >
      <motion.span
        aria-hidden
        style={{ x: shift, width: `${100 / count}%` }}
        className="pointer-events-none absolute inset-y-0 left-0 rounded-full bg-foreground/10"
      />
      {days.map((day, i) => {
        const active = i === index;
        const isToday = day.dateKey === todayDateKey;
        return (
          <button
            key={day.dateKey}
            type="button"
            role="tab"
            id={`day-tab-${i}`}
            aria-controls={`day-panel-${i}`}
            aria-selected={active}
            //* A nem aktív fülek kiesnek a tabulátor-sorból: a nyilak lapoznak
            //* köztük, ahogy a fülsávoknál szokás.
            tabIndex={active ? 0 : -1}
            onClick={() => onPick(i)}
            onKeyDown={(event) => {
              if (event.key !== "ArrowLeft" && event.key !== "ArrowRight")
                return;
              event.preventDefault();
              const next = Math.min(
                Math.max(i + (event.key === "ArrowRight" ? 1 : -1), 0),
                count - 1,
              );
              onPick(next);
              document.getElementById(`day-tab-${next}`)?.focus();
            }}
            className={cn(
              "relative z-10 flex min-w-0 flex-1 items-center justify-center gap-1 rounded-full px-1 py-2",
              //! A LÁTHATÓ PIRULA KICSI, A CÉLPONT NEM. A projekt saját szabálya
              //! (`.touch-target`) 44 képpontot ír elő durva mutatóeszközön; a
              //! fül viszont 32 képpont magas, mert egy 44 képpontos sáv a
              //! telefon képernyőjének további 1,5%-át venné el ÁLLANDÓAN. A
              //! megoldás nem a pirula hizlalása: egy láthatatlan réteg nyúlik
              //! ki fölé-alá a fejléc SAJÁT térközébe, ahol amúgy sincs semmi.
              //! Így a fül 44 képpontról fogható, miközben 32-t foglal.
              "after:absolute after:inset-x-0 after:-inset-y-1.5 after:content-['']",
              "text-xs font-semibold transition-colors duration-150",
              "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none",
              active
                ? "text-foreground"
                : "text-muted-strong hover:text-foreground",
              //* A duális nap a hét MÁSIK fajta napja — a napsáv ezt ugyanazzal
              //* a színnel mondja, mint a heti panel sora.
              !active && day.dual === "dual" && "text-primary/75",
            )}
          >
            <span className="truncate">{day.name.slice(0, 3)}</span>
            {isToday && (
              <>
                {/*//* Piros csak élő szerepben: a mai nap jelzése. */}
                <span
                  className="size-1 shrink-0 rounded-full bg-brand"
                  aria-hidden
                />
                <span className="sr-only">(ma)</span>
              </>
            )}
          </button>
        );
      })}
    </div>
  );
}
