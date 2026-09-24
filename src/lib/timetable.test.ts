import { afterEach, describe, expect, test } from "bun:test";
import {
  installBrowser,
  json,
  stubFetch,
  uninstallBrowser,
} from "@/test/browser";
import {
  addDays,
  buildTimetableView,
  describeTimetableFailure,
  getTimetableWeek,
  groupHalf,
  loadCachedClass,
  loadCachedSubject,
  loadCachedTeacher,
  loadUrlSubject,
  mondayOf,
  periodsOfDay,
  resolveClass,
  resolveTeacher,
  saveCachedClass,
  saveCachedTeacher,
  saveUrlSubject,
  subjectStoreKey,
  timetableOffline,
} from "./timetable";

let restore = () => {};
afterEach(() => {
  restore();
  restore = () => {};
  uninstallBrowser();
});
function serve(handler: Parameters<typeof stubFetch>[0]) {
  const stub = stubFetch(handler);
  restore = stub.restore;
  return stub;
}

describe("dátumok", () => {
  test("mondayOf: a hét hétfője, pontos és kötőjeles alakból is", () => {
    expect(mondayOf("2026-09-16")).toBe("2026-09-14");
    expect(mondayOf("2026-09-14")).toBe("2026-09-14");
    expect(mondayOf("2026-09-20")).toBe("2026-09-14");
    expect(mondayOf("2026.09.16.")).toBe("2026-09-14");
    expect(mondayOf("2027-01-01")).toBe("2026-12-28");
  });

  test("mondayOf paraméter nélkül: egy hétfő", () => {
    const monday = mondayOf();
    expect(new Date(`${monday}T12:00:00Z`).getUTCDay()).toBe(1);
  });

  test("addDays", () => {
    expect(addDays("2026-09-14", 4)).toBe("2026-09-18");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDays("2026-10-24", 2)).toBe("2026-10-26");
  });
});

describe("subjectStoreKey", () => {
  test("tanár előtaggal, osztály anélkül, üres üres", () => {
    expect(subjectStoreKey("class", "12A")).toBe("12A");
    expect(subjectStoreKey("teacher", "LM")).toBe("tanar:LM");
    expect(subjectStoreKey("teacher", "")).toBe("");
  });
});

describe("groupHalf", () => {
  test("egész osztály vagy egy csoport: null", () => {
    expect(
      groupHalf({ wholeClass: true, groupColumn: 0, groupCount: 2 }),
    ).toBeNull();
    expect(
      groupHalf({ wholeClass: false, groupColumn: 0, groupCount: 1 }),
    ).toBeNull();
  });

  test("a csoportoszlop melyik félbe esik", () => {
    expect(
      groupHalf({ wholeClass: false, groupColumn: 0, groupCount: 2 }),
    ).toBe(0);
    expect(
      groupHalf({ wholeClass: false, groupColumn: 1, groupCount: 2 }),
    ).toBe(1);
    expect(
      groupHalf({ wholeClass: false, groupColumn: 1, groupCount: 4 }),
    ).toBe(0);
    expect(
      groupHalf({ wholeClass: false, groupColumn: 2, groupCount: 4 }),
    ).toBe(1);
    expect(
      groupHalf({ wholeClass: false, groupColumn: 1, groupCount: 3 }),
    ).toBe(0);
    expect(
      groupHalf({ wholeClass: false, groupColumn: 2, groupCount: 3 }),
    ).toBe(1);
  });
});

describe("periodsOfDay", () => {
  const week = { periods: [{ number: 1, startMin: 480, endMin: 525 }] };
  test("eltérő csengetés csak akkor, ha ismert a rendje", () => {
    expect(periodsOfDay(week, { bells: null })).toBe(week.periods);
    expect(
      periodsOfDay(week, { bells: { id: 2, name: "x", periods: [] } }),
    ).toBe(week.periods);
    const own = [{ number: 1, startMin: 480, endMin: 510 }];
    expect(
      periodsOfDay(week, { bells: { id: 2, name: "x", periods: own } }),
    ).toBe(own);
  });
});

describe("describeTimetableFailure", () => {
  function named(name: string, message = "") {
    const err = new Error(message);
    err.name = name;
    return err;
  }

  test("időtúllépés és megszakítás", () => {
    expect(describeTimetableFailure(named("TimeoutError")).kind).toBe(
      "timeout",
    );
    expect(describeTimetableFailure(named("AbortError")).kind).toBe("timeout");
  });

  test("rossz JSON", () => {
    const e = describeTimetableFailure(new SyntaxError("Unexpected token"));
    expect(e.kind).toBe("payload");
    expect(e.retryable).toBe(true);
  });

  test("offline eszköz", () => {
    const b = installBrowser();
    (b.navigator as Record<string, unknown>).onLine = false;
    expect(describeTimetableFailure(new TypeError("fetch failed"))).toEqual(
      timetableOffline(),
    );
  });

  test("egyéb: elérhetetlen, a kivétel nevével", () => {
    const e = describeTimetableFailure(new TypeError("fetch failed"));
    expect(e.kind).toBe("network");
    expect(e.detail).toBe("TypeError: fetch failed");
    expect(describeTimetableFailure("string").detail).toBeUndefined();
  });
});

describe("tárolt alany", () => {
  test("osztály és tanár külön kulcson, jelzéssel", () => {
    const b = installBrowser();
    expect(loadCachedClass()).toBeNull();
    saveCachedClass("12A");
    saveCachedTeacher("LM");
    expect(loadCachedClass()).toBe("12A");
    expect(loadCachedTeacher()).toBe("LM");
    expect(loadCachedSubject("teacher")).toBe("LM");
    expect(b.events).toHaveLength(2);
  });

  test("szerveren / dobó tárhelyen null", () => {
    expect(loadCachedClass()).toBeNull();
    const b = installBrowser();
    b.localStorage.broken = true;
    expect(loadCachedTeacher()).toBeNull();
    expect(() => saveCachedClass("12A")).not.toThrow();
  });

  test("URL-paraméter olvasása és írása", () => {
    const b = installBrowser();
    const loc = b.window.location as { search: string; href: string };
    loc.search = "?class=%2012A%20&teacher=";
    expect(loadUrlSubject("class")).toBe("12A");
    expect(loadUrlSubject("teacher")).toBeNull();

    const replaced: string[] = [];
    b.window.history = {
      replaceState: (_: unknown, __: string, url: URL) =>
        replaced.push(url.toString()),
    };
    loc.href = "https://orarend.test/orarend?class=12A";
    saveUrlSubject("class", "12A");
    expect(replaced).toEqual([]);
    saveUrlSubject("class", "10B");
    expect(replaced).toEqual(["https://orarend.test/orarend?class=10B"]);
  });
});

//* ─── A heti órarend lekérése ────────────────────────────────────────────────
//* Szerveroldalon (nincs `window`) futnak: a lista minden hívásnál friss, és
//* közvetlenül a Jedlikinfo címére megy.

const CLASSES = [
  { short: "12A", name: "12.A" },
  { short: "09B", name: "9.B" },
];
const TEACHERS = [
  { short: "LM", name: "Lipták Mária" },
  { short: "KB", name: "Kovács Béla" },
];

function card(over: Record<string, unknown>) {
  return {
    date: "2032.01.05",
    dateValue: "",
    fromPeriod: 1,
    periodsCount: 1,
    startHour: 8,
    startMinute: 0,
    endHour: 8,
    endMinute: 45,
    text: "mat",
    textTitle: "Matematika",
    rightBottom: "LM",
    rightBottomTitle: "Lipták Mária",
    leftBottom: "102",
    leftBottomTitle: "102",
    centerTop: "",
    groupName: "",
    groupColumn: 0,
    groupCount: 1,
    week: "AB",
    dayOfWeek: 1,
    startMinuteFromMidnight: 480,
    endMinuteFromMidnight: 525,
    ...over,
  };
}

const WEEK = {
  full: false,
  fromDate: "2032-01-05",
  toDate: "2032-01-09",
  days: [
    { name: "Hétfő", date: "2032.01.05", week: "A", dayOfWeek: 1 },
    { name: "Kedd", date: "2032.01.06", week: "A", dayOfWeek: 2 },
  ],
  periods: [
    { number: 1, startHour: 8, startMinute: 0, endHour: 8, endMinute: 45 },
  ],
  cards: [
    card({}),
    card({ text: "fiz", week: "B", dayOfWeek: 2, date: "2032.01.06" }),
    card({
      text: "tör",
      week: "A",
      dayOfWeek: 2,
      date: "2032.01.06",
      movedCard: true,
      type: "substitution",
    }),
    card({
      text: "ang",
      groupName: "1. csoport",
      groupColumn: 1,
      groupCount: 2,
      dayOfWeek: 2,
      date: "2032.01.06",
    }),
  ],
};

type Route = (url: string, init?: RequestInit) => Response | undefined;
function jedlik(route: Route = () => undefined) {
  return serve((url, init) => {
    const hit = route(url, init);
    if (hit) return hit;
    if (url.endsWith("timetable/classes")) return json(CLASSES);
    if (url.endsWith("timetable/teachers")) return json(TEACHERS);
    if (url.endsWith("timetable/cards")) return json(WEEK);
    return new Response("", { status: 404 });
  });
}

describe("resolveClass / resolveTeacher", () => {
  test("pontos, normalizált és név szerinti egyezés", async () => {
    jedlik();
    expect(await resolveClass("12A")).toEqual(CLASSES[0]);
    expect(await resolveClass(" 9.b ")).toEqual(CLASSES[1]);
    expect(await resolveClass("9 B")).toEqual(CLASSES[1]);
    expect(await resolveTeacher("lm")).toEqual(TEACHERS[0]);
    expect(await resolveTeacher("kovács béla")).toEqual(TEACHERS[1]);
  });

  test("ismeretlen és üres alany: null", async () => {
    jedlik();
    expect(await resolveClass("99Z")).toBeNull();
    expect(await resolveClass("   ")).toBeNull();
    expect(await resolveTeacher(null)).toBeNull();
  });

  test("elérhetetlen lista: a normalizált tipp", async () => {
    serve(() => new Response("", { status: 503 }));
    expect(await resolveClass("9.b")).toEqual({ short: "09B", name: "09B" });
  });
});

describe("getTimetableWeek", () => {
  test("osztály-nézet: a hét a Jedlikinfo kártyáiból", async () => {
    const { calls } = jedlik();
    const week = await getTimetableWeek({
      class: "12A",
      weekStart: "2032-01-07",
    });
    expect(week.ok).toBe(true);
    expect(week.kind).toBe("class");
    expect(week.weekStart).toBe("2032-01-05");
    expect(week.subject).toEqual(CLASSES[0]);
    expect(week.periods).toEqual([{ number: 1, startMin: 480, endMin: 525 }]);
    expect(week.days.map((d) => [d.dateKey, d.dateLabel, d.week])).toEqual([
      ["2032-01-05", "01.05.", "A"],
      ["2032-01-06", "01.06.", "A"],
    ]);

    const post = calls.find((c) => c.url.endsWith("timetable/cards"));
    expect(post?.init?.method).toBe("POST");
    expect(JSON.parse(post?.init?.body as string)).toEqual({
      class: "12A",
      classroom: "",
      teacher: "",
      full: false,
      fromDate: "2032-01-05",
    });

    //! A B hetes óra az A héten kimarad.
    expect(week.lessons.map((l) => l.subjectShort)).toEqual([
      "mat",
      "tör",
      "ang",
    ]);
    const [mat, tor, ang] = week.lessons;
    expect(mat).toMatchObject({
      key: "1-480-0-mat",
      subject: "Matematika",
      teacher: "Lipták Mária",
      teacherShort: "LM",
      room: "102",
      wholeClass: true,
      moved: false,
      kind: "class",
      dateKey: "2032-01-05",
    });
    expect(tor).toMatchObject({ moved: true, kind: "substitution" });
    expect(ang).toMatchObject({
      wholeClass: false,
      group: "1. csoport",
      groupColumn: 1,
      groupCount: 2,
    });
  });

  test("tanár-nézet: a csoportkártyák egy órává olvadnak", async () => {
    jedlik((url) =>
      url.endsWith("timetable/cards")
        ? json({
            ...WEEK,
            cards: [
              //* Két csoport, ugyanaz a tanár, ugyanaz az óra: egész osztály.
              card({
                leftBottom: "12A",
                leftBottomTitle: "12.A",
                rightBottom: "102",
                groupColumn: 0,
                groupCount: 2,
                groupName: "1",
              }),
              card({
                leftBottom: "12A",
                leftBottomTitle: "12.A",
                rightBottom: "102",
                groupColumn: 1,
                groupCount: 2,
                groupName: "2",
              }),
              //* Csak az egyik csoport: bontott óra.
              card({
                text: "inf",
                leftBottom: "09B",
                leftBottomTitle: "",
                rightBottom: "214",
                groupColumn: 1,
                groupCount: 2,
                groupName: "lányok",
              }),
            ],
          })
        : undefined,
    );
    const week = await getTimetableWeek({
      kind: "teacher",
      teacher: "LM",
      weekStart: "2032-01-05",
    });
    expect(week.ok).toBe(true);
    expect(week.lessons).toHaveLength(2);
    const [mat, inf] = week.lessons;
    expect(mat).toMatchObject({
      key: "1-480-12A-mat",
      classShort: "12A",
      className: "12.A",
      room: "102",
      teacher: "",
      wholeClass: true,
      group: "",
      groupCount: 1,
    });
    expect(inf).toMatchObject({
      classShort: "09B",
      className: "09B",
      wholeClass: false,
      group: "lányok",
    });
  });

  test("ismeretlen alany: hibás hét, lekérés nélkül", async () => {
    const { calls } = jedlik();
    const week = await getTimetableWeek({ class: "99Z" });
    expect(week.ok).toBe(false);
    expect(week.error?.kind).toBe("unknown-class");
    expect(week.error?.message).toContain("„99Z”");
    expect(calls.some((c) => c.url.endsWith("timetable/cards"))).toBe(false);
  });

  test("hiányzó alany", async () => {
    jedlik();
    const week = await getTimetableWeek({ kind: "teacher" });
    expect(week.error?.kind).toBe("no-class");
    expect(week.error?.title).toBe("Nincs kiválasztott tanár");
  });

  test.each([
    [500, "server", true],
    [429, "request", true],
    [403, "request", false],
    [404, "request", false],
    [400, "request", true],
  ])("HTTP %i → %s (újrapróbálható: %p)", async (status, kind, retryable) => {
    jedlik((url) =>
      url.endsWith("timetable/cards")
        ? new Response("", { status, statusText: "X" })
        : undefined,
    );
    const week = await getTimetableWeek({
      class: "12A",
      weekStart: "2032-01-05",
    });
    expect(week.ok).toBe(false);
    expect(week.error?.kind).toBe(kind as never);
    expect(week.error?.retryable).toBe(retryable);
    expect(week.error?.detail).toBe(`HTTP ${status} X`);
  });

  test("üres hét: payload hiba a hét megnevezésével", async () => {
    jedlik((url) =>
      url.endsWith("timetable/cards") ? json({ ...WEEK, days: [] }) : undefined,
    );
    const week = await getTimetableWeek({
      class: "12A",
      weekStart: "2032-01-05",
    });
    expect(week.error?.kind).toBe("payload");
    expect(week.error?.detail).toBe("hét: 2032-01-05");
  });

  test("rossz JSON: payload hiba", async () => {
    jedlik((url) =>
      url.endsWith("timetable/cards") ? new Response("<html>") : undefined,
    );
    const week = await getTimetableWeek({
      class: "12A",
      weekStart: "2032-01-05",
    });
    expect(week.error?.kind).toBe("payload");
  });

  test("a tanév rendje: tanítási nap, bejegyzés és eltérő csengetés", async () => {
    jedlik((url) => {
      if (url.includes("calendarplan?year=2032&month=2")) {
        return json([
          {
            date: "2032-02-02",
            week: "A",
            teachingDay: true,
            ringSystemId: 1,
            events: "Farsang",
          },
          { date: "2032-02-03", week: "A", teachingDay: true, ringSystemId: 1 },
          { date: "2032-02-04", week: "A", teachingDay: true, ringSystemId: 7 },
        ]);
      }
      if (url.endsWith("timetable/ringsystem"))
        return json([{ id: 7, name: "Rövidített" }]);
      if (url.endsWith("timetable/ringsystem/2032-02-04")) {
        return json([{ óra: 1, becsengetés: "8:00", kicsengetés: "8:30" }]);
      }
      if (url.endsWith("timetable/cards")) {
        return json({
          ...WEEK,
          days: [
            { name: "Hétfő", date: "2032.02.02", week: "A", dayOfWeek: 1 },
            { name: "Kedd", date: "2032.02.03", week: "A", dayOfWeek: 2 },
            { name: "Szerda", date: "2032.02.04", week: "A", dayOfWeek: 3 },
          ],
          cards: [],
        });
      }
      return undefined;
    });
    const week = await getTimetableWeek({
      class: "12A",
      weekStart: "2032-02-02",
    });
    const [mon, tue, wed] = week.days;
    expect(mon).toMatchObject({
      teaching: true,
      notes: ["Farsang"],
      bells: null,
    });
    expect(tue.bells).toBeNull();
    expect(wed.bells).toEqual({
      id: 7,
      name: "Rövidített",
      periods: [{ number: 1, startMin: 480, endMin: 510 }],
    });
  });
});

describe("buildTimetableView", () => {
  test("a felülírás elsőbbséget kap, a mentett összevonások a tanár kulcsán", async () => {
    jedlik();
    const view = await buildTimetableView({
      kind: "teacher",
      userClass: "KB",
      classOverride: " LM ",
      weekStart: "2032-01-05",
    });
    expect(view.subject).toEqual(TEACHERS[0]);
    expect(view.events).toEqual([]);
    expect(view.prefs).toEqual([]);
    expect(view.persistence).toBe("local");
  });
});
