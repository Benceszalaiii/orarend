import { describe, expect, test } from "bun:test";
import {
  type CompetitionInput,
  competitionInputSchema,
  contestFeedEvents,
  contestReminderText,
  daysUntil,
  deadlineLabel,
  deadlineOf,
  dueContestReminders,
  openDeadlines,
  rankedEntries,
} from "./competitions";

//* Budapesten 2026-09-24 csütörtök 10:00 (UTC+2).
const NOW = new Date("2026-09-24T08:00:00Z");

describe("határidő", () => {
  test("külön határidő nélkül a kezdés a határidő", () => {
    const startsAt = new Date("2026-10-10T08:00:00Z");
    expect(deadlineOf({ registrationDeadline: null, startsAt })).toBe(startsAt);
  });

  //! Budapesti napokban számol: az éjfél utáni UTC-időpont már másnap van.
  test("naptári napok budapesti idő szerint", () => {
    expect(daysUntil(new Date("2026-09-24T21:30:00Z"), NOW)).toBe(0);
    expect(daysUntil(new Date("2026-09-24T22:30:00Z"), NOW)).toBe(1);
    expect(daysUntil(new Date("2026-09-27T10:00:00Z"), NOW)).toBe(3);
  });

  test.each([
    ["2026-09-24T07:00:00Z", "Lejárt"],
    ["2026-09-24T20:00:00Z", "Ma jár le"],
    ["2026-09-25T20:00:00Z", "Holnap jár le"],
    ["2026-10-01T10:00:00Z", "7 nap múlva jár le"],
  ])("%s → %s", (iso, label) => {
    expect(deadlineLabel(new Date(iso), NOW)).toBe(label);
  });

  test("a sávban csak a nyitott, még le nem járt; a legsürgősebb elöl", () => {
    const c = (name: string, status: "OPEN" | "CLOSED", deadline: string) => ({
      name,
      status,
      registrationDeadline: new Date(deadline),
      startsAt: new Date("2026-12-01T08:00:00Z"),
    });
    const list = [
      c("késő", "OPEN", "2026-11-01T10:00:00Z"),
      c("lezárt", "CLOSED", "2026-09-30T10:00:00Z"),
      c("lejárt", "OPEN", "2026-09-20T10:00:00Z"),
      c("sürgős", "OPEN", "2026-09-26T10:00:00Z"),
    ];
    expect(openDeadlines(list, NOW).map((x) => x.name)).toEqual([
      "sürgős",
      "késő",
    ]);
  });
});

describe("értesítés", () => {
  const base = {
    status: "OPEN" as const,
    registrationDeadline: new Date("2026-09-27T20:00:00Z"),
    startsAt: new Date("2026-10-10T08:00:00Z"),
  };
  const at16 = 16 * 60 + 5;

  test("három nappal a határidő előtt, délután négykor", () => {
    expect(dueContestReminders(base, NOW, at16)).toEqual(["deadline-3"]);
    expect(dueContestReminders(base, NOW, 15 * 60)).toEqual([]);
    expect(dueContestReminders(base, NOW, 16 * 60 + 30)).toEqual([]);
  });

  test("előtte való nap és a verseny előtti nap", () => {
    const tomorrow = {
      ...base,
      registrationDeadline: new Date("2026-09-25T20:00:00Z"),
      startsAt: new Date("2026-09-25T08:00:00Z"),
    };
    expect(dueContestReminders(tomorrow, NOW, at16)).toEqual([
      "deadline-1",
      "starts-1",
    ]);
  });

  test("lezárt nevezésnél már csak a kezdésről szól", () => {
    expect(
      dueContestReminders(
        {
          ...base,
          status: "CLOSED",
          startsAt: new Date("2026-09-25T08:00:00Z"),
        },
        NOW,
        at16,
      ),
    ).toEqual(["starts-1"]);
  });

  test("elmaradó versenyről nem szól", () => {
    expect(
      dueContestReminders({ ...base, status: "CANCELLED" }, NOW, at16),
    ).toEqual([]);
  });

  test("a szöveg", () => {
    const c = { ...base, name: "OSZTV" };
    expect(contestReminderText("deadline-3", c)).toEqual({
      title: "OSZTV: 3 nap múlva lejár a nevezés",
      body: "Nevezési határidő: 2026. 09. 27. 22:00.",
    });
    expect(contestReminderText("starts-1", c).title).toBe("OSZTV holnap");
  });
});

describe("competitionInputSchema", () => {
  const input: CompetitionInput = {
    name: "OSZTV informatika",
    description: null,
    category: "PROGRAMMING",
    externalUrl: "osztv.hu",
    venue: "SCHOOL",
    room: "205",
    location: null,
    startsAt: "2026-11-10T08:00:00.000Z",
    endsAt: null,
    registrationDeadline: "2026-10-20T20:00:00.000Z",
    grades: [13],
    classes: [],
    capacity: null,
    teachers: ["TGY"],
    phases: [{ title: "Iskolai forduló", startsAt: null, endsAt: null }],
    clubs: ["osztv-elmeleti-felkeszites"],
  };

  test("érvényes; a hivatkozás https-t kap", () => {
    const parsed = competitionInputSchema.safeParse(input);
    expect(parsed.success).toBe(true);
    expect(parsed.data?.externalUrl).toBe("https://osztv.hu/");
  });

  test.each([
    ["kezdés utáni határidő", { registrationDeadline: "2026-11-11T08:00:00Z" }],
    ["kezdés előtti vég", { endsAt: "2026-11-09T08:00:00Z" }],
    ["külső helyszín cím nélkül", { venue: "EXTERNAL" as const }],
    ["javascript: hivatkozás", { externalUrl: "javascript:alert(1)" }],
    ["felelős tanár nélkül", { teachers: [] }],
    ["nem szakkör", { clubs: ["<b>"] }],
  ])("%s → hiba", (_, patch) => {
    expect(
      competitionInputSchema.safeParse({ ...input, ...patch }).success,
    ).toBe(false);
  });

  test("üres hivatkozás = nincs", () => {
    expect(
      competitionInputSchema.parse({ ...input, externalUrl: "  " }).externalUrl,
    ).toBeNull();
  });
});

test("rankedEntries: helyezettek, díjasok, a többiek ábécében", () => {
  const e = (name: string, rank: number | null, award: string | null) => ({
    name,
    rank,
    award,
  });
  expect(
    rankedEntries([
      e("Zoé", null, null),
      e("Ábel", null, null),
      e("Bea", 2, null),
      e("Csaba", null, "Különdíj"),
      e("Dóra", 1, "Arany"),
    ]).map((x) => x.name),
  ).toEqual(["Dóra", "Bea", "Csaba", "Ábel", "Zoé"]);
});

describe("contestFeedEvents", () => {
  const base = {
    slug: "osztv",
    name: "OSZTV",
    status: "OPEN" as const,
    //* Budapesten 10:00–13:00.
    startsAt: new Date("2026-11-10T09:00:00Z"),
    endsAt: new Date("2026-11-10T12:00:00Z"),
    registrationDeadline: new Date("2026-10-20T22:00:00Z"),
    location: null,
    room: "205",
    phases: [
      {
        id: "p1",
        title: "Döntő",
        startsAt: new Date("2027-03-01T08:00:00Z"),
        endsAt: null,
      },
    ],
  };

  test("a verseny, a határidő és a forduló budapesti idővel", () => {
    const events = contestFeedEvents(base);
    expect(events[0]).toMatchObject({
      dateKey: "2026-11-10",
      startMin: 600,
      endMin: 780,
      location: "205",
    });
    //* 22:00Z október 20-án még nyári idő (UTC+2): Budapesten 21-e éjfél.
    expect(events[1]).toMatchObject({
      summary: "Nevezési határidő: OSZTV",
      dateKey: "2026-10-21",
    });
    expect(events[2]).toMatchObject({
      summary: "OSZTV: Döntő",
      dateKey: "2027-03-01",
      startMin: 540,
      endMin: 570,
    });
  });

  test("lezárt nevezésnél nincs határidő-esemény, elmaradónál semmi", () => {
    expect(
      contestFeedEvents({ ...base, status: "CLOSED" }).some((e) =>
        e.summary.startsWith("Nevezési"),
      ),
    ).toBe(false);
    expect(contestFeedEvents({ ...base, status: "CANCELLED" })).toEqual([]);
  });
});
