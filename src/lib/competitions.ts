import { z } from "zod";
import { looksLikeClubSlug } from "./club-follow";
import { MAX_GRADE, MIN_GRADE } from "./clubs";
import { looksLikeClass, looksLikeTeacher } from "./known-class";
import { sanitizeLinkUrl } from "./lesson-extras";

//! ═══════════════════════════════════════════════════════════════════════════
//! VERSENYEK — A KÖZÖS RÉSZ
//! ═══════════════════════════════════════════════════════════════════════════
//! A szerver (űrlap, értesítés) és a böngésző (lista, határidő-sáv) ugyanebből
//! dolgozik. Se adatbázis, se React, se `Date.now()` rejtve: az „most" mindig
//! paraméter, hogy minden határidő-mondat bármely pillanatra tesztelhető
//! legyen.
//!
//! A VERSENY LÉNYEGE A HATÁRIDŐ. A szakkörről elég tudni, mikor van; a
//! versenyről azt kell tudni, MEDDIG lehet még nevezni — az iskolának épp ez
//! nem jut el a diákokig. Ezért kap a határidő saját sávot a listában, saját
//! panelt a `/ma`-n és saját emlékeztetőt.
//! ═══════════════════════════════════════════════════════════════════════════

export const COMPETITION_CATEGORIES = [
  "PROGRAMMING",
  "NETWORKING",
  "ENGINEERING",
  "MATH",
  "SCIENCE",
  "LANGUAGE",
  "HUMANITIES",
  "OTHER",
] as const;

export type CompetitionCategory = (typeof COMPETITION_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<CompetitionCategory, string> = {
  PROGRAMMING: "Programozás",
  NETWORKING: "Hálózat, rendszer",
  ENGINEERING: "Gépészet, műszaki",
  MATH: "Matematika",
  SCIENCE: "Természettudomány",
  LANGUAGE: "Nyelv",
  HUMANITIES: "Humán",
  OTHER: "Egyéb",
};

export const COMPETITION_STATUSES = [
  "DRAFT",
  "OPEN",
  "CLOSED",
  "FINISHED",
  "CANCELLED",
] as const;

export type CompetitionStatus = (typeof COMPETITION_STATUSES)[number];

export const STATUS_LABELS: Record<CompetitionStatus, string> = {
  DRAFT: "Piszkozat",
  OPEN: "Nevezés nyitva",
  CLOSED: "Nevezés lezárva",
  FINISHED: "Lezajlott",
  CANCELLED: "Elmarad",
};

export const COMPETITION_VENUES = ["SCHOOL", "EXTERNAL", "ONLINE"] as const;

export type CompetitionVenue = (typeof COMPETITION_VENUES)[number];

export const VENUE_LABELS: Record<CompetitionVenue, string> = {
  SCHOOL: "Az iskolában",
  EXTERNAL: "Külső helyszínen",
  ONLINE: "Online",
};

//* ---------------------------------------------------------------------------
//* A HATÁRIDŐ
//* ---------------------------------------------------------------------------

//! HA NINCS KÜLÖN HATÁRIDŐ, A KEZDÉS AZ. Aki a kezdés után nevezne, az már
//! nem nevez — a sémában is így áll (`registrationDeadline`).
export function deadlineOf(c: {
  registrationDeadline: Date | null;
  startsAt: Date;
}): Date {
  return c.registrationDeadline ?? c.startsAt;
}

//* Budapesti naptári nap — a „holnap" és a „3 nap múlva" nem UTC-ben értendő.
const DAY_FMT = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Europe/Budapest",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function budapestDayKey(date: Date): string {
  return DAY_FMT.format(date);
}

function dayNumber(dayKey: string): number {
  return (
    Date.UTC(
      Number(dayKey.slice(0, 4)),
      Number(dayKey.slice(5, 7)) - 1,
      Number(dayKey.slice(8, 10)),
    ) / 86_400_000
  );
}

/** Hány naptári nap van a határidőig (budapesti napokban). Negatív = lejárt. */
export function daysUntil(target: Date, now: Date): number {
  return dayNumber(budapestDayKey(target)) - dayNumber(budapestDayKey(now));
}

//! A MONDAT A SÜRGŐSSÉGET MONDJA, NEM A DÁTUMOT. A dátum a mellette álló
//! sorban úgyis ott van; itt az a kérdés, van-e még idő.
export function deadlineLabel(deadline: Date, now: Date): string {
  if (deadline.getTime() <= now.getTime()) return "Lejárt";
  const days = daysUntil(deadline, now);
  if (days <= 0) return "Ma jár le";
  if (days === 1) return "Holnap jár le";
  return `${days} nap múlva jár le`;
}

//! A HATÁRIDŐ-SÁV: ami még nyitva van, a legsürgősebb elöl. A lezárt, a
//! lezajlott és az elmaradó verseny nem határidő — azok a listában maradnak,
//! csak a sávba nem kerülnek.
export function openDeadlines<
  T extends {
    status: CompetitionStatus;
    registrationDeadline: Date | null;
    startsAt: Date;
  },
>(list: readonly T[], now: Date): T[] {
  return list
    .filter(
      (c) => c.status === "OPEN" && deadlineOf(c).getTime() > now.getTime(),
    )
    .sort((a, b) => deadlineOf(a).getTime() - deadlineOf(b).getTime());
}

//* ---------------------------------------------------------------------------
//* ÉRTESÍTÉS — A KÖVETETT VERSENY
//* ---------------------------------------------------------------------------
//! HÁROM MONDANIVALÓ, NAPONTA EGYSZER, DÉLUTÁN. Nem a határidő percében
//! szólunk (az gyakran éjfél), hanem az azt megelőző napokon, amikor még van
//! idő cselekedni: három nappal előtte, előtte való nap, és a verseny előtti
//! napon. Délután négykor — tanítás után, amikor a diák már nem órán ül.

export const CONTEST_NOTIFY_MINUTE = 16 * 60;
//* Az ütemező öt percenként fut; fél óra bőven elég egy kimaradt tickre is.
export const CONTEST_NOTIFY_WINDOW = 30;

export type ContestReminderKind = "deadline-3" | "deadline-1" | "starts-1";

export function dueContestReminders(
  c: {
    status: CompetitionStatus;
    registrationDeadline: Date | null;
    startsAt: Date;
  },
  now: Date,
  nowMinutes: number,
): ContestReminderKind[] {
  if (
    nowMinutes < CONTEST_NOTIFY_MINUTE ||
    nowMinutes >= CONTEST_NOTIFY_MINUTE + CONTEST_NOTIFY_WINDOW
  ) {
    return [];
  }
  const due: ContestReminderKind[] = [];
  if (c.status === "OPEN") {
    const days = daysUntil(deadlineOf(c), now);
    if (days === 3) due.push("deadline-3");
    if (days === 1) due.push("deadline-1");
  }
  if (
    (c.status === "OPEN" || c.status === "CLOSED") &&
    daysUntil(c.startsAt, now) === 1
  ) {
    due.push("starts-1");
  }
  return due;
}

const TIME_FMT = new Intl.DateTimeFormat("hu-HU", {
  timeZone: "Europe/Budapest",
  hour: "numeric",
  minute: "2-digit",
});

export function contestReminderText(
  kind: ContestReminderKind,
  c: { name: string; registrationDeadline: Date | null; startsAt: Date },
): { title: string; body: string } {
  if (kind === "starts-1") {
    return {
      title: `${c.name} holnap`,
      body: `Kezdés holnap ${TIME_FMT.format(c.startsAt)}-kor.`,
    };
  }
  const deadline = deadlineOf(c);
  return {
    title:
      kind === "deadline-1"
        ? `${c.name}: holnap lejár a nevezés`
        : `${c.name}: 3 nap múlva lejár a nevezés`,
    body: `Nevezési határidő: ${budapestDayKey(deadline).replaceAll("-", ". ")}. ${TIME_FMT.format(deadline)}.`,
  };
}

//* ---------------------------------------------------------------------------
//* A BEMENET HATÁRA
//* ---------------------------------------------------------------------------
//! A DÁTUMOK ISO-SZÖVEGKÉNT JÖNNEK. Az űrlap `datetime-local` mezője HELYI
//! időt ad; a böngésző alakítja ISO-ra (UTC), mielőtt elküldi — a szerver más
//! időzónában értelmezné a helyi időt (ugyanaz a megfontolás, mint a
//! közleményeknél).

const isoDate = z
  .string()
  .refine((v) => !Number.isNaN(Date.parse(v)), "Érvénytelen dátum");

export const competitionInputSchema = z
  .object({
    name: z.string().trim().min(3).max(120),
    description: z.string().trim().max(6000).nullable(),
    category: z.enum(COMPETITION_CATEGORIES),
    externalUrl: z
      .string()
      .nullable()
      .transform((v, ctx) => {
        if (v === null || v.trim() === "") return null;
        const url = sanitizeLinkUrl(v);
        if (!url) {
          ctx.addIssue({ code: "custom", message: "Érvénytelen hivatkozás" });
          return z.NEVER;
        }
        return url;
      }),
    venue: z.enum(COMPETITION_VENUES),
    room: z.string().trim().min(1).max(16).nullable(),
    location: z.string().trim().min(1).max(200).nullable(),
    startsAt: isoDate,
    endsAt: isoDate.nullable(),
    registrationDeadline: isoDate.nullable(),
    grades: z.array(z.number().int().min(MIN_GRADE).max(MAX_GRADE)).max(5),
    classes: z
      .array(z.string().refine(looksLikeClass, "Nem osztálynév"))
      .max(30),
    capacity: z.number().int().min(1).max(10_000).nullable(),
    teachers: z
      .array(z.string().refine(looksLikeTeacher, "Nem tanárjel"))
      .min(1)
      .max(4),
    phases: z
      .array(
        z.object({
          title: z.string().trim().min(1).max(120),
          startsAt: isoDate.nullable(),
          endsAt: isoDate.nullable(),
        }),
      )
      .max(10),
    //* A felkészítő szakkörök (lásd `Club.competitions`).
    clubs: z.array(z.string().refine(looksLikeClubSlug, "Nem szakkör")).max(5),
  })
  .refine((c) => !c.endsAt || Date.parse(c.endsAt) >= Date.parse(c.startsAt), {
    message: "A vége nem lehet a kezdés előtt",
    path: ["endsAt"],
  })
  //! A HATÁRIDŐ A KEZDÉS ELŐTT VAN. Egy kezdés utáni határidő azt ígérné,
  //! hogy egy már zajló versenyre még lehet nevezni.
  .refine(
    (c) =>
      !c.registrationDeadline ||
      Date.parse(c.registrationDeadline) <= Date.parse(c.startsAt),
    {
      message: "A nevezési határidő nem lehet a kezdés után",
      path: ["registrationDeadline"],
    },
  )
  .refine((c) => c.venue !== "EXTERNAL" || c.location !== null, {
    message: "Külső helyszínhez add meg a címet",
    path: ["location"],
  });

export type CompetitionInput = z.input<typeof competitionInputSchema>;
export type CompetitionParsed = z.output<typeof competitionInputSchema>;

//* ---------------------------------------------------------------------------
//* EREDMÉNY
//* ---------------------------------------------------------------------------

export const resultInputSchema = z.array(
  z.object({
    userId: z.string().min(1).max(64),
    rank: z.number().int().min(1).max(10_000).nullable(),
    award: z.string().trim().max(80).nullable(),
    points: z.number().finite().min(-1_000_000).max(1_000_000).nullable(),
  }),
);

export type ResultInput = z.infer<typeof resultInputSchema>;

//! A RANGSOR: előbb a helyezettek helyezés szerint, utánuk a díjasok, végül a
//! többiek ábécében. Egy helyezés nélküli „Különdíj" nem kerülhet egy
//! harmadik hely elé, de nem is tűnhet el a lista alján a résztvevők között.
export function rankedEntries<
  T extends { rank: number | null; award: string | null; name: string },
>(entries: readonly T[]): T[] {
  return [...entries].sort((a, b) => {
    if (a.rank !== null || b.rank !== null) {
      if (a.rank === null) return 1;
      if (b.rank === null) return -1;
      if (a.rank !== b.rank) return a.rank - b.rank;
    }
    if (Boolean(a.award) !== Boolean(b.award)) return a.award ? -1 : 1;
    return a.name.localeCompare(b.name, "hu");
  });
}

//* ---------------------------------------------------------------------------
//* MEGJELENÍTÉS
//* ---------------------------------------------------------------------------
//! MINDIG BUDAPESTI IDŐ, a néző gépének időzónájától függetlenül — a verseny
//! Budapesten (Győrben) van, és a szerver UTC-ben renderel.
const WHEN_FMT = new Intl.DateTimeFormat("hu-HU", {
  timeZone: "Europe/Budapest",
  month: "short",
  day: "numeric",
  weekday: "short",
  hour: "numeric",
  minute: "2-digit",
});

/** `okt. 10., p 10:00` — a verseny és a határidő időpontja. */
export function formatWhen(date: Date): string {
  return WHEN_FMT.format(date);
}

//* A `datetime-local` mező értéke budapesti helyi időben (`2026-10-10T10:00`).
const LOCAL_FMT = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Europe/Budapest",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

export function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  return LOCAL_FMT.format(new Date(iso)).replace(" ", "T");
}

//* ---------------------------------------------------------------------------
//* NAPTÁR
//* ---------------------------------------------------------------------------
//! A telefon naptárába a verseny maga, a keltezett fordulói és — amíg nyitva
//! van a nevezés — a határidő kerül. A határidő egy negyedórás esemény, ami
//! PONTOSAN a határidőkor ér véget: a naptár így a lejárat előtt figyelmeztet.
//! Az elmaradó versenyből nem lesz esemény (a naptár nem tud „áthúzott"
//! bejegyzést mutatni).

const MINUTE_FMT = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Budapest",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function budapestMinutes(date: Date): number {
  const [h, m] = MINUTE_FMT.format(date).split(":").map(Number);
  return h * 60 + m;
}

type FeedSpan = { dateKey: string; startMin: number; endMin: number };

//* Egy napba zárva: ha a vége másnapra esik, a nap végéig tart — az
//* iCalendar-esemény itt egy naphoz kötött (lásd `IcsEvent`).
function span(start: Date, end: Date | null, fallbackMinutes = 60): FeedSpan {
  const dateKey = budapestDayKey(start);
  const startMin = budapestMinutes(start);
  const endMin =
    end && budapestDayKey(end) === dateKey && end > start
      ? budapestMinutes(end)
      : Math.min(startMin + fallbackMinutes, 24 * 60 - 1);
  return { dateKey, startMin, endMin: Math.max(endMin, startMin + 1) };
}

export function contestFeedEvents(c: {
  slug: string;
  name: string;
  status: CompetitionStatus;
  startsAt: Date;
  endsAt: Date | null;
  registrationDeadline: Date | null;
  location: string | null;
  room: string | null;
  phases: {
    id: string;
    title: string;
    startsAt: Date | null;
    endsAt: Date | null;
  }[];
}): {
  uid: string;
  dateKey: string;
  startMin: number;
  endMin: number;
  summary: string;
  location?: string;
}[] {
  if (c.status === "CANCELLED" || c.status === "DRAFT") return [];
  const where = c.room ?? c.location ?? undefined;
  const events = [
    {
      uid: `contest-${c.slug}@orarend`,
      ...span(c.startsAt, c.endsAt),
      summary: c.name,
      ...(where ? { location: where } : {}),
    },
  ];
  if (c.status === "OPEN") {
    const deadline = deadlineOf(c);
    const end = budapestMinutes(deadline);
    events.push({
      uid: `contest-${c.slug}-deadline@orarend`,
      dateKey: budapestDayKey(deadline),
      startMin: Math.max(0, end - 15),
      endMin: Math.max(end, 1),
      summary: `Nevezési határidő: ${c.name}`,
    });
  }
  for (const phase of c.phases) {
    const at = phase.startsAt ?? phase.endsAt;
    if (!at) continue;
    events.push({
      uid: `contest-${c.slug}-${phase.id}@orarend`,
      ...span(at, phase.startsAt ? phase.endsAt : null, 30),
      summary: `${c.name}: ${phase.title}`,
    });
  }
  return events;
}
