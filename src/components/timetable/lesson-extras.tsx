"use client";

import {
  Cast,
  ExternalLink,
  Link2,
  LogIn,
  Pencil,
  Plus,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type FormEvent, useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useSession } from "@/lib/auth-client";
import {
  extrasKey,
  formatScreenAddress,
  type LessonLink,
  linkDisplayName,
  linksFor,
  parseScreenAddress,
  type ScreenAddress,
  type ScreenHost,
  sanitizeLinkLabel,
  sanitizeLinkUrl,
  screenFor,
  screenTaskPageUrl,
} from "@/lib/lesson-extras";
import {
  addLessonLink,
  type MutationResult,
  removeLessonLink,
  removeScreenHost,
  saveScreenHost,
  useLessonExtras,
} from "@/lib/lesson-extras-store";
import { canViewInPage, ScreenTaskViewer } from "./screentask-viewer";

//* ---------------------------------------------------------------------------
//* Linkek és kivetítés a részletlapon
//* ---------------------------------------------------------------------------
//! KÉT KÜLÖN KULCS, ÉS A LAP KIMONDJA, MELYIK MIHEZ TARTOZIK. A link a tanár +
//! tantárgy párhoz (minden órájukon ott van), a kivetítő címe a tanár + terem
//! párhoz (a ScreenTask a terem gépén fut). Lásd `src/lib/lesson-extras.ts`.
//!
//! BELÉPÉS NÉLKÜL IS MŰKÖDIK, CSAK HELYBEN. Vendégként a sorok a készülék
//! `localStorage`-ába kerülnek; belépve a fiókba, és minden eszközön
//! megjelennek (a vendég sorai a belépéskor átköltöznek — lásd
//! `lesson-extras-store.ts`). A felület a kettőt ugyanúgy kezeli; a vendég
//! egy sort kap arról, mit nyerne a belépéssel.

const INPUT =
  "h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 text-base text-foreground placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50 sm:text-sm dark:bg-input/30";

const INLINE_ACTION = "h-7 gap-1 rounded-full px-2 text-xs";
const ICON_ACTION = "shrink-0 text-muted-foreground pointer-coarse:size-9";

export function LessonExtrasSection({
  teacher,
  subject,
  rooms,
}: {
  //* A tanár jele: a diák nézetében a kártyáról, a tanáriban a nézett tanáré.
  teacher: string;
  subject: string;
  rooms: string[];
}) {
  const { data: session, isPending } = useSession();
  const userId = session?.user.id ?? null;
  const { status, extras } = useLessonExtras(userId);
  const [viewing, setViewing] = useState<{
    screen: ScreenHost;
    room: string;
  } | null>(null);

  //! TANÁR NÉLKÜL NINCS KULCS. Mindkét sor a tanárhoz kötődik; ha a forrás nem
  //! adott tanárt, nincs mihez menteni — a szakasz ilyenkor meg sem jelenik.
  if (!extrasKey(teacher) || isPending) return null;

  const loading = status === "loading";
  const distinctRooms = [...new Set(rooms.filter((room) => extrasKey(room)))];

  return (
    <>
      {extrasKey(subject) && (
        <LinksBlock
          userId={userId}
          teacher={teacher}
          subject={subject}
          links={linksFor(extras, teacher, subject)}
          loading={loading}
          failed={status === "error"}
        />
      )}
      {distinctRooms.map((room) => (
        <ScreenBlock
          key={room}
          userId={userId}
          teacher={teacher}
          room={room}
          showRoom={distinctRooms.length > 1}
          screen={screenFor(extras, teacher, room)}
          loading={loading}
          onOpen={(screen) => setViewing({ screen, room })}
        />
      ))}
      {!userId && <GuestNote />}
      {viewing && (
        <ScreenTaskViewer
          screen={viewing.screen}
          title={`Kivetítés · ${viewing.room}`}
          onClose={() => setViewing(null)}
        />
      )}
    </>
  );
}

function SectionHead({
  icon: Icon,
  label,
  action,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-7 items-center gap-3">
      <Icon className="size-4 shrink-0 text-muted-foreground" />
      <span className="flex-1 text-xs text-muted-strong">{label}</span>
      {action}
    </div>
  );
}

//! A VENDÉGNEK KI KELL MONDANI, HOL VAN A MENTÉSE. Enélkül a gépén hiába
//! keresné a telefonon felvett linket — és azt hinné, elveszett.
function GuestNote() {
  const pathname = usePathname();
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 px-4 py-2.5 text-pretty text-[11px] text-muted-foreground">
      <span>Belépés nélkül csak ezen az eszközön mentődik.</span>
      <Link
        href={`/belepes?tovabb=${encodeURIComponent(pathname)}`}
        className="inline-flex items-center gap-1 font-medium text-foreground underline-offset-4 hover:underline"
      >
        <LogIn className="size-3" aria-hidden />
        Lépj be, és minden eszközödön ott lesz
      </Link>
    </p>
  );
}

//* ---------------------------------------------------------------------------
//* Linkek — tanár + tantárgy
//* ---------------------------------------------------------------------------
function LinksBlock({
  userId,
  teacher,
  subject,
  links,
  loading,
  failed,
}: {
  //* `null` = vendég: a sorok ezen a készüléken, `localStorage`-ban élnek.
  userId: string | null;
  teacher: string;
  subject: string;
  links: LessonLink[];
  loading: boolean;
  failed: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const remove = async (link: LessonLink) => {
    setRemoving(link.id);
    setError(null);
    const result = await removeLessonLink(userId, link.id);
    setRemoving(null);
    if (!result.ok) setError(result.message);
  };

  return (
    <div className="px-4 py-3">
      <SectionHead
        icon={Link2}
        label="Linkek"
        action={
          !adding &&
          !loading && (
            <Button
              size="sm"
              variant="ghost"
              className={INLINE_ACTION}
              onClick={() => setAdding(true)}
            >
              <Plus className="size-3.5" aria-hidden />
              Link hozzáadása
            </Button>
          )
        }
      />

      {links.length > 0 && (
        <ul className="mt-1 space-y-0.5 pl-7">
          {links.map((link) => {
            const name = linkDisplayName(link);
            return (
              <li key={link.id} className="flex items-center gap-2">
                <a
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex min-w-0 flex-1 items-center gap-1.5 py-1 text-sm font-medium text-foreground underline-offset-4 hover:underline"
                >
                  <span className="min-w-0 wrap-anywhere">{name}</span>
                  <ExternalLink
                    className="size-3 shrink-0 text-muted-foreground"
                    aria-hidden
                  />
                </a>
                <Button
                  size="icon-xs"
                  variant="ghost"
                  className={ICON_ACTION}
                  aria-label={`„${name}” törlése`}
                  disabled={removing === link.id}
                  onClick={() => void remove(link)}
                >
                  <X aria-hidden />
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      {links.length === 0 && !adding && (
        <p className="mt-1 pl-7 text-pretty text-xs text-muted-foreground">
          {loading
            ? "Betöltés…"
            : failed
              ? "Most nem sikerült betölteni a mentett linkjeidet."
              : "Classroom, feladatlap, Teams — amit ehhez a tanárhoz és tárgyhoz mentesz, minden órájukon itt lesz."}
        </p>
      )}

      {adding && (
        <LinkForm
          onCancel={() => setAdding(false)}
          onSubmit={async (url, label) => {
            const result = await addLessonLink(userId, {
              teacher,
              subject,
              url,
              label,
            });
            if (result.ok) setAdding(false);
            return result;
          }}
        />
      )}

      {error && (
        <p role="alert" className="mt-1.5 pl-7 text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

function LinkForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (url: string, label: string | null) => Promise<MutationResult>;
  onCancel: () => void;
}) {
  const urlId = useId();
  const labelId = useId();
  const errorId = useId();
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const urlRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    urlRef.current?.focus();
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const clean = sanitizeLinkUrl(url);
    if (!clean) {
      setError(
        "Ez nem érvényes webcím. Adj meg egy http:// vagy https:// kezdetű linket.",
      );
      return;
    }
    setBusy(true);
    setError(null);
    const result = await onSubmit(clean, sanitizeLinkLabel(label));
    setBusy(false);
    if (!result.ok) setError(result.message);
  };

  return (
    <form onSubmit={submit} noValidate className="mt-2 space-y-2 pl-7">
      <label htmlFor={urlId} className="sr-only">
        Webcím
      </label>
      <input
        ref={urlRef}
        id={urlId}
        type="text"
        inputMode="url"
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        placeholder="https://classroom.google.com/…"
        className={INPUT}
        value={url}
        onChange={(event) => setUrl(event.target.value)}
        disabled={busy}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
      />
      <label htmlFor={labelId} className="sr-only">
        Felirat (nem kötelező)
      </label>
      <input
        id={labelId}
        type="text"
        autoComplete="off"
        maxLength={80}
        placeholder="Felirat (nem kötelező)"
        className={INPUT}
        value={label}
        onChange={(event) => setLabel(event.target.value)}
        disabled={busy}
      />
      {error && (
        <p id={errorId} role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
      <FormButtons
        busy={busy}
        canSubmit={url.trim() !== ""}
        onCancel={onCancel}
      />
    </form>
  );
}

//* ---------------------------------------------------------------------------
//* Kivetítés — tanár + terem
//* ---------------------------------------------------------------------------
function ScreenBlock({
  userId,
  teacher,
  room,
  showRoom,
  screen,
  loading,
  onOpen,
}: {
  //* `null` = vendég: a sorok ezen a készüléken, `localStorage`-ban élnek.
  userId: string | null;
  teacher: string;
  room: string;
  //* Teremváltásos blokknál termenként külön cím kell — ott kiírjuk, melyik.
  showRoom: boolean;
  screen: ScreenHost | null;
  loading: boolean;
  onOpen: (screen: ScreenHost) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  //! A BÖNGÉSZŐ DÖNTI EL, NEM A PRÓBÁLKOZÁS. Ahol a lapba ágyazott képet a
  //! böngésző `https`-re írná át, ott a néző sosem kapna képkockát — ezért
  //! ott rögtön a ScreenTask saját oldala nyílik (lásd `canViewInPage`). A
  //! kérdés csak a kliensen dönthető el, ezért effektben.
  const host = screen?.host ?? null;
  const [inPage, setInPage] = useState(false);
  useEffect(() => {
    setInPage(host !== null && canViewInPage(host));
  }, [host]);

  const remove = async (current: ScreenHost) => {
    setBusy(true);
    setError(null);
    const result = await removeScreenHost(userId, current);
    setBusy(false);
    if (!result.ok) setError(result.message);
  };

  return (
    <div className="px-4 py-3">
      <SectionHead
        icon={Cast}
        label={showRoom ? `Kivetítés · ${room}` : "Kivetítés"}
        action={
          !screen &&
          !editing &&
          !loading && (
            <Button
              size="sm"
              variant="ghost"
              className={INLINE_ACTION}
              onClick={() => setEditing(true)}
            >
              <Plus className="size-3.5" aria-hidden />
              IP-cím megadása
            </Button>
          )
        }
      />

      {editing ? (
        <ScreenForm
          initial={screen ? formatScreenAddress(screen) : ""}
          onCancel={() => setEditing(false)}
          onSubmit={async (address) => {
            const result = await saveScreenHost(userId, {
              teacher,
              room,
              ...address,
            });
            if (result.ok) setEditing(false);
            return result;
          }}
        />
      ) : screen ? (
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1.5 pl-7">
          {inPage ? (
            <Button
              size="sm"
              className="h-8 gap-1.5 rounded-full px-3 text-xs"
              onClick={() => onOpen(screen)}
            >
              <Cast className="size-3.5" aria-hidden />
              Kivetítés megnyitása
            </Button>
          ) : (
            <Button
              asChild
              size="sm"
              className="h-8 gap-1.5 rounded-full px-3 text-xs"
            >
              {/*//! ÖNÁLLÓ `http` LAP, NEM BEÁGYAZOTT KÉP — erre a vegyes
                  //! tartalom szabálya nem vonatkozik, így minden böngészőben
                  //! megnyílik. */}
              <a
                href={screenTaskPageUrl(screen)}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Cast className="size-3.5" aria-hidden />
                Kivetítés megnyitása
                <ExternalLink className="size-3" aria-hidden />
              </a>
            </Button>
          )}
          <span className="font-mono text-xs text-muted-strong">
            {formatScreenAddress(screen)}
          </span>
          <span className="ml-auto flex items-center">
            <Button
              size="icon-xs"
              variant="ghost"
              className={ICON_ACTION}
              aria-label="Cím módosítása"
              disabled={busy}
              onClick={() => setEditing(true)}
            >
              <Pencil aria-hidden />
            </Button>
            <Button
              size="icon-xs"
              variant="ghost"
              className={ICON_ACTION}
              aria-label="Cím törlése"
              disabled={busy}
              onClick={() => void remove(screen)}
            >
              <X aria-hidden />
            </Button>
          </span>
        </div>
      ) : (
        <p className="mt-1 pl-7 text-pretty text-xs text-muted-foreground">
          {loading
            ? "Betöltés…"
            : "Ha a tanár ScreenTaskkal vetít, add meg a gépe címét — innen egy koppintással nézheted a képernyőjét, ugyanarról a wifiről."}
        </p>
      )}

      {error && (
        <p role="alert" className="mt-1.5 pl-7 text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

function ScreenForm({
  initial,
  onSubmit,
  onCancel,
}: {
  initial: string;
  onSubmit: (address: ScreenAddress) => Promise<MutationResult>;
  onCancel: () => void;
}) {
  const inputId = useId();
  const hintId = useId();
  const [value, setValue] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const address = parseScreenAddress(value);
    if (!address) {
      setError(
        "Helyi hálózati IP-címet adj meg, pl. 192.168.1.20 vagy 192.168.1.20:7070.",
      );
      return;
    }
    setBusy(true);
    setError(null);
    const result = await onSubmit(address);
    setBusy(false);
    if (!result.ok) setError(result.message);
  };

  return (
    <form onSubmit={submit} noValidate className="mt-2 space-y-2 pl-7">
      <label htmlFor={inputId} className="sr-only">
        A ScreenTask címe
      </label>
      <input
        ref={inputRef}
        id={inputId}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        placeholder="192.168.1.20:7070"
        className={`${INPUT} font-mono`}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        disabled={busy}
        aria-invalid={error ? true : undefined}
        aria-describedby={hintId}
      />
      <p id={hintId} className="text-pretty text-[11px] text-muted-foreground">
        {error ? (
          <span role="alert" className="text-destructive">
            {error}
          </span>
        ) : (
          "A tanári gépen, a ScreenTask ablakában látható. Port nélkül 7070."
        )}
      </p>
      <FormButtons
        busy={busy}
        canSubmit={value.trim() !== ""}
        onCancel={onCancel}
      />
    </form>
  );
}

function FormButtons({
  busy,
  canSubmit,
  onCancel,
}: {
  busy: boolean;
  canSubmit: boolean;
  onCancel: () => void;
}) {
  return (
    <div className="flex justify-end gap-2">
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="rounded-full px-3"
        disabled={busy}
        onClick={onCancel}
      >
        Mégse
      </Button>
      <Button
        type="submit"
        size="sm"
        className="rounded-full px-3"
        disabled={busy || !canSubmit}
      >
        {busy ? "Mentés…" : "Mentés"}
      </Button>
    </div>
  );
}
