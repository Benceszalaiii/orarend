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

export const metadata: Metadata = {
  title: "Szakkörök - Órarend",
  description:
    "A Jedlik szakkörei, felkészítői és korrepetálásai: mikor, hol, kinek szólnak, és ki tartja őket.",
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
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-2xl">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Szakkörök
          </h1>
          <p className="mt-2 text-pretty text-sm leading-relaxed text-muted-strong">
            Szakkörök, felkészítők és korrepetálások — mikor, hol és kinek. Az
            időpontokat hetente összevetjük az iskola órarendjével; ahol eltér,
            az iskoláé számít.
          </p>
        </div>
        {/*//! BELÉPÉS NÉLKÜL IS OTT A GOMB. Javasolni bárki javasolhat, csak
            //! fiókkal — a gomb ilyenkor a belépésen át visz az űrlapra. */}
        {(create || propose || actor === null) && (
          <Link
            href={
              actor === null
                ? `/belepes?tovabb=${encodeURIComponent("/szakkorok/uj")}`
                : "/szakkorok/uj"
            }
            className="inline-flex h-9 items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <Plus className="size-4" aria-hidden />
            {create ? "Új szakkör" : "Szakkört javaslok"}
          </Link>
        )}
      </div>
      {create && (
        //* A tanárnak és az adminnak: ők kérik meg az iskolát, hogy a
        //* folyosói képernyőn ez fusson.
        <p className="mt-3 text-xs text-muted-strong">
          Folyosói kijelzőre:{" "}
          <Link
            href="/tabla"
            prefetch={false}
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            jedlik.info/tabla
          </Link>{" "}
          — a mai szakkörök termei és a nevezési határidők, magától frissül.
        </p>
      )}
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
