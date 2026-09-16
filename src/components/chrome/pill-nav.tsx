"use client";

import { GraduationCap, type LucideIcon, Presentation } from "lucide-react";
import {
  animate,
  type MotionValue,
  motion,
  useMotionValue,
  useReducedMotion,
} from "motion/react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  type KeyboardEvent,
  type PointerEvent,
  type RefObject,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  DEFAULT_IDENTITY,
  type Identity,
  loadIdentity,
  saveIdentity,
  weekRouteFor,
} from "@/lib/identity";
import { onPrefsChanged } from "@/lib/prefs-events";
import { cn } from "@/lib/utils";

//! ═══════════════════════════════════════════════════════════════════════════
//! A FOLYÉKONY VÁLTÓ — KIÉ ÉS MELYIK, EGY TÁRGYBAN
//! ═══════════════════════════════════════════════════════════════════════════
//! Ugyanaz a két tengely, mint a régi négycellás mátrixé: MELYIK nézet (Hét /
//! Ma) és KIÉ az órarend (Diák / Tanár). A különbség a rangsor: a nézet a
//! főtengely, az alany pedig az AKTÍV nézet belsejébe nyílik. Így a két kérdés
//! továbbra is egy tárgy, de a ritkán állított alany csak ott vesz el helyet,
//! ahol épp nézel valamit.
//*
//! A SZÍNEK A LAP TOKENJEI, NEM SAJÁT PALETTA. A tok `--card`, a folyadék
//! `--foreground`, az alanyok `--primary` (diák) és `--chart-3` (tanár), a
//! rajtuk álló szöveg `--ink-on-primary`. Így a váltó követi a világos/sötét
//! témát és a tweakcn-preseteket is, a lebegő alak pedig a `.nav-glass` zárt
//! színvilágát (lásd `globals.css`).
//*
//! A 375 PX-ES KERET VÁLTOZATLAN. Telefonon az alany IKON, a nézet SZÓ — a
//! kiválasztott alany neve csak `sm`-től nyílik ki. A tok így ~165 px, a sor
//! csonkul, a tok nem (lásd `standing-line.tsx`).
//! ═══════════════════════════════════════════════════════════════════════════

type ViewId = "week" | "today";

const VIEWS: readonly { id: ViewId; label: string; title: string }[] = [
  { id: "week", label: "Hét", title: "A teljes heti órarend" },
  { id: "today", label: "Ma", title: "A mai nap egy képernyőn" },
];

const ROLES: readonly {
  id: Identity;
  label: string;
  title: string;
  Icon: LucideIcon;
  blob: string;
}[] = [
  {
    id: "teacher",
    label: "Tanár",
    title: "Tanár órarendje",
    Icon: Presentation,
    blob: "bg-chart-3",
  },
  {
    id: "class",
    label: "Diák",
    title: "Osztály órarendje",
    Icon: GraduationCap,
    blob: "bg-primary",
  },
];

const VIEW_KEYS = VIEWS.map((v) => v.id);
const ROLE_KEYS = ROLES.map((r) => r.id);

//* A tanári rács ugyanaz a NÉZET, más alannyal — ezért ő is a „Hét"-et
//* világítja meg. Ami nincs a táblázatban (nyitólap, ügyelet, teremkereső),
//* ott egyik cella sem aktív: ott nem nézed egyik nézetet sem, csak elérheted.
const VIEW_OF: Record<string, ViewId> = {
  "/orarend": "week",
  "/tanari": "week",
  "/ma": "today",
};

//* Az útvonal, ahol az alanyra maga a cím válaszol. A `/ma` szándékosan nincs
//* benne: az EGY útvonal mindkét alanynak (lásd `lib/identity.ts`).
const IDENTITY_OF: Record<string, Identity> = {
  "/orarend": "class",
  "/tanari": "teacher",
};

//! A folyadék elülső éle a cél felé kap, a hátsó utána húzódik — a kettő
//! közötti rés olvasható „folyékonynak". Minden rugó a kritikus csillapításon
//! (vagy épp túl) ül: a csepp nyúlik és késik, de nem leng vissza.
const LEAD = { type: "spring", stiffness: 560, damping: 48, mass: 1 } as const;
const TRAIL = { type: "spring", stiffness: 170, damping: 27, mass: 1 } as const;
const EVEN = { type: "spring", stiffness: 380, damping: 40, mass: 1 } as const;
const COLLAPSE = { type: "spring", stiffness: 400, damping: 42 } as const;
const PRESS = { type: "spring", stiffness: 700, damping: 54 } as const;
const RELEASE = { type: "spring", stiffness: 480, damping: 44 } as const;
const INSTANT = { duration: 0 } as const;

//* Ennyit nyúl a folyadék az egér alatti szomszéd felé.
const LEAN = 5;

//! ─── ÁTADÁS A LAPOK KÖZÖTT ────────────────────────────────────────────────
//! MINDEN LAP A SAJÁT `StandingLine`-JÁT RAJZOLJA, tehát a „Ma"-ra koppintva a
//! váltó LESZERELŐDIK, és az új lapon egy friss példány áll fel — a folyadék
//! a helyére ugrana, mozgás nélkül. Ezért a példányok egy modulszintű
//! jegyzetben hagyják hátra, mit mutattak; az új példány onnan indul, és a
//! saját állapotába folyik át.
//*
//! A JEGYZETET A RENDERELÉS OLVASSA, NEM A LESZERELÉS ÍRJA. Kliensoldali
//! navigációnál az új fa a régi leszerelése ELŐTT renderelődik, tehát a régi
//! végig élve írja a jegyzetet (`useLayoutEffect`), és az új épp akkor olvassa,
//! amikor a régi még áll. Ha közben nem állt váltó (pl. a `/valtozasok`-ról
//! jössz vissza), a jegyzet csak rövid ideig érvényes.
type Handoff = { view: ViewId | null; role: Identity };
let handoff: Handoff | null = null;
let liveNavs = 0;
let lastUnmountAt = Number.NEGATIVE_INFINITY;
const HANDOFF_TTL = 1500;

function readHandoff(): Handoff | null {
  if (typeof window === "undefined" || !handoff) return null;
  if (liveNavs > 0) return handoff;
  return performance.now() - lastUnmountAt < HANDOFF_TTL ? handoff : null;
}

type Remnant = { id: number; l: number; r: number; dir: number; blob: string };
let remnantSeq = 0;

type Rect = { l: number; r: number };

type LiquidLayerProps = {
  order: readonly string[];
  activeKey: string;
  /** Az előző lap váltójának aktív kulcsa — innen folyik át az első elhelyezés. */
  fromKey?: string | null;
  fromBlob?: string;
  hoverKey: string | null;
  itemsRef: RefObject<Map<string, HTMLElement>>;
  filterId: string;
  blob: string;
  shadow: string;
  press?: MotionValue<number>;
  /** Kívülről adott élek — a feliratok tintája ezekből vágja magát. */
  left?: MotionValue<number>;
  right?: MotionValue<number>;
  /** Ennyi szélességet tart meg egy elem összecsukható része inaktívan. */
  restExtra: number;
};

function LiquidLayer({
  order,
  activeKey,
  fromKey,
  fromBlob,
  hoverKey,
  itemsRef,
  filterId,
  blob,
  shadow,
  press,
  left: sharedLeft,
  right: sharedRight,
  restExtra,
}: LiquidLayerProps) {
  const reduced = useReducedMotion() ?? false;
  const layerRef = useRef<HTMLDivElement>(null);
  const ownLeft = useMotionValue(0);
  const ownRight = useMotionValue(0);
  const left = sharedLeft ?? ownLeft;
  const right = sharedRight ?? ownRight;
  const rest = useMotionValue(0);
  const width = useMotionValue(0);
  const scaleY = useMotionValue(1);

  //* A térfogat megmarad: a nyúló csepp elvékonyodik, a lenyomott lapul.
  useEffect(() => {
    const update = () => {
      const w = Math.max(0, right.get() - left.get());
      const restWidth = rest.get();
      const ratio = restWidth > 0 ? w / restWidth : 1;
      const thin = Math.min(1.03, Math.max(0.78, 1 - (ratio - 1) * 0.16));
      width.set(w);
      scaleY.set(thin * (press?.get() ?? 1));
    };
    update();
    const subs = [left, right, rest, press].map((mv) =>
      mv?.on("change", update),
    );
    return () => {
      for (const unsub of subs) unsub?.();
    };
  }, [left, right, rest, press, width, scaleY]);
  const [remnants, setRemnants] = useState<Remnant[]>([]);
  //* A leszakadó csepp azt a színt viszi, ami a váltás pillanatában volt.
  const blobRef = useRef(blob);
  const track = useRef({
    placed: false,
    prevKey: activeKey,
    base: { l: 0, r: 0 } as Rect,
    target: { l: 0, r: 0 } as Rect,
    dir: 0,
    dirUntil: 0,
  });

  //! A CÉL AZ, AHOVÁ AZ ELRENDEZÉS BEÁLL, NEM AHOL ÉPP TART. Minden elem
  //! összecsukható része (`[data-liquid-extra]` egy vágó dobozban) a VÉGSŐ
  //! szélességével számít, így az épp nyíló-csukódó szomszédok nem rángatják
  //! a célt, amíg a rugók futnak.
  const rectOf = useCallback(
    (key: string): Rect | null => {
      const items = order.map((k) => itemsRef.current.get(k));
      const first = items[0];
      const index = order.indexOf(key);
      if (!first || index < 0 || items.some((el) => !el)) return null;
      const settled = order.map((k, i) => {
        const el = items[i] as HTMLElement;
        const now = el.getBoundingClientRect().width;
        const extra = el.querySelector<HTMLElement>("[data-liquid-extra]");
        const clip = extra?.parentElement;
        if (!extra || !clip) return now;
        const fixed = now - clip.getBoundingClientRect().width;
        return fixed + (k === key ? extra.offsetWidth : restExtra);
      });
      let l = first.offsetLeft;
      for (let i = 0; i < index; i++) l += settled[i];
      return { l, r: l + settled[index] };
    },
    [order, itemsRef, restExtra],
  );

  const sync = useCallback(() => {
    const base = rectOf(activeKey);
    if (!base) return;
    const t = track.current;
    t.base = base;
    rest.set(base.r - base.l);

    let { l, r } = base;
    if (hoverKey && hoverKey !== activeKey && !reduced) {
      if (order.indexOf(hoverKey) > order.indexOf(activeKey)) r += LEAN;
      else l -= LEAN;
    }
    if (
      t.placed &&
      Math.abs(l - t.target.l) < 0.5 &&
      Math.abs(r - t.target.r) < 0.5
    )
      return;
    t.target = { l, r };

    if (!t.placed) {
      t.placed = true;
      const from =
        fromKey && fromKey !== activeKey && !reduced ? rectOf(fromKey) : null;
      if (!from || !fromKey) {
        left.jump(l);
        right.jump(r);
        return;
      }
      //* Az előző lap váltója itt állt — onnan folyik át, cseppel együtt.
      const dir = Math.sign(order.indexOf(activeKey) - order.indexOf(fromKey));
      left.jump(from.l);
      right.jump(from.r);
      t.dir = dir;
      t.dirUntil = performance.now() + 700;
      setRemnants([
        { id: ++remnantSeq, ...from, dir, blob: fromBlob ?? blobRef.current },
      ]);
    } else if (reduced) {
      left.jump(l);
      right.jump(r);
      return;
    }
    const dir = performance.now() < t.dirUntil ? t.dir : 0;
    animate(left, l, dir > 0 ? TRAIL : dir < 0 ? LEAD : EVEN);
    animate(right, r, dir > 0 ? LEAD : dir < 0 ? TRAIL : EVEN);
  }, [
    activeKey,
    fromKey,
    fromBlob,
    hoverKey,
    reduced,
    order,
    rectOf,
    left,
    right,
    rest,
  ]);

  //* Kulcsváltáskor a régi helyen egy csepp marad, ami a goo-szűrőn át
  //* leszakad, miközben a fő test átfolyik az új elemre.
  useEffect(() => {
    const t = track.current;
    if (t.prevKey === activeKey) return;
    const dir = Math.sign(order.indexOf(activeKey) - order.indexOf(t.prevKey));
    const from = t.base;
    t.prevKey = activeKey;
    if (!t.placed || reduced) return;
    t.dir = dir;
    t.dirUntil = performance.now() + 700;
    setRemnants((prev) => [
      ...prev,
      { id: ++remnantSeq, l: from.l, r: from.r, dir, blob: blobRef.current },
    ]);
  }, [activeKey, order, reduced]);

  const syncRef = useRef(sync);
  useEffect(() => {
    syncRef.current = sync;
    blobRef.current = blob;
    sync();
  }, [sync, blob]);

  //* Minden átméretezés (kinyíló felirat, csukódó sáv, betűcsere) újracélozza
  //* a rugókat, így a folyadék képkockáról képkockára követi az elrendezést.
  useEffect(() => {
    const ro = new ResizeObserver(() => syncRef.current());
    const parent = layerRef.current?.parentElement;
    if (parent) ro.observe(parent);
    for (const key of order) {
      const el = itemsRef.current.get(key);
      if (el) ro.observe(el);
    }
    return () => ro.disconnect();
  }, [order, itemsRef]);

  return (
    <div
      ref={layerRef}
      aria-hidden
      className="pointer-events-none absolute inset-0"
      style={{ filter: `url(#${filterId}) ${shadow}` }}
    >
      {remnants.map((rm) => (
        <motion.div
          key={rm.id}
          className={cn("absolute top-0 left-0 h-full rounded-full", rm.blob)}
          style={{ x: rm.l, width: rm.r - rm.l, originX: rm.dir > 0 ? 1 : 0 }}
          initial={{ scaleX: 1, scaleY: 1 }}
          animate={{ scaleX: 0.15, scaleY: 0.3 }}
          transition={{ duration: 0.38, ease: [0.45, 0, 0.7, 0.5] }}
          onAnimationComplete={() =>
            setRemnants((prev) => prev.filter((x) => x.id !== rm.id))
          }
        />
      ))}
      <motion.div
        className={cn("absolute top-0 left-0 h-full rounded-full", blob)}
        style={{ x: left, width, scaleY }}
      />
    </div>
  );
}

function GooFilter({ id }: { id: string }) {
  return (
    <svg aria-hidden="true" width="0" height="0" className="absolute">
      <defs>
        <filter
          id={id}
          x="-20%"
          y="-60%"
          width="140%"
          height="220%"
          colorInterpolationFilters="sRGB"
        >
          <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="blur" />
          <feColorMatrix
            in="blur"
            mode="matrix"
            values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 20 -8"
            result="goo"
          />
          <feComposite in="SourceGraphic" in2="goo" operator="atop" />
        </filter>
      </defs>
    </svg>
  );
}

type RoleTrackProps = {
  role: Identity;
  fromRole: Identity | null;
  onSelect: (role: Identity) => void;
  filterId: string;
  hidden: boolean;
};

function RoleTrack({
  role,
  fromRole,
  onSelect,
  filterId,
  hidden,
}: RoleTrackProps) {
  const reduced = useReducedMotion() ?? false;
  const itemsRef = useRef(new Map<string, HTMLElement>());
  const [hoverRole, setHoverRole] = useState<Identity | null>(null);
  const current = ROLES.find((r) => r.id === role) ?? ROLES[0];
  const previous = fromRole ? ROLES.find((r) => r.id === fromRole) : undefined;

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = ROLE_KEYS.indexOf(role);
    const next =
      e.key === "ArrowRight" || e.key === "ArrowDown"
        ? ROLE_KEYS[(i + 1) % ROLE_KEYS.length]
        : e.key === "ArrowLeft" || e.key === "ArrowUp"
          ? ROLE_KEYS[(i - 1 + ROLE_KEYS.length) % ROLE_KEYS.length]
          : e.key === "Home"
            ? ROLE_KEYS[0]
            : e.key === "End"
              ? ROLE_KEYS[ROLE_KEYS.length - 1]
              : null;
    if (!next) return;
    e.preventDefault();
    onSelect(next);
    itemsRef.current.get(next)?.focus();
  };

  return (
    <div
      role="radiogroup"
      aria-label="Kié az órarend"
      aria-hidden={hidden || undefined}
      inert={hidden}
      onKeyDown={onKeyDown}
      className="relative flex h-[26px] items-center"
    >
      <LiquidLayer
        order={ROLE_KEYS}
        activeKey={role}
        fromKey={fromRole}
        fromBlob={previous?.blob}
        hoverKey={hoverRole}
        itemsRef={itemsRef}
        filterId={filterId}
        blob={cn("transition-colors duration-500", current.blob)}
        shadow="drop-shadow(0 1px 1.5px oklch(0 0 0 / 0.28))"
        restExtra={0}
      />
      {ROLES.map(({ id, label, title, Icon }) => {
        const selected = id === role;
        return (
          // biome-ignore lint/a11y/useSemanticElements: stílusos rádiók vándorló tabindexszel; natív input nem hordozhatja a folyadékréteget
          <button
            key={id}
            ref={(el) => {
              if (el) itemsRef.current.set(id, el);
              else itemsRef.current.delete(id);
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={label}
            title={title}
            tabIndex={selected ? 0 : -1}
            onClick={() => onSelect(id)}
            onPointerEnter={(e) =>
              e.pointerType === "mouse" && setHoverRole(id)
            }
            onPointerLeave={() => setHoverRole(null)}
            className={cn(
              "relative flex h-full cursor-pointer items-center rounded-full px-2 text-xs font-semibold tracking-[-0.005em] outline-none transition-colors duration-200 motion-reduce:transition-none",
              "focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-1 focus-visible:outline-ring",
              selected
                ? "text-ink-on-primary"
                : "text-background/55 hover:text-background",
            )}
          >
            <Icon aria-hidden className="size-4 shrink-0" strokeWidth={2.25} />
            {/*//! A NÉV TELEFONON NEM NYÍLIK KI. Az olvasónév (`aria-label`)
                //! végig megvan; a szemnek a mellette álló sor mondja ki az
                //! alanyt („13C" vagy „Kovács B."). `sm`-től kifér. */}
            <motion.span
              aria-hidden
              initial={
                fromRole
                  ? {
                      width: id === fromRole ? "auto" : 0,
                      opacity: id === fromRole ? 1 : 0,
                    }
                  : false
              }
              animate={{
                width: selected ? "auto" : 0,
                opacity: selected ? 1 : 0,
              }}
              transition={
                reduced
                  ? INSTANT
                  : {
                      width: COLLAPSE,
                      opacity: selected
                        ? { duration: 0.2, delay: 0.06 }
                        : { duration: 0.1 },
                    }
              }
              className="overflow-hidden whitespace-nowrap"
            >
              <span
                data-liquid-extra
                className="block w-max pl-1 max-sm:hidden"
              >
                {label}
              </span>
            </motion.span>
          </button>
        );
      })}
    </div>
  );
}

//! ─── A FELIRAT KÉT RÉTEGBEN ───────────────────────────────────────────────
//! A felirat pontosan ott fordul, ahol a folyadék takarja — nyúlás közben is.
//! Alul a tokra szánt szín (`--foreground`), fölötte ugyanaz a szó a folyadékra
//! szánt színnel (`--background`), a folyadék két élére vágva. Az alsó réteg
//! ugyanott KI van vágva, hogy a világos betű széle ne derengjen át a sötét
//! mögül.
//*
//! MIÉRT NEM `mix-blend-difference`, AMIVEL A TERV INDULT. A keverés a böngésző
//! kompozitorán múlik: amíg az alanyváltó mozog (átlátszóság- és
//! transzformáció-animációk, saját rétegre emelve), a Safari — és néha a
//! Chrome is — elengedi a keverést, és a felirat nyers fehérként ül a fehér
//! folyadékon. A vágás nem keverés, hanem geometria: nincs mit elengedni.
const HIDDEN = "inset(0 100% 0 0)";
const SHOWN = "none";

function InkLabel({
  label,
  rowRef,
  left,
  right,
  liquid,
  className,
}: {
  label: string;
  rowRef: RefObject<HTMLDivElement | null>;
  left: MotionValue<number>;
  right: MotionValue<number>;
  liquid: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inkClip = useMotionValue(HIDDEN);
  const baseClip = useMotionValue(SHOWN);

  useEffect(() => {
    if (!liquid) {
      inkClip.set(HIDDEN);
      baseClip.set(SHOWN);
      return;
    }
    const update = () => {
      const el = ref.current;
      const row = rowRef.current;
      if (!el || !row) return;
      const x =
        el.getBoundingClientRect().left - row.getBoundingClientRect().left;
      const w = el.offsetWidth;
      //* A takart sáv a felirat saját koordinátáiban, [0, w]-re szorítva.
      const cl = Math.min(w, Math.max(0, left.get() - x));
      const cr = Math.min(w, Math.max(0, right.get() - x));
      if (cr - cl < 0.5) {
        inkClip.set(HIDDEN);
        baseClip.set(SHOWN);
        return;
      }
      //* Függőlegesen túlnyúlik, hogy az ékezetet és az alsó szárat ne vágja.
      inkClip.set(`inset(-6px ${w - cr}px -6px ${cl}px)`);
      baseClip.set(
        cl <= 0 && cr >= w
          ? HIDDEN
          : `polygon(evenodd, -6px -6px, ${w + 6}px -6px, ${w + 6}px calc(100% + 6px), -6px calc(100% + 6px), -6px -6px, ${cl}px -6px, ${cl}px calc(100% + 6px), ${cr}px calc(100% + 6px), ${cr}px -6px, ${cl}px -6px)`,
      );
    };
    update();
    const subs = [left.on("change", update), right.on("change", update)];
    //* A sor átméreteződése (nyíló-csukódó alany) a feliratot is odébb tolja.
    const ro = new ResizeObserver(update);
    if (rowRef.current) ro.observe(rowRef.current);
    return () => {
      for (const unsub of subs) unsub();
      ro.disconnect();
    };
  }, [liquid, left, right, rowRef, inkClip, baseClip]);

  return (
    <span ref={ref} className="relative">
      <motion.span
        className={cn("block text-foreground", className)}
        style={{ clipPath: baseClip }}
      >
        {label}
      </motion.span>
      <motion.span
        aria-hidden
        className="pointer-events-none absolute inset-0 text-background"
        style={{ clipPath: inkClip }}
      >
        {label}
      </motion.span>
    </span>
  );
}

//! AZ ALANYRA ELŐSZÖR AZ ÚTVONAL VÁLASZOL, ÉS CSAK UTÁNA A TÁROLÓ. Az
//! `/orarend` és a `/tanari` MAGA a válasz; a `/ma` viszont EGY útvonal
//! mindkét alanynak, ott a tárolt érték az egyetlen forrás.
//*
//! `useSyncExternalStore`, NEM `useEffect` + állapot. Hidratáláskor a
//! kiszolgálói pillanatkép (az alapértelmezés) fut, így nincs eltérés — lapváltás
//! után viszont az új váltó AZONNAL a tárolt alannyal renderel. Effekttel az
//! első képkocka a diákot mutatná, és a folyadék minden lapváltáskor
//! átfolyna a tanárra, majd vissza.
function useIdentity(pathname: string): Identity {
  const routed = IDENTITY_OF[pathname] ?? null;
  const stored = useSyncExternalStore(
    onPrefsChanged,
    () => loadIdentity() ?? DEFAULT_IDENTITY,
    () => DEFAULT_IDENTITY,
  );

  //! AZ ÚTVONAL VISSZA IS ÍR. Aki könyvjelzőről érkezik a `/tanari`-ra, attól
  //! még tanár: enélkül a „Ma"-ra lépve a saját napja helyett egy osztályét
  //! kapná. A `saveIdentity` változatlan értéknél nem ír és nem is jelez.
  useEffect(() => {
    if (routed) saveIdentity(routed);
  }, [routed]);

  return routed ?? stored;
}

export function PillNav({
  floating = false,
  className,
}: {
  floating?: boolean;
  className?: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const reduced = useReducedMotion() ?? false;
  const identity = useIdentity(pathname);
  const activeView = VIEW_OF[pathname] ?? null;
  const [hoverView, setHoverView] = useState<ViewId | null>(null);
  const itemsRef = useRef(new Map<string, HTMLElement>());
  const press = useMotionValue(1);
  const liquidLeft = useMotionValue(0);
  const liquidRight = useMotionValue(0);
  const rowRef = useRef<HTMLDivElement>(null);
  const filterId = `pn-goo-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;

  const [from] = useState(readHandoff);
  const fromView =
    from?.view && activeView && from.view !== activeView ? from.view : null;
  const fromRole = from && from.role !== identity ? from.role : null;

  useLayoutEffect(() => {
    handoff = { view: activeView, role: identity };
  }, [activeView, identity]);
  useLayoutEffect(() => {
    liveNavs++;
    return () => {
      liveNavs--;
      lastUnmountAt = performance.now();
    };
  }, []);

  //! A „HÉT" KÉT KÜLÖNBÖZŐ LAP (`weekRouteFor`), A „MA" EGY.
  const weekHref = weekRouteFor(identity);

  const pickIdentity = (next: Identity) => {
    if (next === identity) return;
    saveIdentity(next);
    //! CSAK A HETES RÁCS UGRIK ÁT. A „Ma" EGY útvonal mindkét alanynak: ott a
    //! lap a `notifyPrefsChanged` jelére épül újra a helyén.
    if (activeView === "week") router.push(weekRouteFor(next));
  };

  const squash = (e: PointerEvent) => {
    if (reduced || e.button !== 0) return;
    animate(press, 0.94, PRESS);
  };
  const release = () => {
    if (press.get() === 1) return;
    animate(press, 1, RELEASE);
  };

  return (
    <nav
      aria-label="Nézetek"
      onPointerDown={squash}
      onPointerUp={release}
      onPointerCancel={release}
      onPointerLeave={release}
      className={cn(
        "relative isolate inline-flex h-10 shrink-0 touch-manipulation select-none items-stretch rounded-full p-1 [-webkit-tap-highlight-color:transparent]",
        floating
          ? "bg-background"
          : "bg-card shadow-[inset_0_0_0_1px_var(--input)]",
        className,
      )}
    >
      <GooFilter id={filterId} />
      {activeView && (
        <div className="pointer-events-none absolute inset-1">
          <LiquidLayer
            order={VIEW_KEYS}
            activeKey={activeView}
            fromKey={fromView}
            hoverKey={hoverView}
            itemsRef={itemsRef}
            filterId={filterId}
            blob="bg-foreground"
            shadow="drop-shadow(0 2px 4px oklch(0 0 0 / 0.3))"
            press={press}
            left={liquidLeft}
            right={liquidRight}
            restExtra={6}
          />
        </div>
      )}
      <div ref={rowRef} className="relative flex items-stretch">
        {VIEWS.map(({ id, label, title }) => {
          const active = id === activeView;
          const wasActive = fromView ? id === fromView : active;
          return (
            <div
              key={id}
              ref={(el) => {
                if (el) itemsRef.current.set(id, el);
                else itemsRef.current.delete(id);
              }}
              className="relative flex items-center"
            >
              <Link
                href={id === "today" ? "/ma" : weekHref}
                title={title}
                aria-current={active ? "page" : undefined}
                onPointerEnter={(e) =>
                  e.pointerType === "mouse" && setHoverView(id)
                }
                onPointerLeave={() => setHoverView(null)}
                className={cn(
                  "group relative flex h-full items-center rounded-full pr-2 pl-3 text-sm font-semibold tracking-[-0.01em] outline-none sm:pl-3.5",
                  "focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring",
                  active && "cursor-default",
                )}
              >
                <InkLabel
                  label={label}
                  rowRef={rowRef}
                  left={liquidLeft}
                  right={liquidRight}
                  liquid={Boolean(activeView)}
                  className={cn(
                    "transition-opacity duration-200 motion-reduce:transition-none",
                    //! SÖTÉT TOKON A TELJES FEHÉR KIABÁL. A rámutatás ott
                    //! csak halkan erősödhet; világos tokon a teljes erő marad.
                    !active &&
                      (floating
                        ? "opacity-55 group-hover:opacity-75"
                        : "opacity-70 group-hover:opacity-100 dark:opacity-55 dark:group-hover:opacity-75"),
                  )}
                />
              </Link>
              <motion.div
                initial={
                  fromView
                    ? {
                        width: wasActive ? "auto" : 6,
                        opacity: wasActive ? 1 : 0,
                      }
                    : false
                }
                animate={{
                  width: active ? "auto" : 6,
                  opacity: active ? 1 : 0,
                }}
                transition={
                  reduced
                    ? INSTANT
                    : {
                        width: COLLAPSE,
                        opacity: active
                          ? { duration: 0.22, delay: 0.14 }
                          : { duration: 0.1 },
                      }
                }
                className="flex h-full items-center [overflow-x:clip]"
              >
                <div data-liquid-extra className="shrink-0 pr-1">
                  <RoleTrack
                    role={identity}
                    fromRole={fromRole}
                    onSelect={pickIdentity}
                    filterId={filterId}
                    hidden={!active}
                  />
                </div>
              </motion.div>
            </div>
          );
        })}
      </div>
    </nav>
  );
}
