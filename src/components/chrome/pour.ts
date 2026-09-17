import { animate, frame, motionValue } from "motion/react";
import type { PlaceId } from "@/components/chrome/places";

//! ═══════════════════════════════════════════════════════════════════════════
//! A KIÖNTÉS — A SOR FOLYADÉKA VISZ ÁT A VÁLTÓBA
//! ═══════════════════════════════════════════════════════════════════════════
//! A buborékban a mutatott sor alatt ugyanaz a fehér folyadék áll, mint a váltó
//! aktív cellájában. Eddig a koppintás ezt a kapcsolatot eldobta: a buborék
//! elapadt, a lap váltott, és a váltóban a folyadék a SEMMIBŐL jelent meg a
//! helyek cellájában. Itt a sor folyadéka maga indul el: vékony sugárrá
//! szűkül, felfut a nyakon, a cellában csepppé gyűlik — és az új lap váltója
//! ebből a cseppből terül szét aktív cellává. Egy anyag, egy út.
//*
//! NEM A VÁLTÓ FÁJÁBAN ÉL. A koppintás lapot vált, a régi váltó (a buborékkal
//! együtt) leszerelődik, mielőtt a sugár célba érne. Ezért a sugár egy
//! `body`-ra tett, React-en kívüli réteg: túléli a leszerelést, és egy
//! modulszintű jegyzeten át adja át magát az új példánynak (ugyanúgy, mint az
//! ikon repülése, lásd `places.ts`).
//*
//! A SUGÁR ÖT CSEPP EGY GOO-SZŰRŐBEN. Mindegyik ugyanonnan ugyanoda fut, de
//! egyre lazább rugón: az első vezet, az utolsó késik, a szűrő pedig a köztük
//! nyíló rést egyetlen elvékonyodó nyelvvé olvasztja. Egy nyújtott doboz
//! merev rúd lenne; a lépcsőzött rugók adják a folyást.
//! ═══════════════════════════════════════════════════════════════════════════

type Box = { x: number; y: number; w: number; h: number };

export type Pour = {
  id: PlaceId;
  /** A cél csepp középpontja a képernyőn. */
  cx: number;
  cy: number;
  /** A csepp mérete — ebből terül szét az új váltó folyadéka. */
  bead: { w: number; h: number };
  /** Akkor teljesül, amikor a sugár a cellában csepppé gyűlt. */
  arrived: Promise<void>;
  /** Az új váltó átvette a cseppet: a réteg eltűnik. */
  absorb: () => void;
  at: number;
};

let pour: Pour | null = null;
//* A cseppet ennyi ideig tartja a cellában, ha az új lap késik. Utána elpárolog.
const POUR_TTL = 1600;

//* A csepp a cella közepén: a váltó folyadékával azonos magasság, keskenyen.
const BEAD_W = 14;
//* A sor ekkorára gyűlik össze a nyak alatt, mielőtt felfutna.
const POOL = 18;
//* A sugár cseppjei: a vezető vastagabb, a záró vékonyabb — a nyelv elvékonyodik.
const STREAM = 5;
const STREAM_HEAD = 15;
const STREAM_TAIL = 8;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const easeOut = (t: number) => 1 - (1 - clamp01(t)) ** 3;
const spring = (stiffness: number, zeta: number, delay = 0) =>
  ({
    type: "spring",
    stiffness,
    damping: 2 * Math.sqrt(stiffness) * zeta,
    delay,
  }) as const;

//! ─── A MOZGÁS KÉT ÜTEMBEN ─────────────────────────────────────────────────
//! ELŐBB A SOR LEFOLYIK A NYAK ALÁ. A kiemelés két éle a gomb függőlegese
//! felé húzódik — a távolabbi él messzebbről, tehát láthatóan „fut" —, és a
//! sor egy tócsává gyűlik.
//! AZTÁN A SUGÁR FELFUT. A tócsából lépcsőzött késéssel és egyre lazább rugón
//! indulnak a cseppek; a szűrő egy felfelé vékonyodó nyelvvé olvasztja őket.
//! A tócsa indul utoljára: ő a sugár vége, és ő gyűlik csepppé a cellában.
//*
//! AZ ELSŐ VÁLTOZAT A SOR DOBOZÁT EGYBEN RÖPÍTETTE, és a méretet a saját
//! haladásából számolta: 50 ms alatt pogácsa lett belőle, ami felugrott —
//! folyás helyett ugrás. A kettéválasztott ütem adja a kiöntést.
const GATHER = spring(300, 1);
const RISE = spring(190, 0.9, 0.12);
const streamSpring = (t: number) =>
  spring(lerp(300, 190, t), 0.85, lerp(0.04, 0.12, t));

function ensureFilter(): string {
  const id = "orarend-pour-goo";
  if (document.getElementById(id)) return id;
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("width", "0");
  svg.setAttribute("height", "0");
  svg.style.position = "absolute";
  svg.innerHTML = `<defs><filter id="${id}" x="-50%" y="-50%" width="200%" height="200%" color-interpolation-filters="sRGB"><feGaussianBlur in="SourceGraphic" stdDeviation="5" result="blur"/><feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 22 -9" result="goo"/><feComposite in="SourceGraphic" in2="goo" operator="atop"/></filter></defs>`;
  document.body.appendChild(svg);
  return id;
}

export function launchPour({
  id,
  row,
  icon,
  cell,
}: {
  id: PlaceId;
  /** A sor, amelyből a folyadék indul (a kiemelés doboza). */
  row: HTMLElement;
  /** A sor ikonja — a sugár hegyén utazik. */
  icon: HTMLElement | null;
  /** A váltó helyek-cellája, ahová a sugár fut. */
  cell: HTMLElement;
}) {
  if (typeof window === "undefined") return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  //* Egy korábbi, még élő sugár helyét az új veszi át.
  pour?.absorb();

  const rr = row.getBoundingClientRect();
  const cr = cell.getBoundingClientRect();
  //* A kiemelés `inset-x-1.5` és `rounded-xl` — a sugár pontosan abból indul.
  const start: Box = {
    x: rr.left + 6,
    y: rr.top,
    w: rr.width - 12,
    h: rr.height,
  };
  const cx = cr.left + cr.width / 2;
  const cy = cr.top + cr.height / 2;
  const bead = { w: BEAD_W, h: cr.height };

  const filterId = ensureFilter();
  const layer = document.createElement("div");
  layer.setAttribute("aria-hidden", "true");
  Object.assign(layer.style, {
    position: "fixed",
    inset: "0",
    pointerEvents: "none",
    zIndex: "60",
    filter: `url(#${filterId}) drop-shadow(0 2px 4px oklch(0 0 0 / 0.3))`,
    willChange: "transform",
    transform: "translateZ(0)",
  } satisfies Partial<CSSStyleDeclaration>);
  //* Az ikon a szűrőn KÍVÜL, fölötte: az elmosás a vonalait szétfolyatná.
  const top = document.createElement("div");
  top.setAttribute("aria-hidden", "true");
  Object.assign(top.style, {
    position: "fixed",
    inset: "0",
    pointerEvents: "none",
    zIndex: "61",
  } satisfies Partial<CSSStyleDeclaration>);

  const runs: { stop: () => void }[] = [];
  let resolveArrived: () => void = () => {};
  const arrived = new Promise<void>((r) => {
    resolveArrived = r;
  });
  let done = false;

  const blob = () => {
    const el = document.createElement("div");
    Object.assign(el.style, {
      position: "absolute",
      top: "0",
      left: "0",
      background: "var(--foreground)",
      willChange: "transform, width, height",
    } satisfies Partial<CSSStyleDeclaration>);
    layer.appendChild(el);
    return el;
  };
  const paint = (
    el: HTMLElement,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number,
  ) => {
    el.style.width = `${w}px`;
    el.style.height = `${h}px`;
    el.style.borderRadius = `${r}px`;
    el.style.transform = `translate3d(${x - w / 2}px, ${y - h / 2}px, 0)`;
  };

  const sy = start.y + start.h / 2;
  const travel = Math.abs(cy - sy) || 1;
  //* Az út utolsó ötödében minden csepp a cella cseppjének méretére gyűlik.
  const arrive = (y: number, w: number, h: number) => {
    const g = easeOut((1 - Math.abs(cy - y) / travel - 0.78) / 0.22);
    return { w: lerp(w, bead.w, g), h: lerp(h, bead.h, g) };
  };

  const poolEl = blob();
  const poolL = motionValue(start.x);
  const poolR = motionValue(start.x + start.w);
  const poolY = motionValue(sy);
  const streams = Array.from({ length: STREAM }, (_, i) => ({
    t: i / (STREAM - 1),
    el: blob(),
    y: motionValue(sy),
  }));

  let iconEl: HTMLElement | null = null;
  let iconFrom = { x: 0, y: 0, w: 0, h: 0 };
  if (icon) {
    const ir = icon.getBoundingClientRect();
    iconFrom = {
      x: ir.left + ir.width / 2,
      y: ir.top + ir.height / 2,
      w: ir.width,
      h: ir.height,
    };
    iconEl = icon.cloneNode(true) as HTMLElement;
    iconEl.removeAttribute("class");
    Object.assign(iconEl.style, {
      position: "absolute",
      top: "0",
      left: "0",
      display: "flex",
      width: `${ir.width}px`,
      height: `${ir.height}px`,
      color: "var(--background)",
      willChange: "transform",
    } satisfies Partial<CSSStyleDeclaration>);
    top.appendChild(iconEl);
  }

  const draw = () => {
    const l = poolL.get();
    const r = poolR.get();
    const py = poolY.get();
    const gathered = clamp01(1 - (r - l - POOL) / (start.w - POOL || 1));
    const pool = arrive(
      py,
      r - l,
      lerp(start.h, POOL * 1.25, easeOut(gathered)),
    );
    const pr = Math.min(pool.w, pool.h) / 2;
    paint(
      poolEl,
      (l + r) / 2,
      py,
      pool.w,
      pool.h,
      Math.min(pr, lerp(12, pr, gathered)),
    );

    for (const s of streams) {
      const w = lerp(STREAM_HEAD, STREAM_TAIL, s.t);
      const d = arrive(s.y.get(), w, w * 1.7);
      paint(s.el, cx, s.y.get(), d.w, d.h, Math.min(d.w, d.h) / 2);
    }

    //* Az ikon a sorban balra állt: a tócsával együtt a nyak alá húzódik,
    //* aztán a vezető csepp hegyén fut fel.
    if (iconEl) {
      const lead = streams[0].y.get();
      const k = easeOut(gathered * 1.4);
      const x = lerp(iconFrom.x, cx, k);
      const y = lerp(iconFrom.y, lead, easeOut((sy - lead) / (travel * 0.3)));
      iconEl.style.transform = `translate3d(${x - iconFrom.w / 2}px, ${y - iconFrom.h / 2}px, 0)`;
    }
  };
  let queued = false;
  const schedule = () => {
    if (queued) return;
    queued = true;
    frame.render(() => {
      queued = false;
      draw();
    });
  };
  draw();
  for (const mv of [poolL, poolR, poolY, ...streams.map((s) => s.y)])
    mv.on("change", schedule);

  runs.push(
    animate(poolL, cx - POOL / 2, GATHER),
    animate(poolR, cx + POOL / 2, GATHER),
    animate(poolY, cy, RISE),
    ...streams.map((s) => animate(s.y, cy, streamSpring(s.t))),
  );
  //* A tócsa érkezése a cél: addigra a sugár egésze a cellában gyűlt össze.
  const unsub = poolY.on("change", (v) => {
    if (Math.abs(v - cy) < 2) {
      unsub();
      resolveArrived();
    }
  });

  document.body.append(layer, top);

  const teardown = () => {
    if (done) return;
    done = true;
    resolveArrived();
    for (const run of runs) run.stop();
    //* Rövid áttűnés: az új váltó folyadéka ugyanott, ugyanakkorán áll.
    const fade = [layer, top].map((el) =>
      el.animate([{ opacity: 1 }, { opacity: 0 }], {
        duration: 140,
        easing: "cubic-bezier(0.2, 0, 0, 1)",
        fill: "forwards",
      }),
    );
    const remove = () => {
      layer.remove();
      top.remove();
    };
    Promise.all(fade.map((a) => a.finished))
      .catch(() => {})
      .finally(remove);
    //! A HÁTTÉRBE TETT LAPON AZ ÁTTŰNÉS NEM FUT LE, és a réteg ott maradna a
    //! kép fölött. Az időzítő akkor is eltakarít, ha az animáció sosem ér véget.
    window.setTimeout(remove, 400);
    if (pour === record) pour = null;
  };

  const record: Pour = {
    id,
    cx,
    cy,
    bead,
    arrived,
    absorb: teardown,
    at: performance.now(),
  };
  pour = record;

  //* Ha az új lap nem vette át időben (nincs rajta váltó, vagy lassú), a
  //* csepp magától elpárolog, nem marad ott örökre.
  window.setTimeout(teardown, POUR_TTL);
}

/** Az új váltó ezzel veszi át a saját helyére futó sugarat. */
export function readPour(id: PlaceId | undefined): Pour | null {
  if (typeof window === "undefined" || !pour || pour.id !== id) return null;
  return performance.now() - pour.at < POUR_TTL ? pour : null;
}
