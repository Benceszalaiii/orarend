import type { ClubSlotTime } from "./clubs";
import {
  DUAL_WEEK_LETTERS,
  type DualSchedule,
  type DualWeekLetter,
} from "./dual-schedule";
import type { TimetableDay, TimetableLesson } from "./timetable";
import type { MergePreference } from "./timetable-merge";
import { lessonIdentity, suppressedIdentities } from "./timetable-merge";

//! ═══════════════════════════════════════════════════════════════════════════
//! BELEFÉR-E A SZAKKÖR AZ ÓRARENDEMBE
//! ═══════════════════════════════════════════════════════════════════════════
//! A „Neked is jó időpontban" szűrő és a rács halvány javaslatai ugyanebből
//! dolgoznak. A kérdés egyszerű: a szakkör rendszeres időpontjában van-e ÓRÁD —
//! a SAJÁT órarended szerint, vagyis az elrejtett és összevont csoportok
//! nélkül (`suppressedIdentities`), ahogy a rácsod is mutatja.
//!
//! A KÉSZÜLÉKEN SZÁMOLJUK, NEM A SZERVEREN. Az órarend és a döntések (melyik
//! csoportba jársz) úgyis a böngészőben vannak; a szervernek nem kell tudnia,
//! kinek mikor van lyukasórája.
//!
//! TÖBB HÉTBŐL, MERT AZ A/B HÉT NEM UGYANAZ. Egy hét alapján a „belefér"
//! csak arra a hétre igaz: a páratlan heti fizika pont a szakkör idejére
//! eshet. Ezért minden ismert hetet (a készüléken mentetteket) megkérdezünk, és
//! egyetlen ütközés elég a „nem fér bele"-hez.
//!
//! AMIT NEM TUDUNK, AZT NEM ÁLLÍTJUK. Szünnap, tanítás nélküli nap vagy óra
//! nélküli nap nem tanúskodik se mellette, se ellene; ha egyetlen hét sem
//! tanúskodik, a válasz „nem tudjuk" — nem „belefér".
//!
//! TISZTA FÜGGVÉNYEK: se hálózat, se tároló, se `Date.now()`.
//! ═══════════════════════════════════════════════════════════════════════════

export type FitLesson = Pick<
  TimetableLesson,
  | "dayOfWeek"
  | "startMin"
  | "endMin"
  | "subject"
  | "subjectShort"
  | "teacher"
  | "teacherShort"
  | "group"
  | "classShort"
>;

export type FitWeek = {
  days: Pick<TimetableDay, "dayOfWeek" | "teaching">[];
  lessons: FitLesson[];
};

export type SlotFit =
  | { verdict: "fits" }
  | { verdict: "clash"; lesson: FitLesson; dual?: undefined }
  | { verdict: "clash"; lesson?: undefined; dual: DualWeekLetter[] }
  | { verdict: "unknown" };

export type ClubFitVerdict = "fits" | "partly" | "clash" | "unknown";

//! A SAJÁT ÓRARENDED — az elrejtett csoportok nélkül. Aki a rácson a német
//! TSZ-t választotta, annak a német PZS ideje szabad, és egy oda eső szakkör
//! belefér.
export function ownLessons(
  lessons: readonly FitLesson[],
  prefs: readonly MergePreference[],
): FitLesson[] {
  const suppressed = suppressedIdentities([...prefs]);
  if (suppressed.size === 0) return [...lessons];
  return lessons.filter((l) => !suppressed.has(lessonIdentity(l)));
}

//* Félig nyitott sávok: a 7:55-kor végződő óra nem ütközik a 7:55-kor kezdődő
//* szakkörrel.
function overlaps(
  a: { startMin: number; endMin: number },
  b: { startMin: number; endMin: number },
): boolean {
  return a.startMin < b.endMin && b.startMin < a.endMin;
}

//! A DUÁLIS NAP ÜTKÖZÉS — A BEOSZTÁSBÓL, NEM A HETEKBŐL. Aki B héten szerdán a
//! munkahelyén van, annak a szerdai szakkör kéthetente elmarad; ez nem
//! „részben jó", hanem ütközés, és a hét betűjét is megnevezzük. A beosztást
//! a diák adta meg (`dual-schedule.ts`), tehát akkor is igaz, ha a készüléken
//! épp egyetlen B hét sincs elmentve — a mentett hetekből ezt nem látnánk.
export function dualWeeksOf(
  dual: DualSchedule | null,
  weekday: number,
): DualWeekLetter[] {
  if (!dual) return [];
  return DUAL_WEEK_LETTERS.filter((letter) => dual[letter].includes(weekday));
}

export function slotFit(
  slot: ClubSlotTime,
  weeks: readonly FitWeek[],
  dual: DualSchedule | null = null,
): SlotFit {
  const dualWeeks = dualWeeksOf(dual, slot.weekday);
  if (dualWeeks.length > 0) return { verdict: "clash", dual: dualWeeks };
  let witnessed = false;
  for (const week of weeks) {
    const day = week.days.find((d) => d.dayOfWeek === slot.weekday);
    if (!day || day.teaching === false) continue;
    const lessons = week.lessons.filter((l) => l.dayOfWeek === slot.weekday);
    //! ÓRA NÉLKÜLI TANÍTÁSI NAP: adathiány vagy kirándulás — nem tanú.
    if (lessons.length === 0) continue;
    const clash = lessons
      .filter((l) =>
        overlaps(l, { startMin: slot.startMinute, endMin: slot.endMinute }),
      )
      .sort((a, b) => a.startMin - b.startMin)[0];
    if (clash) return { verdict: "clash", lesson: clash };
    witnessed = true;
  }
  return witnessed ? { verdict: "fits" } : { verdict: "unknown" };
}

//! A SZAKKÖR EGÉSZE. Ha minden időpontja belefér: belefér. Ha egyik sem:
//! ütközik. Minden más (egy belefér, a másik nem, vagy nem tudjuk) „részben"
//! — a Humán versenyfelkészítés kedden és szerdán is van, és a keddi is ér
//! valamit annak, akinek szerdán órája van.
export function clubFit(
  slots: readonly ClubSlotTime[],
  weeks: readonly FitWeek[],
  dual: DualSchedule | null = null,
): { verdict: ClubFitVerdict; slots: SlotFit[] } {
  const fits = slots.map((slot) => slotFit(slot, weeks, dual));
  const count = (v: SlotFit["verdict"]) =>
    fits.filter((f) => f.verdict === v).length;
  const known = fits.length - count("unknown");
  let verdict: ClubFitVerdict;
  if (known === 0) verdict = "unknown";
  else if (count("fits") === fits.length) verdict = "fits";
  else if (count("clash") === fits.length) verdict = "clash";
  //* Ütközés + ismeretlen, belefér nélkül: nem állíthatjuk, hogy ütközik (a
  //* másik időpontot nem látjuk), sem hogy részben jó.
  else verdict = count("fits") > 0 ? "partly" : "unknown";
  return { verdict, slots: fits };
}

export const CLUB_FIT_LABEL: Record<ClubFitVerdict, string> = {
  fits: "Belefér az órarendedbe",
  partly: "Részben fér bele",
  clash: "Ütközik egy órádba",
  unknown: "Nem tudjuk, belefér-e",
};

//! ─── A HÉT DÉLUTÁNJAI ──────────────────────────────────────────────────────
//! A „belefér" ellenőrizhető legyen: a lista tetején napról napra ott áll,
//! meddig tart a diák utolsó órája. A LEGKÉSŐBBI minden ismert hétből — az a
//! szám, amihez egy rendszeres szakkörnek igazodnia kell.
export type DayEnd = {
  weekday: number;
  //* `null`: egyik ismert héten sem volt aznap órád (vagy nem tudjuk).
  lastEnd: number | null;
  dual: DualWeekLetter[];
};

export function dayEnds(
  weeks: readonly FitWeek[],
  dual: DualSchedule | null,
): DayEnd[] {
  return [1, 2, 3, 4, 5].map((weekday) => {
    let lastEnd: number | null = null;
    for (const week of weeks) {
      const day = week.days.find((d) => d.dayOfWeek === weekday);
      if (!day || day.teaching === false) continue;
      for (const l of week.lessons) {
        if (l.dayOfWeek === weekday && (lastEnd === null || l.endMin > lastEnd))
          lastEnd = l.endMin;
      }
    }
    return { weekday, lastEnd, dual: dualWeeksOf(dual, weekday) };
  });
}

//! EGY NAP FOGLALT SÁVJAI, az összes ismert hétből összevonva. A szakkör
//! lapjának napi vonalzója ezt rajzolja halványan a szakkör sávja alá: ahol a
//! kettő fedi egymást, ott valamelyik héten órád van.
export function busyBands(
  weeks: readonly FitWeek[],
  weekday: number,
): { startMin: number; endMin: number }[] {
  const bands = weeks
    .filter((w) =>
      w.days.some((d) => d.dayOfWeek === weekday && d.teaching !== false),
    )
    .flatMap((w) => w.lessons.filter((l) => l.dayOfWeek === weekday))
    .map((l) => ({ startMin: l.startMin, endMin: l.endMin }))
    .sort((a, b) => a.startMin - b.startMin);
  const merged: { startMin: number; endMin: number }[] = [];
  for (const band of bands) {
    const last = merged.at(-1);
    //* A 10 perces szünet nem szabad idő egy szakkörnek — egy sávba vonjuk.
    if (last && band.startMin <= last.endMin + 10) {
      last.endMin = Math.max(last.endMin, band.endMin);
    } else merged.push({ ...band });
  }
  return merged;
}

//! ─── A RÁCS JAVASLATAI ─────────────────────────────────────────────────────
//! A szerver az osztálynak szóló és a mindenkinek nyitott szakkörök ÖSSZES
//! alkalmát adja (`suggested` jelöléssel); itt marad meg belőlük az, ami a diák SAJÁT hetébe belefér.
//! Ami aznap nem lesz meg (nincs az órarendben, nincs tanítás), azt nem
//! javasoljuk — egy áthúzott javaslat semmit nem ér.
type SuggestableEvent = {
  dayOfWeek: number;
  startMin: number;
  endMin: number;
  cancelled: boolean;
  suggested?: boolean;
};

export function keepFittingSuggestions<E extends SuggestableEvent>(
  events: readonly E[],
  week: { lessons: readonly FitLesson[] },
  prefs: readonly MergePreference[],
): E[] {
  if (!events.some((e) => e.suggested)) return [...events];
  const lessons = ownLessons(week.lessons, prefs);
  return events.filter(
    (e) =>
      !e.suggested ||
      (!e.cancelled &&
        !lessons.some((l) => l.dayOfWeek === e.dayOfWeek && overlaps(l, e))),
  );
}
