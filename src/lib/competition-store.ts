import "server-only";

import type { Actor } from "./club-access";
import type {
  CompetitionCategory,
  CompetitionStatus,
  CompetitionVenue,
} from "./competitions";
import prisma from "./prisma";

//! ═══════════════════════════════════════════════════════════════════════════
//! VERSENYEK — SZERVEROLDAL, OLVASÁS
//! ═══════════════════════════════════════════════════════════════════════════
//! Az írás a Server Actionökben él (`src/app/versenyek/actions.ts`), a
//! jogszabályok a `club-access.ts`-ben. Ugyanaz az elv, mint a szakköröknél: az
//! adatbázis hiánya nem viheti el az órarendet — a `/ma` határidő-panelje és a
//! háttérfeladat ilyenkor üres listát kap.
//! ═══════════════════════════════════════════════════════════════════════════

export type CompetitionRow = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  category: CompetitionCategory;
  status: CompetitionStatus;
  externalUrl: string | null;
  venue: CompetitionVenue;
  room: string | null;
  location: string | null;
  startsAt: Date;
  endsAt: Date | null;
  registrationDeadline: Date | null;
  grades: number[];
  classes: string[];
  capacity: number | null;
  teachers: string[];
  createdById: string | null;
  entryCount: number;
};

const rowSelect = {
  id: true,
  slug: true,
  name: true,
  description: true,
  category: true,
  status: true,
  externalUrl: true,
  venue: true,
  room: true,
  location: true,
  startsAt: true,
  endsAt: true,
  registrationDeadline: true,
  grades: true,
  classes: true,
  capacity: true,
  teachers: true,
  createdById: true,
  _count: { select: { entries: true } },
} as const;

function toRow<T extends { _count: { entries: number } }>(
  row: T,
): Omit<T, "_count"> & { entryCount: number } {
  const { _count, ...rest } = row;
  return { ...rest, entryCount: _count.entries };
}

//! A PISZKOZATOK CSAK A SZERVEZŐIKNEK — a lekérdezés szintjén szűrve, mint a
//! szakkör-javaslatok (`listClubs`): egy idegen piszkozat a szerverről se
//! induljon el a böngésző felé.
export async function listCompetitions(
  actor: Actor | null,
): Promise<CompetitionRow[]> {
  const drafts = actor?.isAdmin
    ? [{ status: "DRAFT" as const }]
    : actor
      ? [
          { status: "DRAFT" as const, createdById: actor.userId },
          ...(actor.isTeacher && actor.teacher
            ? [{ status: "DRAFT" as const, teachers: { has: actor.teacher } }]
            : []),
        ]
      : [];
  const rows = await prisma.competition.findMany({
    where: { OR: [{ status: { not: "DRAFT" } }, ...drafts] },
    select: rowSelect,
    orderBy: { startsAt: "asc" },
  });
  return rows.map(toRow);
}

export type CompetitionDetail = CompetitionRow & {
  phases: {
    id: string;
    title: string;
    startsAt: Date | null;
    endsAt: Date | null;
  }[];
  entries: {
    userId: string;
    name: string;
    className: string | null;
    rank: number | null;
    award: string | null;
    points: number | null;
  }[];
  clubs: { slug: string; name: string }[];
};

export async function getCompetitionDetail(
  slug: string,
): Promise<CompetitionDetail | null> {
  const row = await prisma.competition.findUnique({
    where: { slug },
    select: {
      ...rowSelect,
      phases: {
        select: { id: true, title: true, startsAt: true, endsAt: true },
        orderBy: { order: "asc" },
      },
      entries: {
        select: {
          rank: true,
          award: true,
          points: true,
          user: { select: { id: true, name: true, class: true } },
        },
        orderBy: { createdAt: "asc" },
      },
      clubs: {
        where: { status: "ACTIVE" },
        select: { slug: true, name: true },
      },
    },
  });
  if (!row) return null;
  const { phases, entries, clubs, ...rest } = row;
  return {
    ...toRow(rest),
    phases,
    entries: entries.map((e) => ({
      userId: e.user.id,
      name: e.user.name,
      className: e.user.class,
      rank: e.rank,
      award: e.award,
      points: e.points,
    })),
    clubs,
  };
}

//* ---------------------------------------------------------------------------
//* AZ ÉLŐ VERSENYEK — HATÁRIDŐ-PANEL, ÉRTESÍTÉS
//* ---------------------------------------------------------------------------
//! EGY PERCIG A MEMÓRIÁBAN, mint a szakkörök illesztési listája: a `/ma`
//! minden megnyitása kérdezi, egy adatbázis-kör ott túl drága.
const LIVE_TTL_MS = 60_000;
let liveCache: { at: number; rows: CompetitionRow[] } | null = null;

export function invalidateLiveCompetitions(): void {
  liveCache = null;
}

export async function loadLiveCompetitions(): Promise<CompetitionRow[]> {
  if (!process.env.DB_URL) return [];
  if (liveCache && Date.now() - liveCache.at < LIVE_TTL_MS) {
    return liveCache.rows;
  }
  try {
    const rows = (
      await prisma.competition.findMany({
        where: { status: { in: ["OPEN", "CLOSED"] } },
        select: rowSelect,
        orderBy: { startsAt: "asc" },
      })
    ).map(toRow);
    liveCache = { at: Date.now(), rows };
    return rows;
  } catch (err) {
    console.error("[orarend] A versenyek betöltése nem sikerült", err);
    return liveCache?.rows ?? [];
  }
}

//* A versenyhez kötött felkészítő szakkörök választéka az űrlaphoz.
export async function clubChoices(): Promise<{ slug: string; name: string }[]> {
  return prisma.club.findMany({
    where: { status: "ACTIVE" },
    select: { slug: true, name: true },
    orderBy: { name: "asc" },
  });
}
