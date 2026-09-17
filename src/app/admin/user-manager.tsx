"use client";

import { Lock, Pencil, Search, X } from "lucide-react";
import {
  type ReactNode,
  useActionState,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { type UserSaveState, updateUser } from "./actions";

export type AdminUserRow = {
  id: string;
  name: string;
  email: string | null;
  image: string | null;
  username: string | null;
  class: string | null;
  isTeacher: boolean;
  teacherName: string | null;
  isAdmin: boolean;
  roleAdmin: boolean;
  banned: boolean;
  identityLocked: boolean;
  providers: string[];
  createdAt: string;
  lastActiveAt: string | null;
};

type Teacher = { short: string; name: string };

const FIELD =
  "rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50";

const DATE_FMT = new Intl.DateTimeFormat("hu-HU", { dateStyle: "short" });
const RELATIVE = new Intl.RelativeTimeFormat("hu-HU", { numeric: "auto" });

const PAGE_SIZE = 50;

const FILTERS = [
  { value: "all", label: "Mindenki" },
  { value: "student", label: "Diák" },
  { value: "teacher", label: "Tanár" },
  { value: "admin", label: "Üzemeltető" },
  { value: "no-class", label: "Diák osztály nélkül" },
  { value: "locked", label: "Kézzel rögzített" },
  { value: "banned", label: "Letiltott" },
] as const;

type Filter = (typeof FILTERS)[number]["value"];

const PROVIDER_LABELS: Record<string, string> = {
  google: "Google",
  "jedlik-ad": "Iskolai AD",
  credential: "Jelszó",
};

function relativeTime(iso: string | null): string {
  if (!iso) return "soha";
  const diff = new Date(iso).getTime() - Date.now();
  const minutes = Math.round(diff / 60_000);
  if (Math.abs(minutes) < 60) return RELATIVE.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return RELATIVE.format(hours, "hour");
  const days = Math.round(hours / 24);
  if (Math.abs(days) < 30) return RELATIVE.format(days, "day");
  return DATE_FMT.format(new Date(iso));
}

function matchesFilter(row: AdminUserRow, filter: Filter): boolean {
  switch (filter) {
    case "all":
      return true;
    case "student":
      return !row.isTeacher;
    case "teacher":
      return row.isTeacher;
    case "admin":
      return row.isAdmin || row.roleAdmin;
    case "no-class":
      return !row.isTeacher && !row.class;
    case "locked":
      return row.identityLocked;
    case "banned":
      return row.banned;
  }
}

export function UserManager({
  rows,
  currentUserId,
  canGrantRoleAdmin,
  teachers,
  classes,
}: {
  rows: AdminUserRow[];
  currentUserId: string;
  canGrantRoleAdmin: boolean;
  teachers: Teacher[] | null;
  classes: string[] | null;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [classFilter, setClassFilter] = useState("");
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [editing, setEditing] = useState<string | null>(null);
  const deferredQuery = useDeferredValue(query);

  //* Az osztályszűrő a TÉNYLEGESEN előforduló osztályokból áll, nem a suli
  //* listájából — üres osztályt szűrni értelmetlen.
  const usedClasses = useMemo(
    () =>
      [
        ...new Set(rows.map((r) => r.class).filter((c): c is string => !!c)),
      ].sort((a, b) => a.localeCompare(b, "hu")),
    [rows],
  );

  const filtered = useMemo(() => {
    const needle = deferredQuery.trim().toLocaleLowerCase("hu");
    return rows.filter((row) => {
      if (!matchesFilter(row, filter)) return false;
      if (classFilter && row.class !== classFilter) return false;
      if (!needle) return true;
      return [row.name, row.email, row.username, row.class, row.teacherName]
        .filter(Boolean)
        .some((v) => (v as string).toLocaleLowerCase("hu").includes(needle));
    });
  }, [rows, deferredQuery, filter, classFilter]);

  const visible = filtered.slice(0, limit);

  return (
    <section className="mt-8">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <label htmlFor="user-search" className="sr-only">
            Keresés
          </label>
          <input
            id="user-search"
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setLimit(PAGE_SIZE);
            }}
            placeholder="Név, e-mail, felhasználónév, osztály…"
            className={cn(FIELD, "h-10 w-full pl-9")}
          />
        </div>
        <div className="flex gap-2">
          <label htmlFor="user-filter" className="sr-only">
            Szerep
          </label>
          <select
            id="user-filter"
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value as Filter);
              setLimit(PAGE_SIZE);
            }}
            className={cn(FIELD, "h-10 flex-1 sm:flex-none")}
          >
            {FILTERS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
          <label htmlFor="user-class-filter" className="sr-only">
            Osztály
          </label>
          <select
            id="user-class-filter"
            value={classFilter}
            onChange={(e) => {
              setClassFilter(e.target.value);
              setLimit(PAGE_SIZE);
            }}
            className={cn(FIELD, "h-10 flex-1 sm:flex-none")}
          >
            <option value="">Minden osztály</option>
            {usedClasses.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>

      <p
        className="mt-3 text-xs text-muted-foreground tabular-nums"
        aria-live="polite"
      >
        {filtered.length.toLocaleString("hu-HU")} találat
        {filtered.length !== rows.length &&
          ` / ${rows.length.toLocaleString("hu-HU")}`}
      </p>

      {filtered.length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">
          Nincs a szűrésnek megfelelő felhasználó.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-border rounded-lg border border-border bg-card">
          {visible.map((row) => (
            <li key={row.id}>
              <UserRow
                row={row}
                self={row.id === currentUserId}
                editing={editing === row.id}
                onEdit={() => setEditing(editing === row.id ? null : row.id)}
              />
              {editing === row.id && (
                <UserForm
                  row={row}
                  self={row.id === currentUserId}
                  canGrantRoleAdmin={canGrantRoleAdmin}
                  teachers={teachers}
                  classes={classes}
                  onDone={() => setEditing(null)}
                />
              )}
            </li>
          ))}
        </ul>
      )}

      {filtered.length > limit && (
        <Button
          variant="outline"
          className="mt-4"
          onClick={() => setLimit((n) => n + PAGE_SIZE)}
        >
          Továbbiak ({(filtered.length - limit).toLocaleString("hu-HU")})
        </Button>
      )}
    </section>
  );
}

function UserRow({
  row,
  self,
  editing,
  onEdit,
}: {
  row: AdminUserRow;
  self: boolean;
  editing: boolean;
  onEdit: () => void;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <Avatar name={row.name} image={row.image} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="truncate text-sm font-medium text-foreground">
            {row.name}
            {self && (
              <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                (te)
              </span>
            )}
          </p>
          {row.isTeacher && <Badge>Tanár</Badge>}
          {row.class && <Badge>{row.class}</Badge>}
          {row.isAdmin && <Badge tone="primary">Üzemeltető</Badge>}
          {row.roleAdmin && <Badge tone="primary">Fiókkezelő</Badge>}
          {row.banned && <Badge tone="destructive">Letiltva</Badge>}
          {row.identityLocked && (
            <span title="Kézzel rögzítve — a belépés nem írja felül">
              <Lock className="size-3.5 text-muted-foreground" aria-hidden />
              <span className="sr-only">Kézzel rögzítve</span>
            </span>
          )}
        </div>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {[
            row.email ?? (row.username ? `@${row.username}` : null),
            row.teacherName,
            row.providers.map((p) => PROVIDER_LABELS[p] ?? p).join(", "),
            `aktív: ${relativeTime(row.lastActiveAt)}`,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>
      <Button
        size="sm"
        variant={editing ? "secondary" : "outline"}
        onClick={onEdit}
        aria-expanded={editing}
      >
        {editing ? <X aria-hidden /> : <Pencil aria-hidden />}
        <span className="max-sm:sr-only">
          {editing ? "Bezárás" : "Szerkesztés"}
        </span>
      </Button>
    </div>
  );
}

function UserForm({
  row,
  self,
  canGrantRoleAdmin,
  teachers,
  classes,
  onDone,
}: {
  row: AdminUserRow;
  self: boolean;
  canGrantRoleAdmin: boolean;
  teachers: Teacher[] | null;
  classes: string[] | null;
  onDone: () => void;
}) {
  const [state, formAction, pending] = useActionState<UserSaveState, FormData>(
    updateUser,
    {},
  );
  const [klass, setKlass] = useState(row.class ?? "");
  const [teacherName, setTeacherName] = useState(row.teacherName ?? "");
  const [isTeacher, setIsTeacher] = useState(row.isTeacher);
  const [locked, setLocked] = useState(row.identityLocked);

  useEffect(() => {
    if (state.ok) onDone();
  }, [state, onDone]);

  //! AZONOSSÁG KÉZI MÓDOSÍTÁSA = RÖGZÍTÉS. Enélkül a következő belépés
  //! (AD-válasz vagy tanárlista-illesztés) csendben visszaírná az egészet.
  //! A pipa kivehető, ha épp az a cél, hogy a belépés újra eldöntse.
  const touchIdentity = () => setLocked(true);

  //* A jelenlegi érték akkor is választható maradjon, ha a lista azóta változott.
  const classOptions = classes
    ? [...new Set([...(row.class ? [row.class] : []), ...classes])]
    : null;
  const teacherKnown =
    !row.teacherName || teachers?.some((t) => t.name === row.teacherName);

  return (
    <form
      action={formAction}
      className="flex flex-col gap-4 border-t border-border bg-background/50 px-4 py-4"
    >
      <input type="hidden" name="id" value={row.id} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Osztály" htmlFor={`u-class-${row.id}`}>
          {classOptions ? (
            <select
              id={`u-class-${row.id}`}
              name="class"
              value={klass}
              onChange={(e) => {
                setKlass(e.target.value);
                touchIdentity();
              }}
              className={cn(FIELD, "h-10")}
            >
              <option value="">— nincs —</option>
              {classOptions.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          ) : (
            <input
              id={`u-class-${row.id}`}
              name="class"
              value={klass}
              maxLength={8}
              placeholder="pl. 13C"
              onChange={(e) => {
                setKlass(e.target.value);
                touchIdentity();
              }}
              className={cn(FIELD, "h-10 uppercase")}
            />
          )}
        </Field>

        <Field
          label="Tanárnév"
          htmlFor={`u-teacher-${row.id}`}
          hint={
            teachers
              ? "A Jedlikinfo tanárlistájából. Megadva a fiók tanár lesz."
              : "A tanárlista most nem érhető el — tanárnév nem módosítható."
          }
        >
          <select
            id={`u-teacher-${row.id}`}
            name="teacherName"
            value={teacherName}
            disabled={!teachers}
            onChange={(e) => {
              setTeacherName(e.target.value);
              if (e.target.value) setIsTeacher(true);
              touchIdentity();
            }}
            className={cn(FIELD, "h-10")}
          >
            <option value="">— nincs —</option>
            {!teacherKnown && row.teacherName && (
              <option value={row.teacherName}>
                {row.teacherName} (nincs a listában)
              </option>
            )}
            {teachers?.map((t) => (
              <option key={t.name} value={t.name}>
                {t.name} ({t.short})
              </option>
            ))}
          </select>
          {/*//! Letiltott `select` nem küld értéket — a meglévő név maradjon. */}
          {!teachers && (
            <input type="hidden" name="teacherName" value={teacherName} />
          )}
        </Field>
      </div>

      <fieldset className="flex flex-col gap-2.5">
        <legend className="mb-1 text-xs font-medium text-muted-foreground">
          Szerepek
        </legend>
        <Check
          name="isTeacher"
          checked={isTeacher || teacherName !== ""}
          disabled={teacherName !== ""}
          onChange={(v) => {
            setIsTeacher(v);
            touchIdentity();
          }}
          label="Tanár"
          hint="Tanári nézetek és funkciók."
        />
        {/*//! Letiltott pipa nem küld értéket — tanárnévnél a szerver amúgy is
            //! tanárnak veszi, de a szándék legyen egyértelmű. */}
        {teacherName !== "" && (
          <input type="hidden" name="isTeacher" value="on" />
        )}
        <Check
          name="isAdmin"
          defaultChecked={row.isAdmin}
          disabled={self}
          label="Üzemeltető"
          hint={
            self
              ? "A saját jogodat nem veheted el."
              : "Hozzáfér ehhez a pulthoz: felhasználók, statisztika, közlemények."
          }
        />
        {self && <input type="hidden" name="isAdmin" value="on" />}
        <Check
          name="roleAdmin"
          defaultChecked={row.roleAdmin}
          disabled={!canGrantRoleAdmin || self}
          label="Teljes fiókkezelő (role: admin)"
          hint={
            canGrantRoleAdmin
              ? "Kitiltás, megszemélyesítés, jelszóállítás az auth API-n. Csak megbízható embernek."
              : "Csak az adhatja, akinek magának is megvan."
          }
        />
        {(!canGrantRoleAdmin || self) && row.roleAdmin && (
          <input type="hidden" name="roleAdmin" value="on" />
        )}
      </fieldset>

      <Check
        name="identityLocked"
        checked={locked}
        onChange={setLocked}
        label="Kézi rögzítés"
        hint="A belépés nem írja felül az osztályt, a tanár-státuszt és a tanárnevet. Az osztály vagy tanár módosítása automatikusan bekapcsolja."
      />

      {state.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Mentés…" : "Mentés"}
        </Button>
        <Button type="button" variant="ghost" onClick={onDone}>
          Mégse
        </Button>
        <p className="ml-auto text-xs text-muted-foreground">
          Regisztrált: {DATE_FMT.format(new Date(row.createdAt))}
        </p>
      </div>
    </form>
  );
}

function Check({
  name,
  label,
  hint,
  checked,
  defaultChecked,
  disabled,
  onChange,
}: {
  name: string;
  label: string;
  hint?: string;
  checked?: boolean;
  defaultChecked?: boolean;
  disabled?: boolean;
  onChange?: (value: boolean) => void;
}) {
  return (
    <label
      className={cn(
        "flex items-start gap-2.5 text-sm text-foreground",
        disabled && "opacity-60",
      )}
    >
      <input
        type="checkbox"
        name={name}
        checked={checked}
        defaultChecked={defaultChecked}
        disabled={disabled}
        onChange={onChange ? (e) => onChange(e.target.checked) : undefined}
        className="mt-0.5 size-4 shrink-0 accent-primary"
      />
      <span className="flex flex-col">
        <span className="font-medium">{label}</span>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </span>
    </label>
  );
}

function Badge({
  children,
  tone = "muted",
}: {
  children: ReactNode;
  tone?: "muted" | "primary" | "destructive";
}) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-[0.7rem] font-medium leading-none",
        tone === "primary" && "bg-primary text-primary-foreground",
        tone === "muted" && "bg-muted text-muted-strong",
        tone === "destructive" && "bg-destructive/15 text-destructive",
      )}
    >
      {children}
    </span>
  );
}

function Avatar({ name, image }: { name: string; image: string | null }) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const initials = (
    (parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts.at(-1)?.[0] ?? "") : "")
  ).toLocaleUpperCase("hu");
  return (
    <span
      aria-hidden
      className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-input text-xs font-semibold text-muted-strong"
    >
      {image ? (
        // biome-ignore lint/performance/noImgElement: külső, nem optimalizálható profilkép
        <img src={image} alt="" className="size-full object-cover" />
      ) : (
        initials || "?"
      )}
    </span>
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
