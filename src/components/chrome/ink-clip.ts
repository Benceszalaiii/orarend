//! ═══════════════════════════════════════════════════════════════════════════
//! A FELIRAT TINTÁJÁNAK VÁGÁSA — HOL TAKARJA FOLYADÉK A SZÓT
//! ═══════════════════════════════════════════════════════════════════════════
//! A váltó felirata két rétegben ül (lásd `InkLabel` a `pill-nav.tsx`-ben):
//! alul a tokra szánt szín, fölötte a folyadékra szánt. Ez a modul mondja meg,
//! melyik réteg hol látszik.
//*
//! NEM CSAK A FŐ TEST TAKAR. Lapváltáskor a régi cellában egy csepp marad, ami
//! a goo-szűrőn át leszakad. Amíg a vágás csak a fő test két élét ismerte, a
//! régi felirat a csepp alatt a TOK színével írt — fehér betű a fehér
//! cseppen: a „Hét"-ből „ét", aztán „t" lett, mintha a betűk leestek volna.
//! A takarás ezért SÁVOK listája: a fő test és a még elég magas csepp.
//! ═══════════════════════════════════════════════════════════════════════════

export type Span = readonly [number, number];

export const HIDDEN = "inset(0 100% 0 0)";
export const SHOWN = "none";

//* Függőlegesen ennyivel nyúlik túl a vágás, hogy az ékezetet és az alsó
//* szárat ne csípje le.
const OVER = 6;

/**
 * A sávokat a felirat saját `[0, w]` tartományára szorítja, a félpixelnél
 * keskenyebbeket eldobja, az egymást érőket összevonja — rendezett,
 * diszjunkt sávok jönnek ki.
 */
export function coverSpans(w: number, spans: readonly Span[]): Span[] {
  const clamped = spans
    .map(([a, b]) => [Math.min(w, Math.max(0, a)), Math.min(w, Math.max(0, b))])
    .filter(([a, b]) => b - a >= 0.5)
    .sort((x, y) => x[0] - y[0]);
  const out: [number, number][] = [];
  for (const [a, b] of clamped) {
    const last = out.at(-1);
    if (last && a <= last[1] + 0.5) last[1] = Math.max(last[1], b);
    else out.push([a, b]);
  }
  return out;
}

const f = (v: number) => Number(v.toFixed(2));
const rect = (a: number, b: number, h: number) =>
  `M ${f(a)} ${-OVER} H ${f(b)} V ${f(h + OVER)} H ${f(a)} Z`;

/**
 * A két réteg `clip-path`-ja egy `w × h` méretű feliraton. `ink` a folyadék
 * színű réteg (csak a takart sávokban látszik), `base` a tok színű (ugyanott
 * KI van vágva, hogy a világos betű széle ne derengjen át a sötét mögül).
 */
export function inkClips(
  w: number,
  h: number,
  spans: readonly Span[],
): { ink: string; base: string } {
  const cover = coverSpans(w, spans);
  if (cover.length === 0) return { ink: HIDDEN, base: SHOWN };
  if (cover.length === 1) {
    const [cl, cr] = cover[0];
    return {
      ink: `inset(-${OVER}px ${w - cr}px -${OVER}px ${cl}px)`,
      base:
        cl <= 0 && cr >= w
          ? HIDDEN
          : `polygon(evenodd, -${OVER}px -${OVER}px, ${w + OVER}px -${OVER}px, ${w + OVER}px calc(100% + ${OVER}px), -${OVER}px calc(100% + ${OVER}px), -${OVER}px -${OVER}px, ${cl}px -${OVER}px, ${cl}px calc(100% + ${OVER}px), ${cr}px calc(100% + ${OVER}px), ${cr}px -${OVER}px, ${cl}px -${OVER}px)`,
    };
  }
  //* Több sáv: egy `path()` több alútvonallal. A sávok diszjunktak, így az
  //* `evenodd` a tintánál uniót, az alapnál lyukakat ad.
  const holes = cover.map(([a, b]) => rect(a, b, h)).join(" ");
  return {
    ink: `path(evenodd, "${holes}")`,
    base: `path(evenodd, "${rect(-OVER, w + OVER, h)} ${holes}")`,
  };
}
