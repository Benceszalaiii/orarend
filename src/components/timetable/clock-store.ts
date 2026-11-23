import { dateToKey } from "./shared";

//! ═══════════════════════════════════════════════════════════════════════════
//! EGY ÓRA AZ EGÉSZ LAPNAK — ÉS ÉBREDÉSKOR AZONNAL A VALÓDI IDŐT MUTATJA
//! ═══════════════════════════════════════════════════════════════════════════
//! A „most" vonal korábban saját `setInterval`-ból élt (a heti rács 60
//! másodpercenként, a napi nézet másodpercenként), és ez két helyen hazudott:
//!
//! 1. ALVÁS UTÁN. Lecsukott laptop, zsebben elalvó telefon, a böngésző által
//!    befagyasztott lap: az időzítő ilyenkor nem fut, és ébredés után sem
//!    azonnal sül el — a heti rácson akár egy teljes percig a régi helyén állt
//!    a piros vonal. Ha a lap közben LÁTHATÓ maradt (alvó gép, nyitott
//!    ablak), `visibilitychange` sem jön, tehát a CSS-animációs sávok horgonya
//!    is az elalvás pillanatában ragadt.
//! 2. ÉJFÉL UTÁN. A „ma" egyszer dőlt el, a lap megnyitásakor — az éjszakán át
//!    nyitva hagyott lap reggel a tegnapot tekintette mainak.
//!
//! EZÉRT EGY KÖZÖS TÁR. Egyetlen ütem fut (másodperc-határra igazítva), és
//! minden olyan jelre AZONNAL újraolvas, ami ébredést jelenthet: láthatóvá
//! válás, `pageshow` (bfcache-ből visszatérő lap), `focus`, `online`, és az
//! is, ha két ütés közt a vártnál jóval több idő telt el (alvás, fagyasztás).
//! Az utóbbi esetekben az `epoch` is lép, így a horgonyos sávok újraépülnek.
//! ═══════════════════════════════════════════════════════════════════════════

export type Clock = {
  /** Éjfél óta eltelt PERC, tört része a másodperc. */
  min: number;
  /** Éjfél óta eltelt másodperc. */
  sec: number;
  /** A helyi nap kulcsa (`YYYY-MM-DD`) — éjfélkor lép. */
  day: string;
};

export type ClockSnapshot = {
  clock: Clock;
  /** Ébredéskor / láthatóvá váláskor lép — a horgonyos elemek kulcsa. */
  epoch: number;
};

type Listener = () => void;

export type ClockDeps = {
  now: () => Date;
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (id: unknown) => void;
  /** `visibilitychange` forrása és a láthatóság olvasója. */
  doc?: EventTarget & { visibilityState?: string };
  /** `pageshow`, `focus`, `online` forrása. */
  win?: EventTarget;
};

const TICK_MS = 1000;
//! UGRÁS = ALVÁS. Ha két ütés közt ennyivel több telt el a vártnál, a gép
//! aludt vagy a lap be volt fagyasztva. Csak LÁTHATÓ lapon számít: rejtett
//! lapon a böngésző percenként egyszer engedi futni az időzítőt, és az nem
//! ébredés, csak takarékosság — ott a láthatóvá válás lépteti az `epoch`-ot.
const JUMP_MS = 5000;

export function isClockJump(
  prevWall: number,
  wall: number,
  visible: boolean,
): boolean {
  if (!visible || prevWall === 0) return false;
  //* Visszafelé is ugorhat (kézi óraállítás, időzóna): az is új horgony.
  return wall - prevWall > TICK_MS + JUMP_MS || wall < prevWall - TICK_MS;
}

//* A következő másodperc-határig hátralévő idő, egy hajszálnyi ráhagyással —
//* így az ütés a határ UTÁN sül el, és a visszaszámláló nem ugrik kettőt.
export function msToNextSecond(wall: number): number {
  return TICK_MS - (wall % TICK_MS) + 5;
}

export function createClockStore(deps: ClockDeps) {
  let snap: ClockSnapshot | null = null;
  let lastWall = 0;
  let timer: unknown = null;
  const listeners = new Set<Listener>();

  const visible = () =>
    !deps.doc?.visibilityState || deps.doc.visibilityState === "visible";

  //* Újraolvassa az órát; csak akkor cserél pillanatképet (és szól), ha
  //* tényleg változott valami — a `useSyncExternalStore` stabil értéket kér.
  const read = (bump: boolean): boolean => {
    const d = deps.now();
    const wall = d.getTime();
    const jumped = isClockJump(lastWall, wall, visible());
    lastWall = wall;
    const sec = d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds();
    const day = dateToKey(d);
    const epoch = (snap?.epoch ?? 0) + (bump || jumped ? 1 : 0);
    if (
      snap &&
      snap.clock.sec === sec &&
      snap.clock.day === day &&
      snap.epoch === epoch
    ) {
      return false;
    }
    snap = { clock: { min: sec / 60, sec, day }, epoch };
    return true;
  };

  const emit = () => {
    for (const l of listeners) l();
  };

  const schedule = () => {
    if (timer !== null) deps.clearTimeout(timer);
    timer = deps.setTimeout(() => {
      timer = null;
      if (read(false)) emit();
      schedule();
    }, msToNextSecond(deps.now().getTime()));
  };

  //* Ébredésre utaló jel: azonnal újraolvas, és az ütemet is újraigazítja
  //* (a befagyott időzítőre nem várunk).
  const resync = (bump: boolean) => {
    if (read(bump)) emit();
    if (listeners.size > 0) schedule();
  };

  const onVisibility = () => {
    if (visible()) resync(true);
  };
  const onPageShow = (event: Event) => {
    //* bfcache-ből visszatérő lap: a JS állapota a távozás pillanatából való.
    resync((event as PageTransitionEvent).persisted === true);
  };
  const onWake = () => resync(false);

  const start = () => {
    lastWall = 0;
    read(false);
    deps.doc?.addEventListener("visibilitychange", onVisibility);
    deps.win?.addEventListener("pageshow", onPageShow);
    deps.win?.addEventListener("focus", onWake);
    deps.win?.addEventListener("online", onWake);
    schedule();
  };

  const stop = () => {
    if (timer !== null) deps.clearTimeout(timer);
    timer = null;
    deps.doc?.removeEventListener("visibilitychange", onVisibility);
    deps.win?.removeEventListener("pageshow", onPageShow);
    deps.win?.removeEventListener("focus", onWake);
    deps.win?.removeEventListener("online", onWake);
  };

  return {
    subscribe(listener: Listener): () => void {
      listeners.add(listener);
      if (listeners.size === 1) start();
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) stop();
      };
    },
    //! ÁLLÓ TÁR IS FRISSET AD. Ha senki nem figyel (kliensoldali navigáció
    //! után az első rajzolás még feliratkozás ELŐTT kérdez), a régi kép egy
    //! másik lap idejéből való lenne — ilyenkor itt olvasunk újra.
    getSnapshot(): ClockSnapshot | null {
      if (listeners.size === 0) read(false);
      return snap;
    },
  };
}
