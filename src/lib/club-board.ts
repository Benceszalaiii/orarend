import { z } from "zod";
import type { PushPayload } from "./push-shared";

//! ═══════════════════════════════════════════════════════════════════════════
//! A SZAKKÖR HÍRFOLYAMA — A KÖZÖS SZABÁLYOK
//! ═══════════════════════════════════════════════════════════════════════════
//! Tiszta függvények: a bemenet határa, a szöveg megjelenítése, az idő és a
//! push szövege. A jogok a `club-access.ts`-ben (ott él minden szakköri
//! szabály), az adatbázis a `club-board-store.ts`-ben, az írás a Server
//! Actionökben. A séma-oldali indoklás a `ClubPost` fejlécében.
//! ═══════════════════════════════════════════════════════════════════════════

export const POST_MAX = 4000;
export const COMMENT_MAX = 1000;

//! A KORLÁT AZ ELÍRT GOMBNYOMÁS ÉS A SZKRIPT ELLEN VAN, nem a beszélgetés
//! ellen. Egy óra alatt ennyit egy ember kézzel nem ír; egy beragadt kliens
//! vagy egy rosszindulatú szkript viszont ennél jóval többet küldene.
export const POSTS_PER_HOUR = 10;
export const COMMENTS_PER_HOUR = 60;
//* Ennyi bejegyzést tölt be a lap — a régebbiek a „Korábbiak" mögött.
export const BOARD_PAGE = 30;

function bodySchema(max: number, what: string) {
  return z
    .string()
    .transform((s) => s.replace(/\r\n?/g, "\n").trim())
    .pipe(
      z
        .string()
        .min(1, `Üres ${what} nem küldhető.`)
        .max(max, `Legfeljebb ${max} karakter lehet.`),
    );
}

export const postBodySchema = bodySchema(POST_MAX, "bejegyzés");
export const commentBodySchema = bodySchema(COMMENT_MAX, "hozzászólás");

//* ---------------------------------------------------------------------------
//* A SZÖVEG
//* ---------------------------------------------------------------------------
//! SIMA SZÖVEG, NEM MARKDOWN ÉS NEM HTML. A lap a sortöréseket megtartja, a
//! http(s) címekből linket csinál — mást nem. Így nincs mit szűrni: a szöveg
//! React szövegként kerül ki, a link `href`-je pedig csak `http(s)://` lehet.
export type BoardSegment =
  | { kind: "text"; text: string }
  | { kind: "link"; text: string; href: string };

const URL_RE = /https?:\/\/[^\s<>"']+/g;
//* A mondat végi írásjel nem a cím része („nézd meg: https://x.hu.").
const TRAILING = /[.,;:!?)\]}]+$/;

export function boardSegments(text: string): BoardSegment[] {
  const out: BoardSegment[] = [];
  let last = 0;
  for (const match of text.matchAll(URL_RE)) {
    const start = match.index ?? 0;
    let url = match[0];
    //* A záró zárójel maradhat, ha a címen belül nyílt is (Wikipédia-linkek).
    const trail = url.match(TRAILING)?.[0] ?? "";
    let cut = trail;
    if (trail.startsWith(")") && url.slice(0, -trail.length).includes("(")) {
      cut = trail.slice(1);
    }
    if (cut) url = url.slice(0, -cut.length);
    if (start > last) out.push({ kind: "text", text: text.slice(last, start) });
    out.push({ kind: "link", text: url, href: url });
    last = start + url.length;
  }
  if (last < text.length) out.push({ kind: "text", text: text.slice(last) });
  return out;
}

//* A név monogramja az avatarhoz: „Szalai Bence" → „SB". Egy szónál egy betű.
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const letters =
    words.length === 1 ? [words[0]] : [words[0], words[words.length - 1]];
  return letters.map((w) => w.charAt(0).toLocaleUpperCase("hu")).join("");
}

//* ---------------------------------------------------------------------------
//* AZ IDŐ
//* ---------------------------------------------------------------------------
//! BUDAPESTI IDŐ, A SZERVER ÓRÁJÁTÓL FÜGGETLENÜL. A szerver UTC-ben fut; a
//! „ma" és a „tegnap" a diák napja, nem a szerveré.
const DAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Budapest",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const CLOCK = new Intl.DateTimeFormat("hu-HU", {
  timeZone: "Europe/Budapest",
  hour: "numeric",
  minute: "2-digit",
});
const SHORT_DATE = new Intl.DateTimeFormat("hu-HU", {
  timeZone: "Europe/Budapest",
  month: "short",
  day: "numeric",
});
const LONG_DATE = new Intl.DateTimeFormat("hu-HU", {
  timeZone: "Europe/Budapest",
  year: "numeric",
  month: "short",
  day: "numeric",
});

function dayKey(date: Date): string {
  return DAY.format(date);
}

export function formatBoardTime(date: Date, now: Date): string {
  const minutes = Math.floor((now.getTime() - date.getTime()) / 60_000);
  if (minutes < 1) return "épp most";
  if (minutes < 60) return `${minutes} perce`;
  const clock = CLOCK.format(date);
  const today = dayKey(now);
  if (dayKey(date) === today) return `ma ${clock}`;
  const yesterday = dayKey(new Date(now.getTime() - 24 * 60 * 60 * 1000));
  if (dayKey(date) === yesterday) return `tegnap ${clock}`;
  if (dayKey(date).slice(0, 4) === today.slice(0, 4)) {
    return SHORT_DATE.format(date);
  }
  return LONG_DATE.format(date);
}

//* ---------------------------------------------------------------------------
//* A PUSH
//* ---------------------------------------------------------------------------
//! A FELIRATKOZÁS NÉVTELEN, A HÍRFOLYAM NEM. A szakkör értesítését egy
//! készülék kéri, belépés nélkül is (lásd `participation.tsx`) — a hírfolyam
//! viszont csak belépve olvasható. Ezért a push NEM viszi a szöveget és a
//! szerző nevét: csak azt, hogy van új bejegyzés, és hogy a vezetőtől jött-e.
//! A tartalmat a lap mutatja, belépés után.
export function postPushPayload(
  club: { slug: string; name: string },
  byLeader: boolean,
  postId: string,
): PushPayload {
  return {
    kind: "post",
    title: club.name,
    body: byLeader
      ? "A vezető tanár új bejegyzést írt a hírfolyamra."
      : "Új bejegyzés a hírfolyamon.",
    url: `/szakkorok/${club.slug}#post-${postId}`,
    tag: `club-post:${postId}`,
  };
}
