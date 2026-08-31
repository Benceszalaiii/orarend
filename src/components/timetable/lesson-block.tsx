"use client";

import { MapPin, Sparkles } from "lucide-react";
import { motion } from "motion/react";
import { accentStyle } from "@/lib/accent";
import type { LessonRun } from "@/lib/timetable-merge";
import { cn } from "@/lib/utils";
import { MergedBadge } from "./merge-controls";
import { CELL_RADIUS, durationLabel, minLabel, rangeLabel } from "./shared";

export type CalendarEvent = {
  id: string;
  title: string;
  dayOfWeek: number;
  startMin: number;
  endMin: number;
  room: string;
  szakkorName: string;
  szakkorSlug: string;
  kozossegi: boolean;
  cancelled: boolean;
};

//* ---------------------------------------------------------------------------
//* Egy blokk a rácson — egy óra vagy egy összefűzött többórás sáv
//* ---------------------------------------------------------------------------
//! A magasság IDŐARÁNYOS, ezért a kártya tartalma három sűrűség-fokozatban él.
//! A tantárgy és az IDŐPONT minden fokozatban látszik: az időpont az az adat,
//! amiért a diák egyáltalán ránéz az órarendre.

const DENSE_FULL = 56; //* fölötte: tantárgy + idő + terem/tanár
const DENSE_TIME = 34; //* fölötte: tantárgy + idő külön sorban

//! IDŐ-MORFOLÓGIA (csak a teljes nézet, `/orarend`).
//! A rács eddig időtlen volt: a 07:10 ugyanúgy nézett ki délután fél háromkor is.
//! Két állapot hozza vissza az időt — és MINDKETTŐ redundáns jelzés, nem csak
//! szín: a lefutott óra HALVÁNYABB (a „most" vonal fölött van), a futó órán
//! GYŰRŰ van (és ugyanaz az elem szerepel a „most" sávban is).
const PAST_TONE = "opacity-45 saturate-[0.55]";
const ACTIVE_TONE = "z-[5] ring-2 ring-brand/45 shadow-sm";

//! A TEREM ELSŐ OSZTÁLYÚ ADAT. Telefonon az órarendet nem „olvassák", hanem
//! MEGNÉZIK: hova kell menni. A terem eddig csak a legmagasabb sűrűség-fokozaton
//! látszott (a tanárral egy sorban, halványan) — vagyis épp a szűk kijelzőn
//! esett ki elsőként. Mostantól a tantárgy mellett áll, saját jelvényen, MINDEN
//! fokozaton.
//* Csak a teljes nézeté (`roomFirst`): az /event beágyazott kártyája változatlan.
function RoomChip({ rooms, compact }: { rooms: string[]; compact: boolean }) {
  if (rooms.length === 0) return null;
  //! TEREMVÁLTÁS A BLOKKON BELÜL. A dupla óra egy kártya; ha közben termet vált
  //! az osztály, azt eddig SEMMI nem mondta meg — a kártya az első termet írta
  //! ki, a diák meg a másodikban keresett volna. A nyíl és a márkaszínű keret
  //! ezért nem dísz: ez a kártya egyetlen figyelmeztetése.
  const moved = rooms.length > 1;
  return (
    <span
      title={
        moved
          ? `Teremváltás a blokkon belül: ${rooms.join(" → ")}`
          : `Terem: ${rooms[0]}`
      }
      className={cn(
        "shrink-0 rounded-[4px] px-1 py-px font-bold leading-tight tabular-nums",
        compact ? "text-[10px]" : "text-[11px]",
        moved
          ? "border border-brand/55 bg-brand/12 text-foreground"
          : "bg-foreground/[0.08] text-foreground dark:bg-foreground/15",
      )}
    >
      {moved ? rooms.join("→") : rooms[0]}
    </span>
  );
}

export function LessonBlock({
  run,
  style,
  pxPerMin,
  reduce,
  muted = false,
  past = false,
  active = false,
  roomFirst = false,
  onHoverChange,
  onUndoMerge,
  onOpen,
  registerCard,
}: {
  run: LessonRun;
  style: React.CSSProperties;
  pxPerMin: number;
  //* `prefers-reduced-motion`: az összevonás azonnal átrendez, nem animál.
  reduce: boolean;
  muted?: boolean;
  //* Már véget ért (csak a mai napon értelmes).
  past?: boolean;
  //* Épp ez fut — ugyanez az elem áll a „most" sávban is.
  active?: boolean;
  //* A terem a tantárgy mellé kerül, minden sűrűség-fokozaton (teljes nézet).
  roomFirst?: boolean;
  onHoverChange?: (subject: string, hovering: boolean) => void;
  onUndoMerge: (identities: string[]) => void;
  //* Teljes nézetben a kártya megnyitja a részletlapot. Beágyazva nincs átadva,
  //* így a kártya pontosan a régi, nem interaktív elem marad.
  onOpen?: () => void;
  //* A morf-átmenethez kell a valódi DOM-elem (lásd view-transition.ts).
  registerCard?: (el: HTMLElement | null) => void;
}) {
  const height = (style.height as number) ?? 0;
  const density =
    height >= DENSE_FULL ? "full" : height >= DENSE_TIME ? "time" : "tight";
  const { lesson } = run;
  const subjectKey = lesson.subjectShort || lesson.subject;
  const rooms = run.rooms.join(" · ");
  const roomList = run.rooms.filter(Boolean);
  const span = rangeLabel(run.startMin, run.endMin);
  const lessonCount = run.lessonCount;

  const title = [
    lesson.subject,
    span,
    lessonCount > 1 ? `${lessonCount} egymást követő óra` : null,
    lesson.teacher || null,
    rooms || null,
  ]
    .filter(Boolean)
    .join(" — ");

  return (
    //! ÁLLAPOTVÁLTÁS (lásd DESIGN.md). Két külön eszköz, szándékosan:
    //!  • a VESZTES kártya kifutását `AnimatePresence` + `exit` adja — ezt CSS
    //!    nem tudja, mert a React már kivette volna a DOM-ból;
    //!  • a NYERTES kártya szélesedését CSS-átmenet, NEM a Motion `layout`-ja.
    //!    A `layout` skálázással animál, ami 180 ms-ig szétnyomná a feliratot;
    //!    a `layout="position"` viszont a szélességet meg sem mozdítaná. Itt a
    //!    `width`/`left` animálása indokolt: abszolút pozicionált elem, az
    //!    újratördelés a naposzlopon belül marad.
    //! A BELÉPÉST egyik sem adja: nincs `initial`, így a szerver-HTML-ben és JS
    //! nélkül is látszik a rács.
    //* A hover-kiemelés dekoratív, egér-only: a szín redundáns, a tantárgy neve
    //* mindig látszik, ezért nem kell billentyű-elérhetőség/role.
    <motion.div
      ref={registerCard}
      layout={false}
      initial={false}
      exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.97 }}
      transition={{ duration: reduce ? 0 : 0.18, ease: [0.22, 1, 0.36, 1] }}
      onMouseEnter={() => onHoverChange?.(subjectKey, true)}
      onMouseLeave={() => onHoverChange?.(subjectKey, false)}
      style={{ ...style, ...accentStyle(subjectKey) }}
      title={title}
      className={cn(
        "group absolute overflow-hidden border acc-tint text-left shadow-xs hover:shadow-sm",
        "transition-[width,left,opacity,filter,box-shadow] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
        CELL_RADIUS,
        //! Egy tónus egyszerre: a hover-tompítás a felhasználó AKTUÁLIS
        //! szándéka, ezért erősebb, mint az „ez már elmúlt" jelzés.
        muted ? "opacity-35 grayscale-[.5]" : past && PAST_TONE,
        active && ACTIVE_TONE,
      )}
    >
      {/* SZÜNET-SÁVOK: a többórás blokk nem hazudik egybefüggő órát. */}
      {run.breaks.map((gap) => {
        const top = (gap.startMin - run.startMin) * pxPerMin - 1.5;
        const gapHeight = (gap.endMin - gap.startMin) * pxPerMin;
        //* A pár perces sávot is látni kell — legalább 4 px.
        return (
          <div
            key={`${gap.startMin}-${gap.endMin}`}
            className="pointer-events-none absolute inset-x-0 acc-break"
            style={{ top, height: Math.max(gapHeight, 4) }}
            aria-hidden
          />
        );
      })}

      {/*//! A megnyitó gomb a kártya EGÉSZ felületét lefedi, de a DOM-ban külön
          //! elem: a kártyán belül van egy másik gomb is (az összevonás-jelvény),
          //! és gomb a gombban érvénytelen. A tartalom ezért `pointer-events-none`,
          //! a jelvény pedig visszakapcsolja magának. */}
      {onOpen && (
        <button
          type="button"
          onClick={onOpen}
          aria-label={`${title} — részletek`}
          className={cn(
            "absolute inset-0 cursor-pointer focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
            CELL_RADIUS,
          )}
        />
      )}

      <div
        className={cn(
          "relative flex h-full flex-col px-1.5 py-1",
          onOpen && "pointer-events-none",
        )}
      >
        <div className="flex items-start gap-1">
          <span className="min-w-0 flex-1 truncate text-[13px] font-semibold leading-tight text-foreground">
            {lesson.subjectShort || lesson.subject}
          </span>
          {roomFirst && (
            <RoomChip rooms={roomList} compact={density !== "full"} />
          )}
          {density === "tight" && (
            <time
              className="shrink-0 text-[10px] font-medium leading-tight tabular-nums text-foreground/65"
              dateTime={minLabel(run.startMin)}
            >
              {minLabel(run.startMin)}
            </time>
          )}
          <span className={cn(onOpen && "pointer-events-auto")}>
            <MergedBadge
              hidden={run.hidden}
              onUndo={onUndoMerge}
              compact={density !== "full"}
            />
          </span>
        </div>

        {density !== "tight" && (
          <time
            className="mt-px block text-[10.5px] font-medium leading-tight tabular-nums text-foreground/65"
            dateTime={minLabel(run.startMin)}
            title={durationLabel(run.endMin - run.startMin)}
          >
            {span}
            {lessonCount > 1 && (
              <span className="ml-1 font-normal tabular-nums text-foreground/55">
                ×{lessonCount}
              </span>
            )}
          </time>
        )}

        {density === "full" && (rooms || lesson.teacherShort) && (
          <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[11px] leading-tight text-muted-strong">
            {/*//* Teljes nézetben a terem már a tantárgy mellett áll — itt csak
                //* ismételné. Beágyazva marad a régi sor. */}
            {rooms && !roomFirst && (
              <span className="font-medium text-foreground/70">{rooms}</span>
            )}
            {lesson.teacherShort && <span>{lesson.teacherShort}</span>}
          </div>
        )}
      </div>
    </motion.div>
  );
}

export function EventCard({
  event,
  style,
  past = false,
  active = false,
  roomFirst = false,
  onOpen,
  registerCard,
}: {
  event: CalendarEvent;
  style: React.CSSProperties;
  past?: boolean;
  active?: boolean;
  roomFirst?: boolean;
  onOpen?: () => void;
  registerCard?: (el: HTMLElement | null) => void;
}) {
  const height = (style.height as number) ?? 0;
  const compact = height < DENSE_FULL;
  const span = rangeLabel(event.startMin, event.endMin);

  const cardStyle = event.cancelled
    ? style
    : { ...style, ...accentStyle(event.szakkorSlug) };
  const title = `${event.title} — ${event.szakkorName} — ${span}${
    event.room ? ` (${event.room})` : ""
  }`;
  const className = cn(
    "group absolute flex flex-col overflow-hidden border px-1.5 py-1 text-left shadow-xs transition-[transform,box-shadow,opacity,filter] hover:-translate-y-px hover:shadow-sm focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring motion-reduce:transition-none motion-reduce:hover:translate-y-0",
    CELL_RADIUS,
    event.cancelled
      ? "border-destructive/40 bg-destructive/10 text-destructive line-through"
      : "acc-tint-strong text-foreground",
    past && PAST_TONE,
    active && ACTIVE_TONE,
  );

  const body = (
    <>
      <div className="flex items-center gap-1.5 text-[13px] font-semibold leading-tight">
        <span
          className={cn(
            "size-1.5 shrink-0 rounded-full",
            event.cancelled ? "bg-destructive" : "acc-dot",
          )}
          aria-hidden
        />
        <span className="min-w-0 flex-1 truncate">{event.title}</span>
        {roomFirst && event.room && (
          <RoomChip rooms={[event.room]} compact={compact} />
        )}
      </div>
      <time
        className="mt-px block text-[10.5px] font-medium leading-tight tabular-nums text-foreground/65"
        dateTime={minLabel(event.startMin)}
      >
        {span}
      </time>
      {!compact && (
        <div className="mt-0.5 flex items-center gap-1 truncate text-[11px] leading-tight text-muted-strong">
          {event.kozossegi && !event.cancelled && (
            <Sparkles className="size-2.5 shrink-0 text-brand" aria-hidden />
          )}
          {event.room && !roomFirst && (
            <>
              <MapPin className="size-2.5 shrink-0" aria-hidden />
              <span>{event.room}</span>
              <span aria-hidden>·</span>
            </>
          )}
          <span className="truncate">{event.szakkorName}</span>
        </div>
      )}
    </>
  );

  return (
    <button
      type="button"
      ref={registerCard}
      onClick={onOpen}
      style={cardStyle}
      title={title}
      aria-label={`${title} — részletek`}
      className={cn(className, "cursor-pointer")}
    >
      {body}
    </button>
  );
}
