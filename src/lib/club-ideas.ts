import { z } from "zod";
import type { Actor } from "./club-access";
import { canCreateClub } from "./club-access";
import { clubSlug } from "./clubs";

//! ═══════════════════════════════════════════════════════════════════════════
//! MIRE LENNE IGÉNY? — A KÖZÖS SZABÁLYOK
//! ═══════════════════════════════════════════════════════════════════════════
//! Tiszta függvények: a kulcs, a bemenet határa, a jogok és a sorrend. Az
//! adatbázis a `club-idea-store.ts`-ben, az írás a Server Actionökben él.
//! A séma-oldali indoklás a `prisma/schema.prisma` ClubIdea fejlécében.
//! ═══════════════════════════════════════════════════════════════════════════

export const IDEA_TITLE_MIN = 3;
export const IDEA_TITLE_MAX = 60;
export const IDEA_NOTE_MAX = 280;
//! EGY DIÁK LEGFELJEBB ENNYI NYITOTT ÖTLETET TARTHAT. Nem bizalmatlanság: a
//! lap attól ér valamit, hogy a tanár a tíz legkeresettebb témát látja, nem
//! egyetlen diák húsz ötletét.
export const MAX_OPEN_IDEAS_PER_AUTHOR = 3;

//* A témát körülvevő töltelékszavak — a „Drón szakkör" és a „Drón" ugyanaz.
const FILLER = new Set(["szakkor", "szakkort", "klub", "kor", "a", "az"]);

//! A DUPLIKÁCIÓ KULCSA. Ékezet, kis-nagybetű, írásjel és a töltelékszavak
//! nélkül, rendezetlenül: a szórend a témán nem változtat, de a „Python
//! haladó" és a „haladó Python" két felírásnak sem kellene két ötletnek lennie
//! — ezért a szavakat rendezzük.
export function ideaKey(title: string): string {
  const words = clubSlug(title)
    .split("-")
    .filter((w) => w.length > 0 && !FILLER.has(w));
  return [...new Set(words)].sort().join("-");
}

export const ideaInputSchema = z.object({
  title: z
    .string()
    .trim()
    .min(IDEA_TITLE_MIN, "Legalább 3 betű legyen.")
    .max(IDEA_TITLE_MAX, `Legfeljebb ${IDEA_TITLE_MAX} karakter.`)
    .refine((t) => ideaKey(t).length > 0, "Írd le, mi legyen a téma."),
  note: z
    .string()
    .trim()
    .max(IDEA_NOTE_MAX, `A megjegyzés legfeljebb ${IDEA_NOTE_MAX} karakter.`)
    .nullable()
    .transform((n) => (n ? n : null)),
});

export type IdeaInput = z.infer<typeof ideaInputSchema>;

//* ---------------------------------------------------------------------------
//* KI MIT TEHET
//* ---------------------------------------------------------------------------

export type IdeaRef = {
  authorId: string | null;
  clubId: string | null;
  hidden: boolean;
  voteCount: number;
};

//* Bármelyik belépett felhasználó — a határ a darabszám és a moderálás.
export function canPostIdea(actor: Actor | null): boolean {
  return actor !== null;
}

export function canVoteIdea(actor: Actor | null, idea: IdeaRef): boolean {
  return actor !== null && !idea.hidden && idea.clubId === null;
}

//! A MODERÁLÁS A TANÁRÉ ÉS AZ ADMINÉ. Ugyanazok, akik szakkört indíthatnak:
//! aki felelhet egy szakkörért, az dönthet arról is, mi nem való a lapra.
export function canHideIdea(actor: Actor | null): boolean {
  return canCreateClub(actor);
}

//! A SZERZŐ VISSZAVONHATJA, AMÍG CSAK Ő JELEZTE. Ha már más is rászavazott,
//! az ötlet nem csak az övé — a visszavonás az ő jelzésüket is eltüntetné.
export function canWithdrawIdea(actor: Actor | null, idea: IdeaRef): boolean {
  return (
    actor !== null &&
    idea.authorId === actor.userId &&
    idea.clubId === null &&
    idea.voteCount <= 1
  );
}

export function canAdoptIdea(actor: Actor | null, idea: IdeaRef): boolean {
  return canCreateClub(actor) && !idea.hidden && idea.clubId === null;
}

//* ---------------------------------------------------------------------------
//* SORREND
//* ---------------------------------------------------------------------------
//! ELÖL A LEGKERESETTEBB. Egyenlőségnél az újabb, hogy egy friss ötlet ne
//! vesszen el a régiek mögött. A megvalósultak a lista végére kerülnek: hír,
//! de már nem kérdés.
export function sortIdeas<
  T extends { voteCount: number; createdAt: Date; clubId: string | null },
>(ideas: readonly T[]): T[] {
  return [...ideas].sort(
    (a, b) =>
      Number(a.clubId !== null) - Number(b.clubId !== null) ||
      b.voteCount - a.voteCount ||
      b.createdAt.getTime() - a.createdAt.getTime(),
  );
}

/** `12 diákot érdekel` — a magyar a szám után egyes számot használ. */
export function interestLabel(count: number): string {
  return count === 0 ? "Még senki nem jelezte" : `${count} diákot érdekel`;
}
