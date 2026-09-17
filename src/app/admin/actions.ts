"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/announcement-store";
import { isKnownClass, looksLikeClass } from "@/lib/known-class";
import prisma from "@/lib/prisma";
import { loadTeacherDirectory } from "@/lib/teacher-directory";

//! MINDEN ACTION NYILVÁNOS VÉGPONT. Bárki POST-olhat rá, aki ismeri az
//! azonosítóját — a `requireAdmin` ezért nem formalitás, hanem AZ egyetlen kapu,
//! és minden függvény ELSŐ sora.

export type UserSaveState = { ok?: boolean; error?: string; savedAt?: number };

function text(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function updateUser(
  _prev: UserSaveState,
  formData: FormData,
): Promise<UserSaveState> {
  const actor = await requireAdmin();
  if (!actor) return { error: "Nincs jogosultságod." };

  const id = text(formData.get("id"));
  const target = id
    ? await prisma.user.findUnique({
        where: { id },
        select: { id: true, role: true, isAdmin: true },
      })
    : null;
  if (!target) return { error: "A felhasználó nem található." };

  //* ─── Osztály ────────────────────────────────────────────────────────────
  //! Szabad szöveg nem kerül a mezőbe: ugyanaz a határ, mint a statisztikánál
  //! és az értesítéseknél (`known-class.ts`).
  const rawClass = text(formData.get("class")).toLocaleUpperCase("hu");
  let klass: string | null = null;
  if (rawClass) {
    if (!looksLikeClass(rawClass) || !(await isKnownClass(rawClass))) {
      return { error: `Ismeretlen osztály: ${rawClass}` };
    }
    klass = rawClass;
  }

  //* ─── Tanárnév ───────────────────────────────────────────────────────────
  //! A NÉV A JEDLIKINFO LISTÁBÓL JÖHET, BETŰRE PONTOSAN. A `teacherName` dönti
  //! el, melyik tanári órarend és feed a fiók sajátja — egy elírt név rossz
  //! jogot adna. Ha a lista nem érhető el, nem mentünk vakon.
  const rawTeacher = text(formData.get("teacherName"));
  let teacherName: string | null = null;
  if (rawTeacher) {
    const directory = await loadTeacherDirectory();
    if (!directory) {
      return {
        error: "A tanárlista most nem érhető el — próbáld újra később.",
      };
    }
    if (!directory.some((t) => t.name === rawTeacher)) {
      return { error: `Nincs ilyen tanár a listában: ${rawTeacher}` };
    }
    teacherName = rawTeacher;
  }

  //* Tanárnévvel a fiók mindenképp tanár — a kettő nem mondhat ellent.
  const isTeacher = teacherName !== null || formData.get("isTeacher") === "on";
  const isAdmin = formData.get("isAdmin") === "on";
  const identityLocked = formData.get("identityLocked") === "on";

  //! A SAJÁT ÜZEMELTETŐI JOGOT NEM LEHET ITT ELVENNI. Egy elkattintott pipa
  //! különben kizárná az utolsó üzemeltetőt a saját pultjából.
  if (target.id === actor.id && !isAdmin) {
    return { error: "A saját üzemeltetői jogodat nem veheted el." };
  }

  //! A `role: "admin"` TÖBB, MINT AZ `isAdmin`: megszemélyesítést és
  //! jelszóállítást nyit az `/api/auth/admin/*` alatt (lásd `auth.ts`). Ezt
  //! csak az adhatja vagy veheti el, akinek MAGÁNAK is megvan.
  const wantsRoleAdmin = formData.get("roleAdmin") === "on";
  const hasRoleAdmin = target.role === "admin";
  let role = target.role;
  if (wantsRoleAdmin !== hasRoleAdmin) {
    if (actor.role !== "admin") {
      return {
        error: "A teljes fiókkezelési jogot csak az adhatja, akinek megvan.",
      };
    }
    if (target.id === actor.id) {
      return { error: "A saját fiókkezelési jogodat nem veheted el." };
    }
    role = wantsRoleAdmin ? "admin" : null;
  }

  await prisma.user.update({
    where: { id: target.id },
    data: {
      class: klass,
      isTeacher,
      teacherName,
      isAdmin,
      role,
      identityLocked,
    },
  });

  revalidatePath("/admin");
  return { ok: true, savedAt: Date.now() };
}
