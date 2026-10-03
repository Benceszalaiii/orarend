import "server-only";

import prisma from "./prisma";

//! ═══════════════════════════════════════════════════════════════════════════
//! A SZAKKÖR HÍRFOLYAMA — OLVASÁS
//! ═══════════════════════════════════════════════════════════════════════════
//! Az írás a Server Actionökben él (`szakkorok/[slug]/board-actions.ts`), a
//! jogok a `club-access.ts`-ben. Ez a modul NEM kérdezi meg, ki olvas: a lap
//! csak akkor hívja, ha a `canReadBoard` már igent mondott.
//! ═══════════════════════════════════════════════════════════════════════════

export type BoardAuthor = {
  id: string;
  name: string;
  //* A diák osztálya a név mellé — tanárnál `null`.
  className: string | null;
  teacher: boolean;
};

export type BoardComment = {
  id: string;
  body: string;
  createdAt: Date;
  author: BoardAuthor;
};

export type BoardPost = BoardComment & { comments: BoardComment[] };

//! A SZERZŐBŐL CSAK A NÉV ÉS AZ OSZTÁLY MEGY KI — ugyanaz, ami a nyilvános
//! taglistán is áll. Se felhasználónév, se e-mail, se fiókazonosító a
//! böngésző felé (az azonosító csak a saját bejegyzés felismeréséhez kell,
//! és a lap szerveroldalon dönt vele).
const authorSelect = {
  id: true,
  name: true,
  class: true,
  isTeacher: true,
} as const;

type AuthorRow = {
  id: string;
  name: string;
  class: string | null;
  isTeacher: boolean;
};

function toAuthor(row: AuthorRow): BoardAuthor {
  return {
    id: row.id,
    name: row.name,
    className: row.isTeacher ? null : row.class,
    teacher: row.isTeacher,
  };
}

//* Egy bejegyzés alá legfeljebb ennyi hozzászólás töltődik — egy élő
//* beszélgetésnek bőven elég, egy elszabadult szálat pedig nem húz be egészben.
const COMMENTS_PER_POST = 200;

export async function loadBoard(
  clubId: string,
  limit: number,
): Promise<{ posts: BoardPost[]; more: boolean }> {
  const rows = await prisma.clubPost.findMany({
    where: { clubId },
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    select: {
      id: true,
      body: true,
      createdAt: true,
      author: { select: authorSelect },
      comments: {
        orderBy: { createdAt: "asc" },
        take: COMMENTS_PER_POST,
        select: {
          id: true,
          body: true,
          createdAt: true,
          author: { select: authorSelect },
        },
      },
    },
  });
  return {
    more: rows.length > limit,
    posts: rows.slice(0, limit).map((row) => ({
      id: row.id,
      body: row.body,
      createdAt: row.createdAt,
      author: toAuthor(row.author),
      comments: row.comments.map((c) => ({
        id: c.id,
        body: c.body,
        createdAt: c.createdAt,
        author: toAuthor(c.author),
      })),
    })),
  };
}

//* Az író-kártya avatarjához: a néző saját neve (az `Actor` nem hordozza).
export async function boardViewerName(userId: string): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true },
  });
  return user?.name ?? "";
}
