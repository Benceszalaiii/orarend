import { createHash } from "node:crypto";
import { Redis } from "@upstash/redis";
import type { WeekSnapshot } from "./push-plan";
import type { PushPrefs } from "./push-shared";
import type { TimetableLesson } from "./timetable";

//! CSAK A SZERVEREN. Ez a modul az írás-jogú tokent olvassa a környezetből —
//! kliens bundle-be SOHA nem kerülhet be.
import "server-only";

//* Ugyanaz a két környezeti változó, mint a használati statisztikánál: a Vercel
//* marketplace-integrációja `REDIS_KV_*` néven adja ki őket, ezért a
//* `Redis.fromEnv()` itt sem használható.
const url = process.env.REDIS_KV_REST_API_URL;
const token = process.env.REDIS_KV_REST_API_TOKEN;

const redis = url && token ? new Redis({ url, token }) : null;

export function pushStoreReady(): boolean {
  return redis !== null;
}

//* ---------------------------------------------------------------------------
//* MI KERÜL A TÁROLÓBA
//* ---------------------------------------------------------------------------
//! EGY FELIRATKOZÁS = EGY BÖNGÉSZŐ. Ez az app EGYETLEN olyan adata, ami egy
//! konkrét készülékhez köthető — a push-végpontot ugyanis nem lehet elhagyni:
//! az MAGA a cím, ahová a jelzés megy. A használati statisztikánál még
//! kimondhattuk, hogy semmi azonosító nem kerül a tárolóba (lásd
//! `usage-store.ts`); ITT ez nem mondható ki, ezért ki sem mondjuk — az
//! `/adatvedelem` nevesítve leírja, mi tárolódik és meddig.
//*
//* Amit NEM tárolunk mellé: se nevet, se IP-t, se eszközleírót, se azt, hogy
//* melyik csoportbontás a diáké (az a döntés a böngészőben marad). A sor
//* mindössze annyit tud: „erre a címre menjen jelzés EZEKRŐL az osztályokról".
export type PushSubscription = {
  endpoint: string;
  p256dh: string;
  auth: string;
} & PushPrefs;

type StoredSubscription = PushSubscription & { createdAt: number };

//! AZ AZONOSÍTÓ A VÉGPONTBÓL SZÁRMAZIK, NEM VÉLETLENBŐL. Két oka van. (1) Ha
//! ugyanaz a böngésző újra feliratkozik (törölt tárhely, új beállítás), a sor
//! FRISSÜL, nem duplázódik — különben ugyanaz a készülék kétszer rezegne.
//! (2) A kliensnek nem kell azonosítót kapnia és eltennie: a végpont, ami
//! amúgy is nála van, elég a saját sorának megcímzéséhez.
function subscriptionId(endpoint: string): string {
  return createHash("sha256").update(endpoint).digest("hex").slice(0, 32);
}

const SUB_KEY = (id: string) => `push:sub:${id}`;
const CLASS_KEY = (short: string) => `push:class:${short}`;
//* Melyik osztályokra van EGYÁLTALÁN feliratkozó. Enélkül a háttérfeladatnak
//* végig kellene pásztáznia a kulcsteret, hogy megtudja, kinek dolgozzon.
const CLASS_INDEX = "push:classes";

//! MEDDIG ÉL EGY FELIRATKOZÁS. Egy tanév plusz a szünet: aki egy éve nem
//! nyitotta meg a lapot, annak az órarend-értesítés már nem szolgáltatás,
//! hanem szemét. A határidő minden feliratkozás-frissítéskor újraindul (a lap
//! megnyitásakor is), így az aktív használót sosem ejtjük ki.
const SUB_TTL_SECONDS = 60 * 60 * 24 * 400;

export async function saveSubscription(
  sub: PushSubscription,
  //* Ha a böngésző a végpontot lecserélte (`pushsubscriptionchange`), a régi
  //* sort itt takarítjuk el — különben az élettartam végéig ott maradna, és a
  //* push-szolgáltató minden kiküldésnél 410-nel válaszolna rá.
  replaces?: string,
): Promise<void> {
  if (!redis) return;
  if (replaces && replaces !== sub.endpoint) {
    await removeSubscription(replaces);
  }

  const id = subscriptionId(sub.endpoint);
  const previous = await redis.get<StoredSubscription>(SUB_KEY(id));
  const record: StoredSubscription = {
    ...sub,
    createdAt: previous?.createdAt ?? Date.now(),
  };

  await redis.set(SUB_KEY(id), record, { ex: SUB_TTL_SECONDS });

  //* Az osztály-index a KÜLÖNBSÉGGEL frissül: aki levett egy osztályt, annak a
  //* halmazából is ki kell kerülnie, különben a háttérfeladat továbbra is neki
  //* címezné a jelzést.
  const before = new Set(previous?.classes ?? []);
  const after = new Set(record.classes);
  for (const short of before) {
    if (!after.has(short)) await redis.srem(CLASS_KEY(short), id);
  }
  for (const short of after) {
    await redis.sadd(CLASS_KEY(short), id);
    await redis.sadd(CLASS_INDEX, short);
  }
}

export async function removeSubscription(endpoint: string): Promise<void> {
  if (!redis) return;
  const id = subscriptionId(endpoint);
  const previous = await redis.get<StoredSubscription>(SUB_KEY(id));
  for (const short of previous?.classes ?? []) {
    await redis.srem(CLASS_KEY(short), id);
  }
  await redis.del(SUB_KEY(id));
}

export async function readSubscription(
  endpoint: string,
): Promise<PushSubscription | null> {
  if (!redis) return null;
  return await redis.get<StoredSubscription>(SUB_KEY(subscriptionId(endpoint)));
}

//* Mely osztályokra van feliratkozó — a háttérfeladat munkalistája.
export async function subscribedClasses(): Promise<string[]> {
  if (!redis) return [];
  return (await redis.smembers(CLASS_INDEX)) ?? [];
}

export async function subscribersOf(
  short: string,
): Promise<PushSubscription[]> {
  if (!redis) return [];
  const ids = (await redis.smembers(CLASS_KEY(short))) ?? [];
  if (ids.length === 0) {
    //* Üresre fogyott halmaz: az index is felejtse el az osztályt, hogy a
    //* háttérfeladat ne kérje le fölöslegesen a suli szerverétől.
    await redis.srem(CLASS_INDEX, short);
    return [];
  }
  const rows = await Promise.all(
    ids.map((id) => redis.get<StoredSubscription>(SUB_KEY(id))),
  );
  const alive: PushSubscription[] = [];
  for (let i = 0; i < ids.length; i++) {
    const row = rows[i];
    //* A sor a saját élettartama végén magától eltűnik; a halmazból viszont
    //* nem — ezt itt takarítjuk, menet közben.
    if (!row) {
      await redis.srem(CLASS_KEY(short), ids[i]);
      continue;
    }
    alive.push(row);
  }
  return alive;
}

//* ---------------------------------------------------------------------------
//* FOGLALÁS — NEM NAPLÓ
//* ---------------------------------------------------------------------------
//! A KIKÜLDÉST LE KELL FOGLALNI, MIELŐTT MEGTÖRTÉNIK. A háttérfeladat többször
//! is lefuthat ugyanarra a percre (újrapróbálkozás, párhuzamos indítás, az
//! ablak több tickre is igaz — lásd `LEAD_WINDOW_MINUTES`). A `NX` feltételes
//! írás ATOMI: aki megnyerte, az küld; a többi csendben kihagyja. Ez ugyanaz a
//! minta, mint a jedlik-szakkor `Notification.emailedAt` foglalása — a
//! különbség csak annyi, hogy ott egy oszlop, itt egy lejáró kulcs viseli.
async function lease(key: string, ttlSeconds: number): Promise<boolean> {
  if (!redis) return false;
  const won = await redis.set(key, 1, { nx: true, ex: ttlSeconds });
  return won === "OK";
}

//* Az emlékeztető foglalása napra és percre. Fél nap élettartam: a nap végére
//* magától eltűnik, de egy elhúzódó kimaradást is átvészel.
export function leaseReminder(
  short: string,
  dayKey: string,
  startMin: number,
): Promise<boolean> {
  return lease(`push:sent:${short}:${dayKey}:${startMin}`, 60 * 60 * 12);
}

//* A változás-értesítés foglalása a különbség lenyomatával. Egy nap: ha
//* ugyanaz a változás egy nap múlva ÚJRA előáll, az már valóban új hír.
export function leaseChange(
  short: string,
  fingerprint: string,
): Promise<boolean> {
  return lease(`push:change:${short}:${fingerprint}`, 60 * 60 * 24);
}

//* ---------------------------------------------------------------------------
//* A HÉT LENYOMATA ÉS GYORSÍTÓTÁRA
//* ---------------------------------------------------------------------------
//! A SULI SZERVERÉT NEM VERJÜK PERCENKÉNT. Az emlékeztetőhöz a hét óráira van
//! szükség, a változásfigyeléshez pedig friss lekérésre — de a kettő nem
//! egyforma sűrűn kell. A lekért hetet ezért eltesszük, és a háttérfeladat
//! csak akkor kér újat, ha a példány megöregedett (lásd `/api/ertesites/tick`).
//! Enélkül percenként annyi kérés menne a Jedlikinfóra, ahány osztályra
//! feliratkoztak — az órarend forrását vinnénk el az órarend-értesítéssel.
const WEEK_CACHE_SECONDS = 60 * 30;

export type CachedWeekLessons = {
  fetchedAt: number;
  lessons: TimetableLesson[];
};

export async function readWeekCache(
  short: string,
  weekStart: string,
): Promise<CachedWeekLessons | null> {
  if (!redis) return null;
  return await redis.get<CachedWeekLessons>(`push:week:${short}:${weekStart}`);
}

export async function writeWeekCache(
  short: string,
  weekStart: string,
  lessons: TimetableLesson[],
): Promise<void> {
  if (!redis) return;
  await redis.set(
    `push:week:${short}:${weekStart}`,
    { fetchedAt: Date.now(), lessons } satisfies CachedWeekLessons,
    { ex: WEEK_CACHE_SECONDS },
  );
}

//! A LENYOMAT TOVÁBB ÉL, MINT A GYORSÍTÓTÁR. A gyorsítótár azt mondja meg,
//! kell-e ÚJ lekérés; a lenyomat azt, hogy mihez képest változott valami. Ha a
//! kettő együtt járna le, minden félóra után „minden óra új" különbség jönne ki.
const SNAPSHOT_SECONDS = 60 * 60 * 24 * 30;

export async function readSnapshot(
  short: string,
  weekStart: string,
): Promise<WeekSnapshot | null> {
  if (!redis) return null;
  return await redis.get<WeekSnapshot>(`push:snap:${short}:${weekStart}`);
}

export async function writeSnapshot(
  short: string,
  weekStart: string,
  snapshot: WeekSnapshot,
): Promise<void> {
  if (!redis) return;
  await redis.set(`push:snap:${short}:${weekStart}`, snapshot, {
    ex: SNAPSHOT_SECONDS,
  });
}
