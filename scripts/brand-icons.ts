//! ═══════════════════════════════════════════════════════════════════════════
//! AZ IKONKÉSZLET ÚJRARAJZOLÁSA — `bun run brand:icons`
//! ═══════════════════════════════════════════════════════════════════════════
//! Minden ikon a `src/lib/brand-mark.ts` geometriájából készül, kézzel rajzolt
//! PNG nincs. Ha a jel változik, ezt kell újra lefuttatni, és a kimenet a
//! repóba kerül (a Next a fájlokat a helyükön keresi, buildkor nem generál).
//*
//! MIT ÍR ÉS HOVA:
//!   src/app/icon.svg            böngészőfül (vektor, minden méret)
//!   src/app/favicon.ico         16/32/48 px, a régi böngészőknek
//!   src/app/apple-icon.png      180 px, TELI fehér: az iOS maga kerekít
//!   src/app/opengraph-image.png 1200×630, megosztott hivatkozás képe
//!   public/icon-192.png         PWA, kerekített csempe
//!   public/icon-512.png         PWA, kerekített csempe
//!   public/icon-maskable-512.png Android maszk: teli háttér, kisebb jel
//!   public/brand/*.svg          a jel önállóan (világos és sötét alapra)
//*
//! A SZÖVEGES FORRÁSOK KÉZBEN VANNAK. A `public/brand/jedlik-info-lockup*.svg`
//! és a `jedlik-info-og.svg` a „Jedlik Info" szót Geist-körvonalként hordozza
//! (a Geist nem a repó függősége, a `next/font` tölti). Ez a szkript csak
//! RASZTERIZÁLJA őket; ha a szó vagy a jel változik, azokat is újra kell
//! rajzolni.
//*
//! A `sharp` a Next függőségeként van jelen (képoptimalizálás), ezért nem kell
//! külön telepíteni.
//! ═══════════════════════════════════════════════════════════════════════════

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { CREST, ICON, MARK, markShapes } from "../src/lib/brand-mark";

const ROOT = join(import.meta.dir, "..");
const out = (...p: string[]) => join(ROOT, ...p);

const WHITE = "#ffffff";
const FG_DARK = "#e7e9ea";

//* A jel a 1000 egységes csempén, a csempe közepe körül `scale`-szel.
function placed(scale = 1) {
  const c = ICON.size / 2;
  const x = c - (c - ICON.x) * scale;
  const y = c - (c - ICON.y) * scale;
  return `<g transform="translate(${x.toFixed(2)} ${y.toFixed(2)}) scale(${scale})">${markShapes(CREST.blue)}</g>`;
}

const svg = (body: string, size = ICON.size) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}">${body}</svg>\n`;

//* Kerekített csempe, átlátszó sarkokkal (böngésző, PWA „any").
const tile = (scale = 1) =>
  svg(
    `<rect width="${ICON.size}" height="${ICON.size}" rx="${ICON.radius}" fill="${WHITE}"/>${placed(scale)}`,
  );
//* Teli négyzet (iOS és az Android-maszk maga vágja ki az alakot).
const bleed = (scale = 1) =>
  svg(
    `<rect width="${ICON.size}" height="${ICON.size}" fill="${WHITE}"/>${placed(scale)}`,
  );

const png = (source: string, size: number) =>
  sharp(Buffer.from(source), { density: 72 * (size / 100) + 72 })
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toBuffer();

//* ICO PNG-tartalommal (Vista óta minden böngésző érti): fejléc, könyvtár,
//* utána a képek egymás után.
function ico(images: { size: number; data: Buffer }[]) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  const dir = Buffer.alloc(16 * images.length);
  let offset = header.length + dir.length;
  images.forEach(({ size, data }, i) => {
    const o = i * 16;
    dir.writeUInt8(size >= 256 ? 0 : size, o);
    dir.writeUInt8(size >= 256 ? 0 : size, o + 1);
    dir.writeUInt16LE(1, o + 4);
    dir.writeUInt16LE(32, o + 6);
    dir.writeUInt32LE(data.length, o + 8);
    dir.writeUInt32LE(offset, o + 12);
    offset += data.length;
  });
  return Buffer.concat([header, dir, ...images.map((i) => i.data)]);
}

const markOnly = (letters: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${MARK.width} ${MARK.height}" role="img" aria-label="Jedlik Info">${markShapes(letters)}</svg>\n`;

async function main() {
  //! A FAVICON NAGYOBB JELET KAP. 16 px-en a csempe margója két képpont, a
  //! pontok egy-egy képpontra zsugorodnának; 1,15-ös nagyítással még pont
  //! maradnak. A vektoros `icon.svg` ugyanezt kapja, mert az is a fülön ül.
  const favTile = tile(1.15);
  writeFileSync(out("src/app/icon.svg"), favTile);
  const fav = await Promise.all(
    [16, 32, 48].map(async (size) => ({
      size,
      data: await png(favTile, size),
    })),
  );
  writeFileSync(out("src/app/favicon.ico"), ico(fav));

  writeFileSync(out("src/app/apple-icon.png"), await png(bleed(), 180));
  writeFileSync(out("public/icon-192.png"), await png(tile(), 192));
  writeFileSync(out("public/icon-512.png"), await png(tile(), 512));
  //* Az Android a maszkolt ikont a közepe körüli 80%-os körre vágja; 0,8-es
  //* jellel a horog és a pontok is a körön belül maradnak.
  writeFileSync(
    out("public/icon-maskable-512.png"),
    await png(bleed(0.8), 512),
  );

  writeFileSync(out("public/brand/jedlik-info-mark.svg"), markOnly(CREST.blue));
  writeFileSync(
    out("public/brand/jedlik-info-mark-dark.svg"),
    markOnly(FG_DARK),
  );
  writeFileSync(out("public/brand/jedlik-info-icon.svg"), tile());

  const og = readFileSync(out("public/brand/jedlik-info-og.svg"));
  writeFileSync(
    out("src/app/opengraph-image.png"),
    await sharp(og, { density: 144 })
      .resize(1200, 630)
      .png({ compressionLevel: 9 })
      .toBuffer(),
  );

  console.log("Ikonkészlet kész.");
}

await main();
