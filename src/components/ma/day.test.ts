import { describe, expect, test } from "bun:test";
import type { TimetableView } from "@/lib/timetable";
import { lessonIdentity } from "@/lib/timetable-merge";
import { lesson, week } from "@/test/fixtures";
import {
  agendaItem,
  buildDayModel,
  daySummary,
  focusDayKey,
  GAP_MIN_MIN,
  laterItemsOf,
  weekLetterOf,
} from "./day";

function view(over: Partial<TimetableView> = {}): TimetableView {
  return { ...week(), events: [], prefs: [], persistence: "local", ...over };
}

const MON = "2026-09-14";

describe("buildDayModel", () => {
  test("ismeretlen nap: null", () => {
    expect(buildDayModel(view(), [], "2030-01-01", null)).toBeNull();
  });

  test("órák és lyukasóra időrendben", () => {
    const v = view({
      lessons: [
        lesson({ startMin: 480, endMin: 525, subjectShort: "mat" }),
        lesson({
          startMin: 650,
          endMin: 695,
          subjectShort: "tör",
          teacherShort: "KB",
          room: "",
        }),
        lesson({
          startMin: 535,
          endMin: 580,
          subjectShort: "fiz",
          teacherShort: "XY",
          moved: true,
        }),
        lesson({ dayOfWeek: 2, subjectShort: "ang" }),
      ],
    });
    const day = buildDayModel(v, [], MON, null);
    expect(day).not.toBeNull();
    if (!day) return;
    expect(day.segments.map((s) => s.kind)).toEqual([
      "lesson",
      "lesson",
      "gap",
      "lesson",
    ]);
    const gap = day.segments[2];
    expect([gap.startMin, gap.endMin]).toEqual([580, 650]);
    expect(650 - 580).toBeGreaterThanOrEqual(GAP_MIN_MIN);
    expect(day.lessonCount).toBe(3);
    expect(day.firstMin).toBe(480);
    expect(day.lastMin).toBe(695);
    expect(day.moved.map((r) => r.lesson.subjectShort)).toEqual(["fiz"]);
    expect(day.items.map((i) => i.title)).toEqual(["mat", "fiz", "tör"]);
    expect(day.dual).toBe("school");
    expect(day.conflicts).toBe(0);
  });

  test("a rövid szünet nem lyukasóra", () => {
    const v = view({
      lessons: [
        lesson({ startMin: 480, endMin: 525, subjectShort: "mat" }),
        lesson({
          startMin: 535,
          endMin: 580,
          subjectShort: "fiz",
          teacherShort: "XY",
        }),
      ],
    });
    const day = buildDayModel(v, [], MON, null);
    expect(day?.segments.every((s) => s.kind === "lesson")).toBe(true);
  });

  test("párhuzamos csoportórák külön sávban", () => {
    const v = view({
      lessons: [
        lesson({
          subjectShort: "ang",
          group: "1",
          groupColumn: 0,
          groupCount: 2,
          wholeClass: false,
          teacherShort: "AA",
        }),
        lesson({
          subjectShort: "ang",
          group: "2",
          groupColumn: 1,
          groupCount: 2,
          wholeClass: false,
          teacherShort: "BB",
        }),
      ],
    });
    const day = buildDayModel(v, [], MON, null);
    const lanes = day?.segments.map((s) =>
      s.kind === "lesson" ? [s.lane, s.lanes] : null,
    );
    expect(lanes).toEqual([
      [0, 2],
      [1, 2],
    ]);
    expect(day?.conflicts).toBe(1);
  });

  test("a mentett elrejtés kihagyja az órát", () => {
    const hidden = lesson({ subjectShort: "tesi" });
    const v = view({ lessons: [hidden] });
    const id = lessonIdentity(hidden);
    const day = buildDayModel(v, [{ clusterKey: id, chosen: "" }], MON, null);
    expect(day?.lessonCount).toBe(0);
    expect(day?.firstMin).toBe(0);
  });

  test("duális beosztás és a nap csengetése", () => {
    const v = view();
    v.days[0] = {
      ...v.days[0],
      bells: { id: 3, name: "Rövid", periods: [] },
      notes: ["x"],
      teaching: true,
    };
    const day = buildDayModel(v, [], MON, { A: [1], B: [] });
    expect(day?.dual).toBe("dual");
    expect(day?.bells).toEqual({ id: 3, name: "Rövid" });
    expect(day?.notes).toEqual(["x"]);
    expect(day?.teaching).toBe(true);
  });
});

describe("focusDayKey", () => {
  test("hétköznap önmaga, hétvégén a következő hétfő", () => {
    expect(focusDayKey("2026-09-16")).toBe("2026-09-16");
    expect(focusDayKey("2026-09-19")).toBe("2026-09-21");
    expect(focusDayKey("2026-09-20")).toBe("2026-09-21");
  });
});

describe("weekLetterOf", () => {
  test("az első A/B jelölésű nap betűje", () => {
    const v = view();
    v.days = v.days.map((d, i) => ({ ...d, week: i === 0 ? "" : "B" }));
    expect(weekLetterOf(v)).toBe("B");
    v.days = v.days.map((d) => ({ ...d, week: "" }));
    expect(weekLetterOf(v)).toBe("");
  });
});

describe("agendaItem", () => {
  const run = (over: Parameters<typeof lesson>[0]) => ({
    key: "r",
    identity: "x",
    dayOfWeek: 1,
    startMin: 480,
    endMin: 525,
    segments: [],
    lessonCount: 1,
    breaks: [],
    lesson: lesson(over),
    rooms: ["102", "303"],
    hidden: [],
    clusterKeys: [],
  });

  test("osztály-nézet: a tanár a „ki”", () => {
    const item = agendaItem(run({}), MON, "Hétfő");
    expect(item.who).toEqual({ kind: "teacher", label: "Lipták Mária" });
    expect(item.room).toBe("102 · 303");
    expect(item.meta).toEqual(["102 · 303", "Lipták Mária"]);
    expect(item.title).toBe("mat");
    expect(item.fullTitle).toBe("Matematika");
  });

  test("tanár-nézet: az osztály a „ki”", () => {
    const item = agendaItem(
      run({
        teacher: "",
        teacherShort: "",
        classShort: "12A",
        className: "12.A",
      }),
      MON,
      "Hétfő",
    );
    expect(item.who).toEqual({ kind: "class", label: "12.A" });
  });

  test("senki: null", () => {
    const item = agendaItem(
      run({ teacher: "", teacherShort: "" }),
      MON,
      "Hétfő",
    );
    expect(item.who).toBeNull();
  });
});

describe("laterItemsOf", () => {
  test("csak a megadott nap utáni napok, időrendben", () => {
    const v = view({
      lessons: [
        lesson({ dayOfWeek: 1, subjectShort: "mat" }),
        lesson({
          dayOfWeek: 3,
          subjectShort: "tör",
          startMin: 600,
          endMin: 645,
        }),
        lesson({ dayOfWeek: 2, subjectShort: "fiz" }),
      ],
    });
    expect(laterItemsOf(v, [], MON).map((i) => [i.dateKey, i.title])).toEqual([
      ["2026-09-15", "fiz"],
      ["2026-09-16", "tör"],
    ]);
  });
});

describe("daySummary", () => {
  const v = view({
    lessons: [
      lesson({ startMin: 480, endMin: 525, subjectShort: "mat" }),
      lesson({
        startMin: 650,
        endMin: 695,
        subjectShort: "tör",
        teacherShort: "KB",
      }),
    ],
  });

  test("órák és lyukasórák", () => {
    const day = buildDayModel(v, [], MON, null);
    if (!day) throw new Error("nincs nap");
    expect(daySummary(day, true)).toBe("2 óra · 1 lyukasóra");
  });

  test("üres nap", () => {
    const day = buildDayModel(view(), [], MON, null);
    if (!day) throw new Error("nincs nap");
    expect(daySummary(day, true)).toBe("Ma nincs órád.");
    expect(daySummary(day, false)).toBe("Ezen a napon nincs órád.");
  });

  test("duális nap", () => {
    const day = buildDayModel(v, [], MON, { A: [1], B: [] });
    if (!day) throw new Error("nincs nap");
    expect(daySummary(day, true)).toBe("Ma duális nap — a munkahelyen vagy.");
    expect(daySummary(day, false)).toContain("munkahelyen töltöd");
  });
});
