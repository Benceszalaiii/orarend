"use client";

import {
  ArrowUpRight,
  Check,
  EyeOff,
  Heart,
  LogIn,
  Plus,
  Undo2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useOptimistic, useState, useTransition } from "react";
import { EmptyPanel, listGroup } from "@/components/ma/week-panels";
import { IDEA_NOTE_MAX, IDEA_TITLE_MAX, interestLabel } from "@/lib/club-ideas";
import { cn } from "@/lib/utils";
import { hideIdea, postIdea, setIdeaVote, withdrawIdea } from "./idea-actions";

//* ---------------------------------------------------------------------------
//* MIRE LENNE IGÉNY?
//* ---------------------------------------------------------------------------
//! KÉT KÖZÖNSÉG, EGY LISTA. A diák felír egy témát, vagy jelzi, hogy őt is
//! érdekli; a tanár ugyanitt látja, hány diákra számíthat, és egy gombbal
//! szakkört indít belőle. A jelzés szavazat, nem vállalás — ezért csak a
//! SZÁMA látszik, a neve senkinek (lásd a séma ClubIdea fejlécét).

export type IdeaCard = {
  id: string;
  title: string;
  note: string | null;
  voteCount: number;
  club: { slug: string; name: string } | null;
  done: boolean;
  mine: boolean;
  voted: boolean;
  canWithdraw: boolean;
};

//* A gombok közös alakja ebben a szakaszban.
const CHIP =
  "press inline-flex h-8 items-center gap-1 rounded-full px-3 text-xs font-medium touch-target focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";
const ICON_BUTTON =
  "press inline-flex size-8 items-center justify-center rounded-full text-muted-strong touch-target hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-60";

export function IdeaBoard({
  ideas,
  loggedIn,
  moderator,
}: {
  ideas: IdeaCard[];
  loggedIn: boolean;
  //* Tanár vagy admin: elindíthat és levehet.
  moderator: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(
    null,
  );
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  //! A JELZÉS AZONNAL LÁTSZIK. A szív a koppintásra vált, a szám lép — a
  //! szerver válasza és a lap frissítése ezt csak megerősíti. Ha a szerver
  //! nemet mond, a `useOptimistic` magától visszaáll a valódi állapotra.
  const [shown, applyVote] = useOptimistic(
    ideas,
    (list, vote: { id: string; on: boolean }) =>
      list.map((idea) =>
        idea.id === vote.id
          ? {
              ...idea,
              voted: vote.on,
              voteCount: Math.max(0, idea.voteCount + (vote.on ? 1 : -1)),
            }
          : idea,
      ),
  );

  const run = (
    action: () => Promise<
      { ok: true; merged?: boolean } | { ok: false; error: string }
    >,
    success?: (merged: boolean) => string,
    optimistic?: () => void,
  ) =>
    startTransition(async () => {
      optimistic?.();
      const result = await action();
      if (!result.ok) {
        setMessage({ ok: false, text: result.error });
        return;
      }
      setMessage(
        success ? { ok: true, text: success(result.merged === true) } : null,
      );
      router.refresh();
    });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    run(
      () => postIdea({ title, note: note || null }),
      (merged) =>
        merged
          ? "Ez a téma már fent volt — a jelzésedet hozzáadtuk."
          : "Felírtuk. Ha másokat is érdekel, a tanárok látni fogják.",
    );
    setTitle("");
    setNote("");
    setFormOpen(false);
  };

  return (
    <section
      aria-labelledby="ideas-heading"
      className="mt-16 border-t border-border pt-10"
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h2
          id="ideas-heading"
          className="text-base font-semibold text-foreground"
        >
          Mire lenne igény?
          {shown.length > 0 && (
            <span className="ml-2 text-sm font-normal tabular-nums text-muted-foreground">
              {shown.length}
            </span>
          )}
        </h2>
        {loggedIn && !formOpen && (
          <button
            type="button"
            onClick={() => setFormOpen(true)}
            className={cn(
              CHIP,
              "h-9 border border-border px-4 text-sm text-foreground hover:bg-muted",
            )}
          >
            <Plus className="size-4" aria-hidden />
            Témát írok fel
          </button>
        )}
      </div>

      {formOpen && (
        <form
          onSubmit={submit}
          onKeyDown={(e) => e.key === "Escape" && setFormOpen(false)}
          className="club-enter mb-4 flex max-w-xl flex-col gap-3 rounded-xl border border-border bg-card p-4"
        >
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Téma
            <input
              required
              // biome-ignore lint/a11y/noAutofocus: a gombra nyíló űrlap első mezője — a fókusz pont ide kell.
              autoFocus
              value={title}
              maxLength={IDEA_TITLE_MAX}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="pl. Drónépítés, Unity játékfejlesztés"
              className="h-10 rounded-lg border border-input bg-background px-3 text-sm font-normal outline-none transition-[border-color,box-shadow] duration-150 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            <span>
              Megjegyzés{" "}
              <span className="font-normal text-muted-strong">
                (nem kötelező)
              </span>
            </span>
            <textarea
              value={note}
              maxLength={IDEA_NOTE_MAX}
              rows={2}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Mit csinálnátok rajta? Kezdőknek vagy haladóknak?"
              className="rounded-lg border border-input bg-background px-3 py-2 text-sm font-normal outline-none transition-[border-color,box-shadow] duration-150 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            />
          </label>
          <div className="flex flex-wrap items-center justify-between gap-2">
            {/*//! A NÉVTELENSÉG ÍGÉRETE ITT ÁLL, ahol a diák dönt: a jelzés
                //! száma látszik, a neve senkinek. */}
            <p className="text-xs text-muted-strong">
              Hogy ki jelezte, azt senki nem látja.
            </p>
            <div className="ml-auto flex gap-2">
              <button
                type="button"
                onClick={() => setFormOpen(false)}
                className={cn(
                  CHIP,
                  "h-9 px-4 text-sm text-muted-strong hover:bg-muted hover:text-foreground",
                )}
              >
                Mégse
              </button>
              <button
                type="submit"
                disabled={pending || title.trim().length < 3}
                className={cn(
                  CHIP,
                  "h-9 bg-primary px-4 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50",
                )}
              >
                Felírom
              </button>
            </div>
          </div>
        </form>
      )}

      {message && (
        <p
          key={message.text}
          role={message.ok ? "status" : "alert"}
          className={cn(
            "club-enter mb-4 text-sm",
            message.ok ? "text-foreground" : "text-destructive",
          )}
        >
          {message.text}
        </p>
      )}

      {shown.length === 0 ? (
        <EmptyPanel>
          Még nincs felírt téma.
          {!loggedIn && " Belépés után te lehetsz az első."}
        </EmptyPanel>
      ) : (
        <ul className={listGroup}>
          {shown.map((idea, index) => (
            <li
              key={idea.id}
              className="club-rise flex flex-wrap items-center gap-x-4 gap-y-2.5 px-4 py-3.5"
              style={{ "--i": index } as React.CSSProperties}
            >
              <div className="min-w-0 flex-1 basis-56">
                <p className="text-pretty text-[15px] font-semibold leading-snug text-foreground">
                  {idea.title}
                </p>
                {idea.note && (
                  <p className="mt-1 max-w-prose text-pretty text-xs leading-relaxed text-muted-strong">
                    {idea.note}
                  </p>
                )}
                <p className="mt-1 text-xs tabular-nums text-muted-strong">
                  {interestLabel(idea.voteCount)}
                </p>
              </div>

              <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                {idea.done ? (
                  idea.club ? (
                    <Link
                      href={`/szakkorok/${idea.club.slug}`}
                      prefetch={false}
                      className={cn(
                        CHIP,
                        "group bg-primary/10 text-primary hover:bg-primary/15",
                      )}
                    >
                      <Check className="size-3.5" aria-hidden />
                      Lett belőle szakkör
                      <ArrowUpRight
                        className="club-nudge size-3.5"
                        aria-hidden
                      />
                    </Link>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-1 text-xs text-muted-strong">
                      <Check className="size-3.5" aria-hidden />
                      Lett belőle szakkör
                    </span>
                  )
                ) : (
                  <>
                    {loggedIn && (
                      <button
                        type="button"
                        aria-pressed={idea.voted}
                        aria-busy={pending || undefined}
                        onClick={() => {
                          if (pending) return;
                          const on = !idea.voted;
                          run(
                            () => setIdeaVote(idea.id, on),
                            undefined,
                            () => applyVote({ id: idea.id, on }),
                          );
                        }}
                        className={cn(
                          CHIP,
                          "border",
                          idea.voted
                            ? "border-primary/40 bg-primary/10 text-primary"
                            : "border-border text-muted-strong hover:border-foreground/30 hover:text-foreground",
                        )}
                      >
                        {/*//* A kulcs váltáskor újraindítja a pattanást. */}
                        <span
                          key={String(idea.voted)}
                          className="club-pop inline-flex"
                          aria-hidden
                        >
                          {idea.voted ? (
                            <Check className="size-3.5" />
                          ) : (
                            <Heart className="size-3.5" />
                          )}
                        </span>
                        {idea.voted ? "Jelezted" : "Érdekel"}
                      </button>
                    )}
                    {moderator && (
                      <>
                        <Link
                          href={`/szakkorok/uj?otlet=${idea.id}`}
                          prefetch={false}
                          className={cn(
                            CHIP,
                            "bg-primary text-primary-foreground hover:bg-primary/90",
                          )}
                        >
                          <Plus className="size-3.5" aria-hidden />
                          Elindítom
                        </Link>
                        <button
                          type="button"
                          disabled={pending}
                          title="Levétel a lapról"
                          aria-label={`${idea.title} levétele a lapról`}
                          onClick={() => {
                            if (
                              window.confirm(
                                `Leveszed a lapról: „${idea.title}”? A diákok nem látják többé, és ugyanez a téma nem írható fel újra.`,
                              )
                            ) {
                              run(() => hideIdea(idea.id));
                            }
                          }}
                          className={ICON_BUTTON}
                        >
                          <EyeOff className="size-3.5" aria-hidden />
                        </button>
                      </>
                    )}
                    {idea.canWithdraw && (
                      <button
                        type="button"
                        disabled={pending}
                        title="Visszavonom"
                        aria-label={`${idea.title} visszavonása`}
                        onClick={() => run(() => withdrawIdea(idea.id))}
                        className={ICON_BUTTON}
                      >
                        <Undo2 className="size-3.5" aria-hidden />
                      </button>
                    )}
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {!loggedIn && (
        <Link
          href="/belepes?tovabb=%2Fszakkorok"
          className="group mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          <LogIn className="size-4" aria-hidden />
          Lépj be, hogy témát írhass fel vagy jelezhesd az érdeklődésed
        </Link>
      )}
    </section>
  );
}
