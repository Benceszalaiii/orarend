"use client";

import { ArrowLeft, RotateCw } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import { listGroup } from "@/components/ma/week-panels";
import { Button } from "@/components/ui/button";
import { clubsLaunched } from "@/lib/club-access";
import { cn } from "@/lib/utils";
import { ClubFrame } from "./club-frame";

//* ---------------------------------------------------------------------------
//* A SZAKKÖR- ÉS VERSENYLAPOK KÉT KÖZBENSŐ ÁLLAPOTA
//* ---------------------------------------------------------------------------
//! EZEK A LAPOK AZ ADATBÁZISBÓL ÉLNEK, NEM A JEDLIKINFÓBÓL. Az órarend hibáit a
//! lap megnevezi (offline, iskolai szerver, időtúllépés…) — itt a hiba szinte
//! mindig a MIENK: az adatbázis nem válaszolt. Ezt mondjuk ki, és azt is, hogy
//! az órarend ettől még működik. A Next alapértelmezett hibalapja ehelyett egy
//! angol, gomb nélküli „Application error" volna.
//*
//! A `retry` ÚJRAKÉRI A SZERVERTŐL A SZAKASZT, nem csak újrarajzolja a hibás
//! fát (az a `reset` volna). Adatbázis-hibánál pont ez kell: a következő
//! próbálkozás már egy új lekérdezés.
export function ClubError({
  subject,
  error,
  retry,
}: {
  subject: "Szakkörök" | "Versenyek";
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error("[orarend] A szakkör/verseny lap nem töltött be", error);
  }, [error]);

  const back = subject === "Szakkörök" ? "/szakkorok" : "/versenyek";

  return (
    <ClubFrame subject={subject} preview={false}>
      <div role="alert" className="max-w-xl">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          Ez a lap most nem töltött be.
        </h1>
        <p className="mt-3 text-pretty text-sm leading-relaxed text-muted-strong">
          A szakkörök és a versenyek a saját adatbázisunkból jönnek, és az most
          nem válaszolt. A hiba nálunk van, nem nálad — általában pár másodperc
          alatt elmúlik. Az órarend ettől függetlenül működik.
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-2">
          <Button onClick={() => retry()}>
            <RotateCw data-icon="inline-start" aria-hidden />
            Újrapróbálom
          </Button>
          <Button asChild variant="outline">
            <Link href="/orarend">
              <ArrowLeft data-icon="inline-start" aria-hidden />
              Vissza az órarendhez
            </Link>
          </Button>
          <Link
            href={back}
            className="px-2 text-sm text-muted-strong underline-offset-4 hover:text-foreground hover:underline"
          >
            {subject} kezdőlapja
          </Link>
        </div>
        {/*//* A jel a szerver naplójában ugyanígy szerepel — ha valaki
            //* jelzi a hibát, ebből találjuk meg. Más nem kerül ki. */}
        {error.digest && (
          <p className="mt-6 font-mono text-xs text-muted-strong">
            Hibajel: {error.digest}
          </p>
        )}
      </div>
    </ClubFrame>
  );
}

//! A BETÖLTÉS A LAP FORMÁJÁT MUTATJA, NEM EGY PÖRGETTYŰT. A lapok
//! `force-dynamic`-ok, tehát minden megnyitás egy adatbázis-kör: a fejléc és a
//! keret azonnal áll, a lista helyén halvány sávok — a kattintás után a lap
//! nem fagy be egy fél másodpercre.
//*
//! A BEVEZETÉS ELŐTT NINCS VÁZ. A diák ilyenkor 404-et kap (`canBrowseClubs`);
//! egy előtte felvillanó „Szakkörök" keret elárulná, hogy a lap létezik.
//! (Az állapotkód a `loading.tsx` miatt így is 200 marad, `noindex`-szel — a
//! Next a már folyó válasz fejlécét nem írhatja át. A robotnak ez elég, és a
//! sitemap a bevezetés előtt amúgy sem küldi ide.)
const BAR = "animate-pulse bg-muted motion-reduce:animate-none";

export function ClubLoading({
  subject,
}: {
  subject: "Szakkörök" | "Versenyek";
}) {
  if (!clubsLaunched()) return null;
  return (
    <ClubFrame subject={subject} preview={false}>
      <div aria-busy="true" aria-live="polite">
        <span className="sr-only">{subject} betöltése…</span>
        <div className="flex items-center justify-between gap-4">
          <div className={cn(BAR, "h-8 w-40 rounded-md sm:h-9")} />
          <div className={cn(BAR, "h-9 w-36 rounded-full")} />
        </div>
        {/*//* Az eszközsor és a lista alakja — a sorok magassága egyezik a
            //* valódiéval, így a betöltés után semmi nem ugrik. */}
        <div className="mt-6 flex flex-wrap gap-3">
          <div className={cn(BAR, "h-10 w-full rounded-full sm:w-60")} />
          <div className={cn(BAR, "hidden h-10 w-64 rounded-full sm:block")} />
        </div>
        <div className="mt-3 flex gap-1.5">
          {[14, 18, 24, 20].map((w) => (
            <div
              key={w}
              className={cn(BAR, "h-8 rounded-full")}
              style={{ width: `${w * 4}px` }}
            />
          ))}
        </div>
        <div className={cn(BAR, "mt-10 mb-3 h-5 w-44 rounded")} />
        <ul className={listGroup}>
          {[0, 1, 2, 3, 4].map((i) => (
            <li key={i} className="flex flex-col gap-2 px-4 py-3.5">
              <div className={cn(BAR, "h-4 w-3/5 rounded")} />
              <div className={cn(BAR, "h-3 w-2/5 rounded opacity-70")} />
            </li>
          ))}
        </ul>
      </div>
    </ClubFrame>
  );
}
