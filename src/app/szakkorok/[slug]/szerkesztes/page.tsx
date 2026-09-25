import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { canEditClub, clubsLaunched } from "@/lib/club-access";
import { clubFormOptions, getClubDetail, resolveActor } from "@/lib/club-store";
import type { ClubInput } from "@/lib/clubs";
import { ClubForm } from "../../_components/club-form";
import { ClubFrame } from "../../_components/club-frame";

export const metadata: Metadata = {
  title: "Szakkör szerkesztése - Órarend",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function EditClubPage({
  params,
}: PageProps<"/szakkorok/[slug]/szerkesztes">) {
  const { slug } = await params;
  const actor = await resolveActor();
  const club = await getClubDetail(slug);
  //! AKI NEM SZERKESZTHETI, ANNAK NINCS IS ILYEN LAP — a javaslat létezése
  //! sem derülhet ki egy idegen számára.
  if (!club || !canEditClub(actor, club) || !actor) notFound();

  const options = await clubFormOptions();
  const initial: ClubInput = {
    name: club.name,
    description: club.description,
    kind: club.kind,
    grades: club.grades,
    classes: club.classes,
    tracks: club.tracks,
    audienceNote: club.audienceNote,
    organizers: club.organizers,
    slots: club.slots.map((s) => ({
      weekday: s.weekday,
      startMinute: s.startMinute,
      endMinute: s.endMinute,
      room: s.room,
      teachers: s.teachers,
      source: s.source,
    })),
  };
  const proposer =
    club.status === "PROPOSED" && club.proposedById === actor.userId;

  return (
    <ClubFrame
      subject="Szakkörök"
      context={club.name}
      preview={!clubsLaunched()}
    >
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
        {club.name}
      </h1>
      <ClubForm
        mode={proposer && !actor.isAdmin ? "propose" : "edit"}
        slug={club.slug}
        initial={initial}
        selfTeacher={
          actor.isTeacher &&
          actor.teacher &&
          club.organizers.includes(actor.teacher)
            ? actor.teacher
            : null
        }
        teachers={options.teachers}
        rooms={options.rooms}
      />
    </ClubFrame>
  );
}
