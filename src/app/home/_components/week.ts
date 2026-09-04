import type { CalendarEvent } from "@/components/timetable/lesson-block";

//! A NYITÓLAP EGYETLEN TÁRGYA: EGY VALÓDI HÉT. A lap nem három szakaszból áll,
//! hanem egyetlen rácsból, amit háromszor máshonnan nézünk meg. A rács adata
//! ezért ITT áll, egy helyen — a kameraállások (`film.tsx`) erre a
//! koordináta-rendszerre hivatkoznak.
//*
//! ─── AZ ADAT NEM KITALÁLT ──────────────────────────────────────────────────
//! Minden óra, terem, tanár, csoport és időpont a Jedlikinfo API válaszából
//! való: `POST timetable/cards` a `13A` osztályra, `fromDate: 2026-09-28` —
//! egy teljes „B" jelölésű hét. Kitalált tantárgy-terem párokat NE tegyünk
//! ide: a lap arról szól, hogy ez a suli SAJÁT órarendje, és egy lehetetlen
//! óra-terem kombinációt pont az veszi észre, akinek a lap szól.
//*
//! A HÉT „B" JELÖLÉSŰ. A `lib/dualis.ts` szerint B héten a szerda–péntek a
//! munkahelyé, a hétfő–kedd az iskoláé — az API is ezt a jelölést adja vissza
//! mind az öt napra. A rács pontosan ezt rajzolja: két órarendes nap és három
//! duális blokk.
//*
//! ÉS EZÉRT SZÓL A LAP A CSOPORTBONTÁSRÓL. Ezen a héten a hétfő és a kedd
//! MINDEN órája bontott (`groupCount: 2`), az osztályfőnökin kívül — a
//! Jedlikinfo mindkét csoport kártyáját visszaadja, tehát a nyers rács
//! kétszer annyi órát mutat, mint amennyire a diáknak be kell mennie.

//* A nap ábrázolt sávja. A felső határ a hétfői utolsó óra vége (15:15), az
//* alsó a hét legkorábbi kezdése (08:00) — a 0. óra (07:10) ezen a héten üres.
export const DAY_START_MIN = 8 * 60;
export const DAY_END_MIN = 15 * 60 + 15;

//! A RÁCS FIX KÉPPONTOS. Nem azért, mert nem tudna nyúlni, hanem mert az
//! `EventCard` a KAPOTT MAGASSÁGBÓL dönti el, hány sor fér a kártyára
//! (`DENSE_FULL = 56`). Százalékos magasság mellett ez a döntés elromlana, és
//! minden kártya a legszűkebb változatát rajzolná. A rács ezért képpontban él,
//! és a kamera nagyítja — a sűrűség így minden kameraállásban ugyanaz marad.
export const PX_PER_MIN = 1.35;
export const AXIS_W = 48;
//! AZ OSZLOP SZÉLESSÉGE MÉRT, NEM VÁLASZTOTT. A kártya a RÖVID tantárgynevet
//! írja ki (ahogy a rács is), mellette a terem jelvényét — de a hét szinte
//! minden órája bontott, tehát a mértékadó eset a FÉL oszlop. 232-nél a
//! leghosszabb rövid név („Szang", „német") a terem jelvénye mellett is kifér
//! fél sávban; szűkebb oszlopnál épp a csoportbontás kameraállásán harapódna el.
export const COL_W = 232;
export const COL_GAP = 8;
export const HEADER_H = 38;
export const BODY_H = (DAY_END_MIN - DAY_START_MIN) * PX_PER_MIN;
export const BOARD_W = AXIS_W + 5 * COL_W + 4 * COL_GAP;
export const BOARD_H = HEADER_H + BODY_H;

export function colLeft(index: number): number {
  return AXIS_W + index * (COL_W + COL_GAP);
}

export function colCenter(index: number): number {
  return colLeft(index) + COL_W / 2;
}

export function topOf(startMin: number): number {
  return HEADER_H + (startMin - DAY_START_MIN) * PX_PER_MIN;
}

export function heightOf(startMin: number, endMin: number): number {
  return (endMin - startMin) * PX_PER_MIN;
}

//* A csengetési rend az API `periods` tömbjéből, változtatás nélkül. A 0. és a
//* 9. óra kimarad: ezen a héten egyik napon sincs rájuk kártya.
export const PERIODS: readonly { n: number; start: number; end: number }[] = [
  { n: 1, start: 480, end: 525 },
  { n: 2, start: 535, end: 580 },
  { n: 3, start: 590, end: 635 },
  { n: 4, start: 650, end: 695 },
  { n: 5, start: 705, end: 750 },
  { n: 6, start: 760, end: 805 },
  { n: 7, start: 815, end: 860 },
  { n: 8, start: 870, end: 915 },
];

export type DayColumn = {
  index: number;
  name: string;
  dual: boolean;
};

export const DAYS: readonly DayColumn[] = [
  { index: 0, name: "Hétfő", dual: false },
  { index: 1, name: "Kedd", dual: false },
  { index: 2, name: "Szerda", dual: true },
  { index: 3, name: "Csütörtök", dual: true },
  { index: 4, name: "Péntek", dual: true },
];

const CLASS_NAME = "13A";

//! A KÁRTYA A RÖVID NEVET ÍRJA KI, ÉS A SZÍNT IS AZ ADJA. A valódi rácson a
//! `LessonBlock` a `subjectShort || subject` értéket rajzolja, és ugyanabból
//! veti a színárnyalatot (`accentStyle`); a beágyazott `EventCard` ugyanezt a
//! mezőt a `szakkorSlug`-ban kapja. A `full` a teljes név — az a szakaszok
//! szövegébe való, nem a kártyára.
export type Lesson = CalendarEvent & { full: string; teacher: string };

function lesson(
  id: string,
  dayOfWeek: number,
  startMin: number,
  endMin: number,
  short: string,
  full: string,
  room: string,
  teacher: string,
): Lesson {
  return {
    id,
    title: short,
    full,
    teacher,
    dayOfWeek,
    startMin,
    endMin,
    room,
    szakkorName: CLASS_NAME,
    szakkorSlug: short,
    kozossegi: false,
    cancelled: false,
  };
}

//! EGY SÁV, KÉT KÁRTYA. Ez a hét ALAPÁLLAPOTA, nem kivétel: az `a` az „A
//! csoport" órája, a `b` a „B csoporté", és a Jedlikinfo mindkettőt
//! visszaadja. A `whole` az egyetlen bontatlan óra: az osztályfőnöki.
export type Slot = { a: Lesson; b: Lesson } | { whole: Lesson };

export const MONDAY: readonly Slot[] = [
  {
    a: lesson(
      "h1a",
      1,
      480,
      635,
      "Mobil",
      "Mobil alkalmazások fejlesztése",
      "303",
      "BG",
    ),
    b: lesson("h1b", 1, 480, 635, "csh", "C#", "102", "SL"),
  },
  {
    a: lesson("h2a", 1, 650, 805, "csh", "C#", "103", "BP"),
    b: lesson(
      "h2b",
      1,
      650,
      805,
      "Mobil",
      "Mobil alkalmazások fejlesztése",
      "102",
      "BG",
    ),
  },
  {
    a: lesson("h3a", 1, 815, 860, "mat", "Szakmai matematika", "106", "ÁA"),
    b: lesson("h3b", 1, 815, 860, "mat", "Szakmai matematika", "104", "BKE"),
  },
  {
    a: lesson("h4a", 1, 870, 915, "Szang", "Szakmai angol nyelv", "T2", "FE"),
    b: lesson("h4b", 1, 870, 915, "Szang", "Szakmai angol nyelv", "T1", "KIE"),
  },
];

export const TUESDAY: readonly Slot[] = [
  {
    a: lesson("k1a", 2, 480, 525, "német", "Szakmai német nyelv", "209", "BH"),
    b: lesson("k1b", 2, 480, 525, "német", "Szakmai német nyelv", "T5", "TSZ"),
  },
  {
    a: lesson("k2a", 2, 535, 580, "mat", "Szakmai matematika", "207", "ÁA"),
    b: lesson("k2b", 2, 535, 580, "mat", "Szakmai matematika", "106", "BKE"),
  },
  {
    a: lesson("k3a", 2, 590, 750, "csh", "C#", "202", "BP"),
    b: lesson("k3b", 2, 590, 750, "csh", "C#", "303", "SL"),
  },
  { whole: lesson("k4", 2, 760, 805, "ofi", "Osztályfőnöki", "Klub1", "SL") },
];

const mondayFirst = MONDAY[0] as { a: Lesson; b: Lesson };
const mondaySecond = MONDAY[1] as { a: Lesson; b: Lesson };

//! AZ ÜTKÖZŐ PÁR, AMIRE A KAMERA RÁMEGY. A hétfő első blokkja a hét
//! legbeszédesebb sávja: a két csoport nem ugyanazt az órát kapja más
//! teremben, hanem KÉT KÜLÖNBÖZŐ tantárgyat — az egyik mobilfejlesztést tanul
//! a 303-ban, a másik C#-ot a 102-ben, ugyanabban a két és fél órában.
export const SPLIT_MINE = mondayFirst.a;
export const SPLIT_OTHER = mondayFirst.b;

//* A duális nap EGY blokk, óra-bontás nélkül — ugyanaz a döntés, amit a rács is
//* meghoz (`dualBlockLesson`, 08:00–15:00).
export const DUAL_START_MIN = 8 * 60;
export const DUAL_END_MIN = 15 * 60;

export const DUAL_BLOCKS: readonly Lesson[] = [2, 3, 4].map((i) =>
  lesson(
    `dual-${i}`,
    i + 1,
    DUAL_START_MIN,
    DUAL_END_MIN,
    "Duális",
    "Duális képzés",
    "",
    "",
  ),
);

//! A „MOST" A HÉTFŐ ELSŐ BLOKKJA, AZ „UTÁNA" A MÁSODIK. A progresszív nézet
//! egyetlen mondata — mi megy, mi jön —, és ugyanaz a két kártya, amit a
//! kamera is a képbe vesz.
export const NOW_EVENT = SPLIT_MINE;
export const NEXT_EVENT = mondaySecond.a;
//* A „most" vonal a blokk ~40%-ánál: a sávból így látszik, hogy telik, és a
//* mögötte álló kártya felirata sem esik pont alá.
export const NOW_MIN = Math.round(
  NOW_EVENT.startMin + (NOW_EVENT.endMin - NOW_EVENT.startMin) * 0.4,
);
