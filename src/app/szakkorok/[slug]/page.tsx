import { ArrowLeft, ArrowUpRight, LogIn } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { accentStyle } from "@/lib/accent";
import {
  type Actor,
  canApproveClub,
  canBrowseClubs,
  canDeleteBoardItem,
  canEditClub,
  canReadBoard,
  canSeeClub,
  canWriteBoard,
  clubsLaunched,
} from "@/lib/club-access";
import { BOARD_PAGE, formatBoardTime } from "@/lib/club-board";
import {
  type BoardComment,
  boardViewerName,
  loadBoard,
} from "@/lib/club-board-store";
import { sessionsOfWeek } from "@/lib/club-schedule";
import {
  type ClubDetail,
  getClubDetail,
  resolveActor,
  teacherNames,
} from "@/lib/club-store";
import { audienceLabel, CLUB_KIND_LABELS } from "@/lib/clubs";
import { formatWhen } from "@/lib/competitions";
import { loadRoomsWeek } from "@/lib/free-rooms-source";
import { budapestNow } from "@/lib/push-plan";
import { addDays, mondayOf } from "@/lib/timetable";
import { cn } from "@/lib/utils";
import { ClubFrame } from "../_components/club-frame";
import { Avatar, Board, type BoardItemView } from "./board";
import { ClubControls } from "./club-controls";
import { ClubPlanner } from "./club-planner";
import { ClubTimes } from "./club-times";
import { Participation } from "./participation";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: PageProps<"/szakkorok/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  //! A CÍM UGYANAZON A KAPUN MEGY ÁT, MINT A LAP. A 404 is megkapja a
  //! `<title>`-t: ha itt nem kérdeznénk meg a bevezetés-kapcsolót és a
  //! láthatóságot, a bevezetés előtt — vagy egy idegen javaslatnál — a lap
  //! „nincs", a böngészőfül viszont kiírná a szakkör nevét. A `resolveActor`
  //! kérésenként egyszer fut (`cache`), a lap ugyanazt kapja vissza.
  const generic = {
    title: "Szakkör - Órarend",
    robots: { index: false },
  } satisfies Metadata;
  const actor = await resolveActor().catch(() => null);
  if (!canBrowseClubs(actor, clubsLaunched())) return generic;
  const club = await getClubDetail(slug).catch(() => null);
  if (!club || !canSeeClub(actor, club)) return generic;
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

//* ---------------------------------------------------------------------------
//* A LAP FÜLEI — A GOOGLE CLASSROOM KURZUSÁNAK MINTÁJÁRA
//* ---------------------------------------------------------------------------
//! BORÍTÓ, FÜLEK, HÍRFOLYAM. A szakkör nem egy adatlap, hanem egy közösség
//! helye: a lap a hírfolyammal nyílik (mint a Classroom „Stream" lapja), a
//! bal oszlopban a következő alkalmakkal és a jelentkezéssel. A tagok és a
//! részletek külön fülön, URL-ben (`?lap=tagok`) — megosztható, és a vissza
//! gomb is érti.
const TABS = [
  { id: "hirfolyam", label: "Hírfolyam" },
  { id: "tagok", label: "Tagok" },
  { id: "reszletek", label: "Részletek" },
] as const;
type Tab = (typeof TABS)[number]["id"];

function parseTab(value: string | string[] | undefined): Tab {
  return TABS.find((t) => t.id === value)?.id ?? "hirfolyam";
}

//* „Korábbi bejegyzések": lapozás helyett a betöltött darabszám nő, felső
//* korláttal — egy szakkör hírfolyamán ennél több úgysem kell egyszerre.
const BOARD_LIMIT_MAX = 300;
function parseLimit(value: string | string[] | undefined): number {
  const n = Number.parseInt(typeof value === "string" ? value : "", 10);
  if (!Number.isFinite(n)) return BOARD_PAGE;
  return Math.min(BOARD_LIMIT_MAX, Math.max(BOARD_PAGE, n));
}

export default async function ClubPage({
  params,
  searchParams,
}: PageProps<"/szakkorok/[slug]">) {
  const { slug } = await params;
  const query = await searchParams;
  const tab = parseTab(query.lap);
  const actor = await resolveActor();
  const launched = clubsLaunched();
  if (!canBrowseClubs(actor, launched)) notFound();

  const club = await getClubDetail(slug);
  if (!club || !canSeeClub(actor, club)) notFound();

  const leads =
    actor?.teacher !== null &&
    actor?.teacher !== undefined &&
    club.organizers.includes(actor.teacher);
  const own = actor !== null && club.proposedById === actor.userId;
  const approve = canApproveClub(actor, club);
  const editable = canEditClub(actor, club);
  const isMember =
    actor !== null && club.members.some((m) => m.id === actor.userId);

  const tabHref = (id: Tab) =>
    id === "hirfolyam" ? `/szakkorok/${club.slug}` : `?lap=${id}`;

  return (
    <ClubFrame subject="Szakkörök" context={club.name} preview={!launched}>
      <Link
        href="/szakkorok"
        className="group inline-flex items-center gap-1.5 rounded-full text-sm text-muted-strong transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <ArrowLeft
          className="size-4 transition-transform duration-150 group-hover:-translate-x-0.5 motion-reduce:transition-none"
          aria-hidden
        />
        Összes szakkör
      </Link>

      <article className="mt-4" style={accentStyle(club.slug)}>
        {/*//! A BORÍTÓ A SZAKKÖR SZÍNE, mint a Classroom kurzusainak fejléce: a
            //! lista pöttye itt egy egész sáv. A név alul ül, a borító alján —
            //! fölötte a szín beszél. */}
        <header className="acc-banner relative overflow-hidden rounded-3xl px-5 pt-20 pb-5 shadow-sm sm:px-8 sm:pt-28 sm:pb-7">
          <h1 className="max-w-3xl text-pretty text-3xl font-bold tracking-tight sm:text-4xl">
            {club.name}
          </h1>
          <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-white/85">
            <span>
              {CLUB_KIND_LABELS[club.kind]} · {audienceLabel(club)}
              {club.audienceNote ? ` · ${club.audienceNote}` : ""}
            </span>
            {club.status === "PROPOSED" && (
              <span className="rounded-full border border-dashed border-white/60 px-2 py-0.5 text-xs font-medium text-white">
                Javaslat — még nem él
              </span>
            )}
            {club.status === "ARCHIVED" && (
              <span className="rounded-full border border-white/60 px-2 py-0.5 text-xs font-medium text-white">
                Megszűnt
              </span>
            )}
          </p>
        </header>

        {club.status === "PROPOSED" && (
          <p className="mt-4 text-pretty rounded-lg border border-dashed border-border px-3 py-2 text-sm text-muted-strong">
            {approve
              ? "Egy diák téged kért fel ennek a szakkörnek a vezetésére. Ha vállalod, hagyd jóvá — onnantól mindenki látja."
              : own
                ? "A javaslatod a felkért tanárnál van. Amíg jóvá nem hagyja, csak te és ő látjátok."
                : "Ez a javaslat még jóváhagyásra vár."}
          </p>
        )}

        <div className="mt-4 empty:hidden">
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

        <nav
          aria-label="A szakkör lapjai"
          className="mt-4 -mx-4 flex gap-1 overflow-x-auto border-b border-border px-4 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden"
        >
          {TABS.map((t) => (
            <Link
              key={t.id}
              href={tabHref(t.id)}
              scroll={false}
              aria-current={tab === t.id ? "page" : undefined}
              className={cn(
                "-mb-px inline-flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium whitespace-nowrap transition-colors duration-150 touch-target focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring active:text-foreground",
                tab === t.id
                  ? "acc-text border-current"
                  : "border-transparent text-muted-strong hover:text-foreground",
              )}
            >
              {t.label}
              {t.id === "tagok" && (
                <span className="text-xs font-normal tabular-nums text-muted-foreground">
                  {club.members.length}
                </span>
              )}
            </Link>
          ))}
        </nav>

        {tab === "hirfolyam" && (
          <StreamTab
            club={club}
            actor={actor}
            isMember={isMember}
            limit={parseLimit(query.n)}
          />
        )}
        {tab === "tagok" && <PeopleTab club={club} />}
        {tab === "reszletek" && <DetailsTab club={club} editable={editable} />}
      </article>
    </ClubFrame>
  );
}

//* ---------------------------------------------------------------------------
//* HÍRFOLYAM
//* ---------------------------------------------------------------------------
async function StreamTab({
  club,
  actor,
  isMember,
  limit,
}: {
  club: ClubDetail;
  actor: Actor | null;
  isMember: boolean;
  limit: number;
}) {
  const week = focusWeek();
  const rooms = club.slots.flatMap((s) =>
    s.source === "TIMETABLE" && s.room ? [s.room] : [],
  );
  const readable = canReadBoard(actor, club);
  const [occupancy, board, viewer] = await Promise.all([
    loadRoomsWeek(rooms, week).catch(() => null),
    readable ? loadBoard(club.id, limit) : null,
    actor && readable ? boardViewerName(actor.userId) : null,
  ]);
  const sessions = sessionsOfWeek([club], occupancy, week);
  const canWrite = canWriteBoard(actor, club, isMember);

  const now = new Date();
  const view = (item: BoardComment): BoardItemView => ({
    id: item.id,
    body: item.body,
    when: formatBoardTime(item.createdAt, now),
    iso: item.createdAt.toISOString(),
    author: {
      name: item.author.name,
      className: item.author.className,
      teacher: item.author.teacher,
      me: actor?.userId === item.author.id,
    },
    canDelete: canDeleteBoardItem(actor, club, item.author.id),
  });

  return (
    //! A DÖNTÉS OSZLOPA BALRA KERÜLT, mint a Classroom „Közelgő" kártyája:
    //! széles képernyőn végig a hírfolyam mellett marad. Mobilon a hírfolyam
    //! jön ELŐBB — a lap a beszélgetésé, az időpontok és a jelentkezés alatta.
    <div className="mt-6 grid gap-6 lg:grid-cols-[20rem_minmax(0,1fr)] lg:gap-8">
      <aside className="order-last flex min-w-0 flex-col gap-6 lg:sticky lg:top-20 lg:order-none lg:self-start">
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
            isMember={isMember}
            canJoin={club.status === "ACTIVE"}
          />
        )}
      </aside>

      <div className="min-w-0">
        {club.status === "PROPOSED" ? (
          <p className="rounded-2xl border border-dashed border-border px-4 py-3 text-sm text-muted-strong">
            A hírfolyam a jóváhagyás után nyílik meg.
          </p>
        ) : !board ? (
          //! BELÉPÉS NÉLKÜL A HÍRFOLYAM NEM LÁTSZIK (döntés, 2026-10-03): ide
          //! diákok írnak a nevükkel. A tagság és az időpont attól még
          //! mindenkié — azok a bal oszlopban és a „Tagok" fülön ott vannak.
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 rounded-2xl border border-border bg-card px-5 py-5">
            <p className="text-pretty text-[15px] font-semibold text-foreground">
              A hírfolyamot a belépett jedlikesek látják.
            </p>
            <Link
              href={`/belepes?tovabb=${encodeURIComponent(`/szakkorok/${club.slug}`)}`}
              className="press inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <LogIn className="size-4" aria-hidden />
              Belépés
            </Link>
          </div>
        ) : (
          <Board
            slug={club.slug}
            posts={board.posts.map((post) => ({
              ...view(post),
              comments: post.comments.map(view),
            }))}
            canWrite={canWrite}
            viewerName={viewer ?? ""}
            closedNote={
              club.status === "ARCHIVED"
                ? "A szakkör megszűnt — a hírfolyam már csak olvasható."
                : "Ide a szakkör tagjai és vezetői írnak. Jelentkezz, és te is hozzászólhatsz."
            }
            moreHref={
              board.more
                ? `/szakkorok/${club.slug}?n=${limit + BOARD_PAGE}`
                : null
            }
          />
        )}
      </div>
    </div>
  );
}

//* ---------------------------------------------------------------------------
//* TAGOK — mint a Classroom „Személyek" lapja: előbb a vezetők, aztán a tagok
//* ---------------------------------------------------------------------------
async function PeopleTab({ club }: { club: ClubDetail }) {
  const names = await teacherNames();
  const heading =
    "acc-text border-b border-current/40 pb-2 text-xl font-semibold";
  const row =
    "flex items-center gap-3 border-b border-border py-3 last:border-b-0";
  return (
    <div className="mt-8 flex max-w-3xl flex-col gap-10">
      <section aria-labelledby="lead-heading">
        <h2 id="lead-heading" className={heading}>
          {club.organizers.length > 1 ? "Vezetők" : "Vezető"}
        </h2>
        <ul>
          {club.organizers.map((short) => {
            const name = names.get(short) ?? short;
            return (
              <li key={short} className={row}>
                <Avatar name={name} />
                <span className="text-[15px] text-foreground">{name}</span>
                <span className="text-xs text-muted-foreground">{short}</span>
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="members-heading">
        <h2
          id="members-heading"
          className={cn(heading, "flex items-baseline justify-between gap-4")}
        >
          Tagok
          <span className="text-sm font-normal tabular-nums text-muted-strong">
            {club.members.length} tag
          </span>
        </h2>
        {club.members.length === 0 ? (
          <p className="py-3 text-sm text-muted-strong">
            Még senki nem jelentkezett.
          </p>
        ) : (
          <ul>
            {club.members.map((m) => (
              <li key={m.id} className={row}>
                <Avatar name={m.name} />
                <span className="text-[15px] text-foreground">{m.name}</span>
                {m.className && (
                  <span className="text-xs text-muted-strong">
                    {m.className}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

//* ---------------------------------------------------------------------------
//* RÉSZLETEK — a leírás, a verseny és a vezetőnek az időpont-kereső
//* ---------------------------------------------------------------------------
function DetailsTab({
  club,
  editable,
}: {
  club: ClubDetail;
  editable: boolean;
}) {
  return (
    <div className="mt-8 max-w-3xl *:first:mt-0">
      <section aria-labelledby="about-heading">
        <h2 id="about-heading" className="text-lg font-semibold">
          A szakkörről
        </h2>
        {club.description ? (
          <p className="mt-2 max-w-prose whitespace-pre-line text-pretty text-[15px] leading-relaxed text-foreground">
            {club.description}
          </p>
        ) : (
          <p className="mt-2 text-sm text-muted-strong">
            A leírást a vezető tanár még nem írta meg.
          </p>
        )}
      </section>

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
                  className="group inline-flex items-center gap-1 font-medium text-primary underline-offset-4 hover:underline"
                >
                  {c.name}
                  <ArrowUpRight
                    className="club-nudge size-3.5 opacity-70"
                    aria-hidden
                  />
                </Link>
                <span className="ml-2 text-sm text-muted-strong">
                  {formatWhen(c.startsAt)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {editable && club.status !== "ARCHIVED" && (
        <div className="mt-10">
          <ClubPlanner
            slug={club.slug}
            defaultDuration={
              club.slots[0]
                ? club.slots[0].endMinute - club.slots[0].startMinute
                : 45
            }
          />
        </div>
      )}
    </div>
  );
}
