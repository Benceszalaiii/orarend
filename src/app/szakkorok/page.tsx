import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  canApproveClub,
  canBrowseClubs,
  canCreateClub,
  canProposeClub,
  clubsLaunched,
} from "@/lib/club-access";
import { listIdeas } from "@/lib/club-idea-store";
import { canHideIdea, canWithdrawIdea } from "@/lib/club-ideas";
import { listClubs, resolveActor, teacherNames } from "@/lib/club-store";
import { toCardData } from "./_components/club-card";
import { ClubFrame } from "./_components/club-frame";
import { ClubsBrowser } from "./clubs-browser";
import { IdeaBoard, type IdeaCard } from "./idea-board";

//* A fejléc gombjainak közös alakja (a lap többi gombjával egy magasság).
const PILL =
  "press inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

export const metadata: Metadata = {
  title: "Szakkörök - Jedlik Info",
  description:
    "A Jedlik szakkörei, felkészítői és korrepetálásai: mikor, hol, kinek szólnak, és ki tartja őket.",
  alternates: { canonical: "https://jedlik.info/szakkorok" },
  //! AZ ELŐNÉZET NEM KERÜL KERESŐBE. A bevezetés előtt a lapot csak tanár és
  //! admin látja, a robot 404-et kap — de ha egy tanár belépve megosztja, a
  //! címnek akkor sincs keresnivalója a találatok közt.
  ...(clubsLaunched() ? {} : { robots: { index: false, follow: false } }),
};

//! MINDIG FRISS: a javaslatokat csak az érintettek látják, tehát a lap a
//! nézőtől függ.
export const dynamic = "force-dynamic";

export default async function SzakkorokPage() {
  const actor = await resolveActor();
  const launched = clubsLaunched();
  //! A BEVEZETÉS ELŐTT 404 — nem „nincs jogod". A diák ne tudja meg egy félig
  //! feltöltött lapról, hogy létezik.
  if (!canBrowseClubs(actor, launched)) notFound();

  const [rows, names, ideaRows] = await Promise.all([
    listClubs(actor),
    teacherNames(),
    listIdeas(actor),
  ]);
  const clubs = rows.map((row) => toCardData(row, names));
  //* A böngészőbe csak a kártyához kellő alak megy (lásd `IdeaCard`).
  const ideas: IdeaCard[] = ideaRows.map((idea) => ({
    id: idea.id,
    title: idea.title,
    note: idea.note,
    voteCount: idea.voteCount,
    club: idea.club,
    done: idea.clubId !== null,
    mine: idea.mine,
    voted: idea.voted,
    canWithdraw: canWithdrawIdea(actor, {
      authorId: idea.mine ? (actor?.userId ?? null) : null,
      clubId: idea.clubId,
      hidden: false,
      voteCount: idea.voteCount,
    }),
  }));
  const create = canCreateClub(actor);
  const propose = !create && canProposeClub(actor);

  return (
    <ClubFrame subject="Szakkörök" preview={!launched}>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          Szakkörök
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          {/*//! BELÉPÉS NÉLKÜL IS OTT A GOMB. Javasolni bárki javasolhat, csak
              //! fiókkal — a gomb ilyenkor a belépésen át visz az űrlapra. */}
          {(create || propose || actor === null) && (
            <Link
              href={
                actor === null
                  ? `/belepes?tovabb=${encodeURIComponent("/szakkorok/uj")}`
                  : "/szakkorok/uj"
              }
              className={`${PILL} bg-primary text-primary-foreground hover:bg-primary/90`}
            >
              <Plus className="size-4" aria-hidden />
              {create ? "Új szakkör" : "Szakkört javaslok"}
            </Link>
          )}
        </div>
      </div>
      <ClubsBrowser
        clubs={clubs}
        accountClass={actor?.className ?? null}
        teacher={actor?.teacher ?? null}
        approvals={rows
          .filter((row) => canApproveClub(actor, row))
          .map((row) => row.slug)}
      />
      <IdeaBoard
        ideas={ideas}
        loggedIn={actor !== null}
        moderator={canHideIdea(actor)}
      />
    </ClubFrame>
  );
}
