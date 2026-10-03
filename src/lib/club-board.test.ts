import { describe, expect, test } from "bun:test";
import type { Actor } from "./club-access";
import { canDeleteBoardItem, canReadBoard, canWriteBoard } from "./club-access";
import {
  boardSegments,
  COMMENT_MAX,
  commentBodySchema,
  formatBoardTime,
  initials,
  POST_MAX,
  postBodySchema,
  postPushPayload,
} from "./club-board";

const student: Actor = {
  userId: "u1",
  isAdmin: false,
  isTeacher: false,
  teacher: null,
  className: "13C",
};
const other: Actor = { ...student, userId: "u2" };
const leader: Actor = {
  userId: "t1",
  isAdmin: false,
  isTeacher: true,
  teacher: "BNM",
  className: null,
};
const otherTeacher: Actor = { ...leader, userId: "t2", teacher: "XYZ" };
const admin: Actor = { ...student, userId: "a1", isAdmin: true };

const club = {
  status: "ACTIVE" as const,
  organizers: ["BNM"],
  proposedById: null,
};

describe("canReadBoard", () => {
  test("csak belépve", () => {
    expect(canReadBoard(null, club)).toBe(false);
    expect(canReadBoard(student, club)).toBe(true);
  });
  test("a javaslatnak nincs hírfolyama", () => {
    expect(canReadBoard(admin, { ...club, status: "PROPOSED" })).toBe(false);
  });
  test("a megszűnt szakkör olvasható marad", () => {
    expect(canReadBoard(student, { ...club, status: "ARCHIVED" })).toBe(true);
  });
});

describe("canWriteBoard", () => {
  test("tag, vezető és admin ír", () => {
    expect(canWriteBoard(student, club, true)).toBe(true);
    expect(canWriteBoard(leader, club, false)).toBe(true);
    expect(canWriteBoard(admin, club, false)).toBe(true);
  });
  test("nem tag diák és idegen tanár nem ír", () => {
    expect(canWriteBoard(student, club, false)).toBe(false);
    expect(canWriteBoard(otherTeacher, club, false)).toBe(false);
    expect(canWriteBoard(null, club, true)).toBe(false);
  });
  test("a megszűnt szakkör lezárul", () => {
    expect(canWriteBoard(leader, { ...club, status: "ARCHIVED" }, true)).toBe(
      false,
    );
  });
});

describe("canDeleteBoardItem", () => {
  test("a szerző, a vezető és az admin töröl", () => {
    expect(canDeleteBoardItem(student, club, "u1")).toBe(true);
    expect(canDeleteBoardItem(leader, club, "u1")).toBe(true);
    expect(canDeleteBoardItem(admin, club, "u1")).toBe(true);
  });
  test("más diák és idegen tanár nem", () => {
    expect(canDeleteBoardItem(other, club, "u1")).toBe(false);
    expect(canDeleteBoardItem(otherTeacher, club, "u1")).toBe(false);
    expect(canDeleteBoardItem(null, club, "u1")).toBe(false);
  });
});

describe("a bemenet", () => {
  test("levágja a szélét és egységesíti a sortörést", () => {
    expect(postBodySchema.parse("  szia\r\nmindenki  ")).toBe("szia\nmindenki");
  });
  test("üreset és túl hosszút nem enged", () => {
    expect(postBodySchema.safeParse("   \n ").success).toBe(false);
    expect(postBodySchema.safeParse("a".repeat(POST_MAX)).success).toBe(true);
    expect(postBodySchema.safeParse("a".repeat(POST_MAX + 1)).success).toBe(
      false,
    );
    expect(
      commentBodySchema.safeParse("a".repeat(COMMENT_MAX + 1)).success,
    ).toBe(false);
  });
});

describe("boardSegments", () => {
  test("sima szöveg egy darab", () => {
    expect(boardSegments("holnap 15:00")).toEqual([
      { kind: "text", text: "holnap 15:00" },
    ]);
  });
  test("a mondatvégi írásjel nem a link része", () => {
    expect(boardSegments("Itt: https://jedlik.eu/szakkor. Gyertek!")).toEqual([
      { kind: "text", text: "Itt: " },
      {
        kind: "link",
        text: "https://jedlik.eu/szakkor",
        href: "https://jedlik.eu/szakkor",
      },
      { kind: "text", text: ". Gyertek!" },
    ]);
  });
  test("a címen belül nyílt zárójel megmarad", () => {
    const [, link] = boardSegments(
      "(lásd https://hu.wikipedia.org/wiki/Drón_(repülő))",
    );
    expect(link).toEqual({
      kind: "link",
      text: "https://hu.wikipedia.org/wiki/Drón_(repülő)",
      href: "https://hu.wikipedia.org/wiki/Drón_(repülő)",
    });
  });
  test("javascript: és más séma nem link", () => {
    expect(boardSegments("javascript:alert(1)")).toEqual([
      { kind: "text", text: "javascript:alert(1)" },
    ]);
  });
});

describe("initials", () => {
  test("első és utolsó szó", () => {
    expect(initials("Szalai Bence")).toBe("SB");
    expect(initials("Bánáné Nagy Mónika")).toBe("BM");
    expect(initials("ádám")).toBe("Á");
    expect(initials("  ")).toBe("?");
  });
});

describe("formatBoardTime", () => {
  //* 2026-10-03 14:00 Budapesten (CEST, UTC+2).
  const now = new Date("2026-10-03T12:00:00Z");
  test("percek", () => {
    expect(formatBoardTime(new Date("2026-10-03T11:59:40Z"), now)).toBe(
      "épp most",
    );
    expect(formatBoardTime(new Date("2026-10-03T11:35:00Z"), now)).toBe(
      "25 perce",
    );
  });
  test("ma és tegnap budapesti napban", () => {
    expect(formatBoardTime(new Date("2026-10-03T06:05:00Z"), now)).toBe(
      "ma 8:05",
    );
    //* UTC-ben még október 2., Budapesten már 3. hajnal.
    expect(formatBoardTime(new Date("2026-10-02T22:30:00Z"), now)).toBe(
      "ma 0:30",
    );
    expect(formatBoardTime(new Date("2026-10-02T15:00:00Z"), now)).toBe(
      "tegnap 17:00",
    );
  });
  test("régebbi: dátum, más évben évszámmal", () => {
    expect(formatBoardTime(new Date("2026-09-14T10:00:00Z"), now)).toBe(
      "szept. 14.",
    );
    expect(formatBoardTime(new Date("2025-12-01T10:00:00Z"), now)).toBe(
      "2025. dec. 1.",
    );
  });
});

describe("postPushPayload", () => {
  test("se szöveg, se szerző — csak hogy van új", () => {
    const payload = postPushPayload(
      { slug: "lego", name: "Lego szakkör" },
      true,
      "p1",
    );
    expect(payload).toEqual({
      kind: "post",
      title: "Lego szakkör",
      body: "A vezető tanár új bejegyzést írt a hírfolyamra.",
      url: "/szakkorok/lego#post-p1",
      tag: "club-post:p1",
    });
  });
});
