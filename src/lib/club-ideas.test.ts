import { describe, expect, test } from "bun:test";
import type { Actor } from "./club-access";
import {
  canAdoptIdea,
  canHideIdea,
  canVoteIdea,
  canWithdrawIdea,
  ideaInputSchema,
  ideaKey,
  sortIdeas,
} from "./club-ideas";

const student: Actor = {
  userId: "s1",
  isAdmin: false,
  isTeacher: false,
  teacher: null,
  className: "10A",
};
const teacher: Actor = {
  userId: "t1",
  isAdmin: false,
  isTeacher: true,
  teacher: "BNM",
  className: null,
};

const open = { authorId: "s1", clubId: null, hidden: false, voteCount: 1 };

describe("ideaKey", () => {
  test("ékezet, kis-nagybetű, írásjel és „szakkör” nélkül", () => {
    expect(ideaKey("Drón szakkör")).toBe("dron");
    expect(ideaKey("DRÓN!")).toBe("dron");
    expect(ideaKey("drón-szakkör")).toBe("dron");
  });

  test("a szórend nem számít", () => {
    expect(ideaKey("Python haladó")).toBe(ideaKey("haladó Python"));
  });

  test("csak töltelékszó: üres kulcs", () => {
    expect(ideaKey("szakkör")).toBe("");
  });
});

describe("ideaInputSchema", () => {
  test("levágja a szóközt, az üres megjegyzés null", () => {
    expect(
      ideaInputSchema.parse({ title: "  Drónépítés ", note: "  " }),
    ).toEqual({ title: "Drónépítés", note: null });
  });

  test("a csak töltelékből álló cím nem téma", () => {
    expect(
      ideaInputSchema.safeParse({ title: "szakkör", note: null }).success,
    ).toBe(false);
  });

  test("túl hosszú cím", () => {
    expect(
      ideaInputSchema.safeParse({ title: "x".repeat(61), note: null }).success,
    ).toBe(false);
  });
});

describe("jogok", () => {
  test("belépés nélkül nem szavaz", () => {
    expect(canVoteIdea(null, open)).toBe(false);
    expect(canVoteIdea(student, open)).toBe(true);
  });

  test("elrejtettre és megvalósultra nem szavaz", () => {
    expect(canVoteIdea(student, { ...open, hidden: true })).toBe(false);
    expect(canVoteIdea(student, { ...open, clubId: "c1" })).toBe(false);
  });

  test("a szerző csak addig vonja vissza, amíg más nem jelezte", () => {
    expect(canWithdrawIdea(student, open)).toBe(true);
    expect(canWithdrawIdea(student, { ...open, voteCount: 2 })).toBe(false);
    expect(canWithdrawIdea(teacher, open)).toBe(false);
  });

  test("elrejteni és elindítani tanár tud, diák nem", () => {
    expect(canHideIdea(teacher)).toBe(true);
    expect(canHideIdea(student)).toBe(false);
    expect(canAdoptIdea(teacher, open)).toBe(true);
    expect(canAdoptIdea(student, open)).toBe(false);
    expect(canAdoptIdea(teacher, { ...open, clubId: "c1" })).toBe(false);
  });
});

describe("sortIdeas", () => {
  test("elöl a legkeresettebb, egyenlőségnél az újabb, a végén a megvalósult", () => {
    const at = (d: number) => new Date(2026, 8, d);
    const ideas = [
      { id: "old2", voteCount: 2, createdAt: at(1), clubId: null },
      { id: "done", voteCount: 9, createdAt: at(5), clubId: "c1" },
      { id: "new2", voteCount: 2, createdAt: at(3), clubId: null },
      { id: "top", voteCount: 5, createdAt: at(2), clubId: null },
    ];
    expect(sortIdeas(ideas).map((i) => i.id)).toEqual([
      "top",
      "new2",
      "old2",
      "done",
    ]);
  });
});
