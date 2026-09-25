"use client";

import { Bell, BellOff, CalendarPlus, Check, Eye, EyeOff } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { loadFollowedClubs, setClubFollowed } from "@/lib/club-follow";
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
import { clubsOf, LEAD_MINUTES, prefsEmpty } from "@/lib/push-shared";
import { cn } from "@/lib/utils";
import { joinClub, leaveClub } from "../actions";

//* ---------------------------------------------------------------------------
//* RÉSZVÉTEL — HÁROM KÜLÖN DÖNTÉS
//* ---------------------------------------------------------------------------
//! NEM EGY GOMB, MERT NEM EGY DOLOG. A lap alapelve (PRODUCT.md, 4.): tudni
//! belépés nélkül is lehet, vállalni csak fiókkal.
//!
//!   Jelentkezem — FIÓKKAL. Nyilvános vállalás: a neved a tagok között áll.
//!   Követem     — FIÓK NÉLKÜL. A szakkör felkerül a rácsodra ezen a
//!                 készüléken (belépve a többin is, a beállítás-szinkronnal).
//!   Értesítés   — FIÓK NÉLKÜL. Ugyanaz a névtelen feliratkozás, mint az órák
//!                 harangja: tíz perccel előtte, és ha kiesik az órarendből.
//!
//! A jelentkezés és az értesítés magával hozza a követést: aki odajár, vagy
//! szólni kér, az a rácsán is látni akarja. Fordítva nem: a követés
//! leállítása nem léptet ki és nem némít el — azok külön döntések.

type Props = {
  slug: string;
  loggedIn: boolean;
  isMember: boolean;
  canJoin: boolean;
};

export function Participation({ slug, loggedIn, isMember, canJoin }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [followed, setFollowed] = useState<boolean | null>(null);
  const [support, setSupport] = useState<PushSupport | null>(null);
  const [subscribed, setSubscribed] = useState(false);
  const [notify, setNotify] = useState(false);
  //! `webcal://`, NEM LETÖLTÉS. Egy letöltött .ics egyszeri másolat: a szakkör
  //! időpontja változhat, a telefon naptára viszont soha nem tudná meg. A
  //! `webcal://` ugyanazt a címet FELIRATKOZÁSKÉNT nyitja meg (lásd a
  //! `calendar-feed-menu.tsx` azonos döntését). A gépnév csak a böngészőben
  //! ismert, ezért hidratálás után áll össze.
  const [feed, setFeed] = useState(`/api/szakkorok/${slug}/naptar.ics`);

  //* A készülék állapota csak hidratálás után olvasható.
  useEffect(() => {
    setFeed(
      `webcal://${window.location.host}/api/szakkorok/${slug}/naptar.ics`,
    );
    setFollowed((loadFollowedClubs() ?? []).includes(slug));
    const state = pushSupport();
    setSupport(state);
    if (state === "ready") {
      void currentSubscription().then((sub) => {
        setSubscribed(sub !== null);
        setNotify(sub !== null && clubsOf(loadPrefs()).includes(slug));
      });
    }
  }, [slug]);

  function follow(on: boolean) {
    setClubFollowed(slug, on);
    setFollowed(on);
  }

  function membership(join: boolean) {
    setError(null);
    startTransition(async () => {
      const result = await (join ? joinClub(slug) : leaveClub(slug));
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (join) follow(true);
      router.refresh();
    });
  }

  //! AZ ENGEDÉLYKÉRÉS AZ ELSŐ `await`. A Safari csak élő koppintásból engedi a
  //! böngésző kérdését (lásd `enablePush`) — ezért itt a kattintás és az
  //! `enablePush` között nincs semmi, amire várni kellene.
  async function toggleNotify() {
    setError(null);
    const prefs = loadPrefs();
    const clubs = clubsOf(prefs);
    const on = !notify;
    const next = {
      ...prefs,
      clubs: on
        ? [...new Set([...clubs, slug])]
        : clubs.filter((c) => c !== slug),
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
      setError(notifyError("reason" in result ? result.reason : "server"));
      return;
    }
    setNotify(on);
    setSubscribed(on || !prefsEmpty(next));
    if (on) follow(true);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {isMember ? (
          <Button
            variant="outline"
            disabled={pending}
            onClick={() => {
              if (
                window.confirm(
                  "Kilépsz a szakkörből? A neved lekerül a tagok közül.",
                )
              ) {
                membership(false);
              }
            }}
            className="rounded-full"
          >
            <Check aria-hidden />
            Tag vagy · Kilépek
          </Button>
        ) : canJoin ? (
          loggedIn ? (
            <Button
              disabled={pending}
              onClick={() => membership(true)}
              className="rounded-full"
            >
              Jelentkezem
            </Button>
          ) : (
            <Button asChild className="rounded-full">
              <Link
                href={`/belepes?tovabb=${encodeURIComponent(`/szakkorok/${slug}`)}`}
              >
                Belépek és jelentkezem
              </Link>
            </Button>
          )
        ) : null}

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
            {notify ? "Értesítés be" : "Értesítés"}
          </Button>
        )}

        <Button asChild variant="ghost" className="rounded-full">
          <a href={feed}>
            <CalendarPlus aria-hidden />
            Naptárba
          </a>
        </Button>
      </div>

      <p className="max-w-xl text-pretty text-xs text-muted-strong">
        {followed
          ? "Követed: a szakkör ott van az órarendedben ezen a készüléken"
          : "Követéssel a szakkör felkerül az órarendedre — belépés nélkül is"}
        {notify
          ? `, és szólunk ${LEAD_MINUTES} perccel előtte, meg ha kiesik az órarendből.`
          : "."}
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

function notifyError(reason: string): string {
  switch (reason) {
    case "denied":
      return "A böngésző nem engedélyezte az értesítéseket. A lap beállításai közt (a címsor melletti ikon) lehet visszavonni a tiltást.";
    case "no-worker":
      return "Az engedély megvan, de az Órarend háttérszolgáltatása nem indult el. Tölts újra a lapot, és próbáld újra.";
    case "misconfigured":
      return "Az értesítések ezen a kiszolgálón nincsenek beállítva. Ez nem a te böngésződön múlik.";
    case "unsupported":
      return "Ez a böngésző nem tudja fogadni az értesítéseket.";
    default:
      return "Az értesítés most nem kapcsolható be — próbáld újra később.";
  }
}
