import { describe, expect, test } from "bun:test";
import { lesson } from "@/test/fixtures";
import {
  budapestNow,
  changeFingerprint,
  changeText,
  diffWeeks,
  dueReminders,
  type Reminder,
  reminderStarts,
  reminderText,
  snapshotWeek,
} from "./push-plan";

const DAY = "2026-09-14";

describe("budapestNow", () => {
  test("budapesti nap és perc, nem UTC", () => {
    expect(budapestNow(new Date("2026-09-14T05:50:00Z"))).toEqual({
      dayKey: DAY,
      minutes: 470,
    });
    expect(budapestNow(new Date("2026-09-13T22:10:00Z"))).toEqual({
      dayKey: DAY,
      minutes: 10,
    });
    expect(budapestNow(new Date("2026-01-14T06:50:00Z"))).toEqual({
      dayKey: "2026-01-14",
      minutes: 470,
    });
  });
});

describe("reminderStarts", () => {
  const day = [
    lesson({ dateKey: DAY, startMin: 480, endMin: 525 }),
    lesson({ dateKey: DAY, startMin: 535, endMin: 580 }),
    lesson({ dateKey: DAY, startMin: 650, endMin: 695 }),
    lesson({ dateKey: DAY, startMin: 650, endMin: 695, groupColumn: 1 }),
    lesson({ dateKey: DAY, startMin: 760, endMin: 805, kind: "event" }),
    lesson({ dateKey: "2026-09-15", startMin: 480, endMin: 525 }),
  ];

  test("csak a blokkok eleje (a rövid szünet után nem)", () => {
    expect(reminderStarts(day, DAY, false)).toEqual([480, 650]);
  });

  test("minden óra kérésre, duplikátum nélkül", () => {
    expect(reminderStarts(day, DAY, true)).toEqual([480, 535, 650]);
  });

  test("üres nap", () => {
    expect(reminderStarts(day, "2026-09-16", true)).toEqual([]);
  });
});

describe("dueReminders", () => {
  const lessons = [
    lesson({
      dateKey: DAY,
      startMin: 480,
      endMin: 525,
      subject: "Matematika",
      subjectShort: "mat",
      room: "102",
    }),
    lesson({
      dateKey: DAY,
      startMin: 480,
      endMin: 525,
      subject: "Matematika",
      subjectShort: "mat",
      room: "103",
      groupColumn: 1,
    }),
  ];

  test("az ablakban (10 perccel előtte, 6 percig) esedékes", () => {
    for (const minutes of [470, 475]) {
      expect(
        dueReminders({
          lessons,
          now: { dayKey: DAY, minutes },
          everyLesson: false,
        }),
      ).toEqual([
        {
          dayKey: DAY,
          startMin: 480,
          subjects: ["Matematika"],
          subjectsShort: ["mat"],
          rooms: ["102", "103"],
          classes: [],
        },
      ]);
    }
  });

  test("az ablakon kívül nem", () => {
    for (const minutes of [469, 476, 480]) {
      expect(
        dueReminders({
          lessons,
          now: { dayKey: DAY, minutes },
          everyLesson: false,
        }),
      ).toEqual([]);
    }
  });
});

describe("reminderText", () => {
  const base: Reminder = {
    dayKey: DAY,
    startMin: 480,
    subjects: ["Matematika"],
    subjectsShort: ["mat"],
    rooms: ["102"],
    classes: [],
  };

  test("osztálynak", () => {
    expect(reminderText(base, "class", "12A")).toEqual({
      title: "Matematika 10 perc múlva",
      body: "12A · 08:00 — 102",
    });
  });

  test("túl hosszú tárgylista: rövid nevek a címben, teljes a törzsben", () => {
    const long = {
      ...base,
      subjects: ["Informatikai rendszerüzemeltetés", "Hálózati ismeretek"],
      subjectsShort: ["irü", "háló"],
      rooms: [],
    };
    expect(reminderText(long, "class", "13C")).toEqual({
      title: "irü / háló 10 perc múlva",
      body: "Informatikai rendszerüzemeltetés / Hálózati ismeretek\n13C · 08:00",
    });
  });

  test("tárgy nélkül: „Óra”", () => {
    expect(
      reminderText({ ...base, subjects: [], subjectsShort: [] }, "class", "12A")
        .title,
    ).toBe("Óra 10 perc múlva");
  });

  test("tanárnak az osztály a cím", () => {
    expect(
      reminderText({ ...base, classes: ["12A", "12B"] }, "teacher", "LM"),
    ).toEqual({
      title: "12A / 12B 10 perc múlva",
      body: "Matematika · 08:00 — 102",
    });
    expect(
      reminderText({ ...base, subjects: [], rooms: [] }, "teacher", "LM"),
    ).toEqual({
      title: "Óra 10 perc múlva",
      body: "08:00",
    });
  });
});

describe("snapshotWeek / diffWeeks", () => {
  const mat = lesson({ dateKey: DAY, startMin: 480, endMin: 525 });
  const before = snapshotWeek([
    mat,
    lesson({
      dateKey: DAY,
      startMin: 535,
      endMin: 580,
      subjectShort: "fiz",
      teacherShort: "XY",
      room: "201",
    }),
    lesson({
      dateKey: DAY,
      startMin: 650,
      endMin: 695,
      subjectShort: "tör",
      teacherShort: "KB",
    }),
    lesson({ dateKey: DAY, startMin: 760, endMin: 805, kind: "event" }),
    lesson({
      dateKey: "2026-09-10",
      startMin: 480,
      endMin: 525,
      subjectShort: "régi",
    }),
  ]);

  test("a lenyomat csak az órákat tartja", () => {
    expect(Object.keys(before)).toHaveLength(4);
    expect(before[`${DAY}|480|0`]).toBe("mat|LM|102|525||");
  });

  test("nincs változás: üres", () => {
    expect(diffWeeks({ before, after: before, fromDayKey: DAY })).toEqual([]);
  });

  test("terem-, tanár-, tárgy- és időváltozás, elmaradás, új óra, áthelyezés", () => {
    const after = snapshotWeek([
      { ...mat, room: "303" },
      lesson({
        dateKey: DAY,
        startMin: 535,
        endMin: 580,
        subjectShort: "kém",
        teacherShort: "XY",
        room: "201",
      }),
      //* A tör 650-ről 705-re költözött.
      lesson({
        dateKey: DAY,
        startMin: 705,
        endMin: 750,
        subjectShort: "tör",
        teacherShort: "KB",
      }),
      lesson({
        dateKey: "2026-09-15",
        startMin: 480,
        endMin: 525,
        subjectShort: "ang",
      }),
    ]);
    const changes = diffWeeks({ before, after, fromDayKey: DAY });
    expect(changes.map((c) => [c.kind, c.startMin])).toEqual([
      ["changed", 480],
      ["changed", 535],
      ["moved", 705],
      ["added", 480],
    ]);
    const texts = changes.map((c) => c.text);
    expect(texts[0]).toBe("hétfő 08:00 — mat terem: 102 → 303");
    expect(texts[1]).toBe("hétfő 08:55 — fiz helyett kém");
    expect(texts[2]).toBe("hétfő — tör 10:50 → 11:45");
    expect(texts[3]).toBe("kedd 08:00 — ang (új óra)");
  });

  test("a múltbeli napok változása nem számít", () => {
    const after = { ...before };
    delete after["2026-09-10|480|0"];
    expect(diffWeeks({ before, after, fromDayKey: DAY })).toEqual([]);
  });

  test("elmaradás, tanár- és végváltozás, áthelyezés-jelölés", () => {
    const after = snapshotWeek([
      { ...mat, teacherShort: "" },
      lesson({
        dateKey: DAY,
        startMin: 535,
        endMin: 590,
        subjectShort: "fiz",
        teacherShort: "XY",
        room: "201",
      }),
    ]);
    const changes = diffWeeks({ before, after, fromDayKey: DAY });
    expect(changes.map((c) => c.text)).toEqual([
      "hétfő 08:00 — mat tanár: LM → Lipták Mária",
      "hétfő 08:55 — fiz vége: 09:40 → 09:50",
      "hétfő 10:50 — tör elmarad",
    ]);
    const moved = snapshotWeek([{ ...mat, moved: true }]);
    expect(
      diffWeeks({
        before: snapshotWeek([mat]),
        after: moved,
        fromDayKey: DAY,
      }).map((c) => c.text),
    ).toEqual(["hétfő 08:00 — mat áthelyezve"]);
  });

  test("tanár-nézetben az osztály is a címke része", () => {
    const b = snapshotWeek([lesson({ dateKey: DAY, classShort: "12A" })]);
    const a = snapshotWeek([lesson({ dateKey: DAY, classShort: "13C" })]);
    expect(diffWeeks({ before: b, after: a, fromDayKey: DAY })[0].text).toBe(
      "hétfő 08:00 — 12A mat helyett 13C mat",
    );
  });
});

describe("changeText", () => {
  const change = (i: number) => ({
    kind: "added" as const,
    dayKey: DAY,
    startMin: i,
    text: `sor ${i}`,
  });

  test("egy változás", () => {
    expect(changeText([change(1)], "class", "12A")).toEqual({
      title: "Változott a 12A órarendje",
      body: "sor 1",
    });
  });

  test("legfeljebb három sor, a többi összesítve; tanárnál névelő nélkül", () => {
    expect(changeText([1, 2, 3, 4, 5].map(change), "teacher", "LM")).toEqual({
      title: "5 változás LM órarendjében",
      body: "sor 1\nsor 2\nsor 3\n+2 további változás",
    });
  });
});

describe("changeFingerprint", () => {
  test("determinisztikus, a szövegtől független, a tartalomra érzékeny", () => {
    const a = [
      { kind: "added" as const, dayKey: DAY, startMin: 480, text: "x" },
    ];
    const b = [
      { kind: "added" as const, dayKey: DAY, startMin: 480, text: "y" },
    ];
    const c = [
      { kind: "removed" as const, dayKey: DAY, startMin: 480, text: "x" },
    ];
    expect(changeFingerprint(a)).toBe(changeFingerprint(b));
    expect(changeFingerprint(a)).not.toBe(changeFingerprint(c));
    expect(changeFingerprint([])).toMatch(/^[0-9a-z]+$/);
  });
});
