import type { CSSProperties } from "react";
import { CREST, MARK } from "@/lib/brand-mark";
import { cn } from "@/lib/utils";

//! ─── A JEL ÉS A NÉV ─────────────────────────────────────────────────────────
//! A geometria a `lib/brand-mark.ts`-ben él; ez csak kirajzolja.
//*
//! A BETŰK SZÍNE A TÉMÁÉ, A PONTÉ NEM. Világos felületen a betűk a címer
//! kékjét viselik, sötéten a lap előszínét (`--logo-ink`); a pont mindkettőn
//! ugyanaz a címerpiros. A `tone="color"` annak a helynek való, ahol a
//! háttér témától függetlenül világos (a nyitólap meleg papírja): ott a
//! sötét téma fehér betűje eltűnne.

type Tone = "auto" | "color";

export function JiMark({
  className,
  style,
  title,
  tone = "auto",
}: {
  className?: string;
  style?: CSSProperties;
  /** Ha üres, a jel díszítés (a mellette álló név már kimondja). */
  title?: string;
  tone?: Tone;
}) {
  const ink = tone === "color" ? CREST.blue : "var(--logo-ink)";
  return (
    <svg
      viewBox={`0 0 ${MARK.width} ${MARK.height}`}
      className={className}
      style={style}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      <path d={MARK.letters} fill={ink} />
      <circle {...MARK.jDot} fill={ink} />
      <circle {...MARK.iDot} fill={CREST.red} />
    </svg>
  );
}

//* A jel lelógó horga miatt a doboz alja nem az alapvonal: a negatív alsó
//* margó pontosan a horog mélységével húzza le, így a szárak alja a szöveg
//* alapvonalán áll (`items-baseline` az SVG alsó margóélét igazítja).
const HANG = (MARK.height - MARK.baseline) / MARK.height;

export function BrandLockup({
  className,
  tone = "auto",
}: {
  className?: string;
  tone?: Tone;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-baseline gap-[0.4em] font-semibold tracking-[-0.02em]",
        className,
      )}
    >
      <JiMark
        tone={tone}
        className="h-[1.3em] w-auto shrink-0"
        style={{ marginBottom: `-${(1.3 * HANG).toFixed(3)}em` }}
      />
      Jedlik Info
    </span>
  );
}
