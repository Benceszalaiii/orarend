import { describe, expect, test } from "bun:test";
import type { ClubSession } from "./club-schedule";
import {
  boardSessions,
  dayLabel,
  isoWeekday,
  nextWeekday,
  pickBoardDay,
} from "./hallway-board";

function session(patch: Partial<ClubSession>): ClubSession {
  return {
    id: "s",
    slotId: "slot",
    clubSlug: "robotika",
    clubName: "Robotika",
    dateKey: "2026-09-24",
    dayOfWeek: 4,
    startMin: 870,
    endMin: 960,
    room: "202",
    status: "confirmed",
    ...patch,
  };
}

describe("napok", () => {
  test("2026-09-24 csütörtök, 09-27 vasárnap", () => {
    expect(isoWeekday("2026-09-24")).toBe(4);
    expect(isoWeekday("2026-09-27")).toBe(7);
  });

  test("péntek után hétfő jön", () => {
    expect(nextWeekday("2026-09-25")).toBe("2026-09-28");
    expect(nextWeekday("2026-09-24")).toBe("2026-09-25");
  });

  test("felirat: ma, holnap, a hét napja", () => {
    expect(dayLabel("2026-09-24", "2026-09-24")).toBe("Ma");
    expect(dayLabel("2026-09-25", "2026-09-24")).toBe("Holnap");
    expect(dayLabel("2026-09-28", "2026-09-25")).toBe("Hétfőn");
  });
});

describe("pickBoardDay", () => {
  test("hétköznap, van még hátra: ma", () => {
    expect(pickBoardDay("2026-09-24", () => true)).toBe("2026-09-24");
  });

  test("mára nincs több: a következő hétköznap", () => {
    expect(pickBoardDay("2026-09-24", () => false)).toBe("2026-09-25");
  });

  test("hétvégén hétfő, akkor is, ha a „ma” kérdésre igen lenne a válasz", () => {
    expect(pickBoardDay("2026-09-26", () => true)).toBe("2026-09-28");
  });
});

describe("boardSessions", () => {
  const list = [
    session({ id: "past", startMin: 430, endMin: 475 }),
    session({ id: "running", startMin: 870, endMin: 960 }),
    session({ id: "next-a", startMin: 920, endMin: 1000, clubName: "Drón" }),
    session({ id: "next-b", startMin: 920, endMin: 1000, clubName: "Béka" }),
    session({ id: "later", startMin: 1000, endMin: 1060 }),
    session({ id: "other-day", dateKey: "2026-09-25", startMin: 900 }),
  ];

  test("a lezajlott kiesik, a futó „most”, a legközelebbi kezdés(ek) „következik”", () => {
    expect(
      boardSessions(list, "2026-09-24", 900).map((s) => [s.id, s.phase]),
    ).toEqual([
      ["running", "now"],
      ["next-b", "next"],
      ["next-a", "next"],
      ["later", "later"],
    ]);
  });

  test("nem a mai napon minden „later”, és semmi nem esik ki", () => {
    expect(boardSessions(list, "2026-09-24", null).map((s) => s.phase)).toEqual(
      ["later", "later", "later", "later", "later"],
    );
  });
});
