"use client";

import { ChevronDown, Pencil, Search } from "lucide-react";
import Link from "next/link";
import { useDeferredValue, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  CONTEST_ATTENTION_LABELS,
  type ContestAttention,
  contestDeleteWarning,
  matchesQuery,
} from "@/lib/admin-content";
import {
  CATEGORY_LABELS,
  COMPETITION_STATUSES,
  type CompetitionCategory,
  type CompetitionStatus,
  formatWhen,
  STATUS_LABELS,
} from "@/lib/competitions";
import { cn } from "@/lib/utils";
import { setCompetitionStatus } from "../../versenyek/actions";
import { useRowAction } from "../_components/use-row-action";
import { deleteCompetition, removeEntry } from "./actions";

export type AdminContestRow = {
  id: string;
  slug: string;
  name: string;
  category: CompetitionCategory;
  status: CompetitionStatus;
  startsAt: string;
  registrationDeadline: string | null;
  capacity: number | null;
  attention: ContestAttention;
  createdBy: string | null;
  teachers: { short: string; name: string | null }[];
  entries: {
    userId: string;
    name: string;
    class: string | null;
    createdAt: string;
    rank: number | null;
    award: string | null;
  }[];
};

const FILTERS = [
  { value: "all", label: "Mind" },
  { value: "attention", label: "Lépésre vár" },
  ...COMPETITION_STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s] })),
] as const;

type Filter = "all" | "attention" | CompetitionStatus;

function matchesFilter(row: AdminContestRow, filter: Filter): boolean {
  if (filter === "all") return true;
  if (filter === "attention") return row.attention !== null;
  return row.status === filter;
}

//! AZ ÁLLAPOTVÁLTÁS, AMI A DIÁKOKNAK HÍR, MEGERŐSÍTÉST KÉR. A verseny lapján
//! ugyanezek a kérdések állnak (`manage-controls.tsx`); az üzemeltető bármelyik
//! állapotba léphet, de a látható következményt neki is ki kell mondani.
const CONFIRM: Partial<Record<CompetitionStatus, string>> = {
  OPEN: "Megnyitod a nevezést? Innentől minden diák látja a versenyt.",
  FINISHED:
    "Közzéteszed az eredményt? A rögzített helyezések és díjak nyilvánosak lesznek.",
  CANCELLED: "Elmarad a verseny? A nevezők és a követők látni fogják.",
  DRAFT: "Visszateszed piszkozatba? A diákok elől eltűnik.",
};

const FIELD =
  "h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

export function ContestManager({ rows }: { rows: AdminContestRow[] }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const deferredQuery = useDeferredValue(query);

  const filtered = useMemo(
    () =>
      rows.filter(
        (row) =>
          matchesFilter(row, filter) &&
          matchesQuery(deferredQuery, [
            row.name,
            row.slug,
            row.createdBy,
            CATEGORY_LABELS[row.category],
            ...row.teachers.flatMap((t) => [t.short, t.name]),
          ]),
      ),
    [rows, filter, deferredQuery],
  );

  return (
    <section aria-labelledby="contests-heading" className="mt-10">
      <h2
        id="contests-heading"
        className="text-base font-semibold text-foreground"
      >
        Minden verseny
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
            placeholder="Név, kategória, tanár vagy létrehozó"
            className={cn(FIELD, "w-full pl-9")}
          />
        </label>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as Filter)}
          aria-label="Szűrés"
          className={FIELD}
        >
          {FILTERS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label} ({rows.filter((r) => matchesFilter(r, f.value)).length})
            </option>
          ))}
        </select>
      </div>

      {filtered.length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">
          Nincs a szűrésnek megfelelő verseny.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
          {filtered.map((row) => (
            <ContestRow key={row.id} row={row} />
          ))}
        </ul>
      )}
    </section>
  );
}

function teacherText(row: AdminContestRow): string {
  if (row.teachers.length === 0) return "nincs felelős tanár";
  return row.teachers
    .map((t) => (t.name ? `${t.name} (${t.short})` : t.short))
    .join(", ");
}

function ContestRow({ row }: { row: AdminContestRow }) {
  const { pending, error, run } = useRowAction();
  const [open, setOpen] = useState(false);
  const panelId = `contest-${row.id}-entries`;
  const deadline = row.registrationDeadline ?? row.startsAt;

  return (
    <li
      className={cn(
        (row.status === "DRAFT" || row.status === "CANCELLED") && "bg-muted/30",
      )}
    >
      <div className="flex flex-col gap-2 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/versenyek/${row.slug}`}
              className="font-medium text-foreground underline-offset-4 hover:underline"
            >
              {row.name}
            </Link>
            {row.attention && (
              <span className="rounded-full border border-primary/50 bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-foreground">
                {CONTEST_ATTENTION_LABELS[row.attention]}
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-muted-strong">
            {CATEGORY_LABELS[row.category]} ·{" "}
            {formatWhen(new Date(row.startsAt))} · határidő:{" "}
            {formatWhen(new Date(deadline))}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {teacherText(row)}
            {row.createdBy && ` · felvitte: ${row.createdBy}`}
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
            {row.entries.length}
            {row.capacity !== null && `/${row.capacity}`} nevező
            <ChevronDown
              className={cn(
                "size-3.5 transition-transform motion-reduce:transition-none",
                open && "rotate-180",
              )}
              aria-hidden
            />
          </button>
          <select
            value={row.status}
            disabled={pending}
            aria-label={`${row.name} állapota`}
            onChange={(e) => {
              const to = e.target.value as CompetitionStatus;
              run(() => setCompetitionStatus(row.slug, to), CONFIRM[to]);
            }}
            className="h-8 rounded-full border border-input bg-background px-3 text-xs text-foreground outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50"
          >
            {COMPETITION_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
          <Button asChild size="sm" variant="ghost" className="rounded-full">
            <Link href={`/versenyek/${row.slug}/szerkesztes`}>
              <Pencil aria-hidden />
              Szerkesztés, eredmény
            </Link>
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="rounded-full text-destructive hover:text-destructive"
            disabled={pending}
            onClick={() =>
              run(
                () => deleteCompetition(row.slug),
                contestDeleteWarning({
                  name: row.name,
                  status: row.status,
                  entryCount: row.entries.length,
                }),
              )
            }
          >
            Törlés
          </Button>
        </div>
      </div>

      {open && (
        <div
          id={panelId}
          className="border-t border-border bg-background/40 px-4 py-3"
        >
          {row.entries.length === 0 ? (
            <p className="text-xs text-muted-foreground">Még nincs nevező.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {row.entries.map((entry) => (
                <EntryRow
                  key={entry.userId}
                  competitionId={row.id}
                  entry={entry}
                />
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}

const DATE_FMT = new Intl.DateTimeFormat("hu-HU", { dateStyle: "medium" });

function EntryRow({
  competitionId,
  entry,
}: {
  competitionId: string;
  entry: AdminContestRow["entries"][number];
}) {
  const { pending, error, run } = useRowAction();
  const result = [
    entry.rank !== null ? `${entry.rank}. hely` : null,
    entry.award,
  ]
    .filter(Boolean)
    .join(", ");
  return (
    <li className="flex items-center justify-between gap-3 text-sm">
      <span className="min-w-0 truncate text-foreground">
        {entry.name}
        <span className="ml-1.5 text-xs text-muted-strong">
          {entry.class ?? "osztály nélkül"} ·{" "}
          {DATE_FMT.format(new Date(entry.createdAt))}
          {result && ` · ${result}`}
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
            () => removeEntry(competitionId, entry.userId),
            `Törlöd ${entry.name} nevezését${result ? " és az eredményét" : ""}?`,
          )
        }
        className="shrink-0 rounded-full px-2 py-1 text-xs text-muted-strong hover:bg-muted hover:text-destructive focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50"
      >
        Nevezés törlése
      </button>
    </li>
  );
}
