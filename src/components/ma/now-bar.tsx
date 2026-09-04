"use client";

import { ChevronUp } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { DayModel } from "@/components/ma/day";
import { DrainBar } from "@/components/timetable/drain-bar";
import {
  countdownLabel,
  type NowState,
  spanFraction,
} from "@/components/timetable/now";
import { minLabel } from "@/components/timetable/shared";
import type { Clock } from "@/components/timetable/use-clock";
import { accentStyle } from "@/lib/accent";
import { cn } from "@/lib/utils";

//* ---------------------------------------------------------------------------
//* AZ ÁLLANDÓ „MOST" — a hero összecsukott alakja
//* ---------------------------------------------------------------------------
//! A LAP LEGÉRTÉKESEBB ELEME EDDIG ELGÖRDÜLT. A `NowBlock` a 153. és a 386.
//! képpont közt áll; alatta 2300 képpontnyi lap következik. Aki lejjebb néz —
//! márpedig a nap listája, a heti panelek, a tantárgyak mind ott vannak —, az
//! elveszíti azt az egy adatot, amiért a lapot megnyitotta: mi megy most, és
//! mennyi van hátra. A folyosón ez azt jelenti, hogy vissza kell görgetni.
//!
//! EZÉRT NEM TŰNIK EL, HANEM ÖSSZECSUKÓDIK. Amikor a hero kigördül a képből, a
//! tartalma egy sorban jelenik meg a lap tetején: ugyanaz a pötty, ugyanaz a
//! tantárgy, ugyanaz a terem, ugyanaz a visszaszámláló. Nem új információ és
//! nem új felület — ugyanannak a válasznak a kicsinyített alakja.
//!
//! ÁTTETSZŐ RÉTEG, NEM SÁV. A lap tartalma ALATTA fut tovább (`backdrop-filter`),
//! és a széle nem 1 képpontos vonal, hanem elhalványuló él — így a fejléc
//! lebegő rétegnek látszik, nem egy elvett csíknak a lap tetejéből.
//!
//! ÉS ODA MEGY VISSZA, AHONNAN JÖTT. A sorra koppintva a lap a hero-hoz görget:
//! ami egy úton tűnt el, az ugyanazon az úton kerül elő. A megjelenés is ezt
//! mondja: elmosásból élesedik és fentről ereszkedik — anyagként érkezik, nem
//! csak láthatóvá válik.

export function NowBar({
  visible,
  state,
  clock,
  epoch,
  day,
  isToday,
  dayName,
  onReturn,
  className,
}: {
  visible: boolean;
  state: NowState | null;
  clock: Clock | null;
  epoch: number;
  day: DayModel | null;
  isToday: boolean;
  dayName: string;
  onReturn: () => void;
  className?: string;
}) {
  const reduced = useReducedMotion();
  const content = summarize(state, clock, day, isToday, dayName);

  return (
    <AnimatePresence initial={false}>
      {visible && content && (
        <motion.div
          key="now-bar"
          initial={
            reduced
              ? { opacity: 0 }
              : { opacity: 0, height: 0, y: -6, filter: "blur(6px)" }
          }
          animate={
            reduced
              ? { opacity: 1 }
              : { opacity: 1, height: "auto", y: 0, filter: "blur(0px)" }
          }
          exit={
            reduced
              ? { opacity: 0 }
              : { opacity: 0, height: 0, y: -6, filter: "blur(6px)" }
          }
          //! ANYAGKÉNT ÉRKEZIK. Az elmosás, a méret és a helyzet EGYÜTT fut le
          //! — külön-külön ütemezve három dolog történne egy helyett. Túllövés
          //! nincs: ezt nem az ujj indította, egy visszaugró fejléc pedig
          //! pontosan az a mozgás, ami elvonja a figyelmet a tartalmáról.
          transition={
            reduced
              ? { duration: 0.15 }
              : { type: "spring", bounce: 0, duration: 0.35 }
          }
          className={cn("overflow-hidden", className)}
        >
          <button
            type="button"
            onClick={onReturn}
            className={cn(
              //! A SOR ALATTI HÉZAG A GOMBÉ, NEM AZ ANIMÁLT DOBOZÉ. A külső
              //! elem magassága nullára fut, amikor a sor becsukódik — de a
              //! `border-box` miatt a rajta ülő belső margó ALÁ nem tud menni,
              //! így egy pár képpontos csonk maradna a fejléc alatt akkor is,
              //! amikor nincs mit mutatni. Margóként a gombon viszont a
              //! becsukott alak tényleg nulla magas, a nyitott mérése pedig
              //! változatlan: az elmosás-doboz (`overflow-hidden`) saját
              //! szövegkörnyezetet nyit, tehát a margó belül marad.
              "relative mb-1.5 flex w-full min-w-0 items-center gap-2 overflow-hidden rounded-xl px-2 py-1.5 text-left",
              "transition-colors hover:bg-foreground/5 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none",
            )}
          >
            {content.running ? (
              //* Piros csak élő szerepben.
              <span className="shrink-0 rounded-full bg-brand px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand-foreground">
                Most
              </span>
            ) : (
              content.accentSeed && (
                <span
                  className="size-2 shrink-0 rounded-full acc-dot"
                  style={accentStyle(content.accentSeed)}
                  aria-hidden
                />
              )
            )}

            <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
              {content.title}
            </span>

            {content.room && (
              <span className="shrink-0 rounded-[4px] bg-foreground/[0.08] px-1 py-px text-[11px] font-bold tabular-nums text-foreground dark:bg-foreground/15">
                {content.room}
              </span>
            )}

            {content.tail && (
              <span className="shrink-0 text-xs font-semibold tabular-nums text-muted-strong">
                {content.tail}
              </span>
            )}

            <ChevronUp
              className="size-3.5 shrink-0 text-muted-foreground"
              aria-hidden
            />
            <span className="sr-only">Vissza a nap tetejére</span>

            {/*//* Ugyanaz a haladás-sáv, ami a hero alsó élén fut — a sor
                //* alsó éle így nem díszcsík, hanem ugyanannak a szakasznak a
                //* folytatása. */}
            {content.span &&
              content.span.toMin > content.span.fromMin &&
              clock && (
                <DrainBar
                  key={`${epoch}-${content.span.fromMin}-${content.span.toMin}`}
                  span={content.span}
                  fraction={spanFraction(content.span, clock.min)}
                  accentSeed={content.accentSeed}
                  className="h-[2px] !bg-brand"
                />
              )}
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

//! EGY SOR, NEM EGY KIVONAT. A hero négy adatot mond el egymás alatt; ez a sor
//! ugyanazokból annyit visz, amennyi EGY sorban olvasható marad: mi, hol,
//! mennyi. A tanár nevét szándékosan hagyjuk el — az a hero-ban van, és a
//! folyosón nem az dönti el, merre indulj.
function summarize(
  state: NowState | null,
  clock: Clock | null,
  day: DayModel | null,
  isToday: boolean,
  dayName: string,
): {
  title: string;
  room: string;
  tail: string;
  accentSeed: string;
  running: boolean;
  span: { fromMin: number; toMin: number } | null;
} | null {
  //! NEM MA: A SOR A NAPOT MONDJA. Egy másik napra átlapozva nincs „most" — a
  //! fejléc ilyenkor azt viszi tovább, ami ott az egyetlen érvényes válasz:
  //! melyik nap ez, és mikor kezdődik.
  if (!isToday || !state || !clock) {
    if (!day || day.lessonCount === 0) return null;
    const first = day.items[0];
    if (!first) return null;
    return {
      title: `${dayName} · ${first.fullTitle}`,
      room: first.meta[0] ?? "",
      tail: minLabel(first.startMin),
      accentSeed: first.accentSeed,
      running: false,
      span: null,
    };
  }

  if (state.phase === "empty") return null;

  const primary = state.phase === "lesson" ? state.current : state.next;
  if (!primary) return null;

  const span = "span" in state ? state.span : null;
  const running = state.phase === "lesson";
  const remainingSec = span ? Math.max(0, span.toMin * 60 - clock.sec) : 0;
  const countdown = span ? countdownLabel(remainingSec) : null;

  return {
    title: primary.fullTitle,
    room: primary.meta[0] ?? "",
    //* „33 p", nem „33 perc van hátra": a sor a hero rövidítése, nem a
    //* mondata. A teljes mondat egy koppintásra ott van.
    tail: countdown
      ? `${countdown.value}${countdown.unit ? ` ${countdown.unit.slice(0, 1)}` : ""}`
      : minLabel(primary.startMin),
    accentSeed: primary.accentSeed,
    running,
    span,
  };
}
