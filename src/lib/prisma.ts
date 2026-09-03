import "server-only";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../prisma/generated/client";

//! ─── AZ ADATBÁZIS-KAPCSOLAT — EGY PÉLDÁNYBAN ────────────────────────────────
//! A Next fejlesztői módban minden mentésnél újrafordítja a modulokat, de a
//! Node-folyamatot NEM indítja újra. Egy modulszintű `new PrismaClient()` így
//! mentésenként új kapcsolatkészletet nyitna, és pár perc szerkesztés után a
//! Postgres elfogyna a kapcsolatokból („too many clients already"). Ezért a
//! példány a `globalThis`-en ül: a modul újratöltése ugyanazt találja meg.
//!
//! Élesben ez nem probléma (ott nincs újrafordítás), ezért ott nem is
//! szemeteljük tele a globális névteret.

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

//! A KAPCSOLAT A `DB_URL`-BŐL JÖN, ÉS CSAK ONNAN. A `.env.local` nem kerül a
//! repóba; élesben a Vercel környezeti változója adja.
//!
//! HA HIÁNYZIK, PANASZKODUNK — DE NEM DOBUNK KIVÉTELT. Ez a modul a
//! bejelentkezés láncán ül (`prisma.ts` → `auth.ts` → `/api/auth/*`), és egy
//! importáláskor dobott hiba nemcsak a belépést vinné magával, hanem az egész
//! alkalmazást — beleértve az órarendet, amihez semmi köze az adatbázisnak. Az
//! opcionális funkció hiánya nem némíthatja el a lényeget (ugyanez a szabály áll
//! az Entra azonosítókra, lásd `auth.ts`).
//!
//! Az adapter nem kapcsolódik a példányosításkor, csak az első lekérésnél —
//! üres sztringgel tehát az app elindul, és kizárólag a fiókos végpontok
//! hibáznak, ott viszont a naplóban ott áll, miért.
function connectionString(): string {
  const url = process.env.DB_URL;
  if (!url) {
    console.error(
      "[orarend] Hiányzik a DB_URL környezeti változó — a bejelentkezés és a beállítás-szinkron nem fog működni. Az órarend enélkül is teljes egészében használható. Lásd .env.example.",
    );
    return "";
  }
  return url;
}

const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter: new PrismaPg({ connectionString: connectionString() }),
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export default prisma;
