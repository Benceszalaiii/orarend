import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { GET } from "./route";

//! A KÖZVETÍTŐ LÉNYEGE A FEJLÉC. A Jedlikinfo `Origin` és `Referer` nélkül
//! 403-at ad a `timetable/cards`-ra — ha ez a végpont valaha elfelejtené
//! elküldeni őket, minden chatbot-kérés csendben 403-ba futna. Ezt őrzi az
//! első teszt; a többi a kérdező hibáit választja el a forráséitól.

type Call = { url: string; init?: RequestInit };

const CLASSES = [
  { short: "13C", name: "13.C" },
  { short: "09A", name: "9.A" },
];
const TEACHERS = [
  { short: "AA", name: "Ágoston Anett" },
  { short: "BB", name: "Minta Anna" },
];

const CARDS = {
  full: false,
  fromDate: "2026.09.28",
  toDate: "2026.10.02",
  days: [
    { name: "Hétfő", date: "2026.09.28", week: "A", dayOfWeek: 1 },
    { name: "Kedd", date: "2026.09.29", week: "A", dayOfWeek: 2 },
  ],
  periods: [
    { number: 1, startHour: 8, startMinute: 0, endHour: 8, endMinute: 45 },
  ],
  cards: [
    {
      date: "2026.09.28",
      dateValue: "2026-09-28",
      fromPeriod: 1,
      periodsCount: 1,
      startHour: 8,
      startMinute: 0,
      endHour: 8,
      endMinute: 45,
      text: "MAT",
      textTitle: "Matematika",
      rightBottom: "BB",
      rightBottomTitle: "Minta Anna",
      leftBottom: "112",
      leftBottomTitle: "",
      centerTop: "",
      groupName: "Egész osztály",
      groupColumn: 1,
      groupCount: 1,
      week: "A",
      dayOfWeek: 1,
      startMinuteFromMidnight: 480,
      endMinuteFromMidnight: 525,
      type: "class",
    },
  ],
};

let calls: Call[] = [];
let cardsStatus = 200;
const realFetch = globalThis.fetch;

beforeEach(() => {
  calls = [];
  cardsStatus = 200;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    if (url.endsWith("/timetable/classes")) return Response.json(CLASSES);
    if (url.endsWith("/timetable/teachers")) return Response.json(TEACHERS);
    if (url.endsWith("/timetable/cards")) {
      return cardsStatus === 200
        ? Response.json(CARDS)
        : new Response("", { status: cardsStatus });
    }
    //* A tanév rendje és a csengetés elmaradhat — a hét attól még kész.
    return new Response("", { status: 404 });
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

function get(query: string) {
  return GET(new Request(`https://orarend.test/api/orarend${query}`));
}

describe("/api/orarend", () => {
  test("a hetet a Jedlikinfo saját fejléceivel kéri le", async () => {
    const res = await get("?osztaly=13.c&het=2026-09-30");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toContain("s-maxage");

    const cards = calls.find((c) => c.url.endsWith("/timetable/cards"));
    const headers = cards?.init?.headers as Record<string, string>;
    expect(headers.Origin).toBe("https://jedlikinfo.jedlik.eu");
    expect(headers.Referer).toBe("https://jedlikinfo.jedlik.eu/");
    const body = JSON.parse(String(cards?.init?.body));
    expect(body.class).toBe("13C");
    expect(body.fromDate).toBe("2026-09-28");

    const data = await res.json();
    expect(data.subject).toEqual({ short: "13C", name: "13.C" });
    expect(data.weekStart).toBe("2026-09-28");
    expect(data.periods[0]).toMatchObject({ start: "08:00", end: "08:45" });
    expect(data.lessons[0]).toMatchObject({
      subject: "Matematika",
      teacher: "Minta Anna",
      room: "112",
      start: "08:00",
      end: "08:45",
    });
  });

  test("tanárra is kérhető", async () => {
    const res = await get("?tanar=AA&het=2026-09-28");
    expect(res.status).toBe(200);
    const cards = calls.find((c) => c.url.endsWith("/timetable/cards"));
    expect(JSON.parse(String(cards?.init?.body)).teacher).toBe("AA");
  });

  test("alany nélkül az osztályok és a tanárok listája", async () => {
    const res = await get("");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      classes: [
        { ...CLASSES[0], url: "https://orarend.test/api/orarend?osztaly=13C" },
        { ...CLASSES[1], url: "https://orarend.test/api/orarend?osztaly=09A" },
      ],
      teachers: [
        { ...TEACHERS[0], url: "https://orarend.test/api/orarend?tanar=AA" },
        { ...TEACHERS[1], url: "https://orarend.test/api/orarend?tanar=BB" },
      ],
    });
  });

  //! A BUN MAGÁTÓL IS KIÍRNÁ, A NODE NEM. Ezért a fejlécet nézzük, és a
  //! nyers bájtokat is: az ékezetes név UTF-8-ként menjen ki, ne `\u` kóddal
  //! és ne Latin-1-ként.
  test("UTF-8-at mond ki, és úgy is küldi", async () => {
    for (const query of ["", "?osztaly=13C", "?osztaly=13C&tanar=AA"]) {
      const res = await get(query);
      expect(res.headers.get("content-type")).toBe(
        "application/json; charset=utf-8",
      );
    }
    const bytes = new Uint8Array(await (await get("")).arrayBuffer());
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    expect(text).toContain("Ágoston Anett");
  });

  test("a kérdező hibája 4xx, és a forrást meg se kérdezzük", async () => {
    for (const query of [
      "?osztaly=13C&tanar=AA",
      "?osztaly=13C&het=holnap",
      `?osztaly=${"X".repeat(65)}`,
    ]) {
      const res = await get(query);
      expect(res.status).toBe(400);
      expect((await res.json()).error.kind).toBe("bad-request");
    }
    expect(calls).toHaveLength(0);
  });

  test("ismeretlen osztály: 404", async () => {
    const res = await get("?osztaly=99Z");
    expect(res.status).toBe(404);
    expect((await res.json()).error.kind).toBe("unknown-class");
  });

  test("a Jedlikinfo hibája 5xx, nem a kérdezőé", async () => {
    cardsStatus = 403;
    const res = await get("?osztaly=13C");
    expect(res.status).toBe(502);
    expect(res.headers.get("cache-control")).toBeNull();
  });
});
