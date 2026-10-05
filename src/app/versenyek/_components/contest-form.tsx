"use client";

import { Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { MAX_GRADE, MIN_GRADE } from "@/lib/clubs";
import {
  CATEGORY_LABELS,
  COMPETITION_CATEGORIES,
  COMPETITION_VENUES,
  type CompetitionCategory,
  type CompetitionInput,
  type CompetitionVenue,
  toLocalInput,
  VENUE_LABELS,
} from "@/lib/competitions";
import { looksLikeClass } from "@/lib/known-class";
import { cn } from "@/lib/utils";
import { saveCompetition } from "../actions";

//* ---------------------------------------------------------------------------
//* VERSENY LÉTREHOZÁSA ÉS SZERKESZTÉSE
//* ---------------------------------------------------------------------------
//! A HATÁRIDŐ A MÁSODIK MEZŐ, NEM AZ UTOLSÓ. A diáknak ez a legfontosabb
//! adat, tehát a szervezőnek sem szabad a lap alján, egy „egyéb" csoportban
//! találnia. Üresen hagyva a kezdés a határidő — ezt a mező alatt ki is írjuk.
//!
//! A `datetime-local` HELYI IDŐT ad; a böngésző alakítja ISO-ra, mielőtt
//! elküldi (lásd `competitionInputSchema`). A szervező a suli gépén vagy a
//! telefonján ül, mindkettő budapesti időben.

type Option = { short: string; name: string };

const FIELD =
  "rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

function toIso(local: string): string | null {
  if (!local) return null;
  const date = new Date(local);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function ContestForm({
  slug,
  initial,
  selfTeacher,
  teachers,
  rooms,
  clubs,
}: {
  slug?: string;
  initial?: CompetitionInput;
  selfTeacher: string | null;
  teachers: Option[];
  rooms: Option[];
  clubs: { slug: string; name: string }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState(initial?.name ?? "");
  const [category, setCategory] = useState<CompetitionCategory>(
    initial?.category ?? "OTHER",
  );
  const [description, setDescription] = useState(initial?.description ?? "");
  const [externalUrl, setExternalUrl] = useState(initial?.externalUrl ?? "");
  const [venue, setVenue] = useState<CompetitionVenue>(
    initial?.venue ?? "SCHOOL",
  );
  const [room, setRoom] = useState(initial?.room ?? "");
  const [location, setLocation] = useState(initial?.location ?? "");
  const [startsAt, setStartsAt] = useState(
    toLocalInput(initial?.startsAt ?? null),
  );
  const [endsAt, setEndsAt] = useState(toLocalInput(initial?.endsAt ?? null));
  const [deadline, setDeadline] = useState(
    toLocalInput(initial?.registrationDeadline ?? null),
  );
  const [grades, setGrades] = useState<number[]>(initial?.grades ?? []);
  const [classesText, setClassesText] = useState(
    (initial?.classes ?? []).join(", "),
  );
  const [capacity, setCapacity] = useState(
    initial?.capacity ? String(initial.capacity) : "",
  );
  const [organizers, setOrganizers] = useState<string[]>(
    initial?.teachers ?? (selfTeacher ? [selfTeacher] : []),
  );
  const [phases, setPhases] = useState(
    (initial?.phases ?? []).map((p) => ({
      title: p.title,
      startsAt: toLocalInput(p.startsAt),
      endsAt: toLocalInput(p.endsAt),
    })),
  );
  const [linked, setLinked] = useState<string[]>(initial?.clubs ?? []);

  const classes = classesText
    .split(/[\s,;]+/)
    .map((c) => c.trim().toUpperCase())
    .filter(Boolean);
  const badClasses = classes.filter((c) => !looksLikeClass(c));
  const teacherName = (short: string) =>
    teachers.find((t) => t.short === short)?.name ?? short;
  const clubName = (s: string) => clubs.find((c) => c.slug === s)?.name ?? s;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (badClasses.length > 0) {
      setError(`Nem osztálynév: ${badClasses.join(", ")}`);
      return;
    }
    const start = toIso(startsAt);
    if (!start) {
      setError("Add meg, mikor kezdődik a verseny.");
      return;
    }
    const competition: CompetitionInput = {
      name: name.trim(),
      description: description.trim() || null,
      category,
      externalUrl: externalUrl.trim() || null,
      venue,
      room: venue === "SCHOOL" ? room || null : null,
      location: venue === "EXTERNAL" ? location.trim() || null : null,
      startsAt: start,
      endsAt: toIso(endsAt),
      registrationDeadline: toIso(deadline),
      grades,
      classes,
      capacity: capacity ? Number(capacity) : null,
      teachers: organizers,
      phases: phases
        .filter((p) => p.title.trim())
        .map((p) => ({
          title: p.title.trim(),
          startsAt: toIso(p.startsAt),
          endsAt: toIso(p.endsAt),
        })),
      clubs: linked,
    };
    startTransition(async () => {
      const result = await saveCompetition({ slug, competition });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push(`/versenyek/${result.slug}`);
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="mt-8 flex max-w-2xl flex-col gap-8">
      <Field label="Név" htmlFor="v-name">
        <input
          id="v-name"
          required
          minLength={3}
          maxLength={120}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="pl. OSZTV informatika"
          className={cn(FIELD, "h-10")}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Kezdés" htmlFor="v-start">
          <input
            id="v-start"
            type="datetime-local"
            required
            value={startsAt}
            onChange={(e) => setStartsAt(e.target.value)}
            className={cn(FIELD, "h-10")}
          />
        </Field>
        <Field
          label="Nevezési határidő"
          htmlFor="v-deadline"
          hint="Üresen hagyva a kezdésig lehet nevezni."
        >
          <input
            id="v-deadline"
            type="datetime-local"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
            className={cn(FIELD, "h-10")}
          />
        </Field>
        <Field label="Vége (nem kötelező)" htmlFor="v-end">
          <input
            id="v-end"
            type="datetime-local"
            value={endsAt}
            onChange={(e) => setEndsAt(e.target.value)}
            className={cn(FIELD, "h-10")}
          />
        </Field>
        <Field label="Terület" htmlFor="v-cat">
          <select
            id="v-cat"
            value={category}
            onChange={(e) => setCategory(e.target.value as CompetitionCategory)}
            className={cn(FIELD, "h-10")}
          >
            {COMPETITION_CATEGORIES.map((k) => (
              <option key={k} value={k}>
                {CATEGORY_LABELS[k]}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm font-medium">Helyszín</legend>
        <div className="flex flex-wrap gap-1.5">
          {COMPETITION_VENUES.map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={venue === v}
              onClick={() => setVenue(v)}
              className={cn(
                "h-8 rounded-full border px-3 text-xs font-medium touch-target",
                venue === v
                  ? "border-foreground bg-foreground text-background"
                  : "border-border text-muted-strong hover:text-foreground",
              )}
            >
              {VENUE_LABELS[v]}
            </button>
          ))}
        </div>
        {venue === "SCHOOL" && (
          <select
            aria-label="Terem"
            value={room}
            onChange={(e) => setRoom(e.target.value)}
            className={cn(FIELD, "h-10")}
          >
            <option value="">Terem később</option>
            {rooms.map((r) => (
              <option key={r.short} value={r.short}>
                {r.name === r.short ? r.short : `${r.short} · ${r.name}`}
              </option>
            ))}
          </select>
        )}
        {venue === "EXTERNAL" && (
          <input
            aria-label="Cím"
            required
            maxLength={200}
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="pl. Széchenyi István Egyetem, Győr"
            className={cn(FIELD, "h-10")}
          />
        )}
      </fieldset>

      <Field
        label="Leírás"
        htmlFor="v-desc"
        hint="Miről szól, mi kell hozzá, hogyan zajlik."
      >
        <textarea
          id="v-desc"
          rows={5}
          maxLength={6000}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className={cn(FIELD, "py-2")}
        />
      </Field>

      <Field label="Hivatalos oldal (nem kötelező)" htmlFor="v-url">
        <input
          id="v-url"
          inputMode="url"
          maxLength={500}
          value={externalUrl}
          onChange={(e) => setExternalUrl(e.target.value)}
          placeholder="pl. osztv.hu"
          className={cn(FIELD, "h-10")}
        />
      </Field>

      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm font-medium">Ki nevezhet</legend>
        <p className="-mt-1 text-xs text-muted-strong">
          Üresen hagyva bárki. Más évfolyam diákja ilyenkor is látja, csak nem
          nevezhet.
        </p>
        <div className="flex flex-wrap gap-1.5">
          {Array.from(
            { length: MAX_GRADE - MIN_GRADE + 1 },
            (_, i) => MIN_GRADE + i,
          ).map((g) => {
            const on = grades.includes(g);
            return (
              <button
                key={g}
                type="button"
                aria-pressed={on}
                onClick={() =>
                  setGrades((all) =>
                    on ? all.filter((x) => x !== g) : [...all, g],
                  )
                }
                className={cn(
                  "h-8 rounded-full border px-3 text-xs font-medium touch-target",
                  on
                    ? "border-foreground bg-foreground text-background"
                    : "border-border text-muted-strong hover:text-foreground",
                )}
              >
                {g}. évf.
              </button>
            );
          })}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Osztályok" htmlFor="v-classes" hint="pl. 13D, 13E">
            <input
              id="v-classes"
              value={classesText}
              onChange={(e) => setClassesText(e.target.value)}
              aria-invalid={badClasses.length > 0}
              className={cn(FIELD, "h-10")}
            />
          </Field>
          <Field label="Létszámkorlát" htmlFor="v-cap" hint="Üresen: nincs">
            <input
              id="v-cap"
              type="number"
              min={1}
              max={10000}
              value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
              className={cn(FIELD, "h-10 tabular-nums")}
            />
          </Field>
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm font-medium">Felelős tanár</legend>
        <ul className="flex flex-wrap gap-2">
          {organizers.map((short) => (
            <li
              key={short}
              className="inline-flex items-center gap-1.5 rounded-full border border-border py-1 pr-1.5 pl-3 text-sm"
            >
              {teacherName(short)}
              {short !== selfTeacher && (
                <button
                  type="button"
                  aria-label={`${teacherName(short)} eltávolítása`}
                  onClick={() =>
                    setOrganizers(organizers.filter((o) => o !== short))
                  }
                  className="rounded-full p-1 text-muted-strong hover:text-foreground"
                >
                  <Trash2 className="size-3.5" aria-hidden />
                </button>
              )}
            </li>
          ))}
        </ul>
        {organizers.length < 4 && (
          <select
            value=""
            aria-label="Tanár hozzáadása"
            onChange={(e) => {
              if (e.target.value) {
                setOrganizers([...organizers, e.target.value]);
              }
            }}
            className={cn(FIELD, "h-10")}
          >
            <option value="">Tanár hozzáadása…</option>
            {teachers
              .filter((t) => !organizers.includes(t.short))
              .map((t) => (
                <option key={t.short} value={t.short}>
                  {t.name} ({t.short})
                </option>
              ))}
          </select>
        )}
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm font-medium">Fordulók (nem kötelező)</legend>
        {phases.map((phase, i) => (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: a fordulóknak még nincs azonosítója
            key={i}
            className="flex flex-col gap-2 rounded-xl border border-border p-3"
          >
            <div className="flex gap-2">
              <input
                aria-label="A forduló neve"
                value={phase.title}
                maxLength={120}
                placeholder="pl. Iskolai forduló"
                onChange={(e) =>
                  setPhases((all) =>
                    all.map((p, j) =>
                      j === i ? { ...p, title: e.target.value } : p,
                    ),
                  )
                }
                className={cn(FIELD, "h-9 flex-1")}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Forduló törlése"
                onClick={() =>
                  setPhases((all) => all.filter((_, j) => j !== i))
                }
              >
                <Trash2 aria-hidden />
              </Button>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <input
                type="datetime-local"
                aria-label="A forduló kezdete"
                value={phase.startsAt}
                onChange={(e) =>
                  setPhases((all) =>
                    all.map((p, j) =>
                      j === i ? { ...p, startsAt: e.target.value } : p,
                    ),
                  )
                }
                className={cn(FIELD, "h-9")}
              />
              <input
                type="datetime-local"
                aria-label="A forduló vége vagy beadási határideje"
                value={phase.endsAt}
                onChange={(e) =>
                  setPhases((all) =>
                    all.map((p, j) =>
                      j === i ? { ...p, endsAt: e.target.value } : p,
                    ),
                  )
                }
                className={cn(FIELD, "h-9")}
              />
            </div>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          className="w-fit rounded-full"
          disabled={phases.length >= 10}
          onClick={() =>
            setPhases((all) => [
              ...all,
              { title: "", startsAt: "", endsAt: "" },
            ])
          }
        >
          <Plus aria-hidden />
          Forduló
        </Button>
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm font-medium">
          Felkészítő szakkör (nem kötelező)
        </legend>
        <ul className="flex flex-wrap gap-2">
          {linked.map((s) => (
            <li
              key={s}
              className="inline-flex items-center gap-1.5 rounded-full border border-border py-1 pr-1.5 pl-3 text-sm"
            >
              {clubName(s)}
              <button
                type="button"
                aria-label={`${clubName(s)} eltávolítása`}
                onClick={() => setLinked(linked.filter((x) => x !== s))}
                className="rounded-full p-1 text-muted-strong hover:text-foreground"
              >
                <Trash2 className="size-3.5" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
        {linked.length < 5 && (
          <select
            value=""
            aria-label="Szakkör hozzáadása"
            onChange={(e) => {
              if (e.target.value) setLinked([...linked, e.target.value]);
            }}
            className={cn(FIELD, "h-10")}
          >
            <option value="">Szakkör hozzáadása…</option>
            {clubs
              .filter((c) => !linked.includes(c.slug))
              .map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.name}
                </option>
              ))}
          </select>
        )}
      </fieldset>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={pending} className="rounded-full">
          {slug ? "Mentés" : "Mentés piszkozatként"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="rounded-full"
          onClick={() => router.back()}
        >
          Mégse
        </Button>
        {!slug && (
          <p className="text-xs text-muted-strong">
            A diákok akkor látják, amikor a verseny lapján megnyitod a nevezést.
          </p>
        )}
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
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-muted-strong">{hint}</p>}
    </div>
  );
}
