import { type DualSchedule, dualStatusFor } from "@/lib/dual-schedule";
import type { DualStatus } from "@/lib/dualis";
import { periodsOfDay, type TimetableView } from "@/lib/timetable";
import {
  type ClusterChoice,
  type ConflictCluster,
  groupLabel,
  type LessonRun,
  lessonIdentity,
  type MergePreference,
  type PeriodLike,
  resolveDay,
} from "@/lib/timetable-merge";
import { weekLetterOf } from "./day";

//* ---------------------------------------------------------------------------
//* A HÉT MODELLJE — amit a rács NEM mond meg
//* ---------------------------------------------------------------------------
//! A heti rács minden órát megmutat, de semmit nem ÖSSZESÍT: hogy melyik nap a
//! nehéz, mennyi egy tantárgy heti terhelése, vagy hogy a héten BÁRHOL mozdult-e
//! valami, csak végigolvasva derül ki. Ez a modul ezekre a kérdésekre számol
//! választ — ugyanabból az adatból, ugyanazzal a csoportbontás-feloldással.

export type WeekDay = {
  dateKey: string;
  name: string;
  dayOfWeek: number;
  dual: DualStatus;
  lessonCount: number;
  /** Tényleges tanítási percek, a szünetek nélkül. */
  minutes: number;
  firstMin: number;
  lastMin: number;
  movedCount: number;
};

export type MovedLesson = {
  run: LessonRun;
  dateKey: string;
  dayName: string;
};

export type SubjectLoad = {
  key: string;
  label: string;
  short: string;
  //! A CSOPORT NEVE, ha van. Ugyanannak a tantárgynak két csoportja két külön
  //! sor — de csak ott, ahol a diák MÁR eldöntötte, melyikre jár (pl. mert két
  //! különböző sávban tanulja). Az eldöntetlen bontás nem két sor: egy döntés.
  group: string;
  minutes: number;
  lessons: number;
};

//* Egy ág EGY órája — annyi belőle, amennyiből választani lehet.
export type BranchOption = {
  identity: string;
  subject: string;
  short: string;
  group: string;
  teacher: string;
  room: string;
};

//! EGY VÁLASZTHATÓ ÁG. Általában egyetlen óra („A csoport" vagy „B csoport"),
//! de nem mindig: ha a sávban vannak egymással ÖSSZEFÉRŐ órák, a valódi döntés
//! „ez + az" VAGY „amaz" — ugyanaz a szabály, mint a rács összevonás-gombjánál.
export type LoadBranch = {
  key: string;
  options: BranchOption[];
  /** A HETI terhelés, ha a diák ezt az ágat választja. */
  minutes: number;
  lessonCount: number;
};

//! A TERHELÉS-LISTA KÉTFÉLE SORA. Az eldöntött tantárgy egy szám; az
//! eldöntetlen csoportbontás viszont NEM az — ott két ág ugyanarra a sávra
//! állítja, hogy a tiéd. Külön sorként megjelenítve („Szang 3ó", „Szang 3ó") a
//! lista kétszer mondja ugyanazt, a heti összeg pedig egy olyan terhelést
//! állít, amit senki nem visel. Ezért az ilyen ágak EGY sorrá állnak össze —
//! abból a sorból pedig dönteni lehet.
export type SubjectRow =
  | ({ kind: "subject" } & SubjectLoad)
  | {
      kind: "split";
      key: string;
      /** Erre a kulcsra megy a döntés (`MergePreference.clusterKey`). */
      clusterKey: string;
      /** A sávban versengő tantárgyak rövid nevei, ismétlés nélkül. */
      shorts: string[];
      /** Mely napokon jön elő ez a döntés a héten. */
      dayNames: string[];
      /** A legterhesebb ág — a sáv rajzolásához és a rendezéshez. */
      minutes: number;
      /** A legkönnyebb ág; ha a kettő egyenlő, a kiírt szám biztos. */
      minMinutes: number;
      branches: LoadBranch[];
    };

export type WeekModel = {
  days: WeekDay[];
  /** Áthelyezett órák a hét EGÉSZÉBŐL, nem csak a mai napból. */
  moved: MovedLesson[];
  /** Tantárgyak heti terhelés szerint, csökkenő sorrendben. */
  subjects: SubjectRow[];
  /** Hány csoportbontás vár még döntésre a héten. */
  undecided: number;
  totalMinutes: number;
  totalLessons: number;
  weekLetter: string;
  /** Van-e a héten duális nap — az összesítések ezeket kihagyják. */
  hasDualDays: boolean;
};

//* A futam bruttó hossza a benne lévő szüneteket is tartalmazza; a terhelés
//* szempontjából csak a tanítási idő számít.
function netMinutes(run: LessonRun): number {
  const gross = run.endMin - run.startMin;
  const breaks = run.breaks.reduce(
    (sum, b) => sum + (b.endMin - b.startMin),
    0,
  );
  return Math.max(0, gross - breaks);
}

type Span = { startMin: number; endMin: number };

//* Ugyanaz a tanítási idő, sávokra bontva: a futam ideje, a benne lévő szünetek
//* kivágásával. A hosszuk összege pontosan a `netMinutes`.
function teachingSpans(run: LessonRun): Span[] {
  const spans: Span[] = [];
  let cursor = run.startMin;
  for (const gap of [...run.breaks].sort((a, b) => a.startMin - b.startMin)) {
    if (gap.startMin > cursor) {
      spans.push({ startMin: cursor, endMin: gap.startMin });
    }
    cursor = Math.max(cursor, gap.endMin);
  }
  if (run.endMin > cursor) spans.push({ startMin: cursor, endMin: run.endMin });
  return spans;
}

function mergeSpans(spans: Span[]): Span[] {
  const out: Span[] = [];
  for (const span of [...spans].sort((a, b) => a.startMin - b.startMin)) {
    const last = out[out.length - 1];
    if (last && span.startMin <= last.endMin) {
      last.endMin = Math.max(last.endMin, span.endMin);
      continue;
    }
    out.push({ ...span });
  }
  return out;
}

//! A NAP HOSSZA NEM AZ ÓRÁK ÖSSZEGE, HANEM A LEFEDETT IDŐ. Feloldatlan
//! csoportbontásnál két óra ugyanarra a percre esik; összeadva a hétfő „7 óra
//! 30 perc" lenne egy hat órás napon, és a hét sávján a leghosszabb csík olyan
//! nap mellé kerülne, ahol csak a döntés hiányzik. Egy percet egyszer élünk le
//! — egyszer is számoljuk.
function coveredMinutes(merged: Span[]): number {
  return merged.reduce((sum, span) => sum + (span.endMin - span.startMin), 0);
}

//* Ugyanez órákban: hány tanítási sávot érint a nap lefedett ideje.
function coveredPeriods(merged: Span[], periods: PeriodLike[]): number {
  const hit = periods.filter((p) =>
    merged.some((s) => p.startMin < s.endMin && s.startMin < p.endMin),
  ).length;
  return hit > 0 ? hit : merged.length;
}

function branchOption(option: {
  identity: string;
  lesson: LessonRun["lesson"];
}): BranchOption {
  const { lesson } = option;
  return {
    identity: option.identity,
    subject: lesson.subject || lesson.subjectShort,
    short: lesson.subjectShort || lesson.subject,
    group: groupLabel(lesson.group, lesson.subject),
    teacher: lesson.teacherShort || lesson.teacher,
    room: lesson.room,
  };
}

export function buildWeekModel(
  view: TimetableView,
  prefs: MergePreference[],
  //* A duális napok a diák beosztásából jönnek — ugyanabból a forrásból, mint a
  //* napi modellben, hogy a két oldal soha ne mondjon mást ugyanarról a napról.
  dualSchedule: DualSchedule | null,
): WeekModel {
  const weekLetter = weekLetterOf(view);
  const days: WeekDay[] = [];
  const moved: MovedLesson[] = [];
  const subjectMap = new Map<string, SubjectLoad>();
  //! AZ ELDÖNTETLEN SÁVOK, A HÉT EGÉSZÉBŐL. A klaszter kulcsa csak az órák
  //! azonosságából áll, az időpontból nem — így a hétfői és a szerdai „A vagy B"
  //! UGYANAZ a döntés, és egyetlen választás mindkettőt elintézi. A napok nevét
  //! azért gyűjtjük mellé, hogy a sor meg tudja mondani, hol harap.
  const undecided = new Map<
    string,
    { cluster: ConflictCluster; dayNames: string[] }
  >();
  let totalMinutes = 0;
  let totalLessons = 0;

  for (const day of view.days) {
    //* A nap saját csengetési rendje szerint — rövidített napon a hét közös
    //* `periods` tömbje más órahatárokat adna, mint amit a nap ténylegesen fut.
    const dayRings = periodsOfDay(view, day);
    const { runs, conflicts } = resolveDay(
      view.lessons.filter((l) => l.dayOfWeek === day.dayOfWeek),
      prefs,
      dayRings,
    );
    const ordered = [...runs].sort((a, b) => a.startMin - b.startMin);
    const dayMoved = ordered.filter((r) => r.lesson.moved);
    const dual = dualStatusFor(dualSchedule, day.dayOfWeek, weekLetter);

    //! DUÁLIS NAPOK NEM SZÁMÍTANAK BELE a heti terhelésbe: azokat a napokat a
    //! diák a munkahelyen tölti, a rács órái ott nem az övéi. Egy összesítés,
    //! ami ezt beleszámolja, nem pontatlan — HAMIS. A NAPI összeg is nulla
    //! marad: különben a hét sávján ott ülne egy terhelés-csík olyan nap
    //! mellett, ami mellé „—" van írva. És döntést sem kérünk olyan sávra,
    //! amelyiken a diák nincs is ott.
    const counts = dual !== "dual";

    if (counts) {
      for (const cluster of conflicts) {
        const entry = undecided.get(cluster.key);
        if (entry) {
          if (!entry.dayNames.includes(day.name)) entry.dayNames.push(day.name);
          continue;
        }
        undecided.set(cluster.key, { cluster, dayNames: [day.name] });
      }
    }

    const spans = counts ? mergeSpans(ordered.flatMap(teachingSpans)) : [];
    const dayMinutes = coveredMinutes(spans);
    const dayLessons = coveredPeriods(spans, dayRings);

    if (counts) {
      for (const run of ordered) {
        const minutes = netMinutes(run);
        const key = lessonIdentity(run.lesson);
        const short = run.lesson.subjectShort || run.lesson.subject;
        const existing = subjectMap.get(key);
        if (existing) {
          existing.minutes += minutes;
          existing.lessons += run.lessonCount;
        } else {
          subjectMap.set(key, {
            key,
            label: run.lesson.subject || short,
            short,
            group: groupLabel(run.lesson.group, run.lesson.subject),
            minutes,
            lessons: run.lessonCount,
          });
        }
      }
      totalMinutes += dayMinutes;
      totalLessons += dayLessons;
    }

    for (const run of dayMoved) {
      moved.push({ run, dateKey: day.dateKey, dayName: day.name });
    }

    days.push({
      dateKey: day.dateKey,
      name: day.name,
      dayOfWeek: day.dayOfWeek,
      dual,
      lessonCount: ordered.length,
      minutes: dayMinutes,
      firstMin: ordered[0]?.startMin ?? 0,
      lastMin: ordered[ordered.length - 1]?.endMin ?? 0,
      movedCount: dayMoved.length,
    });
  }

  return {
    days,
    moved,
    subjects: subjectRows(subjectMap, [...undecided.values()]),
    undecided: undecided.size,
    totalMinutes,
    totalLessons,
    weekLetter,
    hasDualDays: days.some((d) => d.dual === "dual"),
  };
}

//! A LISTA ÖSSZEÁLLÍTÁSA. Amelyik óra még versenyben van egy eldöntetlen
//! sávban, az NEM kap saját sort: az ág a döntés sorába költözik, a saját heti
//! terhelésével együtt — így a diák nem elvont csoportnevek közül választ,
//! hanem két számot lát maga előtt („ezzel 4 óra, azzal 3 óra 15 perc").
function subjectRows(
  loads: Map<string, SubjectLoad>,
  clusters: { cluster: ConflictCluster; dayNames: string[] }[],
): SubjectRow[] {
  const rows: SubjectRow[] = [];
  const contested = new Set<string>();

  for (const { cluster, dayNames } of clusters) {
    const branches = cluster.choices.map((choice) => loadBranch(choice, loads));
    if (branches.length < 2) continue;
    for (const branch of branches) {
      for (const option of branch.options) contested.add(option.identity);
    }
    const minutes = Math.max(...branches.map((b) => b.minutes));
    rows.push({
      kind: "split",
      key: `split-${cluster.key}`,
      clusterKey: cluster.key,
      shorts: [
        ...new Set(branches.flatMap((b) => b.options.map((o) => o.short))),
      ],
      dayNames,
      minutes,
      minMinutes: Math.min(...branches.map((b) => b.minutes)),
      branches,
    });
  }

  for (const load of loads.values()) {
    if (contested.has(load.key)) continue;
    rows.push({ kind: "subject", ...load });
  }

  return rows.sort(
    (a, b) =>
      b.minutes - a.minutes || rowLabel(a).localeCompare(rowLabel(b), "hu"),
  );
}

function loadBranch(
  choice: ClusterChoice,
  loads: Map<string, SubjectLoad>,
): LoadBranch {
  const options = choice.options.map(branchOption);
  let minutes = 0;
  let lessonCount = 0;
  for (const option of options) {
    const load = loads.get(option.identity);
    minutes += load?.minutes ?? 0;
    lessonCount += load?.lessons ?? 0;
  }
  return { key: choice.key, options, minutes, lessonCount };
}

function rowLabel(row: SubjectRow): string {
  return row.kind === "split" ? row.shorts.join(" / ") : row.label;
}

//! ÓRA ÉS PERC, EMBERI ALAKBAN. A heti terhelés percben mérve („1350 perc")
//! olvashatatlan; órára kerekítve viszont elveszik a fél óra, ami egy 45 perces
//! rendszerben pont egy tanóra.
export function hoursLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}p`;
  return m === 0 ? `${h}ó` : `${h}ó ${m}p`;
}
