//* ---------------------------------------------------------------------------
//* A 404 JELENETE — a hét, ami kiesik, és a szám, ami a helyén marad
//* ---------------------------------------------------------------------------
//! A HÉT VALÓDI, CSAK NEM A TIÉD. Ezek a kártyák nem kitalált tantárgyak és nem
//! kitalált termek: a Jedlikinfo `timetable/cards` válaszából származnak, egy
//! valódi osztály valódi hetéből (11B, 2026-09-07). Termek: `022`, `B7`, `T2`,
//! `plc`, `tor2`, `Klub2` — pontosan azok, amiket a rács amúgy is kiír. Ez nem
//! szőrszálhasogatás: a jelenet azon áll vagy bukik, hogy az első pillanatban
//! ELHISSZÜK, hogy ez az órarend, és egy kitalált „118"-as terem a Jedlikbe
//! járó szemnek azonnal hamis.
//*
//! //! AMIT VISZONT NEM ÁLLÍT MAGÁRÓL: hogy MELYIK hét, és hogy MELYIK osztály.
//! //! Nincs rajta dátum és nincs rajta osztálynév, a lap pedig `aria-hidden`
//! //! alatt adja tovább — a képernyőolvasó a hibaüzenetet kapja, nem egy
//! //! órarendet, ami nem az övé. A rács itt DÍSZLET, nem adat: ezért nem is
//! //! frissül, és ezért nem kér hálózatot.

/**
 * A csengetési rend a forrás szerint (`timetable/cards` → `periods`): 0–8.
 * óra, 07:10-től 15:15-ig. Nem tipp — a válaszból másolva.
 */
export const PERIODS: { number: number; startMin: number; endMin: number }[] = [
  { number: 0, startMin: 430, endMin: 475 },
  { number: 1, startMin: 480, endMin: 525 },
  { number: 2, startMin: 535, endMin: 580 },
  { number: 3, startMin: 590, endMin: 635 },
  { number: 4, startMin: 650, endMin: 695 },
  { number: 5, startMin: 705, endMin: 750 },
  { number: 6, startMin: 760, endMin: 805 },
  { number: 7, startMin: 815, endMin: 860 },
  { number: 8, startMin: 870, endMin: 915 },
];

//* A rács a `/orarend`-del egyezően nyolc perccel az első óra előtt kezdődik és
//* az utolsó után nyolccal ér véget — így az első/utolsó kártya nem tapad a
//* keretre.
export const DAY_START = PERIODS[0].startMin - 8;
export const DAY_END = PERIODS[PERIODS.length - 1].endMin + 8;
export const DAY_SPAN = DAY_END - DAY_START;

const startOf = (n: number) => PERIODS[n].startMin;
const endOf = (n: number) => PERIODS[n].endMin;

export type SceneCard = {
  id: string;
  /** 0 = hétfő … 4 = péntek. */
  day: number;
  /** Hányfelé osztott az oszlop ezen az órán, és hányadik sávban áll. */
  lanes: number;
  lane: number;
  startMin: number;
  endMin: number;
  /** A színt EZ a szó adja — ugyanaz a mag, mint a valódi rácson. */
  short: string;
  subject: string;
  room: string;
  teacher: string;
};

type Row = [
  day: number,
  from: number,
  to: number,
  short: string,
  subject: string,
  room: string,
  teacher: string,
  lanes?: number,
  lane?: number,
];

//! A CSOPORTBONTÁS SEM DÍSZLET. A sorok fele két sávon fut, mert a forrásban is
//! két sávon fut — ez az alkalmazás fő képessége (a párhuzamos csoportok
//! feloldása), és a hibalapnak sem szabad egy egyszerűbb órarendet mutatnia,
//! mint amilyet a diák nap mint nap lát.
const ROWS: Row[] = [
  //* Hétfő
  [0, 1, 1, "ném", "Német nyelv", "T2", "BH", 2, 0],
  [0, 2, 2, "mnyelv", "Magyar nyelv", "104", "KB"],
  [0, 3, 3, "tör", "Történelem", "207", "TZ"],
  [0, 4, 5, "iro", "Irodalom", "025", "KB"],
  [0, 6, 6, "mat", "Matematika", "112", "CSG", 2, 0],
  [0, 6, 6, "mat", "Matematika", "108", "JKA", 2, 1],
  [0, 7, 7, "ang", "Angol nyelv", "T3", "BA", 2, 0],
  [0, 7, 7, "ang", "Angol nyelv", "41", "KK", 2, 1],
  [0, 8, 8, "ném", "Német nyelv", "T6", "PP", 2, 1],
  //* Kedd
  [1, 1, 1, "dig", "Digitális technika", "B7", "SZG", 2, 0],
  [1, 1, 1, "plc", "PLC", "plc", "VF", 2, 1],
  [1, 2, 4, "ikt2", "IKT projektmunka II.", "116", "VF", 2, 0],
  [1, 2, 4, "ikt2", "IKT projektmunka II.", "24", "HF", 2, 1],
  [1, 5, 5, "plc", "PLC", "plc", "VF", 2, 0],
  [1, 5, 5, "dig", "Digitális technika", "B7", "SZG", 2, 1],
  [1, 6, 7, "hál1", "Hálózatok I.", "B8", "NE", 2, 0],
  [1, 6, 7, "hál1", "Hálózatok I.", "302", "KT", 2, 1],
  //* Szerda
  [2, 1, 1, "iro", "Irodalom", "210", "KB"],
  [2, 2, 2, "mat", "Matematika", "104", "CSG", 2, 0],
  [2, 2, 2, "mat", "Matematika", "108", "JKA", 2, 1],
  [2, 3, 3, "fiz", "Fizika", "209", "PL"],
  [2, 4, 4, "ang", "Angol nyelv", "T1", "BA", 2, 0],
  [2, 4, 4, "ang", "Angol nyelv", "Klub2", "KK", 2, 1],
  [2, 5, 5, "tes", "Testnevelés", "tor", "NVG"],
  [2, 6, 6, "pvi", "Pénzügyi és vállalkozói ismeretek", "022", "PAL"],
  [2, 7, 8, "hál1", "Hálózatok I.", "302", "KT", 2, 1],
  //* Csütörtök
  [3, 1, 2, "mat", "Matematika", "025", "JKA", 2, 1],
  [3, 2, 2, "mat", "Matematika", "204", "CSG", 2, 0],
  [3, 3, 3, "fiz", "Fizika", "106", "PL"],
  [3, 4, 4, "tes", "Testnevelés", "tor2", "NVG"],
  [3, 5, 5, "tör", "Történelem", "025", "TZ"],
  [3, 6, 6, "ofi", "Osztályfőnöki", "208", "NE"],
  [3, 7, 8, "hál1", "Hálózatok I.", "115", "NE", 2, 0],
  [3, 7, 7, "hál1", "Hálózatok I.", "302", "KT", 2, 1],
  //* Péntek
  [4, 1, 2, "mat", "Matematika", "208", "CSG", 2, 0],
  [4, 2, 2, "mat", "Matematika", "104", "JKA", 2, 1],
  [4, 3, 4, "ang", "Angol nyelv", "T2", "BA", 2, 0],
  [4, 3, 4, "ang", "Angol nyelv", "Klub2", "KK", 2, 1],
  [4, 5, 5, "ném", "Német nyelv", "T5", "BH", 2, 0],
  [4, 5, 5, "ném", "Német nyelv", "T2", "PP", 2, 1],
  [4, 6, 6, "hál1", "Hálózatok I.", "B8", "NE", 2, 0],
];

export const WEEK_CARDS: SceneCard[] = ROWS.map(
  ([day, from, to, short, subject, room, teacher, lanes = 1, lane = 0], i) => ({
    id: `w${i}`,
    day,
    lanes,
    lane,
    startMin: startOf(from),
    endMin: endOf(to),
    short,
    subject,
    room,
    teacher,
  }),
);

//! ─── A SZÁM ─────────────────────────────────────────────────────────────────
//! A 404 NEM RÁRAJZOLT FELIRAT, HANEM KÁRTYÁKBÓL ÁLL. Egy nagy betűs „404"
//! bármelyik lapon állhatna; ez a szám viszont UGYANAZON a rácson ül, mint az
//! imént lehullott hét — ugyanolyan sávszélességgel, ugyanolyan óramagassággal,
//! ugyanabból a tantárgyszín-készletből.
//!
//! A RAJZ SÁVOKBÓL ÁLL, NEM PONTOKBÓL. A naposzlop három sávra oszlik (a rács
//! ezt csoportbontásnál amúgy is megteszi), így öt napból tizenöt hasáb lesz —
//! pont annyi, amennyibe a 4 (négy hasáb), a 0 (öt) és a 4 (négy) két üres
//! hasábbal elfér. Függőlegesen az EGYMÁS UTÁNI órákat egyetlen kártyába
//! vonjuk össze, ahogy a valódi rács is teszi a dupla órákkal: így a szám
//! tizenhat kártya, nem negyvenhat kocka — tömbökből áll, mint egy igazi hét.
type Stroke = [col: number, rowFrom: number, rowTo: number];

//* 4 — négy hasáb széles, hét sor magas.
const FOUR: Stroke[] = [
  [0, 0, 3],
  [1, 3, 3],
  [2, 3, 3],
  [3, 0, 6],
];

//* 0 — öt hasáb: a kerek alak szélesebb, mint a négyes, különben a szám
//* középen összeszűkülne.
const ZERO: Stroke[] = [
  [0, 0, 6],
  [1, 0, 0],
  [1, 6, 6],
  [2, 0, 0],
  [2, 6, 6],
  [3, 0, 0],
  [3, 6, 6],
  [4, 0, 6],
];

//* A szám a 15 hasáb mindegyikét használja: 4 + üres + 5 + üres + 4.
const GLYPHS: { strokes: Stroke[]; at: number; seed: string }[] = [
  { strokes: FOUR, at: 0, seed: "nincs" },
  { strokes: ZERO, at: 5, seed: "ilyen" },
  { strokes: FOUR, at: 11, seed: "óra" },
];

/** A szám sorai az 1–7. órára esnek: a nulladik és a nyolcadik marad üresen. */
const GLYPH_FIRST_PERIOD = 1;
/** A naposzlop ennyi sávra oszlik a szám alatt. */
export const GLYPH_LANES = 3;

export type GlyphCard = {
  id: string;
  /** Hányadik hasáb a tizenötből. */
  col: number;
  startMin: number;
  endMin: number;
  /** A digit magja — egy számjegy egy tantárgyszínt kap. */
  seed: string;
};

export const GLYPH_CARDS: GlyphCard[] = GLYPHS.flatMap((glyph, gi) =>
  glyph.strokes.map(([col, rowFrom, rowTo], si) => ({
    id: `g${gi}-${si}`,
    col: glyph.at + col,
    startMin: startOf(GLYPH_FIRST_PERIOD + rowFrom),
    endMin: endOf(GLYPH_FIRST_PERIOD + rowTo),
    seed: glyph.seed,
  })),
);
