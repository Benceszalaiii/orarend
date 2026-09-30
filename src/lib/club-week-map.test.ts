import { describe, expect, test } from "bun:test";
import type { FitLesson, FitWeek } from "./club-fit";
import { ownLessons } from "./club-fit";
import {
  blockOfLesson,
  clubInWindow,
  lastEndBefore,
  layoutWeek,
  lessonBlocks,
  type MapSlot,
  mapRange,
  sameWindow,
  slotInWindow,
  slotRank,
  snapMinute,
  WHOLE_DAY,
  windowLabel,
} from "./club-week-map";

function slot(patch: Partial<MapSlot>): MapSlot {
  return {
    club: "lego",
    index: 0,
    weekday: 1,
    startMinute: 870,
    endMinute: 955,
    rank: 0,
    name: "Lego szakkör",
    ...patch,
  };
}

describe("layoutWeek", () => {
  test("azonos idejű időpontok egymás mellé kerülnek, rang szerint", () => {
    const clusters = layoutWeek([
      slot({ club: "a", name: "Alkalmazói", rank: 1 }),
      slot({ club: "b", name: "Robotika", rank: 0 }),
      slot({ club: "c", name: "CAD", rank: 0 }),
    ]);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].lanes).toBe(3);
    //* A belefér (0) balra, egyező rangon ábécé: CAD, Robotika, majd Alkalmazói.
    expect(clusters[0].slots.map((s) => [s.club, s.lane])).toEqual([
      ["c", 0],
      ["b", 1],
      ["a", 2],
    ]);
  });

  test("egymást nem érintő időpontok külön halmazt kapnak, teljes szélességgel", () => {
    const clusters = layoutWeek([
      slot({ club: "reggel", startMinute: 430, endMinute: 475 }),
      slot({ club: "delutan", startMinute: 870, endMinute: 955 }),
    ]);
    expect(clusters.map((c) => [c.id, c.lanes])).toEqual([
      ["1-430", 1],
      ["1-870", 1],
    ]);
  });

  test("a 15:15-kor végződő után a 15:15-kor kezdődő ugyanabba a sávba fér", () => {
    const clusters = layoutWeek([
      slot({ club: "hosszu", startMinute: 870, endMinute: 955 }),
      slot({ club: "rovid", startMinute: 870, endMinute: 915 }),
      slot({ club: "kesei", startMinute: 915, endMinute: 1000 }),
    ]);
    expect(clusters).toHaveLength(1);
    const lanes = Object.fromEntries(
      clusters[0].slots.map((s) => [s.club, s.lane]),
    );
    expect(clusters[0].lanes).toBe(2);
    expect(lanes.kesei).toBe(lanes.rovid);
    expect(lanes.hosszu).not.toBe(lanes.rovid);
  });

  test("a napok nem keverednek, és a halmaz ismeri a napját", () => {
    const clusters = layoutWeek([
      slot({ club: "k", weekday: 2 }),
      slot({ club: "h", weekday: 1 }),
    ]);
    expect(clusters.map((c) => [c.weekday, c.slots[0].club])).toEqual([
      [1, "h"],
      [2, "k"],
    ]);
  });

  test("hétvégi vagy érvénytelen nap nem kerül a térképre", () => {
    expect(layoutWeek([slot({ weekday: 6 }), slot({ weekday: 0 })])).toEqual(
      [],
    );
  });
});

describe("slotRank", () => {
  test("belefér < ütközik < nem tudjuk; ítélet nélkül mind egyforma", () => {
    expect(slotRank({ verdict: "fits" })).toBe(0);
    expect(slotRank({ verdict: "clash", dual: ["B"] })).toBe(1);
    expect(slotRank({ verdict: "unknown" })).toBe(2);
    expect(slotRank(undefined)).toBe(0);
  });
});

describe("mapRange", () => {
  test("legalább 7:00–16:00, akkor is, ha nincs semmi", () => {
    expect(mapRange([])).toEqual({ from: 420, to: 960 });
  });

  test("a késő délutáni szakkör félórára kerekítve tolja ki a végét", () => {
    expect(mapRange([slot({ startMinute: 870, endMinute: 1090 })])).toEqual({
      from: 420,
      to: 1110,
    });
  });

  test("a hajnali kezdés egész órára kerekítve tolja előre az elejét", () => {
    expect(mapRange([], [{ startMin: 400, endMin: 445 }])).toEqual({
      from: 360,
      to: 960,
    });
  });
});

describe("a kijelölt ablak", () => {
  const tuesdayAfternoon = { days: [2], from: 870, to: 960 };

  test("érintés elég: a félig benne álló időpont is számít", () => {
    expect(
      slotInWindow(
        { weekday: 2, startMinute: 915, endMinute: 1000 },
        tuesdayAfternoon,
      ),
    ).toBe(true);
  });

  test("a határon kezdődő vagy végződő nem érinti az ablakot", () => {
    expect(
      slotInWindow(
        { weekday: 2, startMinute: 960, endMinute: 1005 },
        tuesdayAfternoon,
      ),
    ).toBe(false);
    expect(
      slotInWindow(
        { weekday: 2, startMinute: 815, endMinute: 870 },
        tuesdayAfternoon,
      ),
    ).toBe(false);
  });

  test("más napon nem számít", () => {
    expect(
      slotInWindow(
        { weekday: 3, startMinute: 870, endMinute: 955 },
        tuesdayAfternoon,
      ),
    ).toBe(false);
  });

  test("a szakkör akkor van benne, ha BÁRMELYIK időpontja benne van", () => {
    expect(
      clubInWindow(
        [
          { weekday: 1, startMinute: 430, endMinute: 475 },
          { weekday: 2, startMinute: 870, endMinute: 955 },
        ],
        tuesdayAfternoon,
      ),
    ).toBe(true);
  });

  test("sameWindow a tartalmat hasonlítja, nem az objektumot", () => {
    expect(
      sameWindow({ days: [2], from: 1, to: 2 }, { days: [2], from: 1, to: 2 }),
    ).toBe(true);
    expect(
      sameWindow({ days: [2], from: 1, to: 2 }, { days: [3], from: 1, to: 2 }),
    ).toBe(false);
    expect(sameWindow(null, null)).toBe(true);
    expect(sameWindow(null, tuesdayAfternoon)).toBe(false);
  });

  test("snapMinute ötperces rácsra kerekít", () => {
    expect(snapMinute(872)).toBe(870);
    expect(snapMinute(873)).toBe(875);
    expect(snapMinute(430)).toBe(430);
  });
});

describe("windowLabel", () => {
  test("egy nap, egész nap: a teljes neve", () => {
    expect(windowLabel({ days: [2], ...WHOLE_DAY })).toBe("Kedd");
  });

  test("egy nap, idővel", () => {
    expect(windowLabel({ days: [2], from: 870, to: 955 })).toBe(
      "Kedd · 14:30–15:55",
    );
  });

  test("összefüggő napok kötőjellel, szétszórtak vesszővel", () => {
    expect(windowLabel({ days: [1, 2, 3, 4], from: 840, to: 960 })).toBe(
      "H–Cs · 14:00–16:00",
    );
    expect(windowLabel({ days: [3, 1], ...WHOLE_DAY })).toBe("H, Sze");
  });
});

function lesson(patch: Partial<FitLesson>): FitLesson {
  return {
    dayOfWeek: 1,
    startMin: 480,
    endMin: 525,
    subject: "Matematika",
    subjectShort: "mat",
    teacher: "Banáné Nagy Mónika",
    teacherShort: "BNM",
    group: "Egész osztály",
    classShort: "",
    ...patch,
  };
}

const TEACHING = [1, 2, 3, 4, 5].map((dayOfWeek) => ({
  dayOfWeek,
  teaching: true as boolean | null,
}));

function week(lessons: FitLesson[], days = TEACHING): FitWeek {
  return { days, lessons };
}

describe("lessonBlocks", () => {
  test("a rács színmagja: a rövid tantárgynév, ha nincs, a hosszú", () => {
    const blocks = lessonBlocks(
      [
        week([
          lesson({}),
          lesson({
            startMin: 535,
            endMin: 580,
            subjectShort: "",
            subject: "Fizika",
          }),
        ]),
      ],
      1,
    );
    expect(blocks.map((b) => b.seed)).toEqual(["mat", "Fizika"]);
    expect(blocks.every((b) => b.lanes === 1 && b.lane === 0)).toBe(true);
  });

  test("ami minden héten ugyanaz, egyszer áll", () => {
    const blocks = lessonBlocks([week([lesson({})]), week([lesson({})])], 1);
    expect(blocks).toHaveLength(1);
  });

  test("az A és a B hét eltérő órája egymás mellé kerül", () => {
    const blocks = lessonBlocks(
      [
        week([lesson({ subjectShort: "fiz", subject: "Fizika" })]),
        week([lesson({ subjectShort: "kém", subject: "Kémia" })]),
      ],
      1,
    );
    expect(blocks.map((b) => [b.seed, b.lane, b.lanes])).toEqual([
      ["fiz", 0, 2],
      ["kém", 1, 2],
    ]);
  });

  test("tanítás nélküli napon nincs óra a térképen", () => {
    const days = TEACHING.map((d) =>
      d.dayOfWeek === 1 ? { ...d, teaching: false } : d,
    );
    expect(lessonBlocks([week([lesson({})], days)], 1)).toEqual([]);
  });

  test("más nap órája nem kerül ide", () => {
    expect(lessonBlocks([week([lesson({ dayOfWeek: 2 })])], 1)).toEqual([]);
  });
});

describe("lessonBlocks — a rács összevonásai és a diák döntései", () => {
  const first = lesson({
    subjectShort: "prog",
    group: "B1",
    teacherShort: "BB",
  });
  const second = lesson({
    subjectShort: "prog",
    group: "B1",
    teacherShort: "BB",
    startMin: 535,
    endMin: 580,
  });

  test("az egymást követő azonos órák egy blokk, a szünet csíkjával", () => {
    const blocks = lessonBlocks([week([first, second])], 1);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({
      startMin: 480,
      endMin: 580,
      breaks: [{ startMin: 525, endMin: 535 }],
    });
  });

  test("25 percnél hosszabb szünet két külön blokk", () => {
    const late = { ...second, startMin: 560, endMin: 605 };
    expect(lessonBlocks([week([first, late])], 1)).toHaveLength(2);
  });

  test("eldöntetlen csoportbontás: a két csoport egymás mellett", () => {
    const other = lesson({
      subjectShort: "itall",
      group: "B6",
      teacherShort: "KG",
    });
    const blocks = lessonBlocks([week([first, other])], 1);
    expect(blocks.map((b) => [b.seed, b.lane, b.lanes])).toEqual([
      ["itall", 0, 2],
      ["prog", 1, 2],
    ]);
  });

  test("eldöntött bontás: csak a saját csoport marad, teljes szélességben", () => {
    const other = lesson({
      subjectShort: "itall",
      group: "B6",
      teacherShort: "KG",
    });
    const mine = ownLessons(
      [first, other],
      [
        {
          clusterKey: ["itall|B6|KG", "prog|B1|BB"].join("+"),
          chosen: "prog|B1|BB",
        },
      ],
    );
    const blocks = lessonBlocks([week(mine)], 1);
    expect(blocks.map((b) => [b.seed, b.lanes])).toEqual([["prog", 1]]);
  });

  test("blockOfLesson megtalálja az összevont blokkot az óra alapján", () => {
    const blocks = lessonBlocks([week([first, second])], 1);
    expect(blockOfLesson(blocks, second)?.key).toBe(blocks[0].key);
    expect(blockOfLesson(blocks, lesson({ subjectShort: "töri" }))).toBeNull();
  });
});

describe("lastEndBefore", () => {
  const blocks = lessonBlocks(
    [
      week([
        lesson({ startMin: 480, endMin: 525 }),
        lesson({ startMin: 815, endMin: 860, subjectShort: "töri" }),
      ]),
    ],
    1,
  );

  test("a szakkör előtti utolsó óra vége", () => {
    expect(lastEndBefore(blocks, 870)).toBe(860);
  });

  test("reggel, az első óra előtt: nincs", () => {
    expect(lastEndBefore(blocks, 430)).toBeNull();
  });
});
