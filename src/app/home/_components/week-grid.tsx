import { EventCard } from "@/components/timetable/lesson-block";
import { minLabel } from "@/components/timetable/shared";
import {
  AXIS_W,
  BOARD_H,
  BOARD_W,
  BODY_H,
  COL_GAP,
  COL_W,
  colLeft,
  DAYS,
  DUAL_BLOCKS,
  HEADER_H,
  heightOf,
  type Lesson,
  MONDAY,
  NOW_EVENT,
  NOW_MIN,
  PERIODS,
  type Slot,
  TUESDAY,
  topOf,
} from "./week";

//! EZ A LAP EGYETLEN RÁCSA. Nem illusztráció a rácsról: ugyanaz az `EventCard`
//! rajzolja, ami az `/orarend`-en is, ugyanabból az adatalakból
//! (`CalendarEvent`), ugyanazzal a tantárgyszínnel, és a Jedlikinfo VALÓDI
//! 13A-hetéből (lásd `week.ts`). A nyitólap ezért nem ígéri a terméket, hanem
//! MUTATJA — a kamera (lásd `film.tsx`) csak közelebb megy hozzá.
//*
//! A RÁCS NEM OLVASHATÓ FEL. A `film.tsx` `inert`-tel zárja ki: minta-adat,
//! ami képernyőolvasónak a diák saját órarendjének hangzana. A mondanivalót a
//! szakaszok SZÖVEGE hordozza, nem ez a tábla.

function Card({ event }: { event: Lesson }) {
  const height = heightOf(event.startMin, event.endMin);
  return <EventCard event={event} style={{ inset: 0, height }} roomFirst />;
}

//! A BONTOTT SÁV KÉT FÉL OSZLOP — ÉS EZ AZ ALAPÁLLAPOT. A `--cam-split` a
//! döntés pillanata: a diák csoportjának órája kinyílik a teljes sávra, a
//! másiké visszahúzódik. Nem animáció a csoportbontásról, hanem maga a
//! csoportbontás, ugyanazon a rácson, amit az `/orarend` is rajzol.
function SlotCells({ slot }: { slot: Slot }) {
  if ("whole" in slot) {
    const e = slot.whole;
    return (
      <div
        className="absolute inset-x-0"
        style={{
          top: topOf(e.startMin),
          height: heightOf(e.startMin, e.endMin),
        }}
      >
        <Card event={e} />
      </div>
    );
  }
  const top = topOf(slot.a.startMin);
  const height = heightOf(slot.a.startMin, slot.a.endMin);
  return (
    <>
      <div className="wg-half-other absolute" style={{ top, height }}>
        <Card event={slot.b} />
      </div>
      <div className="wg-half-mine absolute" style={{ top, height }}>
        <Card event={slot.a} />
      </div>
    </>
  );
}

function DayColumnCells({
  index,
  slots,
}: {
  index: number;
  slots: readonly Slot[];
}) {
  return (
    <div
      className="absolute top-0"
      style={{ left: colLeft(index), width: COL_W, height: BOARD_H }}
    >
      {slots.map((slot) => (
        <SlotCells
          key={"whole" in slot ? slot.whole.id : slot.a.id}
          slot={slot}
        />
      ))}
    </div>
  );
}

export function WeekGrid() {
  return (
    <div className="relative" style={{ width: BOARD_W, height: BOARD_H }}>
      {/*//! A RÁCS LEMEZE. Az `EventCard` színei az alkalmazás SÖTÉT felületére
          //! vannak hangolva (`.dark .acc-tint-strong`); a nyitókép meleg
          //! papírján ugyanezek a kártyák sárosnak látszanának. A tábla ezért
          //! a saját `bg-card` lemezén ül — pontosan azon, amin az `/orarend`
          //! rácsa is —, és papíron egy készülék kijelzőjeként olvasódik. Ahogy
          //! a film alapja is erre a felületre vált, a lemez beleolvad: onnantól
          //! nem tábla a lapon, hanem maga a lap.
          //* A negatív `inset` szándékos: a lemez NEM nyúlik bele a tábla
          //* koordináta-rendszerébe, így a kameraállások képpontjai érvényben
          //* maradnak. */}
      <div className="absolute -inset-5 rounded-[20px] border border-white/10 bg-card shadow-[0_50px_90px_-45px_oklch(0_0_0/0.55),0_12px_30px_-16px_oklch(0_0_0/0.45)]" />

      {/*//* Az óravonalak. Nem dísz: a rács ettől lesz idő-arányos felület, nem
          //* kártyák halmaza — a duális blokk magassága csak ezekhez képest
          //* mond bármit. */}
      <div
        className="wg-detail absolute inset-x-0"
        style={{ top: HEADER_H, height: BODY_H }}
      >
        {PERIODS.map((p) => (
          <div
            key={p.n}
            className="absolute inset-x-0 h-px bg-white/10"
            style={{ top: topOf(p.start) - HEADER_H }}
          />
        ))}
      </div>

      {/*//* Az idősáv. A sorszám a nagy nézeté, az időpont a közelié — a
          //* `--cam-detail` mindkettőt együtt hozza be. */}
      <div
        className="wg-detail absolute left-0"
        style={{ top: HEADER_H, width: AXIS_W, height: BODY_H }}
      >
        {PERIODS.map((p) => (
          <div
            key={p.n}
            className="absolute right-2.5 flex flex-col items-end leading-none"
            style={{ top: topOf(p.start) - HEADER_H + 2 }}
          >
            <span className="text-[13px] font-semibold tabular-nums text-white/75">
              {p.n}
            </span>
            <span className="mt-1 text-[10px] font-medium tabular-nums text-white/50">
              {minLabel(p.start)}
            </span>
          </div>
        ))}
      </div>

      {/*//* A napfejek. A duális nap jelölése a fejlécben áll, nem a blokkon:
          //* a hét ATTÓL olvasható, hogy a két rend egymás mellett látszik. */}
      {DAYS.map((day) => (
        <div
          key={day.index}
          className="wg-detail absolute top-0 flex items-baseline justify-between gap-2 border-b border-white/14 pb-2"
          style={{ left: colLeft(day.index), width: COL_W }}
        >
          <span className="text-[13px] font-semibold tracking-[-0.01em] text-white/90">
            {day.name}
          </span>
          <span
            className={
              day.dual
                ? "rounded-[4px] bg-white/14 px-1.5 py-px text-[10px] font-semibold text-white/85"
                : "text-[10px] font-semibold text-white/50"
            }
          >
            {day.dual ? "duális" : "iskola"}
          </span>
        </div>
      ))}

      <DayColumnCells index={0} slots={MONDAY} />
      <DayColumnCells index={1} slots={TUESDAY} />

      {DUAL_BLOCKS.map((event, i) => (
        <div
          key={event.id}
          className="absolute top-0"
          style={{ left: colLeft(i + 2), width: COL_W, height: BOARD_H }}
        >
          <div
            className="absolute inset-x-0"
            style={{
              top: topOf(event.startMin),
              height: heightOf(event.startMin, event.endMin),
            }}
          >
            <Card event={event} />
          </div>
        </div>
      ))}

      {/*//! A „MOST" JELZÉS A KÁRTYÁK FÖLÉ KERÜL. A bontott sáv nyertes fele
          //! `z-index: 2`-t visel (különben a másik fél takarná ki a
          //! szélesedés közben) — és a z-index a DOM-sorrendet felülírja: a
          //! vonal hiába állt később a forrásban, a kártya MÖGÉ került, és
          //! pontosan ott tűnt el, ahol dolga lett volna. A gyűrű túlélte,
          //! mert az a kártya peremén kívülre rajzolódik.
          //* A `z-[5]` ugyanaz az érték, amit a rács is ad a futó órának
          //* (`ACTIVE_TONE`, lásd `lesson-block.tsx`). */}
      <div
        className="wg-now-ring pointer-events-none absolute z-[5] rounded-[9px] ring-2 ring-brand/60"
        style={{
          top: topOf(NOW_EVENT.startMin) - 3,
          height: heightOf(NOW_EVENT.startMin, NOW_EVENT.endMin) + 6,
          left: colLeft(0) - 3,
          width: COL_W + 6,
        }}
      />

      {/*//! A „MOST" VONAL SZÖVEG NÉLKÜL. A pirula az idősávban pont a
          //! sorszámra ült rá, és a szót amúgy is kimondja mellette a szakasz
          //! kiírása („Most: …"). Marad, amit a rács is húz a mai napon: egy
          //! hajszálvékony márkaszínű vonal az aktuális percnél, az idősávban
          //! egy ponttal. */}
      <div
        className="wg-now-line pointer-events-none absolute z-[5] flex items-center gap-1.5"
        style={{
          top: topOf(NOW_MIN),
          left: AXIS_W - 14,
          width: COL_W + 14,
        }}
      >
        <span className="size-1.5 shrink-0 rounded-full bg-brand" />
        <span className="h-px flex-1 bg-brand" />
      </div>

      {/*//* A rács jobb pereme — a heti nézetben ez zárja le a táblát. */}
      <div
        className="wg-detail absolute top-0 w-px bg-white/12"
        style={{ left: colLeft(4) + COL_W + COL_GAP / 2, height: BOARD_H }}
      />
    </div>
  );
}
