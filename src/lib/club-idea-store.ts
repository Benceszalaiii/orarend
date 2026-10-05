import "server-only";

import type { Actor } from "./club-access";
import { sortIdeas } from "./club-ideas";
import prisma from "./prisma";

//! ═══════════════════════════════════════════════════════════════════════════
//! MIRE LENNE IGÉNY? — OLVASÁS
//! ═══════════════════════════════════════════════════════════════════════════
//! A böngészőbe csak a szám megy, a szavazók NEVE soha — és a szerzőé sem.
//! Hogy a néző maga jelezte-e, illetve ő írta-e, azt egy-egy igaz/hamis mondja
//! meg; ebből a gombok állapota kijön, más diákról semmi nem derül ki.
//! ═══════════════════════════════════════════════════════════════════════════

export type IdeaRow = {
  id: string;
  title: string;
  note: string | null;
  voteCount: number;
  createdAt: Date;
  clubId: string | null;
  //* Csak az élő szakkör hír; a javaslat (PROPOSED) még nem.
  club: { slug: string; name: string } | null;
  mine: boolean;
  voted: boolean;
};

export async function listIdeas(actor: Actor | null): Promise<IdeaRow[]> {
  if (!process.env.DB_URL) return [];
  try {
    const rows = await prisma.clubIdea.findMany({
      where: { hidden: false },
      select: {
        id: true,
        title: true,
        note: true,
        createdAt: true,
        clubId: true,
        authorId: true,
        club: { select: { slug: true, name: true, status: true } },
        _count: { select: { votes: true } },
        votes: actor
          ? { where: { userId: actor.userId }, select: { userId: true } }
          : false,
      },
      //* Felső határ: a lap a keresettebbeket mutatja, nem az archívumot.
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return sortIdeas(
      rows.map((row) => ({
        id: row.id,
        title: row.title,
        note: row.note,
        voteCount: row._count.votes,
        createdAt: row.createdAt,
        clubId: row.clubId,
        club:
          row.club && row.club.status === "ACTIVE"
            ? { slug: row.club.slug, name: row.club.name }
            : null,
        mine: actor !== null && row.authorId === actor.userId,
        voted: Array.isArray(row.votes) && row.votes.length > 0,
      })),
    );
  } catch (err) {
    //! Az ötletlap hiánya nem viheti el a szakkörlistát.
    console.error("[orarend] Az ötletek betöltése nem sikerült", err);
    return [];
  }
}

export async function getIdea(id: string) {
  if (!process.env.DB_URL) return null;
  return prisma.clubIdea.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      note: true,
      hidden: true,
      clubId: true,
      authorId: true,
      _count: { select: { votes: true } },
    },
  });
}
