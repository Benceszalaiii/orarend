"use client";

import {
  ChevronDown,
  Compass,
  DoorOpen,
  GraduationCap,
  type LucideIcon,
  Presentation,
} from "lucide-react";
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
  type PointerEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { launchFlood, registerPillNav } from "@/components/chrome/flood";
import {
  PLACES,
  type PlaceId,
  placeOf,
  readFlight,
} from "@/components/chrome/places";
import { PlacesPanel } from "@/components/chrome/places-panel";
import { type Pour, readPour } from "@/components/chrome/pour";
import { RailTips } from "@/components/chrome/rail-tips";
import {
  QuickPickToast,
  type SubjectPickerSpec,
  SubjectQuickPick,
} from "@/components/chrome/subject-quick-pick";
import { useWideChrome } from "@/components/chrome/use-wide-chrome";
import {
  DEFAULT_IDENTITY,
  type Identity,
  loadIdentity,
  saveIdentity,
  weekRouteFor,
} from "@/lib/identity";
import { DEFAULT_HIDDEN_MENU, loadHiddenMenu } from "@/lib/menu-items";
import { onPrefsChanged } from "@/lib/prefs-events";
import { saveQuickPick, useQuickPick } from "@/lib/quick-pick";
import { roomLabel } from "@/lib/subject-groups";
import type { TimetableSubjectKind } from "@/lib/timetable";
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

//* A „places" nem nézet, hanem a HELYEK cellája (lásd `chrome/places.ts`):
//* a folyadék oda is átfolyik, ha az ügyeleten, a teremkeresőn, a kivetítésen
//* vagy a nyitólapon állsz — így a váltó minden lapon megmondja, hol vagy.
type ViewId = "week" | "today" | "places";
//* Sáv-alakban (lásd `NavCells` lentebb) minden hely SAJÁT cella, és a
//* folyadék egyenesen rá folyik — ott a kulcs maga a hely.
type NavKey = ViewId | PlaceId;

const VIEWS: readonly {
  id: Exclude<ViewId, "places">;
  label: string;
  title: string;
}[] = [
  { id: "week", label: "Hét", title: "A teljes heti órarend" },
  { id: "today", label: "Ma", title: "A mai nap egy képernyőn" },
];

const ROLES: readonly {
  id: Role;
  label: string;
  title: string;
  Icon: LucideIcon;
  blob: string;
  /** A folyadékon álló szöveg színe. */
  ink: string;
}[] = [
  {
    id: "class",
    label: "Diák",
    title: "Osztály órarendje",
    Icon: GraduationCap,
    blob: "bg-primary",
    ink: "text-ink-on-primary",
  },
  {
    id: "teacher",
    label: "Tanár",
    title: "Tanár órarendje",
    Icon: Presentation,
    blob: "bg-chart-3",
    ink: "text-[var(--ink-on-band)]",
  },
  {
    id: "room",
    label: "Terem",
    title: "Terem órarendje",
    Icon: DoorOpen,
    blob: "bg-chart-2",
    ink: "text-[var(--ink-on-band)]",
  },
];

//* A „Hét" mindhármat, a „Ma" csak a két személyt viszi (lásd `RoleSwitch`).
const ROLE_KEYS_OF: Record<"week" | "today", readonly Role[]> = {
  week: ["class", "teacher", "room"],
  today: ["class", "teacher"],
};

//* A tanári rács ugyanaz a NÉZET, más alannyal — ezért ő is a „Hét"-et
//* világítja meg. A helyek (nyitólap, ügyelet, teremkereső, kivetítés) a
//* harmadik cellát: ott nem nézed egyik nézetet sem, de a váltó akkor is
//* kimondja, hol állsz.
const VIEW_OF: Record<string, ViewId> = {
  "/orarend": "week",
  "/tanari": "week",
  "/ma": "today",
  "/terem": "week",
  ...Object.fromEntries(PLACES.map((p) => [p.href, "places" as const])),
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
//* A kiöntött cseppből szétterülő folyadék: lazább, egyet túllő, mint egy
//* cseppnyi víz, ami a felületre érve szétfut.
const SPLASH = {
  type: "spring",
  stiffness: 300,
  damping: 21,
  mass: 1,
} as const;
const WOBBLE = [1, 0.74, 1.08, 0.97, 1];

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
type Handoff = { view: NavKey | null; role: Role };
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
  /** A buborékból kiöntött csepp (lásd `pour.ts`) — az első elhelyezés ebből terül szét. */
  seed?: Pour | null;
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
  seed,
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
    /** Amíg a kiöntött csepp úton van, a folyadék nem indul a cél felé. */
    holding: false,
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
    if (t.holding) return;

    if (!t.placed && seed && !reduced) {
      t.placed = true;
      const from = fromKey && fromKey !== activeKey ? rectOf(fromKey) : null;
      if (!from) {
        //! UGYANAZ A CELLA — A CSEPP A MÁR ÁLLÓ FOLYADÉKBA HULL. Helyről
        //! helyre lépve a folyadék eddig is a helyek celláján állt: nem tűnik
        //! el, csak megremeg, amikor a csepp beleolvad.
        left.jump(l);
        right.jump(r);
        seed.arrived.then(() => {
          if (press) animate(press, WOBBLE, { duration: 0.5, ease: "easeOut" });
        });
        return;
      }
      //! MÁS CELLÁBÓL — A RÉGI FOLYADÉK LESZAKAD, AZ ÚJ A CSEPPBŐL TERÜL. A
      //! folyadék nulla szélességgel vár a csepp alatt; a régi cellában közben
      //! elapad. Érkezéskor a csepp méretéből indul, és túllőve szétfut.
      const box = layerRef.current?.getBoundingClientRect();
      const c = seed.cx - (box?.left ?? 0);
      left.jump(c);
      right.jump(c);
      t.holding = true;
      const dir = Math.sign(
        order.indexOf(activeKey) - order.indexOf(fromKey ?? activeKey),
      );
      setRemnants([
        { id: ++remnantSeq, ...from, dir, blob: fromBlob ?? blobRef.current },
      ]);
      seed.arrived.then(() => {
        t.holding = false;
        const now = layerRef.current?.getBoundingClientRect();
        const at = seed.cx - (now?.left ?? box?.left ?? 0);
        left.jump(at - seed.bead.w / 2);
        right.jump(at + seed.bead.w / 2);
        animate(left, t.target.l, SPLASH);
        animate(right, t.target.r, SPLASH);
      });
      return;
    }

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
    seed,
    hoverKey,
    reduced,
    order,
    rectOf,
    left,
    right,
    rest,
    press,
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

//! ─── AZ ALANY: DIÁK · TANÁR · TEREM, ÉS AZ AKTÍV MAGA A VÁLASZTÓ ──────────
//! Eddig két alany volt egy kapcsolóban (az egész sáv EGY célpont volt, és
//! átfordított). A terem harmadikként kerül mellé, és ezzel a kapcsoló
//! rádiósorrá válik: a halvány ikonra koppintva átfolyik a folyadék, az
//! AKTÍV szerepre koppintva pedig a választó nyílik — az aktív szerep viseli
//! a kiválasztott alanyt („13C", „Kovács B.", „118"), tehát ő maga a kapu.
//*
//! A TEREM CSAK A „HÉT" CELLÁJÁBAN VAN. A „Ma" személy nézete: egy terem
//! napja nem kérdés, amit bárki reggel feltesz. Teremről a „Ma"-ra lépve a
//! legutóbb nézett osztály vagy tanár napja jön (a tárolt `identity`), és a
//! `/` átirányítása sem visz soha teremre (`lib/last-view.ts`).
//*
//! ÁTVÁLTÁSKOR A FOLYADÉK REMEG, AZ IKON GÖRDÜL — ugyanaz a nyelv, mint a
//! kétállású kapcsolóé volt: egy tárgy billent át, nem egy gomb gyulladt ki.
export type Role = Identity | "room";

const KIND_OF_ROLE: Record<Role, TimetableSubjectKind> = {
  class: "class",
  teacher: "teacher",
  room: "classroom",
};

//* A teljes névből a sor rövid alakja: „Kovács Bence" → „Kovács B.".
function shortName(name: string): string {
  const parts = name.trim().split(/\s+/);
  const lead = /^\d+[A-Za-z.]*$/.test(parts[0] ?? "") ? parts.slice(1) : parts;
  if (lead.length < 2) return lead[0] ?? name;
  return `${lead[0]} ${lead[1].charAt(0)}.`;
}

function subjectLabel(picker: SubjectPickerSpec): string | null {
  const s = picker.subjects.find((x) => x.short === picker.value);
  if (!s) return picker.value || null;
  if (picker.kind === "teacher") return shortName(s.name || s.short);
  if (picker.kind === "classroom") return roomLabel(s.name || s.short);
  return s.short;
}

type RoleSwitchProps = {
  role: Role;
  keys: readonly Role[];
  fromRole: Role | null;
  onToggle: (role: Role) => void;
  filterId: string;
  hidden: boolean;
  /** Az aktív szerep alanyválasztója — csak ha a lap a mostani szerepé. */
  picker: SubjectPickerSpec | null;
  quick: boolean;
  open: boolean;
  onOpen: () => void;
  pickId: string;
  triggerRef?: RefObject<HTMLButtonElement | null>;
  selectRef?: RefObject<HTMLSelectElement | null>;
};

const ROLL = {
  type: "spring",
  stiffness: 380,
  damping: 17,
  mass: 0.7,
} as const;

function RoleSwitch({
  role,
  keys,
  fromRole,
  onToggle,
  filterId,
  hidden,
  picker,
  quick,
  open,
  onOpen,
  pickId,
  triggerRef,
  selectRef,
}: RoleSwitchProps) {
  const reduced = useReducedMotion() ?? false;
  const itemsRef = useRef(new Map<string, HTMLElement>());
  const [hoverRole, setHoverRole] = useState<Role | null>(null);
  const press = useMotionValue(1);
  const roles = ROLES.filter((r) => keys.includes(r.id));
  const current = ROLES.find((r) => r.id === role) ?? ROLES[0];
  const previous = fromRole ? ROLES.find((r) => r.id === fromRole) : undefined;
  const label = picker ? subjectLabel(picker) : null;

  //* Hányszor fordult át ENNÉL a példánynál. A lapváltás utáni első rajz nem
  //* gördít (azt az átadás már elmondta), csak a helyben tett váltás.
  const [flips, setFlips] = useState(0);
  const seen = useRef(role);
  useEffect(() => {
    if (seen.current === role) return;
    seen.current = role;
    setFlips((n) => n + 1);
    if (!reduced) animate(press, WOBBLE, { duration: 0.55, ease: "easeOut" });
  }, [role, reduced, press]);

  return (
    <div
      role="group"
      aria-label="Kié az órarend"
      aria-hidden={hidden || undefined}
      inert={hidden}
      className="relative flex h-[26px] items-center rounded-full"
    >
      <LiquidLayer
        order={keys}
        activeKey={keys.includes(role) ? role : keys[0]}
        fromKey={fromRole && keys.includes(fromRole) ? fromRole : null}
        fromBlob={previous?.blob}
        hoverKey={hoverRole}
        itemsRef={itemsRef}
        filterId={filterId}
        blob={cn("transition-colors duration-500", current.blob)}
        shadow="drop-shadow(0 1px 1.5px oklch(0 0 0 / 0.28))"
        press={press}
        restExtra={0}
      />
      {roles.map(({ id, label: roleLabel, title, Icon, ink }) => {
        const selected = id === role;
        const withPicker = selected && picker !== null;
        const text = withPicker ? (label ?? roleLabel) : roleLabel;
        const native = withPicker && !quick && picker.subjects.length > 0;
        const canPick = withPicker && picker.subjects.length > 0;
        return (
          <span
            key={id}
            ref={(el) => {
              if (el) itemsRef.current.set(id, el);
              else itemsRef.current.delete(id);
            }}
            className="relative flex h-full items-center rounded-full"
          >
            <button
              ref={selected ? triggerRef : undefined}
              type="button"
              //* Nem rádió: az aktív gomb nem „bejelölt", hanem a választót
              //* nyitja — ezért `aria-current` jelöli, és `aria-expanded`.
              aria-current={selected || undefined}
              aria-label={withPicker ? `${title}: ${text} — választás` : title}
              aria-haspopup={canPick && quick ? "dialog" : undefined}
              aria-expanded={canPick && quick ? open : undefined}
              aria-controls={canPick && quick && open ? pickId : undefined}
              tabIndex={native ? -1 : undefined}
              title={
                selected
                  ? canPick
                    ? `${title} — koppints a választáshoz`
                    : title
                  : title
              }
              disabled={selected && withPicker && picker.disabled}
              onClick={() => {
                if (!selected) onToggle(id);
                else if (canPick && quick) onOpen();
              }}
              onPointerEnter={(e) =>
                e.pointerType === "mouse" && !selected && setHoverRole(id)
              }
              onPointerLeave={() => setHoverRole(null)}
              className={cn(
                "relative flex h-full cursor-pointer items-center rounded-full px-2 text-xs font-semibold tracking-[-0.005em] outline-none transition-colors duration-200 motion-reduce:transition-none",
                "focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-1 focus-visible:outline-ring",
                selected
                  ? ink
                  : hoverRole === id
                    ? "text-background"
                    : "text-background/55",
                selected && !canPick && "cursor-default",
              )}
            >
              <motion.span
                key={selected ? `${id}-${flips}` : id}
                aria-hidden
                className="flex"
                initial={
                  selected && flips > 0 && !reduced
                    ? { rotate: 200, scale: 0.4 }
                    : false
                }
                animate={{ rotate: 0, scale: 1 }}
                transition={ROLL}
              >
                <Icon className="size-4 shrink-0" strokeWidth={2.25} />
              </motion.span>
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
                {/*//! A SZEREP NEVE TELEFONON NEM NYÍLIK KI, AZ ALANY IGEN. A
                    //! „Diák" szót a mellette álló sor amúgy is kimondja; a
                    //! „13C" viszont maga a választó — nélküle a koppintásnak
                    //! nem látszana a célja. */}
                <span
                  data-liquid-extra
                  className={cn(
                    "flex w-max items-center gap-0.5 pl-1",
                    !withPicker && "max-sm:hidden",
                  )}
                >
                  <span
                    className={cn(
                      withPicker &&
                        "max-w-[4.75rem] truncate tabular-nums sm:max-w-[9rem]",
                    )}
                  >
                    {text}
                  </span>
                  {canPick && (
                    <ChevronDown
                      className={cn(
                        "size-3.5 shrink-0 transition-transform duration-200 motion-reduce:transition-none",
                        open && quick && "rotate-180",
                      )}
                      strokeWidth={2.5}
                    />
                  )}
                </span>
              </motion.span>
            </button>
            {/*//! HAGYOMÁNYOS MÓDBAN A VALÓDI `<select>` FEKSZIK AZ AKTÍV
                //! SZEREPEN, átlátszón: a koppintás a böngésző saját listáját
                //! nyitja (mobilon a kerék, asztalon a betűre ugrás), pontosan
                //! úgy, mint a gyorsválasztó előtt. */}
            {native && (
              <select
                ref={selectRef}
                aria-label={title}
                value={picker.value}
                disabled={picker.disabled}
                onChange={(e) => picker.onChange(e.target.value)}
                className="absolute inset-0 size-full cursor-pointer appearance-none rounded-full opacity-0"
              >
                {!picker.value && (
                  <option value="" disabled>
                    {roleLabel}
                  </option>
                )}
                {picker.subjects.map((s) => (
                  <option key={s.short} value={s.short}>
                    {s.name || s.short}
                  </option>
                ))}
              </select>
            )}
          </span>
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
  follow,
  className,
}: {
  label: ReactNode;
  rowRef: RefObject<HTMLDivElement | null>;
  left: MotionValue<number>;
  right: MotionValue<number>;
  liquid: boolean;
  /** Az elemet mozgató értékek (pl. a repülő ikoné) — a vágás ezekkel is újraszámol. */
  follow?: readonly MotionValue<number>[];
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
    const subs = [left, right, ...(follow ?? [])].map((mv) =>
      mv.on("change", update),
    );
    //* A sor átméreteződése (nyíló-csukódó alany) a feliratot is odébb tolja.
    const ro = new ResizeObserver(update);
    if (rowRef.current) ro.observe(rowRef.current);
    return () => {
      for (const unsub of subs) unsub();
      ro.disconnect();
    };
  }, [liquid, left, right, follow, rowRef, inkClip, baseClip]);

  return (
    <span ref={ref} className="relative flex">
      <motion.span
        className={cn("flex items-center text-foreground", className)}
        style={{ clipPath: baseClip }}
      >
        {label}
      </motion.span>
      <motion.span
        aria-hidden
        className="pointer-events-none absolute inset-0 flex items-center text-background"
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

//! ─── A SÁV-ALAK HELYEI ────────────────────────────────────────────────────
//! A testreszabó (`lib/menu-items.ts`) ugyanazokkal a jelekkel rejti a
//! helyeket, mint eddig a sáv pirulásorában. A rejtett hely csak akkor kap
//! cellát, ha épp ott állsz: a folyadéknak kell egy cella, ahová folyjon.
//*
//! `useSyncExternalStore` A `useHiddenMenu` ÁLLAPOTA HELYETT. Az a horog
//! effektből olvas, tehát lapváltás után az első képkocka az alapértelmezett
//! listát rajzolná, és a cellák egy képkockával később ugranának a helyükre —
//! épp az átfolyás közben. A pillanatkép szöveg, hogy értékként legyen stabil.
function useInlinePlaces(wide: boolean, current: PlaceId | undefined) {
  const hiddenKey = useSyncExternalStore(
    onPrefsChanged,
    () => (loadHiddenMenu() ?? DEFAULT_HIDDEN_MENU).join(","),
    () => DEFAULT_HIDDEN_MENU.join(","),
  );
  return useMemo(() => {
    if (!wide) return [];
    const hidden = new Set(hiddenKey.split(","));
    return PLACES.filter((p) => p.id === current || !hidden.has(p.id));
  }, [wide, hiddenKey, current]);
}

//! A REPÜLÉS RUGÓI. A két tengely KÜLÖN rugón fut, és a függőleges lazább: a
//! vízszintes hamarabb ér célba, a függőleges utána húzódik — az ikon így ívben
//! száll a buborék sorából a cellába, nem egyenes vonalon csúszik.
const FLY_X = { type: "spring", stiffness: 300, damping: 30, mass: 1 } as const;
const FLY_Y = { type: "spring", stiffness: 210, damping: 22, mass: 1 } as const;
const FLY_S = { type: "spring", stiffness: 260, damping: 20, mass: 1 } as const;

export function PillNav({
  floating = false,
  picker,
  className,
}: {
  floating?: boolean;
  /** A lap alanyválasztója — az aktív szerep viseli (lásd `RoleSwitch`). */
  picker?: SubjectPickerSpec;
  className?: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const reduced = useReducedMotion() ?? false;
  const identity = useIdentity(pathname);
  //! A TEREM SZEREP CSAK AZ ÚTVONALBÓL JÖN, SOSEM A TÁROLÓBÓL. A tárolt
  //! `identity` személy marad (osztály vagy tanár): ebből tudja a „Ma" és a
  //! `/` átirányítása, kinek a napját mutassa — teremre egyik sem visz.
  const role: Role = pathname === "/terem" ? "room" : identity;
  const quick = useQuickPick();
  const rolePicker =
    picker && KIND_OF_ROLE[role] === picker.kind ? picker : null;
  const place = placeOf(pathname);
  const wide = useWideChrome();
  const inline = useInlinePlaces(wide, place?.id);
  //* Sáv-alakban csak akkor marad iránytű, ha van rejtett hely — a buborék
  //* ott a rejtettek egyetlen útja.
  const overflow = !wide || inline.length < PLACES.length;
  const activeView: NavKey | null =
    wide && place ? place.id : (VIEW_OF[pathname] ?? null);
  const inlineKey = inline.map((p) => p.id).join(",");
  // biome-ignore lint/correctness/useExhaustiveDependencies: a kulcs a jel
  const order = useMemo<readonly NavKey[]>(
    () => [
      ...VIEWS.map((v) => v.id),
      ...inline.map((p) => p.id),
      ...(overflow ? (["places"] as const) : []),
    ],
    [inlineKey, overflow],
  );
  const [hoverView, setHoverView] = useState<NavKey | null>(null);
  const itemsRef = useRef(new Map<string, HTMLElement>());
  const press = useMotionValue(1);
  const liquidLeft = useMotionValue(0);
  const liquidRight = useMotionValue(0);
  const navRef = useRef<HTMLElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const iconRef = useRef<HTMLSpanElement>(null);
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const filterId = `pn-goo-${uid}`;
  const panelId = `pn-places-${uid}`;
  const [placesOpen, setPlacesOpen] = useState(false);

  const [from] = useState(readHandoff);
  const fromView =
    from?.view && activeView && from.view !== activeView ? from.view : null;
  const fromRole = from && from.role !== role ? from.role : null;

  useLayoutEffect(() => {
    handoff = { view: activeView, role };
  }, [activeView, role]);
  useLayoutEffect(() => {
    const el = navRef.current;
    if (el) return registerPillNav(el);
  }, []);
  useLayoutEffect(() => {
    liveNavs++;
    return () => {
      liveNavs--;
      lastUnmountAt = performance.now();
    };
  }, []);

  //! ─── A HELY IKONJA A BUBORÉKBÓL REPÜL BE ───────────────────────────────
  //! Az új lap váltója a buborék sorának ikonját ott találja, ahol a koppintás
  //! hagyta (`launchFlight`), és a saját cellájába repíti. A FLIP a kész
  //! elrendezésből mér: a cella közben nyílhat vagy csukódhat, a transzformáció
  //! az elrendezéshez képest fut, tehát a végén pontosan a helyén ül.
  const flyX = useMotionValue(0);
  const flyY = useMotionValue(0);
  const flyScale = useMotionValue(1);
  const [flyFollow] = useState(() => [flyX, flyY] as const);
  //! SÁV-ALAKBAN NINCS REPÜLÉS ÉS KIÖNTÉS. Mindkettő az iránytű cellájába
  //! érkezik, a sávban viszont a hely a SAJÁT cellájában áll — a csepp egy
  //! cellába hullana, a folyadék egy másikban terülne szét. A sávban amúgy is
  //! az áradás visz át (`flood.ts`); a ki nem vett csepp a saját idejében
  //! felszívódik (`pour.ts`).
  const [incoming] = useState(() => (wide ? null : readFlight(place?.id)));
  const [pour] = useState(() => (wide ? null : readPour(place?.id)));
  //* Amíg a kiöntött csepp úton van, az ikon a HEGYÉN utazik (lásd `pour.ts`)
  //* — a cella saját ikonja addig nem látszik, különben kettő lenne.
  const flyOpacity = useMotionValue(pour ? 0 : 1);
  //! A CSEPPET NEM A TAKARÍTÁS VESZI ÁT. Fejlesztéskor a Strict Mode minden
  //! effektet fel-le-fel szerel; ha a takarítás azonnal elnyelte volna a
  //! cseppet, az a sugár közepén eltűnt, és az ikon be se repült. Az elnyelés
  //! ezért egy ütemmel később jön, és az újra felálló effekt visszavonja.
  const absorbLater = useRef<number | undefined>(undefined);
  useLayoutEffect(() => {
    const el = iconRef.current;
    if (!pour || !el) return;
    window.clearTimeout(absorbLater.current);
    let cancelled = false;
    let runs: { stop: () => void }[] = [];
    flyOpacity.jump(0);
    //* A csepp az ikon HELYÉRE fut, nem a régi cella közepére: a cella itt
    //* szétnyílik, az ikon közben odébb kerül. A mért doboz az elrendezésé —
    //* érkezésig a repülés eltolása nulla.
    pour.follow(() => {
      const r = el.getBoundingClientRect();
      if (r.width === 0) return null;
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    pour.arrived.then(() => {
      if (cancelled) return;
      pour.absorb();
      flyOpacity.jump(1);
      const r = el.getBoundingClientRect();
      if (r.width === 0) return;
      //* A kör közepéről veszi át a repülő ikont, ugyanakkorán — a csepp az
      //* ikon helyére érkezett, tehát az eltolás itt jellemzően nulla.
      flyX.jump(pour.cx - (r.left + r.width / 2));
      flyY.jump(pour.cy - (r.top + r.height / 2));
      runs = [animate(flyX, 0, FLY_X), animate(flyY, 0, FLY_Y)];
    });
    return () => {
      cancelled = true;
      for (const run of runs) run.stop();
      pour.follow(null);
      absorbLater.current = window.setTimeout(pour.absorb, 0);
      flyOpacity.jump(1);
      flyX.jump(0);
      flyY.jump(0);
      flyScale.jump(1);
    };
  }, [pour, flyX, flyY, flyScale, flyOpacity]);
  useLayoutEffect(() => {
    const el = iconRef.current;
    if (!incoming || pour || reduced || !el) return;
    const r = el.getBoundingClientRect();
    if (r.width === 0) return;
    flyX.jump(incoming.x - (r.left + r.width / 2));
    flyY.jump(incoming.y - (r.top + r.height / 2));
    flyScale.jump(Math.max(1, incoming.size / r.width) * 1.35);
    const runs = [
      animate(flyX, 0, FLY_X),
      animate(flyY, 0, FLY_Y),
      animate(flyScale, 1, FLY_S),
    ];
    return () => {
      for (const run of runs) run.stop();
      flyX.jump(0);
      flyY.jump(0);
      flyScale.jump(1);
    };
  }, [incoming, pour, reduced, flyX, flyY, flyScale]);

  //* Lapváltáskor a buborék magától becsukódik — a lap, amiről szólt, elment.
  // biome-ignore lint/correctness/useExhaustiveDependencies: az útvonal a jel
  useEffect(() => setPlacesOpen(false), [pathname]);

  const closePlaces = useCallback((opts?: { refocus?: boolean }) => {
    setPlacesOpen(false);
    if (opts?.refocus) triggerRef.current?.focus();
  }, []);

  //! A „HÉT" KÉT KÜLÖNBÖZŐ LAP (`weekRouteFor`), A „MA" EGY.
  const weekHref = weekRouteFor(identity);

  const pickRole = (next: Role) => {
    if (next === role) return;
    setPickOpen(false);
    if (next === "room") {
      router.push("/terem");
      return;
    }
    saveIdentity(next);
    //! CSAK A HETES RÁCS UGRIK ÁT. A „Ma" EGY útvonal mindkét alanynak: ott a
    //! lap a `notifyPrefsChanged` jelére épül újra a helyén. A terem rácsa
    //! (`/terem`) is hetes: onnan a személyre váltás a személy hetére visz.
    if (activeView === "week") router.push(weekRouteFor(next));
  };

  //! ─── A GYORSVÁLASZTÓ ──────────────────────────────────────────────────
  const [pickOpen, setPickOpen] = useState(false);
  const [toast, setToast] = useState(false);
  const pickTriggerRef = useRef<HTMLButtonElement>(null);
  const nativeRef = useRef<HTMLSelectElement>(null);
  const pickId = `pn-pick-${uid}`;
  // biome-ignore lint/correctness/useExhaustiveDependencies: az útvonal a jel
  useEffect(() => setPickOpen(false), [pathname]);
  useEffect(() => {
    if (!pickOpen) return;
    //* Kívülre koppintva becsukódik; a váltón belüli koppintást a saját
    //* gombja intézi (újra az aktív szerep: becsuk, másik szerep: átvált).
    const onDown = (e: globalThis.PointerEvent) => {
      if (navRef.current?.contains(e.target as Node)) return;
      setPickOpen(false);
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [pickOpen]);
  const closePick = useCallback((opts?: { refocus?: boolean }) => {
    setPickOpen(false);
    if (opts?.refocus) pickTriggerRef.current?.focus();
  }, []);
  const goLegacy = () => {
    setPickOpen(false);
    saveQuickPick(false);
    setToast(true);
    //! A NATÍV LISTA RÖGTÖN NYÍLIK, ahol a böngésző engedi (`showPicker`);
    //! máshol a fókusz kerül rá, és a következő koppintás nyitja. A `<select>`
    //! a beállítás átváltása UTÁN születik meg, ezért egy képkockát várunk.
    requestAnimationFrame(() => {
      const el = nativeRef.current;
      if (!el) return;
      try {
        el.showPicker();
      } catch {
        el.focus();
      }
    });
  };
  const hideToast = useCallback(() => setToast(false), []);

  const squash = (e: PointerEvent) => {
    if (reduced || e.button !== 0) return;
    //* A buborékban tett koppintás nem a tok megnyomása.
    if ((e.target as Element).closest(`#${panelId}, #${pickId}`)) return;
    animate(press, 0.94, PRESS);
  };
  const release = () => {
    if (press.get() === 1) return;
    animate(press, 1, RELEASE);
  };

  //! A FOLYADÉK ELÖNTI A LAPOT, ÉS CSAK VÍZ ALATT VÁLT (lásd `flood.ts`). Új
  //! lapra nyitás és módosított kattintás marad a böngészőé. A nézetek és a
  //! sáv-alak helyei ugyanígy indulnak: mind egy cella a váltóban.
  const floodFrom = (
    e: ReactMouseEvent<HTMLAnchorElement>,
    active: boolean,
    label: string,
  ) => {
    const nav = navRef.current;
    const cell = e.currentTarget.parentElement;
    if (
      active ||
      !nav ||
      !cell ||
      e.button !== 0 ||
      e.metaKey ||
      e.ctrlKey ||
      e.shiftKey ||
      e.altKey
    )
      return;
    const href = e.currentTarget.getAttribute("href");
    if (
      href &&
      launchFlood({ nav, cell, label, navigate: () => router.push(href) })
    )
      e.preventDefault();
  };

  //* A szöveg halványítása ugyanaz minden inaktív cellán.
  const idleInk = (active: boolean) =>
    !active &&
    (floating
      ? "opacity-55 group-hover:opacity-75"
      : "opacity-70 group-hover:opacity-100 dark:opacity-55 dark:group-hover:opacity-75");

  const placesActive = activeView === "places";
  const placesWasActive = fromView ? fromView === "places" : placesActive;
  //* Sáv-alakban a hely a saját cellájában áll — az iránytű ott csak a
  //* rejtett helyekhez vezet, tehát iránytű marad.
  const PlaceIcon = (!wide && place?.Icon) || Compass;

  return (
    <nav
      ref={navRef}
      data-pill-nav
      data-floating={floating || undefined}
      aria-label="Nézetek"
      onPointerDown={squash}
      onPointerUp={release}
      onPointerCancel={release}
      onPointerLeave={release}
      className={cn(
        //! `z-20`: A BUBORÉK A VÁLTÓ FÁJÁBAN ÉL, tehát a váltó rétegével
        //! együtt fedi a sort követő testvéreket — a sáv műveletsorát és a
        //! napsávot. Enélkül azok a buborék FÖLÉ rajzolódtak.
        "relative isolate z-20 inline-flex h-10 shrink-0 touch-manipulation select-none items-stretch rounded-full p-1 [-webkit-tap-highlight-color:transparent]",
        //! NINCS KÖRVONAL. A tok egy hajszálvonallal keretezve „kiemelt"
        //! gombbá vált a sorban, és a belőle kicsorduló nyakat is elvágta:
        //! a folyadék a vonalon át nem olvadhat a tokba. A tok a színével
        //! válik el, nem egy kerettel.
        floating ? "bg-background" : "bg-card",
        className,
      )}
    >
      {/*//! A TOKENEK FORDÍTÓJA (lásd `flood.ts` és `globals.css`). Doboza
          //! nincs (`contents`), csak a két színt cseréli meg az áradás alatt. */}
      <div data-pn-ink className="contents">
        <GooFilter id={filterId} />
        {activeView && (
          //! ALAKVÁLTÁSKOR A FOLYADÉK ÚJRA ÁLL FEL, NEM ÁTFOLYIK. A hidratálás
          //! után (és ablakméretezéskor) a cellák sora kicserélődik — a régi
          //! cella helyéről átfolyni egy már nem létező cellából folyna.
          <div
            key={wide ? "wide" : "narrow"}
            className="pointer-events-none absolute inset-1"
          >
            <LiquidLayer
              order={order}
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
              seed={pour}
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
                data-pn-cell={id}
                data-active={active || undefined}
                className="relative flex items-center"
              >
                <Link
                  href={id === "today" ? "/ma" : weekHref}
                  title={title}
                  aria-current={active ? "page" : undefined}
                  onClick={(e) => floodFrom(e, active, label)}
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
                      idleInk(active),
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
                    <RoleSwitch
                      role={role}
                      keys={ROLE_KEYS_OF[id]}
                      fromRole={fromRole}
                      onToggle={pickRole}
                      filterId={filterId}
                      hidden={!active}
                      picker={active ? rolePicker : null}
                      quick={quick}
                      open={pickOpen}
                      onOpen={() => {
                        setPlacesOpen(false);
                        setPickOpen((v) => !v);
                      }}
                      pickId={pickId}
                      triggerRef={active ? pickTriggerRef : undefined}
                      selectRef={active ? nativeRef : undefined}
                    />
                  </div>
                </motion.div>
              </div>
            );
          })}

          {/*//! ─── SÁV-ALAKBAN A HELYEK SAJÁT CELLÁT KAPNAK ─────────────────────
            //! Asztalon az eszköztár második sora eddig MÁSODSZOR is kirakta
            //! a helyeket, pirulaként — ugyanaz a hat hivatkozás két helyen, a
            //! váltóban egy buborék mögött, alatta ikonsorként. Most egy helyen
            //! állnak: a váltóban, ikonnyi cellákként, és a folyadék egyenesen
            //! arra folyik, ahol állsz. A név a buborékban áll (`RailTips`,
            //! gyorsbillentyűvel), az aktív cellán kiírva.
            //*
            //! TELEFONON MARAD AZ IRÁNYTŰ. Hat ikon 375 px-en a sor elől venné
            //! el a helyet — ott a buborék a jó válasz (lásd lentebb).
            //*
            //! A TESTRESZABÓ ITT A VÁLTÓT RÖVIDÍTI. Ami rejtett, nem kap cellát
            //! (kivéve, ha épp ott állsz), és az iránytű visszajön a végére: a
            //! buborék a rejtett helyek útja marad. */}
          {inline.map((p) => {
            const active = p.id === activeView;
            const wasActive = fromView ? p.id === fromView : active;
            return (
              <div
                key={p.id}
                ref={(el) => {
                  if (el) itemsRef.current.set(p.id, el);
                  else itemsRef.current.delete(p.id);
                }}
                data-pn-cell={p.id}
                data-active={active || undefined}
                className="relative flex items-center"
              >
                <Link
                  href={p.href}
                  aria-label={p.label}
                  aria-current={active ? "page" : undefined}
                  data-tip={p.label}
                  data-tip-hint={p.hint}
                  data-key={p.hotkey}
                  onClick={(e) => floodFrom(e, active, p.label)}
                  onPointerEnter={(e) =>
                    e.pointerType === "mouse" && setHoverView(p.id)
                  }
                  onPointerLeave={() => setHoverView(null)}
                  className={cn(
                    "group relative flex h-full items-center rounded-full pr-1 pl-2.5 text-sm font-semibold tracking-[-0.01em] outline-none",
                    "focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring",
                    active && "cursor-default",
                  )}
                >
                  <InkLabel
                    label={
                      <p.Icon
                        aria-hidden
                        className="size-4"
                        strokeWidth={2.25}
                      />
                    }
                    rowRef={rowRef}
                    left={liquidLeft}
                    right={liquidRight}
                    liquid
                    className={cn(
                      "transition-opacity duration-200 motion-reduce:transition-none",
                      idleInk(active),
                    )}
                  />
                  <motion.span
                    aria-hidden
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
                    <span data-liquid-extra className="block w-max min-w-1.5">
                      <span className="block px-1.5">
                        <InkLabel
                          label={p.label}
                          rowRef={rowRef}
                          left={liquidLeft}
                          right={liquidRight}
                          liquid={active}
                        />
                      </span>
                    </span>
                  </motion.span>
                </Link>
              </div>
            );
          })}

          {/*//! ─── A HELYEK CELLÁJA ─────────────────────────────────────────
            //! Egy gomb, nem négy. Inaktívan egy iránytű: „innen máshová is
            //! mehetsz". Ha egy helyen állsz, a folyadék ide folyik át, az
            //! iránytű helyén a hely SAJÁT ikonja áll, és `sm`-től a neve is —
            //! telefonon a mellette álló sor már kimondja („Ügyelet · ma").
            //*
            //! A GOMB NYITVA IS GOMB MARAD. Újra megnyomva becsukja a
            //! buborékot; a folyadék közben nem mozdul, mert a hely, ahol
            //! állsz, nem változott. */}
          {overflow && (
            <div
              ref={(el) => {
                if (el) itemsRef.current.set("places", el);
                else itemsRef.current.delete("places");
              }}
              data-pn-cell="places"
              data-active={placesActive || undefined}
              className="relative flex items-center"
            >
              <button
                ref={triggerRef}
                type="button"
                aria-expanded={placesOpen}
                aria-controls={placesOpen ? panelId : undefined}
                aria-label={
                  place && !wide ? `Helyek — most: ${place.label}` : "Helyek"
                }
                title={
                  wide
                    ? "A többi hely (a testreszabóban elrejtettek)"
                    : "Ügyelet, teremkereső, kivetítés, nyitólap"
                }
                onClick={() => {
                  setPickOpen(false);
                  setPlacesOpen((v) => !v);
                }}
                onPointerEnter={(e) =>
                  e.pointerType === "mouse" && setHoverView("places")
                }
                onPointerLeave={() => setHoverView(null)}
                className={cn(
                  "group relative flex h-full cursor-pointer items-center rounded-full pr-1 pl-2.5 text-sm font-semibold tracking-[-0.01em] outline-none sm:pl-3",
                  "focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring",
                )}
              >
                <motion.span
                  ref={iconRef}
                  className="relative flex"
                  style={{
                    x: flyX,
                    y: flyY,
                    scale: flyScale,
                    opacity: flyOpacity,
                  }}
                >
                  <InkLabel
                    label={
                      <motion.span
                        key={place?.id ?? "compass"}
                        className="flex"
                        initial={false}
                        animate={{
                          rotate: placesOpen && !placesActive ? 135 : 0,
                        }}
                        transition={reduced ? INSTANT : ROLL}
                      >
                        <PlaceIcon className="size-4" strokeWidth={2.25} />
                      </motion.span>
                    }
                    rowRef={rowRef}
                    left={liquidLeft}
                    right={liquidRight}
                    liquid={Boolean(activeView)}
                    follow={flyFollow}
                    className={cn(
                      "transition-opacity duration-200 motion-reduce:transition-none",
                      idleInk(placesActive || placesOpen),
                    )}
                  />
                </motion.span>
                <motion.span
                  initial={
                    fromView
                      ? {
                          width: placesWasActive ? "auto" : 6,
                          opacity: placesWasActive ? 1 : 0,
                        }
                      : false
                  }
                  animate={{
                    width: placesActive ? "auto" : 6,
                    opacity: placesActive ? 1 : 0,
                  }}
                  transition={
                    reduced
                      ? INSTANT
                      : {
                          width: COLLAPSE,
                          opacity: placesActive
                            ? { duration: 0.22, delay: 0.14 }
                            : { duration: 0.1 },
                        }
                  }
                  className="flex h-full items-center [overflow-x:clip]"
                >
                  <span data-liquid-extra className="block w-max min-w-1.5">
                    <span className="block pr-1.5 pl-1.5 max-sm:hidden">
                      <InkLabel
                        label={place?.label ?? ""}
                        rowRef={rowRef}
                        left={liquidLeft}
                        right={liquidRight}
                        liquid={placesActive}
                      />
                    </span>
                  </span>
                </motion.span>
              </button>
            </div>
          )}
        </div>
      </div>

      {wide && <RailTips railRef={navRef} />}
      <PlacesPanel
        open={placesOpen}
        onClose={closePlaces}
        navRef={navRef}
        triggerRef={triggerRef}
        floating={floating}
        current={place}
        panelId={panelId}
      />
      {rolePicker && (
        <SubjectQuickPick
          spec={rolePicker}
          open={pickOpen && quick}
          onClose={closePick}
          onLegacy={goLegacy}
          panelId={pickId}
        />
      )}
      <QuickPickToast
        open={toast}
        onUndo={() => {
          saveQuickPick(true);
          setToast(false);
        }}
        onDismiss={hideToast}
      />
    </nav>
  );
}
