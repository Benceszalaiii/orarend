import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { accentStyle } from "@/lib/accent";
import {
  canApproveClub,
  canBrowseClubs,
  canEditClub,
  canSeeClub,
  clubsLaunched,
} from "@/lib/club-access";
import { type ClubSessionStatus, sessionsOfWeek } from "@/lib/club-schedule";
import { getClubDetail, resolveActor, teacherNames } from "@/lib/club-store";
import { audienceLabel, CLUB_KIND_LABELS } from "@/lib/clubs";
import { formatWhen } from "@/lib/competitions";
import { loadRoomsWeek } from "@/lib/free-rooms-source";
import { budapestNow } from "@/lib/push-plan";
import { addDays, mondayOf } from "@/lib/timetable";
import { ClubFrame } from "../_components/club-frame";
import { ClubControls } from "./club-controls";
import { ClubPlanner } from "./club-planner";
import { ClubTimes } from "./club-times";
import { Participation } from "./participation";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: PageProps<"/szakkorok/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const club = await getClubDetail(slug).catch(() => null);
  //! A JAVASLAT NEVE SEM SZIVÁROGHAT KI a lap címében.
  if (!club || club.status === "PROPOSED")
    return { title: "Szakkör - Órarend" };
  return {
    title: `${club.name} - Órarend`,
    description: `${CLUB_KIND_LABELS[club.kind]} · ${audienceLabel(club)}`,
  };
}

//! HÉTVÉGÉN A KÖVETKEZŐ HÉT. Szombaton a „ezen a héten" már csak múlt időben
//! igaz; akkor nézik meg a szakkört, hogy hétfőn mikor van.
function focusWeek(): string {
  const today = budapestNow().dayKey;
  const dow = new Date(`${today}T00:00:00Z`).getUTCDay();
  return dow === 0 || dow === 6 ? addDays(mondayOf(today), 7) : mondayOf(today);
}

const _STATUS_TONE: Record<ClubSessionStatus, string> = {
  confirmed: "border-border text-muted-strong",
  declared: "border-dashed border-border text-muted-strong",
  missing: "border-destructive/40 text-destructive",
  "no-school": "border-destructive/40 text-destructive",
  unknown: "border-dashed border-border text-muted-foreground",
};

const _DATE_FMT = new Intl.DateTimeFormat("hu-HU", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

export default async function ClubPage({
  params,
}: PageProps<"/szakkorok/[slug]">) {
  const { slug } = await params;
  const actor = await resolveActor();
  const launched = clubsLaunched();
  if (!canBrowseClubs(actor, launched)) notFound();

  const club = await getClubDetail(slug);
  if (!club || !canSeeClub(actor, club)) notFound();

  const week = focusWeek();
  const rooms = club.slots.flatMap((s) =>
    s.source === "TIMETABLE" && s.room ? [s.room] : [],
  );
  const [names, occupancy] = await Promise.all([
    teacherNames(),
    loadRoomsWeek(rooms, week).catch(() => null),
  ]);
  const sessions = sessionsOfWeek([club], occupancy, week);

  const leads =
    actor?.teacher !== null &&
    actor?.teacher !== undefined &&
    club.organizers.includes(actor.teacher);
  const own = actor !== null && club.proposedById === actor.userId;
  const approve = canApproveClub(actor, club);
  const editable = canEditClub(actor, club);

  return (
    <ClubFrame subject="Szakkörök" context={club.name} preview={!launched}>
      <Link
        href="/szakkorok"
        className="inline-flex items-center gap-1.5 text-sm text-muted-strong transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Összes szakkör
      </Link>

      <article className="mt-5" style={accentStyle(club.slug)}>
        <header className="max-w-3xl">
          {/*//! NINCS FELIRAT A CÍM FÖLÖTT. A cím viszi a lapot; a fajta, a
              //! közönség és az állapot alatta, egy sorban — ugyanúgy, mint a
              //! lista sorában. */}
          <h1 className="text-pretty text-3xl font-bold tracking-tight sm:text-4xl">
            {club.name}
          </h1>
          <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-strong">
            <span
              className="acc-dot size-2.5 shrink-0 rounded-full"
              aria-hidden
            />
            <span>
              {CLUB_KIND_LABELS[club.kind]} · {audienceLabel(club)}
              {club.audienceNote ? ` · ${club.audienceNote}` : ""}
            </span>
            {club.status === "PROPOSED" && (
              <span className="rounded-full border border-dashed border-border px-2 py-0.5 text-xs font-medium">
                Javaslat — még nem él
              </span>
            )}
            {club.status === "ARCHIVED" && (
              <span className="rounded-full border border-border px-2 py-0.5 text-xs font-medium">
                Megszűnt
              </span>
            )}
          </p>

          {club.status === "PROPOSED" && (
            <p className="mt-4 text-pretty rounded-lg border border-dashed border-border px-3 py-2 text-sm text-muted-strong">
              {approve
                ? "Egy diák téged kért fel ennek a szakkörnek a vezetésére. Ha vállalod, hagyd jóvá — onnantól mindenki látja."
                : own
                  ? "A javaslatod a felkért tanárnál van. Amíg jóvá nem hagyja, csak te és ő látjátok."
                  : "Ez a javaslat még jóváhagyásra vár."}
            </p>
          )}

          <div className="mt-5">
            <ClubControls
              slug={club.slug}
              canEdit={editable}
              canApprove={approve}
              canReject={club.status === "PROPOSED" && (approve || own)}
              canArchive={
                club.status === "ACTIVE" && (actor?.isAdmin === true || leads)
              }
            />
          </div>
        </header>

        {/*//! A DÖNTÉS OSZLOPA. Mobilon közvetlenül a cím után jön (a DOM-ban
            //! elöl áll), széles képernyőn jobbra ragad: amíg a leírást és a
            //! tagokat olvasod, az időpont és a jelentkezés végig ott marad. */}
        <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_23rem] lg:gap-12">
          <div className="flex min-w-0 flex-col gap-6 lg:sticky lg:top-20 lg:col-start-2 lg:row-start-1 lg:self-start">
            <ClubTimes
              slots={club.slots.map(
                ({ id, weekday, startMinute, endMinute, room, source }) => ({
                  id,
                  weekday,
                  startMinute,
                  endMinute,
                  room,
                  source,
                }),
              )}
              sessions={sessions.map(
                ({ slotId, dateKey, startMin, endMin, room, status }) => ({
                  slotId,
                  dateKey,
                  startMin,
                  endMin,
                  room,
                  status,
                }),
              )}
              weekLabel={
                week === mondayOf(budapestNow().dayKey)
                  ? "ezen a héten"
                  : "jövő héten"
              }
              accountClass={actor?.className ?? null}
              teacher={Boolean(actor?.teacher)}
            />
            {club.status === "ACTIVE" && (
              <Participation
                slug={club.slug}
                loggedIn={actor !== null}
                isMember={
                  actor !== null &&
                  club.members.some((m) => m.id === actor.userId)
                }
                canJoin={club.status === "ACTIVE"}
              />
            )}
          </div>

          <div className="min-w-0 lg:col-start-1 lg:row-start-1 *:first:mt-0">
            {editable && club.status !== "ARCHIVED" && (
              <ClubPlanner
                slug={club.slug}
                defaultDuration={
                  club.slots[0]
                    ? club.slots[0].endMinute - club.slots[0].startMinute
                    : 45
                }
              />
            )}

            {club.competitions.length > 0 && (
              <section className="mt-10" aria-labelledby="contest-heading">
                <h2 id="contest-heading" className="text-lg font-semibold">
                  Erre a versenyre készít
                </h2>
                <ul className="mt-2 flex flex-col gap-1">
                  {club.competitions.map((c) => (
                    <li key={c.slug}>
                      <Link
                        href={`/versenyek/${c.slug}`}
                        prefetch={false}
                        className="font-medium text-primary underline-offset-4 hover:underline"
                      >
                        {c.name}
                      </Link>
                      <span className="ml-2 text-sm text-muted-strong">
                        {formatWhen(c.startsAt)}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section className="mt-10" aria-labelledby="about-heading">
              <h2 id="about-heading" className="text-lg font-semibold">
                A szakkörről
              </h2>
              {club.description ? (
                <p className="mt-2 whitespace-pre-line text-pretty text-[15px] leading-relaxed text-foreground">
                  {club.description}
                </p>
              ) : (
                <p className="mt-2 text-sm text-muted-strong">
                  A leírást a vezető tanár még nem írta meg.
                </p>
              )}
            </section>

            <section className="mt-10" aria-labelledby="lead-heading">
              <h2 id="lead-heading" className="text-lg font-semibold">
                {club.organizers.length > 1 ? "Vezetők" : "Vezető"}
              </h2>
              <ul className="mt-2 flex flex-col gap-1 text-[15px]">
                {club.organizers.map((short) => (
                  <li key={short}>
                    {names.get(short) ?? short}
                    <span className="ml-2 text-xs text-muted-foreground">
                      {short}
                    </span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="mt-10" aria-labelledby="members-heading">
              <h2 id="members-heading" className="text-lg font-semibold">
                Tagok
                <span className="ml-2 text-sm font-normal tabular-nums text-muted-foreground">
                  {club.members.length}
                </span>
              </h2>
              {club.members.length === 0 ? (
                <p className="mt-2 text-sm text-muted-strong">
                  Még senki nem jelentkezett.
                </p>
              ) : (
                <ul className="mt-2 flex flex-wrap gap-2">
                  {club.members.map((m) => (
                    <li
                      key={m.id}
                      className="rounded-full border border-border px-3 py-1 text-sm"
                    >
                      {m.name}
                      {m.className && (
                        <span className="ml-1.5 text-xs text-muted-strong">
                          {m.className}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>
      </article>
    </ClubFrame>
  );
}
