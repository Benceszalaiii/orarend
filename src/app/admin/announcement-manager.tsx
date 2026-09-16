"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import {
  type ReactNode,
  useActionState,
  useEffect,
  useState,
  useTransition,
} from "react";
import { Button } from "@/components/ui/button";
import {
  ANNOUNCEMENT_KINDS,
  ANNOUNCEMENT_TONES,
  type AnnouncementKind,
  type AnnouncementTone,
  KIND_LABELS,
  TONE_LABELS,
} from "@/lib/announcements";
import { cn } from "@/lib/utils";
import {
  deleteAnnouncement,
  type SaveState,
  saveAnnouncement,
  setAnnouncementActive,
} from "./actions";

export type AnnouncementRow = {
  id: string;
  kind: AnnouncementKind;
  tone: AnnouncementTone;
  title: string | null;
  message: string;
  paths: string[];
  active: boolean;
  startsAt: string | null;
  endsAt: string | null;
  updatedAt: string;
};

const FIELD =
  "rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

const DATE_FMT = new Intl.DateTimeFormat("hu-HU", {
  dateStyle: "short",
  timeStyle: "short",
});

//* ISO → a `datetime-local` mező HELYI idejű értéke.
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function toIso(local: string): string {
  if (!local) return "";
  const d = new Date(local);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString();
}

export function AnnouncementManager({ rows }: { rows: AnnouncementRow[] }) {
  //* `null` = zárva, `"new"` = új, egyébként a szerkesztett sor.
  const [editing, setEditing] = useState<AnnouncementRow | "new" | null>(null);

  return (
    <div className="mt-8 flex flex-col gap-6">
      {editing ? (
        <AnnouncementForm
          key={editing === "new" ? "new" : editing.id}
          row={editing === "new" ? null : editing}
          onDone={() => setEditing(null)}
        />
      ) : (
        <Button className="self-start" onClick={() => setEditing("new")}>
          <Plus aria-hidden />
          Új közlemény
        </Button>
      )}

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Még nincs közlemény.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((row) => (
            <AnnouncementItem
              key={row.id}
              row={row}
              onEdit={() => setEditing(row)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function AnnouncementItem({
  row,
  onEdit,
}: {
  row: AnnouncementRow;
  onEdit: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const now = Date.now();
  const scheduled = row.startsAt && new Date(row.startsAt).getTime() > now;
  const expired = row.endsAt && new Date(row.endsAt).getTime() <= now;
  const status = !row.active
    ? "Kikapcsolva"
    : expired
      ? "Lejárt"
      : scheduled
        ? "Ütemezve"
        : "Él";

  return (
    <li
      className={cn(
        "rounded-lg border border-border bg-card p-4",
        (status !== "Él" || pending) && "opacity-70",
      )}
    >
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span
          className={cn(
            "rounded-full px-2 py-0.5 font-medium",
            status === "Él"
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground",
          )}
        >
          {status}
        </span>
        <span className="text-muted-foreground">
          {KIND_LABELS[row.kind]} · {TONE_LABELS[row.tone]}
        </span>
      </div>
      {row.title && (
        <p className="mt-2 text-sm font-semibold text-foreground">
          {row.title}
        </p>
      )}
      <p className="mt-1 whitespace-pre-line text-sm text-foreground">
        {row.message}
      </p>
      <p className="mt-2 font-mono text-xs text-muted-foreground">
        {row.paths.join(", ")}
      </p>
      {(row.startsAt || row.endsAt) && (
        <p className="mt-1 text-xs text-muted-foreground">
          {row.startsAt ? DATE_FMT.format(new Date(row.startsAt)) : "…"} –{" "}
          {row.endsAt ? DATE_FMT.format(new Date(row.endsAt)) : "…"}
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() =>
            startTransition(() => setAnnouncementActive(row.id, !row.active))
          }
        >
          {row.active ? "Kikapcsolás" : "Bekapcsolás"}
        </Button>
        <Button size="sm" variant="outline" disabled={pending} onClick={onEdit}>
          <Pencil aria-hidden />
          Szerkesztés
        </Button>
        <Button
          size="sm"
          variant="destructive"
          disabled={pending}
          onClick={() => {
            if (!window.confirm("Biztosan törlöd ezt a közleményt?")) return;
            startTransition(() => deleteAnnouncement(row.id));
          }}
        >
          <Trash2 aria-hidden />
          Törlés
        </Button>
      </div>
    </li>
  );
}

function AnnouncementForm({
  row,
  onDone,
}: {
  row: AnnouncementRow | null;
  onDone: () => void;
}) {
  const [state, formAction, pending] = useActionState<SaveState, FormData>(
    saveAnnouncement,
    {},
  );
  const [startsAt, setStartsAt] = useState(toLocalInput(row?.startsAt ?? null));
  const [endsAt, setEndsAt] = useState(toLocalInput(row?.endsAt ?? null));

  useEffect(() => {
    if (state.ok) onDone();
  }, [state, onDone]);

  return (
    <form
      action={formAction}
      className="flex flex-col gap-4 rounded-lg border border-border bg-card p-5"
    >
      <h2 className="text-base font-semibold text-foreground">
        {row ? "Közlemény szerkesztése" : "Új közlemény"}
      </h2>
      {row && <input type="hidden" name="id" value={row.id} />}
      <input type="hidden" name="startsAt" value={toIso(startsAt)} />
      <input type="hidden" name="endsAt" value={toIso(endsAt)} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Forma" htmlFor="a-kind">
          <select
            id="a-kind"
            name="kind"
            defaultValue={row?.kind ?? "BAR"}
            className={cn(FIELD, "h-10")}
          >
            {ANNOUNCEMENT_KINDS.map((k) => (
              <option key={k} value={k}>
                {KIND_LABELS[k]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Hangnem" htmlFor="a-tone">
          <select
            id="a-tone"
            name="tone"
            defaultValue={row?.tone ?? "INFO"}
            className={cn(FIELD, "h-10")}
          >
            {ANNOUNCEMENT_TONES.map((t) => (
              <option key={t} value={t}>
                {TONE_LABELS[t]}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="Cím (nem kötelező)" htmlFor="a-title">
        <input
          id="a-title"
          name="title"
          maxLength={120}
          defaultValue={row?.title ?? ""}
          className={cn(FIELD, "h-10")}
        />
      </Field>

      <Field label="Üzenet" htmlFor="a-message">
        <textarea
          id="a-message"
          name="message"
          required
          maxLength={1000}
          rows={3}
          defaultValue={row?.message ?? ""}
          className={cn(FIELD, "py-2")}
        />
      </Field>

      <Field
        label="Lapok"
        htmlFor="a-paths"
        hint="Vesszővel vagy új sorral elválasztva. * = minden lap, /orarend = pontosan az, /tanari/* = az és minden alatta."
      >
        <input
          id="a-paths"
          name="paths"
          required
          defaultValue={row?.paths.join(", ") ?? "*"}
          className={cn(FIELD, "h-10 font-mono")}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Kezdés (nem kötelező)" htmlFor="a-starts">
          <input
            id="a-starts"
            type="datetime-local"
            value={startsAt}
            onChange={(e) => setStartsAt(e.target.value)}
            className={cn(FIELD, "h-10")}
          />
        </Field>
        <Field label="Befejezés (nem kötelező)" htmlFor="a-ends">
          <input
            id="a-ends"
            type="datetime-local"
            value={endsAt}
            onChange={(e) => setEndsAt(e.target.value)}
            className={cn(FIELD, "h-10")}
          />
        </Field>
      </div>

      <label className="flex items-center gap-2 text-sm text-foreground">
        <input
          type="checkbox"
          name="active"
          defaultChecked={row?.active ?? true}
          className="size-4 accent-primary"
        />
        Aktív
      </label>

      {state.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}

      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Mentés…" : "Mentés"}
        </Button>
        <Button type="button" variant="ghost" onClick={onDone}>
          Mégse
        </Button>
      </div>
    </form>
  );
}

function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={htmlFor}
        className="text-xs font-medium text-muted-foreground"
      >
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
