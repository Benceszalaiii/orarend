"use client";

import { Eye, EyeOff, MessageSquare, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  deleteComment,
  deletePost,
} from "../../szakkorok/[slug]/board-actions";
import { useRowAction } from "../_components/use-row-action";
import { deleteIdea, setIdeaHidden } from "./actions";

export type AdminIdeaRow = {
  id: string;
  title: string;
  note: string | null;
  hidden: boolean;
  createdAt: string;
  club: { slug: string; name: string } | null;
  voteCount: number;
};

export type AdminBoardItem = {
  kind: "post" | "comment";
  id: string;
  body: string;
  createdAt: string;
  author: string;
  club: { slug: string; name: string };
  commentCount: number;
};

const WHEN = new Intl.DateTimeFormat("hu-HU", {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const SMALL_BUTTON =
  "inline-flex h-7 shrink-0 items-center gap-1 rounded-full px-2.5 text-xs text-muted-strong hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50";

//! KÉT SOR, KÉT KÉRDÉS. Az ötletlap azt kérdezi: mi maradjon látható? A
//! hírfolyam azt: mi került ki mostanában, ami nem odavaló?
//*
//! AZ ÖTLET SZERZŐJE ITT SEM LÁTSZIK. Az `/adatvedelem` azt ígéri, hogy azt,
//! ki írt fel egy témát és ki jelezte, „senki nem látja" — az üzemeltető sem.
//! A moderáláshoz a szöveg elég: a sértő témát el lehet rejteni anélkül, hogy
//! tudnánk, kitől jött. A hírfolyam más: ott a név a lapon is ott áll.
export function ClubModeration({
  ideas,
  board,
}: {
  ideas: AdminIdeaRow[];
  board: AdminBoardItem[];
}) {
  const [showHidden, setShowHidden] = useState(false);
  const hiddenCount = ideas.filter((i) => i.hidden).length;
  const visibleIdeas = showHidden ? ideas.filter((i) => i.hidden) : ideas;

  return (
    <div className="mt-12 grid gap-10 lg:grid-cols-2 lg:gap-8">
      <section aria-labelledby="ideas-heading" className="min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2
            id="ideas-heading"
            className="text-base font-semibold text-foreground"
          >
            Ötletek
            <span className="ml-2 text-sm font-normal tabular-nums text-muted-foreground">
              {ideas.length}
            </span>
          </h2>
          <label className="inline-flex items-center gap-2 text-xs text-muted-strong">
            <input
              type="checkbox"
              checked={showHidden}
              onChange={(e) => setShowHidden(e.target.checked)}
              className="size-3.5 accent-primary"
            />
            Csak a rejtettek ({hiddenCount})
          </label>
        </div>
        {visibleIdeas.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            {showHidden ? "Nincs rejtett ötlet." : "Még nincs ötlet."}
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
            {visibleIdeas.map((idea) => (
              <IdeaRow key={idea.id} idea={idea} />
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="board-heading" className="min-w-0">
        <h2
          id="board-heading"
          className="text-base font-semibold text-foreground"
        >
          Hírfolyamok — legutóbb
        </h2>
        {board.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            Még senki nem írt egyik hírfolyamba sem.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
            {board.map((item) => (
              <BoardRow key={`${item.kind}-${item.id}`} item={item} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function IdeaRow({ idea }: { idea: AdminIdeaRow }) {
  const { pending, error, run } = useRowAction();
  return (
    <li className={cn("px-4 py-3", idea.hidden && "bg-muted/30")}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p
            className={cn(
              "text-sm font-medium text-foreground",
              idea.hidden && "text-muted-strong line-through",
            )}
          >
            {idea.title}
          </p>
          {idea.note && (
            <p className="mt-0.5 line-clamp-2 text-xs text-muted-strong">
              {idea.note}
            </p>
          )}
          <p className="mt-1 text-[11px] text-muted-foreground tabular-nums">
            {WHEN.format(new Date(idea.createdAt))} · {idea.voteCount} jelzés
            {idea.club && (
              <>
                {" · "}
                <Link
                  href={`/szakkorok/${idea.club.slug}`}
                  className="text-primary underline-offset-4 hover:underline"
                >
                  {idea.club.name}
                </Link>
              </>
            )}
          </p>
          {error && (
            <p role="alert" className="mt-1 text-xs text-destructive">
              {error}
            </p>
          )}
        </div>
        <div className="flex shrink-0 gap-1">
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => setIdeaHidden(idea.id, !idea.hidden))}
            className={SMALL_BUTTON}
          >
            {idea.hidden ? (
              <>
                <Eye className="size-3.5" aria-hidden />
                Visszaállítás
              </>
            ) : (
              <>
                <EyeOff className="size-3.5" aria-hidden />
                Elrejtés
              </>
            )}
          </button>
          <button
            type="button"
            disabled={pending}
            aria-label={`Törlés: ${idea.title}`}
            onClick={() =>
              run(
                () => deleteIdea(idea.id),
                `Véglegesen törlöd az ötletet: „${idea.title}"? A ${idea.voteCount} jelzés is elvész, és ugyanez a szöveg újra felírható lesz. Sértő tartalomnál inkább rejtsd el.`,
              )
            }
            className={cn(SMALL_BUTTON, "hover:text-destructive")}
          >
            <Trash2 className="size-3.5" aria-hidden />
          </button>
        </div>
      </div>
    </li>
  );
}

function BoardRow({ item }: { item: AdminBoardItem }) {
  const { pending, error, run } = useRowAction();
  const isPost = item.kind === "post";
  return (
    <li className="px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] text-muted-foreground">
            <span className="font-medium text-muted-strong">{item.author}</span>{" "}
            {isPost ? "bejegyzése" : "hozzászólása"} ·{" "}
            <Link
              href={`/szakkorok/${item.club.slug}`}
              className="text-primary underline-offset-4 hover:underline"
            >
              {item.club.name}
            </Link>{" "}
            · {WHEN.format(new Date(item.createdAt))}
          </p>
          <p
            className={cn(
              "mt-1 line-clamp-3 text-sm whitespace-pre-line text-foreground",
              !isPost && "border-l-2 border-border pl-2",
            )}
          >
            {item.body}
          </p>
          {isPost && item.commentCount > 0 && (
            <p className="mt-1 inline-flex items-center gap-1 text-[11px] text-muted-foreground">
              <MessageSquare className="size-3" aria-hidden />
              {item.commentCount} hozzászólás
            </p>
          )}
          {error && (
            <p role="alert" className="mt-1 text-xs text-destructive">
              {error}
            </p>
          )}
        </div>
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            run(
              () =>
                isPost
                  ? deletePost(item.club.slug, item.id)
                  : deleteComment(item.club.slug, item.id),
              isPost
                ? `Törlöd ${item.author} bejegyzését${item.commentCount > 0 ? ` és a ${item.commentCount} hozzászólását` : ""}? Nem vonható vissza.`
                : `Törlöd ${item.author} hozzászólását? Nem vonható vissza.`,
            )
          }
          className={cn(SMALL_BUTTON, "hover:text-destructive")}
        >
          <Trash2 className="size-3.5" aria-hidden />
          Törlés
        </button>
      </div>
    </li>
  );
}
