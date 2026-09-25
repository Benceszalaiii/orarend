import type { ClubKind, ClubSlotSource, ClubTrack } from "./clubs";
import type { RoomBooking, WeekOccupancy } from "./free-rooms";

//! ═══════════════════════════════════════════════════════════════════════════
//! SZAKKÖR-IDŐPONTOK ÉS A JEDLIKINFO — AZ ILLESZTÉS
//! ═══════════════════════════════════════════════════════════════════════════
//! A `ClubSlot` VÁRAKOZÁS („kedden 7:10-kor a 207-ben BNM tartja"); a
//! teremkereső heti seprése a VALÓSÁG (a 207 kártyái azon a héten). Ez a modul
//! a kettőt veti össze, és minden alkalomhoz kimondja, MENNYIRE tudjuk:
//!
//!   confirmed  — a kártya ott van az órarendben, osztály nélkül, a vezető
//!                tanárral, átfedő időben. Az IDŐT a kártyától vesszük: ha a
//!                kettő eltér, a Jedlikinfo nyer (ugyanaz a döntés, mint a
//!                kezdő listánál).
//!   declared   — csak a vezető tanár szerint van (`ORGANIZER` forrás).
//!   missing    — a terem órarendjét megnéztük, és azon a héten NINCS benne.
//!                Nem állítjuk, hogy elmarad — azt mondjuk, ami igaz: az
//!                órarendben nem szerepel.
//!   no-school  — a tanév rendje szerint aznap nincs tanítás.
//!   unknown    — nem tudtuk megnézni (a terem lekérése elbukott, vagy a hét a
//!                lekérhető ablakon kívül esik).
//!
//! TISZTA FÜGGVÉNYEK: se hálózat, se adatbázis, se `Date.now()`. A lekérést a
//! `free-rooms-source.ts`, a szakköröket a `club-store.ts` adja.
//! ═══════════════════════════════════════════════════════════════════════════

export type ClubSessionStatus =
  | "confirmed"
  | "declared"
  | "missing"
  | "no-school"
  | "unknown";

//! MINDEN SZAKKÖR-ALKALOM MEGMONDJA, HONNAN TUDJUK. A rács kártyája egyformán
//! néz ki, akár az iskola órarendje igazolja, akár csak a tanár mondta — a
//! különbség a részletlapon és a szakkör lapján hangzik el, ugyanezekkel a
//! mondatokkal.
export const SESSION_STATUS_TEXT: Record<ClubSessionStatus, string> = {
  confirmed: "Az iskola órarendjében ezen a héten is szerepel.",
  declared:
    "A szakkör vezetője szerint. Az iskola órarendjében nem szerepel, ezért nem tudjuk ellenőrizni.",
  missing:
    "Ezen a héten nincs benne az iskola órarendjében. Mielőtt elindulsz, kérdezd meg a vezetőjét.",
  "no-school": "Aznap az iskola rendje szerint nincs tanítás.",
  unknown:
    "Most nem tudtuk ellenőrizni az iskola órarendjében — a megszokott időpontot mutatjuk.",
};

//* Rövid felirat a listákba (a szakkör lapjának heti sorai).
export const SESSION_STATUS_SHORT: Record<ClubSessionStatus, string> = {
  confirmed: "Az órarendben",
  declared: "A tanár szerint",
  missing: "Nincs az órarendben",
  "no-school": "Nincs tanítás",
  unknown: "Nem ellenőrizhető",
};

//* Az áthúzott rácskártya plakettje a részletlapon.
export const SESSION_STATUS_BADGE: Record<ClubSessionStatus, string> = {
  ...SESSION_STATUS_SHORT,
  confirmed: "Elmarad",
  declared: "Elmarad",
  unknown: "Elmarad",
};

export type ScheduleSlot = {
  id: string;
  weekday: number;
  startMinute: number;
  endMinute: number;
  room: string | null;
  teachers: string[];
  source: ClubSlotSource;
  /** `YYYY-MM-DD` vagy `null` (nyitott). */
  validFrom: string | null;
  validUntil: string | null;
};

export type ScheduleClub = {
  id: string;
  slug: string;
  name: string;
  kind: ClubKind;
  grades: number[];
  classes: string[];
  tracks: ClubTrack[];
  audienceNote: string | null;
  organizers: string[];
  slots: ScheduleSlot[];
};

export type ClubSession = {
  /** Hetente egyedi: slot + nap. */
  id: string;
  slotId: string;
  clubSlug: string;
  clubName: string;
  dateKey: string;
  dayOfWeek: number;
  startMin: number;
  endMin: number;
  room: string;
  status: ClubSessionStatus;
  //! JAVASLAT, NEM A DIÁK SZAKKÖRE. Az osztályának szóló vagy mindenkinek
  //! nyitott szakkör alkalma, amit a diák kifejezetten kért a rácsára
  //! (`club-suggest-pref.ts`). A rács
  //! halványan rajzolja, és csak ott, ahol a diáknak nincs órája.
  suggested?: boolean;
};

//! A JELEK ÖSSZEVETÉSE KIS- ÉS NAGYBETŰTŐL FÜGGETLEN. A teremjel a Jedlikinfóban
//! `Stúdió`, egy kézzel írt slotban lehet `stúdió`; a tanárjel ugyanígy. Egy
//! betűméret miatt egy szakkör nem eshet ki az órarendből.
function sameKey(a: string, b: string): boolean {
  return (
    a.normalize("NFC").trim().toLowerCase() ===
    b.normalize("NFC").trim().toLowerCase()
  );
}

//* A hétfőhöz képest `weekday - 1` nappal később — naptári számítás, időzóna
//* nélkül (a `YYYY-MM-DD` UTC-éjfélként értelmezve).
function dayOfWeekKey(weekStart: string, weekday: number): string {
  const date = new Date(`${weekStart}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + weekday - 1);
  return date.toISOString().slice(0, 10);
}

function withinValidity(slot: ScheduleSlot, dateKey: string): boolean {
  if (slot.validFrom && dateKey < slot.validFrom) return false;
  if (slot.validUntil && dateKey > slot.validUntil) return false;
  return true;
}

//! EZ A KÁRTYA EZ-E A SZAKKÖR. Négy feltétel, mind kell:
//!   • ugyanaz a nap,
//!   • OSZTÁLY NÉLKÜLI kártya — egy rendes órát soha nem nevezünk szakkörnek,
//!     akkor sem, ha a szakkör tanára tartja ugyanabban a teremben,
//!   • a slot egyik vezetője tartja,
//!   • az idejük átfed (félig nyitott sávok: a 7:55-kor végződő nem fed át a
//!     7:55-kor kezdődővel).
export function bookingMatchesSlot(
  booking: RoomBooking,
  slot: Pick<
    ScheduleSlot,
    "weekday" | "startMinute" | "endMinute" | "teachers"
  >,
): boolean {
  return (
    booking.dayOfWeek === slot.weekday &&
    booking.classShort === "" &&
    slot.teachers.some((t) => sameKey(t, booking.teacherShort)) &&
    booking.startMin < slot.endMinute &&
    slot.startMinute < booking.endMin
  );
}

function statusOf(
  slot: ScheduleSlot,
  occupancy: WeekOccupancy | null,
): { status: ClubSessionStatus; booking: RoomBooking | null } {
  const day = occupancy?.days.find((d) => d.dayOfWeek === slot.weekday);
  //! A TANÍTÁS NÉLKÜLI NAP ELŐBB JÖN, MINT A FORRÁS. Egy csak-tanár-szerinti
  //! szakkör sincs meg egy tantestületi kiránduláson.
  if (day?.teaching === false) return { status: "no-school", booking: null };
  if (slot.source === "ORGANIZER") return { status: "declared", booking: null };
  if (!occupancy || !slot.room) return { status: "unknown", booking: null };

  const room = slot.room;
  if (occupancy.unknown.some((short) => sameKey(short, room))) {
    return { status: "unknown", booking: null };
  }
  const roomWeek = occupancy.rooms.find((r) => sameKey(r.short, room));
  //* Nem sepertük ezt a termet (a részleges lekérésben nem szerepelt) — erről
  //* sem mondhatunk semmit.
  if (!roomWeek) return { status: "unknown", booking: null };

  const booking = roomWeek.bookings.find((b) => bookingMatchesSlot(b, slot));
  return booking
    ? { status: "confirmed", booking }
    : { status: "missing", booking: null };
}

/**
 * Egy hét szakkör-alkalmai, a Jedlikinfóval összevetve.
 *
 * Az `occupancy` lehet a teljes seprés vagy csak a szükséges termek; `null`,
 * ha a hét nem kérhető le — ilyenkor minden órarendi slot `unknown`.
 */
export function sessionsOfWeek(
  clubs: readonly ScheduleClub[],
  occupancy: WeekOccupancy | null,
  weekStart: string,
): ClubSession[] {
  const sessions: ClubSession[] = [];
  for (const club of clubs) {
    for (const slot of club.slots) {
      const dateKey = dayOfWeekKey(weekStart, slot.weekday);
      if (!withinValidity(slot, dateKey)) continue;
      const { status, booking } = statusOf(slot, occupancy);
      sessions.push({
        id: `${slot.id}:${dateKey}`,
        slotId: slot.id,
        clubSlug: club.slug,
        clubName: club.name,
        dateKey,
        dayOfWeek: slot.weekday,
        startMin: booking?.startMin ?? slot.startMinute,
        endMin: booking?.endMin ?? slot.endMinute,
        room: slot.room ?? "",
        status,
      });
    }
  }
  return sessions.sort(
    (a, b) =>
      a.dayOfWeek - b.dayOfWeek ||
      a.startMin - b.startMin ||
      a.clubName.localeCompare(b.clubName, "hu"),
  );
}

/** Melyik szakköré ez a foglalás (a teremkereső feliratához). */
export function clubOfBooking(
  booking: RoomBooking,
  roomShort: string,
  clubs: readonly ScheduleClub[],
): { slug: string; name: string } | null {
  for (const club of clubs) {
    for (const slot of club.slots) {
      if (slot.source !== "TIMETABLE" || !slot.room) continue;
      if (!sameKey(slot.room, roomShort)) continue;
      if (bookingMatchesSlot(booking, slot)) {
        return { slug: club.slug, name: club.name };
      }
    }
  }
  return null;
}

//* ---------------------------------------------------------------------------
//* „EZ MELYIK SZAKKÖRÖD?" — A GAZDÁTLAN KÁRTYÁK
//* ---------------------------------------------------------------------------
//! Egy tanár osztály nélküli kártyái, amikhez még nem tartozik szakkör. Ebből
//! választ, amikor szakkört hoz létre: a nap, az idő és a terem már ott van,
//! csak a nevet és a leírást kell hozzáírnia.
//!
//! NEM SZŰRÜNK CÍMRE. A „MIR fejlesztői csoport" vagy a „Szakirányú ismeret"
//! sem szakkör, de ezt a tanár tudja, nem mi — egy címlista hamarabb
//! kihagyna egy valódi szakkört, mint hogy megóvna egy rossz választástól.

export type UnclaimedCard = {
  weekday: number;
  startMin: number;
  endMin: number;
  room: string;
  subject: string;
};

export function unclaimedCards(
  teacher: string,
  occupancy: WeekOccupancy,
  clubs: readonly ScheduleClub[],
): UnclaimedCard[] {
  const seen = new Set<string>();
  const cards: UnclaimedCard[] = [];
  for (const room of occupancy.rooms) {
    for (const booking of room.bookings) {
      if (booking.classShort !== "") continue;
      if (!sameKey(booking.teacherShort, teacher)) continue;
      if (clubOfBooking(booking, room.short, clubs)) continue;
      const key = `${booking.dayOfWeek}|${booking.startMin}|${booking.endMin}|${room.short}`;
      if (seen.has(key)) continue;
      seen.add(key);
      cards.push({
        weekday: booking.dayOfWeek,
        startMin: booking.startMin,
        endMin: booking.endMin,
        room: room.short,
        subject: booking.subject,
      });
    }
  }
  return cards.sort((a, b) => a.weekday - b.weekday || a.startMin - b.startMin);
}

//* ---------------------------------------------------------------------------
//* ÉRTESÍTÉSEK — A KÖVETETT SZAKKÖR
//* ---------------------------------------------------------------------------
//! UGYANAZ A KÉT JELZÉS, MINT AZ ÓRÁKNÁL (lásd `push-plan.ts`): tíz perccel
//! előtte, és ha változik. Ugyanaz az ablak-logika is: nem egy pillanatot
//! nézünk, hanem egy `[kezdés − 10, kezdés − 10 + ablak)` sávot, és a kettős
//! kiküldést a tárolóban lefoglalt kulcs zárja ki, nem ez a függvény.

//! A „NINCS" ÁLLAPOTRA NEM SZÓLUNK ELŐRE. Egy órarendből hiányzó vagy tanítás
//! nélküli napra eső alkalomra emlékeztetni azt jelentené, hogy elküldjük a
//! diákot egy üres terembe. Az `unknown` viszont kap emlékeztetőt: az a
//! megszokott időpont, csak most nem tudtuk ellenőrizni — és a hallgatás itt
//! rosszabb, mint a jelzés.
const REMINDABLE: ReadonlySet<ClubSessionStatus> = new Set([
  "confirmed",
  "declared",
  "unknown",
]);

export function dueClubReminders(
  sessions: readonly ClubSession[],
  now: { dayKey: string; minutes: number },
  leadMinutes: number,
  windowMinutes: number,
): ClubSession[] {
  return sessions.filter((s) => {
    if (s.dateKey !== now.dayKey || !REMINDABLE.has(s.status)) return false;
    const notifyAt = s.startMin - leadMinutes;
    return now.minutes >= notifyAt && now.minutes < notifyAt + windowMinutes;
  });
}

export function clubReminderText(
  session: ClubSession,
  leadMinutes: number,
): { title: string; body: string } {
  const where = session.room ? ` — ${session.room}` : "";
  const note =
    session.status === "declared"
      ? "\nA vezető szerint — az iskola órarendjében nem szerepel."
      : "";
  return {
    title: `${session.clubName} ${leadMinutes} perc múlva`,
    body: `${formatMinuteLocal(session.startMin)}${where}${note}`,
  };
}

//! AMI ÚJONNAN ESETT KI. Az órarendi változásfigyelés mintájára (`diffWeeks`):
//! a legutóbb látott „nincs" alkalmakhoz képest csak az ÚJAKRA szólunk. Ha egy
//! szakkör minden héten hiányzik az órarendből (rosszul felvett időpont), az
//! nem hetente ismétlődő riasztás, hanem egy javítandó adat — azt a szakkör
//! lapja mutatja. Az első megfigyelésnél (`before === null`) nincs mihez
//! képest: ilyenkor hallgatunk, különben minden új követő egy halom „hírt"
//! kapna arról, ami már régóta így van.
const GONE: ReadonlySet<ClubSessionStatus> = new Set(["missing", "no-school"]);

export function goneSessionIds(sessions: readonly ClubSession[]): string[] {
  return sessions
    .filter((s) => GONE.has(s.status))
    .map((s) => s.id)
    .sort();
}

export function newlyGone(input: {
  sessions: readonly ClubSession[];
  before: readonly string[] | null;
  fromDayKey: string;
}): ClubSession[] {
  if (input.before === null) return [];
  const known = new Set(input.before);
  return input.sessions.filter(
    (s) =>
      GONE.has(s.status) && s.dateKey >= input.fromDayKey && !known.has(s.id),
  );
}

export function clubChangeText(gone: readonly ClubSession[]): {
  title: string;
  body: string;
} {
  const name = gone[0]?.clubName ?? "Szakkör";
  const lines = gone.map(
    (s) =>
      `${WEEKDAY_LABEL[s.dayOfWeek] ?? ""} ${formatMinuteLocal(s.startMin)}: ${
        s.status === "no-school" ? "nincs tanítás" : "nincs az órarendben"
      }`,
  );
  return {
    title:
      gone.length === 1 && gone[0].status === "no-school"
        ? `${name}: aznap nincs tanítás`
        : `${name}: nincs az órarendben`,
    body: lines.join("\n"),
  };
}

//* Helyben, hogy a modul ne húzza be a `clubs.ts`-t (és vele a zodot) a
//* service-workerhez közeli kódba.
const WEEKDAY_LABEL = ["", "Hétfő", "Kedd", "Szerda", "Csütörtök", "Péntek"];

function formatMinuteLocal(minute: number): string {
  return `${Math.floor(minute / 60)}:${String(minute % 60).padStart(2, "0")}`;
}

//* ---------------------------------------------------------------------------
//* NAPTÁR — A SZAKKÖR ALKALMAI ICS-BEN
//* ---------------------------------------------------------------------------
//! AMI BIZTOSAN NEM LESZ MEG, AZ NEM KERÜL A NAPTÁRBA. A telefon naptára nem
//! tud „áthúzott" eseményt mutatni; egy ott maradó bejegyzés azt mondaná, van
//! szakkör. A többi bekerül, és a leírása kimondja, mennyire tudjuk.
export function clubFeedEvents(sessions: readonly ClubSession[]): {
  uid: string;
  dateKey: string;
  startMin: number;
  endMin: number;
  summary: string;
  location?: string;
  description: string;
}[] {
  return sessions
    .filter((s) => !GONE.has(s.status))
    .map((s) => ({
      uid: `club-${s.id.replace(/[^A-Za-z0-9-]/g, "-")}@orarend`,
      dateKey: s.dateKey,
      startMin: s.startMin,
      endMin: s.endMin,
      summary: s.clubName,
      ...(s.room ? { location: s.room } : {}),
      description: SESSION_STATUS_TEXT[s.status],
    }));
}

//! A TANÉV RENDJÉBŐL ÁLLÓ HÉT. A teremkereső ablakán túl a termek órarendjét
//! nem kérjük le (lásd `servableWeeks`), de a tanítási napokat tudjuk — ebből
//! egy „foglaltság", amiben minden terem ismeretlen: az órarendi slot így
//! `unknown` lesz, a szünetre eső nap viszont `no-school`, és nem kerül
//! szakkörként a naptárba.
export function scheduleOnlyOccupancy(
  weekStart: string,
  days: readonly {
    dateKey: string;
    dayOfWeek: number;
    week: string;
    teaching: boolean | null;
  }[],
  rooms: readonly string[],
): WeekOccupancy {
  return {
    weekStart,
    fetchedAt: 0,
    days: days.map((d) => ({ ...d, name: "" })),
    periods: [],
    rooms: [],
    unknown: [...rooms],
  };
}
