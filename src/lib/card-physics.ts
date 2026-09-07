//* ---------------------------------------------------------------------------
//* KÁRTYAFIZIKA — ami kiesik a rácsból
//* ---------------------------------------------------------------------------
//! MIÉRT SAJÁT MEGOLDÓ, ÉS NEM EGY KÖNYVTÁR. A feladat egyetlen jelenet: pár
//! tucat téglalap kiszakad a helyéről, egymásnak ütközve lezuhan, és kihullik a
//! kép aljából. Ehhez egy komoly fizikai motor (matter.js, rapier) 40–300 kB-ot
//! kérne — több, mint az egész lap, amin megjelenik. Ez a fájl ~4 kB, és
//! pontosan azt a három dolgot tudja, amire szükség van: gravitáció, oldalfal,
//! doboz-doboz ütközés.
//*
//! NINCS PADLÓ, ÉS EZ A LÉNYEG. A kártyák nem gyűlnek kupacba a rács alján:
//! kiesnek a képből, és eltűnnek. Egy kupac eltakarná azt, ami miatt az egész
//! jelenet van — a 404-et —, és közben azt sugallná, hogy az órák „valahol
//! ottmaradtak". Nem maradtak ott: ez a lap pont arról szól, hogy nincsenek.
//*
//! A FORGATOTT TÉGLALAPOT TENGELYPÁRHUZAMOS DOBOZ HELYETTESÍTI. Az ütközéshez
//! nem a valódi forgatott alakzatot használjuk (SAT), hanem a köré írt
//! tengelypárhuzamos dobozt (`extents`). Zuhanás közben ez a különbség nem
//! látszik — a lapok néhány fokkal odébb lökik egymást, mint egy pontos
//! megoldónál —, cserébe az egész ütközésvizsgálat két kivonás és egy előjel.
//*
//! A LÉPÉS FIX IDŐVEL MEGY (`DT`), a hívó pedig valós eltelt időt ad át. Így a
//! szimuláció ugyanazt adja 60, 120 és 144 Hz-en; a magvetett véletlennel
//! együtt a jelenet minden betöltéskor ugyanaz.

/** Egy szabadeséses téglalap. A mértékegység px és másodperc. */
export type PhysicsBody = {
  id: string;
  /** Fél szélesség / fél magasság — a középpontból mérve. */
  hw: number;
  hh: number;
  /** Középpont. */
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Elfordulás radiánban, és a szögsebesség. */
  a: number;
  va: number;
  /** Ennyi másodperc múlva szakad ki a rácsból; addig mozdulatlan. */
  delay: number;
  released: boolean;
  /** Kihullott a kép aljából: nem számol, nem rajzolódik, nem ütközik. */
  gone: boolean;
};

export type PhysicsWorld = {
  /** A doboz, amiben esnek. A két fal `0` és `w`; alul nincs semmi. */
  w: number;
  h: number;
  /** A jelenet kora másodpercben — ehhez képest szólnak a `delay`-ek. */
  t: number;
  /** A fix lépéshez maradt idő. */
  acc: number;
  bodies: PhysicsBody[];
};

//! AZ ÉRTÉKEK NEM A VALÓSÁGBÓL JÖNNEK, HANEM A NÉZÉSBŐL. A 2400 px/s² nagyjából
//! két és félszeres földi gravitáció: egy valósághű esés ekkora dobozban
//! lomhának látszana, mert a szem a kártya MÉRETÉHEZ méri a sebességet, és egy
//! 70 px-es kártya a szem számára kicsi tárgy — a kicsi tárgy pedig gyorsan
//! esik. Följebb véve viszont már nem látszana a bukfenc.
const GRAVITY = 2400;
/** Egymásnak ütődő papírlapok: alig pattannak. */
const RESTITUTION = 0.24;
/** Érintkezéskor az érintő irányú sebesség és a pörgés csillapítása. */
const FRICTION = 0.72;
const AIR = 0.9992;
const ANG_AIR = 0.994;
const MAX_VA = 8;
/** A fix lépésköz. 120 Hz: elég sűrű, hogy a doboz ne essen át a másikon. */
const DT = 1 / 120;
//* Egy képkockán legfeljebb ennyi lépés fut le — háttérbe tett fül után a
//* felhalmozódott idő nem robbanthatja fel a hurkot.
const MAX_STEPS = 8;

/** Determinisztikus véletlen: ugyanaz a mag mindig ugyanazt a jelenetet adja. */
export function seededRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createWorld(w: number, h: number): PhysicsWorld {
  return { w, h, t: 0, acc: 0, bodies: [] };
}

export function addBody(
  world: PhysicsWorld,
  body: Pick<PhysicsBody, "id" | "x" | "y" | "hw" | "hh" | "delay">,
): PhysicsBody {
  const full: PhysicsBody = {
    ...body,
    vx: 0,
    vy: 0,
    a: 0,
    va: 0,
    released: false,
    gone: false,
  };
  world.bodies.push(full);
  return full;
}

//! A FORGATOTT TÉGLALAP KÖRÉ ÍRT DOBOZ. Minden ütközés és falkorlát ezt
//! használja; ez a függvény az egyetlen hely, ahol az elfordulás egyáltalán
//! számít a fizikában.
function extents(b: PhysicsBody): { ex: number; ey: number } {
  const c = Math.abs(Math.cos(b.a));
  const s = Math.abs(Math.sin(b.a));
  return { ex: b.hw * c + b.hh * s, ey: b.hw * s + b.hh * c };
}

/**
 * A kiszakadás pillanata. Nem csak „elengedjük": egy kis felfelé lökés és egy
 * kis pörgés kell hozzá, különben a kártya úgy indul, mintha alóla húznák ki a
 * rácsot — a kiszakadásnak FELFELÉ van egy mozdulata, azt utánozza a `-vy`.
 */
function release(b: PhysicsBody, rnd: () => number): void {
  b.released = true;
  b.vx = (rnd() - 0.5) * 170;
  b.vy = -70 - rnd() * 130;
  b.va = (rnd() - 0.5) * 5.5;
}

function integrate(b: PhysicsBody, dt: number): void {
  b.vy += GRAVITY * dt;
  b.vx *= AIR;
  b.vy *= AIR;
  b.va *= ANG_AIR;
  if (b.va > MAX_VA) b.va = MAX_VA;
  else if (b.va < -MAX_VA) b.va = -MAX_VA;
  b.x += b.vx * dt;
  b.y += b.vy * dt;
  b.a += b.va * dt;
}

//! CSAK OLDALFAL VAN. A rács két széle megtartja a kártyákat, hogy a hullás
//! végig a hét fölött történjen és ne szökjön ki oldalra a lapra; alul viszont
//! nyitva van a doboz.
function solveWalls(world: PhysicsWorld, b: PhysicsBody): void {
  const { ex } = extents(b);
  if (b.x - ex < 0) {
    b.x = ex;
    if (b.vx < 0) {
      b.vx = -b.vx * RESTITUTION;
      b.vy *= FRICTION;
      b.va *= FRICTION;
    }
  } else if (b.x + ex > world.w) {
    b.x = world.w - ex;
    if (b.vx > 0) {
      b.vx = -b.vx * RESTITUTION;
      b.vy *= FRICTION;
      b.va *= FRICTION;
    }
  }
}

//! PÁROS ÜTKÖZÉS, A LEGKISEBB ÁTFEDÉS TENGELYÉN. Két doboz szétnyomása mindig a
//! SEKÉLYEBB irányban történik — így az egymásra érkező kártyák megtorlódnak és
//! egymást forgatják meg, ahelyett hogy egymáson átcsúsznának.
function solvePair(a: PhysicsBody, b: PhysicsBody): void {
  const ea = extents(a);
  const eb = extents(b);
  const dx = b.x - a.x;
  const px = ea.ex + eb.ex - Math.abs(dx);
  if (px <= 0) return;
  const dy = b.y - a.y;
  const py = ea.ey + eb.ey - Math.abs(dy);
  if (py <= 0) return;

  if (px < py) {
    const dir = dx < 0 ? -1 : 1;
    a.x -= dir * px * 0.5;
    b.x += dir * px * 0.5;
    const rel = b.vx - a.vx;
    if (rel * dir < 0) {
      const impulse = -rel * (1 + RESTITUTION) * 0.5;
      a.vx -= impulse;
      b.vx += impulse;
    }
  } else {
    const dir = dy < 0 ? -1 : 1;
    a.y -= dir * py * 0.5;
    b.y += dir * py * 0.5;
    const rel = b.vy - a.vy;
    if (rel * dir < 0) {
      const impulse = -rel * (1 + RESTITUTION) * 0.5;
      a.vy -= impulse;
      b.vy += impulse;
    }
    //* Egymáson megcsúszó lapok: a vízszintes sebesség és a pörgés fogy, és a
    //* súrlódás megpörgeti a felül érkezőt.
    a.va += (b.vx - a.vx) * 0.002;
    b.va += (a.vx - b.vx) * 0.002;
    a.vx *= FRICTION;
    b.vx *= FRICTION;
  }
}

function stepWorld(world: PhysicsWorld, rnd: () => number): void {
  world.t += DT;
  const bodies = world.bodies;
  for (const b of bodies) {
    if (b.gone) continue;
    if (!b.released) {
      if (world.t >= b.delay) release(b, rnd);
      continue;
    }
    integrate(b, DT);
  }
  //! KÉT MEGOLDÓ-KÖR. Egy kör után a torlódó kártyák még átfednének (az egyik
  //! pár szétnyomása a másikba tolja bele a lapot); kettőnél a maradék hiba egy
  //! zuhanó kártyán már nem látszik, és ez még mindig töredék munka.
  for (let iter = 0; iter < 2; iter++) {
    for (let i = 0; i < bodies.length; i++) {
      const a = bodies[i];
      if (!a.released || a.gone) continue;
      for (let j = i + 1; j < bodies.length; j++) {
        const b = bodies[j];
        if (!b.released || b.gone) continue;
        solvePair(a, b);
      }
    }
    for (const b of bodies) {
      if (!b.released || b.gone) continue;
      solveWalls(world, b);
    }
  }
  //! AMI KIÉRT, AZ NINCS TÖBBÉ. A teljes magasságával a kép alá került kártya
  //! kikerül a számításból is, a rajzolásból is — nem terheli tovább a hurkot,
  //! és nem tud visszapattanni egy későbbi ütközésből.
  for (const b of bodies) {
    if (!b.gone && b.released && b.y - b.hw - b.hh > world.h) b.gone = true;
  }
}

/** Valós eltelt időt fogyaszt fix lépésekben. Visszaadja, mozdult-e bármi. */
export function advanceWorld(
  world: PhysicsWorld,
  seconds: number,
  rnd: () => number,
): boolean {
  world.acc += Math.min(seconds, MAX_STEPS * DT);
  let steps = 0;
  while (world.acc >= DT && steps < MAX_STEPS) {
    stepWorld(world, rnd);
    world.acc -= DT;
    steps++;
  }
  return steps > 0;
}

/** Igaz, ha az utolsó kártya is kihullott a képből. */
export function worldSettled(world: PhysicsWorld): boolean {
  for (const b of world.bodies) {
    if (!b.gone) return false;
  }
  return true;
}

/** Ablakméret-változás: az oldalfalak odébb kerülnek, a jelenet folytatódik. */
export function resizeWorld(world: PhysicsWorld, w: number, h: number): void {
  world.w = w;
  world.h = h;
  for (const b of world.bodies) {
    if (!b.released || b.gone) continue;
    const { ex } = extents(b);
    b.x = Math.min(Math.max(b.x, ex), Math.max(ex, w - ex));
  }
}
