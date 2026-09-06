import type { TimetableView } from "@/lib/timetable";
import { buildDayModel, type DaySegment } from "./day";
import type { WeekModel } from "./week";

//* ---------------------------------------------------------------------------
//* A TANÁR HETE — amit a diáké nem kérdez
//* ---------------------------------------------------------------------------
//! KÜLÖN FÁJL, NEM EGY `mode` A `week.ts`-BEN. A `week.ts` levezetései a diák
//! kérdéseire válaszolnak: melyik TANTÁRGYBÓL mennyi óra, és hol vár még
//! csoportbontás-döntés. A tanárnak az első kérdés majdnem értelmetlen (egy
//! tantárgyat tanít, esetleg kettőt), a második pedig egyáltalán nem létezik:
//! ha egy osztály három csoportját ő tartja, az nem három lehetőség, hanem egy
//! óra (lásd `teacherLessons` a `lib/timetable.ts`-ben).
//!
//! AMIT VISZONT KÉRDEZ, ÉS A DIÁK NEM: MELYIK OSZTÁLYOKAT látja a héten, és
//! MIKOR VAN LYUKASÓRÁJA. Az első a tanári kártya főcíme heti összegben; a
//! második azért, mert a tanár napjában valódi lyukak vannak — a diákéban
//! ritkán —, és „mikor érek rá" egy tanári órarend leggyakoribb kérdése.

/** Egy osztály heti terhelése a tanár szemszögéből. */
export type ClassLoad = {
  /** Az osztály rövid jele — ez az azonosító és a felirat is. */
  short: string;
  /** A teljes név, ha eltér a rövidtől (a listán csak megkülönböztetésre). */
  name: string;
  minutes: number;
  lessons: number;
  /** Hány különböző napon találkozik velük. */
  days: number;
};

/** Egy lyukasóra a hét egy napján. */
export type FreeSlot = {
  dateKey: string;
  dayName: string;
  startMin: number;
  endMin: number;
};

export type TeacherWeek = {
  classes: ClassLoad[];
  free: FreeSlot[];
  freeMinutes: number;
};

//! A NETTÓ PERC A TANÍTÁSI IDŐ, nem a blokk hossza. Ugyanaz a szabály, mint a
//! `week.ts`-ben: egy háromórás blokkban benne van két tízperces szünet, és
//! azokat a tanár sem tanítja.
function netMinutes(seg: Extract<DaySegment, { kind: "lesson" }>): number {
  const gross = seg.endMin - seg.startMin;
  const breaks = seg.run.breaks.reduce(
    (sum, b) => sum + (b.endMin - b.startMin),
    0,
  );
  return Math.max(0, gross - breaks);
}

export function buildTeacherWeek(
  view: TimetableView,
  week: WeekModel,
): TeacherWeek {
  const byClass = new Map<string, ClassLoad & { dayKeys: Set<string> }>();
  const free: FreeSlot[] = [];

  for (const weekDay of week.days) {
    //! A TANÁRI NAP FELOLDÁS NÉLKÜL ÉPÜL. Az összevonási döntések a diák
    //! választásai; egy tanári lapon üres tömböt adunk át, mert a forrás
    //! kártyáit már a `teacherLessons` vonta össze oda, ahol az indokolt volt.
    //! A duális beosztás ugyanígy `null`: az a diák saját, osztályonkénti
    //! beállítása, egy tanár készülékén egyetlen tanított osztályra sincs meg.
    const day = buildDayModel(view, [], weekDay.dateKey, null);
    if (!day) continue;

    for (const seg of day.segments) {
      if (seg.kind === "gap") {
        free.push({
          dateKey: day.dateKey,
          dayName: day.dayName,
          startMin: seg.startMin,
          endMin: seg.endMin,
        });
        continue;
      }

      const lesson = seg.run.lesson;
      const short = lesson.classShort;
      //* Osztály nélküli kártya (a forrás hibája vagy egy nem tanári lekérés)
      //* nem kerül a listába: egy „" nevű sor semmit nem mondana.
      if (!short) continue;

      const entry = byClass.get(short) ?? {
        short,
        name: lesson.className || short,
        minutes: 0,
        lessons: 0,
        days: 0,
        dayKeys: new Set<string>(),
      };
      entry.minutes += netMinutes(seg);
      entry.lessons += seg.run.lessonCount;
      entry.dayKeys.add(day.dateKey);
      byClass.set(short, entry);
    }
  }

  const classes = [...byClass.values()]
    .map(({ dayKeys, ...rest }) => ({ ...rest, days: dayKeys.size }))
    //* Terhelés szerint csökkenően; azonos percnél a jel szerint, hogy a
    //* sorrend két egyforma héten ne cserélődjön össze.
    .sort(
      (a, b) => b.minutes - a.minutes || a.short.localeCompare(b.short, "hu"),
    );

  free.sort(
    (a, b) => a.dateKey.localeCompare(b.dateKey) || a.startMin - b.startMin,
  );

  return {
    classes,
    free,
    freeMinutes: free.reduce((sum, s) => sum + (s.endMin - s.startMin), 0),
  };
}

//! ─── ÜTKÖZÉS ──────────────────────────────────────────────────────────────
//! A DIÁKNÁL EZ KÉRDÉS, A TANÁRNÁL BAJ. Ha a diák napján két óra fedi egymást,
//! az csoportbontás: „melyik a tiéd?" — és a lap megkérdezi. A tanárén
//! ugyanez azt jelenti, hogy KÉT OSZTÁLY vár rá ugyanabban a percben, két
//! különböző teremben. A `teacherLessons` szándékosan nem vonja össze őket
//! (órarendi hiba vagy helyettesítés), és mi sem tüntetjük el: nincs mit
//! választani, csak tudni kell róla.
export type Clash = {
  startMin: number;
  endMin: number;
  /** A versengő órák rövid leírása — „13C · 214", „12A · 303". */
  labels: string[];
};

export function clashesOf(segments: DaySegment[]): Clash[] {
  const lessons = segments.filter(
    (s): s is Extract<DaySegment, { kind: "lesson" }> => s.kind === "lesson",
  );
  //* A sávok már a `day.ts`-ben kiosztódtak: ami egynél több sávban áll, az
  //* átfed. Egy percre eső csoportot EGY ütközésként jelentünk, nem párokként.
  const out: Clash[] = [];
  for (const seg of lessons) {
    if (seg.lanes <= 1) continue;
    const label = describe(seg);
    const open = out.find(
      (c) => seg.startMin < c.endMin && seg.endMin > c.startMin,
    );
    if (open) {
      open.startMin = Math.min(open.startMin, seg.startMin);
      open.endMin = Math.max(open.endMin, seg.endMin);
      if (!open.labels.includes(label)) open.labels.push(label);
    } else {
      out.push({ startMin: seg.startMin, endMin: seg.endMin, labels: [label] });
    }
  }
  //* Egy sáv magában nem ütközés — a párja lehet, hogy egy másik percben áll.
  return out.filter((c) => c.labels.length > 1);
}

function describe(seg: Extract<DaySegment, { kind: "lesson" }>): string {
  const lesson = seg.run.lesson;
  const who = lesson.classShort || lesson.subjectShort || lesson.subject;
  const room = seg.run.rooms.join(" · ");
  return room ? `${who} · ${room}` : who;
}
