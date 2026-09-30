import { describe, expect, test } from "bun:test";
import {
  budapestDayValue,
  RIVER_MAX_WEEKS,
  riverAxis,
  riverLanes,
  riverPosition,
} from "./contest-river";

//* 2026-09-27 vasárnap, délután négy Budapesten (nyári idő: UTC+2).
const NOW = new Date("2026-09-27T14:00:00Z");

function contest(
  slug: string,
  patch: Partial<{
    status: "OPEN" | "CLOSED" | "FINISHED" | "CANCELLED" | "DRAFT";
    startsAt: string;
    registrationDeadline: string | null;
  }> = {},
) {
  return {
    slug,
    status: patch.status ?? "OPEN",
    startsAt: new Date(patch.startsAt ?? "2026-11-10T08:00:00Z"),
    registrationDeadline:
      patch.registrationDeadline === undefined
        ? new Date("2026-10-20T18:00:00Z")
        : patch.registrationDeadline === null
          ? null
          : new Date(patch.registrationDeadline),
  };
}

describe("budapestDayValue", () => {
  test("budapesti időben számol: este 23:30 még aznap", () => {
    const late = budapestDayValue(new Date("2026-10-20T21:30:00Z"));
    const noon = budapestDayValue(new Date("2026-10-20T10:00:00Z"));
    expect(Math.floor(late)).toBe(Math.floor(noon));
    expect(late - Math.floor(late)).toBeCloseTo(23.5 / 24, 5);
  });
});

describe("riverAxis", () => {
  test("a folyó hét hétfőjén indul, akkor is, ha vasárnap nézed", () => {
    const axis = riverAxis(NOW, []);
    //* 2026-09-21 hétfő.
    expect(axis.from).toBe(Date.UTC(2026, 8, 21) / 86_400_000);
    expect(axis.weeks[0].label).toBe("21");
  });

  test("legalább négy hét, és a hónap neve csak a hónap első hetén", () => {
    const axis = riverAxis(NOW, []);
    expect(axis.weeks).toHaveLength(4);
    expect(axis.weeks.map((w) => w.month)).toEqual([
      "szept.",
      null,
      "okt.",
      null,
    ]);
  });

  test("a legkésőbbi dátumig ér, de legfeljebb tíz hétig", () => {
    const soon = riverAxis(NOW, [new Date("2026-11-10T08:00:00Z")]);
    expect(soon.to).toBeGreaterThan(
      Math.floor(budapestDayValue(new Date("2026-11-10T08:00:00Z"))),
    );
    const far = riverAxis(NOW, [new Date("2027-06-01T08:00:00Z")]);
    expect(far.weeks).toHaveLength(RIVER_MAX_WEEKS);
  });

  test("a hely tört: 0 a tengely eleje, 1 a vége", () => {
    const axis = riverAxis(NOW, []);
    expect(riverPosition(axis, axis.from)).toBe(0);
    expect(riverPosition(axis, axis.to)).toBe(1);
  });
});

describe("riverLanes", () => {
  test("előbb a nyitottak a legsürgősebbel, utánuk a lezártak a verseny napja szerint", () => {
    const lanes = riverLanes(
      [
        contest("kesobbi"),
        contest("surgos", { registrationDeadline: "2026-09-29T18:00:00Z" }),
        contest("lezart", {
          status: "CLOSED",
          startsAt: "2026-10-05T08:00:00Z",
        }),
      ],
      NOW,
    );
    expect(lanes.map((l) => [l.contest.slug, l.open, l.soon])).toEqual([
      ["surgos", true, true],
      ["kesobbi", true, false],
      ["lezart", false, false],
    ]);
  });

  test("a lejárt határidejű nyitott verseny már nem nevezhető, de a folyamban marad", () => {
    const [lane] = riverLanes(
      [contest("lejart", { registrationDeadline: "2026-09-26T18:00:00Z" })],
      NOW,
    );
    expect(lane.open).toBe(false);
  });

  test("határidő nélkül a kezdés a határidő", () => {
    const [lane] = riverLanes(
      [contest("nincs", { registrationDeadline: null })],
      NOW,
    );
    expect(lane.deadline).toBe(lane.event);
  });

  test("a lezajlott, az elmaradó, a piszkozat és a már elkezdett nem kerül a folyamba", () => {
    expect(
      riverLanes(
        [
          contest("vege", { status: "FINISHED" }),
          contest("elmarad", { status: "CANCELLED" }),
          contest("piszkozat", { status: "DRAFT" }),
          contest("mar", {
            status: "CLOSED",
            startsAt: "2026-09-20T08:00:00Z",
          }),
        ],
        NOW,
      ),
    ).toEqual([]);
  });
});
