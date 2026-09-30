import type { FitLesson, FitWeek, SlotFit } from "./club-fit";
import { type ClubSlotTime, formatMinute, WEEKDAY_NAMES } from "./clubs";
import { lessonIdentity, MERGE_GAP_MAX_MIN } from "./timetable-merge";

//! ═══════════════════════════════════════════════════════════════════════════
//! A HÉT-TÉRKÉP — HOVA ESIK A SZAKKÖR A HETEDBEN
//! ═══════════════════════════════════════════════════════════════════════════
//! A szakkörlista tetején a hét KIRAJZOLVA: öt oszlop, mint az órarend
//! rácsán, benne a diák saját órái a rács színeivel, és minden szakkör
//! minden időpontja a valódi helyén. Ami belefér, az az órák KÖZÖTT áll;
//! ami ütközik, az beleszúr egy órába. A „20 szakkör fér bele" így nem
//! állítás, hanem látvány.
//!
//! EZ A FÁJL CSAK A GEOMETRIA: melyik jel melyik sávba kerül, mekkora a
//! kijelölt ablak, mit mond a felirata. Se React, se DOM, se `Date.now()` —
//! ugyanúgy tesztelhető, mint a `club-fit.ts`.
//! ═══════════════════════════════════════════════════════════════════════════

export const MAP_WEEKDAYS = [1, 2, 3, 4, 5] as const;

export const DAY_SHORT = ["", "H", "K", "Sze", "Cs", "P"] as const;

//* Egy szakkör egy időpontja a térképen.
export type MapSlot = ClubSlotTime & {
  /** A szakkör azonosítója (slug). */
  club: string;
  /** Az időpont sorszáma a szakkörön belül — ezzel olvasható ki az ítélete. */
  index: number;
  /** A sáv-sorrend: kisebb balra. Lásd `slotRank`. */
  rank: number;
  /** Egyező rangon ábécé, hogy két rajz között semmi ne cseréljen helyet. */
  name: string;
};

export type PlacedSlot = MapSlot & {
  /** Hányadik sáv a halmazon belül (0 = bal szél). */
  lane: number;
  /** Hány sáv osztozik a halmaz szélességén. */
  lanes: number;
  cluster: string;
};

//! A HALMAZ: EGYMÁST ÉRINTŐ IDŐPONTOK EGY NAPON. A 7:10-es kompetencia-órák
//! vagy a 14:30-kor induló szakkörök egy csomóban állnak; a csomó a
//! koppintható egység (telefonon egy 6 px-es jelre nem lehet rábökni, egy
//! csomóra igen), és a csomón belül osztoznak a szélességen.
export type MapCluster = {
  id: string;
  weekday: number;
  startMinute: number;
  endMinute: number;
  lanes: number;
  slots: PlacedSlot[];
};

//! A BELEFÉR ÁLL BALRA. Egy csomóban a kék jelek egymás mellé kerülnek, a
//! szürkék utánuk — egy pillantásból látszik, hogy a hét 14:30-as szakköréből
//! négy a tiéd, három nem. Amíg az órarended nem érkezett meg, minden jel
//! egyforma rangú (ábécé) — az ítélet megérkezésekor rendeződnek át.
export function slotRank(fit: SlotFit | undefined): number {
  if (!fit) return 0;
  switch (fit.verdict) {
    case "fits":
      return 0;
    case "clash":
      return 1;
    case "unknown":
      return 2;
  }
}

//! SÁVOK, MINT EGY NAPTÁRBAN. A halmazon belül minden elem az első olyan
//! sávba kerül, amelyik addigra felszabadult; a halmaz szélessége annyi
//! részre oszlik, ahány sáv kellett. Egymást nem érintő elemek külön
//! halmazba kerülnek, és mindegyik a teljes szélességet kapja. Az elemeknek
//! kezdés szerint rendezve kell érkezniük.
function laneGroups<T>(
  sorted: readonly T[],
  start: (item: T) => number,
  end: (item: T) => number,
): {
  start: number;
  end: number;
  lanes: number;
  items: { item: T; lane: number }[];
}[] {
  const groups: { start: number; end: number; items: T[] }[] = [];
  for (const item of sorted) {
    const group = groups.at(-1);
    if (group && start(item) < group.end) {
      group.items.push(item);
      group.end = Math.max(group.end, end(item));
    } else groups.push({ start: start(item), end: end(item), items: [item] });
  }
  return groups.map((g) => {
    const laneEnds: number[] = [];
    const items = g.items.map((item) => {
      let lane = laneEnds.findIndex((until) => until <= start(item));
      if (lane === -1) {
        lane = laneEnds.length;
        laneEnds.push(end(item));
      } else laneEnds[lane] = end(item);
      return { item, lane };
    });
    return { start: g.start, end: g.end, lanes: laneEnds.length, items };
  });
}

export function layoutWeek(slots: readonly MapSlot[]): MapCluster[] {
  return MAP_WEEKDAYS.flatMap((weekday) => {
    const day = slots
      .filter((s) => s.weekday === weekday)
      .sort(
        (a, b) =>
          a.startMinute - b.startMinute ||
          a.rank - b.rank ||
          a.name.localeCompare(b.name, "hu") ||
          a.endMinute - b.endMinute ||
          a.index - b.index,
      );
    return laneGroups(
      day,
      (s) => s.startMinute,
      (s) => s.endMinute,
    ).map((g) => {
      const id = `${weekday}-${g.start}`;
      return {
        id,
        weekday,
        startMinute: g.start,
        endMinute: g.end,
        lanes: g.lanes,
        slots: g.items.map(({ item, lane }) => ({
          ...item,
          lane,
          lanes: g.lanes,
          cluster: id,
        })),
      };
    });
  });
}

//* ---------------------------------------------------------------------------
//* A DIÁK ÓRÁI — ugyanazokkal a színekkel, mint a rácson
//* ---------------------------------------------------------------------------
//! A HÉT A SAJÁT SZÍNEIVEL, FELIRAT NÉLKÜL. A térkép nem egy szürke
//! „foglalt" sávot mutat, hanem a diák óráit, pontosan azzal a
//! tantárgyszínnel, amit a rácson lát — a mag ugyanaz, mint a
//! `lesson-block.tsx`-ben (`subjectShort || subject`). A hetét a színeiről
//! ismeri meg, nem a nevekről.
//!
//! A DÖNTÉSEI IS OTT VANNAK, AHOGY A RÁCSON. Ami bontott órából a másik
//! csoporté, azt a hét már nem tartalmazza (`ownLessons` a
//! `use-club-fit.ts`-ben) — az a hely nála szabad, és a térképen is az. Amit
//! még nem döntött el, az fél szélességben áll a párja mellett. Az egymást
//! követő azonos órák (ugyanaz a tárgy, csoport és tanár, legfeljebb
//! `MERGE_GAP_MAX_MIN` szünettel) EGY blokk, a szünet csíkjával — pontosan
//! úgy, ahogy a rács kártyája összevonja őket.
//!
//! TÖBB HÉT, EGY KÉP. A mentett hetekből összegyűjtjük az órákat; ami minden
//! héten ugyanakkor ugyanaz, az egyszer áll. Ha az A és a B héten más óra van
//! ugyanabban az időben, a kettő egymás mellé kerül. A „belefér" is minden
//! hétből számol (`club-fit.ts`), tehát a kép és az ítélet ugyanarról beszél.
export type LessonBlock = {
  key: string;
  /** Tárgy + csoport + tanár — ugyanaz az azonosság, mint a rács döntéseié. */
  identity: string;
  startMin: number;
  endMin: number;
  /** A tantárgyszín magja — `accentStyle(seed)`. */
  seed: string;
  /** A blokkon belüli szünetek (az összevont órák között). */
  breaks: { startMin: number; endMin: number }[];
  lane: number;
  lanes: number;
};

export function lessonSeed(lesson: {
  subject: string;
  subjectShort: string;
}): string {
  return lesson.subjectShort || lesson.subject;
}

export function lessonBlocks(
  weeks: readonly FitWeek[],
  weekday: number,
): LessonBlock[] {
  //* 1. Minden hétből, egyszer: azonosság + idő szerint.
  const unique = new Map<string, FitLesson>();
  for (const week of weeks) {
    const day = week.days.find((d) => d.dayOfWeek === weekday);
    //* Szünnap, tanítás nélküli nap: nem az órarended — nem rajzoljuk.
    if (!day || day.teaching === false) continue;
    for (const lesson of week.lessons) {
      if (lesson.dayOfWeek !== weekday) continue;
      const key = `${lessonIdentity(lesson)}@${lesson.startMin}-${lesson.endMin}`;
      if (!unique.has(key)) unique.set(key, lesson);
    }
  }

  //* 2. Azonosságonként láncba, mint a rács `buildRuns`-a.
  const byIdentity = new Map<string, FitLesson[]>();
  for (const lesson of unique.values()) {
    const identity = lessonIdentity(lesson);
    byIdentity.set(identity, [...(byIdentity.get(identity) ?? []), lesson]);
  }
  const runs: Omit<LessonBlock, "lane" | "lanes">[] = [];
  for (const [identity, group] of byIdentity) {
    const sorted = [...group].sort((a, b) => a.startMin - b.startMin);
    let chain: FitLesson[] = [];
    const flush = () => {
      if (chain.length === 0) return;
      const breaks: { startMin: number; endMin: number }[] = [];
      for (let i = 1; i < chain.length; i++) {
        if (chain[i].startMin > chain[i - 1].endMin)
          breaks.push({
            startMin: chain[i - 1].endMin,
            endMin: chain[i].startMin,
          });
      }
      const startMin = chain[0].startMin;
      const endMin = chain[chain.length - 1].endMin;
      runs.push({
        key: `${identity}@${startMin}-${endMin}`,
        identity,
        startMin,
        endMin,
        seed: lessonSeed(chain[0]),
        breaks,
      });
      chain = [];
    };
    for (const lesson of sorted) {
      const prev = chain.at(-1);
      if (prev && lesson.startMin - prev.endMin > MERGE_GAP_MAX_MIN) flush();
      //* Az A és a B hét ugyanazon órája ugyanott: már benne van a láncban.
      if (prev && lesson.startMin < prev.endMin) continue;
      chain.push(lesson);
    }
    flush();
  }

  //* 3. Ami egyszerre van, egymás mellé.
  runs.sort(
    (a, b) =>
      a.startMin - b.startMin ||
      a.seed.localeCompare(b.seed, "hu") ||
      a.endMin - b.endMin ||
      a.identity.localeCompare(b.identity, "hu"),
  );
  return laneGroups(
    runs,
    (b) => b.startMin,
    (b) => b.endMin,
  ).flatMap((g) =>
    g.items.map(({ item, lane }) => ({ ...item, lane, lanes: g.lanes })),
  );
}

//* Az ütköző óra blokkja: ugyanaz az azonosság, és a blokk tartalmazza.
export function blockOfLesson(
  blocks: readonly LessonBlock[],
  lesson: FitLesson,
): LessonBlock | null {
  const identity = lessonIdentity(lesson);
  return (
    blocks.find(
      (b) =>
        b.identity === identity &&
        b.startMin <= lesson.startMin &&
        lesson.endMin <= b.endMin,
    ) ?? null
  );
}

//! A „BELEFÉR" BIZONYÍTÉKA A SÚGÓBAN: meddig tart az aznapi utolsó órád a
//! szakkör kezdete előtt. Ugyanazt mondja, mint a szakkör lapjának vonalzója.
export function lastEndBefore(
  blocks: readonly LessonBlock[],
  minute: number,
): number | null {
  let last: number | null = null;
  for (const b of blocks) {
    if (b.endMin <= minute && (last === null || b.endMin > last))
      last = b.endMin;
  }
  return last;
}

//* ---------------------------------------------------------------------------
//* A LÁTHATÓ IDŐSÁV
//* ---------------------------------------------------------------------------
//! AZ ISKOLA NAPJA, NEM A SZAKKÖRÖKÉ. A tengely a 0. óra előtt indul és
//! legalább négyig tart, akkor is, ha épp egy szakkör sincs délután —
//! osztályváltáskor a hét így nem egy újraméretezett tengelyen ugrik, hanem
//! ugyanazon a vonalzón változik meg. Ami ennél később tart (a DÖK
//! szakköre hatig), az kitolja a végét, félórára kerekítve.
export const MAP_DAY_START = 7 * 60;
export const MAP_DAY_END = 16 * 60;

export function mapRange(
  slots: readonly ClubSlotTime[],
  bands: readonly { startMin: number; endMin: number }[] = [],
): { from: number; to: number } {
  const starts = [
    ...slots.map((s) => s.startMinute),
    ...bands.map((b) => b.startMin),
  ];
  const ends = [
    ...slots.map((s) => s.endMinute),
    ...bands.map((b) => b.endMin),
  ];
  const from = Math.min(
    MAP_DAY_START,
    ...starts.map((m) => Math.floor(m / 60) * 60),
  );
  const to = Math.max(MAP_DAY_END, ...ends.map((m) => Math.ceil(m / 30) * 30));
  return { from, to };
}

//* ---------------------------------------------------------------------------
//* A KIJELÖLT ABLAK
//* ---------------------------------------------------------------------------
//! A TÉRKÉP IS SZŰRŐ, mint a sáv. Egy nap fejlécére, egy csomóra koppintva,
//! vagy egérrel végighúzva egy téglalapot („kedd–csütörtök, 14:00 után") a
//! lista arra szűkül, aminek VAN időpontja az ablakban. Érintés elég, nem kell
//! teljesen benne lennie: aki a délutánt jelöli ki, a 14:30–15:55-öst is
//! keresi, akkor is, ha a húzás 15:30-nál megállt.
export type MapWindow = {
  /** ISO napok (1 = hétfő), növekvő sorrendben. */
  days: number[];
  from: number;
  to: number;
};

export const WHOLE_DAY = { from: 0, to: 24 * 60 } as const;

export function slotInWindow(slot: ClubSlotTime, w: MapWindow): boolean {
  return (
    w.days.includes(slot.weekday) &&
    slot.startMinute < w.to &&
    w.from < slot.endMinute
  );
}

export function clubInWindow(
  slots: readonly ClubSlotTime[],
  w: MapWindow,
): boolean {
  return slots.some((slot) => slotInWindow(slot, w));
}

export function sameWindow(a: MapWindow | null, b: MapWindow | null): boolean {
  if (a === null || b === null) return a === b;
  return (
    a.from === b.from &&
    a.to === b.to &&
    a.days.length === b.days.length &&
    a.days.every((d, i) => d === b.days[i])
  );
}

export function isWholeDay(w: MapWindow): boolean {
  return w.from <= WHOLE_DAY.from && w.to >= WHOLE_DAY.to;
}

//* Ötperces rácsra: a húzás ne 14:37-et mondjon, de a 7:10-es kezdést se
//* kerekítse el egy negyedórás rács.
export function snapMinute(minute: number, step = 5): number {
  return Math.round(minute / step) * step;
}

//! A FELIRAT A HÉT NYELVÉN. Egy nap: a teljes neve („Kedd"). Összefüggő
//! napok: a rövidítések kötőjellel („H–Cs"); szétszórtak: vesszővel. Az idő
//! csak akkor kerül mellé, ha nem az egész nap van kijelölve.
export function windowLabel(w: MapWindow): string {
  const days = [...w.days].sort((a, b) => a - b);
  const contiguous = days.every((d, i) => i === 0 || d === days[i - 1] + 1);
  const dayText =
    days.length === 1
      ? WEEKDAY_NAMES[days[0]]
      : contiguous
        ? `${DAY_SHORT[days[0]]}–${DAY_SHORT[days[days.length - 1]]}`
        : days.map((d) => DAY_SHORT[d]).join(", ");
  if (isWholeDay(w)) return dayText;
  return `${dayText} · ${formatMinute(w.from)}–${formatMinute(w.to)}`;
}
