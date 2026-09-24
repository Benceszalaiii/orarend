import { describe, expect, test } from "bun:test";
import {
  type ClubInput,
  clubInputSchema,
  clubSlotInputSchema,
  clubSlug,
  formatSlot,
  gradeOfClass,
  isOpenToAll,
  targetsClass,
} from "./clubs";

describe("clubSlug", () => {
  test.each([
    ["Drón szakkör", "dron-szakkor"],
    ["09. évf. fizika korrepetálás", "09-evf-fizika-korrepetalas"],
    ["Tehetséggondozó szakkör (DÖK)", "tehetseggondozo-szakkor-dok"],
    [
      "CAD rajzolás és 3D nyomtatás szakkör",
      "cad-rajzolas-es-3d-nyomtatas-szakkor",
    ],
    ["  Űrhajózás — ŐSZ!  ", "urhajozas-osz"],
  ])("%s → %s", (name, slug) => {
    expect(clubSlug(name)).toBe(slug);
  });

  test("a vágás után nem marad kötőjel a végén", () => {
    const slug = clubSlug(`${"a".repeat(79)} b`);
    expect(slug.length).toBeLessThanOrEqual(80);
    expect(slug.endsWith("-")).toBe(false);
  });
});

describe("gradeOfClass", () => {
  test.each([
    ["09A", 9],
    ["13D", 13],
    ["09KNY", 9],
    ["08A", null],
    ["14A", null],
    ["Nagyinet", null],
  ])("%s → %p", (className, grade) => {
    expect(gradeOfClass(className)).toBe(grade);
  });
});

describe("targetsClass", () => {
  test("osztályra szóló szakkör", () => {
    const audience = { grades: [], classes: ["09A"] };
    expect(targetsClass(audience, "09A")).toBe(true);
    expect(targetsClass(audience, "09B")).toBe(false);
  });

  test("évfolyamra szóló szakkör az évfolyam minden osztályának", () => {
    const audience = { grades: [10], classes: [] };
    expect(targetsClass(audience, "10A")).toBe(true);
    expect(targetsClass(audience, "10E")).toBe(true);
    expect(targetsClass(audience, "11A")).toBe(false);
  });

  //! A mindenkinek nyitott szakkör NEM kerül fel magától a rácsra.
  test("a mindenkinek szóló szakkör egyik osztályt sem célozza", () => {
    const audience = { grades: [], classes: [] };
    expect(isOpenToAll(audience)).toBe(true);
    expect(targetsClass(audience, "09A")).toBe(false);
  });
});

test("formatSlot", () => {
  expect(formatSlot({ weekday: 4, startMinute: 430, endMinute: 475 })).toBe(
    "Csütörtök 7:10–7:55",
  );
});

describe("clubSlotInputSchema", () => {
  const slot = {
    weekday: 1,
    startMinute: 870,
    endMinute: 955,
    room: "203",
    teachers: ["LM"],
    source: "TIMETABLE" as const,
  };

  test("érvényes időpont", () => {
    expect(clubSlotInputSchema.safeParse(slot).success).toBe(true);
  });

  test.each([
    ["hétvége", { weekday: 6 }],
    ["fordított idő", { endMinute: 800 }],
    ["tanárjel helyett név", { teachers: ["Lipták Mária"] }],
    ["terem nélkül a Jedlikinfóból", { room: null }],
  ])("%s → hiba", (_, patch) => {
    expect(clubSlotInputSchema.safeParse({ ...slot, ...patch }).success).toBe(
      false,
    );
  });

  test("terem nélkül a tanár szerint rendben", () => {
    expect(
      clubSlotInputSchema.safeParse({
        ...slot,
        room: null,
        source: "ORGANIZER",
      }).success,
    ).toBe(true);
  });
});

describe("clubInputSchema", () => {
  const club: ClubInput = {
    name: "Lego szakkör",
    description: null,
    kind: "CLUB",
    grades: [],
    classes: [],
    audienceNote: null,
    organizers: ["BP", "SBA"],
    slots: [
      {
        weekday: 1,
        startMinute: 870,
        endMinute: 955,
        room: "402",
        teachers: ["BP"],
        source: "TIMETABLE",
      },
    ],
  };

  test("érvényes szakkör", () => {
    expect(clubInputSchema.safeParse(club).success).toBe(true);
  });

  test("vezető nélkül nem megy", () => {
    expect(clubInputSchema.safeParse({ ...club, organizers: [] }).success).toBe(
      false,
    );
  });

  test("kétszer ugyanaz a vezető", () => {
    expect(
      clubInputSchema.safeParse({ ...club, organizers: ["BP", "BP"] }).success,
    ).toBe(false);
  });

  //! Egy idegen tanár kártyája nem igazolhatja a szakkör időpontját.
  test("az időpont tanára nem vezető", () => {
    const slots = [{ ...club.slots[0], teachers: ["VA"] }];
    expect(clubInputSchema.safeParse({ ...club, slots }).success).toBe(false);
  });

  test("évfolyam a technikumon kívül", () => {
    expect(clubInputSchema.safeParse({ ...club, grades: [8] }).success).toBe(
      false,
    );
  });
});
