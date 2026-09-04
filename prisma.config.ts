import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "prisma/config";

//! ─── AZ ENV BETÖLTÉSE ───────────────────────────────────────────────────────
//! A Next maga olvassa a `.env.local`-t, a Prisma CLI viszont NEM: az egy külön
//! folyamat, és nem feltétlenül örökli a futtató által betöltött változókat.
//! Enélkül a parancs „Connection url is empty" hibával áll meg, holott a
//! változó ott van a fájlban.
//!
//! Szándékosan kézzel olvassuk, nem `dotenv`-vel: egyetlen fájlból egyetlen
//! értéket kell kivenni, és nem éri meg egy futásidejű függőséget felvenni egy
//! olyan eszközért, ami csak a fejlesztői gépen fut. A már beállított
//! környezeti változót SOHA nem írjuk felül — élesben (Vercel, CI) nincs
//! `.env.local`, ott a valódi env az igazság.
function loadEnvLocal(): void {
  let raw: string;
  try {
    //! `process.cwd()`, NEM `import.meta.url`. A Prisma CLI ezt a fájlt CJS-re
    //! fordítva tölti be, ahol az `import.meta` nem létezik — a betöltés egy
    //! értelmezhetetlen elemzési hibával állna meg. A CLI-t amúgy is mindig a
    //! projekt gyökeréből futtatjuk (npm/bun szkript), tehát a `cwd` helyes.
    raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
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
//! és a parancs NEM HIBÁZIK, hanem végtelenül vár. (Ugyanez a csapda a
//! jedlik-szakkor `prisma.config.ts`-ében is ki van írva — órákat lehet vele
//! elveszíteni, mert semmi nem jelzi, hogy baj van.)
//!
//! Ezért: ha van `DB_DIRECT_URL`, a CLI azt használja. Ha nincs, marad a
//! `DB_URL` — egy nem poololt adatbázisnál (helyi Postgres) ez helyes is.
export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: process.env.DB_DIRECT_URL ?? process.env.DB_URL ?? "",
  },
});
