import { ArrowLeft, CalendarDays } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { CollapsingWeek } from "@/components/not-found/collapsing-week";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "404 – Ez az óra nincs az órarendben",
  robots: { index: false, follow: false },
};

//* ---------------------------------------------------------------------------
//* 404 — a cím, ami nincs az órarendben
//* ---------------------------------------------------------------------------
//! A HIBAÜZENET SZÖVEG, A JELENET KÉP — ÉS EZ A SORREND. A rács alatta
//! `aria-hidden`; ami itt fönt áll, az mondja meg, MI történt és HOVA lehet
//! innen menni. Enélkül a lap egy szép animáció lenne, ami nem felel a
//! kérdésre.
//*
//! KÉT KIJÁRAT, MERT KÉT KÉRDÉS VAN. Aki a hetet kereste, az órarendre megy;
//! aki azt, hogy „hova kell most mennem", a mai napra. Ugyanaz a két nézet,
//! amiből az egész alkalmazás áll.
export default function NotFound() {
  return (
    <main className="tt-safe flex min-h-0 flex-1 flex-col">
      <div className="mx-auto w-full max-w-3xl px-5 pt-12 pb-4 sm:pt-16 sm:pb-6">
        <h1 className="font-display text-3xl font-semibold tracking-[-0.02em] text-balance text-foreground sm:text-4xl">
          Ez az óra nincs az órarendben.
        </h1>
        <p className="mt-3 max-w-[62ch] text-sm leading-relaxed text-muted-strong sm:text-base">
          A megnyitott cím egyetlen naphoz és egyetlen osztályhoz sem tartozik —
          vagy elírás, vagy egy régi hivatkozás hozott ide. Maga az órarend a
          helyén van, csak nem ezen a címen.
        </p>
        <div className="mt-7 flex flex-wrap items-center gap-2">
          <Button asChild size="lg">
            <Link href="/orarend">
              <ArrowLeft data-icon="inline-start" aria-hidden />
              Vissza az órarendhez
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link href="/ma">
              <CalendarDays data-icon="inline-start" aria-hidden />
              Mai nap
            </Link>
          </Button>
        </div>
      </div>

      <CollapsingWeek />
    </main>
  );
}
