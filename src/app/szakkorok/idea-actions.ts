"use server";

import { revalidatePath } from "next/cache";
import { canBrowseClubs, clubsLaunched } from "@/lib/club-access";
import { getIdea } from "@/lib/club-idea-store";
import {
  canHideIdea,
  canPostIdea,
  canVoteIdea,
  canWithdrawIdea,
  type IdeaInput,
  ideaInputSchema,
  ideaKey,
  MAX_OPEN_IDEAS_PER_AUTHOR,
} from "@/lib/club-ideas";
import { resolveActor } from "@/lib/club-store";
import prisma from "@/lib/prisma";

//! ═══════════════════════════════════════════════════════════════════════════
//! MIRE LENNE IGÉNY? — ÍRÁS
//! ═══════════════════════════════════════════════════════════════════════════
//! Ugyanaz az elv, mint a `szakkorok/actions.ts`-ben: minden action nyilvános
//! végpont, ezért mindegyik maga oldja fel, ki hívja, és maga kérdezi meg a
//! szabályokat (`club-ideas.ts`). A bevezetés előtt ugyanaz a kapu, mint a
//! lapon: diák nem ír oda, ahová még nem lát be.
//! ═══════════════════════════════════════════════════════════════════════════

export type IdeaActionResult =
  | { ok: true; merged?: boolean }
  | { ok: false; error: string };

const fail = (error: string): IdeaActionResult => ({ ok: false, error });

async function allowedActor() {
  const actor = await resolveActor();
  if (!actor) return null;
  return canBrowseClubs(actor, clubsLaunched()) ? actor : null;
}

function touched(): void {
  revalidatePath("/szakkorok");
}

//! A MÁSODIK FELÍRÁS SZAVAZAT. Ha ugyanez a téma már fent van, nem jön létre
//! második — a beküldő jelzése az elsőhöz kerül, és ezt a válasz meg is mondja.
export async function postIdea(input: IdeaInput): Promise<IdeaActionResult> {
  const actor = await allowedActor();
  if (!actor || !canPostIdea(actor)) return fail("Ehhez be kell lépned.");

  const parsed = ideaInputSchema.safeParse(input);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Érvénytelen ötlet.");
  }
  const key = ideaKey(parsed.data.title);

  const existing = await prisma.clubIdea.findUnique({
    where: { key },
    select: { id: true, hidden: true, clubId: true },
  });
  if (existing) {
    if (existing.hidden)
      return fail("Ezt a témát a tanárok levették a lapról.");
    if (existing.clubId) {
      return fail("Ebből a témából már szakkör lett — a listában megtalálod.");
    }
    await prisma.clubIdeaVote.upsert({
      where: { ideaId_userId: { ideaId: existing.id, userId: actor.userId } },
      create: { ideaId: existing.id, userId: actor.userId },
      update: {},
    });
    touched();
    return { ok: true, merged: true };
  }

  const open = await prisma.clubIdea.count({
    where: { authorId: actor.userId, clubId: null, hidden: false },
  });
  if (open >= MAX_OPEN_IDEAS_PER_AUTHOR) {
    return fail(
      `Egyszerre legfeljebb ${MAX_OPEN_IDEAS_PER_AUTHOR} nyitott ötleted lehet. Vonj vissza egyet, vagy várd meg, hogy valamelyikből szakkör legyen.`,
    );
  }

  try {
    await prisma.clubIdea.create({
      data: {
        key,
        title: parsed.data.title,
        note: parsed.data.note,
        authorId: actor.userId,
        //* A szerző az első, aki jelzi.
        votes: { create: { userId: actor.userId } },
      },
    });
  } catch {
    //* Két egyidejű felírás ugyanarra a kulcsra: a második elbukik az
    //* egyediségen. Ilyenkor a már létezőre szavazunk, mint fent.
    const race = await prisma.clubIdea.findUnique({
      where: { key },
      select: { id: true },
    });
    if (!race) return fail("Nem sikerült menteni. Próbáld újra.");
    await prisma.clubIdeaVote.upsert({
      where: { ideaId_userId: { ideaId: race.id, userId: actor.userId } },
      create: { ideaId: race.id, userId: actor.userId },
      update: {},
    });
    touched();
    return { ok: true, merged: true };
  }
  touched();
  return { ok: true };
}

export async function setIdeaVote(
  id: string,
  on: boolean,
): Promise<IdeaActionResult> {
  const actor = await allowedActor();
  if (!actor) return fail("Ehhez be kell lépned.");
  const idea = await getIdea(id);
  if (!idea) return fail("Nincs ilyen ötlet.");
  const ref = { ...idea, voteCount: idea._count.votes };
  if (!canVoteIdea(actor, ref))
    return fail("Erre az ötletre nem lehet jelezni.");

  if (on) {
    await prisma.clubIdeaVote.upsert({
      where: { ideaId_userId: { ideaId: id, userId: actor.userId } },
      create: { ideaId: id, userId: actor.userId },
      update: {},
    });
  } else {
    await prisma.clubIdeaVote.deleteMany({
      where: { ideaId: id, userId: actor.userId },
    });
  }
  touched();
  return { ok: true };
}

export async function withdrawIdea(id: string): Promise<IdeaActionResult> {
  const actor = await allowedActor();
  if (!actor) return fail("Ehhez be kell lépned.");
  const idea = await getIdea(id);
  if (!idea) return fail("Nincs ilyen ötlet.");
  if (!canWithdrawIdea(actor, { ...idea, voteCount: idea._count.votes })) {
    return fail(
      "Ezt az ötletet már mások is jelezték, ezért nem vonhatod vissza.",
    );
  }
  await prisma.clubIdea.delete({ where: { id } });
  touched();
  return { ok: true };
}

export async function hideIdea(id: string): Promise<IdeaActionResult> {
  const actor = await allowedActor();
  if (!canHideIdea(actor)) return fail("Ötletet tanár vagy admin vehet le.");
  await prisma.clubIdea.updateMany({ where: { id }, data: { hidden: true } });
  touched();
  return { ok: true };
}
