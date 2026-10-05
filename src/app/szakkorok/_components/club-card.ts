import type { ClubListRow } from "@/lib/club-store";
import type { ClubKind, ClubSlotSource, ClubTrack } from "@/lib/clubs";

//* A böngészőbe menő alak: csak ami a kártyához kell, a tanárjel mellé a név.
//* A `ClubListRow` szerveroldali (Date-mezők, belső azonosítók nélkül is
//* több, mint kell) — ez a szűkítés egy helyen történik.
export type ClubCardData = {
  slug: string;
  name: string;
  kind: ClubKind;
  proposed: boolean;
  grades: number[];
  classes: string[];
  tracks: ClubTrack[];
  audienceNote: string | null;
  organizers: { short: string; name: string }[];
  slots: {
    weekday: number;
    startMinute: number;
    endMinute: number;
    room: string | null;
    source: ClubSlotSource;
  }[];
  memberCount: number;
};

export function toCardData(
  row: ClubListRow,
  names: Map<string, string>,
): ClubCardData {
  return {
    slug: row.slug,
    name: row.name,
    kind: row.kind,
    proposed: row.status === "PROPOSED",
    grades: row.grades,
    classes: row.classes,
    tracks: row.tracks,
    audienceNote: row.audienceNote,
    organizers: row.organizers.map((short) => ({
      short,
      name: names.get(short) ?? short,
    })),
    slots: [...row.slots]
      .sort((a, b) => a.weekday - b.weekday || a.startMinute - b.startMinute)
      .map(({ weekday, startMinute, endMinute, room, source }) => ({
        weekday,
        startMinute,
        endMinute,
        room,
        source,
      })),
    memberCount: row.memberCount,
  };
}
