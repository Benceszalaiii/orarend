import "server-only";

import { headers } from "next/headers";
import { cache } from "react";
import { auth } from "./auth";
import { resolveTeacherShort } from "./classroom-store";
import type { Actor } from "./club-access";
import type { ScheduleClub, ScheduleSlot } from "./club-schedule";
import type { ClubKind, ClubTrack } from "./clubs";
import { loadRoomList } from "./free-rooms-source";
import prisma from "./prisma";
import { loadTeacherDirectory } from "./teacher-directory";

//! ═══════════════════════════════════════════════════════════════════════════
//! SZAKKÖRÖK — SZERVEROLDAL
//! ═══════════════════════════════════════════════════════════════════════════
//! Olvasás és a belépett felhasználó feloldása. Az írás a Server Actionökben
//! él (`src/app/szakkorok/actions.ts`); a jogszabályok a `club-access.ts`-ben.
//!
//! AZ ADATBÁZIS HIÁNYA NEM VIHETI EL AZ ÓRARENDET. Az illesztéshez használt
//! lista (`loadScheduleClubs`) az órarend minden megnyitásakor lefut — ha a
//! Postgres épp nem elérhető, üres listát ad, és a rács szakkörök nélkül, de
//! kirajzolódik. Ugyanaz az elv, mint a `prisma.ts`-ben.
//! ═══════════════════════════════════════════════════════════════════════════

function dateKeyOf(date: Date | null): string | null {
  return date ? date.toISOString().slice(0, 10) : null;
}

const slotSelect = {
  id: true,
  weekday: true,
  startMinute: true,
  endMinute: true,
  room: true,
  teachers: true,
  source: true,
  validFrom: true,
  validUntil: true,
} as const;

type SlotRow = {
  id: string;
  weekday: number;
  startMinute: number;
  endMinute: number;
  room: string | null;
  teachers: string[];
  source: "TIMETABLE" | "ORGANIZER";
  validFrom: Date | null;
  validUntil: Date | null;
};

function toScheduleSlot(row: SlotRow): ScheduleSlot {
  return {
    ...row,
    validFrom: dateKeyOf(row.validFrom),
    validUntil: dateKeyOf(row.validUntil),
  };
}

//* Az első vezető a fő vezető (`lead`), utána ábécé — a kezdő lista sorrendje.
const organizerOrder = [{ lead: "desc" as const }, { teacher: "asc" as const }];

//* ---------------------------------------------------------------------------
//* AZ ILLESZTÉS LISTÁJA — ÓRARENDHEZ, TEREMKERESŐHÖZ
//* ---------------------------------------------------------------------------
//! EGY PERCIG TARTJUK A MEMÓRIÁBAN. Az órarend minden megnyitása és minden
//! teremkereső-kérdés ebből dolgozik; egy percnyi késés egy frissen szerkesztett
//! időpontnál elfogadható, egy adatbázis-kör minden órarend-megnyitásnál nem.
//! Ugyanazon a példányon a mentés azonnal érvényteleníti
//! (`invalidateScheduleClubs`); a többi szerverpéldányon legfeljebb egy perc.
const SCHEDULE_TTL_MS = 60_000;
let scheduleCache: { at: number; clubs: ScheduleClub[] } | null = null;

export function invalidateScheduleClubs(): void {
  scheduleCache = null;
}

export async function loadScheduleClubs(): Promise<ScheduleClub[]> {
  if (!process.env.DB_URL) return [];
  if (scheduleCache && Date.now() - scheduleCache.at < SCHEDULE_TTL_MS) {
    return scheduleCache.clubs;
  }
  try {
    const rows = await prisma.club.findMany({
      where: { status: "ACTIVE" },
      select: {
        id: true,
        slug: true,
        name: true,
        kind: true,
        grades: true,
        classes: true,
        tracks: true,
        audienceNote: true,
        organizers: { select: { teacher: true }, orderBy: organizerOrder },
        slots: { select: slotSelect },
      },
      orderBy: { name: "asc" },
    });
    const clubs = rows.map((row) => ({
      ...row,
      organizers: row.organizers.map((o) => o.teacher),
      slots: row.slots.map(toScheduleSlot),
    }));
    scheduleCache = { at: Date.now(), clubs };
    return clubs;
  } catch (err) {
    console.error("[orarend] A szakkörök betöltése nem sikerült", err);
    //* A lejárt lista jobb a semminél.
    return scheduleCache?.clubs ?? [];
  }
}

//* ---------------------------------------------------------------------------
//* KI NÉZI
//* ---------------------------------------------------------------------------
//! A JOG AZ ADATBÁZISBÓL JÖN, NEM A SÜTIBŐL — ugyanaz az indok, mint a
//! `requireAdmin`-nál. A tanárjelet a szerver oldja fel a `teacherName`-ből;
//! a kliens soha nem mondhatja meg, kinek a nevében jár.
export const resolveActor = cache(async (): Promise<Actor | null> => {
  if (!process.env.DB_URL) return null;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      name: true,
      class: true,
      isAdmin: true,
      isTeacher: true,
      teacherName: true,
    },
  });
  if (!user) return null;
  //! A `resolveTeacherShort` kisbetűs kulcsot ad (`extrasKey`); a szakkörök a
  //! Jedlikinfo alakjában (nagybetűvel) tárolják a jelet.
  const short = user.isTeacher ? await resolveTeacherShort(user) : null;
  return {
    userId: user.id,
    isAdmin: user.isAdmin,
    isTeacher: user.isTeacher,
    teacher: short ? short.toLocaleUpperCase("hu") : null,
    className: user.class,
  };
});

//* ---------------------------------------------------------------------------
//* A TANÁROK NEVE
//* ---------------------------------------------------------------------------
//! A szakkör a jelet tárolja; a lap a nevet mutatja. A Jedlikinfo a két
//! azonos nevű tanárt születési dátummal különbözteti meg („Horváth Norbert
//! (1979.05.16.)") — ezt a megjelenítésben elhagyjuk, a jel úgyis mellette áll.
const BIRTH_SUFFIX = /\s*\(\d{4}\.\d{2}\.\d{2}\.\)\s*$/;

export async function teacherNames(): Promise<Map<string, string>> {
  const directory = await loadTeacherDirectory();
  return new Map(
    (directory ?? []).map((t) => [t.short, t.name.replace(BIRTH_SUFFIX, "")]),
  );
}

//* ---------------------------------------------------------------------------
//* A LAPOK ADATAI
//* ---------------------------------------------------------------------------

export type ClubListRow = ScheduleClub & {
  description: string | null;
  status: "PROPOSED" | "ACTIVE" | "ARCHIVED";
  proposedById: string | null;
  memberCount: number;
};

const listSelect = {
  id: true,
  slug: true,
  name: true,
  description: true,
  kind: true,
  status: true,
  grades: true,
  classes: true,
  tracks: true,
  audienceNote: true,
  proposedById: true,
  organizers: { select: { teacher: true }, orderBy: organizerOrder },
  slots: { select: slotSelect },
  _count: { select: { members: true } },
} as const;

type ListRow = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  kind: ClubKind;
  status: "PROPOSED" | "ACTIVE" | "ARCHIVED";
  grades: number[];
  classes: string[];
  tracks: ClubTrack[];
  audienceNote: string | null;
  proposedById: string | null;
  organizers: { teacher: string }[];
  slots: SlotRow[];
  _count: { members: number };
};

function toListRow(row: ListRow): ClubListRow {
  const { _count, ...rest } = row;
  return {
    ...rest,
    organizers: row.organizers.map((o) => o.teacher),
    slots: row.slots.map(toScheduleSlot),
    memberCount: _count.members,
  };
}

//! A JAVASLATOK CSAK AZ ÉRINTETTEKNEK. Az élő szakkörök mindenkié; a
//! javaslatot a javasló, a felkért tanár és az admin látja (`canSeeClub`).
//! Itt a lekérdezés szintjén szűrünk, hogy egy idegen javaslat még a
//! szerverről se induljon el a böngésző felé.
export async function listClubs(actor: Actor | null): Promise<ClubListRow[]> {
  const proposedVisible = actor?.isAdmin
    ? [{ status: "PROPOSED" as const }]
    : actor
      ? [
          { status: "PROPOSED" as const, proposedById: actor.userId },
          ...(actor.isTeacher && actor.teacher
            ? [
                {
                  status: "PROPOSED" as const,
                  organizers: { some: { teacher: actor.teacher } },
                },
              ]
            : []),
        ]
      : [];
  const rows = await prisma.club.findMany({
    where: { OR: [{ status: "ACTIVE" }, ...proposedVisible] },
    select: listSelect,
    orderBy: { name: "asc" },
  });
  return rows.map(toListRow);
}

export type ClubDetail = ClubListRow & {
  approvedByTeacher: string | null;
  confirmedAt: Date;
  members: { id: string; name: string; className: string | null }[];
  //* A versenyek, amikre ez a szakkör felkészít — a piszkozat nem hír.
  competitions: { slug: string; name: string; startsAt: Date }[];
};

export async function getClubDetail(slug: string): Promise<ClubDetail | null> {
  const row = await prisma.club.findUnique({
    where: { slug },
    select: {
      ...listSelect,
      approvedByTeacher: true,
      confirmedAt: true,
      members: {
        select: { user: { select: { id: true, name: true, class: true } } },
        orderBy: { joinedAt: "asc" },
      },
      competitions: {
        where: { status: { in: ["OPEN", "CLOSED", "FINISHED"] } },
        select: { slug: true, name: true, startsAt: true },
        orderBy: { startsAt: "desc" },
      },
    },
  });
  if (!row) return null;
  const { members, approvedByTeacher, confirmedAt, competitions, ...rest } =
    row;
  return {
    ...toListRow(rest),
    approvedByTeacher,
    confirmedAt,
    competitions,
    members: members.map((m) => ({
      id: m.user.id,
      name: m.user.name,
      className: m.user.class,
    })),
  };
}

//* ---------------------------------------------------------------------------
//* AZ ŰRLAP VÁLASZTÉKA
//* ---------------------------------------------------------------------------
//! A tanárt és a termet LISTÁBÓL választják, nem gépelik: egy elírt jel a
//! sémán átmenne, de soha egyetlen kártyára sem illeszkedne. A mentés ugyanezt
//! a két listát ellenőrzi (`checkAgainstSchool`, `szakkorok/actions.ts`).
export async function clubFormOptions(): Promise<{
  teachers: { short: string; name: string }[];
  rooms: { short: string; name: string }[];
}> {
  const [names, rooms] = await Promise.all([teacherNames(), loadRoomList()]);
  return {
    teachers: [...names.entries()]
      .map(([short, name]) => ({ short, name }))
      .sort((a, b) => a.name.localeCompare(b.name, "hu")),
    rooms: (rooms ?? [])
      .slice()
      .sort((a, b) => a.short.localeCompare(b.short, "hu", { numeric: true })),
  };
}
