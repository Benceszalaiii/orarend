"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/announcement-store";
import { announcementInput, parsePaths } from "@/lib/announcements";
import prisma from "@/lib/prisma";

//! MINDEN ACTION NYILVÁNOS VÉGPONT. Bárki POST-olhat rá, aki ismeri az
//! azonosítóját — a `requireAdmin` ezért nem formalitás, hanem AZ egyetlen kapu,
//! és minden függvény ELSŐ sora.

export type SaveState = { ok?: boolean; error?: string };

function parseDate(value: FormDataEntryValue | null): Date | null {
  if (typeof value !== "string" || value.length === 0) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function text(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value : "";
}

export async function saveAnnouncement(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  if (!(await requireAdmin())) return { error: "Nincs jogosultságod." };

  const parsed = announcementInput.safeParse({
    kind: text(formData.get("kind")),
    tone: text(formData.get("tone")),
    title: text(formData.get("title")),
    message: text(formData.get("message")),
    paths: parsePaths(text(formData.get("paths"))),
    active: formData.get("active") === "on",
    //* A böngésző ISO-ra (UTC) alakítva küldi — a `datetime-local` helyi ideje
    //* a szerveren más időzónában értelmeződne.
    startsAt: parseDate(formData.get("startsAt")),
    endsAt: parseDate(formData.get("endsAt")),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Érvénytelen adat." };
  }

  const id = text(formData.get("id"));
  if (id) {
    await prisma.announcement.update({ where: { id }, data: parsed.data });
  } else {
    await prisma.announcement.create({ data: parsed.data });
  }

  revalidatePath("/admin/kozlemenyek");
  return { ok: true };
}

export async function setAnnouncementActive(
  id: string,
  active: boolean,
): Promise<void> {
  if (!(await requireAdmin())) return;
  await prisma.announcement.update({ where: { id }, data: { active } });
  revalidatePath("/admin/kozlemenyek");
}

export async function deleteAnnouncement(id: string): Promise<void> {
  if (!(await requireAdmin())) return;
  await prisma.announcement.delete({ where: { id } });
  revalidatePath("/admin/kozlemenyek");
}
