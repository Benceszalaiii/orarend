import type { AgendaItem } from "@/components/timetable/now";
import { sortAgenda } from "@/components/timetable/now";
import { addDaysKey } from "@/components/timetable/shared";
import { type DualSchedule, dualStatusFor } from "@/lib/dual-schedule";
import type { DualStatus } from "@/lib/dualis";
import type { TimetableView } from "@/lib/timetable";
import {
  type LessonRun,
  type MergePreference,
  resolveDay,
} from "@/lib/timetable-merge";

//* ---------------------------------------------------------------------------
//* A NAP MODELLJE
//* ---------------------------------------------------------------------------
//! A heti rács `dayOfWeek`-kel gondolkodik, ez a nézet viszont EGY napról szól,
//! és a napnak dátuma van. Ez a modul fordít a kettő közt, és egyetlen helyen
//! dönti el, mit jelent „a mai nap": melyik órák a sajátjaim (csoportbontás
//! feloldva), hol vannak a lyukasórák, mikor végzek, és mozdult-e valami.
//!
//! TISZTA FÜGGVÉNYEK, óra nélkül. A „most" a `now.ts` dolga; itt csak az az
//! anyag készül el, amiből az kiszámolható — így a modell a szerveren és a
//! kliensen ugyanaz, és nincs hidratálási eltérés.

export type DaySegment =
  | {
      kind: "lesson";
      key: string;
      startMin: number;
      endMin: number;
      run: LessonRun;
      //! SÁVOK AZ ÜTKÖZŐ ÓRÁKNAK. Feloldatlan csoportbontásnál két óra ugyanarra
      //! a percre esik; egyetlen soron egymásra rajzolódnának, és a felső
      //! egyszerűen eltakarná a másikat — a napból pont az veszne el, hogy ott
      //! döntés vár. Ilyenkor a szakasz vízszintesen osztozik.
      lane: number;
      lanes: number;
    }
  //* Lyukasóra: nem üresség, hanem a nap része — a hossza adat.
  | { kind: "gap"; key: string; startMin: number; endMin: number };

export type DayModel = {
  dateKey: string;
  /** „Hétfő", „Kedd" … a forrás saját elnevezésével. */
  dayName: string;
  dayOfWeek: number;
  /** A diák saját duális beosztása szerint: munkahely, iskola, vagy nem eldönthető. */
  dual: DualStatus;
  /** Órák és lyukasórák időrendben, az első óra kezdetétől az utolsó végéig. */
  segments: DaySegment[];
  /** Ugyanez a „most" számításához illő alakban. */
  items: AgendaItem[];
  /** Csak azok az órák, amiket a forrás áthelyezettnek jelölt. */
  moved: LessonRun[];
  /** A nap első órájának kezdete és utolsó órájának vége (percben). */
  firstMin: number;
  lastMin: number;
  lessonCount: number;
  //! ELDÖNTETLEN CSOPORTBONTÁS. Amíg egy ütközést nem oldott fel a diák, két óra
  //! állítja ugyanarról a percről, hogy „most ez megy" — és a napi nézetnek
  //! nincs vezérlője, amivel ezt itt helyben elintézhetné. A szám azért kerül a
  //! modellbe, hogy a lap ki tudja írni: a döntés a heti nézetben vár.
  conflicts: number;
};

//! LYUKASÓRA-KÜSZÖB. A 10 perces szünet nem lyukasóra, és a rácson sem az: a
//! `MERGE_GAP_MAX_MIN` (25 perc) ugyanezt a határt húzza meg az órák
//! összefűzésénél. Ami ennél hosszabb, az már saját szakasz — annyi helyet is
//! kap a nap sávjában.
const GAP_MIN_MIN = 25;

export function buildDayModel(
  view: TimetableView,
  prefs: MergePreference[],
  dateKey: string,
  //! A DUÁLIS BEOSZTÁS KÍVÜLRŐL JÖN, NEM SZABÁLYBÓL. `null` = ez az osztály még
  //! nincs beállítva; olyankor a modell nem állít duális napot (lásd
  //! `dual-schedule.ts`).
  dualSchedule: DualSchedule | null,
): DayModel | null {
  const day = view.days.find((d) => d.dateKey === dateKey);
  if (!day) return null;

  const dayLessons = view.lessons.filter((l) => l.dayOfWeek === day.dayOfWeek);
  //! A CSOPORTBONTÁS FELOLDÁSA ITT NEM DÍSZ. A Jedlikinfo a osztály MINDEN
  //! párhuzamos csoportját visszaadja; feloldás nélkül két óra állítaná
  //! ugyanarról a percről, hogy „most ez megy". A napi nézet feloldva vagy
  //! sehogy.
  const { runs, conflicts } = resolveDay(dayLessons, prefs, view.periods);
  const ordered = [...runs].sort(
    (a, b) => a.startMin - b.startMin || a.endMin - b.endMin,
  );

  const lanes = assignLanes(ordered);
  const segments: DaySegment[] = [];
  //* A lyukasóra a nap addig ELÉRT végéhez képest számol, nem az előző
  //* szakaszhoz: ütköző óráknál az előző elem rövidebb is lehet a párjánál.
  let reached = Number.NEGATIVE_INFINITY;
  for (const run of ordered) {
    if (
      reached > Number.NEGATIVE_INFINITY &&
      run.startMin - reached >= GAP_MIN_MIN
    ) {
      segments.push({
        kind: "gap",
        key: `gap-${reached}-${run.startMin}`,
        startMin: reached,
        endMin: run.startMin,
      });
    }
    const lane = lanes.get(run.key);
    segments.push({
      kind: "lesson",
      key: run.key,
      startMin: run.startMin,
      endMin: run.endMin,
      run,
      lane: lane?.lane ?? 0,
      lanes: lane?.lanes ?? 1,
    });
    reached = Math.max(reached, run.endMin);
  }

  const items = sortAgenda(
    ordered.map((run) => agendaItem(run, day.dateKey, day.name)),
  );

  return {
    dateKey: day.dateKey,
    dayName: day.name,
    dayOfWeek: day.dayOfWeek,
    dual: dualStatusFor(dualSchedule, day.dayOfWeek, weekLetterOf(view)),
    segments,
    items,
    moved: ordered.filter((r) => r.lesson.moved),
    firstMin: ordered[0]?.startMin ?? 0,
    lastMin: ordered[ordered.length - 1]?.endMin ?? 0,
    lessonCount: ordered.length,
    conflicts: conflicts.length,
  };
}

//! A HÉTVÉGE NEM ÜRES ÁLLAPOT. Szombaton a „ma nincs órád" igaz, de haszontalan:
//! akkor nyitják meg a lapot, hogy a HÉTFŐT nézzék meg. A nézet ezért nem a mai
//! napra áll rá, hanem a következő TANÍTÁSI napra — ha az nem ma van, a fejléc
//! kimondja.
export function focusDayKey(today: string): string {
  const [y, m, d] = today.split("-").map(Number);
  const dow = ((new Date(y, m - 1, d).getDay() + 6) % 7) + 1;
  if (dow <= 5) return today;
  return addDaysKey(today, dow === 6 ? 2 : 1);
}

//! Időben átfedő órák sávokra bontása. Ugyanaz a gondolat, mint a heti rács
//! `layoutDay`-ében, csak egy dimenzióval kevesebb: az egymást fedő futamok
//! közös csoportot alkotnak, és a csoport MINDEN tagja ugyanannyi sávra osztozik
//! — így a szakaszok magassága a sávon belül végig egyforma marad.
function assignLanes(
  runs: LessonRun[],
): Map<string, { lane: number; lanes: number }> {
  const out = new Map<string, { lane: number; lanes: number }>();
  let cluster: LessonRun[] = [];
  let clusterEnd = Number.NEGATIVE_INFINITY;

  const flush = () => {
    if (cluster.length === 0) return;
    const ends: number[] = [];
    const laneOf = new Map<string, number>();
    for (const run of cluster) {
      let lane = ends.findIndex((end) => end <= run.startMin);
      if (lane === -1) {
        lane = ends.length;
        ends.push(run.endMin);
      } else {
        ends[lane] = run.endMin;
      }
      laneOf.set(run.key, lane);
    }
    for (const run of cluster) {
      out.set(run.key, { lane: laneOf.get(run.key) ?? 0, lanes: ends.length });
    }
    cluster = [];
    clusterEnd = Number.NEGATIVE_INFINITY;
  };

  for (const run of runs) {
    if (cluster.length > 0 && run.startMin >= clusterEnd) flush();
    cluster.push(run);
    clusterEnd = Math.max(clusterEnd, run.endMin);
  }
  flush();
  return out;
}

export function agendaItem(
  run: LessonRun,
  dateKey: string,
  dayName: string,
): AgendaItem {
  return {
    key: run.key,
    kind: "lesson",
    dateKey,
    dayOfWeek: run.dayOfWeek,
    dayName,
    startMin: run.startMin,
    endMin: run.endMin,
    title: run.lesson.subjectShort || run.lesson.subject,
    fullTitle: run.lesson.subject || run.lesson.subjectShort,
    meta: [
      run.rooms.join(" · "),
      run.lesson.teacher || run.lesson.teacherShort,
    ].filter(Boolean),
    accentSeed: run.lesson.subjectShort || run.lesson.subject,
  };
}

//! A HÉT JELÖLÉSE A HÉTÉ, NEM A NAPÉ. A Jedlikinfo egyes napokra üres jelölést
//! ad (tanítás nélküli hétfő), a hét egésze viszont egyértelmű — ezért az első
//! értelmes napból olvassuk ki. (Ugyanez a logika a `/dualis` lapon is.)
export function weekLetterOf(view: TimetableView): string {
  return view.days.find((d) => d.week === "A" || d.week === "B")?.week ?? "";
}

//! A HÉT TÖBBI NAPJA. A „mára vége" ág ide mutat: a következő tétel nem a mai
//! napból jön, hanem a hét egy KÉSŐBBI napjából — és a `now.ts` rendezése a
//! dátumot veszi előre, tehát a napokat is dátum szerint adjuk át.
export function laterItemsOf(
  view: TimetableView,
  prefs: MergePreference[],
  afterDateKey: string,
): AgendaItem[] {
  const items: AgendaItem[] = [];
  for (const day of view.days) {
    if (day.dateKey <= afterDateKey) continue;
    const { runs } = resolveDay(
      view.lessons.filter((l) => l.dayOfWeek === day.dayOfWeek),
      prefs,
      view.periods,
    );
    for (const run of runs) items.push(agendaItem(run, day.dateKey, day.name));
  }
  return sortAgenda(items);
}

//! A NAP EGY MONDATBAN. Ez a napi ellenőrzés lényege: mielőtt bármit
//! elolvasnál, ez megmondja, van-e ma dolgod és tartogat-e meglepetést.
export function daySummary(day: DayModel, isToday: boolean): string {
  //! A NAP VÁLASZTHATÓ, A SZÖVEG PEDIG NEM HAZUDHAT RÓLA. A műszerfalon
  //! bármelyik napra rá lehet állni; egy péntekre írt „Ma nincs órád" a lap
  //! legkönnyebben elhihető és legrosszabb tévedése lenne.
  const when = isToday ? "Ma" : "Ezen a napon";
  if (day.dual === "dual") {
    return isToday
      ? "Ma duális nap — a munkahelyen vagy."
      : "Duális nap — ezt a napot a munkahelyen töltöd.";
  }
  if (day.lessonCount === 0) return `${when} nincs órád.`;
  const gaps = day.segments.filter((s) => s.kind === "gap").length;
  const parts = [`${day.lessonCount} óra`];
  if (gaps > 0) parts.push(gaps === 1 ? "1 lyukasóra" : `${gaps} lyukasóra`);
  return parts.join(" · ");
}
