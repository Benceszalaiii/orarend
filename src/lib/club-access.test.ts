import { describe, expect, test } from "bun:test";
import {
  type Actor,
  canApproveClub,
  canCreateClub,
  canEditClub,
  canJoinClub,
  canManageCompetition,
  canProposeClub,
  canSeeClub,
  entryVerdict,
} from "./club-access";

const student: Actor = {
  userId: "diak",
  isAdmin: false,
  isTeacher: false,
  teacher: null,
  className: "10A",
};
const teacher: Actor = {
  userId: "tanar",
  isAdmin: false,
  isTeacher: true,
  teacher: "BNM",
  className: null,
};
const otherTeacher: Actor = { ...teacher, userId: "masik", teacher: "VA" };
const admin: Actor = { ...student, userId: "admin", isAdmin: true };
//* Tanárként igazolt, de a jelét még nem oldottuk fel.
const unresolvedTeacher: Actor = { ...teacher, teacher: null };

const proposed = {
  status: "PROPOSED" as const,
  organizers: ["BNM"],
  proposedById: "diak",
};
const active = { ...proposed, status: "ACTIVE" as const, proposedById: null };

describe("szakkör létrehozása", () => {
  test("tanár és admin hozhat létre, diák nem", () => {
    expect(canCreateClub(teacher)).toBe(true);
    expect(canCreateClub(admin)).toBe(true);
    expect(canCreateClub(student)).toBe(false);
    expect(canCreateClub(null)).toBe(false);
  });

  test("feloldott jel nélkül a tanár sem", () => {
    expect(canCreateClub(unresolvedTeacher)).toBe(false);
  });

  test("javasolni bármelyik belépett felhasználó tud", () => {
    expect(canProposeClub(student)).toBe(true);
    expect(canProposeClub(null)).toBe(false);
  });
});

describe("a javaslat", () => {
  test("csak a javasló, a felkért tanár és az admin látja", () => {
    expect(canSeeClub(student, proposed)).toBe(true);
    expect(canSeeClub(teacher, proposed)).toBe(true);
    expect(canSeeClub(admin, proposed)).toBe(true);
    expect(canSeeClub(otherTeacher, proposed)).toBe(false);
    expect(canSeeClub({ ...student, userId: "masik-diak" }, proposed)).toBe(
      false,
    );
    expect(canSeeClub(null, proposed)).toBe(false);
  });

  test("csak a felkért tanár hagyhatja jóvá (és az admin)", () => {
    expect(canApproveClub(teacher, proposed)).toBe(true);
    expect(canApproveClub(admin, proposed)).toBe(true);
    expect(canApproveClub(otherTeacher, proposed)).toBe(false);
    expect(canApproveClub(student, proposed)).toBe(false);
  });

  test("a már élő szakkört nincs mit jóváhagyni", () => {
    expect(canApproveClub(teacher, active)).toBe(false);
  });

  test("a javasló a jóváhagyásig szerkeszthet, utána nem", () => {
    expect(canEditClub(student, proposed)).toBe(true);
    expect(canEditClub(student, { ...active, proposedById: "diak" })).toBe(
      false,
    );
  });

  test("javaslathoz nem lehet csatlakozni", () => {
    expect(canJoinClub(student, proposed)).toBe(false);
  });
});

describe("az élő szakkör", () => {
  test("mindenki látja, belépés nélkül is", () => {
    expect(canSeeClub(null, active)).toBe(true);
  });

  test("a vezető és az admin szerkeszti", () => {
    expect(canEditClub(teacher, active)).toBe(true);
    expect(canEditClub(admin, active)).toBe(true);
    expect(canEditClub(otherTeacher, active)).toBe(false);
  });

  test("csatlakozni belépve lehet", () => {
    expect(canJoinClub(student, active)).toBe(true);
    expect(canJoinClub(null, active)).toBe(false);
    expect(canJoinClub(student, { ...active, status: "ARCHIVED" })).toBe(false);
  });
});

describe("verseny", () => {
  const now = new Date("2026-10-01T10:00:00Z");
  const competition = {
    status: "OPEN" as const,
    teachers: ["BNM"],
    createdById: "tanar",
    startsAt: new Date("2026-11-01T08:00:00Z"),
    registrationDeadline: new Date("2026-10-15T22:00:00Z"),
    capacity: 2,
    grades: [10],
    classes: [],
  };

  test("a felelős tanár kezeli, más tanár nem", () => {
    expect(canManageCompetition(teacher, competition)).toBe(true);
    expect(canManageCompetition(otherTeacher, competition)).toBe(false);
    expect(canManageCompetition(admin, competition)).toBe(true);
  });

  test("jogosult diák nevezhet", () => {
    expect(entryVerdict(student, competition, 0, now)).toEqual({ ok: true });
  });

  test.each([
    ["login", null, competition, 0, now],
    ["not-open", student, { ...competition, status: "DRAFT" as const }, 0, now],
    ["deadline", student, competition, 0, new Date("2026-10-16T00:00:00Z")],
    ["audience", { ...student, className: "11A" }, competition, 0, now],
    ["audience", teacher, competition, 0, now],
    ["full", student, competition, 2, now],
  ] as const)("%s", (reason, actor, comp, count, at) => {
    expect(entryVerdict(actor, comp, count, at)).toEqual({ ok: false, reason });
  });

  test("határidő nélkül a kezdésig lehet nevezni", () => {
    const noDeadline = { ...competition, registrationDeadline: null };
    expect(
      entryVerdict(student, noDeadline, 0, new Date("2026-10-20T00:00:00Z")),
    ).toEqual({ ok: true });
    expect(
      entryVerdict(student, noDeadline, 0, new Date("2026-11-01T08:00:00Z")),
    ).toEqual({ ok: false, reason: "deadline" });
  });

  test("nyitott versenyre bármelyik osztály nevezhet", () => {
    const open = { ...competition, grades: [], capacity: null };
    expect(
      entryVerdict({ ...student, className: "13E" }, open, 99, now),
    ).toEqual({ ok: true });
  });
});
