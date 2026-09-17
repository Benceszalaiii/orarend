"use client";

import { Check } from "lucide-react";
import {
  animate,
  type MotionValue,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  type KeyboardEvent,
  type RefObject,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { sheetItem } from "@/components/chrome/chrome-sheet";
import { launchFlood } from "@/components/chrome/flood";
import { launchFlight, PLACES, type Place } from "@/components/chrome/places";
import { launchPour } from "@/components/chrome/pour";
import { cn } from "@/lib/utils";

//! ═══════════════════════════════════════════════════════════════════════════
//! A BUBORÉK, AMI A VÁLTÓBÓL CSÖPPEN KI
//! ═══════════════════════════════════════════════════════════════════════════
//! A váltó egy folyadékból él (lásd `pill-nav.tsx`): a nézetek között a csepp
//! nyúlik, leszakad, átfolyik. Egy szokványos, sarkából kinagyított buborék
//! ebben a világban idegen tárgy — ezért a „Helyek" buboréka NEM doboz, ami
//! megjelenik, hanem a tok anyaga, ami kicsordul: a gomb alján csepp duzzad, a
//! nyakon lefolyik, a buborék teste előbb lefelé nyúlik, aztán oldalra terül.
//! Becsukáskor ugyanez visszafelé, és a nyak visszaszívja a gombba.
//*
//! AZ ELSŐ VÁLTOZAT EZT CSAK ÍGÉRTE. Egy körrel kivágott kártya volt, alatta
//! egy goo-szűrős nyakkal — a nyak a gyakorlatban egy szögletes fül lett, a
//! buborék pedig ugyanaz a kártya, mint bárhol máshol. A folyadék attól
//! folyadék, hogy a TEST maga is az: ezért itt a buborék háttere, a nyak és a
//! sorok alatti kiemelés EGY goo-szűrős rétegben él, és egymásba olvadnak.
//*
//! A SZÖVEG NEM MEGY ÁT A SZŰRŐN. Az elmosás + küszöb a betűket szétfolyatná;
//! a sorok a szűrt réteg FÖLÖTT állnak, és a test aktuális alakjára vannak
//! vágva (`clip-path: inset(… round …)`), így sosem lógnak ki a cseppből.
//*
//! NEM PORTÁLOZOTT, ÉS NEM RADIX. A nyaknak a váltó koordinátáiban kell állnia,
//! a tok színével — egy portálba tett réteg ezt csak képkockánként újramérve
//! tudná követni. A buborék a váltó fáján belül áll, így a ragadós fejléccel
//! együtt mozog, és az álló sor „kívülre koppintás" szabálya (lásd
//! `standing-line.tsx`) sem csukja be.
//! ═══════════════════════════════════════════════════════════════════════════

//* A tok alja és a buborék teteje közötti rés — ebben fut a nyak.
const GAP = 12;
//* A csepp a tok belső párnájában ered, hogy az aktív folyadékot ne takarja.
const DROP_INSET = 4;
//* A szűrt réteg teteje a buborék tetejéhez képest.
const LAYER_TOP = GAP + DROP_INSET;
const RADIUS = 22;
//* A test kezdő szélessége — nagyjából a nyaké, amiből kifolyik.
const SEED_W = 20;

//! ─── RUGÓK ────────────────────────────────────────────────────────────────
//! A MAGASSÁG ÉS A SZÉLESSÉG KÜLÖN RUGÓN FUT. A magasság a merevebb: a csepp
//! előbb lefelé nyúlik, a szélesség lazább és túllő — a test oldalra terülve
//! egyet remeg, mielőtt megáll. Egy rugón a kettő egyszerre nőne, és a
//! buborék nem folyna, csak nagyítódna.
const FALL = { type: "spring", stiffness: 300, damping: 26, mass: 1 } as const;
const SPREAD = {
  type: "spring",
  stiffness: 190,
  damping: 17,
  mass: 1,
  delay: 0.04,
} as const;
const DRAIN = { type: "spring", stiffness: 520, damping: 46, mass: 1 } as const;
const DRIP = {
  type: "spring",
  stiffness: 420,
  damping: 30,
  mass: 0.8,
} as const;
//* A kiemelés ugyanazt a vezető/húzódó élpárt használja, mint a váltó
//* folyadéka — csak függőlegesen.
const LEAD = { type: "spring", stiffness: 560, damping: 48, mass: 1 } as const;
const TRAIL = { type: "spring", stiffness: 170, damping: 27, mass: 1 } as const;
const SWELL = { type: "spring", stiffness: 420, damping: 32, mass: 1 } as const;
//* Menet közbeni újracélzáshoz: nem nyúlik, csak átcsúszik.
const EVEN = { type: "spring", stiffness: 380, damping: 40, mass: 1 } as const;

//! A MUTATÓ SZÁNDÉKA, NEM MINDEN SOR, AMIN ÁTSUHAN. Egy gyors húzás öt sort
//! is érint; ha mindegyik célpont lenne, a folyadék minden képkockán irányt
//! váltana és cseppeket hagyna maga után. A rövid késleltetés alatt a gyors
//! átsuhanás egyetlen célba olvad, a megállás viszont észrevétlenül gyors.
const HOVER_DELAY = 45;
const LEAVE_DELAY = 90;
//* Ennyi eltérésen belül a folyadék „áll" egy soron.
const SETTLED = 1.5;

const SHADOW = "drop-shadow(0 18px 22px oklch(0 0 0 / 0.5))";
const INK_SHADOW = "drop-shadow(0 2px 4px oklch(0 0 0 / 0.3))";
//* Saját kompozitor-réteg: a szűrt réteg mindig egészében rajzolódik újra.
const LAYER = { willChange: "transform", transform: "translateZ(0)" } as const;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

type Geo = {
  /** A gomb középpontja a buborék bal szélétől. */
  ox: number;
  w: number;
  h: number;
};

type Span = { top: number; bottom: number };
type Remnant = Span & { id: number; dir: number };
let remnantSeq = 0;

export function PlacesPanel({
  open,
  onClose,
  navRef,
  triggerRef,
  floating,
  current,
  panelId,
}: {
  open: boolean;
  onClose: (opts?: { refocus?: boolean }) => void;
  navRef: RefObject<HTMLElement | null>;
  triggerRef: RefObject<HTMLButtonElement | null>;
  floating: boolean;
  current: Place | null;
  panelId: string;
}) {
  const reduced = useReducedMotion() ?? false;
  const [present, setPresent] = useState(open);
  const panelRef = useRef<HTMLDivElement>(null);
  const [geo, setGeo] = useState<Geo | null>(null);
  const geoRef = useRef<Geo | null>(null);
  const fall = useMotionValue(0);
  const spread = useMotionValue(0);
  const fade = useMotionValue(0);
  const filterId = `pp-goo-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const [hover, setHover] = useState<number | null>(null);
  const hoverTimer = useRef<number | undefined>(undefined);
  const hoverTo = useCallback((index: number | null, delay = 0) => {
    window.clearTimeout(hoverTimer.current);
    if (delay <= 0) setHover(index);
    else hoverTimer.current = window.setTimeout(() => setHover(index), delay);
  }, []);
  useEffect(() => () => window.clearTimeout(hoverTimer.current), []);
  //* A sorok alatti folyadék két éle — a sorok tintája ezekből vágja magát.
  const liqTop = useMotionValue(0);
  const liqBottom = useMotionValue(0);

  if (open && !present) setPresent(true);

  //* A buborék geometriája a kész elrendezésből — a test ebbe az alakba folyik.
  useLayoutEffect(() => {
    if (!present) return;
    const measure = () => {
      const trig = triggerRef.current?.getBoundingClientRect();
      const panel = panelRef.current;
      if (!trig || !panel) return;
      const pr = panel.getBoundingClientRect();
      const next: Geo = {
        ox: trig.left + trig.width / 2 - pr.left,
        w: panel.offsetWidth,
        h: panel.offsetHeight,
      };
      geoRef.current = next;
      setGeo(next);
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (navRef.current) ro.observe(navRef.current);
    if (panelRef.current) ro.observe(panelRef.current);
    return () => ro.disconnect();
  }, [present, navRef, triggerRef]);

  useEffect(() => {
    if (!present) return;
    if (reduced) {
      for (const mv of [fall, spread, fade]) mv.jump(open ? 1 : 0);
      if (!open) setPresent(false);
      return;
    }
    const runs = open
      ? [
          animate(fall, 1, FALL),
          animate(spread, 1, SPREAD),
          animate(fade, 1, { duration: 0.2, delay: 0.1 }),
        ]
      : [
          animate(fade, 0, { duration: 0.08 }),
          animate(spread, 0, DRAIN),
          animate(fall, 0, { ...DRAIN, stiffness: 400 }),
        ];
    if (!open)
      Promise.all(runs).then(() => {
        hoverTo(null);
        setPresent(false);
      });
    return () => {
      for (const run of runs) run.stop();
    };
  }, [open, present, reduced, fall, spread, fade, hoverTo]);

  //! ─── A TEST ALAKJA ─────────────────────────────────────────────────────
  //! Nullán egy nyaknyi széles, nulla magas csepp a gomb alatt; egynél a
  //! buborék teljes doboza. A lekerekítés a kisebbik félméretig nő, így a
  //! nyúló csepp végig kapszula marad, sosem szögletes.
  const bodyX = useTransform(() => {
    const g = geoRef.current;
    if (!g) return 0;
    return lerp(g.ox - SEED_W / 2, 0, spread.get());
  });
  const bodyW = useTransform(() => {
    const g = geoRef.current;
    if (!g) return 0;
    return Math.max(0, lerp(SEED_W, g.w, spread.get()));
  });
  const bodyH = useTransform(() => {
    const g = geoRef.current;
    if (!g) return 0;
    return Math.max(0, g.h * fall.get());
  });
  const bodyR = useTransform(() =>
    Math.min(RADIUS, bodyW.get() / 2, bodyH.get() / 2),
  );
  //* A sorok a test pillanatnyi alakjára vágva.
  const contentClip = useTransform(() => {
    const g = geoRef.current;
    if (!g) return "inset(0 100% 100% 0)";
    const l = bodyX.get();
    const r = g.w - l - bodyW.get();
    const b = g.h - bodyH.get();
    return `inset(0px ${Math.max(0, r)}px ${Math.max(0, b)}px ${Math.max(0, l)}px round ${bodyR.get()}px)`;
  });

  //* A nyak félúton a legvastagabb — ott folyik rajta a legtöbb —, és egy
  //* vékony, álló menisszé száradva marad a buborék és a gomb között.
  const neckW = useTransform(fall, (v) => {
    const t = clamp01(v);
    return 12 * clamp01(t * 4) + 16 * Math.sin(Math.PI * t);
  });
  const neckScaleY = useTransform(fall, (v) => clamp01(v * 3));
  const dropScale = useTransform(fall, (v) => 0.2 + 0.8 * clamp01(v * 2.5));

  //! ─── FÓKUSZ ÉS BILLENTYŰZET ────────────────────────────────────────────
  //! Nyitáskor a fókusz a buborékba lép — a jelenlegi helyre, ha van, különben
  //! az elsőre. A nyilak körbejárnak, az Esc a gombra adja vissza, és ha a
  //! fókusz a Tabbal kimegy, a buborék becsukódik: egy nyitva felejtett,
  //! fókusz nélküli réteg csak takar.
  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    const target =
      panel?.querySelector<HTMLElement>("[aria-current=page]") ??
      panel?.querySelector<HTMLElement>("a");
    target?.focus({ preventScroll: true });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (target && navRef.current?.contains(target)) return;
      onClose();
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [open, onClose, navRef]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onClose({ refocus: true });
      return;
    }
    const links = [
      ...(panelRef.current?.querySelectorAll<HTMLElement>("a") ?? []),
    ];
    const i = links.indexOf(document.activeElement as HTMLElement);
    const next =
      event.key === "ArrowDown"
        ? links[(i + 1) % links.length]
        : event.key === "ArrowUp"
          ? links[(i - 1 + links.length) % links.length]
          : event.key === "Home"
            ? links[0]
            : event.key === "End"
              ? links[links.length - 1]
              : null;
    if (!next) return;
    event.preventDefault();
    next.focus();
  };

  if (!present) return null;

  //! A KIEMELÉS A MUTATOTT (VAGY FÓKUSZBAN ÁLLÓ) SORT KÖVETI; ha egyik sem, a
  //! JELENLEGI helyre folyik vissza — vagy ha nincs ilyen, elapad a helyén.
  const currentIndex = PLACES.findIndex((p) => p.id === current?.id);
  const target = hover ?? (currentIndex >= 0 ? currentIndex : null);

  //! A KIEMELÉS UGYANAZ A FEHÉR FOLYADÉK, MINT A VÁLTÓBAN. Egy halk,
  //! szürkés sáv a buborékban egy MÁSIK anyag lett volna; így a mutatott sor
  //! pontosan úgy néz ki, mint a váltó aktív cellája — `--foreground` csepp,
  //! rajta `--background` tinta —, és a kettő ugyanannak a folyadéknak olvasható.
  const caseColor = floating ? "var(--background)" : "var(--card)";

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: a billentyűk a benne álló hivatkozások között járnak; a doboz maga nem vezérlő
    <div
      ref={panelRef}
      id={panelId}
      onKeyDown={onKeyDown}
      onBlur={(event) => {
        const next = event.relatedTarget as Node | null;
        if (next && !navRef.current?.contains(next)) onClose();
      }}
      className="absolute right-0 z-[1] w-[min(17.5rem,calc(100vw-1.5rem))]"
      style={{ top: `calc(100% + ${GAP}px)` }}
    >
      {geo && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0"
          style={{
            top: -LAYER_TOP,
            //! AZ ÁRNYÉK A SZŰRŐLÁNC VÉGÉN ÜL, NEM A KÜLSŐ DOBOZON. Amíg a
            //! `drop-shadow` a buborék dobozán volt, a böngésző minden
            //! képkockán az EGÉSZ dobozt (vágott sorokkal együtt) újraárnyékolta,
            //! és a kivágás változásakor az előző képkocka árnyéka csíkokban
            //! ottmaradt — „a keret a régi helyén". Itt csak a csepp alakja vet
            //! árnyékot, és a réteg saját kompozitor-rétegen fut (`LAYER`),
            //! tehát egészében rajzolódik újra, nem foltokban.
            filter: reduced ? SHADOW : `url(#${filterId}) ${SHADOW}`,
            ...LAYER,
          }}
        >
          <svg aria-hidden="true" width="0" height="0" className="absolute">
            <defs>
              <filter
                id={filterId}
                x="-15%"
                y="-15%"
                width="130%"
                height="130%"
                colorInterpolationFilters="sRGB"
              >
                <feGaussianBlur
                  in="SourceGraphic"
                  stdDeviation="5"
                  result="blur"
                />
                <feColorMatrix
                  in="blur"
                  mode="matrix"
                  values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 24 -10"
                  result="goo"
                />
                <feComposite in="SourceGraphic" in2="goo" operator="atop" />
              </filter>
            </defs>
          </svg>

          {/*//* A csepp a tok alján, és a nyak, ami belőle lefolyik. */}
          <motion.div
            className="absolute top-0 h-4 w-8 rounded-full"
            style={{
              left: geo.ox - 16,
              background: caseColor,
              scale: dropScale,
            }}
          />
          <motion.div
            className="absolute rounded-full"
            style={{
              top: 4,
              left: geo.ox,
              height: LAYER_TOP + 6,
              width: neckW,
              x: "-50%",
              scaleY: neckScaleY,
              originY: 0,
              background: caseColor,
            }}
          />

          {/*//* A test. */}
          <motion.div
            className="absolute"
            style={{
              top: LAYER_TOP,
              left: bodyX,
              width: bodyW,
              height: bodyH,
              borderRadius: bodyR,
              background: caseColor,
            }}
          />
        </div>
      )}

      {/*//! A KIEMELÉS SAJÁT SZŰRT RÉTEGBEN ÉL, NEM A TESTÉBEN. A goo-szűrő az
          //! átlátszóságon küszöböl: a tömör test fölött a leszakadó csepp nem
          //! tudna elvékonyodni, csak összemenni. Átlátszó alapon viszont
          //! ugyanúgy nyúlik és szakad, mint a váltó folyadéka. */}
      {geo && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            filter: reduced ? INK_SHADOW : `url(#${filterId}) ${INK_SHADOW}`,
            ...LAYER,
          }}
        >
          <RowLiquid
            panelRef={panelRef}
            target={target}
            top={liqTop}
            bottom={liqBottom}
            reduced={reduced}
            fade={fade}
          />
        </div>
      )}

      <motion.div
        style={{ clipPath: contentClip, opacity: fade }}
        className={cn(
          "relative p-1.5",
          floating ? "text-foreground" : "text-card-foreground",
        )}
      >
        <motion.ul
          aria-label="Helyek"
          initial={reduced ? false : "hidden"}
          animate="shown"
          variants={{
            shown: {
              transition: { staggerChildren: 0.05, delayChildren: 0.12 },
            },
          }}
          onPointerLeave={() => hoverTo(null, LEAVE_DELAY)}
          className="flex flex-col gap-0.5"
        >
          {PLACES.map((place, i) => (
            <PlaceRow
              key={place.id}
              index={i}
              place={place}
              current={current?.id === place.id}
              divided={place.id === "home"}
              reduced={reduced}
              liquidTop={liqTop}
              liquidBottom={liqBottom}
              onHover={hoverTo}
              cellRef={triggerRef}
              onPick={() => onClose()}
            />
          ))}
        </motion.ul>
      </motion.div>
    </div>
  );
}

//! ─── A SOROK ALATTI FOLYADÉK ─────────────────────────────────────────────
//! Ugyanaz a mozgás, mint a váltóban, csak függőlegesen: a kiemelés elülső éle
//! a cél felé kap, a hátsó utána húzódik, a régi helyen egy csepp leszakad.
//! Mivel a test szűrőjében él, a leszakadó csepp a testből HÚZÓDIK ki, nem
//! egy külön tárgy fölötte.
function RowLiquid({
  panelRef,
  target,
  top,
  bottom,
  reduced,
  fade,
}: {
  panelRef: RefObject<HTMLDivElement | null>;
  target: number | null;
  top: MotionValue<number>;
  bottom: MotionValue<number>;
  reduced: boolean;
  fade: MotionValue<number>;
}) {
  const height = useTransform(() => Math.max(0, bottom.get() - top.get()));
  const [remnants, setRemnants] = useState<Remnant[]>([]);
  const last = useRef<{ index: number | null; span: Span | null }>({
    index: null,
    span: null,
  });

  //* A sor VÉGSŐ helye az elrendezésből (`offsetTop`), nem a lecsöppenés
  //* közbeni transzformált dobozából.
  const spanOf = useCallback(
    (index: number): Span | null => {
      const row =
        panelRef.current?.querySelectorAll<HTMLElement>("[data-place-row]")[
          index
        ];
      if (!row) return null;
      let t = 0;
      let el: HTMLElement | null = row;
      while (el && el !== panelRef.current) {
        t += el.offsetTop;
        el = el.offsetParent as HTMLElement | null;
      }
      return { top: t, bottom: t + row.offsetHeight };
    },
    [panelRef],
  );

  useLayoutEffect(() => {
    const prev = last.current;
    const span = target === null ? null : spanOf(target);

    //* Ahol a folyadék ÉPP van — nem ahová legutóbb indult.
    const visible = bottom.get() - top.get() > SETTLED;

    if (!span) {
      if (prev.span) {
        const mid = (top.get() + bottom.get()) / 2;
        if (reduced) {
          top.jump(mid);
          bottom.jump(mid);
        } else {
          animate(top, mid, SWELL);
          animate(bottom, mid, SWELL);
        }
      }
      last.current = { index: null, span: null };
      return;
    }

    if (reduced) {
      top.jump(span.top);
      bottom.jump(span.bottom);
    } else if (!prev.span) {
      if (visible) {
        //* Még apadt, amikor új cél jött — onnan folyik tovább, nem ugrik.
        animate(top, span.top, EVEN);
        animate(bottom, span.bottom, EVEN);
      } else {
        //* Az első megjelenés a sor közepéből duzzad ki, nem csúszik be.
        const mid = (span.top + span.bottom) / 2;
        top.jump(mid);
        bottom.jump(mid);
        animate(top, span.top, SWELL);
        animate(bottom, span.bottom, SWELL);
      }
    } else if (prev.index !== target) {
      //! CSAK AZ ÁLLÓ FOLYADÉK SZAKAD. Ha a csepp még úton van, a régi cél
      //! helyén nincs mit otthagyni — a leszakadó csepp ott a semmiből
      //! bukkanna fel, és az irányfüggő élek menet közben megfordulva a
      //! testet több sorra húznák szét. Ilyenkor egyenletesen átcélzunk.
      const settled =
        Math.abs(top.get() - prev.span.top) < SETTLED &&
        Math.abs(bottom.get() - prev.span.bottom) < SETTLED;
      if (settled) {
        const dir = span.top > prev.span.top ? 1 : -1;
        animate(top, span.top, dir > 0 ? TRAIL : LEAD);
        animate(bottom, span.bottom, dir > 0 ? LEAD : TRAIL);
        const from = prev.span;
        setRemnants((list) => [...list, { id: ++remnantSeq, ...from, dir }]);
      } else {
        animate(top, span.top, EVEN);
        animate(bottom, span.bottom, EVEN);
      }
    }
    last.current = { index: target, span };
  }, [target, spanOf, reduced, top, bottom]);

  return (
    <>
      {remnants.map((rm) => (
        <motion.div
          key={rm.id}
          className="absolute inset-x-1.5 rounded-xl bg-foreground"
          style={{
            top: rm.top,
            height: rm.bottom - rm.top,
            originY: rm.dir > 0 ? 1 : 0,
          }}
          initial={{ scaleY: 1, scaleX: 1 }}
          animate={{ scaleY: 0.1, scaleX: 0.3 }}
          transition={{ duration: 0.38, ease: [0.45, 0, 0.7, 0.5] }}
          onAnimationComplete={() =>
            setRemnants((list) => list.filter((x) => x.id !== rm.id))
          }
        />
      ))}
      <motion.div
        className="absolute inset-x-1.5 top-0 rounded-xl bg-foreground"
        style={{
          y: top,
          height,
          opacity: fade,
        }}
      />
    </>
  );
}

//! ─── A SOR KÉT RÉTEGBEN ───────────────────────────────────────────────────
//! Ugyanaz a megoldás, mint a váltó feliratain (`InkLabel`, `pill-nav.tsx`),
//! csak függőlegesen: alul a sor a tok színeivel, fölötte ugyanez a sor
//! tintával (`--background`), a folyadék két élére vágva. A szöveg így
//! pontosan ott fordul, ahol a csepp takarja — nyúlás és leszakadás közben is,
//! nem egy pillanatnyi színváltással, ami a folyadék előtt vagy után ugrana.
const INK_HIDDEN = "inset(0 0 100% 0)";

function PlaceRow({
  index,
  place,
  current,
  divided,
  reduced,
  liquidTop,
  liquidBottom,
  onHover,
  cellRef,
  onPick,
}: {
  index: number;
  place: Place;
  current: boolean;
  divided: boolean;
  reduced: boolean;
  liquidTop: MotionValue<number>;
  liquidBottom: MotionValue<number>;
  onHover: (index: number, delay?: number) => void;
  /** A helyek-cella gombja a váltóban — a kiöntés célja. */
  cellRef: RefObject<HTMLButtonElement | null>;
  onPick: () => void;
}) {
  const router = useRouter();
  const iconRef = useRef<HTMLSpanElement>(null);
  const linkRef = useRef<HTMLAnchorElement>(null);
  const inkClip = useMotionValue(INK_HIDDEN);
  const { Icon } = place;

  useEffect(() => {
    const update = () => {
      const link = linkRef.current;
      if (!link) return;
      let y = 0;
      let el: HTMLElement | null = link;
      const panel = link.closest<HTMLElement>("[id^=pn-places]");
      while (el && el !== panel) {
        y += el.offsetTop;
        el = el.offsetParent as HTMLElement | null;
      }
      const h = link.offsetHeight;
      const ct = liquidTop.get() - y;
      const cb = y + h - liquidBottom.get();
      if (ct >= h || cb >= h || h - ct - cb < 0.5) {
        inkClip.set(INK_HIDDEN);
        return;
      }
      inkClip.set(`inset(${Math.max(0, ct)}px 0 ${Math.max(0, cb)}px 0)`);
    };
    update();
    const subs = [liquidTop, liquidBottom].map((mv) => mv.on("change", update));
    return () => {
      for (const unsub of subs) unsub();
    };
  }, [liquidTop, liquidBottom, inkClip]);

  const body = (ink: boolean) => (
    <>
      <span
        ref={ink ? undefined : iconRef}
        className={cn(
          "flex size-4 shrink-0",
          ink
            ? "text-background"
            : current
              ? "text-foreground"
              : "text-muted-foreground",
        )}
      >
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            "block truncate text-sm font-medium",
            ink ? "text-background" : "text-foreground",
          )}
        >
          {place.label}
        </span>
        <span
          className={cn(
            "block truncate text-xs",
            ink ? "text-background/70" : "text-muted-foreground",
          )}
        >
          {place.hint}
        </span>
      </span>
      {current && (
        <Check
          className={cn(
            "size-4 shrink-0",
            ink ? "text-background" : "text-primary",
          )}
        />
      )}
    </>
  );

  return (
    //* Minden sor külön csepp: fentről csöppen a helyére, egy leheletnyi
    //* elmosásból élesedve — a sorrend a folyás iránya.
    <motion.li
      variants={
        reduced
          ? undefined
          : {
              hidden: { opacity: 0, y: -14, scaleY: 0.6, filter: "blur(4px)" },
              shown: {
                opacity: 1,
                y: 0,
                scaleY: 1,
                filter: "blur(0px)",
                transition: DRIP,
                //! A LECSÖPPENÉS UTÁN A SOR NEM MARAD SZŰRT. Egy ottfelejtett
                //! `blur(0px)` minden sort saját rétegen tartana, és a
                //! vágás (`contentClip`) szélén csíkokat hagyna.
                transitionEnd: { filter: "none" },
              },
            }
      }
      style={{ originY: 0 }}
    >
      {divided && (
        <span aria-hidden className="mx-3 my-1 block h-px bg-foreground/10" />
      )}
      <Link
        ref={linkRef}
        href={place.href}
        data-place-row
        aria-current={current ? "page" : undefined}
        onPointerEnter={(e) =>
          e.pointerType === "mouse" && onHover(index, HOVER_DELAY)
        }
        //! A FOLYADÉK CSAK LÁTHATÓ FÓKUSZRA MOZDUL. Nyitáskor a buborék az
        //! első sorra teszi a fókuszt (billentyűzettel ez kell), de koppintás
        //! után ez a fókusz láthatatlan — és a folyadék mégis az „Ügyelet" alá
        //! folyt, mintha az lenne kiválasztva. Telefonon ettől a buborék azt
        //! állította, hogy ott vagy, ahol nem. A `:focus-visible` pont ezt
        //! választja szét: billentyűre igaz, koppintás utáni fókuszra nem.
        onFocus={(event) => {
          if (event.currentTarget.matches(":focus-visible")) onHover(index);
        }}
        onClick={(event) => {
          const cell = cellRef.current?.parentElement;
          const nav = cell?.closest<HTMLElement>("[data-pill-nav]");
          if (current) {
            event.preventDefault();
          } else if (
            //! KÉRÉSRE A SOR FOLYADÉKA ELÖNTI A LAPOT (lásd `flood.ts`), és a
            //! helyek cellájába apad vissza. Ilyenkor nincs repülés és kiöntés:
            //! két mozdulat ugyanarról a koppintásról egymásba futna.
            !event.metaKey &&
            !event.ctrlKey &&
            !event.shiftKey &&
            !event.altKey &&
            event.button === 0 &&
            nav &&
            cell &&
            launchFlood({
              nav,
              cell,
              origin: linkRef.current,
              label: place.label,
              navigate: () => router.push(place.href),
            })
          ) {
            event.preventDefault();
          } else {
            launchFlight(place.id, iconRef.current);
            //! A SOR FOLYADÉKA VISZI ÁT A LAPOT (lásd `pour.ts`). A cél a
            //! cella dobozán, nem a gombén: a váltó folyadéka azt tölti ki.
            if (linkRef.current && cell)
              launchPour({
                id: place.id,
                row: linkRef.current,
                icon: iconRef.current,
                cell,
              });
          }
          onPick();
        }}
        className={cn(
          sheetItem(),
          "relative rounded-xl px-2.5 hover:bg-transparent focus-visible:outline-offset-0",
        )}
      >
        <span className="sr-only">
          {place.label}, {place.hint}
        </span>
        <span aria-hidden className="contents">
          {body(false)}
        </span>
        <motion.span
          aria-hidden
          className="pointer-events-none absolute inset-0 flex items-center gap-2.5 px-2.5 py-1.5"
          style={{ clipPath: inkClip }}
        >
          {body(true)}
        </motion.span>
      </Link>
    </motion.li>
  );
}
