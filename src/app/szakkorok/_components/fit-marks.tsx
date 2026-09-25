"use client";

import { Briefcase, CalendarCheck, CalendarX, CircleHelp } from "lucide-react";
import { useEffect, useState } from "react";
import type { ClubFitVerdict, SlotFit } from "@/lib/club-fit";
import type { ClubSlotSource } from "@/lib/clubs";
import { loadCachedClass } from "@/lib/timetable";
import { cn } from "@/lib/utils";

//* ---------------------------------------------------------------------------
//* A SZAKKÖR-LAPOK KÖZÖS JELEI
//* ---------------------------------------------------------------------------
//! KÉT KÉRDÉS, KÉT JEL. „Honnan tudjuk az időpontot?" (a forrás) és „belefér-e
//! a hetedbe?" (az ítélet). A lista és a szakkör lapja ugyanazokkal a jelekkel
//! és ugyanazokkal a szavakkal mondja — ha a kettő eltérne, a diák nem tudná,
//! melyiknek higgyen.

//! A FORRÁS JELE ALAKKAL BESZÉL, NEM SZÍNNEL. Teli négyzet: az iskola
//! órarendjében szerepel. Szaggatott: csak a vezető tanár mondta. Üres kör:
//! még nincs időpont. A szín ezen a lapon a szakköré (a pötty) és az ítéleté.
export const SOURCE_LABEL: Record<ClubSlotSource | "none", string> = {
  TIMETABLE: "az iskola órarendjéből",
  ORGANIZER: "a tanár szerint",
  none: "egyeztetés alatt",
};

export function SourceMark({
  source,
  className,
}: {
  source: ClubSlotSource | "none";
  className?: string;
}) {
  return (
    <span
      title={SOURCE_LABEL[source]}
      aria-hidden
      className={cn(
        "inline-block size-2 shrink-0",
        source === "TIMETABLE" && "rounded-[2px] bg-foreground/75",
        source === "ORGANIZER" &&
          "rounded-[2px] border border-dashed border-foreground/70",
        source === "none" && "rounded-full border border-foreground/50",
        className,
      )}
    />
  );
}

//* Az ítélet szavai egy helyen — a lista sora és a szakkör lapja is ezt mondja.
export function slotVerdictText(fit: SlotFit): string {
  switch (fit.verdict) {
    case "fits":
      return "Belefér";
    case "unknown":
      return "Nem tudjuk";
    case "clash":
      return fit.dual
        ? `${fit.dual.join(" és ")} héten duálison vagy`
        : `Ütközik: ${fit.lesson.subject || fit.lesson.subjectShort}`;
  }
}

export function SlotVerdict({
  fit,
  className,
}: {
  fit: SlotFit;
  className?: string;
}) {
  const Icon =
    fit.verdict === "fits"
      ? CalendarCheck
      : fit.verdict === "unknown"
        ? CircleHelp
        : fit.dual
          ? Briefcase
          : CalendarX;
  return (
    <span
      className={cn(
        "inline-flex min-w-0 items-center gap-1 text-xs font-medium",
        fit.verdict === "fits" ? "text-primary" : "text-muted-strong",
        className,
      )}
    >
      <Icon className="size-3.5 shrink-0" aria-hidden />
      <span className="min-w-0 truncate">{slotVerdictText(fit)}</span>
    </span>
  );
}

//! AZ ÍTÉLET SZÍNE. A „belefér" az egyetlen színes: a `--primary` kék, ahogy a
//! rács is jelöli, ami szabad. Az ütközés NEM piros — nem hiba, csak nem neked
//! szól most —, a piros az élő és a cselekvő szerepeké marad.
export const VERDICT_ORDER: ClubFitVerdict[] = [
  "fits",
  "partly",
  "clash",
  "unknown",
];

export const VERDICT_TITLE: Record<ClubFitVerdict, string> = {
  fits: "Belefér",
  partly: "Részben",
  clash: "Ütközik",
  unknown: "Nem tudjuk",
};

export const VERDICT_FILL: Record<ClubFitVerdict, string> = {
  fits: "bg-primary",
  partly: "bg-primary/40",
  clash: "bg-foreground/22",
  unknown: "border border-dashed border-foreground/35 bg-transparent",
};

//! A DIÁK OSZTÁLYA. Először a készülék (amit az órarendben választott) — az a
//! frissebb szándék; ha az nincs, a fiók osztálya (iskolai belépésnél ismert).
//! Csak hidratálás után olvasható, ezért az első rajz `undefined`: „még nem
//! tudjuk", ami nem ugyanaz, mint a `null` („nincs osztály").
export function useStudentClass(
  accountClass: string | null,
): [string | null | undefined, (next: string) => void] {
  const [className, setClassName] = useState<string | null | undefined>(
    undefined,
  );
  useEffect(() => {
    setClassName(loadCachedClass() ?? accountClass);
  }, [accountClass]);
  return [className, setClassName];
}
