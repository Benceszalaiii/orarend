"use client";

import {
  ArrowUpRight,
  Check,
  EyeOff,
  Heart,
  Lightbulb,
  Plus,
  Undo2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
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

  const run = (
    action: () => Promise<
      { ok: true; merged?: boolean } | { ok: false; error: string }
    >,
    success?: (merged: boolean) => string,
  ) =>
    startTransition(async () => {
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
    <section aria-labelledby="ideas-heading" className="mt-14">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="max-w-2xl">
          <h2
            id="ideas-heading"
            className="flex items-center gap-2 text-lg font-bold tracking-tight"
          >
            <Lightbulb className="size-5 text-primary" aria-hidden />
            Mire lenne igény?
          </h2>
          <p className="mt-1 text-pretty text-sm text-muted-strong">
            {moderator
              ? "A diákok témái, aszerint, hány diákot érdekel. Ha elindítod valamelyiket, az ötlet a szakkörödre mutat."
              : "Hiányzik egy szakkör? Írd fel a témát, vagy jelezd, ha téged is érdekel. A tanárok ebből látják, mire lenne jelentkező. Hogy ki jelezte, azt senki nem látja."}
          </p>
        </div>
        {loggedIn && !formOpen && (
          <button
            type="button"
            onClick={() => setFormOpen(true)}
            className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <Plus className="size-4" aria-hidden />
            Témát írok fel
          </button>
        )}
      </div>

      {formOpen && (
        <form
          onSubmit={submit}
          className="mt-4 flex max-w-xl flex-col gap-3 rounded-xl border border-border bg-card p-4"
        >
          <label className="flex flex-col gap-1 text-sm font-medium">
            Téma
            <input
              required
              value={title}
              maxLength={IDEA_TITLE_MAX}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="pl. Drónépítés, Unity játékfejlesztés"
              className="h-10 rounded-lg border border-input bg-background px-3 text-sm font-normal outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
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
              className="rounded-lg border border-input bg-background px-3 py-2 text-sm font-normal outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            />
          </label>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setFormOpen(false)}
              className="h-9 rounded-full px-4 text-sm text-muted-strong hover:text-foreground"
            >
              Mégse
            </button>
            <button
              type="submit"
              disabled={pending || title.trim().length < 3}
              className="h-9 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              Felírom
            </button>
          </div>
        </form>
      )}

      {message && (
        <p
          aria-live="polite"
          className={cn(
            "mt-4 text-sm",
            message.ok ? "text-foreground" : "text-destructive",
          )}
        >
          {message.text}
        </p>
      )}

      {ideas.length === 0 ? (
        <p className="mt-6 text-sm text-muted-strong">
          Még nincs felírt téma.
          {!loggedIn && " Belépés után te lehetsz az első."}
        </p>
      ) : (
        <ul className="mt-6 grid gap-2 sm:grid-cols-2">
          {ideas.map((idea) => (
            <li
              key={idea.id}
              className={cn(
                "flex flex-wrap items-start gap-x-3 gap-y-2 rounded-xl border border-border bg-card px-4 py-3",
                idea.done && "border-dashed",
              )}
            >
              <div className="min-w-0 flex-1 basis-44">
                <p className="text-pretty font-medium leading-snug text-foreground">
                  {idea.title}
                </p>
                {idea.note && (
                  <p className="mt-0.5 text-pretty text-xs text-muted-strong">
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
                      className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary hover:bg-primary/15"
                    >
                      <Check className="size-3.5" aria-hidden />
                      Lett belőle szakkör
                      <ArrowUpRight className="size-3.5" aria-hidden />
                    </Link>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-1 text-xs text-muted-strong">
                      <Check className="size-3.5" aria-hidden />
                      Lett belőle szakkör
                    </span>
                  )
                ) : (
                  <>
                    {loggedIn ? (
                      <button
                        type="button"
                        aria-pressed={idea.voted}
                        disabled={pending}
                        onClick={() =>
                          run(() => setIdeaVote(idea.id, !idea.voted))
                        }
                        className={cn(
                          "inline-flex h-8 items-center gap-1 rounded-full border px-3 text-xs font-medium transition-colors touch-target disabled:opacity-60",
                          idea.voted
                            ? "border-primary/40 bg-primary/10 text-primary"
                            : "border-border text-muted-strong hover:text-foreground",
                        )}
                      >
                        {idea.voted ? (
                          <Check className="size-3.5" aria-hidden />
                        ) : (
                          <Heart className="size-3.5" aria-hidden />
                        )}
                        {idea.voted ? "Jelezted" : "Érdekel"}
                      </button>
                    ) : null}
                    {moderator && (
                      <>
                        <Link
                          href={`/szakkorok/uj?otlet=${idea.id}`}
                          prefetch={false}
                          className="inline-flex h-8 items-center gap-1 rounded-full bg-primary px-3 text-xs font-medium text-primary-foreground hover:opacity-90"
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
                          className="inline-flex size-8 items-center justify-center rounded-full text-muted-strong hover:bg-muted hover:text-foreground disabled:opacity-60"
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
                        className="inline-flex size-8 items-center justify-center rounded-full text-muted-strong hover:bg-muted hover:text-foreground disabled:opacity-60"
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
          className="mt-4 inline-block text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          Lépj be, hogy témát írhass fel vagy jelezhesd az érdeklődésed
        </Link>
      )}
    </section>
  );
}
