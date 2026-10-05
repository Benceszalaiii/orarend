import { canBrowseClubs, clubsLaunched } from "@/lib/club-access";
import { MAX_FOLLOWED_CLUBS, sanitizeFollowed } from "@/lib/club-follow";
import { type ClubSession, sessionsOfWeek } from "@/lib/club-schedule";
import { loadScheduleClubs, resolveActor } from "@/lib/club-store";
import { openFor, targetsClass } from "@/lib/clubs";
import { loadRoomsWeek } from "@/lib/free-rooms-source";
import { looksLikeClass, looksLikeTeacher } from "@/lib/known-class";
import { mondayOf } from "@/lib/timetable";

//! ─── A SZAKKÖR-ALKALMAK AZ ÓRARENDI RÁCSRA ─────────────────────────────────
//! Egy alany (osztály VAGY tanár) egy hete: mely szakkörök esnek rá, és a
//! Jedlikinfo szerint mennyire igazak az időpontjaik (`club-schedule.ts`).
//!
//!   osztály — ALAPBÓL SEMMI. A szakkör választható: attól, hogy egy szakkör
//!             a 09A-nak szól, a 09A-s diák még nem jár oda, és a rácsa az ő
//!             hete, nem a lehetőségeié. Csak a követett szakkör kerül rá.
//!   tanár   — azok, amiket ő vezet (neki ez nem választás, hanem a dolga).
//!   `javaslat=1` — osztálynál az osztálynak/évfolyamának szóló (`targetsClass`)
//!             és a MINDENKINEK NYITOTT szakkörök, `suggested` jelöléssel —
//!             mindkettő csak az osztály SZAKMÁJÁHOZ illően (a forgácsolást
//!             nem javasoljuk a 11A-nak, a hálózatit a 13D-nek). Hogy
//!             melyik fér bele a diák szabad idejébe, azt a böngésző dönti el
//!             (az órarendje és a döntései ott vannak).
//!   `klubok` — ezen felül a KÖVETETT szakkörök (a böngésző listája, lásd
//!             `club-follow.ts`), bármelyik alanynál. A lista a kérés
//!             címében utazik, nem sütiben: a válasz így is mindenkinek
//!             ugyanaz ugyanarra a címre, tehát CDN-en tartható.
//!
//! BELÉPÉS NÉLKÜL IS MŰKÖDIK, és ez a lényege: a diák a saját rácsán látja a
//! követett szakkörét, fiók nélkül. Nincs benne semmi, ami egy diákról
//! szólna — csak az, hogy melyik szakkör mikor és hol van.
//!
//! HIBA ESETÉN IS 200 ÉS ÜRES LISTA — a hívó az órarend, és a szakkörök
//! hiánya nem teheti tönkre az órarendet. A hibát a szerver naplója viszi.

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

type Body = { weekStart: string; sessions: ClubSession[] };

function reply(body: Body, cacheable: boolean) {
  return Response.json(body, {
    headers: {
      //! A BEVEZETÉS ELŐTT A VÁLASZ A NÉZŐTŐL FÜGG (tanár látja, diák nem),
      //! tehát CDN-en nem tartható. Utána mindenkinek ugyanaz.
      "Cache-Control": cacheable
        ? "public, max-age=0, s-maxage=300, stale-while-revalidate=600"
        : "private, no-store",
    },
  });
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const className = params.get("osztaly")?.trim() ?? "";
  const teacher = params.get("tanar")?.trim().toLocaleUpperCase("hu") ?? "";
  const weekParam = params.get("het")?.trim() ?? "";
  const suggest = params.get("javaslat") === "1";
  const followed = new Set(
    sanitizeFollowed((params.get("klubok") ?? "").split(",")).slice(
      0,
      MAX_FOLLOWED_CLUBS,
    ),
  );

  //! PONTOSAN EGY ALANY — ugyanaz a szabály, mint a Jedlikinfo kártyáinál.
  const byClass = looksLikeClass(className);
  const byTeacher = looksLikeTeacher(teacher);
  if (byClass === byTeacher) {
    return Response.json(
      { error: "Pontosan egy kell: `osztaly` (09A) vagy `tanar` (BNM)." },
      { status: 400 },
    );
  }
  if (!DATE_PATTERN.test(weekParam)) {
    return Response.json(
      { error: "A `het` paraméter alakja `ÉÉÉÉ-HH-NN`." },
      { status: 400 },
    );
  }
  const weekStart = mondayOf(weekParam);

  const launched = clubsLaunched();
  if (!launched && !canBrowseClubs(await resolveActor(), false)) {
    return reply({ weekStart, sessions: [] }, false);
  }

  try {
    const all = await loadScheduleClubs();
    const own = (club: (typeof all)[number]) =>
      followed.has(club.slug) ||
      (byTeacher && club.organizers.includes(teacher));
    const suggested = new Set(
      suggest && byClass
        ? all
            .filter(
              (c) =>
                !own(c) &&
                (targetsClass(c, className) || openFor(c, className)),
            )
            .map((c) => c.slug)
        : [],
    );
    const clubs = all.filter((c) => own(c) || suggested.has(c.slug));
    if (clubs.length === 0) return reply({ weekStart, sessions: [] }, launched);

    const rooms = clubs.flatMap((club) =>
      club.slots.flatMap((slot) =>
        slot.source === "TIMETABLE" && slot.room ? [slot.room] : [],
      ),
    );
    const occupancy = await loadRoomsWeek(rooms, weekStart).catch(() => null);
    const sessions = sessionsOfWeek(clubs, occupancy, weekStart).map((s) =>
      suggested.has(s.clubSlug) ? { ...s, suggested: true } : s,
    );
    return reply({ weekStart, sessions }, launched);
  } catch (err) {
    console.error(
      "[orarend] A szakkör-alkalmak összeállítása nem sikerült",
      err,
    );
    return reply({ weekStart, sessions: [] }, false);
  }
}
