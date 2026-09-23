import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { json, stubFetch } from "@/test/browser";
import { redisDel, redisDump, resetRedis } from "@/test/redis";
import { FEED_REFRESH_MINUTES, refreshWindow, renderFeed, servableWindow } from "./calendar-source";
import { type CalendarFeedRow, leaseWindowRefresh, writeWindow } from "./calendar-store";
import { budapestNow } from "./push-plan";
import { addDays, mondayOf } from "./timetable";

let stub: ReturnType<typeof stubFetch>;
let cards: (fromDate: string) => Response;

//* A Jedlikinfo utánzata: a kért hét öt napja, hétfőnként egy matekórával.
function weekOf(fromDate: string) {
  const days = [0, 1, 2, 3, 4].map((i) => {
    const key = addDays(fromDate, i);
    return { name: `Nap ${i + 1}`, date: key.replaceAll("-", "."), week: "A", dayOfWeek: i + 1 };
  });
  return {
    full: false,
    fromDate,
    toDate: addDays(fromDate, 4),
    days,
    periods: [{ number: 1, startHour: 8, startMinute: 0, endHour: 8, endMinute: 45 }],
    cards: [
      {
        date: fromDate.replaceAll("-", "."),
        text: "mat",
        textTitle: "Matematika",
        rightBottom: "LM",
        rightBottomTitle: "Lipták Mária",
        leftBottom: "102",
        groupName: "",
        groupColumn: 0,
        groupCount: 1,
        week: "AB",
        dayOfWeek: 1,
        startMinuteFromMidnight: 480,
        endMinuteFromMidnight: 525,
      },
    ],
  };
}

beforeEach(() => {
  resetRedis();
  cards = (fromDate) => json(weekOf(fromDate));
  stub = stubFetch((url, init) => {
    if (url.endsWith("timetable/classes")) return json([{ short: "12A", name: "12.A" }]);
    if (url.endsWith("timetable/cards")) return cards(JSON.parse(init?.body as string).fromDate);
    return new Response("", { status: 404 });
  });
});
afterEach(() => stub.restore());

const thisMonday = () => mondayOf(budapestNow().dayKey);

describe("servableWindow", () => {
  test("tárolt ablak nélkül üres és nem friss", async () => {
    expect(await servableWindow("class", "12A")).toEqual({ weeks: [], fetchedAt: null, fresh: false });
  });

  test("friss, amíg egy óránál újabb", async () => {
    await writeWindow("class", "12A", []);
    expect((await servableWindow("class", "12A")).fresh).toBe(true);
    const clock = spyOn(Date, "now").mockReturnValue(Date.now() + FEED_REFRESH_MINUTES * 60_000 + 1);
    expect((await servableWindow("class", "12A")).fresh).toBe(false);
    clock.mockRestore();
  });
});

describe("refreshWindow", () => {
  test("egy hét vissza, három előre — öt lekérés, eltárolva", async () => {
    const result = await refreshWindow("class", "12A");
    const monday = thisMonday();
    expect(result.fresh).toBe(true);
    expect(result.weeks.map((w) => w.weekStart)).toEqual([-1, 0, 1, 2, 3].map((i) => addDays(monday, i * 7)));
    expect(stub.calls.filter((c) => c.url.endsWith("timetable/cards"))).toHaveLength(5);
    expect(redisDump()["cal:weeks:12A"]).toBeDefined();
    expect((await servableWindow("class", "12A")).weeks).toHaveLength(5);
  });

  test("ha más kérés frissít épp, a meglévőt adja, lekérés nélkül", async () => {
    await writeWindow("class", "12A", []);
    await leaseWindowRefresh("class", "12A");
    const result = await refreshWindow("class", "12A");
    expect(result.fresh).toBe(false);
    expect(result.fetchedAt).not.toBeNull();
    expect(stub.calls).toHaveLength(0);
  });

  test("elbukott hét helyett a korábbi (egy hétnél frissebb) példány", async () => {
    await refreshWindow("class", "12A");
    resetRedisLockOnly();
    const failing = addDays(thisMonday(), 7);
    cards = (fromDate) => (fromDate === failing ? new Response("", { status: 500 }) : json(weekOf(fromDate)));
    const result = await refreshWindow("class", "12A");
    expect(result.weeks.map((w) => w.weekStart)).toContain(failing);
    expect(result.weeks).toHaveLength(5);
  });

  test("ha minden lekérés elbukik, a régit adja és nem ír", async () => {
    cards = () => new Response("", { status: 500 });
    const result = await refreshWindow("class", "12A");
    expect(result).toEqual({ weeks: [], fetchedAt: null, fresh: false });
    expect(redisDump()["cal:weeks:12A"]).toBeUndefined();
  });
});

//* A zár két percig él — a második frissítéshez el kell engedni.
function resetRedisLockOnly() {
  redisDel(...Object.keys(redisDump()).filter((key) => key.startsWith("cal:lock:")));
}

describe("renderFeed", () => {
  test("érvényes ICS a sor alanyával és a frissítési idővel", async () => {
    const window = await refreshWindow("class", "12A");
    const row: CalendarFeedRow = {
      kind: "class",
      short: "12A",
      prefs: [],
      dual: null,
      userId: null,
      createdAt: 0,
      touchedAt: 0,
    };
    const ics = renderFeed({ row, window, stamp: Date.UTC(2026, 8, 14) });
    expect(ics.startsWith("BEGIN:VCALENDAR")).toBe(true);
    expect(ics).toContain("12A");
    expect(ics).toContain("Matematika");
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(5);
    expect(ics).toContain("REFRESH-INTERVAL;VALUE=DURATION:PT60M");
    expect(ics).toContain("X-PUBLISHED-TTL:PT60M");
  });
});
