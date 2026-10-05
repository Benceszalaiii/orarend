import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { canCreateCompetition, clubsLaunched } from "@/lib/club-access";
import { clubFormOptions, resolveActor } from "@/lib/club-store";
import { clubChoices } from "@/lib/competition-store";
import { ClubFrame } from "../../szakkorok/_components/club-frame";
import { ContestForm } from "../_components/contest-form";

export const metadata: Metadata = {
  title: "Új verseny - Jedlik Info",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function NewContestPage() {
  const actor = await resolveActor();
  //* Versenyt csak tanár vagy üzemeltető hirdethet — más ennek a lapnak a
  //* létezéséről sem tud.
  if (!actor || !canCreateCompetition(actor)) notFound();

  const [options, clubs] = await Promise.all([
    clubFormOptions(),
    clubChoices(),
  ]);

  return (
    <ClubFrame
      subject="Versenyek"
      context="Új verseny"
      preview={!clubsLaunched()}
    >
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
        Új verseny
      </h1>
      <p className="mt-2 max-w-xl text-pretty text-sm text-muted-strong">
        Piszkozatként mentődik: előbb megnézheted, hogyan fest, és a verseny
        lapján nyitod meg a nevezést.
      </p>
      <ContestForm
        selfTeacher={actor.teacher}
        teachers={options.teachers}
        rooms={options.rooms}
        clubs={clubs}
      />
    </ClubFrame>
  );
}
