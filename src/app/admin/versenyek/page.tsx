import type { Metadata } from "next";
import { contestAttention } from "@/lib/admin-content";
import { requireAdmin } from "@/lib/announcement-store";
import { teacherNames } from "@/lib/club-store";
import prisma from "@/lib/prisma";
import { AccessDenied } from "../_components/access-denied";
import { StatTile } from "../_components/stat-tile";
import { type AdminContestRow, ContestManager } from "./contest-manager";

export const metadata: Metadata = {
  title: "Versenyek – Üzemeltetés – Jedlik Info",
  robots: { index: false, follow: false },
};

//! MINDIG FRISS: a munkamenettől függ, mit lát a látogató.
export const dynamic = "force-dynamic";

export default async function AdminContestsPage() {
  if (!(await requireAdmin())) return <AccessDenied next="/admin/versenyek" />;

  const now = new Date();
  const [contests, names] = await Promise.all([
    prisma.competition.findMany({
      //* A legközelebbi elöl — a múltbeliek a lista végén, a legfrissebb előbb.
      orderBy: { startsAt: "desc" },
      select: {
        id: true,
        slug: true,
        name: true,
        category: true,
        status: true,
        startsAt: true,
        endsAt: true,
        registrationDeadline: true,
        capacity: true,
        teachers: true,
        createdAt: true,
        createdBy: { select: { name: true } },
        entries: {
          orderBy: { createdAt: "asc" },
          select: {
            createdAt: true,
            rank: true,
            award: true,
            user: {
              select: { id: true, name: true, class: true },
            },
          },
        },
      },
    }),
    teacherNames(),
  ]);

  const rows: AdminContestRow[] = contests.map((c) => ({
    id: c.id,
    slug: c.slug,
    name: c.name,
    category: c.category,
    status: c.status,
    startsAt: c.startsAt.toISOString(),
    registrationDeadline: c.registrationDeadline?.toISOString() ?? null,
    capacity: c.capacity,
    attention: contestAttention(c, now),
    createdBy: c.createdBy?.name ?? null,
    teachers: c.teachers.map((short) => ({
      short,
      name: names.get(short) ?? null,
    })),
    entries: c.entries.map((e) => ({
      userId: e.user.id,
      name: e.user.name,
      class: e.user.class,
      createdAt: e.createdAt.toISOString(),
      rank: e.rank,
      award: e.award,
    })),
  }));

  const count = (status: AdminContestRow["status"]) =>
    rows.filter((r) => r.status === status).length;
  const attention = rows.filter((r) => r.attention !== null).length;

  return (
    <main className="mt-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatTile label="Piszkozat" value={count("DRAFT")} />
        <StatTile label="Nevezés nyitva" value={count("OPEN")} />
        <StatTile label="Nevezés lezárva" value={count("CLOSED")} />
        <StatTile label="Lezajlott" value={count("FINISHED")} />
        <StatTile
          label="Nevezés összesen"
          value={rows.reduce((sum, r) => sum + r.entries.length, 0)}
        />
        <StatTile
          label="Lépésre vár"
          value={attention}
          highlight={attention > 0}
        />
      </div>

      <ContestManager rows={rows} />
    </main>
  );
}
