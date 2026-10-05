//* ---------------------------------------------------------------------------
//* AZ ÜZEMELTETŐI PULT — SZAKKÖRÖK ÉS VERSENYEK
//* ---------------------------------------------------------------------------
//! A PULT NEM ÚJ SZABÁLYKÖNYV. Ki mit tehet, az továbbra is a
//! `club-access.ts`-ben él; ez a fájl csak azt mondja meg, mire figyeljen az
//! üzemeltető: mi vár döntésre, mi avult el, mi tűnik el egy törléssel.
//! Tiszta függvények, hogy a lap és a teszt ugyanazt számolja.

export const CLUB_STATUSES = ["PROPOSED", "ACTIVE", "ARCHIVED"] as const;
export type ClubStatus = (typeof CLUB_STATUSES)[number];

export const CLUB_STATUS_LABELS: Record<ClubStatus, string> = {
  PROPOSED: "Javaslat",
  ACTIVE: "Él",
  ARCHIVED: "Megszűnt",
};

//! MIKOR AVUL EL EGY TANÁR SZERINTI IDŐPONT. A Jedlikinfóval igazolt
//! időpontokat a heti seprés tartja frissen; amit csak a vezető állít, azt
//! csak a vezető mentése erősíti meg (`Club.confirmedAt`). Egy félév után egy
//! ilyen állítás már inkább emlék, mint adat — itt kérdezzen rá az üzemeltető.
export const STALE_AFTER_DAYS = 150;

const DAY_MS = 24 * 60 * 60 * 1000;

export function isStaleClub(
  club: {
    status: ClubStatus;
    confirmedAt: Date;
    slots: readonly { source: "TIMETABLE" | "ORGANIZER" }[];
  },
  now: Date,
): boolean {
  if (club.status !== "ACTIVE") return false;
  if (!club.slots.some((s) => s.source === "ORGANIZER")) return false;
  return now.getTime() - club.confirmedAt.getTime() > STALE_AFTER_DAYS * DAY_MS;
}

//* Keresés a pult listáiban: kisbetű, magyar szabály szerint, bármelyik
//* mezőben. Üres keresőszó = minden sor.
export function matchesQuery(
  query: string,
  fields: readonly (string | null | undefined)[],
): boolean {
  const needle = query.trim().toLocaleLowerCase("hu");
  if (!needle) return true;
  return fields.some(
    (f) => typeof f === "string" && f.toLocaleLowerCase("hu").includes(needle),
  );
}

//! A TÖRLÉS ÁRA, KIMONDVA. A végleges törlés a tagságot, az időpontokat és a
//! hírfolyamot is viszi (`onDelete: Cascade`), az ötlet pedig elveszti a
//! szakkörét. A megerősítő kérdés ezt sorolja fel, hogy az üzemeltető ne egy
//! üres „Biztos?"-ra mondjon igent.
export function clubDeleteWarning(club: {
  name: string;
  memberCount: number;
  postCount: number;
}): string {
  const lost = [
    club.memberCount > 0 ? `${club.memberCount} tag jelentkezése` : null,
    club.postCount > 0 ? `${club.postCount} hírfolyam-bejegyzés` : null,
  ].filter(Boolean);
  return lost.length > 0
    ? `Véglegesen törlöd: „${club.name}"? Vele együtt elvész ${lost.join(" és ")}. Ha csak megszűnt, inkább zárd le.`
    : `Véglegesen törlöd: „${club.name}"?`;
}

export function contestDeleteWarning(contest: {
  name: string;
  status: string;
  entryCount: number;
}): string {
  const lost =
    contest.entryCount > 0
      ? ` Vele együtt elvész ${contest.entryCount} nevezés és az eredményük.`
      : "";
  const hint =
    contest.status === "DRAFT"
      ? ""
      : ' Ha a verseny csak elmarad, inkább állítsd „Elmarad"-ra — az a diákoknak is hír.';
  return `Véglegesen törlöd: „${contest.name}"?${lost}${hint}`;
}

//! A VERSENY, AMI LÉPÉSRE VÁR. Az állapotot a szervező váltja kézzel, és ezt
//! könnyű elfelejteni: a határidő lejárt, de a nevezés „nyitva" maradt, vagy a
//! verseny lezajlott, de az eredmény sosem került ki. A pult ezeket jelzi —
//! a döntést nem hozza meg helyettük, mert a határidőt gyakran meghosszabbítják.
export type ContestAttention = "deadline-passed" | "results-missing" | null;

export function contestAttention(
  contest: {
    status: string;
    startsAt: Date;
    endsAt: Date | null;
    registrationDeadline: Date | null;
  },
  now: Date,
): ContestAttention {
  const deadline = contest.registrationDeadline ?? contest.startsAt;
  if (contest.status === "OPEN" && now.getTime() >= deadline.getTime()) {
    return "deadline-passed";
  }
  const over = contest.endsAt ?? contest.startsAt;
  if (
    (contest.status === "OPEN" || contest.status === "CLOSED") &&
    now.getTime() > over.getTime() + DAY_MS
  ) {
    return "results-missing";
  }
  return null;
}

export const CONTEST_ATTENTION_LABELS: Record<
  Exclude<ContestAttention, null>,
  string
> = {
  "deadline-passed": "Lejárt a határidő, még nyitva",
  "results-missing": "Lezajlott, nincs eredmény",
};
