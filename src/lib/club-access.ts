import type { ClubAudience } from "./clubs";
import { isOpenToAll, targetsClass } from "./clubs";

//! ═══════════════════════════════════════════════════════════════════════════
//! SZAKKÖRÖK ÉS VERSENYEK — KI MIT TEHET
//! ═══════════════════════════════════════════════════════════════════════════
//! EGY HELYEN, TISZTA FÜGGVÉNYEKKEL. A felület ebből dönti el, mit mutat; a
//! szerver ugyanebből dönti el, mit enged. Ha a kettő külön szabályt kapna, a
//! felület egyszer olyan gombot mutatna, amit a szerver elutasít — vagy
//! fordítva, ami rosszabb.
//!
//! A SZABÁLYOK (döntés, 2026-09-24):
//!   • Szakkört TANÁR hoz létre; az azonnal él.
//!   • DIÁK JAVASOLHAT, de a javaslat egy általa megnevezett tanárhoz megy, és
//!     csak az ő jóváhagyásával lesz belőle szakkör. Admin-moderáció nincs: a
//!     felelősséget a vállaló tanár viseli, nem egy harmadik fél.
//!   • A tagság NYILVÁNOS (lásd `ClubMember` a sémában).
//!   • Versenyre egyelőre csak EGYÉNI nevezés van.
//!
//! A TANÁR A JELÉVEL AZONOSUL (`teacher`), nem a fiókjával. A jelet a szerver
//! oldja fel a `User.teacherName`-ből — a kliens soha nem adhatja meg, mert
//! akkor bárki bármelyik szakkör vezetőjének mondhatná magát.
//! ═══════════════════════════════════════════════════════════════════════════

export type Actor = {
  userId: string;
  isAdmin: boolean;
  isTeacher: boolean;
  //* A belépett tanár Jedlikinfo-jele. `null` = diák, vagy még nem oldottuk fel.
  teacher: string | null;
  //* A diák osztálya. `null` = tanár, vagy az iskola nem adta meg.
  className: string | null;
};

type ClubRef = {
  status: "PROPOSED" | "ACTIVE" | "ARCHIVED";
  organizers: readonly string[];
  proposedById: string | null;
};

//! TANÁR = `isTeacher` ÉS feloldott jel. Az `isTeacher` egymagában kevés: jel
//! nélkül nem tudjuk, melyik szakkörök az övéi, és egy jel nélküli tanár által
//! létrehozott szakkörnek nem lenne szerkeszthető vezetője.
function teacherOf(actor: Actor): string | null {
  return actor.isTeacher && actor.teacher ? actor.teacher : null;
}

function leads(actor: Actor, club: ClubRef): boolean {
  const teacher = teacherOf(actor);
  return teacher !== null && club.organizers.includes(teacher);
}

export function canCreateClub(actor: Actor | null): boolean {
  if (!actor) return false;
  return actor.isAdmin || teacherOf(actor) !== null;
}

//* Bármelyik belépett felhasználó javasolhat — a szűrő a tanári jóváhagyás.
export function canProposeClub(actor: Actor | null): boolean {
  return actor !== null;
}

export function canSeeClub(actor: Actor | null, club: ClubRef): boolean {
  if (club.status !== "PROPOSED") return true;
  if (!actor) return false;
  return (
    actor.isAdmin || leads(actor, club) || club.proposedById === actor.userId
  );
}

//! CSAK A MEGNEVEZETT TANÁR HAGYHATJA JÓVÁ, nem bármelyik. A diák a
//! javaslatban kiválasztja, kit kér fel; egy másik tanár nem vállalhatja át a
//! nevében. Az admin a vészkijárat (a tanár kilépett, elérhetetlen).
export function canApproveClub(actor: Actor | null, club: ClubRef): boolean {
  if (!actor || club.status !== "PROPOSED") return false;
  return actor.isAdmin || leads(actor, club);
}

export function canEditClub(actor: Actor | null, club: ClubRef): boolean {
  if (!actor) return false;
  if (actor.isAdmin || leads(actor, club)) return true;
  //* A javasló a saját javaslatát a jóváhagyásig javíthatja — utána a tanáré.
  return club.status === "PROPOSED" && club.proposedById === actor.userId;
}

export function canJoinClub(actor: Actor | null, club: ClubRef): boolean {
  return actor !== null && club.status === "ACTIVE";
}

//* ---------------------------------------------------------------------------
//* VERSENYEK
//* ---------------------------------------------------------------------------

type CompetitionRef = ClubAudience & {
  status: "DRAFT" | "OPEN" | "CLOSED" | "FINISHED" | "CANCELLED";
  teachers: readonly string[];
  createdById: string | null;
  startsAt: Date;
  registrationDeadline: Date | null;
  capacity: number | null;
};

export function canCreateCompetition(actor: Actor | null): boolean {
  return canCreateClub(actor);
}

export function canManageCompetition(
  actor: Actor | null,
  competition: CompetitionRef,
): boolean {
  if (!actor) return false;
  if (actor.isAdmin || competition.createdById === actor.userId) return true;
  const teacher = teacherOf(actor);
  return teacher !== null && competition.teachers.includes(teacher);
}

//! NEM IGEN/NEM, HANEM OK. A lap a nevezés gombja helyett MEGMONDJA, miért nem
//! nevezhetsz („lejárt a határidő", „a 11. évfolyamnak szól") — ugyanaz az
//! elv, mint az órarend megnevezett hibáinál.
export type EntryVerdict =
  | { ok: true }
  | {
      ok: false;
      reason: "login" | "not-open" | "deadline" | "audience" | "full";
    };

export function entryVerdict(
  actor: Actor | null,
  competition: CompetitionRef,
  entryCount: number,
  now: Date,
): EntryVerdict {
  if (!actor) return { ok: false, reason: "login" };
  if (competition.status !== "OPEN") return { ok: false, reason: "not-open" };
  const deadline = competition.registrationDeadline ?? competition.startsAt;
  if (now.getTime() >= deadline.getTime()) {
    return { ok: false, reason: "deadline" };
  }
  //! A TANÁR NEM NEVEZ, és nincs osztálya sem — egy szűkített versenynél ő nem
  //! „jogosult diák". A nyitott versenynél sem nevez tanár, de ezt nem ez a
  //! függvény tiltja: ott a felület egyszerűen nem kínálja fel.
  if (!isOpenToAll(competition)) {
    if (!actor.className || !targetsClass(competition, actor.className)) {
      return { ok: false, reason: "audience" };
    }
  }
  if (competition.capacity !== null && entryCount >= competition.capacity) {
    return { ok: false, reason: "full" };
  }
  return { ok: true };
}
