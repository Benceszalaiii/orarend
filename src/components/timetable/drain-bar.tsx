"use client";

import { useState } from "react";
import { accentStyle } from "@/lib/accent";
import { cn } from "@/lib/utils";
import type { NowSpan } from "./now";

//! A haladás-sávot NEM másodpercenként animáljuk újra: a CSS-animáció egyszer
//! indul el a szakasz elejéhez horgonyozva (negatív késleltetés), és magától jár
//! tovább — a `--tt-*` változók ezért a sáv SZÜLETÉSEKOR dőlnek el, és onnantól
//! állnak. A `--tt-elapsed` ugyanis a *futó* animáció kezdetéhez képest tol a
//! fázison: ha ütemenként újraírnánk, a saját múlása MELLÉ számolna, és a sáv
//! kétszeres sebességgel szaladna végig. Új szakasz = új elem (`key`), ott
//! számolunk újra.
//*
//* Az inline `transform` az animáció nélküli igazság: `prefers-reduced-motion`
//* mellett (`animation: none`) EGYEDÜL ez mozgatja a sávot, ezért a `fraction`
//* minden óraütésre frissül. Ahol az animáció fut, ott az írja felül (az
//* animáció kaszkád-rétege erősebb az inline stílusnál) — a kettő nem harcol.
export function DrainBar({
  span,
  fraction,
  accentSeed,
  className,
}: {
  span: NowSpan;
  fraction: number;
  accentSeed: string;
  className?: string;
}) {
  const [anchor] = useState<React.CSSProperties>(() => {
    const d = new Date();
    const nowSec = d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds();
    return {
      "--tt-dur": `${(span.toMin - span.fromMin) * 60}s`,
      "--tt-elapsed": `${-(nowSec - span.fromMin * 60)}s`,
    } as React.CSSProperties;
  });
  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-x-0 bottom-0 h-[2px] origin-left animate-tt-drain acc-dot",
        className,
      )}
      style={{
        ...accentStyle(accentSeed),
        ...anchor,
        transform: `scaleX(${fraction})`,
      }}
      aria-hidden
    />
  );
}
