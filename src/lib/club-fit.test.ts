import { describe, expect, test } from "bun:test";
import {
  busyBands,
  clubFit,
  dayEnds,
  type FitLesson,
  type FitWeek,
  keepFittingSuggestions,
  ownLessons,
  slotFit,
} from "./club-fit";
import { clusterKeyOf, lessonIdentity } from "./timetable-merge";

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

const TEACHING_WEEK = [1, 2, 3, 4, 5].map((dayOfWeek) => ({
  dayOfWeek,
  teaching: true as boolean | null,
}));

function week(lessons: FitLesson[], days = TEACHING_WEEK): FitWeek {
  return { days, lessons };
}

//* Hétfő 8:00–8:45 matek, 8:55–9:40 fizika, 14:30–15:15 töri.
const MONDAY = [
  lesson({}),
  lesson({
    startMin: 535,
    endMin: 580,
    subject: "Fizika",
    subjectShort: "fiz",
  }),
  lesson({
    startMin: 870,
    endMin: 915,
    subject: "Történelem",
    subjectShort: "tor",
  }),
];

describe("slotFit", () => {
  test("belefér, ha aznap van óra, de nem abban a sávban", () => {
    expect(
      slotFit({ weekday: 1, startMinute: 430, endMinute: 475 }, [week(MONDAY)]),
    ).toEqual({ verdict: "fits" });
  });

  test("a sáv határa nem ütközés (félig nyitott)", () => {
    expect(
      slotFit({ weekday: 1, startMinute: 915, endMinute: 1000 }, [week(MONDAY)])
        .verdict,
    ).toBe("fits");
  });

  test("ütközésnél megnevezi a legkorábbi ütköző órát", () => {
    const fit = slotFit({ weekday: 1, startMinute: 500, endMinute: 600 }, [
      week(MONDAY),
    ]);
    expect(fit.verdict).toBe("clash");
    expect(fit.verdict === "clash" && fit.lesson?.subject).toBe("Matematika");
  });

  test("óra nélküli nap nem tanú — nem tudjuk", () => {
    expect(
      slotFit({ weekday: 2, startMinute: 870, endMinute: 960 }, [week(MONDAY)])
        .verdict,
    ).toBe("unknown");
  });

  test("tanítás nélküli nap nem tanú", () => {
    const days = TEACHING_WEEK.map((d) =>
      d.dayOfWeek === 1 ? { ...d, teaching: false } : d,
    );
    expect(
      slotFit({ weekday: 1, startMinute: 430, endMinute: 475 }, [
        week(MONDAY, days),
      ]).verdict,
    ).toBe("unknown");
  });

  test("A/B hét: egyetlen ütköző hét elég a „nem fér bele”-hez", () => {
    const aWeek = week(MONDAY);
    const bWeek = week([
      ...MONDAY,
      lesson({
        startMin: 925,
        endMin: 970,
        subject: "Kémia",
        subjectShort: "kem",
      }),
    ]);
    const slot = { weekday: 1, startMinute: 925, endMinute: 1010 };
    expect(slotFit(slot, [aWeek]).verdict).toBe("fits");
    expect(slotFit(slot, [aWeek, bWeek]).verdict).toBe("clash");
  });

  test("hét nélkül nem tudjuk", () => {
    expect(
      slotFit({ weekday: 1, startMinute: 430, endMinute: 475 }, []).verdict,
    ).toBe("unknown");
  });
});

describe("clubFit", () => {
  const weeks = [week(MONDAY)];
  const free = { weekday: 1, startMinute: 430, endMinute: 475 };
  const busy = { weekday: 1, startMinute: 480, endMinute: 525 };
  const unseen = { weekday: 3, startMinute: 870, endMinute: 915 };

  test("minden időpont belefér", () => {
    expect(clubFit([free], weeks).verdict).toBe("fits");
  });

  test("egyik sem fér bele", () => {
    expect(clubFit([busy], weeks).verdict).toBe("clash");
  });

  test("az egyik belefér, a másik nem: részben", () => {
    expect(clubFit([free, busy], weeks).verdict).toBe("partly");
  });

  test("belefér + nem látott nap: részben, nem „belefér”", () => {
    expect(clubFit([free, unseen], weeks).verdict).toBe("partly");
  });

  test("ütközik + nem látott nap: nem tudjuk", () => {
    expect(clubFit([busy, unseen], weeks).verdict).toBe("unknown");
  });

  test("időpont nélkül (egyeztetés alatt): nem tudjuk", () => {
    expect(clubFit([], weeks).verdict).toBe("unknown");
  });
});

describe("ownLessons", () => {
  test("az elrejtett csoport ideje szabad", () => {
    const tsz = lesson({
      subject: "Német",
      subjectShort: "nem",
      group: "TSZ",
      teacherShort: "TSZ",
    });
    const pzs = lesson({
      subject: "Német",
      subjectShort: "nem",
      group: "PZS",
      teacherShort: "PZS",
    });
    const prefs = [
      {
        clusterKey: clusterKeyOf([lessonIdentity(tsz), lessonIdentity(pzs)]),
        chosen: lessonIdentity(tsz),
      },
    ];
    expect(ownLessons([tsz, pzs], prefs)).toEqual([tsz]);
  });

  test("döntés nélkül minden óra számít", () => {
    expect(ownLessons(MONDAY, [])).toHaveLength(3);
  });
});

describe("keepFittingSuggestions", () => {
  const base = { dayOfWeek: 1, cancelled: false };
  test("a saját szakkör mindig marad, a javaslat csak szabad sávban", () => {
    const events = [
      { ...base, startMin: 480, endMin: 525, id: "own" },
      { ...base, startMin: 480, endMin: 525, suggested: true, id: "busy" },
      { ...base, startMin: 430, endMin: 475, suggested: true, id: "free" },
      {
        ...base,
        startMin: 430,
        endMin: 475,
        suggested: true,
        cancelled: true,
        id: "gone",
      },
    ];
    expect(
      keepFittingSuggestions(events, { lessons: MONDAY }, []).map((e) => e.id),
    ).toEqual(["own", "free"]);
  });
});

describe("duális napok", () => {
  const weeks = [week(MONDAY)];
  const classic = { A: [], B: [1, 2, 3, 4, 5] };
  const wedB = { A: [], B: [3] };

  test("a B heti duális nap ütközés, a hét betűjével", () => {
    expect(
      slotFit({ weekday: 3, startMinute: 870, endMinute: 960 }, weeks, wedB),
    ).toEqual({ verdict: "clash", dual: ["B"] });
  });

  test("akkor is ütközik, ha a mentett hetek között nincs B hét", () => {
    expect(
      slotFit({ weekday: 1, startMinute: 430, endMinute: 475 }, weeks, classic)
        .verdict,
    ).toBe("clash");
  });

  test("beosztás nélkül nincs duális nap", () => {
    expect(
      slotFit({ weekday: 1, startMinute: 430, endMinute: 475 }, weeks, null)
        .verdict,
    ).toBe("fits");
  });

  test("duális napra eső időpont + szabad időpont: részben", () => {
    expect(
      clubFit(
        [
          { weekday: 1, startMinute: 430, endMinute: 475 },
          { weekday: 3, startMinute: 870, endMinute: 960 },
        ],
        weeks,
        wedB,
      ).verdict,
    ).toBe("partly");
  });
});

describe("dayEnds", () => {
  test("a legkésőbbi óra vége, és a duális hetek", () => {
    const ends = dayEnds([week(MONDAY)], { A: [], B: [3] });
    expect(ends[0]).toEqual({ weekday: 1, lastEnd: 915, dual: [] });
    expect(ends[2]).toEqual({ weekday: 3, lastEnd: null, dual: ["B"] });
  });
});

describe("busyBands", () => {
  test("a szünettel elválasztott órák egy sávba olvadnak", () => {
    expect(busyBands([week(MONDAY)], 1)).toEqual([
      { startMin: 480, endMin: 580 },
      { startMin: 870, endMin: 915 },
    ]);
  });
});
