"use client";

import { MessageSquare, SendHorizontal, Trash2 } from "lucide-react";
import Link from "next/link";
import { useId, useRef, useState, useTransition } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { accentStyle } from "@/lib/accent";
import {
  boardSegments,
  COMMENT_MAX,
  initials,
  POST_MAX,
} from "@/lib/club-board";
import { currentSubscription } from "@/lib/push";
import { cn } from "@/lib/utils";
import {
  type BoardActionResult,
  createComment,
  createPost,
  deleteComment,
  deletePost,
} from "./board-actions";

//* ---------------------------------------------------------------------------
//* A HÍRFOLYAM — A GOOGLE CLASSROOM „STREAM" LAPJÁNAK MINTÁJÁRA
//* ---------------------------------------------------------------------------
//! FELÜL AZ ÍRÁS, ALATTA A BEJEGYZÉSEK, MINDEN ALATT A SAJÁT SZÁLA. Az
//! összecsukott író-kártya („Írj valamit a szakkörnek…") nem foglal helyet,
//! amíg nem kell; a bejegyzés alatt az utolsó két hozzászólás látszik, a
//! többi egy gomb mögött — mint a Classroomban.
//!
//! A SZERVER DÖNT, A LAP CSAK MEGJELENÍT. Hogy ki írhat és mit törölhet, azt a
//! lap már kiszámolva kapja (`canWrite`, `canDelete`); az actionök ugyanezt
//! újra megkérdezik, tehát a gomb elrejtése kényelem, nem védelem.

export type BoardItemView = {
  id: string;
  body: string;
  //* A szerveren formázott idő („ma 14:32") — így a hidratálás nem tér el.
  when: string;
  iso: string;
  author: {
    name: string;
    className: string | null;
    teacher: boolean;
    me: boolean;
  };
  canDelete: boolean;
};

export type BoardPostView = BoardItemView & { comments: BoardItemView[] };

//* Hány hozzászólás látszik egy bejegyzés alatt a „mind" gomb előtt.
const VISIBLE_COMMENTS = 2;

export function Board({
  slug,
  posts,
  canWrite,
  viewerName,
  closedNote,
  moreHref,
}: {
  slug: string;
  posts: BoardPostView[];
  canWrite: boolean;
  viewerName: string;
  //* Ha a néző nem írhat: miért nem, egy mondatban.
  closedNote: React.ReactNode;
  moreHref: string | null;
}) {
  return (
    <section aria-label="Hírfolyam" className="flex flex-col gap-4">
      {canWrite ? (
        <Composer slug={slug} viewerName={viewerName} />
      ) : (
        <p className="rounded-2xl border border-dashed border-border px-4 py-3 text-sm text-muted-strong">
          {closedNote}
        </p>
      )}

      {posts.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-border px-6 py-12 text-center">
          <MessageSquare className="size-6 text-muted-foreground" aria-hidden />
          <p className="text-sm font-medium text-foreground">
            Még csend van a hírfolyamon.
          </p>
          <p className="max-w-sm text-pretty text-sm text-muted-strong">
            Itt jelennek meg a vezetők hírei és a tagok kérdései — a
            hozzászólásokkal együtt.
          </p>
        </div>
      ) : (
        <ol className="flex flex-col gap-4">
          {posts.map((post) => (
            <li key={post.id}>
              <PostCard
                slug={slug}
                post={post}
                canWrite={canWrite}
                viewerName={viewerName}
              />
            </li>
          ))}
        </ol>
      )}

      {moreHref && (
        <Link
          href={moreHref}
          scroll={false}
          className="self-center rounded-full px-4 py-2 text-sm font-medium text-muted-strong transition-colors hover:bg-muted hover:text-foreground"
        >
          Korábbi bejegyzések
        </Link>
      )}
    </section>
  );
}

//* ---------------------------------------------------------------------------
//* AZ ÍRÓ-KÁRTYA
//* ---------------------------------------------------------------------------

//! A SAJÁT KÉSZÜLÉKEDNEK NEM SZÓLUNK a saját bejegyzésedről. A push-cím csak
//! szűrésre megy fel; ha a böngésző nem adja meg gyorsan, nem várunk rá.
async function ownEndpoint(): Promise<string | null> {
  const timeout = new Promise<null>((resolve) =>
    setTimeout(() => resolve(null), 600),
  );
  const sub = await Promise.race([currentSubscription(), timeout]).catch(
    () => null,
  );
  return sub?.endpoint ?? null;
}

function Composer({ slug, viewerName }: { slug: string; viewerName: string }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const fieldId = useId();

  const submit = () => {
    if (!text.trim() || pending) return;
    setError(null);
    startTransition(async () => {
      const result = await createPost(slug, text, await ownEndpoint());
      if (result.ok) {
        setText("");
        setOpen(false);
      } else setError(result.error);
    });
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 text-left text-sm text-muted-strong shadow-xs transition-colors hover:bg-muted/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <Avatar name={viewerName} />
        Írj valamit a szakkörnek…
      </button>
    );
  }

  return (
    <form
      className="rounded-2xl border border-border bg-card p-4 shadow-sm"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <label htmlFor={fieldId} className="sr-only">
        Új bejegyzés
      </label>
      <textarea
        id={fieldId}
        // biome-ignore lint/a11y/noAutofocus: a kártyát épp most nyitotta meg a néző, hogy írjon
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          //* Cmd/Ctrl+Enter küld — a sima Enter új sor, mint egy levélben.
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            submit();
          }
        }}
        maxLength={POST_MAX}
        rows={4}
        placeholder="Hír, kérdés, link a következő alkalomhoz…"
        className="field-sizing-content block max-h-[60vh] min-h-24 w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-[15px] leading-relaxed text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
      />
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-strong" aria-live="polite">
          {error ? (
            <span className="text-destructive">{error}</span>
          ) : text.length > POST_MAX * 0.9 ? (
            <span className="tabular-nums">
              {text.length} / {POST_MAX}
            </span>
          ) : (
            "Minden belépett jedlikes látja."
          )}
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              setError(null);
            }}
            className="h-9 rounded-full px-4 text-sm font-medium text-muted-strong transition-colors hover:bg-muted hover:text-foreground"
          >
            Mégse
          </button>
          <button
            type="submit"
            disabled={!text.trim() || pending}
            className="h-9 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            {pending ? "Küldés…" : "Közzététel"}
          </button>
        </div>
      </div>
    </form>
  );
}

//* ---------------------------------------------------------------------------
//* EGY BEJEGYZÉS ÉS A SZÁLA
//* ---------------------------------------------------------------------------
function PostCard({
  slug,
  post,
  canWrite,
  viewerName,
}: {
  slug: string;
  post: BoardPostView;
  canWrite: boolean;
  viewerName: string;
}) {
  const [all, setAll] = useState(false);
  const hidden = all ? 0 : Math.max(0, post.comments.length - VISIBLE_COMMENTS);
  const shown = post.comments.slice(hidden);

  return (
    <article
      id={`post-${post.id}`}
      className="scroll-mt-24 overflow-hidden rounded-2xl border border-border bg-card shadow-xs"
    >
      <div className="px-4 pt-4 pb-3 sm:px-5">
        <ItemHeader
          item={post}
          size="post"
          onDelete={() => deletePost(slug, post.id)}
          what="bejegyzés"
        />
        <Body text={post.body} className="mt-3 text-[15px]" />
      </div>

      {(post.comments.length > 0 || canWrite) && (
        <div className="border-t border-border px-4 py-3 sm:px-5">
          {hidden > 0 && (
            <button
              type="button"
              onClick={() => setAll(true)}
              className="mb-2 inline-flex items-center gap-1.5 rounded-full py-1 text-sm font-medium text-muted-strong transition-colors hover:text-foreground"
            >
              <MessageSquare className="size-4" aria-hidden />
              Mind a {post.comments.length} hozzászólás
            </button>
          )}
          {shown.length > 0 && (
            <ul className="flex flex-col gap-3">
              {shown.map((comment) => (
                <li key={comment.id}>
                  <ItemHeader
                    item={comment}
                    size="comment"
                    onDelete={() => deleteComment(slug, comment.id)}
                    what="hozzászólás"
                  >
                    <Body text={comment.body} className="mt-0.5 text-sm" />
                  </ItemHeader>
                </li>
              ))}
            </ul>
          )}
          {canWrite && (
            <CommentBox
              slug={slug}
              postId={post.id}
              viewerName={viewerName}
              spaced={shown.length > 0}
            />
          )}
        </div>
      )}
    </article>
  );
}

function CommentBox({
  slug,
  postId,
  viewerName,
  spaced,
}: {
  slug: string;
  postId: string;
  viewerName: string;
  spaced: boolean;
}) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const ref = useRef<HTMLTextAreaElement>(null);
  const fieldId = useId();

  const submit = () => {
    if (!text.trim() || pending) return;
    setError(null);
    startTransition(async () => {
      const result = await createComment(slug, postId, text);
      if (result.ok) setText("");
      else setError(result.error);
    });
  };

  return (
    <form
      className={cn("flex items-start gap-3", spaced && "mt-3")}
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <Avatar name={viewerName} small />
      <div className="min-w-0 grow">
        <div className="flex items-end gap-1 rounded-2xl border border-input bg-background pr-1 focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50">
          <label htmlFor={fieldId} className="sr-only">
            Hozzászólás
          </label>
          <textarea
            id={fieldId}
            ref={ref}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              //* Enter küld, Shift+Enter új sor — ahogy egy csevegőben.
              if (
                e.key === "Enter" &&
                !e.shiftKey &&
                !e.nativeEvent.isComposing
              ) {
                e.preventDefault();
                submit();
              }
            }}
            maxLength={COMMENT_MAX}
            rows={1}
            placeholder="Hozzászólás…"
            className="field-sizing-content block max-h-48 min-h-9 w-full grow resize-none bg-transparent px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground"
          />
          <button
            type="submit"
            disabled={!text.trim() || pending}
            className="mb-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-full text-primary transition-colors hover:bg-primary/10 disabled:text-muted-foreground disabled:hover:bg-transparent focus-visible:outline-2 focus-visible:outline-ring"
          >
            <SendHorizontal className="size-4" aria-hidden />
            <span className="sr-only">Hozzászólás küldése</span>
          </button>
        </div>
        {error && (
          <p className="mt-1 text-xs text-destructive" aria-live="polite">
            {error}
          </p>
        )}
      </div>
    </form>
  );
}

//* ---------------------------------------------------------------------------
//* KÖZÖS DARABOK
//* ---------------------------------------------------------------------------
function ItemHeader({
  item,
  size,
  onDelete,
  what,
  children,
}: {
  item: BoardItemView;
  size: "post" | "comment";
  onDelete: () => Promise<BoardActionResult>;
  what: string;
  children?: React.ReactNode;
}) {
  const { author } = item;
  return (
    <div className="group/item flex items-start gap-3">
      <Avatar name={author.name} small={size === "comment"} />
      <div className="min-w-0 grow">
        <div className="flex items-start justify-between gap-2">
          <p
            className={cn(
              "flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5",
              size === "post" ? "text-sm" : "text-[13px]",
            )}
          >
            <span className="font-semibold text-foreground">{author.name}</span>
            {author.teacher ? (
              <span className="rounded-full bg-primary/10 px-1.5 py-px text-[11px] font-medium text-primary">
                Tanár
              </span>
            ) : (
              author.className && (
                <span className="text-xs text-muted-strong">
                  {author.className}
                </span>
              )
            )}
            <time
              dateTime={item.iso}
              className="text-xs text-muted-foreground tabular-nums"
            >
              {item.when}
            </time>
          </p>
          {item.canDelete && (
            <DeleteButton
              what={what}
              mine={author.me}
              onDelete={onDelete}
              subtle={size === "comment"}
            />
          )}
        </div>
        {children}
      </div>
    </div>
  );
}

function DeleteButton({
  what,
  mine,
  onDelete,
  subtle,
}: {
  what: string;
  mine: boolean;
  onDelete: () => Promise<BoardActionResult>;
  subtle: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-[color,background-color,opacity] hover:bg-muted hover:text-foreground focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-ring",
            //* A hozzászólásnál csak rámutatva jelenik meg (érintőn mindig).
            subtle &&
              "-my-1.5 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/item:opacity-100",
          )}
        >
          <Trash2 className="size-3.5" aria-hidden />
          <span className="sr-only">A {what} törlése</span>
        </button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Törlöd a {what}t?</AlertDialogTitle>
          <AlertDialogDescription>
            {what === "bejegyzés"
              ? "A bejegyzés a hozzászólásaival együtt végleg eltűnik."
              : "A hozzászólás végleg eltűnik."}
            {!mine &&
              " Nem a te írásod — a vezetőként vagy üzemeltetőként törlöd."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <AlertDialogFooter>
          <AlertDialogCancel>Mégse</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={pending}
            onClick={(e) => {
              e.preventDefault();
              startTransition(async () => {
                const result = await onDelete();
                if (!result.ok) setError(result.error);
              });
            }}
          >
            Törlés
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

//! A LINK ÚJ LAPON NYÍLIK, ÉS NEM VISZ MAGÁVAL SEMMIT: `noopener` (az idegen
//! lap ne érje el ezt az ablakot), `noreferrer` (ne tudja meg, honnan jöttek),
//! `nofollow ugc` (felhasználói tartalom — a keresőnek nem ajánlás).
function Body({ text, className }: { text: string; className?: string }) {
  return (
    <p
      className={cn(
        "whitespace-pre-wrap break-words text-pretty leading-relaxed text-foreground",
        className,
      )}
    >
      {boardSegments(text).map((segment, i) =>
        segment.kind === "link" ? (
          <a
            // biome-ignore lint/suspicious/noArrayIndexKey: a darabok sorrendje a szövegé, nem változik
            key={i}
            href={segment.href}
            target="_blank"
            rel="noopener noreferrer nofollow ugc"
            className="font-medium text-primary underline underline-offset-4"
          >
            {segment.text}
          </a>
        ) : (
          // biome-ignore lint/suspicious/noArrayIndexKey: lásd fent
          <span key={i}>{segment.text}</span>
        ),
      )}
    </p>
  );
}

//* A név színe a névből — ugyanaz a diák mindenhol ugyanazt a színt kapja,
//* mint a Classroomban; a szín a lap palettáját követi (`accentStyle`).
export function Avatar({ name, small }: { name: string; small?: boolean }) {
  return (
    <span
      aria-hidden
      style={accentStyle(name)}
      className={cn(
        "acc-tint-strong inline-flex shrink-0 select-none items-center justify-center rounded-full border font-semibold text-foreground",
        small ? "size-8 text-[11px]" : "size-10 text-sm",
      )}
    >
      {initials(name)}
    </span>
  );
}
