//! ─── A PRISMA CLI KONFIGURÁCIÓJA ────────────────────────────────────────────
//! A Prisma 7 óta a kapcsolati URL NEM állhat a sémafájlban (`url = env(...)`
//! ott már hibát ad) — a CLI innen veszi. A FUTÁSIDEJŰ kliens ettől függetlenül
//! a saját adapterén át kapcsolódik (`src/lib/prisma.ts`), ugyanabból a `DB_URL`
//! változóból; a kettő szándékosan ugyanaz, hogy a `db push` sose egy másik
//! adatbázisba írjon, mint amit az app olvas.
//!
//! A `DB_URL`-t a `.env.local` adja, amit a bun automatikusan betölt — ezért
//! futnak a `db:*` szkriptek bunnal (lásd package.json).
//!
//! ─────────────────────────────────────────────────────────────────────────────
//! MIÉRT NINCS ITT `defineConfig` IMPORT, HOLOTT A PRISMA DOKUMENTÁCIÓJA AZT ÍRJA:
//! a projekt `devDependencies`-ében a `prisma` CLI a 8-as (Prisma Next) ág, az
//! ORM viszont a 7-es (`@prisma/client`, `prisma-client` generátor). A
//! `prisma/config` import ezért a 8-as csomagra oldódna fel, amiben nincs ilyen
//! export — a config betöltése `defineConfig is not a function`-nel elszállna.
//! A `defineConfig` amúgy is csak típussegéd (futásidőben azonossági függvény),
//! tehát a sima objektum-export ugyanazt jelenti, és mindkét CLI-vel elfér.
//! A séma szerkesztésekor a parancs `bun run db:generate` / `bun run db:push`,
//! ezek pedig kifejezetten a 7-es CLI-t hívják (`prisma@7.10.0`).

//! ─── AZ ENV BETÖLTÉSE ───────────────────────────────────────────────────────
//! A Next maga olvassa a `.env.local`-t, a Prisma CLI viszont NEM: az egy külön
//! folyamat, és nem feltétlenül örökli a futtató shell által betöltött
//! változókat (a `bunx` a CLI-t saját gyerekfolyamatban indítja). Enélkül a
//! parancs „Connection url is empty" hibával áll meg, holott a változó ott van
//! a fájlban.
//!
//! Szándékosan kézzel olvassuk, nem `dotenv`-vel: egyetlen fájlból egyetlen
//! értéket kell kivenni, és nem éri meg egy futásidejű függőséget felvenni egy
//! olyan eszközért, ami csak a fejlesztői gépen fut. A már beállított
//! környezeti változót SOHA nem írjuk felül — élesben (Vercel, CI) nincs
//! `.env.local`, ott a valódi env az igazság.
import { readFileSync } from "node:fs";

function loadEnvLocal(): void {
  let raw: string;
  try {
    raw = readFileSync(new URL(".env.local", import.meta.url), "utf8");
  } catch {
    //* Nincs fájl — élesben ez a normális eset.
    return;
  }
  for (const line of raw.split("\n")) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key] !== undefined) continue;
    //* Idézőjelek le, sorvégi szóköz le. Többsoros értéket nem támogatunk —
    //* egy kapcsolati sztringben nincs is ilyen.
    process.env[key] = rawValue.trim().replace(/^["']|["']$/g, "");
  }
}

loadEnvLocal();

//! ─── MIÉRT VAN KÉTFÉLE URL ──────────────────────────────────────────────────
//! A futásidejű kliens a POOLER-en megy (Neon `-pooler` végpont, pgbouncer
//! tranzakciós módban) — serverless-en ez a helyes, mert minden hideg indítás új
//! kapcsolatot nyitna, és a Postgres kapcsolatszáma véges.
//!
//! A SÉMAMÓDOSÍTÁS VISZONT NEM MEHET A POOLEREN. A `db push` session-szintű
//! advisory lockot kér; tranzakciós módú poolerben ez a lock nem szerezhető meg,
//! és a parancs nem hibázik, hanem VÉGTELENÜL VÁR. (Ugyanez a csapda a
//! jedlik-szakkor `prisma.config.ts`-ében is ki van írva — ott egy egész
//! bekezdés szól róla, mert órákat lehet vele elveszíteni.)
//!
//! Ezért: ha van `DB_DIRECT_URL`, a CLI azt használja. Ha nincs, marad a
//! `DB_URL` — egy nem poololt adatbázisnál (helyi Postgres) ez helyes is.
export default {
  schema: "prisma/schema.prisma",
  datasource: {
    url: process.env.DB_DIRECT_URL ?? process.env.DB_URL ?? "",
  },
};
