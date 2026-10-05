"use client";

import { useEffect } from "react";
import { CrestField, PAGE_CHROME } from "@/components/chrome/page-field";
import { SITE_BAR_MAX, StandingLine } from "@/components/chrome/standing-line";
import { SiteFooter } from "@/components/site-footer";
import { markClubsPreview } from "@/lib/club-events";
import { cn } from "@/lib/utils";

//* ---------------------------------------------------------------------------
//* A SZAKKÖR-LAPOK BUROKJA
//* ---------------------------------------------------------------------------
//! UGYANAZ A FEJLÉC, MINT A TÖBBI NEM-RÁCS LAPON (`/ma`, `/teremkereso`,
//! `/ugyelet`): fénymező, ragadó sor, alul a lábléc. A szakkör nem külön
//! alkalmazás az órarend mellett, hanem egy újabb hely ugyanabban a lapban.
//!
//! AZ ELŐNÉZET JELÖLŐJE ITT ÁLL. Aki a bevezetés előtt ide eljut, az a szerver
//! szerint tanár vagy admin (különben 404-et kapott volna) — nála a rács is
//! kérje le a szakköröket (lásd `lib/club-events.ts`). Látható szalagot nem
//! teszünk ki: a lap ugyanúgy néz ki, mint a bevezetés után.
export function ClubFrame({
  subject,
  context,
  preview,
  children,
}: {
  subject: string;
  context?: string;
  preview: boolean;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (preview) markClubsPreview();
  }, [preview]);

  return (
    <main className="relative flex min-h-[100dvh] flex-col bg-background tt-safe">
      <CrestField />
      <div className={PAGE_CHROME}>
        <div className={cn("mx-auto w-full", SITE_BAR_MAX)}>
          <StandingLine line={{ subject, context }} />
        </div>
      </div>
      <div className="relative z-10 mx-auto w-full max-w-5xl grow px-4 pt-6 pb-12 sm:px-6">
        {children}
      </div>
      <SiteFooter />
    </main>
  );
}
