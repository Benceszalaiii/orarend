import { animate, frame, motionValue } from "motion/react";
import type { PlaceId } from "@/components/chrome/places";

//! ═══════════════════════════════════════════════════════════════════════════
//! A KIÖNTÉS — A SOR FOLYADÉKA VISZ ÁT A VÁLTÓBA
//! ═══════════════════════════════════════════════════════════════════════════
//! A buborékban a mutatott sor alatt ugyanaz a fehér folyadék áll, mint a váltó
//! aktív cellájában. Eddig a koppintás ezt a kapcsolatot eldobta: a buborék
//! elapadt, a lap váltott, és a váltóban a folyadék a SEMMIBŐL jelent meg a
//! helyek cellájában. Itt a folyadék maga indul el: egy kör az ikon mögött,
//! ami az ikonnal együtt felszáll a cellába — és az új lap váltója ebből a
//! körből terül szét aktív cellává. Egy anyag, egy út.
//*
//! NEM A VÁLTÓ FÁJÁBAN ÉL. A koppintás lapot vált, a régi váltó (a buborékkal
//! együtt) leszerelődik, mielőtt a sugár célba érne. Ezért a sugár egy
//! `body`-ra tett, React-en kívüli réteg: túléli a leszerelést, és egy
//! modulszintű jegyzeten át adja át magát az új példánynak (ugyanúgy, mint az
//! ikon repülése, lásd `places.ts`).
//*
//! EGY KÖR ÉS A FARKA EGY GOO-SZŰRŐBEN. A kör az ikon mögött indul, és vele
//! együtt száll a cellába; mögötte néhány egyre kisebb csepp fut ugyanazon az
//! úton, egyre lazább rugón, és a szűrő a köztük nyíló rést egyetlen
//! elvékonyodó farokká olvasztja. A lépcsőzött rugók adják a folyást.
//! ═══════════════════════════════════════════════════════════════════════════

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
  /**
   * Az új váltó megmondja, hová érkezzen a csepp (az ikonja közepe). A sugár
   * képkockánként ezt követi — `null`-lal visszaáll az indításkori célra.
   */
  follow: (target: (() => { x: number; y: number } | null) | null) => void;
  at: number;
};

let pour: Pour | null = null;
//* A cseppet ennyi ideig tartja a cellában, ha az új lap késik. Utána elpárolog.
const POUR_TTL = 1600;

//* A farok cseppjei: a fejhez közeli nagyobb, a vége kisebb — a szűrő egy
//* elvékonyodó nyelvvé olvasztja őket a kör mögött.
const TAIL = 4;
const TAIL_BIG = 0.72;
const TAIL_SMALL = 0.36;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const spring = (stiffness: number, zeta: number, delay = 0) =>
  ({
    type: "spring",
    stiffness,
    damping: 2 * Math.sqrt(stiffness) * zeta,
    delay,
  }) as const;
type MotionSpring = ReturnType<typeof spring>;

//! ─── A KÖR ÍVBEN SZÁLL ────────────────────────────────────────────────────
//! A vízszintes rugó a merevebb: a kör előbb a gomb függőlegesébe húzódik,
//! aztán felfut — ívben, nem egyenes vonalon. A függőleges egy hajszálnyit
//! túllő, ahogy egy csepp beleérkezik a folyadékba.
//*
//! AZ ELSŐ VÁLTOZAT A SOR TÉGLALAPJÁT INDÍTOTTA ÚTNAK, ami tócsává gyűlt és
//! sugárként futott fel. A szem viszont az IKONT követi: egy sornyi szürke
//! doboz, ami összemegy, nem olvasható úgy, mint „ez a gomb száll oda". A kör
//! az ikon háttere, és vele együtt utazik.
const HEAD_X = spring(320, 1);
const HEAD_Y = spring(220, 0.82);
//* A farok ugyanazon az úton jön, egyre később és egyre lazábban.
const tailSpring = (t: number, stiffness: number, zeta: number) =>
  spring(lerp(stiffness, stiffness * 0.7, t), zeta, lerp(0.025, 0.1, t));

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
  /** A sor — ha az ikonja nem mérhető, a kör a sor bal szélén indul. */
  row: HTMLElement;
  /** A sor ikonja — a kör ez mögött indul, és a közepén utazik. */
  icon: HTMLElement | null;
  /** A váltó helyek-cellája, ahová a kör száll. */
  cell: HTMLElement;
}) {
  if (typeof window === "undefined") return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  //* Egy korábbi, még élő sugár helyét az új veszi át.
  pour?.absorb();

  const rr = row.getBoundingClientRect();
  const cr = cell.getBoundingClientRect();
  //* A kör a sor IKONJA mögött indul — oda nézett a szem a koppintáskor.
  const ir = icon?.getBoundingClientRect();
  const from =
    ir && ir.width > 0
      ? { x: ir.left + ir.width / 2, y: ir.top + ir.height / 2 }
      : { x: rr.left + rr.height / 2, y: rr.top + rr.height / 2 };
  //! A CÉL MOZOG. Indításkor csak a RÉGI váltó cellája ismert: összecsukva, a
  //! régi lap elrendezésében. Az új váltóban a cella szétnyílik, és az ikon
  //! odébb kerül — a régi helyre hulló csepp mellé esett, és az ikon onnan
  //! csúszott át a helyére. Ezért minden hely az út HALADÁSÁBÓL (0→1) és a
  //! pillanatnyi célból számolódik, a célt pedig az új váltó képkockánként
  //! megadja (`follow`): a rugók nem indulnak újra, csak a végpont vándorol.
  let cx = cr.left + cr.width / 2;
  let cy = cr.top + cr.height / 2;
  let target: (() => { x: number; y: number } | null) | null = null;
  //* A kör átmérője a cella magassága: érkezéskor pontosan akkora korong, mint
  //* a váltó folyadéka egy ikonnyi szélességen — innen terül szét.
  const size = cr.height;
  const bead = { w: size, h: size };

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
  let landed = false;

  const circle = (d: number) => {
    const el = document.createElement("div");
    Object.assign(el.style, {
      position: "absolute",
      top: "0",
      left: "0",
      width: `${d}px`,
      height: `${d}px`,
      borderRadius: "50%",
      background: "var(--foreground)",
      willChange: "transform",
    } satisfies Partial<CSSStyleDeclaration>);
    layer.appendChild(el);
    return el;
  };
  const place = (el: HTMLElement, x: number, y: number, d: number) => {
    el.style.transform = `translate3d(${x - d / 2}px, ${y - d / 2}px, 0)`;
  };

  //* Haladás, nem képpont: 0 a sor ikonjánál, 1 a (pillanatnyi) célban. A
  //* vízszintes és a függőleges külön rugón fut, így a kör ívben száll.
  const lane = (x: MotionSpring, y: MotionSpring, d: number) => ({
    d,
    el: circle(d),
    px: motionValue(0),
    py: motionValue(0),
    sx: x,
    sy: y,
  });
  const head = lane(HEAD_X, HEAD_Y, size);
  const tail = Array.from({ length: TAIL }, (_, i) => {
    const t = TAIL > 1 ? i / (TAIL - 1) : 0;
    return lane(
      tailSpring(t, HEAD_X.stiffness * 0.9, 1),
      tailSpring(t, HEAD_Y.stiffness * 0.85, 0.9),
      size * lerp(TAIL_BIG, TAIL_SMALL, t),
    );
  });
  //* A farok a fej MÖGÖTT rajzolódik: a fej takarja, amíg együtt állnak.
  for (const drop of [...tail].reverse()) layer.appendChild(drop.el);
  layer.appendChild(head.el);

  let iconEl: HTMLElement | null = null;
  let iconSize = { w: 0, h: 0 };
  if (icon && ir) {
    iconSize = { w: ir.width, h: ir.height };
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
    const next = target?.();
    if (next) {
      cx = next.x;
      cy = next.y;
    }
    let settled = true;
    for (const drop of [head, ...tail]) {
      const x = lerp(from.x, cx, drop.px.get());
      const y = lerp(from.y, cy, drop.py.get());
      place(drop.el, x, y, drop.d);
      if (Math.hypot(cx - x, cy - y) > 2) settled = false;
    }
    //* Az ikon a fej közepén utazik.
    if (iconEl) {
      const x = lerp(from.x, cx, head.px.get());
      const y = lerp(from.y, cy, head.py.get());
      iconEl.style.transform = `translate3d(${x - iconSize.w / 2}px, ${y - iconSize.h / 2}px, 0)`;
    }
    //* Az érkezés a farok vége: addigra az egész csepp a cellában gyűlt össze.
    if (settled && !landed) {
      landed = true;
      resolveArrived();
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
  for (const drop of [head, ...tail]) {
    drop.px.on("change", schedule);
    drop.py.on("change", schedule);
    runs.push(animate(drop.px, 1, drop.sx), animate(drop.py, 1, drop.sy));
  }

  document.body.append(layer, top);

  const teardown = () => {
    if (done) return;
    done = true;
    target = null;
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
    //* Mindig a pillanatnyi cél — az új váltó folyadéka innen terül szét.
    get cx() {
      return cx;
    },
    get cy() {
      return cy;
    },
    bead,
    arrived,
    absorb: teardown,
    follow: (next) => {
      if (done) return;
      target = next;
      schedule();
    },
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
