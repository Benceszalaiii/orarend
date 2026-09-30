"use client";

import { Briefcase } from "lucide-react";
import {
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  useMemo,
  useRef,
  useState,
} from "react";
import { useClock } from "@/components/timetable/use-clock";
import { accentStyle } from "@/lib/accent";
import { type DayEnd, dayEnds, type SlotFit } from "@/lib/club-fit";
import {
  blockOfLesson,
  DAY_SHORT,
  isWholeDay,
  type LessonBlock,
  lastEndBefore,
  layoutWeek,
  lessonBlocks,
  MAP_WEEKDAYS,
  type MapCluster,
  type MapSlot,
  type MapWindow,
  mapRange,
  type PlacedSlot,
  sameWindow,
  slotInWindow,
  slotRank,
  snapMinute,
  WHOLE_DAY,
  windowLabel,
} from "@/lib/club-week-map";
import { formatMinute, WEEKDAY_NAMES } from "@/lib/clubs";
import type { FitWeeks } from "@/lib/use-club-fit";
import { cn } from "@/lib/utils";
import type { ClubCardData } from "./club-card";
import { SlotVerdict } from "./fit-marks";

//* ---------------------------------------------------------------------------
//* A HÉT-TÉRKÉP
//* ---------------------------------------------------------------------------
//! A „BELEFÉR" MEGRAJZOLVA. Öt oszlop, mint a rácson: a diák saját órái a
//! RÁCS SZÍNEIVEL, felirat nélkül (minden ismert hétből, lásd `lessonBlocks`),
//! és minden szakkör minden időpontja a valódi helyén, az ÍTÉLETE színével —
//! kék, ha belefér; szürke, ha beleszúr egy órába; csíkos, ha nem tudjuk. A
//! hetét a színeiről ismeri fel, ahogy a rácson látja; a szakkör saját színe
//! a súgóban és a lista pöttyén él.
//!
//! A TÉRKÉP A SZŰRŐ IS, ugyanúgy, mint a sáv. Egy nap fejléce vagy egy csomó
//! koppintásra, egérrel egy kihúzott téglalapra szűkíti a listát. A
//! billentyűzetnek a napok és a csomók gombok; a lista marad a hozzáférhető
//! alak, a jelek maguk némák.
//!
//! EGY MOZDULAT, NEM TÍZ. A jelek azonnal ott állnak (az időpontot a szerver
//! tudja), csak még ítélet nélkül. Amikor megérkezik a heted, az órák
//! fentről lefelé kinőnek a saját színükkel, és a jelek egy hullámban
//! ítéletet kapnak és sorba rendeződnek: balra, ami belefér.
//! Osztályváltáskor ugyanaz a hét alakul át a másikba — az órák a helyükre
//! csúsznak és átszíneződnek, nem tűnnek el és jönnek újra.

export type MapHover = { slug: string; from: "map" | "list" } | null;

type FitInfo = { slots: SlotFit[] };

type Drag = {
  id: number;
  x0: number;
  y0: number;
  day0: number;
  min0: number;
  active: boolean;
};

type Tip = { slot: PlacedSlot; x: number; y: number; below: boolean };

//* A képernyőolvasó a nap gombját így hallja: „Csak a keddi szakkörök".
const DAY_ADJ = ["", "hétfői", "keddi", "szerdai", "csütörtöki", "pénteki"];

//* A jel ítélete adat-attribútumként megy a CSS-nek (`.wm-mark[data-v]`).
function verdictOf(fit: SlotFit | undefined): string {
  if (!fit) return "pending";
  if (fit.verdict === "clash" && fit.dual) return "dual";
  return fit.verdict;
}

export function WeekMap({
  clubs,
  fits,
  fitWeeks,
  lit,
  hover,
  onHover,
  timeWindow,
  onTimeWindow,
}: {
  //* A térkép alapja: ami az osztályodnak szól vagy nyitott — keresés nélkül,
  //* hogy gépelés közben ne rendeződjenek át a sávok.
  clubs: ClubCardData[];
  fits: Map<string, FitInfo> | null;
  fitWeeks: FitWeeks;
  //* Ami a keresés, a fajta és a sáv szűrője után a listában marad.
  lit: ReadonlySet<string>;
  hover: MapHover;
  onHover: (hover: MapHover) => void;
  timeWindow: MapWindow | null;
  onTimeWindow: (next: MapWindow | null) => void;
}) {
  const bySlug = useMemo(
    () => new Map(clubs.map((club) => [club.slug, club])),
    [clubs],
  );
  const slots = useMemo<MapSlot[]>(
    () =>
      clubs.flatMap((club) =>
        club.slots.flatMap((slot, index) =>
          slot.weekday >= 1 && slot.weekday <= 5
            ? [
                {
                  club: club.slug,
                  index,
                  weekday: slot.weekday,
                  startMinute: slot.startMinute,
                  endMinute: slot.endMinute,
                  rank: slotRank(fits?.get(club.slug)?.slots[index]),
                  name: club.name,
                },
              ]
            : [],
        ),
      ),
    [clubs, fits],
  );
  const clusters = useMemo(() => layoutWeek(slots), [slots]);
  const lessons = useMemo(
    () =>
      fitWeeks.state === "ready"
        ? MAP_WEEKDAYS.map((d) => lessonBlocks(fitWeeks.weeks, d))
        : null,
    [fitWeeks],
  );
  const ends = useMemo(
    () =>
      fitWeeks.state === "ready"
        ? dayEnds(fitWeeks.weeks, fitWeeks.dual)
        : null,
    [fitWeeks],
  );
  const range = useMemo(
    () => mapRange(slots, lessons?.flat() ?? []),
    [slots, lessons],
  );
  const span = range.to - range.from;
  const pct = (minute: number) =>
    Math.min(100, Math.max(0, ((minute - range.from) / span) * 100));

  const hostRef = useRef<HTMLFieldSetElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const swallowClick = useRef(false);
  const [brush, setBrush] = useState<MapWindow | null>(null);
  const [tip, setTip] = useState<Tip | null>(null);

  //* A térkép csak hidratálás után rajzolódik (a panel addig helyfoglaló),
  //* ezért a mai nap itt nem okoz eltérést a szerver HTML-jéhez képest.
  const today = new Date().getDay();
  //! AMÍG HÚZOL, AZ ÉLŐ TÉGLALAP SZŰR a térképen — a lista csak elengedéskor
  //! vált. Így a húzás közben is látszik, mi esik bele, de a lista nem
  //! ugrál minden képkockán.
  const view = brush ?? timeWindow;
  const spot = hover?.slug ?? null;

  //* ---------------------------------------------------------------------
  //* A HÚZÁS
  //* ---------------------------------------------------------------------
  const locate = (clientX: number, clientY: number) => {
    const box = bodyRef.current?.getBoundingClientRect();
    if (!box || box.width === 0 || box.height === 0) return null;
    const x = Math.min(Math.max(clientX - box.left, 0), box.width - 1);
    const y = Math.min(Math.max(clientY - box.top, 0), box.height);
    return {
      day: Math.min(5, Math.max(1, Math.floor((x / box.width) * 5) + 1)),
      minute: range.from + (y / box.height) * span,
    };
  };

  const windowFrom = (
    d: Drag,
    at: { day: number; minute: number },
  ): MapWindow => {
    const lo = Math.min(d.day0, at.day);
    const hi = Math.max(d.day0, at.day);
    const from = snapMinute(Math.min(d.min0, at.minute));
    const to = Math.max(snapMinute(Math.max(d.min0, at.minute)), from + 5);
    return {
      days: Array.from({ length: hi - lo + 1 }, (_, i) => lo + i),
      from,
      to,
    };
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    swallowClick.current = false;
    //! ÉRINTÉSRE NINCS TÉGLALAP. A térképen átfutó ujj a lapot görgeti —
    //! telefonon a nap és a csomó koppintása szűr, a húzás az egéré.
    if (e.pointerType === "touch" || e.button !== 0) return;
    const at = locate(e.clientX, e.clientY);
    if (!at) return;
    drag.current = {
      id: e.pointerId,
      x0: e.clientX,
      y0: e.clientY,
      day0: at.day,
      min0: at.minute,
      active: false,
    };
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    if (!d.active) {
      //* Hat képpont alatt még kattintás: a csomó és a nap gombja kapja.
      if (Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < 6) return;
      d.active = true;
      bodyRef.current?.setPointerCapture(e.pointerId);
      setTip(null);
      onHover(null);
    }
    const at = locate(e.clientX, e.clientY);
    if (at) setBrush(windowFrom(d, at));
  };

  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.id !== e.pointerId || !d.active) return;
    //* A húzás végén a böngésző még egy kattintást is küld — azt elnyeljük,
    //* különben a csomó gombja rögtön felülírná a kihúzott téglalapot.
    swallowClick.current = true;
    const at = locate(e.clientX, e.clientY);
    setBrush(null);
    if (at) onTimeWindow(windowFrom(d, at));
  };

  const onPointerCancel = () => {
    drag.current = null;
    setBrush(null);
  };

  const onClickCapture = (e: MouseEvent<HTMLDivElement>) => {
    if (!swallowClick.current) return;
    swallowClick.current = false;
    e.stopPropagation();
    e.preventDefault();
  };

  //* Üres helyre kattintva a kijelölés elenged — mint egy táblázatban.
  const onBodyClick = (e: MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (target === e.currentTarget || target.dataset.wmColumn !== undefined)
      onTimeWindow(null);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLFieldSetElement>) => {
    if (e.key === "Escape" && timeWindow) {
      e.stopPropagation();
      onTimeWindow(null);
    }
  };

  //* ---------------------------------------------------------------------
  //* A SÚGÓ ÉS A KIEMELÉS
  //* ---------------------------------------------------------------------
  const enterMark = (e: PointerEvent<HTMLSpanElement>, slot: PlacedSlot) => {
    if (e.pointerType !== "mouse" || drag.current?.active) return;
    const host = hostRef.current?.getBoundingClientRect();
    if (!host) return;
    const box = e.currentTarget.getBoundingClientRect();
    const below = box.top - host.top < 84;
    setTip({
      slot,
      x: Math.min(
        Math.max(box.left + box.width / 2 - host.left, 112),
        Math.max(112, host.width - 112),
      ),
      y: below ? box.bottom - host.top : box.top - host.top,
      below,
    });
    onHover({ slug: slot.club, from: "map" });
  };

  const leaveMark = (e: PointerEvent<HTMLSpanElement>) => {
    if (e.pointerType !== "mouse") return;
    setTip(null);
    onHover(null);
  };

  const tipClub = tip ? bySlug.get(tip.slot.club) : undefined;
  const tipRoom = tipClub?.slots[tip?.slot.index ?? 0]?.room ?? null;
  const tipFit = tip ? fits?.get(tip.slot.club)?.slots[tip.slot.index] : null;
  //* Az ütköző óra kiemelve a térképen: pontosan az, amit a súgó megnevez.
  const hotLesson =
    tip && tipFit?.verdict === "clash" && tipFit.lesson
      ? {
          weekday: tip.slot.weekday,
          key:
            blockOfLesson(lessons?.[tip.slot.weekday - 1] ?? [], tipFit.lesson)
              ?.key ?? null,
        }
      : null;
  const tipNote = tip
    ? tipLine(tipFit ?? null, lessons?.[tip.slot.weekday - 1] ?? null, tip.slot)
    : null;

  const hours: number[] = [];
  for (let h = Math.ceil(range.from / 60); h * 60 <= range.to; h++) {
    hours.push(h);
  }

  return (
    <fieldset
      ref={hostRef}
      onKeyDown={onKeyDown}
      className="relative mt-4 min-w-0 border-t border-hero-foreground/10 pt-3 sm:mt-5 sm:pt-4"
    >
      <legend className="sr-only">
        A heted és a szakkörök időpontjai — szűrés napra vagy időre
      </legend>
      <div className="wm-grid">
        <span aria-hidden />
        {MAP_WEEKDAYS.map((d, i) => (
          <DayHead
            key={d}
            weekday={d}
            end={ends?.[i] ?? null}
            today={d === today}
            pressed={
              timeWindow !== null &&
              isWholeDay(timeWindow) &&
              timeWindow.days.length === 1 &&
              timeWindow.days[0] === d
            }
            onPress={(pressed) =>
              onTimeWindow(pressed ? null : { days: [d], ...WHOLE_DAY })
            }
          />
        ))}
      </div>

      <div className="wm-grid mt-1.5">
        {/*//* Az órák vonalzója: kétóránként egy szám, óránként egy halk vonal. */}
        <div className="relative" aria-hidden>
          {hours.map((h) =>
            h % 2 === 0 ? (
              <span
                key={h}
                className="absolute right-1.5 -translate-y-1/2 text-[10px] font-medium tabular-nums leading-none text-muted-foreground"
                style={{ top: `${pct(h * 60)}%` }}
              >
                {h}:00
              </span>
            ) : null,
          )}
        </div>

        {/*//! A TEST EGY RÁCS, NEM ÖT KÜLÖN DOBOZ: a téglalap több napon át is
            //! húzható, és egyetlen koordináta-rendszerben számolunk. */}
        {/* biome-ignore lint/a11y/noStaticElementInteractions: a húzás az egér kényelme; a billentyűzetnek a nap- és csomógombok ugyanezt adják */}
        {/* biome-ignore lint/a11y/useKeyWithClickEvents: az üres helyre kattintás elengedi a kijelölést — billentyűzettel ugyanezt az Esc teszi (lásd `onKeyDown`) */}
        <div
          ref={bodyRef}
          className="wm-body"
          data-spot={spot ? "" : undefined}
          data-brushing={brush ? "" : undefined}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
          onClickCapture={onClickCapture}
          onClick={onBodyClick}
        >
          {hours.map((h) => (
            <span
              key={h}
              aria-hidden
              className={cn("wm-hour", h % 2 === 0 && "wm-hour-even")}
              style={{ top: `${pct(h * 60)}%` }}
            />
          ))}

          {MAP_WEEKDAYS.map((d, i) => {
            const end = ends?.[i] ?? null;
            const allDual = (end?.dual.length ?? 0) === 2;
            return (
              <div
                key={d}
                data-wm-column=""
                className="wm-column"
                style={{ gridColumn: i + 1 }}
              >
                {end && end.dual.length > 0 && (
                  <span
                    aria-hidden
                    className="wm-dual"
                    data-half={allDual ? undefined : ""}
                  />
                )}
                {lessons?.[i].map((block, j) => (
                  <Lesson
                    //* Sorszám szerinti kulcs: osztályváltáskor az első óra az
                    //* új nap első órájába ALAKUL át (hely és szín), nem tűnik
                    //* el és nő ki újra.
                    // biome-ignore lint/suspicious/noArrayIndexKey: a sorrend a kulcs — lásd fent
                    key={j}
                    block={block}
                    top={pct(block.startMin)}
                    height={pct(block.endMin) - pct(block.startMin)}
                    delay={
                      i * 55 + ((block.startMin - range.from) / span) * 160
                    }
                    dual={allDual}
                    hot={
                      hotLesson?.weekday === d && hotLesson.key === block.key
                    }
                  />
                ))}
                {clusters
                  .filter((c) => c.weekday === d)
                  .map((cluster) => (
                    <Cluster
                      key={cluster.id}
                      cluster={cluster}
                      top={pct(cluster.startMinute)}
                      height={pct(cluster.endMinute) - pct(cluster.startMinute)}
                      range={range}
                      fits={fits}
                      lit={lit}
                      view={view}
                      spot={spot}
                      pressed={sameWindow(timeWindow, {
                        days: [d],
                        from: cluster.startMinute,
                        to: cluster.endMinute,
                      })}
                      onPress={(pressed) =>
                        onTimeWindow(
                          pressed
                            ? null
                            : {
                                days: [d],
                                from: cluster.startMinute,
                                to: cluster.endMinute,
                              },
                        )
                      }
                      onEnter={enterMark}
                      onLeave={leaveMark}
                    />
                  ))}
                {d === today && <NowLine from={range.from} span={span} />}
              </div>
            );
          })}

          {view && (
            <WindowFrame
              window={view}
              live={brush !== null}
              top={pct(view.from)}
              bottom={pct(view.to)}
            />
          )}
        </div>
      </div>

      <MapHint />

      {tip && tipClub && (
        <div
          aria-hidden
          className="wm-tip"
          data-below={tip.below ? "" : undefined}
          style={{ left: tip.x, top: tip.y }}
        >
          <p
            className="flex items-start gap-1.5 font-semibold leading-snug text-foreground"
            style={accentStyle(tipClub.slug)}
          >
            <span className="acc-dot mt-[0.3rem] size-2 shrink-0 rounded-full" />
            <span className="min-w-0 text-pretty">{tipClub.name}</span>
          </p>
          <p className="mt-0.5 pl-3.5 tabular-nums text-muted-strong">
            {WEEKDAY_NAMES[tip.slot.weekday]}{" "}
            {formatMinute(tip.slot.startMinute)}–
            {formatMinute(tip.slot.endMinute)}
            {tipRoom && ` · ${tipRoom}`}
          </p>
          {tipFit && (
            <p className="mt-1 flex flex-wrap items-center gap-x-1.5 pl-3.5">
              <SlotVerdict fit={tipFit} />
              {tipNote && (
                <span className="tabular-nums text-muted-strong">
                  {tipNote}
                </span>
              )}
            </p>
          )}
        </div>
      )}
    </fieldset>
  );
}

//* A súgó második fele ugyanazt mondja, mint a szakkör lapjának vonalzója:
//* belefér — meddig tart előtte az órád; ütközik — mikor van az az óra.
function tipLine(
  fit: SlotFit | null,
  blocks: readonly LessonBlock[] | null,
  slot: PlacedSlot,
): string | null {
  if (!fit || !blocks) return null;
  if (fit.verdict === "fits") {
    const before = lastEndBefore(blocks, slot.startMinute);
    return before === null
      ? "aznap előtte nincs órád"
      : `előtte ${formatMinute(before)}-ig órád van`;
  }
  if (fit.verdict === "clash" && fit.lesson)
    return `${formatMinute(fit.lesson.startMin)}–${formatMinute(fit.lesson.endMin)}`;
  return null;
}

//! EGY ÓRA A TÉRKÉPEN: a rács kártyája kicsiben. Ugyanaz a mag, ugyanaz az
//! `acc-tint` (háttér és keret a tantárgy színéből), ugyanaz a paletta — és
//! nincs rajta felirat: a szín maga a név.
function Lesson({
  block,
  top,
  height,
  delay,
  dual,
  hot,
}: {
  block: LessonBlock;
  top: number;
  height: number;
  delay: number;
  dual: boolean;
  hot: boolean;
}) {
  const span = block.endMin - block.startMin;
  return (
    <span
      aria-hidden
      className="wm-lesson acc-tint border"
      data-dual={dual ? "" : undefined}
      data-hot={hot ? "" : undefined}
      style={
        {
          ...accentStyle(block.seed),
          top: `${top}%`,
          height: `${height}%`,
          "--l": block.lane,
          "--n": block.lanes,
          "--d": `${Math.round(delay)}ms`,
        } as CSSProperties
      }
    >
      {/*//* A dupla óra szünete csíkkal, mint a rács kártyáján. */}
      {block.breaks.map((gap) => (
        <span
          key={gap.startMin}
          className="wm-break acc-break"
          style={{
            top: `${((gap.startMin - block.startMin) / span) * 100}%`,
            height: `${((gap.endMin - gap.startMin) / span) * 100}%`,
          }}
        />
      ))}
    </span>
  );
}

//* ---------------------------------------------------------------------------
//* A NAP FEJLÉCE — egyben a nap szűrője
//* ---------------------------------------------------------------------------
function DayHead({
  weekday,
  end,
  today,
  pressed,
  onPress,
}: {
  weekday: number;
  end: DayEnd | null;
  today: boolean;
  pressed: boolean;
  onPress: (pressed: boolean) => void;
}) {
  //! A NAP ALATT NINCS SZÁM. Hogy meddig van órád, azt a színes órák alja
  //! mutatja; a súgó mondja ki percre, ha egy szakkörre mutatsz. A
  //! képernyőolvasó viszont hallja: neki a kép nem beszél.
  const heard =
    end === null
      ? ""
      : end.dual.length === 2
        ? " · duális nap"
        : end.lastEnd !== null
          ? ` · órád ${formatMinute(end.lastEnd)}-ig`
          : " · nincs órád";
  return (
    <button
      type="button"
      aria-pressed={pressed}
      aria-label={`Csak a ${DAY_ADJ[weekday]} szakkörök${heard}`}
      onClick={() => onPress(pressed)}
      className={cn(
        "flex min-w-0 flex-col items-start rounded-lg px-1.5 py-1 text-left transition-colors touch-target focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring motion-reduce:transition-none sm:px-2",
        pressed
          ? "bg-primary/15 text-foreground"
          : "hover:bg-hero-foreground/[0.07]",
      )}
    >
      <span className="flex max-w-full items-center gap-1 text-xs font-semibold text-foreground sm:text-[13px]">
        <span className="truncate sm:hidden">{DAY_SHORT[weekday]}</span>
        <span className="hidden truncate sm:inline">
          {WEEKDAY_NAMES[weekday]}
        </span>
        {/*//* Piros csak élő szerepben: a mai nap, mint a /ma hetén. */}
        {today && (
          <span
            className="size-1.5 shrink-0 rounded-full bg-brand"
            aria-hidden
          />
        )}
        {end && end.dual.length > 0 && (
          //* A duális nap jele: a táska, és ha csak az egyik héten, a betűje.
          <span className="inline-flex shrink-0 items-center gap-0.5 font-medium text-muted-strong">
            <Briefcase className="size-3" aria-hidden />
            {end.dual.length === 1 && end.dual[0]}
          </span>
        )}
      </span>
    </button>
  );
}

//* ---------------------------------------------------------------------------
//* A CSOMÓ — a koppintható egység
//* ---------------------------------------------------------------------------
function Cluster({
  cluster,
  top,
  height,
  range,
  fits,
  lit,
  view,
  spot,
  pressed,
  onPress,
  onEnter,
  onLeave,
}: {
  cluster: MapCluster;
  top: number;
  height: number;
  range: { from: number; to: number };
  fits: Map<string, FitInfo> | null;
  lit: ReadonlySet<string>;
  view: MapWindow | null;
  spot: string | null;
  pressed: boolean;
  onPress: (pressed: boolean) => void;
  onEnter: (e: PointerEvent<HTMLSpanElement>, slot: PlacedSlot) => void;
  onLeave: (e: PointerEvent<HTMLSpanElement>) => void;
}) {
  const span = cluster.endMinute - cluster.startMinute;
  const fitting = cluster.slots.filter(
    (s) => fits?.get(s.club)?.slots[s.index]?.verdict === "fits",
  ).length;
  const time = `${formatMinute(cluster.startMinute)}–${formatMinute(cluster.endMinute)}`;
  return (
    <button
      type="button"
      aria-pressed={pressed}
      aria-label={`${WEEKDAY_NAMES[cluster.weekday]} ${time}: ${cluster.slots.length} szakkör${
        fits ? `, ebből ${fitting} belefér` : ""
      }`}
      onClick={() => onPress(pressed)}
      className="wm-cluster"
      style={{ top: `${top}%`, height: `${height}%` }}
    >
      {cluster.slots.map((slot) => {
        const fit = fits?.get(slot.club)?.slots[slot.index];
        const inView = view === null || slotInWindow(slot, view);
        //! A HULLÁM A HÉT IRÁNYÁBAN FUT: hétfőtől péntekig, reggeltől
        //! délutánig, a csomón belül balról jobbra. Egyetlen, olvasható
        //! söprés — nem ötven egyszerre villanó pont.
        const delay =
          (slot.weekday - 1) * 55 +
          ((slot.startMinute - range.from) / (range.to - range.from)) * 180 +
          slot.lane * 24;
        return (
          <span
            key={`${slot.club}-${slot.index}`}
            className="wm-mark"
            data-v={verdictOf(fit)}
            data-dim={!lit.has(slot.club) || !inView ? "" : undefined}
            data-hot={spot === slot.club ? "" : undefined}
            onPointerEnter={(e) => onEnter(e, slot)}
            onPointerLeave={onLeave}
            style={
              {
                top: `${((slot.startMinute - cluster.startMinute) / span) * 100}%`,
                height: `${((slot.endMinute - slot.startMinute) / span) * 100}%`,
                "--l": slot.lane,
                "--n": slot.lanes,
                "--d": `${Math.round(delay)}ms`,
              } as CSSProperties
            }
          />
        );
      })}
    </button>
  );
}

//* ---------------------------------------------------------------------------
//* A KIJELÖLÉS KERETE
//* ---------------------------------------------------------------------------
function WindowFrame({
  window: w,
  live,
  top,
  bottom,
}: {
  window: MapWindow;
  live: boolean;
  top: number;
  bottom: number;
}) {
  const first = Math.min(...w.days);
  const count = Math.max(...w.days) - first + 1;
  return (
    <span
      aria-hidden
      className="wm-window"
      data-live={live ? "" : undefined}
      style={
        {
          "--c0": first - 1,
          "--cn": count,
          top: `${top}%`,
          height: `${Math.max(bottom - top, 1.5)}%`,
        } as CSSProperties
      }
    >
      {live && <span className="wm-window-label">{windowLabel(w)}</span>}
    </span>
  );
}

//! A MOST VONALA. Piros, mint a `/ma` szalagján: élő szerep. Csak ez az egy
//! elem iratkozik fel a másodperces ütemre — a térkép többi része nem
//! rajzolódik újra tőle.
function NowLine({ from, span }: { from: number; span: number }) {
  const clock = useClock();
  if (!clock || clock.min < from || clock.min > from + span) return null;
  return (
    <span
      aria-hidden
      className="wm-now"
      style={{ top: `${((clock.min - from) / span) * 100}%` }}
    />
  );
}

//* Nem jelmagyarázat — a színek a rácséi, a jelek a sávéi, ezeket a diák már
//* ismeri. Egyetlen dolgot kell elmondani: hogy a térképre rá lehet bökni.
function MapHint() {
  return (
    <p className="mt-2.5 text-xs text-muted-strong" aria-hidden>
      <span className="wm-hint-fine">
        Kattints egy napra vagy egy csomóra, vagy húzz ki egy időt — a lista
        arra szűkül.
      </span>
      <span className="wm-hint-coarse">
        Koppints egy napra vagy egy csomóra — a lista arra szűkül.
      </span>
    </p>
  );
}
