"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import {
  canBrowseClubs,
  canDeleteBoardItem,
  canWriteBoard,
  clubsLaunched,
} from "@/lib/club-access";
import {
  COMMENTS_PER_HOUR,
  commentBodySchema,
  POSTS_PER_HOUR,
  postBodySchema,
  postPushPayload,
} from "@/lib/club-board";
import { resolveActor } from "@/lib/club-store";
import prisma from "@/lib/prisma";
import { sendPush } from "@/lib/push-send";
import { clubSubscribersOf } from "@/lib/push-store";

//! ═══════════════════════════════════════════════════════════════════════════
//! A SZAKKÖR HÍRFOLYAMA — ÍRÁS
//! ═══════════════════════════════════════════════════════════════════════════
//! Ugyanaz az elv, mint a `szakkorok/actions.ts`-ben: minden action nyilvános
//! végpont, ezért mindegyik maga oldja fel, ki hívja, és maga kérdezi meg a
//! szabályokat (`club-access.ts`). A kliens csak a szakkör slugját, az elem
//! azonosítóját és a szöveget küldi — a szerzőt, a tagságot és a vezetést a
//! szerver tudja.
//! ═══════════════════════════════════════════════════════════════════════════

export type BoardActionResult = { ok: true } | { ok: false; error: string };

const fail = (error: string): BoardActionResult => ({ ok: false, error });
const HOUR_MS = 60 * 60 * 1000;

async function context(slug: string) {
  const actor = await resolveActor();
  if (!actor || !canBrowseClubs(actor, clubsLaunched())) return null;
  const club = await prisma.club.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      name: true,
      status: true,
      proposedById: true,
      organizers: { select: { teacher: true } },
      members: { where: { userId: actor.userId }, select: { userId: true } },
    },
  });
  if (!club) return null;
  return {
    actor,
    club: { ...club, organizers: club.organizers.map((o) => o.teacher) },
    isMember: club.members.length > 0,
  };
}

function touched(slug: string): void {
  revalidatePath(`/szakkorok/${slug}`);
}

export async function createPost(
  slug: string,
  body: string,
  //* A szerző saját készülékének push-címe, ha van — neki nem szólunk a
  //* saját bejegyzéséről. Csak szűrésre kell, nem tároljuk.
  ownEndpoint: string | null,
): Promise<BoardActionResult> {
  const ctx = await context(slug);
  if (!ctx) return fail("Ehhez be kell lépned.");
  const { actor, club, isMember } = ctx;
  if (!canWriteBoard(actor, club, isMember)) {
    return fail("Ide a szakkör tagjai és vezetői írhatnak.");
  }
  const parsed = postBodySchema.safeParse(body);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Érvénytelen bejegyzés.");
  }
  const recent = await prisma.clubPost.count({
    where: {
      authorId: actor.userId,
      createdAt: { gte: new Date(Date.now() - HOUR_MS) },
    },
  });
  if (recent >= POSTS_PER_HOUR) {
    return fail("Egy órán belül ennyi bejegyzés elég — próbáld kicsit később.");
  }

  const post = await prisma.clubPost.create({
    data: { clubId: club.id, authorId: actor.userId, body: parsed.data },
    select: { id: true },
  });
  touched(slug);

  //! A PUSH A VÁLASZ UTÁN MEGY. A szerző ne várjon arra, hogy húsz készülék
  //! szolgáltatója válaszoljon; és ha a küldés elbukik, a bejegyzés attól még
  //! fent van.
  const byLeader =
    actor.teacher !== null && club.organizers.includes(actor.teacher);
  const endpoint =
    typeof ownEndpoint === "string" && ownEndpoint.length <= 2048
      ? ownEndpoint
      : null;
  after(async () => {
    try {
      const subscribers = (await clubSubscribersOf(club.slug)).filter(
        (s) => s.endpoint !== endpoint,
      );
      await sendPush(subscribers, postPushPayload(club, byLeader, post.id));
    } catch (err) {
      console.error("[orarend] A hírfolyam-értesítés nem ment ki", err);
    }
  });
  return { ok: true };
}

export async function createComment(
  slug: string,
  postId: string,
  body: string,
): Promise<BoardActionResult> {
  const ctx = await context(slug);
  if (!ctx) return fail("Ehhez be kell lépned.");
  const { actor, club, isMember } = ctx;
  if (!canWriteBoard(actor, club, isMember)) {
    return fail("Ide a szakkör tagjai és vezetői írhatnak.");
  }
  const parsed = commentBodySchema.safeParse(body);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Érvénytelen hozzászólás.");
  }
  //! A BEJEGYZÉSNEK EBBEN A SZAKKÖRBEN KELL LENNIE — különben egy idegen
  //! szakkör szálába is lehetne írni a saját tagságunkkal.
  const post = await prisma.clubPost.findFirst({
    where: { id: postId, clubId: club.id },
    select: { id: true },
  });
  if (!post) return fail("Ez a bejegyzés már nincs meg.");
  const recent = await prisma.clubComment.count({
    where: {
      authorId: actor.userId,
      createdAt: { gte: new Date(Date.now() - HOUR_MS) },
    },
  });
  if (recent >= COMMENTS_PER_HOUR) {
    return fail("Egy órán belül ennyi hozzászólás elég — próbáld később.");
  }
  await prisma.clubComment.create({
    data: { postId: post.id, authorId: actor.userId, body: parsed.data },
  });
  touched(slug);
  return { ok: true };
}

export async function deletePost(
  slug: string,
  postId: string,
): Promise<BoardActionResult> {
  const ctx = await context(slug);
  if (!ctx) return fail("Ehhez be kell lépned.");
  const post = await prisma.clubPost.findFirst({
    where: { id: postId, clubId: ctx.club.id },
    select: { id: true, authorId: true },
  });
  if (!post) return { ok: true };
  if (!canDeleteBoardItem(ctx.actor, ctx.club, post.authorId)) {
    return fail("Ezt nem törölheted.");
  }
  //* A hozzászólások a bejegyzéssel együtt mennek (`onDelete: Cascade`).
  await prisma.clubPost.delete({ where: { id: post.id } });
  touched(slug);
  return { ok: true };
}

export async function deleteComment(
  slug: string,
  commentId: string,
): Promise<BoardActionResult> {
  const ctx = await context(slug);
  if (!ctx) return fail("Ehhez be kell lépned.");
  const comment = await prisma.clubComment.findFirst({
    where: { id: commentId, post: { clubId: ctx.club.id } },
    select: { id: true, authorId: true },
  });
  if (!comment) return { ok: true };
  if (!canDeleteBoardItem(ctx.actor, ctx.club, comment.authorId)) {
    return fail("Ezt nem törölheted.");
  }
  await prisma.clubComment.delete({ where: { id: comment.id } });
  touched(slug);
  return { ok: true };
}
