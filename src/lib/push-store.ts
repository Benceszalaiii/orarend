import { createHash } from "node:crypto";
import { Redis } from "@upstash/redis";
import type { WeekSnapshot } from "./push-plan";
import type { PushPersonalization, PushPrefs } from "./push-shared";
import { clubsOf, contestsOf, subjectsOf } from "./push-shared";
import {
  subjectStoreKey,
  type TimetableLesson,
  type TimetableSubjectKind,
} from "./timetable";

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
//* Amit NEM tárolunk mellé: se nevet, se IP-t, se eszközleírót. A sor annyit
//* tud: „erre a címre menjen jelzés EZEKRŐL az osztályokról" — és ha a diák
//* beállította, hogy a rácsán mi az övé (duális nap, csoportbontás), akkor azt
//* is, különben az értesítés mást mondana, mint a rács (lásd `push-shared.ts`).
export type PushSubscription = {
  endpoint: string;
  p256dh: string;
  auth: string;
  //! A RÉGI SOROKBAN NINCS, és ez nem hiba: a hiánya a teljes osztály-
  //! órarendet jelenti — pontosan azt, amit a döntés nélküli rács is mutat.
  /** A feliratkozó duális beosztása és csoportbontás-döntései osztályonként. */
  personalization?: PushPersonalization;
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

//! ─── KÉT ALANY, KÉT KULCSTÉR ───────────────────────────────────────────────
//! Az osztályos kulcsok alakja SZÁNDÉKOSAN változatlan (`push:class:09B`,
//! `push:classes`): a tanári ág bevezetése nem költöztetheti el a már élő
//! feliratkozásokat — egy átnevezés némán mindenkit leiratkoztatna, aki nem
//! nyitja meg a lapot. A tanár a maga előtagját kapja, és ezzel a két névtér
//! akkor sem ér össze, ha a suli egyszer számjeggyel kezdődő tanári jelet ad
//! ki.
const SUBJECT_KEY = (kind: TimetableSubjectKind, short: string) =>
  kind === "teacher" ? `push:teacher:${short}` : `push:class:${short}`;

//* Melyik alanyokra van EGYÁLTALÁN feliratkozó. Enélkül a háttérfeladatnak
//* végig kellene pásztáznia a kulcsteret, hogy megtudja, kinek dolgozzon.
const SUBJECT_INDEX: Record<TimetableSubjectKind, string> = {
  class: "push:classes",
  teacher: "push:teachers",
};

//* A háttérfeladat mindkét ágon ugyanazt csinálja, csak más listából — ezért
//* mindenhol EZEN a soron megyünk végig, és nem két külön másolaton.
export const SUBJECT_KINDS: readonly TimetableSubjectKind[] = [
  "class",
  "teacher",
];

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

  //* Az alany-index a KÜLÖNBSÉGGEL frissül: aki levett egy osztályt (vagy egy
  //* tanárt), annak a halmazából is ki kell kerülnie, különben a háttérfeladat
  //* továbbra is neki címezné a jelzést.
  for (const kind of SUBJECT_KINDS) {
    const before = new Set(previous ? subjectsOf(previous, kind) : []);
    const after = new Set(subjectsOf(record, kind));
    for (const short of before) {
      if (!after.has(short)) await redis.srem(SUBJECT_KEY(kind, short), id);
    }
    for (const short of after) {
      await redis.sadd(SUBJECT_KEY(kind, short), id);
      await redis.sadd(SUBJECT_INDEX[kind], short);
    }
  }

  //* A szakkörök ugyanígy, saját kulcstérben (lásd `CLUB_KEY`).
  const clubsBefore = new Set(previous ? clubsOf(previous) : []);
  const clubsAfter = new Set(clubsOf(record));
  for (const slug of clubsBefore) {
    if (!clubsAfter.has(slug)) await redis.srem(CLUB_KEY(slug), id);
  }
  for (const slug of clubsAfter) {
    await redis.sadd(CLUB_KEY(slug), id);
    await redis.sadd(CLUB_INDEX, slug);
  }

  const contestsBefore = new Set(previous ? contestsOf(previous) : []);
  const contestsAfter = new Set(contestsOf(record));
  for (const slug of contestsBefore) {
    if (!contestsAfter.has(slug)) await redis.srem(CONTEST_KEY(slug), id);
  }
  for (const slug of contestsAfter) {
    await redis.sadd(CONTEST_KEY(slug), id);
    await redis.sadd(CONTEST_INDEX, slug);
  }
}

export async function removeSubscription(endpoint: string): Promise<void> {
  if (!redis) return;
  const id = subscriptionId(endpoint);
  const previous = await redis.get<StoredSubscription>(SUB_KEY(id));
  for (const kind of SUBJECT_KINDS) {
    for (const short of previous ? subjectsOf(previous, kind) : []) {
      await redis.srem(SUBJECT_KEY(kind, short), id);
    }
  }
  for (const slug of previous ? clubsOf(previous) : []) {
    await redis.srem(CLUB_KEY(slug), id);
  }
  for (const slug of previous ? contestsOf(previous) : []) {
    await redis.srem(CONTEST_KEY(slug), id);
  }
  await redis.del(SUB_KEY(id));
}

export async function readSubscription(
  endpoint: string,
): Promise<PushSubscription | null> {
  if (!redis) return null;
  return await redis.get<StoredSubscription>(SUB_KEY(subscriptionId(endpoint)));
}

//* Mely alanyokra van feliratkozó — a háttérfeladat munkalistája.
export async function subscribedSubjects(
  kind: TimetableSubjectKind,
): Promise<string[]> {
  if (!redis) return [];
  return (await redis.smembers(SUBJECT_INDEX[kind])) ?? [];
}

export function subscribersOf(
  kind: TimetableSubjectKind,
  short: string,
): Promise<PushSubscription[]> {
  return membersOf(SUBJECT_KEY(kind, short), SUBJECT_INDEX[kind], short);
}

//* Egy feliratkozó-halmaz élő sorai — az órarend-alanyoké és a szakköröké is.
async function membersOf(
  setKey: string,
  indexKey: string,
  member: string,
): Promise<PushSubscription[]> {
  if (!redis) return [];
  const ids = (await redis.smembers(setKey)) ?? [];
  if (ids.length === 0) {
    //* Üresre fogyott halmaz: az index is felejtse el az alanyt, hogy a
    //* háttérfeladat ne kérje le fölöslegesen a suli szerverétől.
    await redis.srem(indexKey, member);
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
      await redis.srem(setKey, ids[i]);
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

//! MINDEN KULCS AZ ALANYRA SZÓL, NEM A JELÉRE. A `subjectStoreKey` a tanári
//! jelet `tanar:` előtaggal írja (ugyanaz a leképezés, mint a böngésző helyi
//! tárolóiban) — az osztályos kulcs viszont VÁLTOZATLAN marad, tehát a már
//! kiadott foglalások és a meglévő lenyomatok érvényben maradnak.
//!
//! MIÉRT KELL EGYÁLTALÁN NÉVTÉR: a `13C` osztály és egy `13C` jelű tanár
//! foglalása közös kulcson OSSZA EGYMÁST — az egyik kiküldés elnyelné a
//! másikat, és a hiba pont az a fajta lenne, ami csak élesben, ritkán, egy
//! elmaradt értesítésként derül ki.
function subjectNs(kind: TimetableSubjectKind, short: string): string {
  return subjectStoreKey(kind, short);
}

//* Az emlékeztető foglalása napra, percre és SZÖVEGRE. Fél nap élettartam: a
//* nap végére magától eltűnik, de egy elhúzódó kimaradást is átvészel.
//*
//! A SZÖVEG AZÉRT KELL, MERT UGYANARRA A PERCRE TÖBB HÍR IS JUTHAT. A duálison
//! lévő diáknak 7:50-kor a duális blokk jár, az osztálytársának a matek; az
//! egyik csoportnak a 214, a másiknak a 305. Egy percre szóló közös kulcs
//! mellett az első kiküldés elnyelné a többit.
export function leaseReminder(
  kind: TimetableSubjectKind,
  short: string,
  dayKey: string,
  startMin: number,
  text: string,
): Promise<boolean> {
  const variant = createHash("sha256").update(text).digest("hex").slice(0, 12);
  return lease(
    `push:sent:${subjectNs(kind, short)}:${dayKey}:${startMin}:${variant}`,
    60 * 60 * 12,
  );
}

//* A változás-értesítés foglalása a különbség lenyomatával. Egy nap: ha
//* ugyanaz a változás egy nap múlva ÚJRA előáll, az már valóban új hír.
export function leaseChange(
  kind: TimetableSubjectKind,
  short: string,
  fingerprint: string,
): Promise<boolean> {
  return lease(
    `push:change:${subjectNs(kind, short)}:${fingerprint}`,
    60 * 60 * 24,
  );
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
  //! A DUÁLIS NAPHOZ A HÉT BETŰJE IS KELL, és az nem az órákon, hanem a napokon
  //! áll. A mező előtti példányokban nincs meg — azokat a háttérfeladat
  //! elavultnak tekinti, és újat kér.
  /** A hét A/B jelölése (`weekLetterOf`), vagy `""`, ha a forrás nem adta. */
  weekLetter?: string;
};

export async function readWeekCache(
  kind: TimetableSubjectKind,
  short: string,
  weekStart: string,
): Promise<CachedWeekLessons | null> {
  if (!redis) return null;
  return await redis.get<CachedWeekLessons>(
    `push:week:${subjectNs(kind, short)}:${weekStart}`,
  );
}

export async function writeWeekCache(
  kind: TimetableSubjectKind,
  short: string,
  weekStart: string,
  lessons: TimetableLesson[],
  weekLetter: string,
): Promise<void> {
  if (!redis) return;
  await redis.set(
    `push:week:${subjectNs(kind, short)}:${weekStart}`,
    { fetchedAt: Date.now(), lessons, weekLetter } satisfies CachedWeekLessons,
    { ex: WEEK_CACHE_SECONDS },
  );
}

//! A LENYOMAT TOVÁBB ÉL, MINT A GYORSÍTÓTÁR. A gyorsítótár azt mondja meg,
//! kell-e ÚJ lekérés; a lenyomat azt, hogy mihez képest változott valami. Ha a
//! kettő együtt járna le, minden félóra után „minden óra új" különbség jönne ki.
const SNAPSHOT_SECONDS = 60 * 60 * 24 * 30;

export async function readSnapshot(
  kind: TimetableSubjectKind,
  short: string,
  weekStart: string,
): Promise<WeekSnapshot | null> {
  if (!redis) return null;
  return await redis.get<WeekSnapshot>(
    `push:snap:${subjectNs(kind, short)}:${weekStart}`,
  );
}

export async function writeSnapshot(
  kind: TimetableSubjectKind,
  short: string,
  weekStart: string,
  snapshot: WeekSnapshot,
): Promise<void> {
  if (!redis) return;
  await redis.set(
    `push:snap:${subjectNs(kind, short)}:${weekStart}`,
    snapshot,
    {
      ex: SNAPSHOT_SECONDS,
    },
  );
}

//* ---------------------------------------------------------------------------
//* SZAKKÖRÖK
//* ---------------------------------------------------------------------------
//! KÜLÖN KULCSTÉR, NEM HARMADIK „ALANY". Az osztály és a tanár órarend-alany:
//! heti kártyák, összevonás, lenyomat. A szakkör nem az — a heti alkalmait a
//! `club-schedule.ts` számolja ki. Ha a `SUBJECT_KINDS`-ba kerülne, minden
//! órarend-specifikus ág (`getTimetableWeek`, `diffWeeks`) megkapná, és
//! mindegyikben kivételt kellene tenni. Itt csak a feliratkozók halmaza, a
//! lefoglalt kulcsok és a „kiesett alkalmak" lenyomata él.
const CLUB_KEY = (slug: string) => `push:club:${slug}`;
const CLUB_INDEX = "push:clubs";

export async function subscribedClubs(): Promise<string[]> {
  if (!redis) return [];
  return (await redis.smembers(CLUB_INDEX)) ?? [];
}

export function clubSubscribersOf(slug: string): Promise<PushSubscription[]> {
  return membersOf(CLUB_KEY(slug), CLUB_INDEX, slug);
}

export function leaseClubReminder(sessionId: string): Promise<boolean> {
  return lease(`push:club-sent:${sessionId}`, 60 * 60 * 12);
}

export function leaseClubChange(
  slug: string,
  fingerprint: string,
): Promise<boolean> {
  return lease(`push:club-change:${slug}:${fingerprint}`, 60 * 60 * 24 * 7);
}

//* A héten eddig látott „nincs" alkalmak azonosítói (lásd `newlyGone`).
export async function readClubGone(
  slug: string,
  weekStart: string,
): Promise<string[] | null> {
  if (!redis) return null;
  return await redis.get<string[]>(`push:club-gone:${slug}:${weekStart}`);
}

export async function writeClubGone(
  slug: string,
  weekStart: string,
  ids: string[],
): Promise<void> {
  if (!redis) return;
  await redis.set(`push:club-gone:${slug}:${weekStart}`, ids, {
    ex: SNAPSHOT_SECONDS,
  });
}

//* ---------------------------------------------------------------------------
//* VERSENYEK
//* ---------------------------------------------------------------------------
//* Ugyanaz a felépítés, mint a szakköröknél, saját kulcstérben.
const CONTEST_KEY = (slug: string) => `push:contest:${slug}`;
const CONTEST_INDEX = "push:contests";

export async function subscribedContests(): Promise<string[]> {
  if (!redis) return [];
  return (await redis.smembers(CONTEST_INDEX)) ?? [];
}

export function contestSubscribersOf(
  slug: string,
): Promise<PushSubscription[]> {
  return membersOf(CONTEST_KEY(slug), CONTEST_INDEX, slug);
}

//* Egy verseny egy fajta emlékeztetője egyszer — a kulcs a nappal együtt.
export function leaseContestReminder(
  slug: string,
  kind: string,
  dayKey: string,
): Promise<boolean> {
  return lease(`push:contest-sent:${slug}:${kind}:${dayKey}`, 60 * 60 * 24 * 2);
}
