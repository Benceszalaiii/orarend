import "server-only";

import { PALETTE_META } from "./appearance";
import { MENU_ITEMS } from "./menu-items";
import { sanitizePrefs } from "./prefs-shared";
import prisma from "./prisma";
import { getThemePresets } from "./theme-presets";
import { shiftDayKey, usageDayKey } from "./usage-day";

//! ═══════════════════════════════════════════════════════════════════════════
//! AZ ÜZEMELTETŐI STATISZTIKA — FIÓKOK, AKTIVITÁS, BEÁLLÍTÁSOK
//! ═══════════════════════════════════════════════════════════════════════════
//! CSAK ÖSSZESÍTÉS HAGYJA EL EZT A MODULT. Egyetlen visszaadott mező sem
//! azonosít felhasználót: darabszámok és megoszlások. A névtelen használati
//! számláló (`usage-store.ts`) és ez a modul SOHA nem kapcsolódik össze —
//! lásd a séma fejlécét.
//!
//! A `Preference.data` a `sanitizePrefs`-en át olvasódik: ugyanaz a szerződés,
//! amit a szinkron ír, így egy régi alakú sor sem hozhat ide ismeretlen értéket.
//! ═══════════════════════════════════════════════════════════════════════════

const DAY_MS = 24 * 60 * 60 * 1000;

export type Slice = { key: string; label: string; count: number };
export type SeriesPoint = { date: string; value: number };

export type AccountStats = {
  totals: {
    users: number;
    teachers: number;
    students: number;
    admins: number;
    banned: number;
    withPasskey: number;
    withPrefs: number;
    newInPeriod: number;
  };
  //* Napi bontás az időszakra: az új fiókok és a futó összesített létszám.
  growth: (SeriesPoint & { total: number })[];
  //* Utolsó aktivitás szerinti sávok — egymást kizáróak, összegük a létszám.
  activity: Slice[];
  providers: Slice[];
  classes: Slice[];
  prefs: {
    theme: Slice[];
    palette: Slice[];
    preset: Slice[];
    lastView: Slice[];
    identity: Slice[];
    hiddenMenu: Slice[];
  };
  //* Hány FIÓK használja az egyes képességeket.
  features: Slice[];
  //* Tartalom-darabszámok — ezek nem fiókra, hanem sorra vonatkoznak.
  content: { lessonLinks: number; teacherLinks: number; screens: number };
};

const PROVIDER_LABEL: Record<string, string> = {
  "jedlik-ad": "Iskolai fiók",
  google: "Google",
};

const THEME_LABEL: Record<string, string> = {
  system: "Rendszer",
  light: "Világos",
  dark: "Sötét",
};

const VIEW_LABEL: Record<string, string> = {
  "/orarend": "Heti órarend",
  "/ma": "Ma",
  "/tanari": "Tanári",
};

const IDENTITY_LABEL: Record<string, string> = {
  class: "Osztály",
  teacher: "Tanár",
};

//* A „nem nyilatkozott" is válasz: aki sosem nyúlt a beállításhoz, az az
//* alapértelmezést látja — ez a sáv mutatja meg, mennyire számít a választó.
const UNSET = "__unset";

function tally(
  values: Iterable<string | null>,
  label: (key: string) => string,
  unsetLabel = "Nincs beállítva",
): Slice[] {
  const counts = new Map<string, number>();
  for (const value of values) {
    const key = value ?? UNSET;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([key, count]) => ({
      key,
      label: key === UNSET ? unsetLabel : label(key),
      count,
    }))
    .sort((a, b) => b.count - a.count);
}

export async function loadAccountStats(days: number): Promise<AccountStats> {
  const now = Date.now();

  const [
    users,
    providerGroups,
    passkeyUsers,
    preferences,
    lessonLinks,
    lessonLinkUsers,
    teacherLinks,
    screens,
    presets,
  ] = await Promise.all([
    prisma.user.findMany({
      select: {
        class: true,
        isTeacher: true,
        isAdmin: true,
        banned: true,
        themePreset: true,
        createdAt: true,
        lastActiveAt: true,
      },
    }),
    prisma.account.groupBy({ by: ["providerId"], _count: { userId: true } }),
    prisma.passkey.groupBy({ by: ["userId"] }),
    prisma.preference.findMany({ select: { data: true } }),
    prisma.lessonLink.count(),
    prisma.lessonLink.groupBy({ by: ["userId"] }),
    prisma.teacherLessonLink.count(),
    prisma.classroomScreen.count(),
    getThemePresets(),
  ]);

  //* ─── Növekedés ──────────────────────────────────────────────────────────
  //! BUDAPESTI NAPOK, mint a használati számlálónál — különben egy éjfél
  //! körüli belépés a két grafikonon más napra esne.
  const today = usageDayKey();
  const dates: string[] = [];
  for (let i = days - 1; i >= 0; i--) dates.push(shiftDayKey(today, -i));
  const firstDay = dates[0];

  const newPerDay = new Map<string, number>();
  let before = 0;
  for (const u of users) {
    const key = usageDayKey(u.createdAt);
    if (key < firstDay) before++;
    else newPerDay.set(key, (newPerDay.get(key) ?? 0) + 1);
  }
  let running = before;
  const growth = dates.map((date) => {
    const value = newPerDay.get(date) ?? 0;
    running += value;
    return { date, value, total: running };
  });

  //* ─── Aktivitás ──────────────────────────────────────────────────────────
  const ACTIVITY_BANDS = [
    { key: "1", label: "Utolsó 24 óra", ms: DAY_MS },
    { key: "7", label: "1–7 napja", ms: 7 * DAY_MS },
    { key: "30", label: "8–30 napja", ms: 30 * DAY_MS },
    { key: "90", label: "31–90 napja", ms: 90 * DAY_MS },
  ];
  const activityCounts = new Map<string, number>();
  for (const u of users) {
    const age = u.lastActiveAt ? now - u.lastActiveAt.getTime() : null;
    const band =
      age === null
        ? "never"
        : (ACTIVITY_BANDS.find((b) => age < b.ms)?.key ?? "older");
    activityCounts.set(band, (activityCounts.get(band) ?? 0) + 1);
  }
  //! A SÁVOK SORRENDJE AZ IDŐÉ, NEM A DARABSZÁMÉ — ez egy skála.
  const activity: Slice[] = [
    ...ACTIVITY_BANDS.map((b) => ({ key: b.key, label: b.label })),
    { key: "older", label: "Régebben" },
    { key: "never", label: "Még sosem" },
  ].map((b) => ({ ...b, count: activityCounts.get(b.key) ?? 0 }));

  //* ─── Beállítások ────────────────────────────────────────────────────────
  const parsed = preferences.map((p) => sanitizePrefs(p.data));
  const presetTitle = new Map(presets.map((p) => [p.slug, p.title]));

  const hiddenCounts = new Map<string, number>();
  for (const prefs of parsed) {
    for (const id of prefs.hiddenMenu ?? []) {
      hiddenCounts.set(id, (hiddenCounts.get(id) ?? 0) + 1);
    }
  }
  const hiddenMenu = MENU_ITEMS.map((item) => ({
    key: item.id,
    label: item.label,
    count: hiddenCounts.get(item.id) ?? 0,
  }))
    .filter((s) => s.count > 0)
    .sort((a, b) => b.count - a.count);

  const students = users.filter((u) => !u.isTeacher && u.class);

  return {
    totals: {
      users: users.length,
      teachers: users.filter((u) => u.isTeacher).length,
      students: students.length,
      admins: users.filter((u) => u.isAdmin).length,
      banned: users.filter((u) => u.banned === true).length,
      withPasskey: passkeyUsers.length,
      withPrefs: preferences.length,
      //* Ugyanazokból a napokból, mint a grafikon — a kettő ne mondjon mást.
      newInPeriod: growth.reduce((sum, d) => sum + d.value, 0),
    },
    growth,
    activity,
    providers: providerGroups
      .map((g) => ({
        key: g.providerId,
        label: PROVIDER_LABEL[g.providerId] ?? g.providerId,
        count: g._count.userId,
      }))
      .sort((a, b) => b.count - a.count),
    classes: tally(
      students.map((u) => u.class),
      (k) => k,
    ),
    prefs: {
      theme: tally(
        parsed.map((p) => p.theme),
        (k) => THEME_LABEL[k] ?? k,
      ),
      palette: tally(
        parsed.map((p) => p.palette),
        (k) => PALETTE_META[k as keyof typeof PALETTE_META]?.label ?? k,
      ),
      //! A PRESET A `User` OSZLOPA, NEM A JSON-É — ezért a teljes létszámra
      //! számol, nem csak azokra, akiknek van szinkronizált beállításuk.
      preset: tally(
        users.map((u) => u.themePreset),
        (k) => presetTitle.get(k) ?? k,
        "Alapértelmezett",
      ),
      lastView: tally(
        parsed.map((p) => p.lastView),
        (k) => VIEW_LABEL[k] ?? k,
      ),
      identity: tally(
        parsed.map((p) => p.identity),
        (k) => IDENTITY_LABEL[k] ?? k,
      ),
      hiddenMenu,
    },
    features: [
      { key: "passkey", label: "Passkey", count: passkeyUsers.length },
      {
        key: "lessonLinks",
        label: "Saját óralink",
        count: lessonLinkUsers.length,
      },
      {
        key: "merge",
        label: "Összevonás",
        count: parsed.filter((p) => Object.keys(p.merge).length > 0).length,
      },
      {
        key: "dual",
        label: "Duális beosztás",
        count: parsed.filter((p) => Object.keys(p.dual).length > 0).length,
      },
    ],
    content: { lessonLinks, teacherLinks, screens },
  };
}
