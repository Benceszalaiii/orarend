import "server-only";

//* ---------------------------------------------------------------------------
//* ÜRES TERMEK — A LEKÉRÉS ÉS A GYORSÍTÓTÁR
//* ---------------------------------------------------------------------------
//! MIÉRT KELL EGYÁLTALÁN 71 KÉRÉS. A `timetable/cards` PONTOSAN EGY szűrőt
//! fogad el (`class`, `teacher` VAGY `classroom`) — nincs végpont, ami egyszerre
//! adná az összes termet. (Ellenőrizve: mindhárom szűrőt üresen hagyva a válasz
//! nem üres és nem is teljes, hanem CSENDBEN az első osztály — `09A` —
//! órarendje; a `classroom: "102,103"` alakú felsorolásra pedig nulla kártya
//! jön. Egyik sem használható.) Egy hét teremfoglaltsága tehát annyi kérés,
//! ahány terem van: jelenleg 71.
//!
//! ─── AMI KÉZENFEKVŐ LENNE, ÉS MÉGIS ROSSZ ──────────────────────────────────
//! A `full: true` egyetlen kéréssel adja egy terem EGÉSZ ÉVES, ismétlődő
//! órarendjét (A és B hetes kártyákkal együtt), és ebből elvileg minden hét
//! kiszámolható — 71 kérés az egész tanévre, nem hetente. Kipróbáltuk, és NEM
//! IGAZ: a `full: true` a SABLONT adja, nem a hetet.
//!
//!   • 2026-09-14 (B hét), 102-es terem: a heti lekérésben ott van egy
//!     „Szoftverfejlesztő mk. értekezlet", a sablonban nincs. A B1-esben
//!     ugyanazon a héten egy „Bemeneti mérés" ÜLI MEG a termet a rendes `itaI`
//!     óra helyett — a sablon a rendes órát mutatja, rossz időpontban.
//!   • 2026-09-18 péntek `teachingDay: false` („Tantestületi kirándulás"), a
//!     heti lekérésben ezért egyetlen pénteki kártya sincs — a sablonban a
//!     teljes péntek ott áll.
//!
//! Vagyis a sablon pont az EGYSZERI foglalásokról nem tud, és pont azok miatt
//! kérdezi meg valaki, hogy szabad-e a terem. A hetenkénti lekérés nem
//! pazarlás, hanem az egyetlen igaz válasz.

import {
  bookingsOfRoom,
  type FreeRoomsDay,
  parseRoomDays,
  parseRoomPeriods,
  type RawRoomCardsResponse,
  type RoomWeek,
  type WeekOccupancy,
} from "./free-rooms";
import {
  API_BASE,
  FETCH_TIMEOUT_MS,
  SIDE_FETCH_TIMEOUT_MS,
} from "./jedlik-api";
import { budapestNow } from "./push-plan";
import { loadSchoolPlan } from "./school-calendar";
import { addDays, mondayOf, type TimetablePeriod } from "./timetable";

//* ---------------------------------------------------------------------------
//* A TERHELÉS NÉGY KORLÁTJA
//* ---------------------------------------------------------------------------
//! Egy seprés 71 kérés a Jedlikinfo felé. Négy egymástól független korlát
//! gondoskodik arról, hogy ebből ne legyen se kérésözön, se időzár:
//!
//!  1. ABLAK — csak a mai hét környéke kérhető le egyáltalán (lásd lentebb).
//!     Ez az EGYETLEN korlát, ami a lekérhető hetek SZÁMÁT is megfogja: enélkül
//!     elég volna 200 különböző dátumot végigkérni, és minden egyes dátum egy
//!     újabb 71-es seprést indítana.
//!  2. ÓRÁS GYORSÍTÓTÁR — egy hét óránként legfeljebb egyszer kerül lekérésre.
//!  3. EGYSZERRE EGY SEPRÉS — hetenként közös ígéret (nem indul két azonos
//!     seprés), és seprések között sorbanállás (nem fut két KÜLÖNBÖZŐ hét
//!     seprése egyszerre).
//!  4. EGYIDEJŰSÉG — egy seprésen belül egyszerre legfeljebb ennyi kérés megy.
//!
//! A legrosszabb eset így: 5 hét × 71 kérés óránként = 355 kérés/óra, és soha
//! nem több 4-nél egyszerre. A szokásos eset ennek a töredéke: a mai hét
//! óránként egyszer, 71 kérés.

const OCCUPANCY_TTL_MS = 60 * 60_000;
//* A teremlista tanévnyi állandó — egy lapélet kibírja. (Ugyanaz a
//* megfontolás, mint a csengetési rendek nevénél a `school-calendar.ts`-ben.)
const ROOMS_TTL_MS = 12 * 60 * 60_000;

//! NÉGY EGYSZERRE, NEM TÖBB. A forrás gyors (71 terem ötösével 311 ms, p50
//! 20 ms, egyetlen 429 nélkül), tehát nem a sebesség miatt fogjuk vissza: egy
//! iskolai szerverre nem zúdítunk 71 párhuzamos kapcsolatot azért, mert
//! elbírná. Négyesével a seprés így is fél másodperc alatt megvan.
const SWEEP_CONCURRENCY = 4;

//! MEDDIG ÉR EL A KÉRDÉS. „Melyik terem üres" jelen idejű kérdés: a mai hét, és
//! legfeljebb a következő néhány. Ez nem szűkítés a szűkítés kedvéért — ez tartja
//! VÉGESEN a lekérhető hetek számát (lásd az 1. korlátot).
const WEEKS_BACK = 1;
const WEEKS_FORWARD = 3;

//* ---------------------------------------------------------------------------
//* GYORSÍTÓTÁR
//* ---------------------------------------------------------------------------
//! A HIBÁT NEM TARTJUK MEG, A RÉGI VÁLASZT IGEN. Ha egy seprés elbukik, a
//! LEJÁRT bejegyzés még mindig jobb a semminél — egy órája készült
//! teremfoglaltság szinte biztosan igaz. Amit viszont soha nem teszünk el: egy
//! üres vagy csonka választ FRISSKÉNT. A lejárt példány kelte a válaszban áll
//! (`fetchedAt`), hogy a hívó ki tudja írni.

const weekCache = new Map<string, WeekOccupancy>();
const weekInFlight = new Map<string, Promise<WeekOccupancy | null>>();

let roomsCache: {
  at: number;
  rooms: { short: string; name: string }[];
} | null = null;
let roomsInFlight: Promise<{ short: string; name: string }[] | null> | null =
  null;

//! SEPRÉSEK KÖZÖTT SORBANÁLLÁS. A hetenkénti közös ígéret azt akadályozza meg,
//! hogy UGYANAZ a hét kétszer induljon el; ez itt azt, hogy KÜLÖNBÖZŐ hetek
//! seprése egymásra torlódjon. Enélkül négy hét egyidejű kérése 284 párhuzamos
//! kérés lenne — pontosan az, amit a 4-es egyidejűség meg akar előzni.
let sweepQueue: Promise<unknown> = Promise.resolve();

function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const next = sweepQueue.then(task, task);
  //* A sor nem törhet meg egy elbukott seprésen.
  sweepQueue = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

async function pooled<T, R>(
  items: readonly T[],
  limit: number,
  run: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const worker = async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await run(items[index]);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker),
  );
  return results;
}

//* ---------------------------------------------------------------------------
//* AZ ABLAK
//* ---------------------------------------------------------------------------

/** A lekérhető hetek első napjai (hétfők), a mai héthez képest. */
export function servableWeeks(now = new Date()): string[] {
  const thisMonday = mondayOf(budapestNow(now).dayKey);
  const weeks: string[] = [];
  for (let i = -WEEKS_BACK; i <= WEEKS_FORWARD; i++) {
    weeks.push(addDays(thisMonday, i * 7));
  }
  return weeks;
}

/** Lekérhető-e egyáltalán ez a nap. A hívó ebből ad 400-at, nem 500-at. */
export function isServableDate(dateKey: string, now = new Date()): boolean {
  return servableWeeks(now).includes(mondayOf(dateKey));
}

//* ---------------------------------------------------------------------------
//* LEKÉRÉS
//* ---------------------------------------------------------------------------

//! A 429 AZ EGYETLEN HIBA, AMIT ÉRDEMES ÚJRAPRÓBÁLNI. A többi (404, 500,
//! időtúllépés) egy termen belül úgysem múlik el fél másodperc alatt, és 71
//! terem újrapróbálása pont az a kérésözön, amit kerülni akarunk. A `Retry-After`
//! fejlécet elfogadjuk, de megfogjuk: egy terem újrapróbálása öt másodpercnél
//! tovább nem tarthatja fel a seprést — a hiányzó terem `unknown` lesz, ami
//! rossz, de nem rosszabb, mint egy percekig lógó válasz.
const RETRY_AFTER_CAP_MS = 5_000;

function retryDelayMs(res: Response): number {
  const header = res.headers.get("retry-after");
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds > 0) {
    return Math.min(seconds * 1000, RETRY_AFTER_CAP_MS);
  }
  return 1_000;
}

async function fetchRoomWeek(
  room: string,
  weekStart: string,
): Promise<RawRoomCardsResponse | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(`${API_BASE}/timetable/cards`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        //! PONTOSAN EGY SZŰRŐ. Lásd a fejlécet: két kitöltött mezőből nem
        //! metszet lesz, üres mindháromból pedig CSENDBEN az első osztály.
        body: JSON.stringify({
          class: "",
          classroom: room,
          teacher: "",
          full: false,
          fromDate: weekStart,
        }),
        cache: "no-store",
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (res.status === 429 && attempt === 0) {
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs(res)));
        continue;
      }
      if (!res.ok) return null;
      return (await res.json()) as RawRoomCardsResponse;
    } catch {
      //* Időtúllépés, hálózati hiba, értelmezhetetlen válasz — mind ugyanaz:
      //* erről a teremről nem tudunk semmit. A hívó `unknown`-ba teszi.
      return null;
    }
  }
  return null;
}

async function loadRoomList(): Promise<
  { short: string; name: string }[] | null
> {
  if (roomsCache && Date.now() - roomsCache.at < ROOMS_TTL_MS) {
    return roomsCache.rooms;
  }
  if (roomsInFlight) return roomsInFlight;

  const run = (async () => {
    try {
      const res = await fetch(`${API_BASE}/timetable/classrooms`, {
        signal: AbortSignal.timeout(SIDE_FETCH_TIMEOUT_MS),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as unknown;
      if (!Array.isArray(data)) return null;
      const rooms = data
        .map((row) => row as { short?: unknown; name?: unknown })
        .filter(
          (row): row is { short: string; name?: string } =>
            typeof row.short === "string" && row.short.length > 0,
        )
        .map((row) => ({
          short: row.short,
          name: typeof row.name === "string" && row.name ? row.name : row.short,
        }));
      if (rooms.length === 0) return null;
      roomsCache = { at: Date.now(), rooms };
      return rooms;
    } catch {
      return null;
    } finally {
      roomsInFlight = null;
    }
  })();

  roomsInFlight = run;
  return run;
}

//! A TANÉV RENDJE ITT IS KELL, ÉS ITT IS ELMARADHAT. Egy tanítás nélküli napon
//! minden terem „szabad" — igaz, de haszontalan válasz, ha nem derül ki, hogy
//! aznap nincs is iskola. A `loadSchoolPlan` amúgy is gyorsítótárazva van, egy
//! havi kérésből; ha nem jön meg, a napok `teaching: null` marad, és a válasz
//! pontosan olyan, amilyen enélkül lenne.
async function withTeachingDays(days: FreeRoomsDay[]): Promise<FreeRoomsDay[]> {
  const plan = await loadSchoolPlan(days.map((d) => d.dateKey));
  if (plan.size === 0) return days;
  return days.map((day) => {
    const planned = plan.get(day.dateKey);
    if (!planned) return day;
    return {
      ...day,
      teaching: planned.teaching,
      //* A hét betűjét a kártyák válasza is hozza; ha ott üres maradt (szünet),
      //* a tanév rendje még tudhatja.
      week: day.week || planned.week,
    };
  });
}

async function sweepWeek(weekStart: string): Promise<WeekOccupancy | null> {
  const rooms = await loadRoomList();
  //! TEREMLISTA NÉLKÜL NINCS VÁLASZ. Nem tudjuk, mit nem kérdeztünk meg —
  //! ilyenkor a „nincs adat" az egyetlen igaz válasz, egy csonka lista pedig a
  //! legrosszabb: pont azt a termet hagyná ki, amelyik szabad lett volna.
  if (!rooms) return null;

  const responses = await pooled(rooms, SWEEP_CONCURRENCY, (room) =>
    fetchRoomWeek(room.short, weekStart).then((data) => ({ room, data })),
  );

  //* A hét váza (napok, csengetés) minden válaszban ugyanaz — az elsőt vesszük,
  //* amelyik egyáltalán hozott napokat.
  let days: FreeRoomsDay[] = [];
  let periods: TimetablePeriod[] = [];
  for (const { data } of responses) {
    if (!data) continue;
    if (days.length === 0) days = parseRoomDays(data.days ?? []);
    if (periods.length === 0) periods = parseRoomPeriods(data.periods ?? []);
    if (days.length > 0 && periods.length > 0) break;
  }
  if (days.length === 0) return null;

  const withPlan = await withTeachingDays(days);

  const occupied: RoomWeek[] = [];
  const unknown: string[] = [];
  for (const { room, data } of responses) {
    if (!data) {
      unknown.push(room.short);
      continue;
    }
    occupied.push({
      short: room.short,
      name: room.name,
      bookings: bookingsOfRoom(data.cards ?? [], withPlan),
    });
  }

  return {
    weekStart,
    fetchedAt: Date.now(),
    days: withPlan,
    periods,
    rooms: occupied,
    unknown,
  };
}

/**
 * Egy hét teremfoglaltsága — gyorsítótárból, ha friss; különben egy seprésből.
 *
 * `null`, ha még soha nem sikerült lekérni ezt a hetet. Lejárt, de meglévő
 * példányt inkább visszaadunk, mint semmit — a kelte a `fetchedAt`-ben áll.
 */
export async function loadWeekOccupancy(
  weekStart: string,
): Promise<WeekOccupancy | null> {
  const monday = mondayOf(weekStart);
  const cached = weekCache.get(monday);
  if (cached && Date.now() - cached.fetchedAt < OCCUPANCY_TTL_MS) return cached;

  const running = weekInFlight.get(monday);
  if (running) return running;

  const run = enqueue(async () => {
    //! A SORBANÁLLÁS ALATT MÁR MEGJÖHETETT. Amíg ez a seprés a sorban várt, egy
    //! korábbi ugyanerre a hétre befejeződhetett — akkor nincs mit lekérni.
    const fresh = weekCache.get(monday);
    if (fresh && Date.now() - fresh.fetchedAt < OCCUPANCY_TTL_MS) return fresh;

    const swept = await sweepWeek(monday);
    if (swept) {
      weekCache.set(monday, swept);
      prune();
      return swept;
    }
    //* Sikertelen seprés: a lejárt példány jobb a semminél.
    return weekCache.get(monday) ?? null;
  }).finally(() => {
    weekInFlight.delete(monday);
  });

  weekInFlight.set(monday, run);
  return run;
}

//! A HOSSZAN ÉLŐ PÉLDÁNY NEM GYŰJTHET RÉGI HETEKET. Az ablak nap mint nap
//! továbbcsúszik; ami kiesett belőle, azt már nem is lehet lekérni, tehát
//! elfoglalni sem érdemes vele a memóriát.
function prune(): void {
  const servable = new Set(servableWeeks());
  for (const key of weekCache.keys()) {
    if (!servable.has(key)) weekCache.delete(key);
  }
}
