//! ─── DUÁLIS ÓRAREND-TERVEK ─────────────────────────────────────────────────
//! A duális diák nem egy osztály órarendjét járja: a 13A mindkét csoportjából
//! és a 13C-ből válogat. A szabály EGY van — egy tantárgy egy csoportból megy,
//! vagyis a `csh` minden órája ugyanannál a tanárnál. Az, hogy melyik tantárgy
//! melyik csoportból jön, szabadon variálható; ez a fájl állítja elő az ÖSSZES
//! ilyen variációt, és rangsorolja őket.
//!
//! FONTOS TÉNY, amit a rács nem mond ki: a 13A és a 13C PÁRHUZAMOSAN fut, tehát
//! az óráik ütköznek. Nincs olyan terv, amiben minden tantárgy teljes óraszáma
//! elfér — mindig áldozni kell. A tervek ezért két fajtában készülnek:
//!
//!   • TISZTA terv: kevesebb tantárgy, de amit viszel, azt TELJES óraszámban,
//!     nulla ütközéssel. A többi tantárgy „feláldozva" néven kilistázva.
//!   • RÉSZLEGES terv: minden tantárgy benne van egy-egy csoporttal, de az
//!     ütköző órákról le kell mondani — a terv megmondja, hányról.

import { dualBlockLesson, dualStatusOf } from "./dualis";
import {
  addDays,
  getTimetableWeek,
  type TimetableDay,
  type TimetableLesson,
  type TimetablePeriod,
} from "./timetable";

//* A 13A a tanterv gazdája, a 13C-ből csak az ehhez illő tantárgyak jöhetnek.
const CURRICULUM_CLASS = "13A";
const SOURCE_CLASSES = ["13A", "13C"] as const;

//! A TERVEK SZÁMA ELVILEG ROBBAN, GYAKORLATBAN NEM: csak a több csoportot is
//! kínáló tantárgyak ágaznak el (A-héten hat ilyen van → 64 hozzárendelés).
//! Ezek a korlátok a patológiás eseteket fogják meg, hogy a böngésző soha ne
//! fagyjon le egy váratlan tantervváltozás miatt.
const MAX_SUBJECTS = 20;
const MAX_ASSIGNMENTS = 4096;
//* A választóban A–Z fér el; ennél többet nem is mutatunk.
export const MAX_PLANS = 26;

export type DualPlanKind = "clean" | "partial";

export type DualPlan = {
  /** „A", „B", „C" … — ez jelenik meg a választóban. */
  id: string;
  kind: DualPlanKind;
  /** Ténylegesen látogatott tanórák száma. */
  hours: number;
  /** Részleges tervnél: ennyi óráról kell lemondani ütközés miatt. */
  skipped: number;
  /** Amit viszel. */
  subjects: string[];
  /** Amit feláldozol (tiszta tervnél teljes tantárgyak). */
  sacrificed: string[];
  /** Tantárgy → a választott csoport emberi neve. */
  groups: Record<string, string>;
  /** A tervhez tartozó órák — ebből épül a rács. */
  lessons: TimetableLesson[];
};

export type DualPlanSet = {
  ok: boolean;
  weekStart: string;
  days: TimetableDay[];
  periods: TimetablePeriod[];
  plans: DualPlan[];
  /** Tanítási napok (nem duális) ISO nap-sorszáma. */
  schoolDays: number[];
  /** Csak duális napon futó, ezért elérhetetlen tantárgyak. */
  unreachable: string[];
};

type Sourced = TimetableLesson & { sourceClass: string; groupKey: string };

//* A csoport emberi neve: „13A/A csoport", „13C/Szoftverfejlesztő".
function groupLabel(cls: string, group: string): string {
  const bare = group.includes("-")
    ? group.slice(group.indexOf("-") + 1)
    : group;
  return `${cls}/${bare.replace(new RegExp(`^${cls}\\s+`), "")}`;
}

function overlaps(a: TimetableLesson, b: TimetableLesson): boolean {
  return (
    a.dayOfWeek === b.dayOfWeek &&
    a.startMin < b.endMin &&
    b.startMin < a.endMin
  );
}

//! Az „óraszám" a CSENGETÉSI REND szerint számol, nem percben: a suli a dupla
//! órát egy kártyaként adja vissza, és a diák órákban gondolkodik, nem percben.
function periodsIn(
  lesson: TimetableLesson,
  periods: TimetablePeriod[],
): number {
  const n = periods.filter(
    (p) => p.startMin >= lesson.startMin && p.endMin <= lesson.endMin,
  ).length;
  //* Ha a csengetési rend nem fedi le (rendhagyó sáv), legalább egy órának vesszük.
  return n > 0 ? n : 1;
}

export async function buildDualPlans(weekStart?: string): Promise<DualPlanSet> {
  //! HÁROM LEKÉRÉS. A tanterv a 13A-é, de az A és B hét MÁS tantárgyakat hoz
  //! (`nodejs` pl. csak a B-héten van 13A-ban) — a 13C-s `nodejs` mégis a
  //! tantervbe illik. A szomszéd hetet ezért is lekérjük: ebből áll össze a
  //! teljes 13A-tanterv, amihez a 13C óráit mérjük.
  const [cur13A, cur13C, next13A] = await Promise.all([
    getTimetableWeek({ class: "13A", weekStart }),
    getTimetableWeek({ class: "13C", weekStart }),
    getTimetableWeek({
      class: CURRICULUM_CLASS,
      weekStart: addDays((weekStart ?? cur13AWeekFallback()) as string, 7),
    }),
  ]);

  const base = cur13A.ok ? cur13A : cur13C;
  const empty: DualPlanSet = {
    ok: false,
    weekStart: base.weekStart,
    days: base.days,
    periods: base.periods,
    plans: [],
    schoolDays: [],
    unreachable: [],
  };
  if (!cur13A.ok && !cur13C.ok) return empty;

  const weekLetter =
    base.days.find((d) => d.week === "A" || d.week === "B")?.week ?? "";
  const schoolDays = base.days
    .filter((d) => dualStatusOf(d.dayOfWeek, weekLetter) === "school")
    .map((d) => d.dayOfWeek);

  //* A 13A teljes tanterve két hétből — ez szűri, mely 13C-óra jöhet szóba.
  const curriculum = new Set<string>([
    ...cur13A.lessons.map((l) => l.subjectShort),
    ...next13A.lessons.map((l) => l.subjectShort),
  ]);

  const pool: Sourced[] = [];
  for (const cls of SOURCE_CLASSES) {
    const week = cls === "13A" ? cur13A : cur13C;
    for (const l of week.lessons) {
      if (cls !== CURRICULUM_CLASS && !curriculum.has(l.subjectShort)) continue;
      pool.push({
        ...l,
        key: `${cls}-${l.key}`,
        sourceClass: cls,
        groupKey: groupLabel(cls, l.group),
      });
    }
  }

  //* Tantárgy → csoport → órák, KIZÁRÓLAG a tanítási napokon.
  const bySubject = new Map<string, Map<string, Sourced[]>>();
  for (const l of pool) {
    if (!schoolDays.includes(l.dayOfWeek)) continue;
    const groups = bySubject.get(l.subjectShort) ?? new Map();
    groups.set(l.groupKey, [...(groups.get(l.groupKey) ?? []), l]);
    bySubject.set(l.subjectShort, groups);
  }

  const allSubjects = new Set(pool.map((l) => l.subjectShort));
  const subjects = [...bySubject.keys()].sort();
  const unreachable = [...allSubjects].filter((s) => !bySubject.has(s)).sort();

  const n = subjects.length;
  if (n === 0 || n > MAX_SUBJECTS) {
    return { ...empty, ok: n === 0, schoolDays, unreachable };
  }

  const groupsOf = subjects.map((s) =>
    [...(bySubject.get(s) as Map<string, Sourced[]>).keys()].sort(),
  );
  const assignmentCount = groupsOf.reduce((acc, g) => acc * g.length, 1);
  if (assignmentCount > MAX_ASSIGNMENTS) {
    return { ...empty, ok: false, schoolDays, unreachable };
  }

  const lessonsOf = (i: number, group: string) =>
    (bySubject.get(subjects[i]) as Map<string, Sourced[]>).get(group) ?? [];

  type Candidate = {
    kind: DualPlanKind;
    hours: number;
    skipped: number;
    taken: number[];
    picks: string[];
    lessons: Sourced[];
  };
  const candidates = new Map<string, Candidate>();

  //* Az összes tantárgy→csoport hozzárendelés bejárása (kartéziánus szorzat).
  const pick = new Array<number>(n).fill(0);
  for (let a = 0; a < assignmentCount; a++) {
    let rest = a;
    for (let i = 0; i < n; i++) {
      pick[i] = rest % groupsOf[i].length;
      rest = Math.floor(rest / groupsOf[i].length);
    }
    const chosen = subjects.map((_, i) => groupsOf[i][pick[i]]);
    const sel = subjects.map((_, i) => lessonsOf(i, chosen[i]));
    const hoursOf = sel.map((ls) =>
      ls.reduce((sum, l) => sum + periodsIn(l, base.periods), 0),
    );

    //* Ütközés-maszk tantárgyak között.
    const conf = new Array<number>(n).fill(0);
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        if (sel[i].some((x) => sel[j].some((y) => overlaps(x, y)))) {
          conf[i] |= 1 << j;
          conf[j] |= 1 << i;
        }
      }
    }

    //! TISZTA TERVEK: a tantárgy-gráf MAXIMÁLIS független halmazai. „Maximális"
    //! = nem bővíthető tovább; a nem bővíthetőség a lényeg, különben minden
    //! részhalmaz külön tervnek látszana.
    const total = 1 << n;
    for (let mask = 0; mask < total; mask++) {
      let ok = true;
      for (let i = 0; i < n && ok; i++) {
        if (mask & (1 << i) && conf[i] & mask) ok = false;
      }
      if (!ok) continue;
      let maximal = true;
      for (let i = 0; i < n && maximal; i++) {
        if (!(mask & (1 << i)) && !(conf[i] & mask)) maximal = false;
      }
      if (!maximal) continue;

      const taken: number[] = [];
      let hours = 0;
      const lessons: Sourced[] = [];
      for (let i = 0; i < n; i++) {
        if (mask & (1 << i)) {
          taken.push(i);
          hours += hoursOf[i];
          lessons.push(...sel[i]);
        }
      }
      //* Azonosság: mit viszel és melyik csoportból. A nem vitt tantárgy
      //* csoportválasztása nem különböztet meg két tervet.
      const sig = taken.map((i) => `${subjects[i]}@${chosen[i]}`).join("|");
      if (!candidates.has(sig)) {
        candidates.set(sig, {
          kind: "clean",
          hours,
          skipped: 0,
          taken,
          picks: chosen,
          lessons,
        });
      }
    }

    //! RÉSZLEGES TERV: minden tantárgy benne, ütköző órákat kihagyva. Az
    //! elhagyás mohó, IDŐREND szerint — így a legkorábbi óra marad meg, ami
    //! ugyanaz a döntés, amit a diák a helyszínen hozna.
    const flat = sel
      .flat()
      .sort((x, y) => x.dayOfWeek - y.dayOfWeek || x.startMin - y.startMin);
    const kept: Sourced[] = [];
    let skipped = 0;
    for (const l of flat) {
      if (kept.some((k) => overlaps(k, l))) skipped++;
      else kept.push(l);
    }
    if (skipped > 0) {
      const sig = `partial:${chosen.join("|")}`;
      if (!candidates.has(sig)) {
        candidates.set(sig, {
          kind: "partial",
          hours: kept.reduce((s, l) => s + periodsIn(l, base.periods), 0),
          skipped,
          taken: subjects.map((_, i) => i),
          picks: chosen,
          lessons: kept,
        });
      }
    }
  }

  //! RANGSOR: előbb a tiszta tervek óraszám szerint, utána a részlegesek a
  //! kihagyott órák szerint. A felhasználó ezt kérte: „tiszta tervek elöl, a
  //! részlegesek megjelölve".
  const ranked = [...candidates.values()].sort((x, y) => {
    if (x.kind !== y.kind) return x.kind === "clean" ? -1 : 1;
    if (x.kind === "clean")
      return y.hours - x.hours || y.taken.length - x.taken.length;
    return x.skipped - y.skipped || y.hours - x.hours;
  });

  const dualDays = base.days.filter(
    (d) => dualStatusOf(d.dayOfWeek, weekLetter) === "dual",
  );

  const plans: DualPlan[] = ranked.slice(0, MAX_PLANS).map((c, i) => {
    const takenSubjects = c.taken.map((k) => subjects[k]);
    const groups: Record<string, string> = {};
    for (const k of c.taken) groups[subjects[k]] = c.picks[k];
    return {
      id: String.fromCharCode(65 + i),
      kind: c.kind,
      hours: c.hours,
      skipped: c.skipped,
      subjects: takenSubjects,
      sacrificed: subjects.filter((s) => !takenSubjects.includes(s)),
      groups,
      //* A duális napok tömbje minden tervben ott van — az a nap nem róluk szól.
      lessons: [...c.lessons, ...dualDays.map(dualBlockLesson)],
    };
  });

  return {
    ok: plans.length > 0,
    weekStart: base.weekStart,
    days: base.days,
    periods: base.periods,
    plans,
    schoolDays,
    unreachable,
  };
}

//* Csak azért létezik, hogy a `weekStart` elhagyható maradjon: a szomszéd hét
//* számításához kell egy konkrét dátum.
function cur13AWeekFallback(): string {
  const d = new Date();
  const utc = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const isoDow = ((utc.getUTCDay() + 6) % 7) + 1;
  utc.setUTCDate(utc.getUTCDate() - (isoDow - 1));
  return utc.toISOString().slice(0, 10);
}
