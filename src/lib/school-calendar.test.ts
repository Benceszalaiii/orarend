import { afterEach, describe, expect, test } from "bun:test";
import { json, stubFetch } from "@/test/browser";
import { loadDayBells, loadRingSystemNames, loadSchoolPlan } from "./school-calendar";

//! A modul memóriában gyorsítótáraz (hónaponként, naponként). Minden teszt
//! ezért MÁS hónapot / napot kér — különben egy korábbi teszt válasza jönne.

let restore = () => {};
afterEach(() => restore());
function serve(handler: Parameters<typeof stubFetch>[0]) {
  const stub = stubFetch(handler);
  restore = stub.restore;
  return stub;
}

describe("loadSchoolPlan", () => {
  test("hónaponként egy kérés, a napok dátum szerint", async () => {
    const { calls } = serve((url) => {
      if (url.includes("year=2031&month=1")) {
        return json([
          {
            date: "2031-01-30T00:00:00",
            week: "A",
            teachingDay: true,
            ringSystemId: 1,
            events: " Szalagavató \n\n Fogadóóra ",
          },
          { date: "2031-01-31", week: "x", teachingDay: false, ringSystemId: null },
          { date: "nem dátum" },
          null,
        ]);
      }
      if (url.includes("year=2031&month=2")) {
        return json([{ date: "2031-02-02", week: "B", teachingDay: true, ringSystemId: 2 }]);
      }
      return new Response("", { status: 404 });
    });
    const plan = await loadSchoolPlan(["2031-01-30", "2031-01-31", "2031-02-02", "rossz"]);
    expect(calls).toHaveLength(2);
    expect(plan.get("2031-01-30")).toEqual({
      dateKey: "2031-01-30",
      teaching: true,
      ringSystemId: 1,
      week: "A",
      notes: ["Szalagavató", "Fogadóóra"],
    });
    expect(plan.get("2031-01-31")).toEqual({
      dateKey: "2031-01-31",
      teaching: false,
      ringSystemId: null,
      week: "",
      notes: [],
    });
    expect(plan.get("2031-02-02")?.week).toBe("B");
    expect(plan.size).toBe(3);
  });

  test("a második kérés a gyorsítótárból jön", async () => {
    serve(() => json([{ date: "2031-03-02", teachingDay: true }]));
    await loadSchoolPlan(["2031-03-02"]);
    restore();
    const { calls } = serve(() => json([]));
    const plan = await loadSchoolPlan(["2031-03-02"]);
    expect(calls).toHaveLength(0);
    expect(plan.get("2031-03-02")?.teaching).toBe(true);
  });

  test("egyidejű kérések egyetlen hálózati hívást osztanak", async () => {
    const { calls } = serve(() => json([{ date: "2031-04-01" }]));
    await Promise.all([loadSchoolPlan(["2031-04-01"]), loadSchoolPlan(["2031-04-02"])]);
    expect(calls).toHaveLength(1);
  });

  test("a hiba nem kerül a gyorsítótárba", async () => {
    serve(() => new Response("", { status: 500 }));
    expect((await loadSchoolPlan(["2031-05-01"])).size).toBe(0);
    restore();
    serve(() => json([{ date: "2031-05-01", teachingDay: true }]));
    expect((await loadSchoolPlan(["2031-05-01"])).size).toBe(1);
  });

  test("nem tömb vagy dobó hálózat: üres", async () => {
    serve(() => json({ error: true }));
    expect((await loadSchoolPlan(["2031-06-01"])).size).toBe(0);
    restore();
    serve(() => {
      throw new Error("offline");
    });
    expect((await loadSchoolPlan(["2031-07-01"])).size).toBe(0);
  });
});

describe("loadRingSystemNames", () => {
  test("csak a teljes (id + név) bejegyzések, levágott névvel", async () => {
    serve((url) =>
      url.endsWith("timetable/ringsystem")
        ? json([{ id: 1, name: " Normál " }, { id: "2", name: "x" }, { id: 3 }, null])
        : new Response("", { status: 404 }),
    );
    const names = await loadRingSystemNames();
    expect([...names]).toEqual([[1, "Normál"]]);
  });
});

describe("loadDayBells", () => {
  test("a magyar mezőnevekből percek", async () => {
    serve(() =>
      json([
        { óra: 0, becsengetés: "7:15", kicsengetés: "7:45" },
        { óra: 1, becsengetés: "08:00", kicsengetés: "08:30" },
        { óra: 2, becsengetés: "8:4", kicsengetés: "9:00" },
        { óra: "3", becsengetés: "9:00", kicsengetés: "9:30" },
      ]),
    );
    expect(await loadDayBells("2031-08-01")).toEqual([
      { number: 0, startMin: 435, endMin: 465 },
      { number: 1, startMin: 480, endMin: 510 },
    ]);
  });

  test("üres vagy értelmezhetetlen: null", async () => {
    serve(() => json([{ óra: 1 }]));
    expect(await loadDayBells("2031-08-02")).toBeNull();
    restore();
    serve(() => json("x"));
    expect(await loadDayBells("2031-08-03")).toBeNull();
  });
});
