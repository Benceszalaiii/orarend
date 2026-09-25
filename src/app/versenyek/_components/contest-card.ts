import type { CompetitionRow } from "@/lib/competition-store";
import type {
  CompetitionCategory,
  CompetitionStatus,
  CompetitionVenue,
} from "@/lib/competitions";

//* A böngészőbe menő alak: dátumok ISO-szövegként (a `Date` nem szerializálható
//* a szerver- és kliens-komponens határán), a tanárjelek mellé a név.
export type ContestCardData = {
  slug: string;
  name: string;
  category: CompetitionCategory;
  status: CompetitionStatus;
  venue: CompetitionVenue;
  room: string | null;
  location: string | null;
  startsAt: string;
  registrationDeadline: string | null;
  grades: number[];
  classes: string[];
  capacity: number | null;
  entryCount: number;
  teachers: { short: string; name: string }[];
};

export function toContestCard(
  row: CompetitionRow,
  names: Map<string, string>,
): ContestCardData {
  return {
    slug: row.slug,
    name: row.name,
    category: row.category,
    status: row.status,
    venue: row.venue,
    room: row.room,
    location: row.location,
    startsAt: row.startsAt.toISOString(),
    registrationDeadline: row.registrationDeadline?.toISOString() ?? null,
    grades: row.grades,
    classes: row.classes,
    capacity: row.capacity,
    entryCount: row.entryCount,
    teachers: row.teachers.map((short) => ({
      short,
      name: names.get(short) ?? short,
    })),
  };
}

//* A kártya dátumai `Date`-ként — a `competitions.ts` függvényei ezt várják.
export function withDates(c: ContestCardData) {
  return {
    ...c,
    startsAt: new Date(c.startsAt),
    registrationDeadline: c.registrationDeadline
      ? new Date(c.registrationDeadline)
      : null,
  };
}
