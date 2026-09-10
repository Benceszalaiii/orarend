//! ═══════════════════════════════════════════════════════════════════════════
//! A NAPTÁR-FEED TARTALMA — AMI A RÁCSON LÁTSZIK, ÉS SEMMI MÁS
//! ═══════════════════════════════════════════════════════════════════════════
//! EZ A MODUL AZ EGÉSZ FUNKCIÓ ÍGÉRETE. A feedben pontosan azok az órák
//! vannak, amiket a diák a rácson is lát: a csoportbontásból KIVÁLASZTOTT ág,
//! és nem az, amit elrejtett. Ha ez elcsúszik, a funkció nem „pontatlan",
//! hanem HASZNÁLHATATLAN — rosszabb a semminél, mert a telefon naptára
//! olyan órára emlékeztet, amire nem jár.
//!
//! EZÉRT NEM ÍRJUK ÚJRA A SZŰRÉST. Ugyanaz a `resolveDay` fut itt, mint a
//! rácson (`timetable-merge.ts`), ugyanazzal a `MergePreference[]` listával és
//! ugyanazzal a napi csengetési renddel. Egy második, „szerveroldali"
//! értelmezés előbb-utóbb MÁST mutatna, és a különbség pont az a fajta lenne,
//! ami csak két hét múlva, egy elmaradt óra után derül ki.
//!
//! ITT NINCS HÁLÓZAT ÉS NINCS TÁROLÓ. A hetek adata, a döntések és a generálás
//! pillanata mind paraméter — ugyanaz a szabály, mint a `push-plan.ts`-ben:
//! egy naptár-feed hibája napokkal később, egy idegen alkalmazásban látszik
//! meg, tehát tesztből kell kiderülnie, nem élesben.
//! ═══════════════════════════════════════════════════════════════════════════

import { minLabel, rangeLabel } from "@/components/timetable/shared";
import { type DualSchedule, dualStatusFor } from "./dual-schedule";
import { DUAL_DAY_END_MIN, DUAL_DAY_START_MIN } from "./dualis";
import type { IcsEvent } from "./ics";
import {
  periodsOfDay,
  type TimetableDay,
  type TimetableLesson,
  type TimetablePeriod,
  type TimetableSubjectKind,
} from "./timetable";
import {
  groupLabel,
  type LessonRun,
  type MergePreference,
  resolveDay,
} from "./timetable-merge";

/** Egy lekért hét — a `TimetableWeek` azon része, amiből esemény lesz. */
export type FeedWeek = {
  weekStart: string;
  days: TimetableDay[];
  periods: TimetablePeriod[];
  lessons: TimetableLesson[];
};

export type FeedInput = {
  kind: TimetableSubjectKind;
  /** Az alany jele — az UID névterébe és a naptár nevébe kerül. */
  short: string;
  weeks: readonly FeedWeek[];
  prefs: readonly MergePreference[];
  /** A diák saját duális beosztása, vagy `null`, ha nincs beállítva. */
  dual: DualSchedule | null;
};

//! ─── AZ UID: RÖVID, STABIL, ÉS ASCII ───────────────────────────────────────
//! A nap + a kezdés már majdnem egyedi, de nem teljesen: két párhuzamos
//! csoport órája ugyanabban a percben kezdődik, és ha a diák MINDKETTŐT
//! megtartotta (van ilyen: nem ütköző, egymás után futó bontás), két esemény
//! kerül ugyanarra a percre. Az azonosság harmadik fele ezért az óra
//! IDENTITÁSA — csakhogy az ékezetes, elválasztó karaktereket tartalmazó
//! szöveg, amit az UID-be nem írhatunk be. Egy rövid lenyomat megoldja: nem
//! kell visszafejthetőnek lennie, csak ugyanarra az órára ugyanannak.
//*
//* Ugyanaz a djb2, amit a `changeFingerprint` használ — egy második hash-
//* megoldás ugyanarra a feladatra csak abban segítene, hogy kétszer lehessen
//* elrontani.
function shortHash(value: string): string {
  let hash = 5381;
  for (let i = 0; i < value.length; i++) {
    hash = ((hash << 5) + hash + value.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(36);
}

//! AZ UID NÉVTERE AZ ALANY. Ha valaki az osztálya ÉS a saját tanári órarendjét
//! is felveszi ugyanabba a naptárba, a két feed eseményei ugyanarra az órára
//! eshetnek — közös UID mellett a naptár a kettőt EGYNEK hinné, és az egyik
//! némán eltüntetné a másikat.
function eventUid(input: {
  kind: TimetableSubjectKind;
  short: string;
  dateKey: string;
  startMin: number;
  identity: string;
}): string {
  const subject = shortHash(`${input.kind}:${input.short}`);
  const slot = `${input.dateKey.replaceAll("-", "")}-${input.startMin}`;
  return `${slot}-${shortHash(input.identity)}-${subject}@orarend.jedlik.info`;
}

//! ─── A CÍM: AMI A ZÁROLT KÉPERNYŐN IS OTT VAN ──────────────────────────────
//! Ugyanaz az olvasat, mint az értesítéseknél (`push-plan.ts`) és a
//! változásfigyelésnél: a DIÁK órarendjén a tantárgy a hír, a TANÁRÉN az
//! osztály — neki minden órája ugyanaz a tantárgy, abból nem tudja megmondani,
//! hova kell bemennie.
function summaryOf(lesson: TimetableLesson): string {
  const subject = lesson.subject || lesson.subjectShort || "Óra";
  const cls = lesson.classShort || lesson.className;
  return cls ? `${cls} ${subject}` : subject;
}

//* A leírás sorai. Ami már a címben vagy a helyszínben áll, az ide nem kerül be
//* újra — egy naptárbejegyzés nem leltár.
function descriptionOf(run: LessonRun): string {
  const lesson = run.lesson;
  const lines: string[] = [];

  const teacher = lesson.teacher || lesson.teacherShort;
  if (teacher) lines.push(teacher);

  //* Csoportbontott óra: a csoport neve megmondja, MELYIK ágat tartotta meg a
  //* diák — ez az egyetlen hely, ahol a naptárból visszaellenőrizhető.
  if (!lesson.wholeClass && lesson.group) {
    lines.push(groupLabel(lesson.group, lesson.subject));
  }

  if (run.lessonCount > 1) {
    lines.push(`${run.lessonCount} óra egyben`);
  }

  //! A BLOKKON BELÜLI SZÜNET NEM RÉSZLETKÉRDÉS. A suli a dupla órát EGY
  //! kártyaként adja vissza, tehát az esemény 8:00–9:35 — a közepén viszont ott
  //! van a tízperc, és pont ez az, amit a diák a naptárból nem látna.
  for (const gap of run.breaks) {
    lines.push(`Szünet: ${rangeLabel(gap.startMin, gap.endMin)}`);
  }

  //* A forrás „áthelyezve" jelölése, változatlanul — nem mi következtetjük ki.
  if (lesson.moved) lines.push("Áthelyezve");

  return lines.join("\n");
}

//! ─── A HÉT A/B JELÖLÉSE A HÉTÉ, NEM A NAPÉ ─────────────────────────────────
//! Szó szerint ugyanaz a megfontolás, mint a rácson (`calendar.tsx`): a
//! Jedlikinfo egyes napokra üres `week`-et ad (pl. egy tanítás nélküli
//! hétfőre), a hét egészére viszont mindig ad betűt. Ha a napéból olvasnánk, a
//! duális beosztás minden ilyen napon „nem tudjuk"-ra esne.
function weekLetterOf(week: FeedWeek): string {
  return week.days.find((d) => d.week === "A" || d.week === "B")?.week ?? "";
}

export function feedEvents(input: FeedInput): IcsEvent[] {
  const { kind, short, prefs, dual } = input;
  const events: IcsEvent[] = [];

  for (const week of input.weeks) {
    const weekLetter = weekLetterOf(week);
    const byDay = new Map<number, TimetableLesson[]>();
    for (const lesson of week.lessons) {
      byDay.set(lesson.dayOfWeek, [
        ...(byDay.get(lesson.dayOfWeek) ?? []),
        lesson,
      ]);
    }

    for (const day of week.days) {
      const dayLessons = byDay.get(day.dayOfWeek) ?? [];

      //! ─── A DUÁLIS NAP HELYÉN EGY BLOKK ÁLL ──────────────────────────────
      //! A rács azon a napon a nap óráit egyetlen 8:00–15:00 kártyára cseréli
      //! (lásd `calendar.tsx`), mert az osztály órarendje nem a diák napja —
      //! ő a munkahelyen van. A naptárban ez MÉG fontosabb: egy 8 órai
      //! „matek" emlékeztető egy munkanapon nem pontatlanság, hanem téves
      //! riasztás.
      //*
      //! CSAK OTT, AHOL VAN MIT FELVÁLTANI. Adat nélküli napra (szünet,
      //! forráshiba) nem találunk ki duális napot — a nap üressége a hír.
      if (
        dayLessons.length > 0 &&
        dualStatusFor(dual, day.dayOfWeek, weekLetter) === "dual"
      ) {
        events.push({
          uid: eventUid({
            kind,
            short,
            dateKey: day.dateKey,
            startMin: DUAL_DAY_START_MIN,
            identity: "dual",
          }),
          dateKey: day.dateKey,
          startMin: DUAL_DAY_START_MIN,
          endMin: DUAL_DAY_END_MIN,
          summary: "Duális képzés",
          description: `${minLabel(DUAL_DAY_START_MIN)}–${minLabel(DUAL_DAY_END_MIN)} · a munkahelyen`,
        });
        continue;
      }

      //! A CSENGETÉSI REND A NAPÉ, NEM A HÉTÉ. Rövidített napon a blokkon
      //! belüli szünetek máshol vannak; a `periodsOfDay` ugyanazt a választ
      //! adja, mint a rácson.
      const periods = periodsOfDay({ periods: week.periods }, day);
      const { runs } = resolveDay(dayLessons, [...prefs], periods);

      for (const run of runs) {
        //! A `ghosts` SZÁNDÉKOSAN KIMARAD. Az a teljesen elrejtett klaszter: a
        //! rácson egy halvány, üres hely jelzi, hogy „ide döntésed miatt nem
        //! kerül óra" — a naptárban viszont semmi keresnivalója. Pont ez a
        //! funkció kérése: amit a diák nem akar látni, az a naptárába se
        //! kerüljön be.
        events.push({
          uid: eventUid({
            kind,
            short,
            dateKey: day.dateKey,
            startMin: run.startMin,
            identity: run.identity,
          }),
          dateKey: day.dateKey,
          startMin: run.startMin,
          endMin: run.endMin,
          summary: summaryOf(run.lesson),
          location: run.rooms.join(" / "),
          description: descriptionOf(run),
        });
      }
    }
  }

  //! RENDEZETTEN ADJUK ÁT. A szabvány nem kéri, de egy óránként újragenerált
  //! fájlnál sokat ér: két egymás utáni kimenet így SZÖVEGKÉNT is csak ott tér
  //! el, ahol az órarend megváltozott — ezzel lehet egyáltalán ránézésre
  //! eldönteni, történt-e valami.
  return events.sort(
    (a, b) =>
      a.dateKey.localeCompare(b.dateKey) ||
      a.startMin - b.startMin ||
      a.uid.localeCompare(b.uid),
  );
}

/** A naptár neve, ahogy a telefon naptárlistájában megjelenik. */
export function feedName(kind: TimetableSubjectKind, short: string): string {
  return kind === "teacher" ? `${short} órarendje` : `${short} órarend`;
}
