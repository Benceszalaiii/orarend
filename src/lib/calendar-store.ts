import { Redis } from "@upstash/redis";
import type { FeedWeek } from "./calendar-feed";
import type { CalendarFeedRequest } from "./calendar-shared";
import { subjectStoreKey, type TimetableSubjectKind } from "./timetable";

//! CSAK A SZERVEREN. Ez a modul az írás-jogú tokent olvassa a környezetből —
//! kliens bundle-be SOHA nem kerülhet be.
import "server-only";

//! ═══════════════════════════════════════════════════════════════════════════
//! A NAPTÁR-FELIRATKOZÁS TÁROLÓJA
//! ═══════════════════════════════════════════════════════════════════════════
//! Kétféle sor él itt, és a kettő élettartama szándékosan nagyon más:
//!
//!  • A JEGY (`cal:feed:<token>`) — EGY SOR EGY FELIRATKOZÁS. Ez tudja, kinek
//!    az órarendjét és MILYEN SZŰRÉSSEL kell kiszolgálni. Sokáig él (a
//!    naptáralkalmazás évekig kérdezheti), és minden lekérés megújítja.
//!
//!  • AZ ÖT HÉT (`cal:weeks:<alany>`) — ALANYONKÉNT KÖZÖS, nem
//!    feliratkozónként. Ez a funkció egész terhelés-szabályozása: száz
//!    feliratkozó ugyanarra az osztályra ugyanannyi Jedlikinfo-kérést jelent,
//!    mint egy.
//!
//! MIÉRT NEM A KIRAJZOLT ICS-T TÁROLJUK. Mert az SZEMÉLYES: a szűrés
//! feliratkozónként más. A hetek adata viszont mindenkinek ugyanaz — a drága
//! rész (hálózat) így közös, az olcsó rész (szűrés) kérésenként fut.
//! ═══════════════════════════════════════════════════════════════════════════

//* Ugyanaz a két környezeti változó, mint a statisztikánál és a push-nál: a
//* Vercel marketplace-integrációja `REDIS_KV_*` néven adja ki őket, ezért a
//* `Redis.fromEnv()` itt sem használható.
const url = process.env.REDIS_KV_REST_API_URL;
const token = process.env.REDIS_KV_REST_API_TOKEN;

const redis = url && token ? new Redis({ url, token }) : null;

export function calendarStoreReady(): boolean {
  return redis !== null;
}

//! MEDDIG ÉL EGY FELIRATKOZÁS. Ugyanaz a szám, mint a push-nál: egy tanév plusz
//! a szünet. A határidő MINDEN lekéréssel újraindul — tehát amíg a naptár
//! kérdezi, a sor él; ha a diák leszedte a naptárából, egy év múlva magától
//! eltűnik. Nem kell hozzá takarító feladat.
const FEED_TTL_SECONDS = 60 * 60 * 24 * 400;

//! A MEGÚJÍTÁST NEM ÍRJUK KI MINDEN LEKÉRÉSNÉL. Egy naptár óránként (rosszabb
//! esetben sűrűbben) kérdez; abból napi sok tucat Redis-írás lenne, miközben a
//! 400 napos határidőn egy napnyi pontosság sem számít.
const TOUCH_INTERVAL_MS = 24 * 60 * 60 * 1000;

export type CalendarFeedRow = CalendarFeedRequest & {
  //! ─── A FIÓKHOZ KÖTÉS: CSAK HA VAN FIÓK ───────────────────────────────────
  //! `null` = vendég-feliratkozás. Ilyenkor a sorban tárolt döntés-lista a
  //! forrás, és azt az a készülék tartja frissen, amelyik a linket létrehozta.
  //!
  //! NEM `null` = a feed a FIÓK beállításaiból olvas (`Preference`), és a
  //! sorban tárolt lista csak tartalék. Ez nem apró kényelem: a
  //! beállítás-szinkron miatt a döntés bármelyik készülékről megváltozhat, és
  //! ilyenkor a naptár ATTÓL FÜGGETLENÜL követi, hogy a link létrehozója
  //! kinyitotta-e azóta a lapot.
  userId: string | null;
  createdAt: number;
  /** Mikor újítottuk meg utoljára a határidőt (lásd `TOUCH_INTERVAL_MS`). */
  touchedAt: number;
};

const FEED_KEY = (token: string) => `cal:feed:${token}`;

export async function readFeed(token: string): Promise<CalendarFeedRow | null> {
  if (!redis) return null;
  return await redis.get<CalendarFeedRow>(FEED_KEY(token));
}

export async function writeFeed(
  token: string,
  input: CalendarFeedRequest & { userId: string | null },
): Promise<void> {
  if (!redis) return;
  //* Frissítésnél a keletkezés ideje megmarad: a „mióta él ez a link" kérdésre
  //* a felületnek is válaszolnia kell.
  const previous = await redis.get<CalendarFeedRow>(FEED_KEY(token));
  const row: CalendarFeedRow = {
    ...input,
    createdAt: previous?.createdAt ?? Date.now(),
    touchedAt: Date.now(),
  };
  await redis.set(FEED_KEY(token), row, { ex: FEED_TTL_SECONDS });
}

/** A határidő megújítása lekéréskor — naponta legfeljebb egyszer ír. */
export async function touchFeed(
  token: string,
  row: CalendarFeedRow,
): Promise<void> {
  if (!redis) return;
  if (Date.now() - row.touchedAt < TOUCH_INTERVAL_MS) return;
  await redis.set(
    FEED_KEY(token),
    { ...row, touchedAt: Date.now() } satisfies CalendarFeedRow,
    { ex: FEED_TTL_SECONDS },
  );
}

//! A VISSZAVONÁS AZONNALI ÉS VÉGLEGES. A link viselői jog: aki ismeri, látja az
//! órarendet. Ezért a törlés nem „érvénytelenítés" egy listán, hanem a sor
//! eltüntetése — a következő lekérés 404-et kap, és nincs olyan állapot,
//! amiből visszahozható lenne.
export async function removeFeed(token: string): Promise<void> {
  if (!redis) return;
  await redis.del(FEED_KEY(token));
}

//* ---------------------------------------------------------------------------
//* AZ ÖT HÉT — ALANYONKÉNT KÖZÖS
//* ---------------------------------------------------------------------------
//! A HATÁRIDŐ JÓVAL HOSSZABB A FRISSESSÉGNÉL, ÉS EZ A LÉNYEG. „Friss" az egy
//! óránál újabb példány (lásd `calendar-source.ts`); a sor viszont egy HÉTIG
//! él. A különbség a kimaradás elleni tartalék:
//!
//! EGY ÜRES FEED NEM „SEMMI", HANEM TÖRLÉS. A feliratkozásos naptár a kapott
//! listát ELFOGADJA igazságként: amit nem talál benne, azt kiveszi a naptárból.
//! Ha a Jedlikinfo öt percre elérhetetlen, és mi ilyenkor üres naptárt adnánk,
//! a diák telefonjáról ELTŰNNE az egész órarendje — és csak a következő
//! sikeres lekéréskor jönne vissza. A lejárt példány ezért mindig jobb a
//! semminél.
const WINDOW_TTL_SECONDS = 60 * 60 * 24 * 7;

//! MINDEN HÉT HOZZA A SAJÁT KELTÉT. Az ablak egészének van egy „mikor
//! frissítettük" bélyege, de a hetek nem feltétlenül egyszerre jöttek: ha egy
//! hét lekérése elbukott, azt az ELŐZŐ példányból visszük tovább (lásd
//! `calendar-source.ts`). Enélkül nem lehetne megmondani, melyik hét adata
//! öreg — és egy csendben hónapokig továbbvitt hét a legrosszabb fajta hiba.
export type StoredWeek = FeedWeek & { fetchedAt: number };

export type CachedWindow = {
  /** Epoch ms — a legutóbbi frissítési kör pillanata. */
  fetchedAt: number;
  weeks: StoredWeek[];
};

const WINDOW_KEY = (kind: TimetableSubjectKind, short: string) =>
  `cal:weeks:${subjectStoreKey(kind, short)}`;

export async function readWindow(
  kind: TimetableSubjectKind,
  short: string,
): Promise<CachedWindow | null> {
  if (!redis) return null;
  return await redis.get<CachedWindow>(WINDOW_KEY(kind, short));
}

export async function writeWindow(
  kind: TimetableSubjectKind,
  short: string,
  weeks: StoredWeek[],
): Promise<void> {
  if (!redis) return;
  await redis.set(
    WINDOW_KEY(kind, short),
    { fetchedAt: Date.now(), weeks } satisfies CachedWindow,
    { ex: WINDOW_TTL_SECONDS },
  );
}

//! ─── EGY ALANYRA EGY FRISSÍTÉS ─────────────────────────────────────────────
//! Ugyanaz a minta, mint a push-kiküldés foglalásánál: a lekérés MÖGÉ egy
//! kulcs kerül, és aki nem kapta meg, nem indít másodikat. Enélkül egy
//! népszerű osztály öt egyszerre érkező naptár-lekérése 25 Jedlikinfo-kérést
//! indítana — a szerver nélküli futtatás miatt egy memóriában tartott jelölő
//! itt nem elég, az minden hidegindításnál üres.
//*
//* Két perc: a legrosszabb eset (öt hét, mindegyik a 15 másodperces határidőn)
//* is belefér, de egy elbukott futás nem zárja ki hosszan a következőt.
const REFRESH_LEASE_SECONDS = 120;

export async function leaseWindowRefresh(
  kind: TimetableSubjectKind,
  short: string,
): Promise<boolean> {
  if (!redis) return false;
  const won = await redis.set(`cal:lock:${subjectStoreKey(kind, short)}`, 1, {
    nx: true,
    ex: REFRESH_LEASE_SECONDS,
  });
  return won === "OK";
}
