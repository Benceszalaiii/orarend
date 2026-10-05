"use server";

import { revalidatePath } from "next/cache";
import {
  type Actor,
  canBrowseClubs,
  canCreateCompetition,
  canManageCompetition,
  canSeeCompetition,
  canWithdraw,
  clubsLaunched,
  entryVerdict,
} from "@/lib/club-access";
import { resolveActor, teacherNames } from "@/lib/club-store";
import { clubSlug } from "@/lib/clubs";
import { invalidateLiveCompetitions } from "@/lib/competition-store";
import {
  COMPETITION_STATUSES,
  type CompetitionInput,
  type CompetitionStatus,
  competitionInputSchema,
  type ResultInput,
  resultInputSchema,
} from "@/lib/competitions";
import { loadRoomList } from "@/lib/free-rooms-source";
import prisma from "@/lib/prisma";

//! ═══════════════════════════════════════════════════════════════════════════
//! VERSENYEK — ÍRÁS
//! ═══════════════════════════════════════════════════════════════════════════
//! MINDEN ACTION NYILVÁNOS VÉGPONT — ugyanaz a szabály, mint a szakköröknél:
//! mindegyik maga oldja fel, ki hívja (`resolveActor`), és maga kérdezi meg a
//! `club-access.ts`-t. A nevezőt SOHA nem a kérésből vesszük.
//! ═══════════════════════════════════════════════════════════════════════════

export type ContestActionResult =
  | { ok: true; slug: string }
  | { ok: false; error: string };

const fail = (error: string): ContestActionResult => ({ ok: false, error });

function touched(slug: string): void {
  invalidateLiveCompetitions();
  revalidatePath("/versenyek");
  revalidatePath(`/versenyek/${slug}`);
}

//* A belépett tanár a saját versenyének felelőse marad (lásd a szakköröknél
//* ugyanezt: `withSelf`). Az admin bárki nevében rögzít.
function withSelf(actor: Actor, teachers: string[]): string[] {
  if (actor.isAdmin || !actor.isTeacher || !actor.teacher) return teachers;
  if (teachers.includes(actor.teacher)) return teachers;
  return [actor.teacher, ...teachers].slice(0, 4);
}

async function uniqueSlug(name: string): Promise<string> {
  const base = clubSlug(name) || "verseny";
  for (let n = 1; n < 50; n++) {
    const slug = n === 1 ? base : `${base}-${n}`;
    const taken = await prisma.competition.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (!taken) return slug;
  }
  return `${base}-${Date.now().toString(36)}`;
}

const REF_SELECT = {
  id: true,
  slug: true,
  status: true,
  teachers: true,
  createdById: true,
  startsAt: true,
  registrationDeadline: true,
  capacity: true,
  grades: true,
  classes: true,
} as const;

//! A BEVEZETÉS ELŐTT, ÉS A PISZKOZATNÁL, A VERSENY „NINCS". Az action nyilvános
//! végpont: a lap 404-e nem védi, az azonosítója a kliens csomagjában ott van.
//! Ugyanaz a két kapu, mint a lapé (`canBrowseClubs`, `canSeeCompetition`) —
//! így egy idegen piszkozatra nevezni, vagy a bevezetés előtt jelentkezni sem
//! lehet, és a válasz nem árulja el, hogy a slug létezik.
//*
//! A SLUG A KÉRÉSBŐL JÖN, TEHÁT BÁRMI LEHET — nem-szövegre a Prisma dobna.
async function loadRef(slug: unknown, actor: Actor | null) {
  if (typeof slug !== "string" || slug.length > 200) return null;
  if (!canBrowseClubs(actor, clubsLaunched())) return null;
  const ref = await prisma.competition.findUnique({
    where: { slug },
    select: REF_SELECT,
  });
  return ref && canSeeCompetition(actor, ref) ? ref : null;
}

export async function saveCompetition(input: {
  slug?: string;
  competition: CompetitionInput;
}): Promise<ContestActionResult> {
  const actor = await resolveActor();
  if (!actor) return fail("Ehhez be kell lépned.");

  const parsed = competitionInputSchema.safeParse(input.competition);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Érvénytelen adat.");
  }
  const c = { ...parsed.data, teachers: withSelf(actor, parsed.data.teachers) };

  //* A tanárjel és a terem a suli listájából — mint a szakköröknél.
  const [names, rooms] = await Promise.all([teacherNames(), loadRoomList()]);
  if (names.size === 0) {
    return fail(
      "A Jedlikinfo tanárlistája most nem érhető el. Próbáld újra pár perc múlva.",
    );
  }
  const unknownTeacher = c.teachers.find((t) => !names.has(t));
  if (unknownTeacher) return fail(`Ismeretlen tanárjel: ${unknownTeacher}`);
  if (c.venue === "SCHOOL" && c.room && rooms) {
    if (!rooms.some((r) => r.short === c.room)) {
      return fail(`Ismeretlen terem: ${c.room}`);
    }
  }
  const clubs = await prisma.club.findMany({
    where: { slug: { in: c.clubs }, status: "ACTIVE" },
    select: { id: true },
  });

  const fields = {
    name: c.name,
    description: c.description,
    category: c.category,
    externalUrl: c.externalUrl,
    venue: c.venue,
    room: c.venue === "SCHOOL" ? c.room : null,
    location: c.venue === "EXTERNAL" ? c.location : null,
    startsAt: new Date(c.startsAt),
    endsAt: c.endsAt ? new Date(c.endsAt) : null,
    registrationDeadline: c.registrationDeadline
      ? new Date(c.registrationDeadline)
      : null,
    grades: [...new Set(c.grades)].sort((a, b) => a - b),
    classes: [...new Set(c.classes)],
    capacity: c.capacity,
    teachers: c.teachers,
  };
  const phases = c.phases.map((p, order) => ({
    title: p.title,
    startsAt: p.startsAt ? new Date(p.startsAt) : null,
    endsAt: p.endsAt ? new Date(p.endsAt) : null,
    order,
  }));

  if (!input.slug) {
    if (!canCreateCompetition(actor)) {
      return fail("Versenyt tanár vagy üzemeltető hirdethet meg.");
    }
    const slug = await uniqueSlug(c.name);
    //! PISZKOZATKÉNT SZÜLETIK. A szervező előbb megnézi, hogyan fest, és ő
    //! nyitja meg a nevezést — egy elgépelt határidő így nem megy ki azonnal
    //! minden diákhoz.
    await prisma.competition.create({
      data: {
        slug,
        ...fields,
        status: "DRAFT",
        createdById: actor.userId,
        phases: { create: phases },
        clubs: { connect: clubs },
      },
    });
    touched(slug);
    return { ok: true, slug };
  }

  const ref = await loadRef(input.slug, actor);
  if (!ref) return fail("Nincs ilyen verseny.");
  if (!canManageCompetition(actor, ref)) {
    return fail("Ezt a versenyt nem szerkesztheted.");
  }
  await prisma.$transaction([
    prisma.competitionPhase.deleteMany({ where: { competitionId: ref.id } }),
    prisma.competition.update({
      where: { id: ref.id },
      data: {
        ...fields,
        phases: { create: phases },
        clubs: { set: clubs },
      },
    }),
  ]);
  touched(input.slug);
  return { ok: true, slug: input.slug };
}

export async function setCompetitionStatus(
  slug: string,
  status: CompetitionStatus,
): Promise<ContestActionResult> {
  if (!COMPETITION_STATUSES.includes(status))
    return fail("Érvénytelen állapot.");
  const actor = await resolveActor();
  const ref = await loadRef(slug, actor);
  if (!ref) return fail("Nincs ilyen verseny.");
  if (!canManageCompetition(actor, ref)) {
    return fail("Ennek a versenynek az állapotát nem változtathatod.");
  }
  await prisma.competition.update({ where: { id: ref.id }, data: { status } });
  touched(slug);
  return { ok: true, slug };
}

//! A PISZKOZAT TÖRÖLHETŐ, A MEGHIRDETETT NEM. Amit a diákok már láttak (és
//! amire talán neveztek), az „Elmarad" állapotot kap, nem tűnik el.
export async function deleteDraft(slug: string): Promise<ContestActionResult> {
  const actor = await resolveActor();
  const ref = await loadRef(slug, actor);
  if (!ref || ref.status !== "DRAFT") return fail("Nincs ilyen piszkozat.");
  if (!canManageCompetition(actor, ref)) return fail("Ezt nem törölheted.");
  await prisma.competition.delete({ where: { id: ref.id } });
  touched(slug);
  return { ok: true, slug };
}

const VERDICT_TEXT = {
  login: "A nevezéshez be kell lépned.",
  "not-open": "Erre a versenyre most nem lehet nevezni.",
  deadline: "Lejárt a nevezési határidő.",
  audience: "Ez a verseny nem a te évfolyamodnak vagy osztályodnak szól.",
  full: "Betelt a létszám.",
} as const;

export async function enterCompetition(
  slug: string,
): Promise<ContestActionResult> {
  const actor = await resolveActor();
  const found = await loadRef(slug, actor);
  if (!found) return fail("Nincs ilyen verseny.");
  if (actor?.isTeacher) return fail("Tanárként nem lehet nevezni.");

  //! A LÉTSZÁMOT ÉS A BEÍRÁST EGY TRANZAKCIÓBAN NÉZZÜK, A VERSENY SORÁT ZÁRVA.
  //! A tranzakció egymagában kevés: Postgresben az alapszint (READ COMMITTED)
  //! mellett két egyszerre érkező nevezés mindkettő ugyanazt a számot olvassa,
  //! és mindkettő az utolsó helyet látja szabadnak. A `FOR UPDATE` sorba
  //! állítja őket: a második csak az első beírása után számol. Az állapotot és
  //! a határidőt is a zár UTÁN olvassuk újra — a szervező közben lezárhatta.
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1 FROM "competition" WHERE "id" = ${found.id} FOR UPDATE`;
    const ref = await tx.competition.findUnique({
      where: { id: found.id },
      select: REF_SELECT,
    });
    if (!ref) return fail("Nincs ilyen verseny.");
    const count = await tx.competitionEntry.count({
      where: { competitionId: ref.id },
    });
    const verdict = entryVerdict(actor, ref, count, new Date());
    if (!verdict.ok) return fail(VERDICT_TEXT[verdict.reason]);
    if (!actor) return fail(VERDICT_TEXT.login);
    await tx.competitionEntry.upsert({
      where: {
        competitionId_userId: { competitionId: ref.id, userId: actor.userId },
      },
      create: { competitionId: ref.id, userId: actor.userId },
      update: {},
    });
    touched(slug);
    return { ok: true as const, slug };
  });
}

export async function withdrawCompetition(
  slug: string,
): Promise<ContestActionResult> {
  const actor = await resolveActor();
  if (!actor) return fail("Ehhez be kell lépned.");
  const ref = await loadRef(slug, actor);
  if (!ref) return fail("Nincs ilyen verseny.");
  if (!canWithdraw(ref, new Date())) {
    return fail(
      "A nevezési határidő után már nem lehet visszalépni — szólj a szervező tanárnak.",
    );
  }
  await prisma.competitionEntry.deleteMany({
    where: { competitionId: ref.id, userId: actor.userId },
  });
  touched(slug);
  return { ok: true, slug };
}

//! AZ EREDMÉNY CSAK MEGLÉVŐ NEVEZÉSHEZ ÍRHATÓ. Egy idegen `userId` a kérésben
//! nem hozhat létre nevezést — csak a már bent lévő sorokat frissítjük.
export async function saveResults(
  slug: string,
  results: ResultInput,
): Promise<ContestActionResult> {
  const actor = await resolveActor();
  const ref = await loadRef(slug, actor);
  if (!ref) return fail("Nincs ilyen verseny.");
  if (!canManageCompetition(actor, ref)) {
    return fail("Ennek a versenynek az eredményét nem rögzítheted.");
  }
  const parsed = resultInputSchema.safeParse(results);
  if (!parsed.success) return fail("Érvénytelen eredmény.");
  await prisma.$transaction(
    parsed.data.map((r) =>
      prisma.competitionEntry.updateMany({
        where: { competitionId: ref.id, userId: r.userId },
        data: {
          rank: r.rank,
          award: r.award?.trim() || null,
          points: r.points,
        },
      }),
    ),
  );
  touched(slug);
  return { ok: true, slug };
}
