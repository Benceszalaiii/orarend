import { describe, expect, test } from "bun:test";
import {
  bookingsOfRoom,
  cardBelongsToWeek,
  cardToBooking,
  freeRoomsAt,
  type RawRoomCard,
  type WeekOccupancy,
} from "./free-rooms";

//! ═══════════════════════════════════════════════════════════════════════════
//! REGRESSZIÓS TESZT — MIÉRT ÉPP EZ
//! ═══════════════════════════════════════════════════════════════════════════
//! Ez a modul arra válaszol, hogy „bemehetek-e ebbe a terembe". A hibája nem
//! hibaüzenet, hanem egy diák, aki bekopog egy folyó órára — vagy egy üres
//! terem, amit nem ajánlottunk fel. Négy dolgot fog le:
//!
//!  • A KÁRTYA SARKAI. A terem nézetében a bal alsó a TANÁR, a jobb alsó az
//!    OSZTÁLY — fordítva, mint az osztály órarendjén. Ezt semmi nem
//!    kényszeríti ki, csak a forrás szokása; ha megfordul, némán rossz nevek
//!    kerülnek a válaszba.
//!  • AZ A/B HÉT. Egy B hetes óra az A héten nem foglalja a termet. Ha ez
//!    elcsúszik, a teremkereső minden második héten hazudik.
//!  • AZ ÓRAHATÁR. A 8:45-kor VÉGZŐDŐ óra 8:45-kor már nem foglal.
//!  • AZ ISMERETLEN TEREM. Amiről nem tudunk, az NEM szabad. Ez a modul
//!    legfontosabb ígérete.
//! ═══════════════════════════════════════════════════════════════════════════

//* Egy valódi kártya a `classroom: "102"` válaszából, változatlan mezőnevekkel.
const REAL_CARD: RawRoomCard = {
  date: "2026.09.11",
  text: "dig",
  textTitle: "Digitális kultúra",
  leftBottom: "LM",
  leftBottomTitle: "Mária Ivett Lipták",
  rightBottom: "10E",
  rightBottomTitle: "10E",
  week: "AB",
  dayOfWeek: 5,
  startMinuteFromMidnight: 590,
  endMinuteFromMidnight: 635,
  type: "classroom",
};

describe("cardToBooking", () => {
  test("a bal alsó sarok a TANÁR, a jobb alsó az OSZTÁLY", () => {
    const booking = cardToBooking(REAL_CARD);
    expect(booking).not.toBeNull();
    expect(booking?.teacher).toBe("Mária Ivett Lipták");
    expect(booking?.classShort).toBe("10E");
    expect(booking?.subject).toBe("Digitális kultúra");
    expect(booking?.dateKey).toBe("2026-09-11");
  });

  test("az osztály nélküli kártya (értekezlet) is foglalás", () => {
    const booking = cardToBooking({
      ...REAL_CARD,
      textTitle: "Szoftverfejlesztő mk. értekezlet",
      rightBottom: "",
      rightBottomTitle: "",
    });
    expect(booking?.classShort).toBe("");
    expect(booking?.subject).toBe("Szoftverfejlesztő mk. értekezlet");
  });

  test("idő nélküli kártya nem foglal le semmit", () => {
    expect(
      cardToBooking({ ...REAL_CARD, startMinuteFromMidnight: undefined }),
    ).toBeNull();
    //* Nulla hosszú sáv sem: abból csak hamis foglaltság lenne.
    expect(
      cardToBooking({ ...REAL_CARD, endMinuteFromMidnight: 590 }),
    ).toBeNull();
  });
});

describe("cardBelongsToWeek", () => {
  test("az azonos betűjelű hét számít", () => {
    expect(cardBelongsToWeek("A", "A")).toBe(true);
    expect(cardBelongsToWeek("B", "B")).toBe(true);
  });

  test("a másik hét kártyája nem foglalja a termet", () => {
    expect(cardBelongsToWeek("B", "A")).toBe(false);
    expect(cardBelongsToWeek("A", "B")).toBe(false);
  });

  test("az `AB` mindkét héten foglal", () => {
    expect(cardBelongsToWeek("AB", "A")).toBe(true);
    expect(cardBelongsToWeek("AB", "B")).toBe(true);
  });

  //! HÉT NÉLKÜL NEM ZÁRUNK KI. Ha a forrás nem mond hetet (se a napra, se a
  //! kártyára), a kártya BENT marad: egy elhallgatott óra foglalt termet
  //! mutatna szabadnak, a fölösleges óra viszont csak egy termet vesz ki a
  //! felkínáltak közül.
  test("hét nélkül a kártya bent marad", () => {
    expect(cardBelongsToWeek("", "A")).toBe(true);
    expect(cardBelongsToWeek("A", "")).toBe(true);
  });
});

describe("bookingsOfRoom", () => {
  const days = [
    {
      dateKey: "2026-09-07",
      name: "Hétfő",
      dayOfWeek: 1,
      week: "A",
      teaching: true,
    },
    {
      dateKey: "2026-09-11",
      name: "Péntek",
      dayOfWeek: 5,
      week: "A",
      teaching: true,
    },
  ];

  test("a másik hét kártyája kiesik, az `AB` marad", () => {
    const bookings = bookingsOfRoom(
      [
        REAL_CARD,
        { ...REAL_CARD, week: "B", text: "bhetes" },
        { ...REAL_CARD, week: "A", textTitle: "A hetes óra" },
      ],
      days,
    );
    expect(bookings.map((b) => b.subject)).toEqual([
      "Digitális kultúra",
      "A hetes óra",
    ]);
  });
});

//* ---------------------------------------------------------------------------

function occupancyOf(
  rooms: WeekOccupancy["rooms"],
  unknown: string[] = [],
): WeekOccupancy {
  return {
    weekStart: "2026-09-07",
    fetchedAt: 0,
    days: [
      {
        dateKey: "2026-09-07",
        name: "Hétfő",
        dayOfWeek: 1,
        week: "A",
        teaching: true,
      },
      {
        dateKey: "2026-09-08",
        name: "Kedd",
        dayOfWeek: 2,
        week: "A",
        teaching: true,
      },
    ],
    periods: [],
    rooms,
    unknown,
  };
}

const lesson = (startMin: number, endMin: number, dayOfWeek = 1) => ({
  dateKey: "2026-09-07",
  dayOfWeek,
  startMin,
  endMin,
  subject: "mat",
  classShort: "13C",
  teacher: "NL",
  week: "A",
});

describe("freeRoomsAt", () => {
  test("az óra alatt foglalt, az óra végén már szabad", () => {
    const week = occupancyOf([
      { short: "102", name: "102", bookings: [lesson(480, 525)] },
    ]);

    expect(
      freeRoomsAt(week, "2026-09-07", 500).busy.map((r) => r.short),
    ).toEqual(["102"]);
    //! FÉLIG NYITOTT SÁV: a kezdőperc még foglalt, a záróperc már nem.
    expect(freeRoomsAt(week, "2026-09-07", 480).busy).toHaveLength(1);
    expect(
      freeRoomsAt(week, "2026-09-07", 525).free.map((r) => r.short),
    ).toEqual(["102"]);
  });

  test("a másik nap órája nem foglalja el a mai percet", () => {
    const week = occupancyOf([
      { short: "102", name: "102", bookings: [lesson(480, 525, 2)] },
    ]);
    expect(
      freeRoomsAt(week, "2026-09-07", 500).free.map((r) => r.short),
    ).toEqual(["102"]);
  });

  test("a `freeUntil` a nap következő órájának kezdete", () => {
    const week = occupancyOf([
      {
        short: "102",
        name: "102",
        bookings: [lesson(480, 525), lesson(650, 695)],
      },
    ]);
    const answer = freeRoomsAt(week, "2026-09-07", 530);
    expect(answer.free[0].freeUntil).toBe(650);
  });

  test("aznap több óra nélkül a `freeUntil` nem korlátoz", () => {
    const week = occupancyOf([
      { short: "102", name: "102", bookings: [lesson(480, 525)] },
    ]);
    expect(freeRoomsAt(week, "2026-09-07", 530).free[0].freeUntil).toBeNull();
  });

  test("a hosszabb ideig szabad terem áll elöl", () => {
    const week = occupancyOf([
      { short: "A", name: "A", bookings: [lesson(540, 585)] },
      { short: "B", name: "B", bookings: [] },
      { short: "C", name: "C", bookings: [lesson(600, 645)] },
    ]);
    expect(
      freeRoomsAt(week, "2026-09-07", 500).free.map((r) => r.short),
    ).toEqual(["B", "C", "A"]);
  });

  //! EZ A MODUL LEGFONTOSABB ÍGÉRETE. Egy elbukott lekérésű terem NEM szabad —
  //! külön listán marad, és a hívó nem küldhet rá senkit.
  test("az ismeretlen terem sem a szabadok, sem a foglaltak közt nincs", () => {
    const week = occupancyOf(
      [{ short: "102", name: "102", bookings: [] }],
      ["B1", "T1"],
    );
    const answer = freeRoomsAt(week, "2026-09-07", 500);
    expect(answer.free.map((r) => r.short)).toEqual(["102"]);
    expect(answer.busy).toHaveLength(0);
    expect(answer.unknown).toEqual(["B1", "T1"]);
  });

  test("a héten kívüli napra nincs nap, és egy terem sem foglalt", () => {
    const week = occupancyOf([
      { short: "102", name: "102", bookings: [lesson(480, 525)] },
    ]);
    const answer = freeRoomsAt(week, "2026-09-20", 500);
    expect(answer.day).toBeNull();
    expect(answer.busy).toHaveLength(0);
  });
});
