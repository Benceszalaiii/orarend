import { canBrowseClubs, clubsLaunched } from "@/lib/club-access";
import { looksLikeClubSlug } from "@/lib/club-follow";
import {
  clubFeedEvents,
  scheduleOnlyOccupancy,
  sessionsOfWeek,
} from "@/lib/club-schedule";
import { loadScheduleClubs, resolveActor } from "@/lib/club-store";
import { loadRoomsWeek } from "@/lib/free-rooms-source";
import { buildIcs } from "@/lib/ics";
import { budapestNow } from "@/lib/push-plan";
import { loadSchoolPlan } from "@/lib/school-calendar";
import { addDays, mondayOf } from "@/lib/timetable";

//! ─── EGY SZAKKÖR A TELEFON NAPTÁRÁBAN ──────────────────────────────────────
//! Nyilvános, névtelen feed: egy szakkör alkalmai a következő hetekre. Nincs
//! benne semmi, ami egy diákról szólna — ezért nem kell hozzá jegy, mint az
//! osztály-feedhez (`/api/naptar`), és a CDN is tarthatja.
//!
//! KÉTFÉLE HÉT, KÉTFÉLE BIZONYOSSÁG. A teremkereső ablakán belül (lásd
//! `servableWeeks`) a Jedlikinfo kártyáival vetjük össze; azon túl csak a tanév
//! rendjét ismerjük — abból is kiderül, ha egy nap szünetre esik, tehát a
//! téli szünet nem kerül a naptárba szakkörként.

const WEEKS_AHEAD = 8;

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
  const club = (await loadScheduleClubs()).find((c) => c.slug === slug);
  if (!club) return new Response(null, { status: 404 });

  const rooms = club.slots.flatMap((s) =>
    s.source === "TIMETABLE" && s.room ? [s.room] : [],
  );
  const first = mondayOf(budapestNow().dayKey);
  const weeks = Array.from({ length: WEEKS_AHEAD }, (_, i) =>
    addDays(first, i * 7),
  );
  const plan = await loadSchoolPlan(
    weeks.flatMap((w) => [0, 1, 2, 3, 4].map((d) => addDays(w, d))),
  ).catch(() => new Map());

  const sessions = [];
  for (const week of weeks) {
    const occupancy =
      (await loadRoomsWeek(rooms, week).catch(() => null)) ??
      scheduleOnlyOccupancy(
        week,
        [1, 2, 3, 4, 5].map((dayOfWeek) => {
          const dateKey = addDays(week, dayOfWeek - 1);
          const day = plan.get(dateKey);
          return {
            dateKey,
            dayOfWeek,
            week: day?.week ?? "",
            teaching: day ? day.teaching : null,
          };
        }),
        rooms,
      );
    sessions.push(...sessionsOfWeek([club], occupancy, week));
  }

  const body = buildIcs({
    name: club.name,
    description: `${club.name} — a Jedlik szakköre a Jedlik Infóból. Az időpontokat hetente összevetjük az iskola órarendjével.`,
    events: clubFeedEvents(sessions),
    stamp: Date.now(),
    refreshMinutes: 360,
  });

  return new Response(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `inline; filename="${slug}.ics"`,
      "Cache-Control": launched
        ? "public, max-age=0, s-maxage=3600, stale-while-revalidate=21600"
        : "private, no-store",
    },
  });
}
