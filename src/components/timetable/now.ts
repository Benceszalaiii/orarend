export type AgendaItem = {
  key: string;
  kind: "lesson" | "event";
  dateKey: string;
  dayOfWeek: number;
  dayName: string;
  startMin: number;
  endMin: number;
  title: string;
  fullTitle: string;
  meta: string[];
  accentSeed: string;
};

export type NowSpan = { fromMin: number; toMin: number };

export type NowState =
  | {
      phase: "lesson";
      current: AgendaItem;
      next: AgendaItem | null;
      span: NowSpan;
    }
  | { phase: "break"; next: AgendaItem; span: NowSpan }
  | { phase: "before"; next: AgendaItem; span: NowSpan }
  | { phase: "done"; next: AgendaItem | null; dayEmpty: boolean }
  | { phase: "empty" };

const LEAD_IN_MIN = 60;

export function sortAgenda(items: AgendaItem[]): AgendaItem[] {
  //! Először DÁTUM, aztán idő: a „következő" tétele a hét későbbi napjai közt sem
  //! választhat korábbi időpontú, de távolabbi napot (pl. keddi 1. óra helyett
  //! pénteki 0. órát). Egyetlen napon belül a `dateKey` azonos, így ott a sorrend
  //! változatlan marad.
  return [...items].sort(
    (a, b) =>
      a.dateKey.localeCompare(b.dateKey) ||
      a.startMin - b.startMin ||
      a.endMin - b.endMin,
  );
}

export function nowState(
  todayItems: AgendaItem[],
  laterItems: AgendaItem[],
  nowMin: number,
): NowState {
  const day = sortAgenda(todayItems);
  if (day.length === 0) {
    const next = sortAgenda(laterItems)[0] ?? null;
    return next ? { phase: "done", next, dayEmpty: true } : { phase: "empty" };
  }

  const running = day
    .filter((it) => it.startMin <= nowMin && nowMin < it.endMin)
    .sort((a, b) => b.endMin - a.endMin)[0];

  const upcoming = day.find((it) => it.startMin > nowMin) ?? null;

  if (running) {
    return {
      phase: "lesson",
      current: running,
      next: day.find((it) => it.startMin >= running.endMin) ?? null,
      span: { fromMin: running.startMin, toMin: running.endMin },
    };
  }

  if (upcoming) {
    const lastEnd = day
      .filter((it) => it.endMin <= nowMin)
      .reduce((acc, it) => Math.max(acc, it.endMin), Number.NEGATIVE_INFINITY);

    if (lastEnd > Number.NEGATIVE_INFINITY) {
      return {
        phase: "break",
        next: upcoming,
        span: { fromMin: lastEnd, toMin: upcoming.startMin },
      };
    }
    return {
      phase: "before",
      next: upcoming,
      span: {
        fromMin: upcoming.startMin - LEAD_IN_MIN,
        toMin: upcoming.startMin,
      },
    };
  }

  return {
    phase: "done",
    next: sortAgenda(laterItems)[0] ?? null,
    dayEmpty: false,
  };
}

export function spanFraction(span: NowSpan, nowMin: number): number {
  const length = span.toMin - span.fromMin;
  if (length <= 0) return 1;
  return Math.min(1, Math.max(0, (nowMin - span.fromMin) / length));
}

export function countdownLabel(remainingSec: number): {
  value: string;
  unit: string;
} {
  const sec = Math.max(0, Math.ceil(remainingSec));
  if (sec >= 3600) {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    return { value: `${h} ó ${m} p`, unit: "" };
  }
  if (sec >= 600) {
    return { value: String(Math.ceil(sec / 60)), unit: "perc" };
  }
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return { value: `${m}:${s < 10 ? `0${s}` : s}`, unit: "" };
}
