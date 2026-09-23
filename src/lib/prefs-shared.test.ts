import { describe, expect, test } from "bun:test";
import {
  EMPTY_PREFS,
  hasAnyPrefs,
  sanitizeDual,
  sanitizeMergeList,
  sanitizePrefs,
} from "./prefs-shared";

describe("sanitizeMergeList", () => {
  test("csak érvényes bejegyzések, levágva", () => {
    expect(
      sanitizeMergeList([
        { clusterKey: " k1 ", chosen: " c1 " },
        { clusterKey: "", chosen: "c" },
        { clusterKey: "k", chosen: 3 },
        { clusterKey: "k", chosen: "   " },
        "x",
        null,
        [],
      ]),
    ).toEqual([{ clusterKey: "k1", chosen: "c1" }]);
  });

  test("túl hosszú azonosító kimarad", () => {
    expect(
      sanitizeMergeList([{ clusterKey: "k".repeat(513), chosen: "c" }]),
    ).toEqual([]);
  });

  test("legfeljebb 80 bejegyzés", () => {
    const many = Array.from({ length: 100 }, (_, i) => ({
      clusterKey: `k${i}`,
      chosen: "c",
    }));
    expect(sanitizeMergeList(many)).toHaveLength(80);
  });

  test("nem tömb: üres", () => {
    expect(sanitizeMergeList({ clusterKey: "k", chosen: "c" })).toEqual([]);
  });

  //! ISMERT HIBA. A `timetable-merge.ts` `hideIdentity`-je az elrejtett órát
  //! `{ clusterKey: <óra>, chosen: "" }` alakban menti — az üres `chosen` ott
  //! JELENTÉS („egyik ágat sem tartjuk meg"), nem hiányzó adat. A
  //! `sanitizeIdentity` viszont az üres szöveget `null`-lá teszi, így a
  //! `chosen === null` feltétel eldobja: az elrejtett óra sem a fiókba, sem a
  //! naptár-feedbe nem jut el. Ha a hiba javul, a `test.failing` pirosra vált
  //! — ilyenkor sima `test`-re kell cserélni.
  test.failing("az elrejtés (üres chosen) megmarad", () => {
    expect(
      sanitizeMergeList([{ clusterKey: "12A|mat|LM|1", chosen: "" }]),
    ).toEqual([{ clusterKey: "12A|mat|LM|1", chosen: "" }]);
  });
});

describe("sanitizeDual", () => {
  test("csak hétköznapok, egyedien, rendezve", () => {
    expect(sanitizeDual({ A: [5, 1, 1, 0, 6, "3"], B: [3] })).toEqual({
      A: [1, 5],
      B: [3],
    });
  });

  test("hiányzó hét üres, nem rekord: null", () => {
    expect(sanitizeDual({})).toEqual({ A: [], B: [] });
    expect(sanitizeDual([1, 2])).toBeNull();
    expect(sanitizeDual(null)).toBeNull();
  });
});

describe("sanitizePrefs", () => {
  test("szemétre az üres csomag, friss objektumokkal", () => {
    for (const input of [null, undefined, 3, "x", []]) {
      const out = sanitizePrefs(input);
      expect(out).toEqual(EMPTY_PREFS);
      expect(out.merge).not.toBe(EMPTY_PREFS.merge);
    }
  });

  test("érvényes teljes csomag változatlan", () => {
    const full = {
      class: "12A",
      teacher: "LM",
      lastView: "/ma",
      identity: "teacher",
      theme: "dark",
      palette: "alkony",
      merge: {
        "12A": [{ clusterKey: "k", chosen: "c" }],
        "tanar:LM": [{ clusterKey: "k2", chosen: "c2" }],
      },
      dual: { "12A": { A: [1], B: [] } },
      hiddenMenu: ["duty"],
    };
    expect(sanitizePrefs(full)).toEqual(full as never);
  });

  test("minden érvénytelen mezőt eldob", () => {
    const out = sanitizePrefs({
      class: "<script>",
      teacher: "lowercase",
      lastView: "/admin",
      identity: "god",
      theme: "sepia",
      palette: "neon",
      merge: {
        "nem osztály": [{ clusterKey: "k", chosen: "c" }],
        "tanar:x1": [{ clusterKey: "k", chosen: "c" }],
        "12B": [],
      },
      dual: { "../etc": { A: [1], B: [] }, "12A": "x" },
      hiddenMenu: ["nope"],
    });
    expect(out).toEqual({ ...EMPTY_PREFS, hiddenMenu: [] });
  });

  test("a hiddenMenu hiánya null, az üres lista üres lista", () => {
    expect(sanitizePrefs({}).hiddenMenu).toBeNull();
    expect(sanitizePrefs({ hiddenMenu: null }).hiddenMenu).toBeNull();
    expect(sanitizePrefs({ hiddenMenu: [] }).hiddenMenu).toEqual([]);
  });

  test("legfeljebb 24 alany a merge és a dual alatt", () => {
    const classes = Array.from(
      { length: 30 },
      (_, i) => `${String(10 + Math.floor(i / 26)).padStart(2, "0")}${String.fromCharCode(65 + (i % 26))}`,
    );
    const merge = Object.fromEntries(
      classes.map((c) => [c, [{ clusterKey: "k", chosen: "c" }]]),
    );
    const dual = Object.fromEntries(classes.map((c) => [c, { A: [1], B: [] }]));
    const out = sanitizePrefs({ merge, dual });
    expect(Object.keys(out.merge)).toHaveLength(24);
    expect(Object.keys(out.dual)).toHaveLength(24);
  });
});

describe("hasAnyPrefs", () => {
  test("üres: nem", () => {
    expect(hasAnyPrefs(EMPTY_PREFS)).toBe(false);
  });

  test("bármelyik mező elég", () => {
    expect(hasAnyPrefs({ ...EMPTY_PREFS, class: "12A" })).toBe(true);
    expect(hasAnyPrefs({ ...EMPTY_PREFS, theme: "light" })).toBe(true);
    expect(hasAnyPrefs({ ...EMPTY_PREFS, hiddenMenu: [] })).toBe(true);
    expect(
      hasAnyPrefs({ ...EMPTY_PREFS, dual: { "12A": { A: [], B: [] } } }),
    ).toBe(true);
  });
});
