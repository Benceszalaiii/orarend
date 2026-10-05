"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/announcement-store";
import { invalidateLiveCompetitions } from "@/lib/competition-store";
import prisma from "@/lib/prisma";

//! ═══════════════════════════════════════════════════════════════════════════
//! ÜZEMELTETŐI PULT — VERSENYEK
//! ═══════════════════════════════════════════════════════════════════════════
//! MINDEN ACTION NYILVÁNOS VÉGPONT — a `requireAdmin` minden függvény ELSŐ
//! sora. Az állapotváltás a `versenyek/actions.ts`-ben él (az admin a
//! `canManageCompetition` szerint bármelyik versenyt kezelheti); itt csak az
//! van, amit a verseny lapja nem kínál.
//! ═══════════════════════════════════════════════════════════════════════════

export type AdminResult = { ok: true } | { ok: false; error: string };

const DENIED: AdminResult = { ok: false, error: "Nincs jogosultságod." };

function isId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 200;
}

function touched(slug: string): void {
  invalidateLiveCompetitions();
  revalidatePath("/admin/versenyek");
  revalidatePath("/versenyek");
  revalidatePath(`/versenyek/${slug}`);
}

//! A MEGHIRDETETT VERSENY IS TÖRÖLHETŐ — DE CSAK INNEN. A szervező a lapon
//! csak a piszkozatát törölheti; ami már kint volt, az „Elmarad" lesz. A
//! tévesen felvitt, duplikált vagy nem odavaló versenyt viszont valakinek el
//! kell tudnia tüntetni: ez az üzemeltető. A nevezések és az eredmények vele
//! mennek (`Cascade`) — a pult ezt a megerősítésben ki is mondja.
export async function deleteCompetition(slug: string): Promise<AdminResult> {
  if (!(await requireAdmin())) return DENIED;
  if (!isId(slug)) return { ok: false, error: "Nincs ilyen verseny." };
  const { count } = await prisma.competition.deleteMany({ where: { slug } });
  if (count === 0) return { ok: false, error: "Nincs ilyen verseny." };
  touched(slug);
  return { ok: true };
}

//! NEVEZÉS TÖRLÉSE. A diák a határidőig maga visszaléphet; utána, vagy ha a
//! nevezés nem odavaló (rossz fiók, tréfa), az üzemeltető veszi le. A
//! nevezés nyilvános, ezért ez moderálás is.
export async function removeEntry(
  competitionId: string,
  userId: string,
): Promise<AdminResult> {
  if (!(await requireAdmin())) return DENIED;
  if (!isId(competitionId) || !isId(userId)) {
    return { ok: false, error: "Nincs ilyen nevezés." };
  }
  const competition = await prisma.competition.findUnique({
    where: { id: competitionId },
    select: { slug: true },
  });
  if (!competition) return { ok: false, error: "Nincs ilyen verseny." };
  await prisma.competitionEntry.deleteMany({
    where: { competitionId, userId },
  });
  touched(competition.slug);
  return { ok: true };
}
