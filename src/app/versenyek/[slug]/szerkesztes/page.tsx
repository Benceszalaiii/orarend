import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { canManageCompetition, clubsLaunched } from "@/lib/club-access";
import { clubFormOptions, resolveActor } from "@/lib/club-store";
import { clubChoices, getCompetitionDetail } from "@/lib/competition-store";
import type { CompetitionInput } from "@/lib/competitions";
import { ClubFrame } from "../../../szakkorok/_components/club-frame";
import { ContestForm } from "../../_components/contest-form";
import { ResultsEditor } from "./results-editor";

export const metadata: Metadata = {
  title: "Verseny szerkesztése - Jedlik Info",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function EditContestPage({
  params,
}: PageProps<"/versenyek/[slug]/szerkesztes">) {
  const { slug } = await params;
  const actor = await resolveActor();
  const c = await getCompetitionDetail(slug);
  if (!c || !actor || !canManageCompetition(actor, c)) notFound();

  const [options, clubs] = await Promise.all([
    clubFormOptions(),
    clubChoices(),
  ]);
  const initial: CompetitionInput = {
    name: c.name,
    description: c.description,
    category: c.category,
    externalUrl: c.externalUrl,
    venue: c.venue,
    room: c.room,
    location: c.location,
    startsAt: c.startsAt.toISOString(),
    endsAt: c.endsAt?.toISOString() ?? null,
    registrationDeadline: c.registrationDeadline?.toISOString() ?? null,
    grades: c.grades,
    classes: c.classes,
    capacity: c.capacity,
    teachers: c.teachers,
    phases: c.phases.map((p) => ({
      title: p.title,
      startsAt: p.startsAt?.toISOString() ?? null,
      endsAt: p.endsAt?.toISOString() ?? null,
    })),
    clubs: c.clubs.map((club) => club.slug),
  };

  return (
    <ClubFrame subject="Versenyek" context={c.name} preview={!clubsLaunched()}>
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
        {c.name}
      </h1>
      <ContestForm
        slug={c.slug}
        initial={initial}
        selfTeacher={
          actor.isTeacher && actor.teacher && c.teachers.includes(actor.teacher)
            ? actor.teacher
            : null
        }
        teachers={options.teachers}
        rooms={options.rooms}
        clubs={clubs}
      />

      <section className="mt-14 max-w-2xl" aria-labelledby="results-heading">
        <h2 id="results-heading" className="text-lg font-semibold">
          Eredmény
        </h2>
        <p className="mt-1 mb-4 text-sm text-muted-strong">
          Helyezés, díj, pont — amit a verseny ad. Nyilvános akkor lesz, amikor
          a verseny lapján „Lezajlott”-ra állítod.
        </p>
        <ResultsEditor
          slug={c.slug}
          entries={c.entries}
          published={c.status === "FINISHED"}
        />
      </section>
    </ClubFrame>
  );
}
