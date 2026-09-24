import { afterEach, describe, expect, test } from "bun:test";
import { installBrowser, uninstallBrowser } from "@/test/browser";
import { lesson, PERIODS } from "@/test/fixtures";
import {
  chosenIdentities,
  clearAllLocalPreferences,
  clusterIdentities,
  clusterKeyOf,
  groupLabel,
  hideIdentity,
  identityParts,
  isHidePreference,
  lessonIdentity,
  loadAllLocalPreferences,
  loadLocalPreferences,
  MERGE_PREFS_STORAGE_KEY,
  preferenceRows,
  preferencesHiding,
  prettyGroup,
  removePreference,
  removePreferences,
  resolveDay,
  saveLocalPreferences,
  suppressedIdentities,
  upsertPreference,
} from "./timetable-merge";

describe("lessonIdentity", () => {
  test("tárgy|csoport|tanár, a rövid alakokat előnyben", () => {
    expect(lessonIdentity(lesson({ group: "1. cs" }))).toBe("mat|1. cs|LM");
    expect(
      lessonIdentity(lesson({ subjectShort: "", teacherShort: "", group: "" })),
    ).toBe("Matematika||Lipták Mária");
  });

  test("a tanári nézet osztályt is visz", () => {
    expect(lessonIdentity(lesson({ classShort: "12A" }))).toBe("mat||LM|12A");
  });

  //! Az elválasztók nem szivároghatnak be a mezőkből.
  test("a | és + karakter perjelre cserélődik", () => {
    expect(lessonIdentity(lesson({ group: "a|b+c" }))).toBe("mat|a/b/c|LM");
  });

  test("identityParts oda-vissza", () => {
    expect(identityParts("mat|12A-12A angol|LM")).toEqual({
      subject: "mat",
      group: "angol",
      teacher: "LM",
    });
    expect(identityParts("")).toEqual({ subject: "", group: "", teacher: "" });
  });
});

describe("prettyGroup / groupLabel", () => {
  test("az osztályjel-ismétlést levágja", () => {
    expect(prettyGroup("12A-12A1")).toBe("1");
    expect(prettyGroup("12A-angol haladó")).toBe("angol haladó");
    expect(prettyGroup(" egész ")).toBe("egész");
    expect(prettyGroup("12A-12A")).toBe("12A-12A");
  });

  test("a tárgynév előtag lekerül, ha marad utána valami", () => {
    expect(groupLabel("12A-Angol 1", "angol")).toBe("1");
    expect(groupLabel("12A-Angol", "angol")).toBe("Angol");
    expect(groupLabel("12A-Német 2", "angol")).toBe("Német 2");
    expect(groupLabel("12A-x", "")).toBe("x");
  });
});

describe("klaszterkulcsok", () => {
  test("rendezett, egyedi, sorrendfüggetlen", () => {
    expect(clusterKeyOf(["b", "a", "b"])).toBe("a+b");
    expect(clusterKeyOf(["a", "b"])).toBe(clusterKeyOf(["b", "a"]));
    expect(clusterIdentities("a+b")).toEqual(["a", "b"]);
    expect(clusterIdentities("")).toEqual([]);
    expect(chosenIdentities("a")).toEqual(["a"]);
  });
});

describe("döntések listája", () => {
  const a = { clusterKey: "x+y", chosen: "x" };
  const b = { clusterKey: "z", chosen: "" };

  test("suppressedIdentities: a nem választott ágak", () => {
    expect([...suppressedIdentities([a, b])].sort()).toEqual(["y", "z"]);
  });

  test("upsert elől és cserél, remove töröl", () => {
    const next = { clusterKey: "x+y", chosen: "y" };
    expect(upsertPreference([a, b], next)).toEqual([next, b]);
    expect(removePreference([a, b], "z")).toEqual([a]);
    expect(removePreferences([a, b], ["z", "x+y"])).toEqual([]);
  });

  test("hideIdentity kiveszi magát a korábbi választásokból", () => {
    const out = hideIdentity([a, b], "x");
    expect(out[0]).toEqual({ clusterKey: "x", chosen: "" });
    expect(out).toContainEqual({ clusterKey: "x+y", chosen: "" });
    expect(isHidePreference(out[0])).toBe(true);
    expect(isHidePreference(a)).toBe(false);
  });

  test("preferencesHiding: mely döntések rejtik a kért órát", () => {
    expect(preferencesHiding([a, b], ["y"])).toEqual(["x+y"]);
    expect(preferencesHiding([a, b], ["x"])).toEqual([]);
    expect(preferencesHiding([a, b], ["z", "y"])).toEqual(["x+y", "z"]);
  });
});

describe("resolveDay", () => {
  const ang1 = lesson({
    subjectShort: "ang",
    group: "1",
    groupColumn: 0,
    groupCount: 2,
    wholeClass: false,
    teacherShort: "AA",
  });
  const ang2 = lesson({
    subjectShort: "ang",
    group: "2",
    groupColumn: 1,
    groupCount: 2,
    wholeClass: false,
    teacherShort: "BB",
  });
  const id1 = lessonIdentity(ang1);
  const id2 = lessonIdentity(ang2);

  test("ütközés nélkül egy futam óránként, dupla óra összefűzve", () => {
    const first = lesson({ startMin: 480, endMin: 525, room: "102" });
    const second = lesson({ startMin: 535, endMin: 580, room: "103" });
    const day = resolveDay([second, first], [], PERIODS);
    expect(day.conflicts).toEqual([]);
    expect(day.ghosts).toEqual([]);
    expect(day.runs).toHaveLength(1);
    const [run] = day.runs;
    expect(run.startMin).toBe(480);
    expect(run.endMin).toBe(580);
    expect(run.lessonCount).toBe(2);
    expect(run.rooms).toEqual(["102", "103"]);
    expect(run.breaks).toEqual([{ startMin: 525, endMin: 535 }]);
  });

  test("a túl nagy lyuk két külön futamot ad", () => {
    const first = lesson({ startMin: 480, endMin: 525 });
    const later = lesson({ startMin: 650, endMin: 695 });
    expect(resolveDay([first, later], [], PERIODS).runs).toHaveLength(2);
  });

  test("két csoport egyszerre: nyitott ütközés, mindkettő látszik", () => {
    const day = resolveDay([ang1, ang2], []);
    expect(day.conflicts).toHaveLength(1);
    const [c] = day.conflicts;
    expect(c.key).toBe(clusterKeyOf([id1, id2]));
    expect(c.decided).toBe(false);
    expect(c.visible.sort()).toEqual([id1, id2].sort());
    expect(c.choices).toHaveLength(2);
    expect(day.runs).toHaveLength(2);
  });

  test("a mentett választás eldönti az ütközést", () => {
    const key = clusterKeyOf([id1, id2]);
    const day = resolveDay([ang1, ang2], [{ clusterKey: key, chosen: id2 }]);
    expect(day.conflicts).toEqual([]);
    expect(day.runs).toHaveLength(1);
    expect(day.runs[0].identity).toBe(id2);
    expect(day.runs[0].hidden.map((o) => o.identity)).toEqual([id1]);
  });

  test("az elrejtett egyedüli óra szellemként marad", () => {
    const only = lesson();
    const day = resolveDay([only], hideIdentity([], lessonIdentity(only)));
    expect(day.runs).toEqual([]);
    expect(day.ghosts).toHaveLength(1);
    expect(day.ghosts[0]).toMatchObject({
      startMin: 480,
      endMin: 525,
      dayOfWeek: 1,
    });
  });

  //* Ha a klaszter győztes ágát utólag elrejtik, a választás kiürül — ilyenkor
  //* az egész idősáv rejtett: a felhasználó egyik ágat sem kérte.
  test("a győztes ág elrejtése után az egész idősáv szellem", () => {
    const key = clusterKeyOf([id1, id2]);
    const prefs = hideIdentity([{ clusterKey: key, chosen: id2 }], id2);
    const day = resolveDay([ang1, ang2], prefs);
    expect(day.runs).toEqual([]);
    expect(day.ghosts).toHaveLength(1);
    expect(day.ghosts[0].hidden.map((o) => o.identity).sort()).toEqual(
      [id1, id2].sort(),
    );
  });

  test("nem átfedő csoportórák egy kombinációban férnek el", () => {
    const early = lesson({
      subjectShort: "inf",
      group: "1",
      startMin: 480,
      endMin: 525,
    });
    const long = lesson({
      subjectShort: "tesi",
      group: "2",
      startMin: 480,
      endMin: 580,
    });
    const late = lesson({
      subjectShort: "inf",
      group: "1",
      startMin: 535,
      endMin: 580,
      teacherShort: "XY",
    });
    const day = resolveDay([early, long, late], []);
    expect(day.conflicts).toHaveLength(1);
    //* {early, late} együtt felvehető, {long} önmagában.
    expect(day.conflicts[0].choices.map((c) => c.options.length)).toEqual([
      2, 1,
    ]);
  });

  test("egymást követő azonos ütközések egy blokká láncolódnak", () => {
    const a1 = { ...ang1, startMin: 480, endMin: 525 };
    const b1 = { ...ang2, startMin: 480, endMin: 525 };
    const a2 = { ...ang1, startMin: 535, endMin: 580 };
    const b2 = { ...ang2, startMin: 535, endMin: 580 };
    const day = resolveDay([a1, b1, a2, b2], [], PERIODS);
    expect(day.conflicts).toHaveLength(1);
    expect(day.conflicts[0]).toMatchObject({ startMin: 480, endMin: 580 });
  });
});

describe("preferenceRows", () => {
  test("választott, rejtett és aktív-e ezen a héten", () => {
    const l = lesson();
    const id = lessonIdentity(l);
    const rows = preferenceRows(
      [
        { clusterKey: clusterKeyOf([id, "tör||KB"]), chosen: id },
        { clusterKey: "rég|x|y", chosen: "" },
      ],
      [l],
    );
    expect(rows[0].active).toBe(true);
    expect(rows[0].chosen).toEqual([identityParts(id)]);
    expect(rows[0].hidden).toEqual([
      { subject: "tör", group: "", teacher: "KB" },
    ]);
    expect(rows[1].active).toBe(false);
  });
});

describe("helyi tárolás", () => {
  afterEach(uninstallBrowser);

  test("szerveren üres és néma", () => {
    expect(loadAllLocalPreferences()).toEqual({});
    expect(() => saveLocalPreferences("12A", [])).not.toThrow();
    expect(() => clearAllLocalPreferences()).not.toThrow();
  });

  test("alanyonként, az üres lista törli a kulcsot", () => {
    const b = installBrowser();
    saveLocalPreferences("12A", [{ clusterKey: "a", chosen: "a" }]);
    saveLocalPreferences("tanar:LM", [{ clusterKey: "b", chosen: "" }]);
    expect(loadLocalPreferences("12A")).toEqual([
      { clusterKey: "a", chosen: "a" },
    ]);
    expect(Object.keys(loadAllLocalPreferences())).toEqual(["12A", "tanar:LM"]);
    saveLocalPreferences("12A", []);
    expect(Object.keys(loadAllLocalPreferences())).toEqual(["tanar:LM"]);
    expect(b.events).toHaveLength(3);
    clearAllLocalPreferences();
    expect(loadAllLocalPreferences()).toEqual({});
  });

  test("a sérült bejegyzéseket kiszűri", () => {
    const b = installBrowser();
    b.localStorage.setItem(
      MERGE_PREFS_STORAGE_KEY,
      JSON.stringify({
        "12A": [{ clusterKey: "a", chosen: "a" }, { clusterKey: 1 }, null],
        "10B": "x",
      }),
    );
    expect(loadLocalPreferences("12A")).toEqual([
      { clusterKey: "a", chosen: "a" },
    ]);
    expect(loadLocalPreferences("10B")).toEqual([]);
    b.localStorage.setItem(MERGE_PREFS_STORAGE_KEY, "nem json");
    expect(loadAllLocalPreferences()).toEqual({});
  });
});
