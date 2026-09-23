import { afterEach, describe, expect, test } from "bun:test";
import { json, stubFetch } from "@/test/browser";
import { PERIODS } from "@/test/fixtures";
import {
  breakSpanOf,
  buildHallDutyDay,
  fetchHallDuty,
  getHallDutyByArea,
  HALL_DUTY_NO_AREA_LABEL,
  type HallDutySlot,
  hallDutyDayOf,
  hallDutyNow,
} from "./hall-duty";

let restore = () => {};
afterEach(() => restore());
function serve(handler: Parameters<typeof stubFetch>[0]) {
  const stub = stubFetch(handler);
  restore = stub.restore;
  return stub;
}

function raw(id: number, day: string, brk: string, area: string | null, teacher: string, week = "A") {
  return { id, day, break: brk, area, responsibleTeacher: teacher, week };
}

describe("fetchHallDuty (szerveroldalon, gyorsítótár nélkül)", () => {
  test("érvényes sorok nap → szünet → hét sorrendben", async () => {
    serve(() =>
      json([
        raw(1, "KEDD", "1.szünet", "B épület", "KB"),
        raw(2, "HÉTFŐ", "2.szünet", "1.emelet", "LM", "B"),
        raw(3, "HÉTFŐ", "2.szünet", "1.emelet", "XY", "A"),
        raw(4, "HÉTFŐ", "7.45-8.00", "földszint és alagsor", "AA"),
        raw(5, "HÉTFŐ", "1.szünet", "1.emelet", "BB", "C"),
        { id: "6" },
        null,
      ]),
    );
    const slots = await fetchHallDuty();
    expect(slots.map((s) => s.id)).toEqual([4, 3, 2, 1]);
    expect(slots[0]).toEqual({
      id: 4,
      day: "HÉTFŐ",
      breakName: "7.45-8.00",
      area: "földszint és alagsor",
      teacher: "AA",
      week: "A",
    });
  });

  test("hiba vagy nem tömb: üres", async () => {
    serve(() => new Response("", { status: 500 }));
    expect(await fetchHallDuty()).toEqual([]);
    restore();
    serve(() => json({}));
    expect(await fetchHallDuty()).toEqual([]);
    restore();
    serve(() => {
      throw new Error("offline");
    });
    expect(await fetchHallDuty()).toEqual([]);
  });
});

describe("getHallDutyByArea", () => {
  test("területenként, a rögzített sorrendben, a vezetői ügyelet a végén", async () => {
    serve(() =>
      json([
        raw(1, "HÉTFŐ", "vezetői ügyelet", null, "IG"),
        raw(2, "HÉTFŐ", "1.szünet", "B épület", "KB"),
        raw(3, "HÉTFŐ", "1.szünet", "2.emelet", "LM"),
        raw(4, "HÉTFŐ", "1.szünet", "ismeretlen", "XY"),
        raw(5, "KEDD", "1.szünet", "2.emelet", "AA"),
      ]),
    );
    const groups = await getHallDutyByArea();
    expect(groups.map((g) => g.area)).toEqual(["2.emelet", "B épület", "ismeretlen", HALL_DUTY_NO_AREA_LABEL]);
    expect(groups[0].slots.map((s) => s.teacher)).toEqual(["LM", "AA"]);
  });
});

describe("breakSpanOf", () => {
  test("a szó szerinti idősáv", () => {
    expect(breakSpanOf("7.45-8.00", [])).toEqual({ startMin: 465, endMin: 480 });
    expect(breakSpanOf(" 7:45 - 8:00 ", [])).toEqual({ startMin: 465, endMin: 480 });
    expect(breakSpanOf("8.00-7.45", [])).toBeNull();
  });

  test("a számozott szünet a két óra közti rés", () => {
    expect(breakSpanOf("1.szünet", PERIODS)).toEqual({ startMin: 525, endMin: 535 });
    expect(breakSpanOf("3. Szünet", PERIODS)).toEqual({ startMin: 635, endMin: 650 });
  });

  test("hiányzó óra vagy nem időhöz köthető név: null", () => {
    expect(breakSpanOf("7.szünet", PERIODS)).toBeNull();
    expect(breakSpanOf("1.szünet", [])).toBeNull();
    expect(breakSpanOf("vezetői ügyelet", PERIODS)).toBeNull();
  });
});

describe("hallDutyDayOf", () => {
  test("hétköznap a forrás napneve, hétvégén null", () => {
    expect(hallDutyDayOf("2026-09-14")).toBe("HÉTFŐ");
    expect(hallDutyDayOf("2026-09-17")).toBe("CSÜTÖRTÖK");
    expect(hallDutyDayOf("2026-09-19")).toBeNull();
    expect(hallDutyDayOf("rossz")).toBeNull();
  });
});

const SLOTS: HallDutySlot[] = [
  { id: 1, day: "HÉTFŐ", breakName: "2.szünet", area: "B épület", teacher: "KB", week: "A" },
  { id: 2, day: "HÉTFŐ", breakName: "2.szünet", area: "2.emelet", teacher: "LM", week: "A" },
  { id: 3, day: "HÉTFŐ", breakName: "7.45-8.00", area: "1.emelet", teacher: "AA", week: "A" },
  { id: 4, day: "HÉTFŐ", breakName: "vezetői ügyelet", area: null, teacher: "IG", week: "A" },
  { id: 5, day: "HÉTFŐ", breakName: "1.szünet", area: "1.emelet", teacher: "BB", week: "B" },
  { id: 6, day: "KEDD", breakName: "1.szünet", area: "1.emelet", teacher: "CC", week: "A" },
];

describe("buildHallDutyDay", () => {
  const day = buildHallDutyDay(SLOTS, { dateKey: "2026-09-14", day: "HÉTFŐ", week: "A", periods: PERIODS });

  test("csak a nap és a hét sorai, időrendben, a vezető külön", () => {
    expect(day.leader).toBe("IG");
    expect(day.breaks.map((b) => b.name)).toEqual(["7.45-8.00", "2.szünet"]);
    expect(day.breaks[1]).toEqual({
      name: "2.szünet",
      startMin: 580,
      endMin: 590,
      posts: [
        { area: "2.emelet", teacher: "LM" },
        { area: "B épület", teacher: "KB" },
      ],
    });
  });

  test("csengetés nélkül időhatár nélkül", () => {
    const bare = buildHallDutyDay(SLOTS, { dateKey: "x", day: "HÉTFŐ", week: "A", periods: [] });
    expect(bare.breaks[1]).toMatchObject({ startMin: null, endMin: null });
  });

  describe("hallDutyNow", () => {
    test("reggel előtt felvezetés, ügyelet alatt aktuális + következő", () => {
      expect(hallDutyNow(day, 400)).toMatchObject({ phase: "before", span: { fromMin: 405, toMin: 465 } });
      expect(hallDutyNow(day, 470)).toMatchObject({
        phase: "duty",
        current: { name: "7.45-8.00" },
        next: { name: "2.szünet" },
      });
    });

    test("két ügyelet között, és a végén", () => {
      expect(hallDutyNow(day, 500)).toMatchObject({ phase: "between", span: { fromMin: 480, toMin: 580 } });
      expect(hallDutyNow(day, 590)).toEqual({ phase: "done" });
    });

    test("időzítés nélküli nap: none", () => {
      const bare = buildHallDutyDay(SLOTS, { dateKey: "x", day: "HÉTFŐ", week: "A", periods: [] });
      const onlyNamed = { ...bare, breaks: bare.breaks.filter((b) => b.startMin === null) };
      expect(hallDutyNow(onlyNamed, 500)).toEqual({ phase: "none" });
    });
  });
});
