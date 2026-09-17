"use client";

import { RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { TimetableError } from "@/lib/timetable";
import { cn } from "@/lib/utils";

//! A HIBA MEGMONDJA, KINÉL VAN. Ugyanaz a szótár, mint a heti nézetben — és
//! ugyanaz mindkét alanynak: egy időtúllépés nem lesz más attól, hogy tanár
//! vagy diák nézte meg. A `TimetableErrorKind` már megkülönbözteti az offline,
//! hálózati, időtúllépés, szerver, kérés, tartalom és ismeretlen-alany
//! eseteket; ez a doboz csak elmondja, amit az mond.
export function ErrorPanel({
  error,
  pending,
  onRetry,
}: {
  error: TimetableError;
  pending: boolean;
  onRetry: () => void;
}) {
  return (
    <section className="rounded-2xl border border-hero-foreground/15 bg-hero-foreground/[0.06] p-5 sm:p-6">
      <h3 className="text-xl font-bold tracking-tight">{error.title}</h3>
      <p className="mt-2 max-w-md text-sm text-hero-foreground/70">
        {error.message}
      </p>
      {error.hint && (
        <p className="mt-1 max-w-md text-sm text-hero-foreground/60">
          {error.hint}
        </p>
      )}
      {error.retryable && (
        <Button
          variant="outline"
          size="sm"
          onClick={onRetry}
          disabled={pending}
          className="mt-4 h-8 touch-target rounded-full border-hero-foreground/25 bg-transparent px-3 text-xs"
        >
          <RotateCw className={cn(pending && "animate-spin")} aria-hidden />
          Újra
        </Button>
      )}
      {error.detail && (
        <p className="mt-3 font-mono text-[11px] text-hero-foreground/45">
          {error.detail}
        </p>
      )}
    </section>
  );
}
