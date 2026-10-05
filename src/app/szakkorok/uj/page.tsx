import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  canBrowseClubs,
  canCreateClub,
  clubsLaunched,
} from "@/lib/club-access";
import { getIdea } from "@/lib/club-idea-store";
import { canAdoptIdea } from "@/lib/club-ideas";
import { type UnclaimedCard, unclaimedCards } from "@/lib/club-schedule";
import {
  clubFormOptions,
  loadScheduleClubs,
  resolveActor,
} from "@/lib/club-store";
import { loadWeekOccupancy } from "@/lib/free-rooms-source";
import { budapestNow } from "@/lib/push-plan";
import { mondayOf } from "@/lib/timetable";
import { ClubForm } from "../_components/club-form";
import { ClubFrame } from "../_components/club-frame";

export const metadata: Metadata = {
  title: "Új szakkör - Jedlik Info",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

//! A TANÁR GAZDÁTLAN KÁRTYÁI. A teljes teremseprésből jönnek (a teremkereső
//! óránkénti pillanatképe) — ez a lap ritkán nyílik meg, és csak tanárnak.
//! Ha a seprés most nem sikerül, az űrlap kártyák nélkül is kitölthető.
async function candidatesFor(teacher: string): Promise<UnclaimedCard[]> {
  try {
    const [occupancy, clubs] = await Promise.all([
      loadWeekOccupancy(mondayOf(budapestNow().dayKey)),
      loadScheduleClubs(),
    ]);
    return occupancy ? unclaimedCards(teacher, occupancy, clubs) : [];
  } catch {
    return [];
  }
}

type Props = { searchParams: Promise<{ otlet?: string | string[] }> };

export default async function NewClubPage({ searchParams }: Props) {
  const actor = await resolveActor();
  const ideaParam = (await searchParams).otlet;
  const launched = clubsLaunched();

  if (!actor) {
    if (!launched) notFound();
    return (
      <ClubFrame subject="Szakkörök" context="Új szakkör" preview={false}>
        <h1 className="text-2xl font-bold tracking-tight">Új szakkör</h1>
        <p className="mt-2 max-w-xl text-sm text-muted-strong">
          Szakkört tanár hozhat létre, diák pedig javasolhat — mindkettőhöz be
          kell lépned az iskolai fiókoddal.
        </p>
        <Link
          href="/belepes?tovabb=%2Fszakkorok%2Fuj"
          className="mt-4 inline-block text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          Belépés
        </Link>
      </ClubFrame>
    );
  }
  if (!canBrowseClubs(actor, launched)) notFound();

  const create = canCreateClub(actor);
  //! AZ ÖTLETBŐL INDULÓ SZAKKÖR — csak tanárnál. A név és a leírás az ötletből
  //! jön, a többi (kinek, mikor, hol) a tanáré: az ötlet csak a témát mondja.
  const idea =
    create && typeof ideaParam === "string" ? await getIdea(ideaParam) : null;
  const adoptable =
    idea && canAdoptIdea(actor, { ...idea, voteCount: idea._count.votes })
      ? idea
      : null;
  const [options, candidates] = await Promise.all([
    clubFormOptions(),
    create && actor.teacher ? candidatesFor(actor.teacher) : [],
  ]);

  return (
    <ClubFrame
      subject="Szakkörök"
      context={create ? "Új szakkör" : "Javaslat"}
      preview={!launched}
    >
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
        {create ? "Új szakkör" : "Szakkört javaslok"}
      </h1>
      <p className="mt-2 max-w-xl text-pretty text-sm text-muted-strong">
        {create
          ? "Mentés után azonnal megjelenik a listában. Az órarendjébe az kerül, aki követi."
          : "Egy tanárt kérsz fel a vezetésére. Ha jóváhagyja, a szakkör mindenkinek megjelenik."}
      </p>
      {adoptable && (
        <p className="mt-4 max-w-xl rounded-lg border border-border bg-card px-3 py-2 text-sm text-muted-strong">
          A „{adoptable.title}” ötletből indítod ({adoptable._count.votes}{" "}
          diákot érdekel). Mentés után az ötlet erre a szakkörre mutat.
        </p>
      )}
      <ClubForm
        mode={create ? "create" : "propose"}
        selfTeacher={create ? actor.teacher : null}
        teachers={options.teachers}
        rooms={options.rooms}
        candidates={candidates}
        ideaId={adoptable?.id}
        initial={
          adoptable
            ? {
                name: adoptable.title,
                description: adoptable.note,
                kind: "CLUB",
                grades: [],
                classes: [],
                tracks: [],
                audienceNote: null,
                organizers: actor.teacher ? [actor.teacher] : [],
                slots: [],
              }
            : undefined
        }
      />
    </ClubFrame>
  );
}
