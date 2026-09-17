//! ═══════════════════════════════════════════════════════════════════════════
//! AZ ÁRADÁS — A FOLYADÉK MAGA A BETÖLTŐKÉPERNYŐ
//! ═══════════════════════════════════════════════════════════════════════════
//! A „Hét"/„Ma" koppintásakor a váltó fehér folyadéka nem csak átfolyik a
//! másik cellába: előbb a cél felé nyúlik, aztán kiárad, és ELÖNTI a lapot.
//! Amíg a lap víz alatt van, az útvonal vált; a folyadék aztán az ÚJ lap
//! váltójának aktív cellájába apad vissza — pontosan oda, ahol a folyadék áll.
//*
//! A VÁLTÓ AZ ÁRADÁSBAN IS LÁTSZIK, FORDÍTOTT SZÍNNEL. Az áradás rétege egy
//! kivágást hagy a váltó alakján, a váltó pedig közben megfordítja a két
//! tokenjét (`html[data-pn-flood]`, lásd `globals.css`): a tok a folyadék
//! színét veszi fel, a folyadék a tokét. A tok így egybeolvad az áradással,
//! és csak a sötét csepp meg a felirat marad belőle — a váltó a betöltés alatt
//! is megmondja, hová tartasz. Mivel mindkét szín a váltó SAJÁT tokenje, ez a
//! világos és a sötét témában, meg a `.nav-glass` zárt színvilágában is áll.
//*
//! NEM A VÁLTÓ FÁJÁBAN ÉL. A koppintás lapot vált, a régi váltó leszerelődik;
//! a réteg `body`-ra kerül, és a friss váltó a `registerPillNav`-val jelzi,
//! hogy felállt — ettől apad le az áradás (ugyanaz a minta, mint `pour.ts`).
//*
//! AZ ALAK EGY KAPSZULA, NEM KÖR. A váltó folyadéka lekerekített sáv; az
//! áradás ebből indul, és ebbe tér vissza. Közben a pereme hullámzik
//! (`clip-path: path()`, képkockánként újraszámolva) — szűrő nélkül, tehát a
//! teljes képernyős réteg sem mos el semmit.
//! ═══════════════════════════════════════════════════════════════════════════

import { loadFlood } from "@/lib/flood-pref";

type Capsule = { cx: number; cy: number; s: number; R: number };

const EXPAND = 440;
const HOLE_OPEN = 260;
const RECEDE = 620;
//* Ennyi ideig legalább látszik a betöltőképernyő — különben csak villan.
const MIN_HOLD = 180;
//* Ha az új lap nem áll fel (nincs rajta váltó), az áradás ennyi után magától
//* lefut. A réteg sosem blokkolhatja örökre a lapot.
const MAX_HOLD = 4000;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const easeOut = (t: number) => 1 - (1 - clamp01(t)) ** 3;
const easeInOut = (t: number) => {
  const x = clamp01(t);
  return x < 0.5 ? 4 * x ** 3 : 1 - (-2 * x + 2) ** 3 / 2;
};

const capsuleOf = (r: DOMRect): Capsule => ({
  cx: r.left + r.width / 2,
  cy: r.top + r.height / 2,
  s: Math.max(0, r.width / 2 - r.height / 2),
  R: r.height / 2,
});

//! A KIVÁGÁS EGY HAJSZÁLLAL KISEBB A VÁLTÓNÁL. Két élsimított perem egymáson
//! — a vízé és a toké — a kettő között átengedi a sötét lapot: egy szürke
//! gyűrű ülne a váltó körül. A víz így a tok peremére fut rá; a színük egy.
const SEAM = 1.5;
const shrink = (c: Capsule, d = SEAM): Capsule => ({
  ...c,
  R: Math.max(0, c.R - d),
});

const mixCapsule = (a: Capsule, b: Capsule, t: number): Capsule => ({
  cx: lerp(a.cx, b.cx, t),
  cy: lerp(a.cy, b.cy, t),
  s: lerp(a.s, b.s, t),
  R: lerp(a.R, b.R, t),
});

//! A HULLÁMZÓ PEREM. A kapszula a szakasz és a kör Minkowski-összege: a θ
//! normálisú pont `(±s + R·cosθ, R·sinθ)`. A sugarat három, egymáshoz képest
//! elcsúszó szinusz billegteti; a pontokat a felezőpontjaikon át másodfokú
//! ívek kötik össze, így nincs sarok a peremen.
function wavyPath(c: Capsule, wobble: number, time: number, n = 72): string {
  const pts: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const th = (i / n) * Math.PI * 2;
    const cos = Math.cos(th);
    const sin = Math.sin(th);
    const w =
      1 +
      wobble *
        (0.55 * Math.sin(3 * th + time * 5.1) +
          0.3 * Math.sin(5 * th - time * 7.3) +
          0.15 * Math.sin(8 * th + time * 3.7));
    const side = cos > 1e-6 ? 1 : cos < -1e-6 ? -1 : 0;
    pts.push([c.cx + side * c.s + c.R * w * cos, c.cy + c.R * w * sin]);
  }
  const mid = (a: [number, number], b: [number, number]) =>
    `${((a[0] + b[0]) / 2).toFixed(1)} ${((a[1] + b[1]) / 2).toFixed(1)}`;
  let d = `M ${mid(pts[n - 1], pts[0])}`;
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    d += ` Q ${p[0].toFixed(1)} ${p[1].toFixed(1)} ${mid(p, pts[(i + 1) % n])}`;
  }
  return `${d} Z`;
}

//* A kivágás pontos kapszula, ívekkel — ennek nem kell hullámoznia.
function capsulePath({ cx, cy, s, R }: Capsule): string {
  if (R < 0.5) return "";
  const f = (v: number) => v.toFixed(1);
  return ` M ${f(cx - s)} ${f(cy - R)} H ${f(cx + s)} A ${f(R)} ${f(R)} 0 0 1 ${f(cx + s)} ${f(cy + R)} H ${f(cx - s)} A ${f(R)} ${f(R)} 0 0 1 ${f(cx - s)} ${f(cy - R)} Z`;
}

//! ─── A VÁLTÓK NYILVÁNTARTÁSA ──────────────────────────────────────────────
//! Lapváltáskor rövid ideig KÉT váltó él: az új már renderelt, a régi még nem
//! szerelt le. Az áradás mindig a legutóbb felálltat követi.
const navs: { el: HTMLElement; at: number }[] = [];

export function registerPillNav(el: HTMLElement): () => void {
  const entry = { el, at: performance.now() };
  navs.push(entry);
  return () => {
    const i = navs.indexOf(entry);
    if (i >= 0) navs.splice(i, 1);
  };
}

const latestNav = () => {
  for (let i = navs.length - 1; i >= 0; i--)
    if (navs[i].el.isConnected) return navs[i];
  return null;
};

const activeCell = (nav: HTMLElement) =>
  nav.querySelector<HTMLElement>("[data-pn-cell][data-active]");

type Flood = {
  retarget: (label: string, navigate: () => void) => void;
  phase: () => "expand" | "hold" | "recede";
  kill: () => void;
};
let flood: Flood | null = null;

export function floodSupported(): boolean {
  if (typeof window === "undefined") return false;
  //* Kérésre fut, nem alapból (lásd `lib/flood-pref.ts`).
  if (!loadFlood()) return false;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches)
    return false;
  return CSS.supports("clip-path", 'path(evenodd, "M0 0 H1 V1 Z")');
}

/**
 * A váltó egy cellájáról indított áradás. `navigate` akkor fut, amikor a lap
 * már víz alatt van. `false`, ha az áradás nem indult (ki van kapcsolva, vagy
 * a böngésző nem tudja) — ilyenkor a hívó a szokásos módon navigáljon.
 */
export function launchFlood({
  nav,
  cell,
  origin,
  label,
  navigate,
}: {
  nav: HTMLElement;
  /** A cella, amelyre koppintottak — az áradás ennek a közepéről fut ki. */
  cell: HTMLElement;
  /**
   * A folyadék, amelyből az áradás indul, ha nem a váltó cellája — a helyek
   * buborékjában a kiemelt sor. Ilyenkor nincs nyúlás a cél felé: a víz
   * helyben duzzad ki a sorból, és a helyek cellájába apad vissza.
   */
  origin?: HTMLElement | null;
  label: string;
  navigate: () => void;
}): boolean {
  if (!floodSupported()) return false;

  //! MÁR ÁLL A VÍZ? Akkor nem apad le és árad ki újra — csak más lapra vált.
  if (flood && flood.phase() !== "recede") {
    flood.retarget(label, navigate);
    return true;
  }
  flood?.kill();

  const doc = document.documentElement;
  const css = getComputedStyle(nav);
  //* A váltó SAJÁT tokenjei: a `.nav-glass` a nyitólapon felülírja őket.
  const water = css.getPropertyValue("--foreground").trim() || "white";
  //* A betöltőképernyő felirata a tok színével ír — ugyanaz a csere, mint a
  //* váltón: a folyadék a tok színét kapja.
  const ink = css.backgroundColor || "black";

  const from = (origin ?? activeCell(nav))?.getBoundingClientRect();
  const to = (origin ?? cell).getBoundingClientRect();
  const start: Capsule = from
    ? capsuleOf(from)
    : { ...capsuleOf(to), s: 0, R: 2 };
  //* Az első ütem végén a folyadék a saját cellájától a célig ér.
  const toCap = capsuleOf(to);
  const spanL = Math.min(start.cx - start.s, toCap.cx - toCap.s);
  const spanR = Math.max(start.cx + start.s, toCap.cx + toCap.s);
  const span: Capsule = {
    cx: (spanL + spanR) / 2,
    cy: toCap.cy,
    s: (spanR - spanL) / 2,
    R: toCap.R,
  };

  const layer = document.createElement("div");
  layer.setAttribute("aria-hidden", "true");
  Object.assign(layer.style, {
    position: "fixed",
    inset: "0",
    zIndex: "80",
    background: water,
    //! A RÉTEG ELNYELI A KOPPINTÁST, A KIVÁGÁS NEM. A `clip-path` a
    //! találatvizsgálatot is vágja: a váltó a lyukon át kezelhető marad, a
    //! víz alatti lap viszont nem kap véletlen koppintást.
    pointerEvents: "auto",
    touchAction: "none",
    clipPath: `path("${wavyPath(start, 0, 0)}")`,
    willChange: "clip-path",
  } satisfies Partial<CSSStyleDeclaration>);

  const word = document.createElement("div");
  Object.assign(word.style, {
    position: "absolute",
    left: "50%",
    top: "50%",
    transform: "translate(-50%, -50%)",
    color: ink,
    font: "600 clamp(3.5rem, 15vw, 6rem)/1 var(--font-display, var(--font-sans))",
    letterSpacing: "-0.04em",
    opacity: "0",
    whiteSpace: "nowrap",
  } satisfies Partial<CSSStyleDeclaration>);
  word.textContent = label;
  layer.appendChild(word);
  document.body.appendChild(layer);

  let phase: "expand" | "hold" | "recede" = "expand";
  const t0 = performance.now();
  let holdAt = 0;
  let recedeAt = 0;
  let navigated = 0;
  let pending: (() => void) | null = navigate;
  let raf = 0;
  let inverted = false;
  let done = false;

  const cover = (cx: number, cy: number) =>
    Math.hypot(Math.max(cx, innerWidth - cx), Math.max(cy, innerHeight - cy)) +
    48;

  const invert = (on: boolean) => {
    if (on === inverted) return;
    inverted = on;
    if (on) doc.dataset.pnFlood = "";
    else delete doc.dataset.pnFlood;
  };

  const go = () => {
    const fn = pending;
    pending = null;
    if (!fn) return;
    navigated = performance.now();
    fn();
  };

  const kill = () => {
    if (done) return;
    done = true;
    cancelAnimationFrame(raf);
    invert(false);
    layer.remove();
    removeEventListener("pagehide", kill);
    if (flood === record) flood = null;
  };

  const tick = (now: number) => {
    const time = (now - t0) / 1000;
    let outer: Capsule;
    let wobble = 0;
    let hole: Capsule | null = null;

    if (phase === "expand") {
      const u = clamp01((now - t0) / EXPAND);
      //! KÉT ÜTEM. Az első harmadban a folyadék a cél felé NYÚLIK (ugyanaz
      //! a mozdulat, amit a váltó magától is tenne), aztán a célcellából
      //! kiárad — lassan duzzad, majd egyre gyorsabban önti el a lapot.
      //* A víz a váltó folyadékából ÁTTŰNIK elő: a cella feliratai nem
      //* tűnnek el egy tömör kapszula alatt, amíg az még a váltón fekszik.
      layer.style.opacity = String(easeOut(u / 0.3));
      if (u < 0.32) {
        outer = mixCapsule(start, span, easeOut(u / 0.32));
        wobble = 0.04 * Math.sin((u / 0.32) * Math.PI);
      } else {
        const v = (u - 0.32) / 0.68;
        const k = v ** 2.2;
        const cx = lerp(span.cx, toCap.cx, easeOut(v * 1.6));
        outer = {
          cx,
          cy: toCap.cy,
          s: lerp(span.s, 0, easeOut(v * 1.4)),
          R: lerp(span.R, cover(cx, toCap.cy), k),
        };
        wobble = 0.07 * Math.sin(v * Math.PI);
      }
      if (u >= 1) {
        phase = "hold";
        holdAt = now;
        invert(true);
        go();
      }
    } else if (phase === "hold") {
      outer = {
        cx: toCap.cx,
        cy: toCap.cy,
        s: 0,
        R: cover(toCap.cx, toCap.cy),
      };
      const entry = latestNav();
      if (entry) {
        const navCap = shrink(capsuleOf(entry.el.getBoundingClientRect()));
        const cellEl = activeCell(entry.el);
        const seed = cellEl
          ? { ...capsuleOf(cellEl.getBoundingClientRect()), s: 0, R: 0 }
          : { ...navCap, s: 0, R: 0 };
        hole = mixCapsule(seed, navCap, easeOut((now - holdAt) / HOLE_OPEN));
      }
      const since = now - holdAt;
      word.style.opacity = String(easeOut(since / 220));
      word.style.transform = `translate(-50%, calc(-50% + ${(1 - easeOut(since / 320)) * 10}px))`;

      const mounted = entry && navigated > 0 && entry.at >= navigated;
      if (
        (mounted && since > Math.max(MIN_HOLD, HOLE_OPEN)) ||
        since > MAX_HOLD
      ) {
        phase = "recede";
        recedeAt = now;
      }
    } else {
      const u = clamp01((now - recedeAt) / RECEDE);
      const entry = latestNav();
      const cellEl = entry ? activeCell(entry.el) : null;
      const navRect = entry?.el.getBoundingClientRect();
      const target = cellEl
        ? capsuleOf(cellEl.getBoundingClientRect())
        : navRect
          ? capsuleOf(navRect)
          : { cx: innerWidth / 2, cy: innerHeight / 2, s: 0, R: 0 };
      const big: Capsule = {
        cx: target.cx,
        cy: target.cy,
        s: 0,
        R: cover(target.cx, target.cy),
      };

      //! ELŐBB A KIVÁGÁS ZÁRUL, AZTÁN APAD A VÍZ. A sötét csepp és a felirat
      //! a folyadék közepébe húzódik; a váltó csak ezután, már víz alatt
      //! fordul vissza — a színcsere sosem látszik.
      const close = clamp01(u / 0.24);
      if (navRect && close < 1) {
        const seed = { ...target, s: 0, R: 0 };
        hole = mixCapsule(shrink(capsuleOf(navRect)), seed, easeInOut(close));
      } else invert(false);

      outer = mixCapsule(big, target, easeInOut(u));
      wobble = 0.06 * Math.sin(u * Math.PI);
      word.style.opacity = String(1 - easeOut(u / 0.22));
      word.style.transform = `translate(-50%, calc(-50% - ${easeOut(u / 0.3) * 8}px)) scale(${1 - 0.06 * easeOut(u / 0.3)})`;

      //* Az utolsó szakaszban a víz a váltó saját folyadékába tűnik át — az
      //* ugyanott, ugyanakkorán áll, a feliratok pedig előbukkannak.
      layer.style.opacity = String(1 - easeInOut((u - 0.72) / 0.28));
      if (u >= 1) {
        kill();
        return;
      }
    }

    const rule = hole ? "evenodd, " : "";
    layer.style.clipPath = `path(${rule}"${wavyPath(outer, wobble, time)}${hole ? capsulePath(hole) : ""}")`;
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  addEventListener("pagehide", kill);
  //! A KOPPINTÁS SOSEM VÉSZ EL. Háttérbe tett lapon a képkockák nem futnak, és
  //! a navigáció a képkockákhoz van kötve — az időzítő akkor is elindítja.
  setTimeout(go, EXPAND + 120);
  //! VÉGSŐ BIZTOSÍTÉK: egy elakadt képkockaciklus se hagyja letakarva a lapot.
  setTimeout(kill, EXPAND + MAX_HOLD + RECEDE + 1000);

  const record: Flood = {
    retarget: (next, fn) => {
      word.textContent = next;
      pending = fn;
      if (phase === "hold") {
        //* Új cél víz alatt: az apadás az ÚJ lap váltójára vár.
        holdAt = performance.now() - HOLE_OPEN;
        go();
      }
    },
    phase: () => phase,
    kill,
  };
  flood = record;
  return true;
}
