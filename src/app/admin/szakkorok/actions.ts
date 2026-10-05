"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/announcement-store";
import { invalidateScheduleClubs } from "@/lib/club-store";
import prisma from "@/lib/prisma";

//! ═══════════════════════════════════════════════════════════════════════════
//! ÜZEMELTETŐI PULT — SZAKKÖRÖK
//! ═══════════════════════════════════════════════════════════════════════════
//! MINDEN ACTION NYILVÁNOS VÉGPONT. Bárki POST-olhat rá, aki ismeri az
//! azonosítóját — a `requireAdmin` ezért nem formalitás, hanem AZ egyetlen
//! kapu, és minden függvény ELSŐ sora.
//*
//! CSAK AZ VAN ITT, AMI A SZAKKÖR LAPJÁN NINCS. A jóváhagyás, az elutasítás és
//! a lezárás a `szakkorok/actions.ts`-ben él, a hírfolyam törlése a
//! `board-actions.ts`-ben — a pult azokat hívja, mert az admin a
//! `club-access.ts` szerint ott is mindent megtehet. Két külön írási út
//! ugyanarra két külön hibát jelentene.
//! ═══════════════════════════════════════════════════════════════════════════

export type AdminResult = { ok: true } | { ok: false; error: string };

const DENIED: AdminResult = { ok: false, error: "Nincs jogosultságod." };

//* Az azonosító a kérésből jön, tehát bármi lehet — a Prisma egy nem-szövegen
//* érthetetlen hibát dobna.
function isId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 200;
}

function touched(slug?: string): void {
  invalidateScheduleClubs();
  revalidatePath("/admin/szakkorok");
  revalidatePath("/szakkorok");
  if (slug) revalidatePath(`/szakkorok/${slug}`);
}

//! A MEGSZŰNT SZAKKÖR VISSZAHOZHATÓ. A lezárás a szakkör lapján egy kattintás;
//! ha tévedés volt, vagy a szakkör a következő félévben újraindul, ne kelljen
//! újra felvinni (és a tagság se vesszen el).
export async function restoreClub(slug: string): Promise<AdminResult> {
  if (!(await requireAdmin())) return DENIED;
  if (!isId(slug)) return { ok: false, error: "Nincs ilyen szakkör." };
  const { count } = await prisma.club.updateMany({
    where: { slug, status: "ARCHIVED" },
    data: { status: "ACTIVE", confirmedAt: new Date() },
  });
  if (count === 0) return { ok: false, error: "Nincs ilyen megszűnt szakkör." };
  touched(slug);
  return { ok: true };
}

//! A VÉGLEGES TÖRLÉS AZ ÜZEMELTETŐÉ, ÉS CSAK NEKI. A tanár lezárhat, a javasló
//! visszavonhat; a tévesen felvitt, duplikált vagy nem odavaló szakkört
//! viszont csak innen lehet eltüntetni. A tagság, az időpontok és a hírfolyam
//! vele megy (`Cascade`); az ötlet megmarad, csak elveszti a szakkörét.
export async function deleteClub(slug: string): Promise<AdminResult> {
  if (!(await requireAdmin())) return DENIED;
  if (!isId(slug)) return { ok: false, error: "Nincs ilyen szakkör." };
  const { count } = await prisma.club.deleteMany({ where: { slug } });
  if (count === 0) return { ok: false, error: "Nincs ilyen szakkör." };
  touched(slug);
  return { ok: true };
}

//! TAG ELTÁVOLÍTÁSA. A tagság nyilvános (a szakkör lapján látszik), ezért egy
//! oda nem való jelentkezés — tréfa, rossz fiók — moderálandó tartalom.
export async function removeClubMember(
  clubId: string,
  userId: string,
): Promise<AdminResult> {
  if (!(await requireAdmin())) return DENIED;
  if (!isId(clubId) || !isId(userId)) {
    return { ok: false, error: "Nincs ilyen tag." };
  }
  const club = await prisma.club.findUnique({
    where: { id: clubId },
    select: { slug: true },
  });
  if (!club) return { ok: false, error: "Nincs ilyen szakkör." };
  await prisma.clubMember.deleteMany({ where: { clubId, userId } });
  touched(club.slug);
  return { ok: true };
}

//! AZ ELREJTÉS VISSZAVONHATÓ. A tanár a szakkörlapon elrejthet egy ötletet, de
//! visszahozni onnan nem tudja — egy elkattintott rejtés így örökre eltüntetne
//! egy jogos igényt. Az elrejtés a kulcsot és a szavazatokat megtartja.
export async function setIdeaHidden(
  id: string,
  hidden: boolean,
): Promise<AdminResult> {
  if (!(await requireAdmin())) return DENIED;
  if (!isId(id) || typeof hidden !== "boolean") {
    return { ok: false, error: "Nincs ilyen ötlet." };
  }
  await prisma.clubIdea.updateMany({ where: { id }, data: { hidden } });
  touched();
  return { ok: true };
}

//! A TÖRLÉS A KULCSOT IS VISZI. Elrejtve ugyanaz a szöveg nem kerülhet fel
//! újra; törölve igen. Ezért a sértő tartalomra az elrejtés a jó válasz, a
//! törlés a tévesen felvitt, üres vagy duplikált ötleté.
export async function deleteIdea(id: string): Promise<AdminResult> {
  if (!(await requireAdmin())) return DENIED;
  if (!isId(id)) return { ok: false, error: "Nincs ilyen ötlet." };
  await prisma.clubIdea.deleteMany({ where: { id } });
  touched();
  return { ok: true };
}
