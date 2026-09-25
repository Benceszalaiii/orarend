import {
  afterAll,
  beforeEach,
  describe,
  expect,
  mock,
  setSystemTime,
  test,
} from "bun:test";
import { resetRedis } from "@/test/redis";
import type { ScheduleClub } from "./club-schedule";
import type { WeekOccupancy } from "./free-rooms";

//! A HÁTTÉRFELADAT SZAKKÖR-ÁGA, HÁLÓZAT ÉS ADATBÁZIS NÉLKÜL. A szakkörlistát, a
//! termek heti foglaltságát és a küldést kicseréljük; a tároló a hamis Redis
//! (`src/test/redis.ts`), tehát a foglalások és a lenyomat valódi úton mennek.

const club: ScheduleClub = {
  id: "c1",
  slug: "robotika",
  name: "Robotika",
  kind: "CLUB",
  grades: [],
  classes: [],
  tracks: [],
  audienceNote: null,
  organizers: ["BNM"],
  slots: [
    {
      id: "s1",
      weekday: 4,
      startMinute: 870,
      endMinute: 955,
      room: "402",
      teachers: ["BNM"],
      source: "TIMETABLE",
      validFrom: null,
      validUntil: null,
    },
  ],
};

let booked = true;
let reachable = true;

function occupancy(): WeekOccupancy {
  return {
    weekStart: "2026-09-21",
    fetchedAt: Date.now(),
    days: [1, 2, 3, 4, 5].map((dayOfWeek) => ({
      dateKey: `2026-09-2${dayOfWeek}`,
      name: "",
      dayOfWeek,
      week: "A",
      teaching: true,
    })),
    periods: [],
    rooms: [
      {
        short: "402",
        name: "402",
        bookings: booked
          ? [
              {
                dateKey: "2026-09-24",
                dayOfWeek: 4,
                startMin: 870,
                endMin: 955,
                subject: "Tehetséggondozó szakkör",
                classShort: "",
                teacher: "Banáné Nagy Mónika",
                teacherShort: "BNM",
                week: "AB",
              },
            ]
          : [],
      },
    ],
    unknown: [],
  };
}

const sent: { title: string; body: string; kind: string }[] = [];

mock.module("./club-store", () => ({
  loadScheduleClubs: async () => [club],
}));
mock.module("./free-rooms-source", () => ({
  loadRoomsWeek: async () => (reachable ? occupancy() : null),
}));
mock.module("./push-send", () => ({
  sendPush: async (
    subs: unknown[],
    payload: { title: string; body: string; kind: string },
  ) => {
    sent.push(payload);
    return { sent: subs.length, dropped: 0 };
  },
}));

const { runClub } = await import("./club-push");
const { saveSubscription } = await import("./push-store");

function tally() {
  return { reminders: 0, changes: 0, dropped: 0 };
}

async function follow() {
  await saveSubscription({
    endpoint: "https://push/1",
    p256dh: "k",
    auth: "a",
    classes: [],
    teachers: [],
    clubs: ["robotika"],
    everyLesson: false,
  });
}

//* Csütörtök 14:21 Budapesten (UTC+2) — kilenc perccel a 14:30-as kezdés előtt.
const BEFORE_START = new Date("2026-09-24T12:21:00Z");

beforeEach(async () => {
  resetRedis();
  sent.length = 0;
  booked = true;
  reachable = true;
  setSystemTime(BEFORE_START);
  await follow();
});

afterAll(() => setSystemTime());

describe("runClub", () => {
  test("tíz perccel előtte egyszer szól", async () => {
    const t = tally();
    await runClub("robotika", t);
    await runClub("robotika", t);
    expect(t.reminders).toBe(1);
    expect(sent.map((p) => p.title)).toEqual(["Robotika 10 perc múlva"]);
  });

  test("feliratkozó nélkül semmit nem kér le és nem küld", async () => {
    resetRedis();
    await runClub("robotika", tally());
    expect(sent).toEqual([]);
  });

  test("az első megfigyelés csak lenyomatot ír; az új kiesésre szól", async () => {
    setSystemTime(new Date("2026-09-22T08:00:00Z"));
    await runClub("robotika", tally());
    expect(sent).toEqual([]);

    booked = false;
    const t = tally();
    await runClub("robotika", t);
    await runClub("robotika", t);
    expect(t.changes).toBe(1);
    expect(sent.map((p) => p.title)).toEqual(["Robotika: nincs az órarendben"]);
  });

  test("lekérhetetlen hétnél nem ír lenyomatot, és nem riaszt", async () => {
    setSystemTime(new Date("2026-09-22T08:00:00Z"));
    reachable = false;
    await runClub("robotika", tally());
    reachable = true;
    booked = false;
    //* Az első SIKERES megfigyelés — nincs mihez képest újnak látni.
    await runClub("robotika", tally());
    expect(sent).toEqual([]);
  });

  test("órarendből kiesett alkalomra nem küld emlékeztetőt", async () => {
    booked = false;
    const t = tally();
    await runClub("robotika", t);
    expect(t.reminders).toBe(0);
  });
});
