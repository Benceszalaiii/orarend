"use client";

import { CalendarDays, CornerDownRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { accentStyle } from "@/lib/accent";
import { cn } from "@/lib/utils";
import { DrainBar } from "./drain-bar";
import {
  type AgendaItem,
  countdownLabel,
  type NowState,
  nowState,
  spanFraction,
} from "./now";
import { addDaysKey, minLabel, rangeLabel, todayKey } from "./shared";
import { useClock, useVisibilityEpoch } from "./use-clock";

//* ---------------------------------------------------------------------------
//* „Most" sáv — a lap egyetlen sora, ami a diák tényleges kérdésére felel
//* ---------------------------------------------------------------------------
//! Ezért nyit meg valaki egy órarendet délben: „mi megy most, mennyi van még
//! belőle, mi jön utána". A rács ezt is elmondja, de KERESNI kell benne. Ez a sáv
//! ODAADJA — és cserébe csak annyi magasságot kér, amennyit a lap fejlécének
//! összevonásával nyertünk.
//*
//* SZIGORÚAN a teljes nézeté (`/orarend`): az `/event` beágyazott rácsa ezt nem
//* rendereli (ott a kártya körüli dashboard mondja el ugyanezt).
//!
//! KLIENS-OLDALI ÁLLAPOT. A pillanat a látogató órájából jön, ezért a sáv a
//! szerver-HTML-ben ÜRESEN, de TELJES MAGASSÁGGAL renderel — így hidratáláskor
//! nincs elugró elrendezés, és nincs hidratálási eltérés sem.

export function NowRail({
  today,
  later,
  inCurrentWeek,
  onToday,
  onOpen,
  className,
}: {
  //* A MAI nap elemei (tanóra + szakkör-alkalom, feloldás után).
  today: AgendaItem[];
  //* A hét további napjainak elemei — a „mára vége" ág mutat rájuk.
  later: AgendaItem[];
  //* A betöltött hét tartalmazza-e a mai napot.
  inCurrentWeek: boolean;
  onToday: () => void;
  //* A futó elem kártyájának megnyitása a részletlapon.
  onOpen?: (key: string) => void;
  className?: string;
}) {
  const clock = useClock();
  const state: NowState | null =
    clock && inCurrentWeek ? nowState(today, later, clock.min) : null;
  const span = state && "span" in state ? state.span : null;
  const epoch = useVisibilityEpoch();

  //! MINDEN ÁG UGYANAZT A MAGASSÁGOT KAPJA. A sáv a rács fölött ül: ha a
  //! tartalma magasságot váltana (mert becsengettek), alatta ugrana az egész
  //! rács — pont a lapozás közben.
  //! ALACSONY ABLAK (fekvő telefon: ~390 px). Ott a magasság a szűkös
  //! erőforrás, nem a szélesség: ez az 56 px a rács hetedének felel meg. A sáv
  //! ezért összehúzódik — de nem tűnik el, mert pont fekvésben, óra közben
  //! nézik meg, hogy mennyi van hátra.
  const shell = cn(
    "relative flex h-13 shrink-0 items-center gap-2.5 overflow-hidden border-b border-border bg-card px-3 sm:h-14 sm:gap-3 sm:px-4",
    "[@media(max-height:480px)]:h-11 [@media(max-height:480px)]:gap-2",
    className,
  );

  //* Másik hetet nézünk: a „most" itt hazugság lenne — helyette az út vissza.
  if (!inCurrentWeek) {
    return (
      <div className={shell}>
        <CalendarDays
          className="size-4 shrink-0 text-muted-foreground"
          aria-hidden
        />
        <p className="min-w-0 flex-1 truncate text-[13px] text-muted-strong">
          Egy másik hetet nézel — a „most" jelzés a mai hétre vonatkozik.
        </p>
        <Button
          size="sm"
          variant="outline"
          className="h-8 shrink-0 rounded-full px-3 text-xs"
          onClick={onToday}
        >
          Mai hét
        </Button>
      </div>
    );
  }

  //* Szerver-oldali / hidratálás előtti állapot: helyet tartunk, nem találunk ki
  //* időpontot.
  if (!state) {
    return <div className={shell} aria-hidden />;
  }

  if (state.phase === "empty") {
    return (
      <div className={shell}>
        <CalendarDays
          className="size-4 shrink-0 text-muted-foreground"
          aria-hidden
        />
        <p className="min-w-0 flex-1 truncate text-[13px] text-muted-strong">
          Mára nincs órád — és a héten sincs több.
        </p>
      </div>
    );
  }

  const primary = state.phase === "lesson" ? state.current : state.next;
  const remainingSec =
    span && clock ? Math.max(0, span.toMin * 60 - clock.sec) : 0;
  const countdown = countdownLabel(remainingSec);

  const badge =
    state.phase === "lesson"
      ? { label: "Most", live: true }
      : state.phase === "break"
        ? { label: "Szünet", live: true }
        : state.phase === "before"
          ? { label: "Ma", live: false }
          : {
              label:
                state.phase === "done" && state.dayEmpty
                  ? "Ma szabad"
                  : "Mára vége",
              live: false,
            };

  //* A „mára vége" ág másik NAPRA mutat — ott a nap neve kell, nem a hátralévő idő.
  const nextDayLabel =
    state.phase === "done" && state.next
      ? state.next.dateKey === addDaysKey(todayKey(), 1)
        ? "Holnap"
        : state.next.dayName
      : null;

  return (
    <div className={shell}>
      <span
        className={cn(
          "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
          badge.live
            ? "bg-brand/12 text-foreground"
            : "bg-muted text-muted-strong",
        )}
      >
        {badge.live && (
          //* Ugyanaz a nyelv, mint a rács „most" vonalán: élő = piros pötty.
          <span className="relative flex size-1.5" aria-hidden>
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-brand/60 motion-reduce:animate-none" />
            <span className="relative inline-flex size-1.5 rounded-full bg-brand" />
          </span>
        )}
        {badge.label}
      </span>

      {/* Fő blokk: mi megy / mi jön */}
      {primary ? (
        <PrimaryBlock
          item={primary}
          //* Szünetben és becsengetés előtt a KÖVETKEZŐ elemet mutatjuk.
          upcoming={state.phase !== "lesson"}
          dayPrefix={nextDayLabel}
          onOpen={
            state.phase === "lesson" && onOpen
              ? () => onOpen(primary.key)
              : undefined
          }
        />
      ) : (
        <p className="min-w-0 flex-1 truncate text-[13px] text-muted-strong">
          A héten nincs több órád.
        </p>
      )}

      {/* „Utána" — csak ha van hely rá */}
      {state.phase === "lesson" && state.next && (
        <span className="hidden min-w-0 max-w-[15rem] shrink items-center gap-1.5 truncate text-xs text-muted-strong lg:flex">
          <CornerDownRight className="size-3 shrink-0" aria-hidden />
          Utána{" "}
          <span className="truncate font-medium text-foreground">
            {state.next.title}
          </span>
          <time
            className="shrink-0 tabular-nums"
            dateTime={minLabel(state.next.startMin)}
          >
            {minLabel(state.next.startMin)}
          </time>
        </span>
      )}

      {/* Visszaszámláló — a sáv egyetlen nagy száma */}
      {state.phase !== "done" && span && (
        <div className="ml-auto shrink-0 text-right leading-none">
          <div className="text-[17px] font-bold tabular-nums text-foreground sm:text-lg">
            {countdown.value}
            {countdown.unit && (
              <span className="ml-1 text-[11px] font-medium text-muted-strong">
                {countdown.unit}
              </span>
            )}
          </div>
          <div className="mt-1 text-[10px] font-medium uppercase tracking-wide text-muted-strong">
            {state.phase === "lesson" ? "van hátra" : "múlva kezdődik"}
          </div>
        </div>
      )}

      {/* Haladás-sáv: a szakasz eltelt része, valós időben */}
      {span && span.toMin > span.fromMin && primary && clock && (
        <DrainBar
          //! ÚJ SZAKASZ = ÚJ ELEM. Egy már futó animáció fázisát nem lehet
          //! visszaállítani, csak újraindítani: `key` nélkül a becsengetés utáni
          //! sáv a lap megnyitása óta eltelt időt is beleszámolná.
          key={`${epoch}-${span.fromMin}-${span.toMin}`}
          span={span}
          fraction={spanFraction(span, clock.min)}
          accentSeed={primary.accentSeed}
        />
      )}
    </div>
  );
}

function PrimaryBlock({
  item,
  upcoming,
  dayPrefix,
  onOpen,
}: {
  item: AgendaItem;
  upcoming: boolean;
  dayPrefix: string | null;
  onOpen?: () => void;
}) {
  const body = (
    <>
      <span className="flex min-w-0 items-center gap-1.5">
        <span
          className="size-1.5 shrink-0 rounded-full acc-dot"
          style={accentStyle(item.accentSeed)}
          aria-hidden
        />
        <span className="truncate text-[15px] font-semibold leading-tight text-foreground">
          {item.fullTitle}
        </span>
      </span>
      <span className="mt-0.5 flex min-w-0 items-baseline gap-1.5 truncate text-[11px] leading-tight text-muted-strong">
        {dayPrefix && (
          <span className="font-medium text-foreground/75">{dayPrefix}</span>
        )}
        <time dateTime={minLabel(item.startMin)} className="tabular-nums">
          {rangeLabel(item.startMin, item.endMin)}
        </time>
        {item.meta.length > 0 && <span aria-hidden>·</span>}
        <span className="truncate">{item.meta.join(" · ")}</span>
      </span>
    </>
  );

  const label = `${upcoming ? "Következő" : "Most"}: ${item.fullTitle}, ${rangeLabel(item.startMin, item.endMin)}`;

  if (!onOpen) {
    return (
      <p className="flex min-w-0 flex-1 flex-col">
        <span className="sr-only">{label}</span>
        {body}
      </p>
    );
  }
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`${label} — részletek`}
      className="-mx-1 flex min-w-0 flex-1 flex-col rounded-lg px-1 py-0.5 text-left transition-colors hover:bg-muted/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none"
    >
      {body}
    </button>
  );
}
