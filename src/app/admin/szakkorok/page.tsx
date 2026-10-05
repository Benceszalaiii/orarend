import type { Metadata } from "next";
import { isStaleClub } from "@/lib/admin-content";
import { requireAdmin } from "@/lib/announcement-store";
import { teacherNames } from "@/lib/club-store";
import prisma from "@/lib/prisma";
import { AccessDenied } from "../_components/access-denied";
import { StatTile } from "../_components/stat-tile";
import { type AdminClubRow, ClubManager } from "./club-manager";
import {
  type AdminBoardItem,
  type AdminIdeaRow,
  ClubModeration,
} from "./club-moderation";

export const metadata: Metadata = {
  title: "Szakkörök – Üzemeltetés – Jedlik Info",
  robots: { index: false, follow: false },
};

//! MINDIG FRISS: a munkamenettől függ, mit lát a látogató.
export const dynamic = "force-dynamic";

//* A hírfolyamból ennyi friss elem jut a pultra. Moderáláshoz a legújabbak
//* kellenek; a régit a szakkör lapján lehet visszanézni.
const BOARD_LIMIT = 40;

export default async function AdminClubsPage() {
  if (!(await requireAdmin())) return <AccessDenied next="/admin/szakkorok" />;

  const now = new Date();
  const [clubs, names, ideas, posts, comments] = await Promise.all([
    prisma.club.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        slug: true,
        name: true,
        kind: true,
        status: true,
        createdAt: true,
        confirmedAt: true,
        organizers: {
          select: { teacher: true },
          orderBy: [{ lead: "desc" }, { teacher: "asc" }],
        },
        slots: { select: { source: true } },
        members: {
          orderBy: { joinedAt: "desc" },
          select: {
            joinedAt: true,
            user: {
              select: { id: true, name: true, class: true, isTeacher: true },
            },
          },
        },
        _count: { select: { posts: true } },
      },
    }),
    teacherNames(),
    prisma.clubIdea.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        title: true,
        note: true,
        hidden: true,
        createdAt: true,
        club: { select: { slug: true, name: true } },
        _count: { select: { votes: true } },
      },
    }),
    prisma.clubPost.findMany({
      orderBy: { createdAt: "desc" },
      take: BOARD_LIMIT,
      select: {
        id: true,
        body: true,
        createdAt: true,
        author: { select: { name: true, class: true } },
        club: { select: { slug: true, name: true } },
        _count: { select: { comments: true } },
      },
    }),
    prisma.clubComment.findMany({
      orderBy: { createdAt: "desc" },
      take: BOARD_LIMIT,
      select: {
        id: true,
        body: true,
        createdAt: true,
        author: { select: { name: true, class: true } },
        post: { select: { club: { select: { slug: true, name: true } } } },
      },
    }),
  ]);

  const rows: AdminClubRow[] = clubs.map((c) => ({
    id: c.id,
    slug: c.slug,
    name: c.name,
    kind: c.kind,
    status: c.status,
    createdAt: c.createdAt.toISOString(),
    confirmedAt: c.confirmedAt.toISOString(),
    stale: isStaleClub(c, now),
    organizers: c.organizers.map((o) => ({
      short: o.teacher,
      name: names.get(o.teacher) ?? null,
    })),
    hasSlots: c.slots.length > 0,
    postCount: c._count.posts,
    members: c.members.map((m) => ({
      userId: m.user.id,
      name: m.user.name,
      class: m.user.class,
      isTeacher: m.user.isTeacher,
      joinedAt: m.joinedAt.toISOString(),
    })),
  }));

  const ideaRows: AdminIdeaRow[] = ideas.map((i) => ({
    id: i.id,
    title: i.title,
    note: i.note,
    hidden: i.hidden,
    createdAt: i.createdAt.toISOString(),
    club: i.club,
    voteCount: i._count.votes,
  }));

  //* Bejegyzés és hozzászólás egy idővonalon: a moderátor azt kérdezi, mi
  //* került ki MOSTANÁBAN, nem azt, hogy melyik táblába.
  const board: AdminBoardItem[] = [
    ...posts.map((p) => ({
      kind: "post" as const,
      id: p.id,
      body: p.body,
      createdAt: p.createdAt.toISOString(),
      author: [p.author.name, p.author.class].filter(Boolean).join(", "),
      club: p.club,
      commentCount: p._count.comments,
    })),
    ...comments.map((c) => ({
      kind: "comment" as const,
      id: c.id,
      body: c.body,
      createdAt: c.createdAt.toISOString(),
      author: [c.author.name, c.author.class].filter(Boolean).join(", "),
      club: c.post.club,
      commentCount: 0,
    })),
  ]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, BOARD_LIMIT);

  const count = (status: AdminClubRow["status"]) =>
    rows.filter((r) => r.status === status).length;

  return (
    <main className="mt-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatTile label="Élő szakkör" value={count("ACTIVE")} />
        <StatTile
          label="Jóváhagyásra vár"
          value={count("PROPOSED")}
          highlight={count("PROPOSED") > 0}
        />
        <StatTile label="Megszűnt" value={count("ARCHIVED")} />
        <StatTile
          label="Tagság"
          value={rows.reduce((sum, r) => sum + r.members.length, 0)}
        />
        <StatTile
          label="Megerősítésre vár"
          value={rows.filter((r) => r.stale).length}
        />
        <StatTile
          label="Rejtett ötlet"
          value={ideaRows.filter((i) => i.hidden).length}
        />
      </div>

      <ClubManager rows={rows} />
      <ClubModeration ideas={ideaRows} board={board} />
    </main>
  );
}
