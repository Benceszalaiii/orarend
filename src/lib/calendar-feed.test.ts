import { describe, expect, test } from "bun:test";
import { type FeedWeek, feedEvents } from "./calendar-feed";
import type { DualSchedule } from "./dual-schedule";
import type {
  TimetableDay,
  TimetableLesson,
  TimetablePeriod,
} from "./timetable";
import { lessonIdentity, type MergePreference } from "./timetable-merge";

//! ═══════════════════════════════════════════════════════════════════════════
//! REGRESSZIÓS TESZT — MIÉRT ÉPP EZ
//! ═══════════════════════════════════════════════════════════════════════════
//! Ez a modul arra válaszol, hogy „mi kerül a telefonom naptárába". A hibája
//! nem hibaüzenet, hanem egy diák, aki bemegy egy órára, amire nem jár — vagy
//! lekés egyet, mert a naptárában nincs ott. Öt dolgot fog le:
//!
//!  • A DÖNTÉS ÉRVÉNYESÜL. Amit a diák elrejtett, az NINCS a feedben; amit
//!    választott, az ott van. Ez a funkció egyetlen ígérete.
//!  • A TELJESEN ELREJTETT SÁV ÜRES. A rácson halvány hely jelzi; a naptárban
//!    semmi.
//!  • A DUÁLIS NAP EGY BLOKK. Egy munkanapon nem szólalhat meg „matek".
//!  • AZ UID STABIL. Ha két generálás között változna, a naptár nem felülírná,
//!    hanem MELLÉ tenné az eseményt — napok alatt olvashatatlan kása.
//!  • A RÖVIDÍTETT NAP SAJÁT CSENGETÉSE. A blokkon belüli szünet helye ebből
//!    jön; a hét közös rendjéből számolva rossz helyre esne.
//! ═══════════════════════════════════════════════════════════════════════════

const PERIODS: TimetablePeriod[] = [
  { number: 1, startMin: 480, endMin: 525 },
  { number: 2, startMin: 535, endMin: 580 },
  { number: 3, startMin: 590, endMin: 635 },
];

function day(overrides: Partial<TimetableDay> = {}): TimetableDay {
  return {
    name: "Hétfő",
    dateKey: "2026-09-07",
    dateLabel: "09.07.",
    week: "A",
    dayOfWeek: 1,
    isToday: false,
    teaching: true,
    notes: [],
    bells: null,
    ...overrides,
  };
}

function lesson(overrides: Partial<TimetableLesson> = {}): TimetableLesson {
  const base: TimetableLesson = {
    key: "k",
    dateKey: "2026-09-07",
    dayOfWeek: 1,
    startMin: 480,
    endMin: 525,
    subject: "Matematika",
    subjectShort: "mat",
    teacher: "Kovács János",
    teacherShort: "KJ",
    classShort: "",
    className: "",
    room: "214",
    group: "",
    groupColumn: 0,
    groupCount: 1,
    wholeClass: true,
    week: "A",
    moved: false,
    kind: "class",
  };
  return { ...base, ...overrides };
}

//* Két párhuzamos csoport EGY sávban — ez a csoportbontás alapesete, és minden
//* alábbi eset ebből indul.
const groupA = lesson({
  subject: "Angol",
  subjectShort: "ang",
  teacher: "Nagy Anna",
  teacherShort: "NA",
  group: "ang-A",
  groupColumn: 0,
  groupCount: 2,
  wholeClass: false,
  room: "101",
});

const groupB = lesson({
  subject: "Német",
  subjectShort: "ném",
  teacher: "Balogh Béla",
  teacherShort: "BB",
  group: "ném-B",
  groupColumn: 1,
  groupCount: 2,
  wholeClass: false,
  room: "102",
});

function week(overrides: Partial<FeedWeek> = {}): FeedWeek {
  return {
    weekStart: "2026-09-07",
    days: [day()],
    periods: PERIODS,
    lessons: [],
    ...overrides,
  };
}

function events(input: {
  lessons: TimetableLesson[];
  prefs?: MergePreference[];
  dual?: DualSchedule | null;
  days?: TimetableDay[];
  periods?: TimetablePeriod[];
}) {
  return feedEvents({
    kind: "class",
    short: "13C",
    weeks: [
      week({
        lessons: input.lessons,
        ...(input.days ? { days: input.days } : {}),
        ...(input.periods ? { periods: input.periods } : {}),
      }),
    ],
    prefs: input.prefs ?? [],
    dual: input.dual ?? null,
  });
}

describe("a döntés érvényesül", () => {
  test("döntés nélkül mindkét csoport órája benne van", () => {
    const out = events({ lessons: [groupA, groupB] });
    expect(out.map((e) => e.summary).sort()).toEqual(["Angol", "Német"]);
  });

  test("a választott ág marad, a másik nem kerül a feedbe", () => {
    const chosen = lessonIdentity(groupA);
    const clusterKey = [lessonIdentity(groupA), lessonIdentity(groupB)]
      .sort()
      .join("+");
    const out = events({
      lessons: [groupA, groupB],
      prefs: [{ clusterKey, chosen }],
    });
    expect(out).toHaveLength(1);
    expect(out[0].summary).toBe("Angol");
    expect(out[0].location).toBe("101");
  });

  //! AZ ELREJTÉS A CSOPORTBONTÁS MÁSIK FELE. Ha egy sávban CSAK a másik
  //! csoportnak van órája, nincs miből választani — a diák a kártyán rejti el.
  //! A tárolt alakja egyágú klaszter üres választással; ha a feed ezt nem
  //! értené, pont az az óra maradna benne, amiről a diák kimondta, hogy nem
  //! az övé.
  test("az elrejtett óra nincs a feedben, ütköző pár nélkül sem", () => {
    const identity = lessonIdentity(groupB);
    const out = events({
      lessons: [groupB],
      prefs: [{ clusterKey: identity, chosen: "" }],
    });
    expect(out).toEqual([]);
  });

  test("a teljesen elrejtett sáv nem ad eseményt", () => {
    const clusterKey = [lessonIdentity(groupA), lessonIdentity(groupB)]
      .sort()
      .join("+");
    const out = events({
      lessons: [groupA, groupB],
      prefs: [{ clusterKey, chosen: "" }],
    });
    expect(out).toEqual([]);
  });

  test("a döntés minden hétre érvényes, nem csak arra, amin meghozták", () => {
    const chosen = lessonIdentity(groupA);
    const clusterKey = [lessonIdentity(groupA), lessonIdentity(groupB)]
      .sort()
      .join("+");
    const second: FeedWeek = {
      weekStart: "2026-09-14",
      days: [day({ dateKey: "2026-09-14", week: "B" })],
      periods: PERIODS,
      lessons: [
        { ...groupA, dateKey: "2026-09-14", week: "B" },
        { ...groupB, dateKey: "2026-09-14", week: "B" },
      ],
    };
    const out = feedEvents({
      kind: "class",
      short: "13C",
      weeks: [week({ lessons: [groupA, groupB] }), second],
      prefs: [{ clusterKey, chosen }],
      dual: null,
    });
    expect(out).toHaveLength(2);
    expect(out.map((e) => e.dateKey)).toEqual(["2026-09-07", "2026-09-14"]);
    expect(new Set(out.map((e) => e.summary))).toEqual(new Set(["Angol"]));
  });
});

describe("a blokk mint egy esemény", () => {
  test("a dupla óra egyetlen esemény, a szünettel a leírásban", () => {
    const out = events({
      lessons: [lesson(), lesson({ key: "k2", startMin: 535, endMin: 580 })],
    });
    expect(out).toHaveLength(1);
    expect(out[0].startMin).toBe(480);
    expect(out[0].endMin).toBe(580);
    expect(out[0].description).toContain("2 óra egyben");
    expect(out[0].description).toContain("Szünet: 08:45–08:55");
  });

  test("teremváltás a blokkon belül: mindkét terem a helyszínben", () => {
    const out = events({
      lessons: [
        lesson(),
        lesson({ key: "k2", startMin: 535, endMin: 580, room: "305" }),
      ],
    });
    expect(out[0].location).toBe("214 / 305");
  });

  //! RÖVIDÍTETT NAPON A NAP SAJÁT CSENGETÉSE DÖNT. A forrás a hét `periods`
  //! tömbjében AKKOR IS a rendes rendet küldi, amikor aznap 30 perces órák
  //! vannak (lásd `school-calendar.ts`) — a blokkon belüli szünet helye ezért
  //! csak a nap saját rendjéből számolható ki.
  test("a rövidített nap szünete a napi csengetésből jön", () => {
    const shortDay = day({
      bells: {
        id: 3,
        name: "30 perces órák",
        periods: [
          { number: 1, startMin: 480, endMin: 510 },
          { number: 2, startMin: 520, endMin: 550 },
        ],
      },
    });
    const out = events({
      days: [shortDay],
      lessons: [
        lesson({ endMin: 510 }),
        lesson({ key: "k2", startMin: 520, endMin: 550 }),
      ],
    });
    expect(out[0].description).toContain("Szünet: 08:30–08:40");
  });
});

describe("duális nap", () => {
  const dual: DualSchedule = { A: [1], B: [] };

  test("az A hét hétfőjén egyetlen duális blokk áll, tanóra nincs", () => {
    const out = events({ lessons: [lesson(), groupA], dual });
    expect(out).toHaveLength(1);
    expect(out[0].summary).toBe("Duális képzés");
    expect(out[0].startMin).toBe(8 * 60);
    expect(out[0].endMin).toBe(15 * 60);
  });

  test("a beosztás nélküli napon minden óra megmarad", () => {
    const out = events({ lessons: [lesson()], dual: { A: [2], B: [] } });
    expect(out.map((e) => e.summary)).toEqual(["Matematika"]);
  });

  //! ADAT NÉLKÜLI NAPRA NEM TALÁLUNK KI DUÁLIST. Ha a hét üres (szünet,
  //! forráshiba), a nap ürességE a hír — egy kitalált „Duális képzés" blokk
  //! azt állítaná, hogy aznap dolgozni kell.
  test("óra nélküli napon nincs duális blokk sem", () => {
    expect(events({ lessons: [], dual })).toEqual([]);
  });

  test("A/B jelölés nélküli héten a beosztás nem alkalmazható", () => {
    const out = events({
      days: [day({ week: "" })],
      lessons: [lesson()],
      dual,
    });
    expect(out.map((e) => e.summary)).toEqual(["Matematika"]);
  });
});

describe("azonosság", () => {
  test("ugyanarra a hétre kétszer generálva az UID-k azonosak", () => {
    const first = events({ lessons: [groupA, groupB] });
    const second = events({ lessons: [groupA, groupB] });
    expect(first.map((e) => e.uid)).toEqual(second.map((e) => e.uid));
  });

  //! EGY PERCBEN KÉT MEGTARTOTT ÓRA IS LEHET. Ha az UID csak a napból és a
  //! kezdésből állna, a naptár a kettőt egynek hinné, és az egyik némán
  //! eltűnne.
  test("az egy percben kezdődő két óra UID-je különbözik", () => {
    const out = events({ lessons: [groupA, groupB] });
    expect(out).toHaveLength(2);
    expect(out[0].uid).not.toBe(out[1].uid);
  });

  test("az UID névtere az alany: ugyanaz az óra más alanynál más UID", () => {
    const asClass = feedEvents({
      kind: "class",
      short: "13C",
      weeks: [week({ lessons: [lesson()] })],
      prefs: [],
      dual: null,
    });
    const asTeacher = feedEvents({
      kind: "teacher",
      short: "KJ",
      weeks: [week({ lessons: [lesson()] })],
      prefs: [],
      dual: null,
    });
    expect(asClass[0].uid).not.toBe(asTeacher[0].uid);
  });

  test("az UID ASCII, tehát ékezetes tantárgynévtől sem romlik el", () => {
    const out = events({
      lessons: [
        lesson({ subject: "Hálózat üzemeltetése", subjectShort: "háló" }),
      ],
    });
    expect(/^[\x20-\x7e]+$/.test(out[0].uid)).toBe(true);
  });
});

describe("a kártya olvasata", () => {
  test("osztály-nézetben a tantárgy a cím, a tanár a leírásban", () => {
    const out = events({ lessons: [lesson()] });
    expect(out[0].summary).toBe("Matematika");
    expect(out[0].description).toContain("Kovács János");
  });

  //! A TANÁRNAK AZ OSZTÁLY A HÍR. Ugyanaz az olvasat, mint az értesítéseknél:
  //! a tanár minden órája ugyanaz a tantárgy, abból nem derül ki, hova kell
  //! bemennie.
  test("tanári nézetben az osztály is a címben van", () => {
    const out = feedEvents({
      kind: "teacher",
      short: "KJ",
      weeks: [
        week({
          lessons: [
            lesson({
              teacher: "",
              teacherShort: "",
              classShort: "09B",
              className: "09B",
            }),
          ],
        }),
      ],
      prefs: [],
      dual: null,
    });
    expect(out[0].summary).toBe("09B Matematika");
  });

  //* A csoport neve az EGYETLEN jel, amiből a diák a naptárban visszanézheti,
  //* melyik ágat tartotta meg — a tantárgy és a tanár mindkét ágon más.
  test("a csoport neve a leírásban marad, a tantárgy-előtag nélkül", () => {
    const out = events({ lessons: [groupA] });
    expect(out[0].description).toBe("Nagy Anna\nA");
  });

  test("egész osztályos órán nincs csoportnév a leírásban", () => {
    const out = events({ lessons: [lesson()] });
    expect(out[0].description).toBe("Kovács János");
  });

  test("az áthelyezés jelölése átjön a forrásból", () => {
    const out = events({ lessons: [lesson({ moved: true })] });
    expect(out[0].description).toContain("Áthelyezve");
  });
});
