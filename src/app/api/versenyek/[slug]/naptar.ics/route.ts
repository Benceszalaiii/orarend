import { canBrowseClubs, clubsLaunched } from "@/lib/club-access";
import { looksLikeClubSlug } from "@/lib/club-follow";
import { resolveActor } from "@/lib/club-store";
import { getCompetitionDetail } from "@/lib/competition-store";
import { contestFeedEvents } from "@/lib/competitions";
import { buildIcs } from "@/lib/ics";

//! ─── EGY VERSENY A TELEFON NAPTÁRÁBAN ──────────────────────────────────────
//! Nyilvános, névtelen feed — mint a szakköré (`/api/szakkorok/<slug>/naptar.ics`).
//! A piszkozatnak nincs feedje: az még nem hír.

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  if (!looksLikeClubSlug(slug)) return new Response(null, { status: 404 });
  const launched = clubsLaunched();
  if (!launched && !canBrowseClubs(await resolveActor(), false)) {
    return new Response(null, { status: 404 });
  }
  const c = await getCompetitionDetail(slug).catch(() => null);
  if (!c || c.status === "DRAFT") return new Response(null, { status: 404 });

  const body = buildIcs({
    name: c.name,
    description: `${c.name} — verseny a Jedlikben, az Órarendből. A határidő és a fordulók frissülnek, ha a szervező módosítja őket.`,
    events: contestFeedEvents(c),
    stamp: Date.now(),
    refreshMinutes: 360,
  });

  return new Response(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `inline; filename="${slug}.ics"`,
      "Cache-Control": launched
        ? "public, max-age=0, s-maxage=900, stale-while-revalidate=3600"
        : "private, no-store",
    },
  });
}
