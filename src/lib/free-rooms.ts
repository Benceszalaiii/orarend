//* ---------------------------------------------------------------------------
//* ÜRES TERMEK — TISZTA SZÁMÍTÁS
//* ---------------------------------------------------------------------------
//! ITT NINCS SE HÁLÓZAT, SE GYORSÍTÓTÁR, SE `Date.now()` REJTVE. A lekérést és
//! a gyorsítótárat a `free-rooms-source.ts` végzi; ez a modul csak a NYERS
//! válaszból csinál választ. Ugyanaz a megfontolás, mint a `push-plan.ts`-ben:
//! ami tiszta függvény, azt bármelyik időpontra végig lehet játszani anélkül,
//! hogy meg kellene várni egy tanítási napot.
//!
//! ─── AMIT EZ A MODUL SOHA NEM ÁLLÍT ────────────────────────────────────────
//! Egy teremről HÁROM állapot lehetséges: szabad, foglalt, és NEM TUDJUK. A
//! harmadik nem elméleti: 71 terem lekéréséből egy is elbukhat. Aki egy
//! „szabad" feliratra elindul egy foglalt terembe, rosszabbul jár, mint aki
//! meg sem kérdezte — ezért a sikertelen lekérésű terem NEM kerül a szabadok
//! közé, hanem külön, néven nevezve marad (`unknown`).

import type { TimetablePeriod } from "./timetable";

//! ─── A HARMADIK OLVASAT: A TEREM ÓRARENDJE ─────────────────────────────────
//! A `timetable.ts` a kártya két alsó sarkának KÉT jelentését írja le; a
//! `classroom` szűrő a HARMADIKAT adja. A minta végig ugyanaz: a sarkokba az a
//! két dimenzió kerül, amelyikre NEM szűrtünk.
//!
//!   osztály órarendje:  bal = TEREM,   jobb = TANÁR
//!   tanár órarendje:    bal = OSZTÁLY, jobb = TEREM
//!   TEREM órarendje:    bal = TANÁR,   jobb = OSZTÁLY
//!
//! Ellenőrizve a válaszon: a 102-es terem egy kártyáján `leftBottom: "LM"` /
//! `leftBottomTitle: "Mária Ivett Lipták"` és `rightBottom: "10E"`, a `type`
//! mező pedig `"classroom"`. Ha ez valaha megfordulna, a `cardToBooking` az
//! egyetlen hely, ami hazudni kezd.
export type RawRoomCard = {
  date?: string;
  text?: string;
  textTitle?: string;
  leftBottom?: string;
  leftBottomTitle?: string;
  rightBottom?: string;
  rightBottomTitle?: string;
  groupName?: string;
  week?: string;
  dayOfWeek?: number;
  startMinuteFromMidnight?: number;
  endMinuteFromMidnight?: number;
  type?: string;
};

export type RawRoomDay = {
  name?: string;
  date?: string;
  week?: string;
  dayOfWeek?: number;
};

export type RawRoomPeriod = {
  number?: number;
  startHour?: number;
  startMinute?: number;
  endHour?: number;
  endMinute?: number;
};

export type RawRoomCardsResponse = {
  cards?: RawRoomCard[];
  days?: RawRoomDay[];
  periods?: RawRoomPeriod[];
};

/** Egy foglalás: valami elfoglalja a termet egy naptól-percig tartó sávban. */
export type RoomBooking = {
  /** `YYYY-MM-DD`. */
  dateKey: string;
  dayOfWeek: number;
  startMin: number;
  endMin: number;
  /** A tantárgy (vagy az esemény) teljes neve. */
  subject: string;
  /** Az osztály jele — üres, ha a kártya nem osztályhoz tartozik (értekezlet). */
  classShort: string;
  /** A tanár neve — üres, ha a forrás nem mond tanárt. */
  teacher: string;
  /** `"A"`, `"B"` vagy `"AB"`, ahogy a forrás adja. */
  week: string;
};

export type RoomWeek = {
  short: string;
  name: string;
  bookings: RoomBooking[];
};

export type FreeRoomsDay = {
  dateKey: string;
  name: string;
  dayOfWeek: number;
  /** `"A"` vagy `"B"`; üres, ha a forrás nem mond hetet. */
  week: string;
  /** Tanítási nap-e a tanév rendje szerint. `null` = nem tudjuk. */
  teaching: boolean | null;
};

export type WeekOccupancy = {
  weekStart: string;
  /** Epoch ms — mikor készült ez a pillanatkép. */
  fetchedAt: number;
  days: FreeRoomsDay[];
  periods: TimetablePeriod[];
  rooms: RoomWeek[];
  //! Amiről NEM tudunk nyilatkozni. Lásd a fejlécet: ezek nem szabadok, csak
  //! ismeretlenek, és a hívónak külön kell látnia őket.
  unknown: string[];
};

export type RoomStatus = {
  short: string;
  name: string;
  /** Ami elfoglalja a termet a kért percben — `null`, ha szabad. */
  booking: RoomBooking | null;
  //! MEDDIG SZABAD. Egy „szabad" felirat magában félrevezető: két perc múlva
  //! kezdődő óra alatt a terem technikailag üres, de nincs értelme bemenni.
  //! `null` = aznap már nincs több foglalás.
  freeUntil: number | null;
};

export type FreeRoomsAnswer = {
  weekStart: string;
  dateKey: string;
  /** Percek éjféltől — a kérdezett pillanat. */
  minute: number;
  /** A nap a hétből; `null`, ha a kért dátum nincs a lekért hétben. */
  day: FreeRoomsDay | null;
  periods: TimetablePeriod[];
  free: RoomStatus[];
  busy: RoomStatus[];
  unknown: string[];
  fetchedAt: number;
};

function toDateKey(apiDate: string): string {
  return apiDate.replaceAll(".", "-").slice(0, 10);
}

//! AZ A/B HÉT SZABÁLYA SZÓ SZERINT UGYANAZ, MINT AZ ÓRARENDÉ. A `timetable.ts`
//! ugyanezt a szűrést végzi a kártyákon; ha a kettő elcsúszna, ugyanarra az
//! órára az órarend azt mondaná „van", a teremkereső meg azt, hogy „szabad".
//! Egy B hetes kártya nem tartozik az A hétre — de az `"AB"` és a hét nélküli
//! nap mindkettőre igen.
export function cardBelongsToWeek(cardWeek: string, dayWeek: string): boolean {
  if (!dayWeek || !cardWeek || cardWeek === "AB") return true;
  return cardWeek.includes(dayWeek);
}

export function cardToBooking(card: RawRoomCard): RoomBooking | null {
  const start = card.startMinuteFromMidnight;
  const end = card.endMinuteFromMidnight;
  const dayOfWeek = card.dayOfWeek;
  //* Idő nélkül a kártya nem foglal le semmit — inkább kihagyjuk, mint hogy egy
  //* nullától nulláig tartó sávval hamis szabadságot állítsunk.
  if (
    typeof start !== "number" ||
    typeof end !== "number" ||
    typeof dayOfWeek !== "number" ||
    end <= start
  ) {
    return null;
  }
  return {
    dateKey: toDateKey(card.date ?? ""),
    dayOfWeek,
    startMin: start,
    endMin: end,
    subject: card.textTitle || card.text || "",
    //* A terem nézetében a jobb sarok az OSZTÁLY, a bal a TANÁR — lásd fent.
    classShort: card.rightBottom ?? "",
    teacher: card.leftBottomTitle || card.leftBottom || "",
    week: card.week ?? "",
  };
}

export function parseRoomPeriods(raw: RawRoomPeriod[]): TimetablePeriod[] {
  const periods: TimetablePeriod[] = [];
  for (const p of raw) {
    if (
      typeof p.number !== "number" ||
      typeof p.startHour !== "number" ||
      typeof p.startMinute !== "number" ||
      typeof p.endHour !== "number" ||
      typeof p.endMinute !== "number"
    ) {
      continue;
    }
    periods.push({
      number: p.number,
      startMin: p.startHour * 60 + p.startMinute,
      endMin: p.endHour * 60 + p.endMinute,
    });
  }
  return periods;
}

export function parseRoomDays(raw: RawRoomDay[]): FreeRoomsDay[] {
  const days: FreeRoomsDay[] = [];
  for (const d of raw) {
    if (typeof d.dayOfWeek !== "number" || !d.date) continue;
    days.push({
      dateKey: toDateKey(d.date),
      name: d.name ?? "",
      dayOfWeek: d.dayOfWeek,
      week: d.week ?? "",
      teaching: null,
    });
  }
  return days;
}

/** Egy terem heti foglaltsága a nyers válaszból, az A/B hét már feloldva. */
export function bookingsOfRoom(
  cards: readonly RawRoomCard[],
  days: readonly FreeRoomsDay[],
): RoomBooking[] {
  const weekOfDay = new Map(days.map((d) => [d.dayOfWeek, d.week] as const));
  const bookings: RoomBooking[] = [];
  for (const card of cards) {
    const dayWeek = weekOfDay.get(card.dayOfWeek ?? -1) ?? "";
    if (!cardBelongsToWeek(card.week ?? "", dayWeek)) continue;
    const booking = cardToBooking(card);
    if (booking) bookings.push(booking);
  }
  return bookings;
}

//! FÉLIG NYITOTT SÁV. A 8:45-kor végződő óra 8:45-kor már NEM foglalja a
//! termet — különben minden órahatáron minden terem foglaltnak látszana.
function covers(booking: RoomBooking, minute: number): boolean {
  return booking.startMin <= minute && minute < booking.endMin;
}

/**
 * Melyik terem szabad egy adott napon, egy adott percben.
 *
 * A `minute` percek száma éjféltől (budapesti idő szerint) — ugyanaz a mérték,
 * amit a kártyák `startMinuteFromMidnight` mezője használ.
 */
export function freeRoomsAt(
  occupancy: WeekOccupancy,
  dateKey: string,
  minute: number,
): FreeRoomsAnswer {
  const day = occupancy.days.find((d) => d.dateKey === dateKey) ?? null;
  const free: RoomStatus[] = [];
  const busy: RoomStatus[] = [];

  for (const room of occupancy.rooms) {
    //* Csak az aznapi foglalások számítanak; a hét többi napja nem mond semmit
    //* erről a percről.
    const today = day
      ? room.bookings.filter((b) => b.dayOfWeek === day.dayOfWeek)
      : [];
    const current = today.find((b) => covers(b, minute)) ?? null;
    if (current) {
      busy.push({
        short: room.short,
        name: room.name,
        booking: current,
        freeUntil: null,
      });
      continue;
    }
    //* A következő foglalás kezdete adja, meddig van értelme bemenni.
    const nextStart = today
      .filter((b) => b.startMin > minute)
      .reduce<number | null>(
        (soonest, b) =>
          soonest === null || b.startMin < soonest ? b.startMin : soonest,
        null,
      );
    free.push({
      short: room.short,
      name: room.name,
      booking: null,
      freeUntil: nextStart,
    });
  }

  //* A szabad termek közül az a hasznos, amelyik a LEGTOVÁBB az; a végén a
  //* rögtön kezdődő órák. A holtversenyt a terem jele dönti, hogy a válasz
  //* sorrendje kérésről kérésre ugyanaz legyen.
  free.sort((a, b) => {
    const av = a.freeUntil ?? Number.POSITIVE_INFINITY;
    const bv = b.freeUntil ?? Number.POSITIVE_INFINITY;
    return bv - av || a.short.localeCompare(b.short, "hu");
  });
  busy.sort((a, b) => a.short.localeCompare(b.short, "hu"));

  return {
    weekStart: occupancy.weekStart,
    dateKey,
    minute,
    day,
    periods: occupancy.periods,
    free,
    busy,
    unknown: occupancy.unknown,
    fetchedAt: occupancy.fetchedAt,
  };
}
