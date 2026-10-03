import { describe, expect, test } from "bun:test";
import {
  bookingMatchesSlot,
  type ClubSession,
  clubChangeText,
  clubFeedEvents,
  clubOfBooking,
  clubReminderText,
  dueClubReminders,
  goneSessionIds,
  newlyGone,
  type ScheduleClub,
  type ScheduleSlot,
  SESSION_STATUS_TEXT,
  sessionsOfWeek,
  unclaimedCards,
} from "./club-schedule";
import type { RoomBooking, WeekOccupancy } from "./free-rooms";

//! A kártyák a 2026-09-21-i hét valódi seprésének mintájára készültek: a 207
//! hétfő 0. óráján BNM szakköre, osztály nélkül; a 104-ben kedden 0. órában FM
//! kártyája (10E kompetencia), és egy rendes 13C-s óra, ami SOHA nem szakkör.

const WEEK = "2026-09-21";

function booking(patch: Partial<RoomBooking>): RoomBooking {
  return {
    dateKey: "2026-09-21",
    dayOfWeek: 1,
    startMin: 430,
    endMin: 475,
    subject: "09. évfolyam matematika szakkör",
    subjectShort: "",
    classShort: "",
    teacher: "Banáné Nagy Mónika",
    teacherShort: "BNM",
    week: "AB",
    ...patch,
  };
}

function occupancy(patch: Partial<WeekOccupancy> = {}): WeekOccupancy {
  return {
    weekStart: WEEK,
    fetchedAt: 0,
    days: [1, 2, 3, 4, 5].map((dayOfWeek) => ({
      dateKey: `2026-09-2${dayOfWeek}`,
      name: "",
      dayOfWeek,
      week: "B",
      teaching: true,
    })),
    periods: [],
    rooms: [
      { short: "207", name: "207", bookings: [booking({})] },
      {
        short: "104",
        name: "104",
        bookings: [
          booking({
            dayOfWeek: 2,
            teacherShort: "FM",
            subject: "10E matematikai kompetenciák fejlesztése",
          }),
          booking({
            dayOfWeek: 3,
            startMin: 480,
            endMin: 525,
            classShort: "13C",
            teacherShort: "BNM",
            subject: "Fizika",
          }),
        ],
      },
      {
        short: "Stúdió",
        name: "Stúdió",
        bookings: [
          booking({
            dayOfWeek: 3,
            startMin: 870,
            endMin: 955,
            teacherShort: "MT",
            subject: "Tehetséggondozó szakkör",
          }),
        ],
      },
    ],
    unknown: ["108"],
    ...patch,
  };
}

function slot(patch: Partial<ScheduleSlot>): ScheduleSlot {
  return {
    id: "s1",
    weekday: 1,
    startMinute: 430,
    endMinute: 475,
    room: "207",
    teachers: ["BNM"],
    source: "TIMETABLE",
    validFrom: null,
    validUntil: null,
    ...patch,
  };
}

function club(slots: ScheduleSlot[], patch: Partial<ScheduleClub> = {}) {
  return {
    id: "c1",
    slug: "09-evf-matematika-szakkor",
    name: "09. évf. matematika szakkör",
    kind: "CLUB" as const,
    grades: [9],
    classes: [],
    tracks: [],
    audienceNote: null,
    organizers: ["BNM"],
    slots,
    ...patch,
  };
}

describe("bookingMatchesSlot", () => {
  test("osztály nélküli kártya, a vezetővel, átfedő időben", () => {
    expect(bookingMatchesSlot(booking({}), slot({}))).toBe(true);
  });

  //! A szakkör tanára rendes órát is tart ugyanott — az soha nem szakkör.
  test("osztályhoz tartozó kártya nem szakkör", () => {
    expect(bookingMatchesSlot(booking({ classShort: "13C" }), slot({}))).toBe(
      false,
    );
  });

  test("más tanár kártyája nem igazolja", () => {
    expect(bookingMatchesSlot(booking({ teacherShort: "VA" }), slot({}))).toBe(
      false,
    );
  });

  test("félig nyitott sáv: az egymás után következő nem fed át", () => {
    expect(
      bookingMatchesSlot(
        booking({ startMin: 475, endMin: 520 }),
        slot({ startMinute: 430, endMinute: 475 }),
      ),
    ).toBe(false);
  });

  test("a tanárjel betűméretre nem érzékeny", () => {
    expect(bookingMatchesSlot(booking({}), slot({ teachers: ["bnm"] }))).toBe(
      true,
    );
  });
});

describe("sessionsOfWeek", () => {
  test("a Jedlikinfo igazolja — és az ideje nyer", () => {
    const occ = occupancy();
    occ.rooms[0].bookings = [booking({ startMin: 435, endMin: 480 })];
    const [session] = sessionsOfWeek([club([slot({})])], occ, WEEK);
    expect(session).toMatchObject({
      status: "confirmed",
      dateKey: "2026-09-21",
      startMin: 435,
      endMin: 480,
      room: "207",
      clubSlug: "09-evf-matematika-szakkor",
    });
  });

  test("a megnézett teremben nincs ott → missing", () => {
    const [session] = sessionsOfWeek(
      [club([slot({ weekday: 4 })])],
      occupancy(),
      WEEK,
    );
    expect(session.status).toBe("missing");
    expect(session.dateKey).toBe("2026-09-24");
    //* A slot saját ideje marad, hiszen nincs mivel felülírni.
    expect(session.startMin).toBe(430);
  });

  test("elbukott terem → unknown, nem missing", () => {
    const [session] = sessionsOfWeek(
      [club([slot({ room: "108" })])],
      occupancy(),
      WEEK,
    );
    expect(session.status).toBe("unknown");
  });

  test("nem sepert terem → unknown", () => {
    const [session] = sessionsOfWeek(
      [club([slot({ room: "B5" })])],
      occupancy(),
      WEEK,
    );
    expect(session.status).toBe("unknown");
  });

  test("lekérhetetlen hét → unknown", () => {
    const [session] = sessionsOfWeek([club([slot({})])], null, WEEK);
    expect(session.status).toBe("unknown");
  });

  test("csak a tanár szerint → declared, terem nélkül is", () => {
    const [session] = sessionsOfWeek(
      [club([slot({ source: "ORGANIZER", room: null })])],
      occupancy(),
      WEEK,
    );
    expect(session.status).toBe("declared");
    expect(session.room).toBe("");
  });

  //! A tanítás nélküli nap minden forrást felülír.
  test("tanítás nélküli nap → no-school, a tanár szerintinél is", () => {
    const occ = occupancy();
    occ.days[0].teaching = false;
    const statuses = sessionsOfWeek(
      [club([slot({}), slot({ id: "s2", source: "ORGANIZER" })])],
      occ,
      WEEK,
    ).map((s) => s.status);
    expect(statuses).toEqual(["no-school", "no-school"]);
  });

  test("a két tanáros slotot bármelyik vezető kártyája igazolja", () => {
    const [session] = sessionsOfWeek(
      [
        club(
          [
            slot({
              weekday: 3,
              startMinute: 870,
              endMinute: 955,
              room: "stúdió",
              teachers: ["HZ", "MT"],
            }),
          ],
          { organizers: ["HZ", "MT"] },
        ),
      ],
      occupancy(),
      WEEK,
    );
    expect(session.status).toBe("confirmed");
  });

  test("az érvényességen kívüli nap kimarad", () => {
    expect(
      sessionsOfWeek(
        [club([slot({ validFrom: "2026-09-22" })])],
        occupancy(),
        WEEK,
      ),
    ).toEqual([]);
    expect(
      sessionsOfWeek(
        [club([slot({ validUntil: "2026-09-21" })])],
        occupancy(),
        WEEK,
      ),
    ).toHaveLength(1);
  });

  test("nap, aztán idő szerint rendezve", () => {
    const sessions = sessionsOfWeek(
      [
        club([
          slot({ id: "late", weekday: 2, startMinute: 870, endMinute: 955 }),
          slot({ id: "early", weekday: 2 }),
          slot({ id: "mon" }),
        ]),
      ],
      occupancy(),
      WEEK,
    );
    expect(sessions.map((s) => s.slotId)).toEqual(["mon", "early", "late"]);
  });
});

describe("clubOfBooking", () => {
  const clubs = [club([slot({})])];

  test("a teremkereső foglalásához megtalálja a szakkört", () => {
    expect(clubOfBooking(booking({}), "207", clubs)).toEqual({
      slug: "09-evf-matematika-szakkor",
      name: "09. évf. matematika szakkör",
    });
  });

  test("másik teremben ugyanaz a kártya nem ez a szakkör", () => {
    expect(clubOfBooking(booking({}), "104", clubs)).toBeNull();
  });

  test("csak-tanár-szerinti slot nem nevez meg foglalást", () => {
    expect(
      clubOfBooking(booking({}), "207", [
        club([slot({ source: "ORGANIZER" })]),
      ]),
    ).toBeNull();
  });
});

describe("unclaimedCards", () => {
  test("a tanár gazdátlan, osztály nélküli kártyái", () => {
    const occ = occupancy();
    occ.rooms.push({
      short: "202",
      name: "202",
      bookings: [
        booking({
          dayOfWeek: 2,
          startMin: 870,
          endMin: 1045,
          subject: "Tehetséggondozó szakkör",
        }),
      ],
    });
    //* A 207-es hétfői kártyája már a 09. évf. matematikáé; a 104-es szerdai
    //* 13C-s órája nem szakkör — egyik sem jelenik meg.
    expect(unclaimedCards("BNM", occ, [club([slot({})])])).toEqual([
      {
        weekday: 2,
        startMin: 870,
        endMin: 1045,
        room: "202",
        subject: "Tehetséggondozó szakkör",
      },
    ]);
  });

  test("szakkör nélkül minden osztály nélküli kártyája gazdátlan", () => {
    expect(unclaimedCards("bnm", occupancy(), []).map((c) => c.room)).toEqual([
      "207",
    ]);
  });
});

describe("értesítések", () => {
  const session = (patch: Partial<ClubSession>): ClubSession => ({
    id: "s1:2026-09-24",
    slotId: "s1",
    clubSlug: "robotika",
    clubName: "Robotika",
    dateKey: "2026-09-24",
    dayOfWeek: 4,
    startMin: 870,
    endMin: 955,
    room: "402",
    status: "confirmed",
    ...patch,
  });

  test("tíz perccel előtte, az ablakon belül szól", () => {
    const now = { dayKey: "2026-09-24", minutes: 860 };
    expect(dueClubReminders([session({})], now, 10, 6)).toHaveLength(1);
    expect(
      dueClubReminders([session({})], { ...now, minutes: 866 }, 10, 6),
    ).toHaveLength(0);
    expect(
      dueClubReminders([session({})], { ...now, minutes: 859 }, 10, 6),
    ).toHaveLength(0);
  });

  test("másik napon és elmaradó alkalomra nem szól", () => {
    const now = { dayKey: "2026-09-24", minutes: 862 };
    expect(
      dueClubReminders([session({ dateKey: "2026-09-25" })], now, 10, 6),
    ).toEqual([]);
    expect(
      dueClubReminders([session({ status: "missing" })], now, 10, 6),
    ).toEqual([]);
    expect(
      dueClubReminders([session({ status: "no-school" })], now, 10, 6),
    ).toEqual([]);
  });

  test("a csak tanár szerinti időpontra szól, és megmondja", () => {
    const now = { dayKey: "2026-09-24", minutes: 862 };
    const [due] = dueClubReminders(
      [session({ status: "declared" })],
      now,
      10,
      6,
    );
    expect(clubReminderText(due, 10)).toEqual({
      title: "Robotika 10 perc múlva",
      body: "14:30 — 402\nA vezető szerint — az iskola órarendjében nem szerepel.",
    });
  });

  test("csak az újonnan kiesett alkalomra szól", () => {
    const sessions = [
      session({ id: "a", status: "missing" }),
      session({ id: "b", status: "missing" }),
      session({ id: "c" }),
    ];
    expect(goneSessionIds(sessions)).toEqual(["a", "b"]);
    expect(
      newlyGone({ sessions, before: ["a"], fromDayKey: "2026-09-21" }).map(
        (s) => s.id,
      ),
    ).toEqual(["b"]);
  });

  test("első megfigyelésnél és múltbeli napra hallgat", () => {
    const sessions = [session({ id: "a", status: "missing" })];
    expect(
      newlyGone({ sessions, before: null, fromDayKey: "2026-09-21" }),
    ).toEqual([]);
    expect(
      newlyGone({ sessions, before: [], fromDayKey: "2026-09-25" }),
    ).toEqual([]);
  });

  test("a változás szövege", () => {
    expect(clubChangeText([session({ status: "missing" })])).toEqual({
      title: "Robotika: nincs az órarendben",
      body: "Csütörtök 14:30: nincs az órarendben",
    });
    expect(clubChangeText([session({ status: "no-school" })]).title).toBe(
      "Robotika: aznap nincs tanítás",
    );
  });
});

describe("clubFeedEvents", () => {
  const base: ClubSession = {
    id: "s1:2026-09-24",
    slotId: "s1",
    clubSlug: "robotika",
    clubName: "Robotika",
    dateKey: "2026-09-24",
    dayOfWeek: 4,
    startMin: 870,
    endMin: 955,
    room: "402",
    status: "confirmed",
  };

  test("az elmaradó alkalom kimarad, a többi a forrásával együtt kerül be", () => {
    const events = clubFeedEvents([
      base,
      {
        ...base,
        id: "s1:2026-10-01",
        dateKey: "2026-10-01",
        status: "missing",
      },
      {
        ...base,
        id: "s1:2026-10-08",
        dateKey: "2026-10-08",
        status: "no-school",
      },
      {
        ...base,
        id: "s2:2026-10-09",
        dateKey: "2026-10-09",
        room: "",
        status: "declared",
      },
    ]);
    expect(events.map((e) => e.dateKey)).toEqual(["2026-09-24", "2026-10-09"]);
    expect(events[0]).toMatchObject({
      uid: "club-s1-2026-09-24@orarend",
      location: "402",
      description: SESSION_STATUS_TEXT.confirmed,
    });
    expect(events[1].location).toBeUndefined();
  });
});
