"use client";

import {
  Cast,
  ExternalLink,
  GraduationCap,
  Link2,
  LogIn,
  Maximize2,
  Pencil,
  Plus,
  Radar,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type FormEvent, useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useSession } from "@/lib/auth-client";
import {
  classKeys,
  extrasKey,
  formatScreenAddress,
  type LessonLink,
  linkDisplayName,
  linksFor,
  parseScreenAddress,
  type ScreenAddress,
  type ScreenHost,
  type SharedScreen,
  sanitizeLinkLabel,
  sanitizeLinkUrl,
  screenFor,
  screenTaskPageUrl,
  sharedScreenFor,
  type TeacherLink,
  teacherLinksFor,
} from "@/lib/lesson-extras";
import {
  addLessonLink,
  type MutationResult,
  removeLessonLink,
  removeScreenHost,
  saveScreenHost,
  useLessonExtras,
} from "@/lib/lesson-extras-store";
import {
  type DiscoveryProgress,
  discoverScreen,
  discoveryAddresses,
  SCHOOL_HOST_PREFIX,
  thirdOctetCandidates,
} from "@/lib/screen-discovery";
import {
  addTeacherLink,
  removeRoomScreen,
  removeTeacherLink,
  saveRoomScreen,
  useSharedExtras,
  useTeacherSelf,
} from "@/lib/shared-extras-store";
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
  classes,
  rooms,
}: {
  //* A tanár jele: a diák nézetében a kártyáról, a tanáriban a nézett tanáré.
  teacher: string;
  subject: string;
  //* Az óra osztálya(i): a diák nézetében a nézett osztály, a tanáriban a
  //* kártyáé. A tanári linkek osztályra szűkítéséhez kell.
  classes: string[];
  rooms: string[];
}) {
  const { data: session, isPending } = useSession();
  const userId = session?.user.id ?? null;
  const { status, extras } = useLessonExtras(userId);
  const { status: sharedStatus, shared } = useSharedExtras();
  const self = useTeacherSelf(userId, session?.user.isTeacher === true);
  const [viewing, setViewing] = useState<{
    screen: ScreenAddress;
    room: string;
  } | null>(null);

  //! TANÁR NÉLKÜL NINCS KULCS. Mindkét sor a tanárhoz kötődik; ha a forrás nem
  //! adott tanárt, nincs mihez menteni — a szakasz ilyenkor meg sem jelenik.
  if (!extrasKey(teacher) || isPending) return null;

  const loading = status === "loading";
  const sharedLoading = sharedStatus === "loading";
  const distinctRooms = [...new Set(rooms.filter((room) => extrasKey(room)))];
  //! A SAJÁT ÓRA A TANÁR JELÉN MÚLIK, NEM A NÉZETEN. Egy tanár más tanár
  //! órarendjét is megnyithatja — oda nem tehet fel linket.
  const ownLesson = self.short !== null && self.short === extrasKey(teacher);

  return (
    <>
      {extrasKey(subject) && (
        <LinksBlock
          userId={userId}
          teacher={teacher}
          subject={subject}
          classes={classKeys(classes)}
          links={linksFor(extras, teacher, subject)}
          teacherLinks={teacherLinksFor(shared, teacher, subject, classes)}
          ownLesson={ownLesson}
          loading={loading || sharedLoading}
          failed={status === "error"}
        />
      )}
      {distinctRooms.map((room) => (
        <ScreenBlock
          key={room}
          userId={userId}
          isTeacher={self.isTeacher}
          teacher={teacher}
          room={room}
          showRoom={distinctRooms.length > 1}
          shared={sharedScreenFor(shared, room)}
          personal={screenFor(extras, teacher, room)}
          loading={loading || sharedLoading}
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
  classes,
  links,
  teacherLinks,
  ownLesson,
  loading,
  failed,
}: {
  //* `null` = vendég: a sorok ezen a készüléken, `localStorage`-ban élnek.
  userId: string | null;
  teacher: string;
  subject: string;
  classes: string[];
  links: LessonLink[];
  //* A tanár által feltett linkek — mindenki látja, csak ő törölheti.
  teacherLinks: TeacherLink[];
  //* A belépett felhasználó ennek az órának a tanára: a hozzáadás nála KÖZÖS
  //* linket ment, nem saját könyvjelzőt.
  ownLesson: boolean;
  loading: boolean;
  failed: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (id: string, action: () => Promise<MutationResult>) => {
    setRemoving(id);
    setError(null);
    const result = await action();
    setRemoving(null);
    if (!result.ok) setError(result.message);
  };

  const empty = links.length === 0 && teacherLinks.length === 0;

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
              {ownLesson ? "Link a diákoknak" : "Link hozzáadása"}
            </Button>
          )
        }
      />

      {!empty && (
        <ul className="mt-1 space-y-0.5 pl-7">
          {teacherLinks.map((link) => (
            <LinkRow
              key={link.id}
              link={link}
              badge={
                link.classes.length > 0 && ownLesson
                  ? link.classes.join(", ").toUpperCase()
                  : "tanár"
              }
              busy={removing === link.id}
              onRemove={
                ownLesson
                  ? () => void run(link.id, () => removeTeacherLink(link.id))
                  : undefined
              }
            />
          ))}
          {links.map((link) => (
            <LinkRow
              key={link.id}
              link={link}
              busy={removing === link.id}
              onRemove={() =>
                void run(link.id, () => removeLessonLink(userId, link.id))
              }
            />
          ))}
        </ul>
      )}

      {empty && !adding && (
        <p className="mt-1 pl-7 text-pretty text-xs text-muted-foreground">
          {loading
            ? "Betöltés…"
            : failed
              ? "Most nem sikerült betölteni a mentett linkjeidet."
              : ownLesson
                ? "Classroom, Teams, feladatlap — amit itt felteszel, minden diák látja ennek a tárgynak az óráin."
                : "Classroom, feladatlap, Teams — amit ehhez a tanárhoz és tárgyhoz mentesz, minden órájukon itt lesz."}
        </p>
      )}

      {adding && (
        <LinkForm
          classes={ownLesson ? classes : null}
          onCancel={() => setAdding(false)}
          onSubmit={async (url, label, onlyTheseClasses) => {
            const result = ownLesson
              ? await addTeacherLink({
                  teacher,
                  subject,
                  classes: onlyTheseClasses ? classes : [],
                  url,
                  label,
                })
              : await addLessonLink(userId, { teacher, subject, url, label });
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

function LinkRow({
  link,
  badge,
  busy,
  onRemove,
}: {
  link: Pick<LessonLink, "url" | "label">;
  //* Közös (tanári) linknél a jelölés; saját könyvjelzőnél nincs.
  badge?: string;
  busy: boolean;
  onRemove?: () => void;
}) {
  const name = linkDisplayName(link);
  return (
    <li className="flex items-center gap-2">
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
        {badge && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-foreground/10 px-1.5 py-px text-[10px] font-semibold text-muted-strong">
            <GraduationCap className="size-3" aria-hidden />
            {badge}
          </span>
        )}
      </a>
      {onRemove && (
        <Button
          size="icon-xs"
          variant="ghost"
          className={ICON_ACTION}
          aria-label={`„${name}” törlése`}
          disabled={busy}
          onClick={onRemove}
        >
          <X aria-hidden />
        </Button>
      )}
    </li>
  );
}

function LinkForm({
  classes,
  onSubmit,
  onCancel,
}: {
  //* Tanári linknél az óra osztályai (a szűkítés ajánlatához); `null` = saját
  //* könyvjelző, nincs mire szűkíteni.
  classes: string[] | null;
  onSubmit: (
    url: string,
    label: string | null,
    onlyTheseClasses: boolean,
  ) => Promise<MutationResult>;
  onCancel: () => void;
}) {
  const scopeId = useId();
  const canScope = classes !== null && classes.length > 0;
  const [onlyTheseClasses, setOnlyTheseClasses] = useState(canScope);
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
    const result = await onSubmit(
      clean,
      sanitizeLinkLabel(label),
      canScope && onlyTheseClasses,
    );
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
      {classes !== null && (
        //! KIMONDJUK, KI LÁTJA. A tanár ne azt higgye, hogy csak magának ment.
        <div className="space-y-1 text-pretty text-[11px] text-muted-foreground">
          {canScope && (
            <label
              htmlFor={scopeId}
              className="flex items-center gap-2 text-xs text-foreground"
            >
              <input
                id={scopeId}
                type="checkbox"
                className="size-4 accent-primary"
                checked={onlyTheseClasses}
                onChange={(event) => setOnlyTheseClasses(event.target.checked)}
                disabled={busy}
              />
              Csak ennek az osztálynak: {classes.join(", ").toUpperCase()}
            </label>
          )}
          <p>
            {canScope && onlyTheseClasses
              ? "Ennek az osztálynak minden diákja látja ennél a tárgynál, belépés nélkül is."
              : "A tárgy minden órájánál látja minden diák, belépés nélkül is."}
          </p>
        </div>
      )}
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
  isTeacher,
  teacher,
  room,
  showRoom,
  shared,
  personal,
  loading,
  onOpen,
}: {
  //* `null` = vendég: a sorok ezen a készüléken, `localStorage`-ban élnek.
  userId: string | null;
  //* Bármelyik tanár beállíthatja vagy átírhatja a terem címét.
  isTeacher: boolean;
  teacher: string;
  room: string;
  //* Teremváltásos blokknál termenként külön cím kell — ott kiírjuk, melyik.
  showRoom: boolean;
  //* A terem közös címe — egy tanár állította be, mindenkinek ez nyílik.
  shared: SharedScreen | null;
  //! A DIÁK SAJÁT CÍME CSAK TARTALÉK. Ott kell, ahol még egyik tanár sem
  //! állította be a termet; amint van közös cím, az nyer, és a saját elbújik.
  personal: ScreenHost | null;
  loading: boolean;
  onOpen: (screen: ScreenAddress) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const screen: ScreenAddress | null = shared ?? personal;
  //! A BÖNGÉSZŐ DÖNTI EL, NEM A PRÓBÁLKOZÁS. Ahol a lapba ágyazott képet a
  //! böngésző `https`-re írná át, ott a néző sosem kapna képkockát — ezért
  //! ott rögtön a ScreenTask saját oldala nyílik (lásd `canViewInPage`). A
  //! kérdés csak a kliensen dönthető el, ezért effektben.
  const host = screen?.host ?? null;
  const [inPage, setInPage] = useState(false);
  useEffect(() => {
    setInPage(host !== null && canViewInPage(host));
  }, [host]);

  //* Tanár a TEREM címét írja; diák csak a sajátját, és csak ha nincs közös.
  const editsShared = isTeacher;
  const canEdit = editsShared || !shared;

  const act = async (action: () => Promise<MutationResult>) => {
    setBusy(true);
    setError(null);
    const result = await action();
    setBusy(false);
    if (!result.ok) setError(result.message);
    return result;
  };

  const remove = () =>
    act(() =>
      shared
        ? removeRoomScreen(room)
        : personal
          ? removeScreenHost(userId, personal)
          : Promise.resolve({ ok: true } as const),
    );

  const pageHref = `/kivetites/${encodeURIComponent(room)}`;

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
              {editsShared ? "A terem IP-címe" : "IP-cím megadása"}
            </Button>
          )
        }
      />

      {editing ? (
        <ScreenForm
          initial={screen ? formatScreenAddress(screen) : ""}
          room={room}
          hint={
            editsShared
              ? `A ${room} terem címe lesz mindenkinek, amíg egy tanár át nem írja. A ScreenTask ablakában látható; port nélkül 7070.`
              : "Csak neked mentjük. A tanári gépen, a ScreenTask ablakában látható. Port nélkül 7070."
          }
          onCancel={() => setEditing(false)}
          onSubmit={async (address) => {
            const result = await act(() =>
              editsShared
                ? saveRoomScreen(room, address)
                : saveScreenHost(userId, { teacher, room, ...address }),
            );
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
          {shared && (
            <Button
              asChild
              size="sm"
              variant="ghost"
              className="h-8 gap-1.5 rounded-full px-2.5 text-xs"
            >
              <Link href={pageHref}>
                <Maximize2 className="size-3.5" aria-hidden />
                Külön lapon
              </Link>
            </Button>
          )}
          <span className="font-mono text-xs text-muted-strong">
            {formatScreenAddress(screen)}
            {!shared && (
              <span className="ml-1.5 font-sans text-[10px]">(saját)</span>
            )}
          </span>
          {canEdit && (
            <span className="ml-auto flex items-center">
              <Button
                size="icon-xs"
                variant="ghost"
                className={ICON_ACTION}
                aria-label={
                  editsShared ? "A terem címének módosítása" : "Cím módosítása"
                }
                disabled={busy}
                onClick={() => setEditing(true)}
              >
                <Pencil aria-hidden />
              </Button>
              {(editsShared ? shared : personal) && (
                <Button
                  size="icon-xs"
                  variant="ghost"
                  className={ICON_ACTION}
                  aria-label={
                    editsShared ? "A terem címének törlése" : "Cím törlése"
                  }
                  disabled={busy}
                  onClick={() => void remove()}
                >
                  <X aria-hidden />
                </Button>
              )}
            </span>
          )}
        </div>
      ) : (
        <p className="mt-1 pl-7 text-pretty text-xs text-muted-foreground">
          {loading
            ? "Betöltés…"
            : editsShared
              ? "Add meg egyszer a tanári gép címét — onnantól ebben a teremben minden diák egy koppintással nézheti, IP-cím nélkül."
              : "Ebben a teremben még egyik tanár sem adta meg a kivetítő címét. Ha tudod, mentheted magadnak is."}
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

export function ScreenForm({
  initial,
  hint,
  room,
  onSubmit,
  onCancel,
}: {
  initial: string;
  hint: string;
  //* A terem neve — ebből tippeli a keresés a cím harmadik számát.
  room: string;
  onSubmit: (address: ScreenAddress) => Promise<MutationResult>;
  onCancel: () => void;
}) {
  const inputId = useId();
  const hintId = useId();
  const [value, setValue] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  //! Keresni csak ott lehet, ahol a néző is működne — ugyanazt a képet tölti.
  const [canSearch, setCanSearch] = useState(false);
  useEffect(() => {
    setCanSearch(canViewInPage(`${SCHOOL_HOST_PREFIX}0.1`));
  }, []);
  const [progress, setProgress] = useState<DiscoveryProgress | null>(null);
  const searchRef = useRef<AbortController | null>(null);
  useEffect(() => () => searchRef.current?.abort(), []);

  const search = async () => {
    if (searchRef.current) {
      searchRef.current.abort();
      return;
    }
    const octets = thirdOctetCandidates(room, value);
    setError(null);
    setNotice(null);
    if (octets.length === 0) {
      setError(
        `A terem nevéből nem derül ki a cím. Írd be az elejét (pl. ${SCHOOL_HOST_PREFIX}12.), és keress újra.`,
      );
      return;
    }
    const controller = new AbortController();
    searchRef.current = controller;
    const result = await discoverScreen(discoveryAddresses(octets), {
      signal: controller.signal,
      onProgress: setProgress,
    });
    searchRef.current = null;
    setProgress(null);
    const ranges = octets.map((o) => `${SCHOOL_HOST_PREFIX}${o}.x`).join(", ");
    switch (result.status) {
      case "found":
        setValue(formatScreenAddress(result.address));
        setNotice("Megvan! Ellenőrizd, és mentsd el.");
        break;
      case "not-found":
        setError(
          `Nem válaszolt ScreenTask (${ranges}). Fut a tanári gépen, és egy hálózaton vagy vele? Ha tudod a terem számát, írd be (pl. ${SCHOOL_HOST_PREFIX}12.), és keress újra.`,
        );
        break;
      case "denied":
        setError(
          "A böngésző nem engedi a helyi hálózat elérését. Engedélyezd a címsor melletti ikonnál, és keress újra.",
        );
        break;
      case "aborted":
        break;
    }
  };
  const searching = progress !== null;

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
        disabled={busy || searching}
        aria-invalid={error ? true : undefined}
        aria-describedby={hintId}
      />
      <p id={hintId} className="text-pretty text-[11px] text-muted-foreground">
        {error ? (
          <span role="alert" className="text-destructive">
            {error}
          </span>
        ) : progress?.phase === "permission" ? (
          <output>
            Engedélyezd a böngészőnek a helyi hálózat elérését a felugró
            ablakban.
          </output>
        ) : progress ? (
          <output>
            Keresés a hálózaton… {progress.done}/{progress.total}
          </output>
        ) : notice ? (
          <output>{notice}</output>
        ) : (
          hint
        )}
      </p>
      <FormButtons
        busy={busy}
        canSubmit={!searching && value.trim() !== ""}
        onCancel={onCancel}
        extra={
          canSearch && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="mr-auto gap-1.5 rounded-full px-3"
              disabled={busy}
              onClick={() => void search()}
            >
              {searching ? (
                <Spinner className="size-3.5" />
              ) : (
                <Radar className="size-3.5" aria-hidden />
              )}
              {searching ? "Leállítás" : "Keresés a hálózaton"}
            </Button>
          )
        }
      />
    </form>
  );
}

function FormButtons({
  busy,
  canSubmit,
  onCancel,
  extra,
}: {
  busy: boolean;
  canSubmit: boolean;
  onCancel: () => void;
  extra?: React.ReactNode;
}) {
  return (
    <div className="flex justify-end gap-2">
      {extra}
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
