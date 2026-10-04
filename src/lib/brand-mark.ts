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
