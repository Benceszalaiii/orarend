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
//! A ji egyben egy rozmár arca, de a rozmárból CSAK A KÖRVONAL látszik. A
//! betűk tömörek és változatlanok, hogy a „ji" kis méretben is olvasható
//! maradjon; a rajz egyetlen vonalvastagság, a betűk színében.
//!   - a két pont a két szem,
//!   - a j szára a horoggal és az i szára a két agyar,
//!   - a szemek ALATT külön bajuszpárna (orral, bajuszpöttyökkel), és az
//!     agyarak ebből lógnak ki.
//*
//! A SZEM ATTÓL SZEM, HOGY HOMLOK VAN FÖLÖTTE ÉS POFA ALATTA. Az első
//! vázlaton a fej körvonala közvetlenül a pontok alatt zárult bajuszívvel,
//! és a pontok orrlyuknak látszottak. Ezt a sorrendet (homlok, szem, orr és
//! párna, agyar) ne lapítsd össze.
//*
//! TAKARÁS MASZKKAL, NEM FEHÉR KITÖLTÉSSEL. A párna eltakarja az agyarak
//! tövét, a szemek körül rés van a vonalakban; mindkettő maszk, így a jel
//! átlátszó alapon, sötét témán is helyes. A szem fénypöttye is kivágás.
//*
//! KÉT OPTIKAI MÉRET. A `large` a rajz. A `small` a fülikonnak és mindennek
//! kb. 48 px alatt: vastagabb vonal, bajuszpötty és fénypötty nélkül, mert
//! azok ott már szürke zajjá olvadnak.
//! ═══════════════════════════════════════════════════════════════════════════

export const WALRUS = {
  //* A rajz doboza a jel koordinátáiban. A fej a pontok fölé, a párna a
  //* szárak mellé nyúlik, ezért nagyobb a MARK dobozánál.
  box: { x: 0, y: -146, width: 790, height: 819.8 },
  //* A fej alja a párna mögött fut, a maszk tünteti el.
  head: "M461 -122C651 -122 767 -16 767 112C767 182 727 212 671 212H251C195 212 155 182 155 112C155 -16 271 -122 461 -122Z",
  muzzle:
    "M461 174C491 152 540 144 590 144C680 144 747 188 747 210C747 234 680 264 590 264C530 264 487 256 461 232C435 256 392 264 332 264C242 264 175 234 175 210C175 188 242 144 332 144C382 144 431 152 461 174Z",
  nose: "M427 150C427 126 495 126 495 150C495 174 461 188 461 188C461 188 427 174 427 150Z",
  pores: [
    [534, 192],
    [590, 182],
    [646, 196],
    [560, 228],
    [618, 226],
    [388, 192],
    [332, 182],
    [276, 196],
    [362, 228],
    [304, 226],
  ],
  glint: { dx: -20, dy: -20, r: 15 },
  sizes: {
    large: { line: 22, halo: 20, detail: true },
    small: { line: 40, halo: 26, detail: false },
  },
} as const;

//* Az alkalmazásikonon a rozmár helye (1000 egységes csempe). A fej nehezebb
//* a horognál, ezért a közép a fej felé tolva: így a pár nem dől balra.
export const WALRUS_ICON = { x: 130.4, y: 260.6, scale: 0.88 } as const;

/** A rozmáros jel SVG-elemei. Az `id` a maszkok előtagja: egy dokumentumon belül egyedi legyen. */
export function walrusShapes(
  letters: string,
  {
    dot = CREST.red,
    line = letters,
    size = "large",
    id = "ji",
  }: {
    dot?: string;
    line?: string;
    size?: keyof typeof WALRUS.sizes;
    id?: string;
  } = {},
) {
  const s = WALRUS.sizes[size];
  const { jDot, iDot } = MARK;
  const { x, y, width, height } = WALRUS.box;
  const area = `x="${x}" y="${y}" width="${width}" height="${height}"`;
  const mask = (name: string, holes: string) =>
    `<mask id="${id}-${name}" maskUnits="userSpaceOnUse" ${area}><rect ${area} fill="#fff"/><g fill="#000">${holes}</g></mask>`;
  const muzzle = `<path d="${WALRUS.muzzle}"/>`;
  const halos = [jDot, iDot]
    .map((d) => `<circle cx="${d.cx}" cy="${d.cy}" r="${d.r + s.halo}"/>`)
    .join("");
  const stroke = `fill="none" stroke="${line}" stroke-width="${s.line}" stroke-linecap="round" stroke-linejoin="round"`;
  const disc = (cx: number, cy: number, r: number) =>
    `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`;
  const { dx, dy, r } = WALRUS.glint;
  const eye = (d: { cx: number; cy: number; r: number }, fill: string) =>
    `<path fill="${fill}" fill-rule="evenodd" d="${disc(d.cx, d.cy, d.r)}${s.detail ? disc(d.cx + dx, d.cy + dy, r) : ""}"/>`;
  const pores = s.detail
    ? WALRUS.pores
        .map(([cx, cy]) => `<circle cx="${cx}" cy="${cy}" r="10.5"/>`)
        .join("")
    : "";
  return (
    `<defs>${mask("head", muzzle + halos)}${mask("tusks", muzzle)}${mask("muzzle", halos)}</defs>` +
    `<path d="${WALRUS.head}" ${stroke} mask="url(#${id}-head)"/>` +
    `<path d="${MARK.letters}" fill="${letters}" mask="url(#${id}-tusks)"/>` +
    `<path d="${WALRUS.muzzle}" ${stroke} mask="url(#${id}-muzzle)"/>` +
    `<g fill="${line}"><path d="${WALRUS.nose}"/>${pores}</g>` +
    eye(jDot, letters) +
    eye(iDot, dot)
  );
}
