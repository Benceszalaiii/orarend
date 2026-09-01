import { type DualStatus, dualStatusOf } from "@/lib/dualis";
import type { TimetableView } from "@/lib/timetable";
import {
  groupLabel,
  type LessonRun,
  lessonIdentity,
  type MergePreference,
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
  //! sor — feloldatlan csoportbontásnál mindkettő látszik, és „Szang / Szang"
  //! önmagában nem mond semmit arról, mi a különbség.
  group: string;
  minutes: number;
  lessons: number;
};

export type WeekModel = {
  days: WeekDay[];
  /** Áthelyezett órák a hét EGÉSZÉBŐL, nem csak a mai napból. */
  moved: MovedLesson[];
  /** Tantárgyak heti terhelés szerint, csökkenő sorrendben. */
  subjects: SubjectLoad[];
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

export function buildWeekModel(
  view: TimetableView,
  prefs: MergePreference[],
): WeekModel {
  const weekLetter = weekLetterOf(view);
  const days: WeekDay[] = [];
  const moved: MovedLesson[] = [];
  const subjectMap = new Map<string, SubjectLoad>();
  let totalMinutes = 0;
  let totalLessons = 0;

  for (const day of view.days) {
    const { runs } = resolveDay(
      view.lessons.filter((l) => l.dayOfWeek === day.dayOfWeek),
      prefs,
      view.periods,
    );
    const ordered = [...runs].sort((a, b) => a.startMin - b.startMin);
    const dayMoved = ordered.filter((r) => r.lesson.moved);
    const dual = dualStatusOf(day.dayOfWeek, weekLetter);

    let dayMinutes = 0;
    for (const run of ordered) {
      //! DUÁLIS NAPOK NEM SZÁMÍTANAK BELE a heti terhelésbe: azokat a napokat a
      //! diák a munkahelyen tölti, a rács órái ott nem az övéi. Egy összesítés,
      //! ami ezt beleszámolja, nem pontatlan — HAMIS. A NAPI összeg is nulla
      //! marad: különben a hét sávján ott ülne egy terhelés-csík olyan nap
      //! mellett, ami mellé „—" van írva.
      if (dual === "dual") continue;

      const minutes = netMinutes(run);
      dayMinutes += minutes;

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
      totalMinutes += minutes;
      totalLessons += run.lessonCount;
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
    subjects: [...subjectMap.values()].sort(
      (a, b) => b.minutes - a.minutes || a.label.localeCompare(b.label, "hu"),
    ),
    totalMinutes,
    totalLessons,
    weekLetter,
    hasDualDays: days.some((d) => d.dual === "dual"),
  };
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
