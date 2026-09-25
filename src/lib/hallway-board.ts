import type { ClubSession } from "./club-schedule";
import { addDays } from "./timetable";

//! ═══════════════════════════════════════════════════════════════════════════
//! FOLYOSÓI KIJELZŐ (`/tabla`) — MELYIK NAP, MELYIK ALKALOM
//! ═══════════════════════════════════════════════════════════════════════════
//! A kijelző annak szól, aki SOHA nem nyitja meg az alkalmazást: elmegy a
//! képernyő előtt, és egy pillantásból tudnia kell, mi lesz ma délután és hol.
//! Ezért nem a hetet mutatja, hanem EGY napot — a mait, amíg van még mit
//! mondani róla, utána a következő tanítási napot.
//!
//! TISZTA FÜGGVÉNYEK: a „most" paraméter, nem `Date.now()`.
//! ═══════════════════════════════════════════════════════════════════════════

const WEEKDAY_ON = [
  "",
  "Hétfőn",
  "Kedden",
  "Szerdán",
  "Csütörtökön",
  "Pénteken",
];

/** ISO hét napja (1 = hétfő … 7 = vasárnap) egy `YYYY-MM-DD` napra. */
export function isoWeekday(dayKey: string): number {
  const day = new Date(`${dayKey}T00:00:00Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

/** A következő hétköznap `dayKey` UTÁN (a mai nem számít). */
export function nextWeekday(dayKey: string): string {
  let next = addDays(dayKey, 1);
  while (isoWeekday(next) > 5) next = addDays(next, 1);
  return next;
}

//! A FELIRAT A DIÁK NYELVÉN: „Ma", „Holnap", „Hétfőn" — nem dátum. A dátum
//! mellette áll kisebben, annak, aki pontosan tudni akarja.
export function dayLabel(target: string, today: string): string {
  if (target === today) return "Ma";
  if (target === addDays(today, 1)) return "Holnap";
  return WEEKDAY_ON[isoWeekday(target)] ?? target;
}

export type BoardPhase = "now" | "next" | "later";

export type BoardSession = ClubSession & { phase: BoardPhase };

//! MI VAN MÉG HÁTRA A NAPBÓL. A lezajlott alkalom nem hír a folyosón — kiesik.
//! A futó elöl („Most"), utána a legközelebbi kezdés(ek) („Következik": ami a
//! legkorábbi még el nem kezdett időpontban indul), majd a többi. A mai napon
//! kívül (`nowMin === null`) minden „later".
export function boardSessions(
  sessions: readonly ClubSession[],
  dayKey: string,
  nowMin: number | null,
): BoardSession[] {
  const today = sessions
    .filter((s) => s.dateKey === dayKey)
    .filter((s) => nowMin === null || s.endMin > nowMin)
    .sort(
      (a, b) =>
        a.startMin - b.startMin || a.clubName.localeCompare(b.clubName, "hu"),
    );
  const nextStart =
    nowMin === null
      ? null
      : (today.find((s) => s.startMin > nowMin)?.startMin ?? null);
  return today.map((s) => ({
    ...s,
    phase:
      nowMin !== null && s.startMin <= nowMin
        ? "now"
        : s.startMin === nextStart
          ? "next"
          : "later",
  }));
}

//! MELYIK NAPOT MUTASSA. Hétköznap a mait — amíg van rajta hátralévő alkalom
//! (`remaining`). Ha nincs (hétvége, vagy a mai utolsó szakkör is véget ért),
//! a következő hétköznapot.
export function pickBoardDay(
  today: string,
  remaining: (dayKey: string) => boolean,
): string {
  if (isoWeekday(today) <= 5 && remaining(today)) return today;
  return nextWeekday(today);
}
