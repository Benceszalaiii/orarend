import { describe, expect, test } from "bun:test";
import {
  clubDeleteWarning,
  contestAttention,
  contestDeleteWarning,
  isStaleClub,
  matchesQuery,
  STALE_AFTER_DAYS,
} from "./admin-content";

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-10-04T12:00:00Z");
const ago = (days: number) => new Date(NOW.getTime() - days * DAY);

describe("isStaleClub", () => {
  const organizerSlot = [{ source: "ORGANIZER" as const }];
  const timetableSlot = [{ source: "TIMETABLE" as const }];

  test("a régen megerősített, csak tanár szerinti időpont elavult", () => {
    expect(
      isStaleClub(
        {
          status: "ACTIVE",
          confirmedAt: ago(STALE_AFTER_DAYS + 1),
          slots: organizerSlot,
        },
        NOW,
      ),
    ).toBe(true);
  });

  test("a friss megerősítés nem elavult", () => {
    expect(
      isStaleClub(
        { status: "ACTIVE", confirmedAt: ago(10), slots: organizerSlot },
        NOW,
      ),
    ).toBe(false);
  });

  //* A Jedlikinfóval igazolt időpontot a heti seprés tartja frissen.
  test("az órarendből igazolt időpont sosem elavult", () => {
    expect(
      isStaleClub(
        { status: "ACTIVE", confirmedAt: ago(400), slots: timetableSlot },
        NOW,
      ),
    ).toBe(false);
  });

  test("a javaslat és a megszűnt szakkör nem kér megerősítést", () => {
    for (const status of ["PROPOSED", "ARCHIVED"] as const) {
      expect(
        isStaleClub(
          { status, confirmedAt: ago(400), slots: organizerSlot },
          NOW,
        ),
      ).toBe(false);
    }
  });
});

describe("matchesQuery", () => {
  test("üres keresőszó minden sort átenged", () => {
    expect(matchesQuery("  ", ["bármi"])).toBe(true);
  });

  test("kis- és nagybetűtől függetlenül, ékezettel is talál", () => {
    expect(matchesQuery("ÁRVÍZ", [null, "árvíztűrő tükörfúrógép"])).toBe(true);
  });

  test("nincs találat, ha egyik mező sem tartalmazza", () => {
    expect(matchesQuery("drón", ["Robotika", undefined])).toBe(false);
  });
});

describe("törlési figyelmeztetés", () => {
  test("a szakkörnél kimondja, mi vész el", () => {
    const text = clubDeleteWarning({
      name: "Robotika",
      memberCount: 12,
      postCount: 3,
    });
    expect(text).toContain("12 tag jelentkezése");
    expect(text).toContain("3 hírfolyam-bejegyzés");
    expect(text).toContain("zárd le");
  });

  test("üres szakkörnél csak a kérdés marad", () => {
    expect(
      clubDeleteWarning({ name: "Teszt", memberCount: 0, postCount: 0 }),
    ).toBe('Véglegesen törlöd: „Teszt"?');
  });

  test('a meghirdetett versenynél az „Elmarad" állapotot ajánlja', () => {
    const text = contestDeleteWarning({
      name: "OKTV",
      status: "OPEN",
      entryCount: 4,
    });
    expect(text).toContain("4 nevezés");
    expect(text).toContain("Elmarad");
  });

  test("a piszkozatnál nem ajánl más állapotot", () => {
    expect(
      contestDeleteWarning({ name: "Vázlat", status: "DRAFT", entryCount: 0 }),
    ).toBe('Véglegesen törlöd: „Vázlat"?');
  });
});

describe("contestAttention", () => {
  const base = {
    startsAt: new Date(NOW.getTime() + 10 * DAY),
    endsAt: null,
    registrationDeadline: new Date(NOW.getTime() + 3 * DAY),
  };

  test("a határidő előtt nyitott verseny rendben van", () => {
    expect(contestAttention({ ...base, status: "OPEN" }, NOW)).toBeNull();
  });

  test("a lejárt határidejű, nyitott verseny lépésre vár", () => {
    expect(
      contestAttention(
        { ...base, status: "OPEN", registrationDeadline: ago(1) },
        NOW,
      ),
    ).toBe("deadline-passed");
  });

  test("határidő nélkül a kezdés a határidő", () => {
    expect(
      contestAttention(
        {
          ...base,
          status: "OPEN",
          registrationDeadline: null,
          startsAt: ago(0.5),
        },
        NOW,
      ),
    ).toBe("deadline-passed");
  });

  test("a lezajlott, de le nem zárt verseny eredményre vár", () => {
    expect(
      contestAttention(
        { ...base, status: "CLOSED", startsAt: ago(5), endsAt: ago(4) },
        NOW,
      ),
    ).toBe("results-missing");
  });

  //* A verseny napján még nem sürgetünk: az eredmény másnap is ráér.
  test("a verseny napján még nem jelez", () => {
    expect(
      contestAttention({ ...base, status: "CLOSED", startsAt: ago(0.5) }, NOW),
    ).toBeNull();
  });

  test("a piszkozat, a lezajlott és az elmaradt verseny nem jelez", () => {
    for (const status of ["DRAFT", "FINISHED", "CANCELLED"]) {
      expect(
        contestAttention({ ...base, status, startsAt: ago(30) }, NOW),
      ).toBeNull();
    }
  });
});
