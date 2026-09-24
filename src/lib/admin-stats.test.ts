import {
  afterAll,
  beforeEach,
  describe,
  expect,
  mock,
  spyOn,
  test,
} from "bun:test";
import { json, stubFetch } from "@/test/browser";
import { shiftDayKey, usageDayKey } from "./usage-day";

//* Az adatbázis helyett egy rögzített állapot — az összesítés logikáját
//* nézzük, nem a Prismát.
const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.now();
const ago = (ms: number) => new Date(NOW - ms);

type UserRow = {
  class: string | null;
  isTeacher: boolean;
  isAdmin: boolean;
  banned: boolean | null;
  themePreset: string | null;
  createdAt: Date;
  lastActiveAt: Date | null;
};

let users: UserRow[] = [];
let preferences: { data: unknown }[] = [];

mock.module("./prisma", () => ({
  default: {
    user: { findMany: async () => users },
    account: {
      groupBy: async () => [
        { providerId: "google", _count: { userId: 5 } },
        { providerId: "jedlik-ad", _count: { userId: 7 } },
        { providerId: "github", _count: { userId: 1 } },
      ],
    },
    passkey: { groupBy: async () => [{ userId: "a" }, { userId: "b" }] },
    preference: { findMany: async () => preferences },
    lessonLink: {
      count: async () => 11,
      groupBy: async () => [{ userId: "a" }],
    },
    teacherLessonLink: { count: async () => 3 },
    classroomScreen: { count: async () => 4 },
  },
}));
const { loadAccountStats } = await import("./admin-stats");

//! A `theme-presets`-et NEM cseréljük modulként: a `mock.module` az egész
//! futásra szól, és a saját tesztfájlja a hamis példányt kapná. A regiszter
//! lekérését fogjuk meg helyette.
const registry = stubFetch(() =>
  json({ items: [{ name: "nord", title: "Nord" }] }),
);
const clock = spyOn(Date, "now").mockReturnValue(NOW);
afterAll(() => {
  clock.mockRestore();
  registry.restore();
});

function user(over: Partial<UserRow> = {}): UserRow {
  return {
    class: null,
    isTeacher: false,
    isAdmin: false,
    banned: null,
    themePreset: null,
    createdAt: ago(365 * DAY),
    lastActiveAt: null,
    ...over,
  };
}

beforeEach(() => {
  users = [
    user({ class: "12A", createdAt: ago(0), lastActiveAt: ago(60_000) }),
    user({
      class: "12A",
      createdAt: ago(2 * DAY),
      lastActiveAt: ago(3 * DAY),
      themePreset: "nord",
    }),
    user({ class: "10B", lastActiveAt: ago(20 * DAY), banned: true }),
    user({
      isTeacher: true,
      class: "13C",
      lastActiveAt: ago(60 * DAY),
      isAdmin: true,
    }),
    user({ lastActiveAt: ago(400 * DAY), themePreset: "ismeretlen" }),
  ];
  preferences = [
    {
      data: {
        theme: "dark",
        palette: "alkony",
        lastView: "/ma",
        identity: "class",
        hiddenMenu: ["duty", "rooms"],
      },
    },
    {
      data: {
        theme: "dark",
        merge: { "12A": [{ clusterKey: "k", chosen: "c" }] },
        hiddenMenu: ["duty"],
      },
    },
    { data: { dual: { "12A": { A: [1], B: [] } } } },
    { data: "szemét" },
  ];
});

describe("loadAccountStats", () => {
  test("összesítők", async () => {
    const stats = await loadAccountStats(7);
    expect(stats.totals).toEqual({
      users: 5,
      teachers: 1,
      //* Diák = nem tanár ÉS van osztálya.
      students: 3,
      admins: 1,
      banned: 1,
      withPasskey: 2,
      withPrefs: 4,
      newInPeriod: 2,
    });
    expect(stats.content).toEqual({
      lessonLinks: 11,
      teacherLinks: 3,
      screens: 4,
    });
  });

  test("növekedés: a napok sorban, a korábbiak az alapba számítanak", async () => {
    const stats = await loadAccountStats(7);
    const today = usageDayKey(new Date(NOW));
    expect(stats.growth).toHaveLength(7);
    expect(stats.growth[0].date).toBe(shiftDayKey(today, -6));
    expect(stats.growth[6]).toEqual({ date: today, value: 1, total: 5 });
    expect(stats.growth[0].total).toBe(3);
  });

  test("aktivitási sávok, a sosem aktívakkal együtt", async () => {
    const stats = await loadAccountStats(7);
    expect(stats.activity.map((s) => [s.key, s.count])).toEqual([
      ["1", 1],
      ["7", 1],
      ["30", 1],
      ["90", 1],
      ["older", 1],
      ["never", 0],
    ]);
  });

  test("szolgáltatók magyar felirattal, csökkenő sorrendben", async () => {
    const stats = await loadAccountStats(7);
    expect(stats.providers).toEqual([
      { key: "jedlik-ad", label: "Iskolai fiók", count: 7 },
      { key: "google", label: "Google", count: 5 },
      { key: "github", label: "github", count: 1 },
    ]);
  });

  test("osztályok csak a diákokból", async () => {
    const stats = await loadAccountStats(7);
    expect(stats.classes).toEqual([
      { key: "12A", label: "12A", count: 2 },
      { key: "10B", label: "10B", count: 1 },
    ]);
  });

  test("beállítások a TISZTÍTOTT csomagból, a hiányzó „nincs beállítva”", async () => {
    const { prefs } = await loadAccountStats(7);
    expect(prefs.theme).toEqual([
      { key: "dark", label: "Sötét", count: 2 },
      { key: "__unset", label: "Nincs beállítva", count: 2 },
    ]);
    expect(prefs.palette[0]).toEqual({
      key: "__unset",
      label: "Nincs beállítva",
      count: 3,
    });
    expect(prefs.palette).toContainEqual({
      key: "alkony",
      label: "Alkony",
      count: 1,
    });
    expect(prefs.lastView).toContainEqual({
      key: "/ma",
      label: "Ma",
      count: 1,
    });
    expect(prefs.identity).toContainEqual({
      key: "class",
      label: "Osztály",
      count: 1,
    });
    expect(prefs.hiddenMenu.map((s) => [s.key, s.count])).toEqual([
      ["duty", 2],
      ["rooms", 1],
    ]);
  });

  test("preset: a regiszter címe, ismeretlennél a slug, üresen „Alapértelmezett”", async () => {
    const { prefs } = await loadAccountStats(7);
    expect(prefs.preset).toEqual([
      { key: "__unset", label: "Alapértelmezett", count: 3 },
      { key: "nord", label: "Nord", count: 1 },
      { key: "ismeretlen", label: "ismeretlen", count: 1 },
    ]);
  });

  test("funkciók használata", async () => {
    const { features } = await loadAccountStats(7);
    expect(features.map((f) => [f.key, f.count])).toEqual([
      ["passkey", 2],
      ["lessonLinks", 1],
      ["merge", 1],
      ["dual", 1],
    ]);
  });
});
