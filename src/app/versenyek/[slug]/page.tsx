import { ArrowLeft, ArrowUpRight, MapPin } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { accentStyle } from "@/lib/accent";
import {
  canBrowseClubs,
  canManageCompetition,
  canSeeCompetition,
  canWithdraw,
  clubsLaunched,
  entryVerdict,
} from "@/lib/club-access";
import { resolveActor, teacherNames } from "@/lib/club-store";
import { audienceLabel } from "@/lib/clubs";
import { getCompetitionDetail } from "@/lib/competition-store";
import {
  CATEGORY_LABELS,
  deadlineLabel,
  deadlineOf,
  formatWhen,
  rankedEntries,
  STATUS_LABELS,
  VENUE_LABELS,
} from "@/lib/competitions";
import { cn } from "@/lib/utils";
import { ClubFrame } from "../../szakkorok/_components/club-frame";
import { ContestParticipation, type EntryState } from "./contest-participation";
import { ManageControls } from "./manage-controls";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: PageProps<"/versenyek/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  //! A CÍM UGYANAZON A KAPUN MEGY ÁT, MINT A LAP — a bevezetés előtt és a
  //! piszkozatnál a 404 böngészőfülén sem állhat ott a verseny neve (lásd
  //! ugyanezt a szakkör lapján).
  const generic = {
    title: "Verseny - Órarend",
    robots: { index: false },
  } satisfies Metadata;
  const actor = await resolveActor().catch(() => null);
  if (!canBrowseClubs(actor, clubsLaunched())) return generic;
  const c = await getCompetitionDetail(slug).catch(() => null);
  if (!c || !canSeeCompetition(actor, c)) return generic;
  return {
    title: `${c.name} - Órarend`,
    description: `${CATEGORY_LABELS[c.category]} · ${formatWhen(c.startsAt)}`,
  };
}

const VERDICT_TEXT = {
  "not-open": "Erre a versenyre most nem lehet nevezni.",
  deadline: "Lejárt a nevezési határidő.",
  audience: "Ez a verseny nem a te évfolyamodnak vagy osztályodnak szól.",
  full: "Betelt a létszám.",
} as const;

export default async function ContestPage({
  params,
}: PageProps<"/versenyek/[slug]">) {
  const { slug } = await params;
  const actor = await resolveActor();
  const launched = clubsLaunched();
  if (!canBrowseClubs(actor, launched)) notFound();

  const c = await getCompetitionDetail(slug);
  if (!c || !canSeeCompetition(actor, c)) notFound();

  const now = new Date();
  const names = await teacherNames();
  const manage = canManageCompetition(actor, c);
  const deadline = deadlineOf(c);

  //* A nevezés állapota a szerveren dől el, ugyanazzal a szabállyal, amit az
  //* action is megkérdez (`entryVerdict`) — a gomb így sosem ígér mást.
  const mine = actor
    ? c.entries.find((e) => e.userId === actor.userId)
    : undefined;
  let entry: EntryState = { kind: "none" };
  if (mine) {
    entry = { kind: "entered", canWithdraw: canWithdraw(c, now) };
  } else if (!actor?.isTeacher && c.status !== "DRAFT") {
    const verdict = entryVerdict(actor, c, c.entryCount, now);
    entry = verdict.ok
      ? { kind: "can-enter" }
      : verdict.reason === "login"
        ? c.status === "OPEN"
          ? { kind: "login" }
          : { kind: "none" }
        : c.status === "OPEN"
          ? { kind: "blocked", reason: VERDICT_TEXT[verdict.reason] }
          : { kind: "none" };
  }

  const where =
    c.venue === "SCHOOL"
      ? c.room
        ? `${c.room} terem`
        : VENUE_LABELS.SCHOOL
      : c.venue === "EXTERNAL"
        ? (c.location ?? VENUE_LABELS.EXTERNAL)
        : VENUE_LABELS.ONLINE;
  const finished = c.status === "FINISHED";
  const ranked = rankedEntries(c.entries);

  return (
    <ClubFrame subject="Versenyek" context={c.name} preview={!launched}>
      <Link
        href="/versenyek"
        className="inline-flex items-center gap-1.5 text-sm text-muted-strong transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Összes verseny
      </Link>

      <article className="mt-5 max-w-3xl" style={accentStyle(c.slug)}>
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-strong">
          <span className="acc-dot size-2.5 rounded-full" aria-hidden />
          {CATEGORY_LABELS[c.category]}
          <span
            className={cn(
              "rounded-full border px-2 py-0.5 text-xs font-medium",
              c.status === "OPEN"
                ? "border-foreground/40 text-foreground"
                : c.status === "CANCELLED"
                  ? "border-destructive/40 text-destructive"
                  : "border-border",
              c.status === "DRAFT" && "border-dashed",
            )}
          >
            {STATUS_LABELS[c.status]}
          </span>
        </div>
        <h1
          className={cn(
            "mt-2 text-pretty text-3xl font-bold tracking-tight sm:text-4xl",
            c.status === "CANCELLED" &&
              "line-through decoration-destructive/60",
          )}
        >
          {c.name}
        </h1>
        <p className="mt-2 text-sm text-muted-strong">{audienceLabel(c)}</p>

        <dl className="mt-6 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-border p-4">
            <dt className="text-xs text-muted-strong">Mikor</dt>
            <dd className="mt-1 font-medium tabular-nums">
              {formatWhen(c.startsAt)}
              {c.endsAt && ` – ${formatWhen(c.endsAt)}`}
            </dd>
            <dd className="mt-1 inline-flex items-center gap-1 text-sm text-muted-strong">
              <MapPin className="size-3.5" aria-hidden />
              {where}
            </dd>
          </div>
          <div
            className={cn(
              "rounded-xl border p-4",
              c.status === "OPEN" ? "border-foreground/40" : "border-border",
            )}
          >
            <dt className="text-xs text-muted-strong">Nevezési határidő</dt>
            <dd className="mt-1 font-medium tabular-nums">
              {formatWhen(deadline)}
            </dd>
            <dd className="mt-1 text-sm text-muted-strong">
              {c.status === "OPEN"
                ? deadlineLabel(deadline, now)
                : STATUS_LABELS[c.status]}
              {c.capacity
                ? ` · ${c.entryCount} / ${c.capacity} hely`
                : ` · ${c.entryCount} nevező`}
            </dd>
          </div>
        </dl>

        <div className="mt-6 flex flex-col gap-4">
          {c.status !== "DRAFT" && (
            <ContestParticipation slug={c.slug} entry={entry} />
          )}
          {manage && <ManageControls slug={c.slug} status={c.status} />}
        </div>

        {c.phases.length > 0 && (
          <section className="mt-10" aria-labelledby="phases-heading">
            <h2 id="phases-heading" className="text-lg font-semibold">
              Fordulók
            </h2>
            <ol className="mt-3 flex flex-col gap-2 border-l border-border pl-4">
              {c.phases.map((p) => (
                <li key={p.id}>
                  <p className="font-medium">{p.title}</p>
                  {(p.startsAt || p.endsAt) && (
                    <p className="text-sm tabular-nums text-muted-strong">
                      {p.startsAt && formatWhen(p.startsAt)}
                      {p.startsAt && p.endsAt && " – "}
                      {p.endsAt && formatWhen(p.endsAt)}
                    </p>
                  )}
                </li>
              ))}
            </ol>
          </section>
        )}

        <section className="mt-10" aria-labelledby="about-heading">
          <h2 id="about-heading" className="text-lg font-semibold">
            A versenyről
          </h2>
          {c.description ? (
            <p className="mt-2 whitespace-pre-line text-pretty text-[15px] leading-relaxed">
              {c.description}
            </p>
          ) : (
            <p className="mt-2 text-sm text-muted-strong">
              A leírást a szervező még nem írta meg.
            </p>
          )}
          {c.externalUrl && (
            <a
              href={c.externalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              A verseny hivatalos oldala
              <ArrowUpRight className="size-3.5" aria-hidden />
            </a>
          )}
        </section>

        {c.clubs.length > 0 && (
          <section className="mt-10" aria-labelledby="prep-heading">
            <h2 id="prep-heading" className="text-lg font-semibold">
              Felkészítő szakkör
            </h2>
            <ul className="mt-2 flex flex-col gap-1">
              {c.clubs.map((club) => (
                <li key={club.slug}>
                  <Link
                    href={`/szakkorok/${club.slug}`}
                    prefetch={false}
                    className="font-medium text-primary underline-offset-4 hover:underline"
                  >
                    {club.name}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="mt-10" aria-labelledby="org-heading">
          <h2 id="org-heading" className="text-lg font-semibold">
            Felelős tanár
          </h2>
          <ul className="mt-2 flex flex-col gap-1 text-[15px]">
            {c.teachers.map((short) => (
              <li key={short}>
                {names.get(short) ?? short}
                <span className="ml-2 text-xs text-muted-foreground">
                  {short}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-10" aria-labelledby="entries-heading">
          <h2 id="entries-heading" className="text-lg font-semibold">
            {finished ? "Eredmény" : "Nevezők"}
            <span className="ml-2 text-sm font-normal tabular-nums text-muted-foreground">
              {c.entries.length}
            </span>
          </h2>
          {c.entries.length === 0 ? (
            <p className="mt-2 text-sm text-muted-strong">
              Még senki nem nevezett.
            </p>
          ) : finished ? (
            //! AZ EREDMÉNY CSAK A LEZÁRT VERSENYNÉL NYILVÁNOS — lásd a sémát.
            <ol className="mt-3 divide-y divide-border rounded-xl border border-border">
              {ranked.map((e) => (
                <li
                  key={e.userId}
                  className="flex items-center gap-3 px-4 py-2.5"
                >
                  <span className="w-8 shrink-0 text-right font-semibold tabular-nums">
                    {e.rank ? `${e.rank}.` : ""}
                  </span>
                  <span className="min-w-0 flex-1">
                    {e.name}
                    {e.className && (
                      <span className="ml-1.5 text-xs text-muted-strong">
                        {e.className}
                      </span>
                    )}
                  </span>
                  {e.award && (
                    <span className="shrink-0 text-sm font-medium">
                      {e.award}
                    </span>
                  )}
                  {e.points !== null && (
                    <span className="shrink-0 text-sm tabular-nums text-muted-strong">
                      {e.points.toLocaleString("hu-HU")} pont
                    </span>
                  )}
                </li>
              ))}
            </ol>
          ) : (
            <ul className="mt-2 flex flex-wrap gap-2">
              {c.entries.map((e) => (
                <li
                  key={e.userId}
                  className="rounded-full border border-border px-3 py-1 text-sm"
                >
                  {e.name}
                  {e.className && (
                    <span className="ml-1.5 text-xs text-muted-strong">
                      {e.className}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </article>
    </ClubFrame>
  );
}
