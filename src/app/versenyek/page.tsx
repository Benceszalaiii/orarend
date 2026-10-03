import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  canBrowseClubs,
  canCreateCompetition,
  clubsLaunched,
} from "@/lib/club-access";
import { resolveActor, teacherNames } from "@/lib/club-store";
import { listCompetitions } from "@/lib/competition-store";
import { ClubFrame } from "../szakkorok/_components/club-frame";
import { toContestCard } from "./_components/contest-card";
import { ContestsBrowser } from "./contests-browser";

export const metadata: Metadata = {
  title: "Versenyek - Órarend",
  description:
    "Versenyek a Jedlikben: kinek szólnak, mikor vannak, és meddig lehet nevezni.",
  alternates: { canonical: "https://jedlik.info/versenyek" },
  //! AZ ELŐNÉZET NEM KERÜL KERESŐBE. A bevezetés előtt a lapot csak tanár és
  //! admin látja, a robot 404-et kap — de ha egy tanár belépve megosztja, a
  //! címnek akkor sincs keresnivalója a találatok közt.
  ...(clubsLaunched() ? {} : { robots: { index: false, follow: false } }),
};

export const dynamic = "force-dynamic";

export default async function VersenyekPage() {
  const actor = await resolveActor();
  const launched = clubsLaunched();
  //* Ugyanaz a bevezetés-kapcsoló, mint a szakköröké: a két rész együtt indul.
  if (!canBrowseClubs(actor, launched)) notFound();

  const [rows, names] = await Promise.all([
    listCompetitions(actor),
    teacherNames(),
  ]);

  return (
    <ClubFrame subject="Versenyek" preview={!launched}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-2xl">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Versenyek
          </h1>
          <p className="mt-2 text-pretty text-sm leading-relaxed text-muted-strong">
            Kinek szólnak, mikor vannak, és meddig lehet még nevezni. A
            határidők elöl állnak — azokat szokás lekésni.
          </p>
        </div>
        {canCreateCompetition(actor) && (
          <Link
            href="/versenyek/uj"
            className="inline-flex h-9 items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <Plus className="size-4" aria-hidden />
            Új verseny
          </Link>
        )}
      </div>
      <ContestsBrowser
        contests={rows.map((r) => toContestCard(r, names))}
        now={new Date().toISOString()}
      />
    </ClubFrame>
  );
}
