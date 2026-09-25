import { canBrowseClubs, clubsLaunched } from "@/lib/club-access";
import { MAX_FOLLOWED_CLUBS, sanitizeFollowed } from "@/lib/club-follow";
import { resolveActor } from "@/lib/club-store";
import { isOpenToAll, targetsClass } from "@/lib/clubs";
import { loadLiveCompetitions } from "@/lib/competition-store";
import { deadlineOf, openDeadlines } from "@/lib/competitions";
import { looksLikeClass } from "@/lib/known-class";

//! ─── A NEVEZÉSI HATÁRIDŐK A `/ma`-RA ────────────────────────────────────────
//! Amire ez az osztály NEVEZHET (a neki szóló és a mindenkinek nyitott
//! verseny), plusz amit a böngésző követ (`versenyek=`), a legsürgősebb elöl.
//! Ugyanaz a szerkezet, mint a szakkörök rács-végpontjáé: a követett lista a
//! címben utazik, tehát a válasz ugyanarra a címre mindenkinek ugyanaz.

const LIMIT = 5;

export type DeadlineItem = {
  slug: string;
  name: string;
  deadline: string;
  followed: boolean;
};

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const className = params.get("osztaly")?.trim() ?? "";
  const followed = new Set(
    sanitizeFollowed((params.get("versenyek") ?? "").split(",")).slice(
      0,
      MAX_FOLLOWED_CLUBS,
    ),
  );
  const launched = clubsLaunched();
  const reply = (items: DeadlineItem[], cacheable: boolean) =>
    Response.json(
      { now: new Date().toISOString(), items },
      {
        headers: {
          "Cache-Control": cacheable
            ? "public, max-age=0, s-maxage=300, stale-while-revalidate=600"
            : "private, no-store",
        },
      },
    );

  if (!launched && !canBrowseClubs(await resolveActor(), false)) {
    return reply([], false);
  }

  const now = new Date();
  const relevant = (await loadLiveCompetitions()).filter(
    (c) =>
      followed.has(c.slug) ||
      isOpenToAll(c) ||
      (looksLikeClass(className) && targetsClass(c, className)),
  );
  const items = openDeadlines(relevant, now)
    .slice(0, LIMIT)
    .map((c) => ({
      slug: c.slug,
      name: c.name,
      deadline: deadlineOf(c).toISOString(),
      followed: followed.has(c.slug),
    }));
  return reply(items, launched);
}
