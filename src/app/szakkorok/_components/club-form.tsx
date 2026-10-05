"use client";

import { CalendarPlus, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import type { UnclaimedCard } from "@/lib/club-schedule";
import {
  CLUB_KIND_LABELS,
  CLUB_KINDS,
  CLUB_TRACK_LABELS,
  CLUB_TRACKS,
  type ClubInput,
  type ClubKind,
  type ClubSlotInput,
  type ClubTrack,
  formatMinute,
  formatSlot,
  MAX_GRADE,
  MIN_GRADE,
  WEEKDAY_NAMES,
} from "@/lib/clubs";
import { looksLikeClass } from "@/lib/known-class";
import { cn } from "@/lib/utils";
import { saveClub } from "../actions";

//* ---------------------------------------------------------------------------
//* SZAKKÖR LÉTREHOZÁSA, JAVASLÁSA, SZERKESZTÉSE — EGY ŰRLAP
//* ---------------------------------------------------------------------------
//! HÁROM ÚT, EGY ALAK. A tanár létrehoz, a diák javasol, a vezető szerkeszt —
//! a mezők ugyanazok, csak a vezető kiválasztása más: a diák EGY tanárt kér
//! fel, a tanár maga vezet (és társat vehet maga mellé). A mentés a szerveren
//! ugyanazzal a sémával megy át (`clubInputSchema`), bármelyik útról jön.
//!
//! A TANÁR ELSŐ LÉPÉSE A SAJÁT KÁRTYÁJA. A szakkörök többsége már ott van a
//! tanár órarendjében, osztály nélkül — ha abból választ, a nap, az idő és a
//! terem pontosan egyezik azzal, amit a Jedlikinfo igazolni fog.

export type FormMode = "create" | "propose" | "edit";
type Option = { short: string; name: string };

const FIELD =
  "rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

function toTime(minute: number): string {
  return formatMinute(minute).padStart(5, "0");
}

function fromTime(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

const EMPTY: ClubInput = {
  name: "",
  description: null,
  kind: "CLUB",
  grades: [],
  classes: [],
  tracks: [],
  audienceNote: null,
  organizers: [],
  slots: [],
};

export function ClubForm({
  mode,
  slug,
  initial,
  selfTeacher,
  teachers,
  rooms,
  candidates = [],
  ideaId,
}: {
  mode: FormMode;
  slug?: string;
  initial?: ClubInput;
  //* A belépett tanár jele — a vezetők közül nem vehető ki (lásd `withSelf`).
  selfTeacher: string | null;
  teachers: Option[];
  rooms: Option[];
  candidates?: UnclaimedCard[];
  //* Az ötlet, amiből a tanár indítja (lásd `saveClub`).
  ideaId?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const start = initial ?? {
    ...EMPTY,
    organizers: selfTeacher && mode !== "propose" ? [selfTeacher] : [],
  };
  const [name, setName] = useState(start.name);
  const [kind, setKind] = useState<ClubKind>(start.kind);
  const [description, setDescription] = useState(start.description ?? "");
  const [grades, setGrades] = useState<number[]>(start.grades);
  const [classesText, setClassesText] = useState(start.classes.join(", "));
  const [tracks, setTracks] = useState<ClubTrack[]>(start.tracks);
  const [audienceNote, setAudienceNote] = useState(start.audienceNote ?? "");
  const [organizers, setOrganizers] = useState<string[]>(start.organizers);
  const [slots, setSlots] = useState<ClubSlotInput[]>(start.slots);

  const teacherName = (short: string) =>
    teachers.find((t) => t.short === short)?.name ?? short;

  const classes = classesText
    .split(/[\s,;]+/)
    .map((c) => c.trim().toUpperCase())
    .filter(Boolean);
  const badClasses = classes.filter((c) => !looksLikeClass(c));

  function updateSlot(index: number, patch: Partial<ClubSlotInput>) {
    setSlots((all) =>
      all.map((s, i) => {
        if (i !== index) return s;
        const next = { ...s, ...patch };
        //! TEREM NÉLKÜL NINCS MIT IGAZOLNI — a forrás magától „tanár szerint".
        if (next.room === null) next.source = "ORGANIZER";
        return next;
      }),
    );
  }

  function addSlot(from?: UnclaimedCard) {
    const lead = organizers[0] ?? selfTeacher ?? "";
    setSlots((all) => [
      ...all,
      {
        weekday: from?.weekday ?? 1,
        startMinute: from?.startMin ?? 14 * 60 + 30,
        endMinute: from?.endMin ?? 15 * 60 + 55,
        room: from?.room ?? null,
        teachers: lead ? [lead] : [],
        source: from ? "TIMETABLE" : "ORGANIZER",
      },
    ]);
  }

  function setOrganizerList(next: string[]) {
    setOrganizers(next);
    //* Az időpontok tanárai a vezetők közül valók — a kivett vezető kiesik.
    setSlots((all) =>
      all.map((s) => {
        const kept = s.teachers.filter((t) => next.includes(t));
        return { ...s, teachers: kept.length > 0 ? kept : next.slice(0, 1) };
      }),
    );
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (badClasses.length > 0) {
      setError(`Nem osztálynév: ${badClasses.join(", ")}`);
      return;
    }
    const club: ClubInput = {
      name: name.trim(),
      description: description.trim() || null,
      kind,
      grades,
      classes,
      tracks,
      audienceNote: audienceNote.trim() || null,
      organizers,
      slots,
    };
    startTransition(async () => {
      const result = await saveClub({ slug, club, ideaId });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push(`/szakkorok/${result.slug}`);
      router.refresh();
    });
  }

  const claimable = candidates.filter(
    (c) =>
      !slots.some(
        (s) =>
          s.weekday === c.weekday &&
          s.startMinute === c.startMin &&
          s.room === c.room,
      ),
  );

  return (
    <form onSubmit={submit} className="mt-8 flex max-w-2xl flex-col gap-8">
      {mode === "create" && claimable.length > 0 && (
        <section
          aria-labelledby="claim-heading"
          className="rounded-xl border border-border p-4"
        >
          <h2 id="claim-heading" className="text-sm font-semibold">
            A kártyáid, amikhez még nem tartozik szakkör
          </h2>
          <p className="mt-1 text-pretty text-xs text-muted-strong">
            Az iskola órarendjében osztály nélkül szerepelnek — ha az egyik ez a
            szakkör, vedd fel, és az időpontja magától igazolódik.
          </p>
          <ul className="mt-3 flex flex-col gap-1.5">
            {claimable.map((c) => (
              <li
                key={`${c.weekday}-${c.startMin}-${c.room}`}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm"
              >
                <span className="tabular-nums">
                  {formatSlot({
                    weekday: c.weekday,
                    startMinute: c.startMin,
                    endMinute: c.endMin,
                  })}
                </span>
                <span className="text-muted-strong">{c.room}</span>
                <span className="min-w-0 flex-1 truncate text-muted-strong">
                  {c.subject}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="rounded-full"
                  onClick={() => addSlot(c)}
                >
                  <CalendarPlus aria-hidden />
                  Ez az
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Field label="Név" htmlFor="c-name">
        <input
          id="c-name"
          required
          minLength={3}
          maxLength={120}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="pl. Drón szakkör"
          className={cn(FIELD, "h-10")}
        />
      </Field>

      <Field label="Fajta" htmlFor="c-kind">
        <select
          id="c-kind"
          value={kind}
          onChange={(e) => setKind(e.target.value as ClubKind)}
          className={cn(FIELD, "h-10")}
        >
          {CLUB_KINDS.map((k) => (
            <option key={k} value={k}>
              {CLUB_KIND_LABELS[k]}
            </option>
          ))}
        </select>
      </Field>

      <Field
        label="Leírás"
        htmlFor="c-desc"
        hint="Mit csináltok, kinek érdemes jönnie, kell-e hozzá valami."
      >
        <textarea
          id="c-desc"
          rows={5}
          maxLength={4000}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className={cn(FIELD, "py-2")}
        />
      </Field>

      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm font-medium">Kinek szól</legend>
        <p className="-mt-1 text-xs text-muted-strong">
          Ha évfolyamot vagy osztályt adsz meg, a szakkörlista nekik mutatja
          elöl, és az órarendjükben javaslatként is felbukkanhat. Üresen hagyva
          mindenkinek nyitott. Az órarendbe csak az kerül, aki követi.
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
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted-strong">
            Szakma — az évfolyamból és a „mindenkinek” szakkörből csak ezeket az
            osztályokat éri el (A szoftver, B hálózat, C mindkettő, D–E gépész).
            Üresen: bármelyik.
          </span>
          <div className="flex flex-wrap gap-1.5">
            {CLUB_TRACKS.map((t) => {
              const on = tracks.includes(t);
              return (
                <button
                  key={t}
                  type="button"
                  aria-pressed={on}
                  onClick={() =>
                    setTracks((all) =>
                      on ? all.filter((x) => x !== t) : [...all, t],
                    )
                  }
                  className={cn(
                    "h-8 rounded-full border px-3 text-xs font-medium touch-target",
                    on
                      ? "border-foreground bg-foreground text-background"
                      : "border-border text-muted-strong hover:text-foreground",
                  )}
                >
                  {CLUB_TRACK_LABELS[t]}
                </button>
              );
            })}
          </div>
        </div>
        <Field label="Osztályok" htmlFor="c-classes" hint="pl. 09A, 10B">
          <input
            id="c-classes"
            value={classesText}
            onChange={(e) => setClassesText(e.target.value)}
            aria-invalid={badClasses.length > 0}
            className={cn(FIELD, "h-10")}
          />
        </Field>
        <Field label="Megjegyzés" htmlFor="c-note" hint="pl. 13D páros héten">
          <input
            id="c-note"
            maxLength={200}
            value={audienceNote}
            onChange={(e) => setAudienceNote(e.target.value)}
            className={cn(FIELD, "h-10")}
          />
        </Field>
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm font-medium">
          {mode === "propose" ? "Melyik tanárt kéred fel?" : "Vezetők"}
        </legend>
        {mode === "propose" ? (
          <>
            <p className="-mt-1 text-xs text-muted-strong">
              A javaslat hozzá kerül. Csak akkor lesz belőle szakkör, ha ő
              jóváhagyja — addig csak ti ketten látjátok.
            </p>
            <select
              required
              value={organizers[0] ?? ""}
              onChange={(e) =>
                setOrganizerList(e.target.value ? [e.target.value] : [])
              }
              className={cn(FIELD, "h-10")}
            >
              <option value="">Válassz tanárt…</option>
              {teachers.map((t) => (
                <option key={t.short} value={t.short}>
                  {t.name} ({t.short})
                </option>
              ))}
            </select>
          </>
        ) : (
          <>
            <ul className="flex flex-wrap gap-2">
              {organizers.map((short, i) => (
                <li
                  key={short}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border py-1 pr-1.5 pl-3 text-sm"
                >
                  {teacherName(short)}
                  {i === 0 && (
                    <span className="text-xs text-muted-strong">fő vezető</span>
                  )}
                  {short !== selfTeacher && (
                    <button
                      type="button"
                      aria-label={`${teacherName(short)} eltávolítása`}
                      onClick={() =>
                        setOrganizerList(organizers.filter((o) => o !== short))
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
                aria-label="Társvezető hozzáadása"
                onChange={(e) => {
                  if (e.target.value) {
                    setOrganizerList([...organizers, e.target.value]);
                  }
                }}
                className={cn(FIELD, "h-10")}
              >
                <option value="">
                  {organizers.length === 0
                    ? "Vezető kiválasztása…"
                    : "Társvezető hozzáadása…"}
                </option>
                {teachers
                  .filter((t) => !organizers.includes(t.short))
                  .map((t) => (
                    <option key={t.short} value={t.short}>
                      {t.name} ({t.short})
                    </option>
                  ))}
              </select>
            )}
          </>
        )}
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm font-medium">Időpontok</legend>
        {slots.length === 0 && (
          <p className="text-sm text-muted-strong">
            Időpont nélkül a szakkör „egyeztetés alatt" jelenik meg.
          </p>
        )}
        {slots.map((slot, i) => (
          <SlotRow
            // biome-ignore lint/suspicious/noArrayIndexKey: a sorrend a kulcs, a slotnak még nincs azonosítója
            key={i}
            slot={slot}
            organizers={organizers}
            teacherName={teacherName}
            rooms={rooms}
            onChange={(patch) => updateSlot(i, patch)}
            onRemove={() => setSlots((all) => all.filter((_, j) => j !== i))}
          />
        ))}
        <Button
          type="button"
          variant="outline"
          className="w-fit rounded-full"
          disabled={organizers.length === 0}
          onClick={() => addSlot()}
        >
          <Plus aria-hidden />
          Időpont
        </Button>
      </fieldset>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <Button type="submit" disabled={pending} className="rounded-full">
          {mode === "propose"
            ? "Javaslat elküldése"
            : mode === "edit"
              ? "Mentés"
              : "Szakkör létrehozása"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="rounded-full"
          onClick={() => router.back()}
        >
          Mégse
        </Button>
      </div>
    </form>
  );
}

function SlotRow({
  slot,
  organizers,
  teacherName,
  rooms,
  onChange,
  onRemove,
}: {
  slot: ClubSlotInput;
  organizers: string[];
  teacherName: (short: string) => string;
  rooms: Option[];
  onChange: (patch: Partial<ClubSlotInput>) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border p-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs text-muted-strong">
          Nap
          <select
            value={slot.weekday}
            onChange={(e) => onChange({ weekday: Number(e.target.value) })}
            className={cn(FIELD, "h-9")}
          >
            {[1, 2, 3, 4, 5].map((d) => (
              <option key={d} value={d}>
                {WEEKDAY_NAMES[d]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-strong">
          Kezdés
          <input
            type="time"
            value={toTime(slot.startMinute)}
            onChange={(e) => {
              const m = fromTime(e.target.value);
              if (m !== null) onChange({ startMinute: m });
            }}
            className={cn(FIELD, "h-9 tabular-nums")}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-strong">
          Vége
          <input
            type="time"
            value={toTime(slot.endMinute)}
            onChange={(e) => {
              const m = fromTime(e.target.value);
              if (m !== null) onChange({ endMinute: m });
            }}
            className={cn(FIELD, "h-9 tabular-nums")}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-strong">
          Terem
          <select
            value={slot.room ?? ""}
            onChange={(e) => onChange({ room: e.target.value || null })}
            className={cn(FIELD, "h-9")}
          >
            <option value="">Nincs megadva</option>
            {rooms.map((r) => (
              <option key={r.short} value={r.short}>
                {r.name === r.short ? r.short : `${r.short} · ${r.name}`}
              </option>
            ))}
          </select>
        </label>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Időpont törlése"
          onClick={onRemove}
          className="ml-auto"
        >
          <Trash2 aria-hidden />
        </Button>
      </div>

      {organizers.length > 1 && (
        <div className="flex flex-wrap gap-3 text-sm">
          <span className="text-xs text-muted-strong">Ki tartja:</span>
          {organizers.map((short) => (
            <label key={short} className="inline-flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={slot.teachers.includes(short)}
                onChange={(e) => {
                  const next = e.target.checked
                    ? [...slot.teachers, short]
                    : slot.teachers.filter((t) => t !== short);
                  if (next.length > 0) onChange({ teachers: next });
                }}
              />
              {teacherName(short)}
            </label>
          ))}
        </div>
      )}

      <label className="inline-flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          className="mt-0.5"
          disabled={slot.room === null}
          checked={slot.source === "TIMETABLE"}
          onChange={(e) =>
            onChange({ source: e.target.checked ? "TIMETABLE" : "ORGANIZER" })
          }
        />
        <span>
          Az iskola órarendjében is szerepel
          <span className="block text-xs text-muted-strong">
            Ha igen, hetente összevetjük vele, és az iskoláé számít. Ha nem, a
            lap kiírja, hogy az időpont csak a vezető szerint van.
          </span>
        </span>
      </label>
    </div>
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
