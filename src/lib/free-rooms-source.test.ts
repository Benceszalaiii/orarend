import { afterEach, describe, expect, test } from "bun:test";
import { json, stubFetch } from "@/test/browser";
import { isServableDate, servableWeeks } from "./free-rooms-source";

//* A modul a heti foglaltságot ÉS a teremlistát (12 órára) a memóriában
//* tartja. Minden teszt saját példányt kap — különben egy korábbi teszt
//* teremlistája szivárogna át, és a sorrendtől függene az eredmény.
let instance = 0;
async function fresh() {
  return (await import(
    `./free-rooms-source.ts?t${++instance}`
  )) as typeof import("./free-rooms-source");
}

let restore = () => {};
afterEach(() => restore());
function serve(handler: Parameters<typeof stubFetch>[0]) {
  const stub = stubFetch(handler);
  restore = stub.restore;
  return stub;
}

describe("servableWeeks / isServableDate", () => {
  const now = new Date("2026-09-16T10:00:00Z");

  test("egy hét vissza, három előre, hétfőtől", () => {
    expect(servableWeeks(now)).toEqual([
      "2026-09-07",
      "2026-09-14",
      "2026-09-21",
      "2026-09-28",
      "2026-10-05",
    ]);
  });

  test("vasárnap késő este UTC-ben már budapesti hétfő", () => {
    expect(servableWeeks(new Date("2026-09-20T22:30:00Z"))[1]).toBe(
      "2026-09-21",
    );
  });

  test("a napot a hete szerint ítéli meg", () => {
    expect(isServableDate("2026-09-06", now)).toBe(false);
    expect(isServableDate("2026-09-07", now)).toBe(true);
    expect(isServableDate("2026-10-11", now)).toBe(true);
    expect(isServableDate("2026-10-12", now)).toBe(false);
  });
});

describe("loadWeekOccupancy", () => {
  const WEEK = "2033-03-07";
  const days = [{ name: "Hétfő", date: "2033.03.07", week: "A", dayOfWeek: 1 }];
  const periods = [
    { number: 1, startHour: 8, startMinute: 0, endHour: 8, endMinute: 45 },
  ];
  const card = {
    date: "2033.03.07",
    text: "mat",
    textTitle: "Matematika",
    leftBottom: "LM",
    leftBottomTitle: "Lipták Mária",
    rightBottom: "12A",
    rightBottomTitle: "12A",
    week: "AB",
    dayOfWeek: 1,
    startMinuteFromMidnight: 480,
    endMinuteFromMidnight: 525,
  };

  function sweepServer(date: string) {
    return serve((url, init) => {
      if (url.endsWith("timetable/classrooms")) {
        return json([
          { short: "102", name: "102 labor" },
          { short: "103" },
          { short: "" },
          { name: "x" },
        ]);
      }
      if (url.endsWith("timetable/cards")) {
        const room = JSON.parse(init?.body as string).classroom;
        if (room === "103") return new Response("", { status: 500 });
        const dotted = date.replaceAll("-", ".");
        return json({
          days: [{ ...days[0], date: dotted }],
          periods,
          cards: [{ ...card, date: dotted }],
        });
      }
      return new Response("", { status: 404 });
    });
  }

  test("teremenként seper, a kiesett terem ismeretlen", async () => {
    const { loadWeekOccupancy } = await fresh();
    sweepServer(WEEK);
    const week = await loadWeekOccupancy("2033-03-09");
    expect(week?.weekStart).toBe(WEEK);
    expect(week?.days.map((d) => d.dateKey)).toEqual(["2033-03-07"]);
    expect(week?.periods).toEqual([{ number: 1, startMin: 480, endMin: 525 }]);
    expect(
      week?.rooms.map((r) => [r.short, r.name, r.bookings.length]),
    ).toEqual([["102", "102 labor", 1]]);
    expect(week?.unknown).toEqual(["103"]);
  });

  test("a kiszolgálható hét gyorsítótárból jön, a többi nem marad meg", async () => {
    const { loadWeekOccupancy } = await fresh();
    const monday = servableWeeks()[1];
    const { calls } = sweepServer(monday);
    const week = await loadWeekOccupancy(monday);
    const before = calls.length;
    expect(await loadWeekOccupancy(monday)).toBe(week as never);
    expect(calls.length).toBe(before);

    //* A 2033-as hét nem kiszolgálható: a takarítás kidobja, újra seper.
    restore();
    const again = sweepServer(WEEK);
    await loadWeekOccupancy(WEEK);
    expect(again.calls.length).toBeGreaterThan(0);
  });

  test("egy 429 után vár és egyszer újrapróbál", async () => {
    const { loadWeekOccupancy } = await fresh();
    let first = true;
    serve((url) => {
      if (url.endsWith("timetable/classrooms")) return json([{ short: "201" }]);
      if (url.endsWith("timetable/cards")) {
        if (first) {
          first = false;
          return new Response("", {
            status: 429,
            headers: { "retry-after": "0.01" },
          });
        }
        return json({
          days: [{ ...days[0], date: "2033.03.14" }],
          periods,
          cards: [],
        });
      }
      return new Response("", { status: 404 });
    });
    const week = await loadWeekOccupancy("2033-03-14");
    expect(week?.unknown).toEqual([]);
    expect(week?.rooms[0].bookings).toEqual([]);
  });

  test("egy nap sem jött: null", async () => {
    const { loadWeekOccupancy } = await fresh();
    serve((url) => {
      if (url.endsWith("timetable/cards"))
        return json({ days: [], periods, cards: [] });
      return new Response("", { status: 404 });
    });
    expect(await loadWeekOccupancy("2033-03-21")).toBeNull();
  });
});

describe("loadRoomsWeek", () => {
  const card = {
    text: "szakkör",
    textTitle: "09. évfolyam matematika szakkör",
    leftBottom: "BNM",
    leftBottomTitle: "Banáné Nagy Mónika",
    rightBottom: "",
    week: "AB",
    dayOfWeek: 1,
    startMinuteFromMidnight: 430,
    endMinuteFromMidnight: 475,
  };

  function roomServer(date: string, failing: string[] = []) {
    const dotted = date.replaceAll("-", ".");
    return serve((url, init) => {
      if (url.endsWith("timetable/cards")) {
        const room = JSON.parse(init?.body as string).classroom;
        if (failing.includes(room)) return new Response("", { status: 500 });
        return json({
          days: [{ name: "Hétfő", date: dotted, week: "A", dayOfWeek: 1 }],
          periods: [],
          cards: room === "207" ? [{ ...card, date: dotted }] : [],
        });
      }
      return new Response("", { status: 404 });
    });
  }

  //! A lényeg: NEM a 71 termet, csak a kérteket — és a teremlistát sem.
  test("csak a kért termeket kéri le", async () => {
    const { loadRoomsWeek } = await fresh();
    const monday = servableWeeks()[1];
    const { calls } = roomServer(monday);
    const week = await loadRoomsWeek(["207", "104", "207", ""], monday);
    const cardCalls = calls.filter((c) => c.url.endsWith("timetable/cards"));
    expect(cardCalls).toHaveLength(2);
    expect(calls.some((c) => c.url.endsWith("timetable/classrooms"))).toBe(
      false,
    );
    expect(week?.rooms.map((r) => [r.short, r.bookings.length])).toEqual([
      ["207", 1],
      ["104", 0],
    ]);
    expect(week?.rooms[0].bookings[0].teacherShort).toBe("BNM");
  });

  test("teremenként gyorsítótáraz", async () => {
    const { loadRoomsWeek } = await fresh();
    const monday = servableWeeks()[1];
    const { calls } = roomServer(monday);
    const cardCalls = () =>
      calls.filter((c) => c.url.endsWith("timetable/cards")).length;
    await loadRoomsWeek(["207"], monday);
    expect(cardCalls()).toBe(1);
    await loadRoomsWeek(["207"], monday);
    expect(cardCalls()).toBe(1);
  });

  test("a kiesett terem ismeretlen", async () => {
    const { loadRoomsWeek } = await fresh();
    const monday = servableWeeks()[1];
    roomServer(monday, ["104"]);
    const week = await loadRoomsWeek(["207", "104"], monday);
    expect(week?.unknown).toEqual(["104"]);
    expect(week?.rooms.map((r) => r.short)).toEqual(["207"]);
  });

  test("az ablakon kívüli hétre nem kérdez", async () => {
    const { loadRoomsWeek } = await fresh();
    const { calls } = roomServer("2033-03-07");
    expect(await loadRoomsWeek(["207"], "2033-03-07")).toBeNull();
    expect(calls).toHaveLength(0);
  });

  test("terem nélkül nincs mit kérdezni", async () => {
    const { loadRoomsWeek } = await fresh();
    expect(await loadRoomsWeek([], servableWeeks()[1])).toBeNull();
  });
});
