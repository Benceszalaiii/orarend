"use client";

import {
  Check,
  ChevronDown,
  ExternalLink,
  Pencil,
  Search,
  X,
} from "lucide-react";
import Link from "next/link";
import { useDeferredValue, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  CLUB_STATUS_LABELS,
  type ClubStatus,
  clubDeleteWarning,
  matchesQuery,
} from "@/lib/admin-content";
import { CLUB_KIND_LABELS, type ClubKind } from "@/lib/clubs";
import { cn } from "@/lib/utils";
import {
  approveClub,
  archiveClub,
  rejectProposal,
} from "../../szakkorok/actions";
import { useRowAction } from "../_components/use-row-action";
import { deleteClub, removeClubMember, restoreClub } from "./actions";

export type AdminClubRow = {
  id: string;
  slug: string;
  name: string;
  kind: ClubKind;
  status: ClubStatus;
  createdAt: string;
  confirmedAt: string;
  stale: boolean;
  organizers: { short: string; name: string | null }[];
  hasSlots: boolean;
  postCount: number;
  members: {
    userId: string;
    name: string;
    class: string | null;
    isTeacher: boolean;
    joinedAt: string;
  }[];
};

const DATE_FMT = new Intl.DateTimeFormat("hu-HU", { dateStyle: "medium" });

const FILTERS = [
  { value: "all", label: "Mind" },
  { value: "ACTIVE", label: "Él" },
  { value: "PROPOSED", label: "Javaslat" },
  { value: "ARCHIVED", label: "Megszűnt" },
  { value: "stale", label: "Megerősítésre vár" },
  { value: "no-slot", label: "Időpont nélkül" },
] as const;

type Filter = (typeof FILTERS)[number]["value"];

function matchesFilter(row: AdminClubRow, filter: Filter): boolean {
  switch (filter) {
    case "all":
      return true;
    case "stale":
      return row.stale;
    case "no-slot":
      return row.status === "ACTIVE" && !row.hasSlots;
    default:
      return row.status === filter;
  }
}

const STATUS_TONE: Record<ClubStatus, string> = {
  ACTIVE: "border-border text-muted-strong",
  PROPOSED: "border-primary/50 bg-primary/10 text-foreground",
  ARCHIVED: "border-dashed border-border text-muted-foreground",
};

export function ClubManager({ rows }: { rows: AdminClubRow[] }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const deferredQuery = useDeferredValue(query);

  const proposals = rows.filter((r) => r.status === "PROPOSED");
  const filtered = useMemo(
    () =>
      rows.filter(
        (row) =>
          matchesFilter(row, filter) &&
          matchesQuery(deferredQuery, [
            row.name,
            row.slug,
            ...row.organizers.flatMap((o) => [o.short, o.name]),
          ]),
      ),
    [rows, filter, deferredQuery],
  );

  return (
    <>
      {/*//! A DÖNTÉSRE VÁRÓ ELŐRE KERÜL. A javaslatot elvileg a felkért tanár
          //! hagyja jóvá; ha hetekig nem teszi, az üzemeltető a vészkijárat
          //! (lásd `canApproveClub`). Ezért nem bújhat el a lista közepén. */}
      {proposals.length > 0 && (
        <section aria-labelledby="proposals-heading" className="mt-8">
          <h2
            id="proposals-heading"
            className="text-base font-semibold text-foreground"
          >
            Jóváhagyásra vár
            <span className="ml-2 text-sm font-normal tabular-nums text-muted-foreground">
              {proposals.length}
            </span>
          </h2>
          <ul className="mt-3 divide-y divide-border overflow-hidden rounded-xl border border-primary/40 bg-card">
            {proposals.map((row) => (
              <ProposalRow key={row.id} row={row} />
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="clubs-heading" className="mt-10">
        <h2
          id="clubs-heading"
          className="text-base font-semibold text-foreground"
        >
          Minden szakkör
        </h2>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
          <label className="relative flex-1">
            <span className="sr-only">Keresés</span>
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Név vagy tanár"
              className="h-9 w-full rounded-md border border-input bg-background pr-3 pl-9 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            />
          </label>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as Filter)}
            aria-label="Szűrés"
            className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            {FILTERS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label} (
                {rows.filter((r) => matchesFilter(r, f.value)).length})
              </option>
            ))}
          </select>
        </div>

        {filtered.length === 0 ? (
          <p className="mt-6 text-sm text-muted-foreground">
            Nincs a szűrésnek megfelelő szakkör.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
            {filtered.map((row) => (
              <ClubRow key={row.id} row={row} />
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function organizerText(row: AdminClubRow): string {
  if (row.organizers.length === 0) return "nincs vezető";
  return row.organizers
    .map((o) => (o.name ? `${o.name} (${o.short})` : o.short))
    .join(", ");
}

function ProposalRow({ row }: { row: AdminClubRow }) {
  const { pending, error, run } = useRowAction();
  return (
    <li className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <Link
          href={`/szakkorok/${row.slug}`}
          className="font-medium text-foreground underline-offset-4 hover:underline"
        >
          {row.name}
        </Link>
        <p className="mt-0.5 text-xs text-muted-strong">
          Diák javasolta · {DATE_FMT.format(new Date(row.createdAt))} · felkért
          tanár: {organizerText(row)}
        </p>
        {error && (
          <p role="alert" className="mt-1 text-xs text-destructive">
            {error}
          </p>
        )}
      </div>
      <div className="flex shrink-0 gap-2">
        <Button
          size="sm"
          className="rounded-full"
          disabled={pending}
          onClick={() =>
            run(
              () => approveClub(row.slug),
              `Jóváhagyod a felkért tanár helyett: „${row.name}"? Azonnal megjelenik a diákoknak.`,
            )
          }
        >
          <Check aria-hidden />
          Jóváhagyás
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="rounded-full"
          disabled={pending}
          onClick={() =>
            run(
              () => rejectProposal(row.slug),
              `Elutasítod és törlöd a javaslatot: „${row.name}"?`,
            )
          }
        >
          <X aria-hidden />
          Elutasítás
        </Button>
      </div>
    </li>
  );
}

function ClubRow({ row }: { row: AdminClubRow }) {
  const { pending, error, run } = useRowAction();
  const [open, setOpen] = useState(false);
  const panelId = `club-${row.id}-members`;

  return (
    <li className={cn(row.status === "ARCHIVED" && "bg-muted/30")}>
      <div className="flex flex-col gap-2 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/szakkorok/${row.slug}`}
              className="font-medium text-foreground underline-offset-4 hover:underline"
            >
              {row.name}
            </Link>
            <span
              className={cn(
                "rounded-full border px-2 py-0.5 text-[11px] font-medium",
                STATUS_TONE[row.status],
              )}
            >
              {CLUB_STATUS_LABELS[row.status]}
            </span>
            {row.stale && (
              <span
                className="rounded-full border border-amber-500/50 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-foreground"
                title="A csak tanár szerinti időpontot régen erősítette meg vezető"
              >
                Megerősítés: {DATE_FMT.format(new Date(row.confirmedAt))}
              </span>
            )}
            {row.status === "ACTIVE" && !row.hasSlots && (
              <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-strong">
                Időpont nélkül
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-muted-strong">
            {CLUB_KIND_LABELS[row.kind]} · {organizerText(row)}
          </p>
          {error && (
            <p role="alert" className="mt-1 text-xs text-destructive">
              {error}
            </p>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls={panelId}
            className="inline-flex h-8 items-center gap-1 rounded-full px-2.5 text-xs text-muted-strong tabular-nums hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
          >
            {row.members.length} tag · {row.postCount} bejegyzés
            <ChevronDown
              className={cn(
                "size-3.5 transition-transform motion-reduce:transition-none",
                open && "rotate-180",
              )}
              aria-hidden
            />
          </button>
          <Button asChild size="sm" variant="ghost" className="rounded-full">
            <Link href={`/szakkorok/${row.slug}/szerkesztes`}>
              <Pencil aria-hidden />
              Szerkesztés
            </Link>
          </Button>
          {row.status === "ACTIVE" && (
            <Button
              size="sm"
              variant="outline"
              className="rounded-full"
              disabled={pending}
              onClick={() =>
                run(
                  () => archiveClub(row.slug),
                  `Lezárod: „${row.name}"? A lapja megmarad, de a listákból és az órarendből kiesik.`,
                )
              }
            >
              Lezárás
            </Button>
          )}
          {row.status === "ARCHIVED" && (
            <Button
              size="sm"
              variant="outline"
              className="rounded-full"
              disabled={pending}
              onClick={() => run(() => restoreClub(row.slug))}
            >
              Újranyitás
            </Button>
          )}
          {row.status !== "PROPOSED" && (
            <Button
              size="sm"
              variant="ghost"
              className="rounded-full text-destructive hover:text-destructive"
              disabled={pending}
              onClick={() =>
                run(
                  () => deleteClub(row.slug),
                  clubDeleteWarning({
                    name: row.name,
                    memberCount: row.members.length,
                    postCount: row.postCount,
                  }),
                )
              }
            >
              Törlés
            </Button>
          )}
        </div>
      </div>

      {open && (
        <div
          id={panelId}
          className="border-t border-border bg-background/40 px-4 py-3"
        >
          {row.members.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Még senki nem jelentkezett.
            </p>
          ) : (
            <ul className="flex flex-col gap-1">
              {row.members.map((m) => (
                <MemberRow key={m.userId} clubId={row.id} member={m} />
              ))}
            </ul>
          )}
          <Link
            href={`/szakkorok/${row.slug}`}
            className="mt-3 inline-flex items-center gap-1 text-xs text-primary underline-offset-4 hover:underline"
          >
            A szakkör lapja és hírfolyama
            <ExternalLink className="size-3" aria-hidden />
          </Link>
        </div>
      )}
    </li>
  );
}

function MemberRow({
  clubId,
  member,
}: {
  clubId: string;
  member: AdminClubRow["members"][number];
}) {
  const { pending, error, run } = useRowAction();
  return (
    <li className="flex items-center justify-between gap-3 text-sm">
      <span className="min-w-0 truncate text-foreground">
        {member.name}
        <span className="ml-1.5 text-xs text-muted-strong">
          {member.isTeacher ? "tanár" : (member.class ?? "osztály nélkül")} ·{" "}
          {DATE_FMT.format(new Date(member.joinedAt))}
        </span>
        {error && (
          <span role="alert" className="ml-2 text-xs text-destructive">
            {error}
          </span>
        )}
      </span>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          run(
            () => removeClubMember(clubId, member.userId),
            `Eltávolítod ${member.name} jelentkezését?`,
          )
        }
        className="shrink-0 rounded-full px-2 py-1 text-xs text-muted-strong hover:bg-muted hover:text-destructive focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50"
      >
        Eltávolítás
      </button>
    </li>
  );
}
