import { type ClubInput, clubInputSchema, clubSlug } from "../../src/lib/clubs";

//! ═══════════════════════════════════════════════════════════════════════════
//! A KEZDŐ ADATOK ELLENŐRZÉSE — TISZTA FÜGGVÉNYEK
//! ═══════════════════════════════════════════════════════════════════════════
//! Két szint:
//!   1. ALAK — ugyanaz a séma, ami a tanári űrlapot is őrzi (`clubInputSchema`),
//!      és egyedi URL-kulcs. Hálózat nélkül fut, a tesztből is.
//!   2. VALÓSÁG — minden tanárjel, teremjel és osztálynév szerepel-e a
//!      Jedlikinfo saját listájában. Egy elírt jel (`ÁÁ` az `AA` helyett) a
//!      sémán átmegy, de soha egyetlen kártyára sem illeszkedne: a szakkör
//!      csendben „nincs az órarendben" maradna. Ezt itt kell megfogni, nem
//!      egy diáknak kell észrevennie.
//! ═══════════════════════════════════════════════════════════════════════════

export type SeedProblem = { club: string; problem: string };

export function checkShape(clubs: readonly ClubInput[]): SeedProblem[] {
  const problems: SeedProblem[] = [];
  const slugs = new Map<string, string>();
  for (const club of clubs) {
    const parsed = clubInputSchema.safeParse(club);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        problems.push({
          club: club.name,
          problem: `${issue.path.join(".") || "(egész)"}: ${issue.message}`,
        });
      }
    }
    const slug = clubSlug(club.name);
    const clash = slugs.get(slug);
    if (clash) {
      problems.push({
        club: club.name,
        problem: `Ugyanaz az URL-kulcs (${slug}), mint: ${clash}`,
      });
    }
    slugs.set(slug, club.name);
  }
  return problems;
}

export type JedlikinfoLists = {
  teachers: ReadonlySet<string>;
  rooms: ReadonlySet<string>;
  classes: ReadonlySet<string>;
};

export function checkAgainstJedlikinfo(
  clubs: readonly ClubInput[],
  lists: JedlikinfoLists,
): SeedProblem[] {
  const problems: SeedProblem[] = [];
  const report = (club: ClubInput, problem: string) =>
    problems.push({ club: club.name, problem });

  for (const club of clubs) {
    for (const teacher of club.organizers) {
      if (!lists.teachers.has(teacher)) {
        report(club, `Ismeretlen tanárjel: ${teacher}`);
      }
    }
    for (const className of club.classes) {
      if (!lists.classes.has(className)) {
        report(club, `Ismeretlen osztály: ${className}`);
      }
    }
    for (const slot of club.slots) {
      if (slot.room !== null && !lists.rooms.has(slot.room)) {
        report(club, `Ismeretlen terem: ${slot.room}`);
      }
    }
  }
  return problems;
}
