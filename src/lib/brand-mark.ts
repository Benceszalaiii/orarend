//! ═══════════════════════════════════════════════════════════════════════════
//! A JEDLIK INFO JELE — EGY HELYEN LEÍRVA
//! ═══════════════════════════════════════════════════════════════════════════
//! A jel a „ji" két kisbetűje (Jedlik Info): egyenes szárak, kerek pontok. Az
//! i pontja PIROS, és ez az egyetlen piros a jelben — ugyanaz a szerep, mint az
//! appban: a piros a „most"-ot jelöli. Magyarul a pont pont, a pontos pedig az,
//! aki időben ott van.
//*
//! A SZÍNEK AZ ISKOLÁÉI, a jedlik.eu 2020-as címeréről mintavételezve
//! (2026-10-04): a piros negyed #E61B20, a kék negyed #2D57A4. A kék a
//! `globals.css`-ben a `--primary` is; a piros a `--brand` párja (az app
//! pirosa #E41B1F volt, vagyis kerekítésnyire ugyanaz).
//*
//! A JEL NEM A CÍMER. Szándékosan csak a színeit veszi át, a pajzsot és a
//! képeit nem: a Jedlik Info nem hivatalos, magánjellegű projekt, és a jele
//! nem állíthatja magáról, hogy az iskoláé.
//*
//! EGYETLEN FORRÁS. Ezt olvassa a felületi `JiMark` komponens ÉS a
//! `scripts/brand-icons.ts`, ami ebből rajzolja újra a teljes ikonkészletet.
//! Ha a jel változik, itt változik, utána `bun run brand:icons`.
//! ═══════════════════════════════════════════════════════════════════════════

export const CREST = { red: "#e61b20", blue: "#2d57a4" } as const;

export const MARK = {
  width: 645.9,
  height: 673.8,
  //! A j SZÁRA ÉS HORGA EGY KONTÚR. Két egymás mellé tett alakzat közös
  //! élén az élsimítás hajszálvékony világos rést rajzol; egy kontúrnak
  //! nincs belső éle.
  letters:
    "M282 193.8H400V473.8A200 200 0 0 1 3 508.5L119.2 488A82 82 0 0 0 282 473.8ZM522 193.8H640V473.8H522Z",
  jDot: { cx: 341, cy: 64.9, r: 64.9 },
  iDot: { cx: 581, cy: 64.9, r: 64.9 },
  //* A szárak alja. Ehhez igazodik a szóvédjegy alapvonala; a j horga
  //* alálóg, mint egy betű ereszkedője.
  baseline: 473.8,
} as const;

//* Az alkalmazásikonon (1000 egységes négyzet) a jel helye. Nem mértani
//* közép: a horog könnyű, ezért a szélességének csak ~60%-a számít bele a
//* középre igazításba, különben a pár jobbra billenne.
export const ICON = { size: 1000, radius: 225, x: 120.7, y: 173.1 } as const;

/** A jel SVG-elemei, adott betű- és pontszínnel (a generátornak). */
export function markShapes(letters: string, dot: string = CREST.red) {
  const { jDot, iDot } = MARK;
  return (
    `<path d="${MARK.letters}" fill="${letters}"/>` +
    `<circle cx="${jDot.cx}" cy="${jDot.cy}" r="${jDot.r}" fill="${letters}"/>` +
    `<circle cx="${iDot.cx}" cy="${iDot.cy}" r="${iDot.r}" fill="${dot}"/>`
  );
}

//! ═══════════════════════════════════════════════════════════════════════════
//! A ROZMÁR (JDLK-32)
//! ═══════════════════════════════════════════════════════════════════════════
//! A ji egyben egy rozmár feje, lapos, geometrikus jelként: egy tömör
//! fejsziluett, rajta a ji. Nem illusztráció; a Vercel, a Linear, a MongoDB
//! és a Postgres jeleinek nyelvén beszél (egy alak, egy-két szín, apró
//! részlet nélkül).
//!   - a két pont a két szem,
//!   - a j szára a horoggal és az i szára a két agyar,
//!   - a fej alja két bajuszpárna, rajtuk három-három bajuszpötty. A pöttyök
//!     és a széles, kétívű pofa mondják ki, hogy rozmár; nélkülük a fej
//!     gombának vagy medúzának olvasható.
//*
//! AZ AGYARAK HOSSZABBAK A JI SZÁRAINÁL (+60). A fej eltakarja a szárak
//! tövét, és az eredeti hosszal az i csonk maradt.
//*
//! KÉT VÁLTOZAT, UGYANABBÓL A GEOMETRIÁBÓL.
//!   - Ikon: sötét csempe, címerkék fej, fehér ji. A ji itt végig egy szín,
//!     ezért ez olvasható a legjobban, 16 px-en is.
//!   - Egyszínű jel átlátszó alapra: a fejből a szemek ki vannak vágva, az
//!     agyarak alatta egy réssel különülnek el. A fejen ÁTMENŐ szárkivágás
//!     (XOR) koponyát rajzolt, a kivágott szárak fogaknak látszottak.
//*
//! PIROS NINCS BENNE. Egy piros szem sérült állatnak látszott; a piros az
//! appban marad a „most" jele.
//*
//! KIS MÉRETBEN (kb. 48 px alatt) a bajuszpöttyök elmaradnak (`detail:
//! false`), mert ott már zajjá olvadnak.
//! ═══════════════════════════════════════════════════════════════════════════

export const WALRUS = {
  //* A jel doboza: a fej tetejétől a horog aljáig, kis ráhagyással.
  box: { x: -9, y: -124, width: 820, height: 870 },
  letters:
    "M282 193.8H400V533.8A200 200 0 0 1 3 568.5L119.2 548A82 82 0 0 0 282 533.8ZM522 193.8H640V533.8H522Z",
  head: "M461 -112C611 -112 693 -50 709 60C723 130 799 144 799 214C799 278 715 314 581 314C528 314 487 294 461 268C435 294 394 314 341 314C207 314 123 278 123 214C123 144 199 130 213 60C229 -50 311 -112 461 -112Z",
  whiskers: [
    [681, 206],
    [723, 232],
    [681, 258],
    [241, 206],
    [199, 232],
    [241, 258],
  ],
  whiskerR: 13,
  //* A fej és az agyarak közti rés az egyszínű jelen.
  gap: 18,
  //* Az ikon csempéje: majdnem fekete.
  tile: "#0b0d12",
} as const;

//* A rozmár helye az 1000 egységes csempén: optikailag középen, körben
//* nagyjából egyforma levegővel.
export const WALRUS_ICON = { x: 179.2, y: 251.2, scale: 0.8 } as const;

const disc = (cx: number, cy: number, r: number) =>
  `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`;
const eyes =
  disc(MARK.jDot.cx, MARK.jDot.cy, MARK.jDot.r) +
  disc(MARK.iDot.cx, MARK.iDot.cy, MARK.iDot.r);
const whiskerHoles = (detail: boolean) =>
  detail
    ? WALRUS.whiskers.map(([x, y]) => disc(x, y, WALRUS.whiskerR)).join("")
    : "";

/** Az ikon rajza: címerkék fej, fehér ji. `detail: false` a kis méretekhez. */
export function walrusIcon({
  head = CREST.blue,
  ink = "#ffffff",
  detail = true,
}: {
  head?: string;
  ink?: string;
  detail?: boolean;
} = {}) {
  return (
    `<path d="${WALRUS.head}${whiskerHoles(detail)}" fill="${head}" fill-rule="evenodd"/>` +
    `<path d="${WALRUS.letters}${eyes}" fill="${ink}"/>`
  );
}

/** Egyszínű jel átlátszó alapra. Az `id` a maszk neve: egy dokumentumon belül egyedi legyen. */
export function walrusGlyph(
  fill: string,
  { detail = true, id = "ji-tusks" }: { detail?: boolean; id?: string } = {},
) {
  const { x, y, width, height } = WALRUS.box;
  const area = `x="${x}" y="${y}" width="${width}" height="${height}"`;
  return (
    `<defs><mask id="${id}" maskUnits="userSpaceOnUse" ${area}><rect ${area} fill="#fff"/>` +
    `<path d="${WALRUS.head}" fill="#000" stroke="#000" stroke-width="${WALRUS.gap * 2}" stroke-linejoin="round"/></mask></defs>` +
    `<path d="${WALRUS.head}${eyes}${whiskerHoles(detail)}" fill="${fill}" fill-rule="evenodd"/>` +
    `<path d="${WALRUS.letters}" fill="${fill}" mask="url(#${id})"/>`
  );
}
