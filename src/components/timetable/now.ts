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
  //! A LAPOS LISTA A FUTÓ SZÖVEGÉ (képernyőolvasó-mondat, a heti rács sorának
  //! „· "-tel fűzött vége). Ami RAJZOLÓDIK, az a két nevesített mező alatta:
  //! ezek eddig ugyanennek a tömbnek a 0. és 1. eleme voltak, pozíció szerint
  //! olvasva — a tanári lapon viszont a tömb más hosszú, mert ott nincs tanár.
  //! Egy `meta[1]`-et olvasó doboz ott némán az OSZTÁLYT írta volna ki
  //! „tanár" ikonnal. Nevesítve ez a hiba nem tud létrejönni.
  meta: string[];
  /** A terem, ha van. Blokkon belüli teremváltásnál „102 · 303". */
  room: string;
  //! A SZEMKÖZTI FÉL. A diák lapján a TANÁR, a tanárén az OSZTÁLY — mindkettő
  //! ugyanabban a szerepben áll: „kivel". Melyik, azt nem `mode` dönti el,
  //! hanem az adat: a `teacherLessons` a tanár mezőit szándékosan üresen
  //! hagyja, és az osztályét tölti ki (lásd `lib/timetable.ts`).
  who: { kind: "teacher" | "class"; label: string } | null;
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

//! A HÉTVÉGE NEM PERCEKBEN MÉRHETŐ. A `countdownLabel` a KÖVETKEZŐ CSENGŐIG
//! számol — ott a perc a tét, és „5:30" pontosan az az egység, amiben egy
//! szünet gondolkodik. Egy ötvenhat órás hétvégére ráengedve viszont
//! „39 ó 55 p"-et ír, amit senki nem mond ki: a hétvégét NAPOKBAN élik, és csak
//! a végén válik órákká.
//!
//! EZÉRT A FELBONTÁS A CSENGŐ KÖZELEDTÉVEL ÉLESEDIK. Szombaton „1 nap 22 óra" —
//! semmi nem mozdul, mert nem is kell; vasárnap „16 óra 55 perc", és a perc már
//! fogy a szem előtt. Ugyanaz a szám, három közelségben — a kártya ettől lesz
//! nyugodt az elején és sürgető a végén, dísz nélkül.
export function longCountdownLabel(remainingSec: number): {
  value: string;
  unit: string;
} {
  const sec = Math.max(0, Math.ceil(remainingSec));
  if (sec >= 86400) {
    const d = Math.floor(sec / 86400);
    const h = Math.floor((sec % 86400) / 3600);
    return { value: `${d} nap`, unit: h > 0 ? `${h} óra` : "" };
  }
  if (sec >= 3600) {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    return { value: `${h} óra`, unit: m > 0 ? `${m} perc` : "" };
  }
  return { value: String(Math.max(1, Math.ceil(sec / 60))), unit: "perc" };
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
