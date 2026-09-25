"use client";

import { Bell, BellOff, CalendarPlus, Check, Eye, EyeOff } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { loadFollowedContests, setContestFollowed } from "@/lib/club-follow";
import {
  currentSubscription,
  disablePush,
  enablePush,
  loadPrefs,
  type PushSupport,
  pushSupport,
  type SubscribeResult,
  updatePush,
} from "@/lib/push";
import { contestsOf, prefsEmpty } from "@/lib/push-shared";
import { cn } from "@/lib/utils";
import { enterCompetition, withdrawCompetition } from "../actions";

//* ---------------------------------------------------------------------------
//* NEVEZÉS, KÖVETÉS, ÉRTESÍTÉS — UGYANAZ A HÁRMAS, MINT A SZAKKÖRNÉL
//* ---------------------------------------------------------------------------
//! A NEVEZÉS FIÓKKAL MEGY, a követés és az értesítés fiók nélkül (lásd a
//! szakkör `participation.tsx`-ét). Ha nem lehet nevezni, a gomb helyén az
//! ok áll — nem egy szürke, néma gomb.

export type EntryState =
  | { kind: "entered"; canWithdraw: boolean }
  | { kind: "can-enter" }
  | { kind: "login" }
  | { kind: "blocked"; reason: string }
  | { kind: "none" };

export function ContestParticipation({
  slug,
  entry,
}: {
  slug: string;
  entry: EntryState;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [followed, setFollowed] = useState<boolean | null>(null);
  const [support, setSupport] = useState<PushSupport | null>(null);
  const [subscribed, setSubscribed] = useState(false);
  const [notify, setNotify] = useState(false);
  const [feed, setFeed] = useState(`/api/versenyek/${slug}/naptar.ics`);

  useEffect(() => {
    setFeed(
      `webcal://${window.location.host}/api/versenyek/${slug}/naptar.ics`,
    );
    setFollowed((loadFollowedContests() ?? []).includes(slug));
    const state = pushSupport();
    setSupport(state);
    if (state === "ready") {
      void currentSubscription().then((sub) => {
        setSubscribed(sub !== null);
        setNotify(sub !== null && contestsOf(loadPrefs()).includes(slug));
      });
    }
  }, [slug]);

  function follow(on: boolean) {
    setContestFollowed(slug, on);
    setFollowed(on);
  }

  function entryAction(enter: boolean) {
    setError(null);
    startTransition(async () => {
      const result = await (enter
        ? enterCompetition(slug)
        : withdrawCompetition(slug));
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (enter) follow(true);
      router.refresh();
    });
  }

  //! AZ ENGEDÉLYKÉRÉS AZ ELSŐ `await` — lásd a szakkör azonos függvényét.
  async function toggleNotify() {
    setError(null);
    const prefs = loadPrefs();
    const contests = contestsOf(prefs);
    const on = !notify;
    const next = {
      ...prefs,
      contests: on
        ? [...new Set([...contests, slug])]
        : contests.filter((c) => c !== slug),
    };
    let result: SubscribeResult;
    if (on && !subscribed) {
      result = await enablePush(next);
    } else if (!on && prefsEmpty(next)) {
      await disablePush();
      result = { ok: true };
    } else {
      result = await updatePush(next);
    }
    if (!result.ok) {
      setError(
        "reason" in result && result.reason === "denied"
          ? "A böngésző nem engedélyezte az értesítéseket. A lap beállításai közt (a címsor melletti ikon) lehet visszavonni a tiltást."
          : "Az értesítés most nem kapcsolható be — próbáld újra később.",
      );
      return;
    }
    setNotify(on);
    setSubscribed(on || !prefsEmpty(next));
    if (on) follow(true);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {entry.kind === "entered" &&
          (entry.canWithdraw ? (
            <Button
              variant="outline"
              disabled={pending}
              onClick={() => {
                if (
                  window.confirm(
                    "Visszalépsz? A neved lekerül a nevezők közül.",
                  )
                ) {
                  entryAction(false);
                }
              }}
              className="rounded-full"
            >
              <Check aria-hidden />
              Neveztél · Visszalépek
            </Button>
          ) : (
            <span className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border px-4 text-sm font-medium">
              <Check className="size-4" aria-hidden />
              Neveztél
            </span>
          ))}
        {entry.kind === "can-enter" && (
          <Button
            disabled={pending}
            onClick={() => entryAction(true)}
            className="rounded-full"
          >
            Nevezek
          </Button>
        )}
        {entry.kind === "login" && (
          <Button asChild className="rounded-full">
            <Link
              href={`/belepes?tovabb=${encodeURIComponent(`/versenyek/${slug}`)}`}
            >
              Belépek és nevezek
            </Link>
          </Button>
        )}

        {followed !== null && (
          <Button
            variant="outline"
            aria-pressed={followed}
            onClick={() => follow(!followed)}
            className={cn("rounded-full", followed && "border-foreground/40")}
          >
            {followed ? <Eye aria-hidden /> : <EyeOff aria-hidden />}
            {followed ? "Követed" : "Követem"}
          </Button>
        )}

        {support === "ready" && (
          <Button
            variant="outline"
            aria-pressed={notify}
            onClick={() => void toggleNotify()}
            className={cn("rounded-full", notify && "border-foreground/40")}
          >
            {notify ? <Bell aria-hidden /> : <BellOff aria-hidden />}
            {notify ? "Emlékeztető be" : "Emlékeztető"}
          </Button>
        )}

        <Button asChild variant="ghost" className="rounded-full">
          <a href={feed}>
            <CalendarPlus aria-hidden />
            Naptárba
          </a>
        </Button>
      </div>

      {entry.kind === "blocked" && (
        <p className="text-sm text-muted-strong">{entry.reason}</p>
      )}
      <p className="max-w-xl text-pretty text-xs text-muted-strong">
        {notify
          ? "Szólunk három nappal és egy nappal a nevezési határidő előtt, meg a verseny előtti napon — délután négykor."
          : "Az emlékeztető szól három nappal és egy nappal a határidő előtt, meg a verseny előtti napon."}
        {support === "needs-install" &&
          " Értesítést iPhone-on csak a kezdőképernyőre kitett Órarend kaphat."}
      </p>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
