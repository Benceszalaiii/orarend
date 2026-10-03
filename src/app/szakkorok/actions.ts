"use server";

import { revalidatePath } from "next/cache";
import {
  type Actor,
  canApproveClub,
  canBrowseClubs,
  canCreateClub,
  canEditClub,
  canJoinClub,
  canProposeClub,
  clubsLaunched,
} from "@/lib/club-access";
import {
  invalidateScheduleClubs,
  resolveActor,
  teacherNames,
} from "@/lib/club-store";
import { type ClubInput, clubInputSchema, clubSlug } from "@/lib/clubs";
import { loadRoomList } from "@/lib/free-rooms-source";
import prisma from "@/lib/prisma";

//! ═══════════════════════════════════════════════════════════════════════════
//! SZAKKÖRÖK — ÍRÁS
//! ═══════════════════════════════════════════════════════════════════════════
//! MINDEN ACTION NYILVÁNOS VÉGPONT: bárki POST-olhat rá, a felületet
//! megkerülve. Ezért mindegyik maga oldja fel, KI hívja (`resolveActor`, a
//! munkamenetből és az adatbázisból), és maga kérdezi meg a `club-access.ts`
//! szabályait — a felület gombjai csak tükrözik ugyanezt.
//!
//! A TANÁRJELET SOHA NEM A KÉRÉSBŐL VESSZÜK. A beküldött vezetőlista csak
//! javaslat; hogy a belépett tanár benne maradjon, azt itt kényszerítjük ki.
//! ═══════════════════════════════════════════════════════════════════════════

export type ClubActionResult =
  | { ok: true; slug: string }
  | { ok: false; error: string };

const fail = (error: string): ClubActionResult => ({ ok: false, error });

function touched(slug: string): void {
  invalidateScheduleClubs();
  revalidatePath("/szakkorok");
  revalidatePath(`/szakkorok/${slug}`);
}

//! A VALÓSÁG ELLENŐRZÉSE — ugyanaz, mint a kezdő listánál
//! (`prisma/seed/validate.ts`). Egy elírt jel a sémán átmegy, de egyetlen
//! kártyára sem illeszkedne. Ha a Jedlikinfo listái épp nem elérhetők, NEM
//! engedjük át: egy ellenőrizetlen jel később csendben „nincs az órarendben"
//! lenne, és azt senki nem venné észre.
async function checkAgainstSchool(club: ClubInput): Promise<string | null> {
  const [names, rooms] = await Promise.all([teacherNames(), loadRoomList()]);
  if (names.size === 0 || !rooms) {
    return "A Jedlikinfo tanár- vagy teremlistája most nem érhető el, ezért nem tudjuk ellenőrizni a szakkört. Próbáld újra pár perc múlva.";
  }
  const unknownTeacher = club.organizers.find((t) => !names.has(t));
  if (unknownTeacher) return `Ismeretlen tanárjel: ${unknownTeacher}`;
  const roomSet = new Set(rooms.map((r) => r.short));
  const unknownRoom = club.slots.find((s) => s.room && !roomSet.has(s.room));
  if (unknownRoom) return `Ismeretlen terem: ${unknownRoom.room}`;
  return null;
}

//! A BELÉPETT TANÁR A SAJÁT SZAKKÖRÉNEK VEZETŐJE MARAD. Ha kihagyná magát,
//! a következő pillanatban már nem szerkeszthetné — és a szakkör vezető nélkül
//! maradna, akit megkérdezhetnének. Az admin kivétel: ő bárki nevében rögzít.
function withSelf(actor: Actor, organizers: string[]): string[] {
  if (actor.isAdmin || !actor.isTeacher || !actor.teacher) return organizers;
  if (organizers.includes(actor.teacher)) return organizers;
  return [actor.teacher, ...organizers].slice(0, 4);
}

async function uniqueSlug(name: string): Promise<string> {
  const base = clubSlug(name) || "szakkor";
  for (let n = 1; n < 50; n++) {
    const slug = n === 1 ? base : `${base}-${n}`;
    const taken = await prisma.club.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (!taken) return slug;
  }
  return `${base}-${Date.now().toString(36)}`;
}

function nested(club: ClubInput) {
  return {
    organizers: {
      create: club.organizers.map((teacher, i) => ({ teacher, lead: i === 0 })),
    },
    slots: {
      create: club.slots.map((s) => ({
        weekday: s.weekday,
        startMinute: s.startMinute,
        endMinute: s.endMinute,
        room: s.room,
        teachers: s.teachers,
        source: s.source,
      })),
    },
  };
}

export async function saveClub(input: {
  slug?: string;
  club: ClubInput;
  //* Az ötlet („Mire lenne igény?"), amiből a tanár a szakkört indítja.
  ideaId?: string;
}): Promise<ClubActionResult> {
  const actor = await resolveActor();
  if (!actor) return fail("Ehhez be kell lépned.");
  //* A bevezetés előtt csak tanár és admin jut el ide (lásd `loadRef`).
  if (!canBrowseClubs(actor, clubsLaunched())) {
    return fail("Szakkört tanár hozhat létre, vagy belépett diák javasolhat.");
  }
  if (input.slug !== undefined && typeof input.slug !== "string") {
    return fail("Nincs ilyen szakkör.");
  }

  const parsed = clubInputSchema.safeParse(input.club);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Érvénytelen adat.");
  }
  const club = {
    ...parsed.data,
    organizers: withSelf(actor, parsed.data.organizers),
  };
  const problem = await checkAgainstSchool(club);
  if (problem) return fail(problem);

  const fields = {
    name: club.name,
    description: club.description,
    kind: club.kind,
    grades: [...new Set(club.grades)].sort((a, b) => a - b),
    classes: [...new Set(club.classes)],
    tracks: [...new Set(club.tracks)],
    audienceNote: club.audienceNote,
  };

  //* ─── ÚJ ────────────────────────────────────────────────────────────────
  if (!input.slug) {
    const create = canCreateClub(actor);
    if (!create && !canProposeClub(actor)) {
      return fail(
        "Szakkört tanár hozhat létre, vagy belépett diák javasolhat.",
      );
    }
    const slug = await uniqueSlug(club.name);
    const created = await prisma.club.create({
      data: {
        slug,
        ...fields,
        //! DIÁK JAVASLATA NEM ÉL, AMÍG A FELKÉRT TANÁR JÓVÁ NEM HAGYJA.
        status: create ? "ACTIVE" : "PROPOSED",
        proposedById: create ? null : actor.userId,
        ...nested(club),
      },
      select: { id: true },
    });
    //! AZ ÖTLET CSAK TANÁRI LÉTREHOZÁSSAL LESZ „MEGVALÓSULT". Egy diák
    //! javaslata még nem szakkör; ha a tanár jóváhagyja, azt a lap nem kapcsolja
    //! vissza az ötlethez — azt a tanár a saját ötletlapi gombjával teheti meg.
    //! A `clubId: null` feltétel miatt egy már megvalósult ötletet nem lehet
    //! egy második szakkörhöz is hozzárendelni.
    if (create && typeof input.ideaId === "string") {
      await prisma.clubIdea.updateMany({
        where: { id: input.ideaId, clubId: null, hidden: false },
        data: { clubId: created.id },
      });
      revalidatePath("/szakkorok");
    }
    touched(slug);
    return { ok: true, slug };
  }

  //* ─── SZERKESZTÉS ───────────────────────────────────────────────────────
  const existing = await prisma.club.findUnique({
    where: { slug: input.slug },
    select: {
      id: true,
      status: true,
      proposedById: true,
      organizers: { select: { teacher: true } },
    },
  });
  if (!existing) return fail("Nincs ilyen szakkör.");
  const ref = {
    status: existing.status,
    proposedById: existing.proposedById,
    organizers: existing.organizers.map((o) => o.teacher),
  };
  if (!canEditClub(actor, ref))
    return fail("Ezt a szakkört nem szerkesztheted.");

  const leadsOrAdmin =
    actor.isAdmin ||
    (actor.teacher !== null && ref.organizers.includes(actor.teacher));
  await prisma.$transaction([
    prisma.clubOrganizer.deleteMany({ where: { clubId: existing.id } }),
    prisma.clubSlot.deleteMany({ where: { clubId: existing.id } }),
    prisma.club.update({
      where: { id: existing.id },
      data: {
        ...fields,
        //* A vezető (vagy az admin) mentése egyben megerősítés is: az adatok
        //* most stimmelnek. A javasló mentése nem az.
        ...(leadsOrAdmin ? { confirmedAt: new Date() } : {}),
        ...nested(club),
      },
    }),
  ]);
  touched(input.slug);
  return { ok: true, slug: input.slug };
}

//! A BEVEZETÉS ELŐTT AZ ACTION SEM LÉTEZIK. A lap 404-et ad a diáknak, de az
//! action nyilvános végpont: az azonosítója a kliens csomagjában ott van, és a
//! lap nélkül is hívható. Ugyanaz a kapu, mint a lapé (`canBrowseClubs`) — ha
//! nem engedi, a szakkör „nincs", nem „tilos".
//*
//! A SLUG A KÉRÉSBŐL JÖN, TEHÁT BÁRMI LEHET. Egy nem-szöveg a Prismán dobna,
//! és a felület egy névtelen hibát kapna egy érthető „nincs ilyen" helyett.
async function loadRef(slug: unknown, actor: Actor | null) {
  if (typeof slug !== "string" || slug.length > 200) return null;
  if (!canBrowseClubs(actor, clubsLaunched())) return null;
  const row = await prisma.club.findUnique({
    where: { slug },
    select: {
      id: true,
      status: true,
      proposedById: true,
      organizers: { select: { teacher: true } },
    },
  });
  return row
    ? {
        id: row.id,
        status: row.status,
        proposedById: row.proposedById,
        organizers: row.organizers.map((o) => o.teacher),
      }
    : null;
}

export async function approveClub(slug: string): Promise<ClubActionResult> {
  const actor = await resolveActor();
  const ref = await loadRef(slug, actor);
  if (!ref) return fail("Nincs ilyen szakkör.");
  if (!canApproveClub(actor, ref) || !actor) {
    return fail("Ezt a javaslatot csak a felkért tanár hagyhatja jóvá.");
  }
  await prisma.club.update({
    where: { id: ref.id },
    data: {
      status: "ACTIVE",
      approvedByTeacher: actor.teacher,
      approvedAt: new Date(),
      confirmedAt: new Date(),
    },
  });
  touched(slug);
  return { ok: true, slug };
}

//! A JAVASLAT ELUTASÍTÁSA TÖRLÉS, NEM ÁLLAPOT. Egy el nem fogadott javaslatnak
//! nincs lapja, amit meg kellene őrizni; a javasló pedig visszavonhatja a
//! sajátját ugyanígy.
export async function rejectProposal(slug: string): Promise<ClubActionResult> {
  const actor = await resolveActor();
  const ref = await loadRef(slug, actor);
  if (!ref || ref.status !== "PROPOSED") return fail("Nincs ilyen javaslat.");
  const own = actor !== null && ref.proposedById === actor.userId;
  if (!own && !canApproveClub(actor, ref)) {
    return fail("Ezt a javaslatot nem utasíthatod el.");
  }
  await prisma.club.delete({ where: { id: ref.id } });
  touched(slug);
  return { ok: true, slug };
}

export async function archiveClub(slug: string): Promise<ClubActionResult> {
  const actor = await resolveActor();
  const ref = await loadRef(slug, actor);
  if (!ref || ref.status !== "ACTIVE") return fail("Nincs ilyen élő szakkör.");
  if (!canEditClub(actor, ref)) return fail("Ezt a szakkört nem zárhatod le.");
  await prisma.club.update({
    where: { id: ref.id },
    data: { status: "ARCHIVED" },
  });
  touched(slug);
  return { ok: true, slug };
}

//* ---------------------------------------------------------------------------
//* TAGSÁG
//* ---------------------------------------------------------------------------
//! A FELHASZNÁLÓ A MUNKAMENETBŐL JÖN, SOHA NEM A KÉRÉSBŐL — különben bárki
//! bárkit beléptethetne (a jedlik-szakkor ugyanezt a hibát már egyszer
//! kijavította, lásd ott az `addUserToSzakkor`-t). A tagság nyilvános: a
//! szakkör lapján a neve és az osztálya látszik.

export async function joinClub(slug: string): Promise<ClubActionResult> {
  const actor = await resolveActor();
  if (!actor) return fail("A jelentkezéshez be kell lépned.");
  const ref = await loadRef(slug, actor);
  if (!ref || !canJoinClub(actor, ref)) {
    return fail("Ehhez a szakkörhöz most nem lehet jelentkezni.");
  }
  await prisma.clubMember.upsert({
    where: { clubId_userId: { clubId: ref.id, userId: actor.userId } },
    create: { clubId: ref.id, userId: actor.userId },
    update: {},
  });
  revalidatePath(`/szakkorok/${slug}`);
  revalidatePath("/szakkorok");
  return { ok: true, slug };
}

export async function leaveClub(slug: string): Promise<ClubActionResult> {
  const actor = await resolveActor();
  if (!actor) return fail("Ehhez be kell lépned.");
  const ref = await loadRef(slug, actor);
  if (!ref) return fail("Nincs ilyen szakkör.");
  //* A kilépés mindig mehet — egy megszűnt szakkörből is ki lehet lépni.
  await prisma.clubMember.deleteMany({
    where: { clubId: ref.id, userId: actor.userId },
  });
  revalidatePath(`/szakkorok/${slug}`);
  revalidatePath("/szakkorok");
  return { ok: true, slug };
}
