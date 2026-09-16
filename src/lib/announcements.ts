import { z } from "zod";

//! ═══════════════════════════════════════════════════════════════════════════
//! KÖZLEMÉNYEK — A KÖZÖS RÉSZ
//! ═══════════════════════════════════════════════════════════════════════════
//! A szerver (`/api/kozlemenyek`, `/admin`) és a böngésző (`announcements.tsx`)
//! ugyanebből a fájlból dolgozik: ugyanaz az alak, ugyanaz az útvonal-illesztés.
//! Nincs benne se adatbázis, se React — ezért tesztelhető és mindkét oldalon
//! behúzható.
//! ═══════════════════════════════════════════════════════════════════════════

export const ANNOUNCEMENT_KINDS = ["BAR", "TOAST", "BLOCK"] as const;
export const ANNOUNCEMENT_TONES = ["INFO", "WARNING", "ERROR"] as const;

export type AnnouncementKind = (typeof ANNOUNCEMENT_KINDS)[number];
export type AnnouncementTone = (typeof ANNOUNCEMENT_TONES)[number];

//* Ami a böngészőbe megy. Az időablakot a szerver már kiszűrte, azt nem küldjük.
export type PublicAnnouncement = {
  id: string;
  kind: AnnouncementKind;
  tone: AnnouncementTone;
  title: string | null;
  message: string;
  paths: string[];
  updatedAt: string;
};

export const KIND_LABELS: Record<AnnouncementKind, string> = {
  BAR: "Sáv a lap tetején",
  TOAST: "Buborék (kattintásig marad)",
  BLOCK: "Teljes lapos hiba (letiltja a lapot)",
};

export const TONE_LABELS: Record<AnnouncementTone, string> = {
  INFO: "Tájékoztatás",
  WARNING: "Figyelmeztetés",
  ERROR: "Hiba",
};

//! ─── EZEKET A LAPOKAT A TELJES LAPOS HIBA SOSEM TAKARJA EL ──────────────────
//! Egy `*`-os karbantartás különben a saját kikapcsológombját is letakarná: az
//! üzemeltető nem tudna se belépni, se visszavonni. Sáv és buborék itt is
//! megjelenhet — azok nem zárnak ki senkit.
const BLOCK_EXEMPT = ["/admin", "/belepes"];

export function isBlockExempt(pathname: string): boolean {
  return BLOCK_EXEMPT.some(
    (base) => pathname === base || pathname.startsWith(`${base}/`),
  );
}

function trimSlash(path: string): string {
  return path.length > 1 ? path.replace(/\/+$/, "") : path;
}

//! ─── AZ ÚTVONAL-ILLESZTÉS ───────────────────────────────────────────────────
//! Három alak, és szándékosan csak ennyi — egy reguláris kifejezés az admin
//! felületen elgépelve csendben rossz lapokra tenné ki a közleményt.
//!   `*`          — minden lap
//!   `/orarend`   — pontosan ez a lap
//!   `/tanari/*`  — ez a lap és minden alatta
export function pathMatches(pattern: string, pathname: string): boolean {
  const p = pattern.trim();
  if (p === "*") return true;
  const path = trimSlash(pathname);
  if (p.endsWith("/*")) {
    const base = trimSlash(p.slice(0, -2) || "/");
    if (base === "/") return true;
    return path === base || path.startsWith(`${base}/`);
  }
  return trimSlash(p) === path;
}

export function appliesTo(
  announcement: Pick<PublicAnnouncement, "paths">,
  pathname: string,
): boolean {
  return announcement.paths.some((pattern) => pathMatches(pattern, pathname));
}

//* Vesszővel vagy új sorral elválasztott lista → tiszta minta-tömb. A `/` nélkül
//* beírt útvonal megkapja az elejére (`orarend` → `/orarend`).
export function parsePaths(raw: string): string[] {
  const out = new Set<string>();
  for (const part of raw.split(/[\n,]/)) {
    const value = part.trim();
    if (!value) continue;
    out.add(value === "*" || value.startsWith("/") ? value : `/${value}`);
  }
  return [...out];
}

const PATH_PATTERN = /^(\*|\/[A-Za-z0-9\-_/]*(\/\*)?)$/;

//! ─── AZ ŰRLAP ELLENŐRZÉSE ───────────────────────────────────────────────────
//! A server action nyilvános végpont — a `requireAdmin` után is csak ellenőrzött
//! alakot írunk az adatbázisba.
export const announcementInput = z
  .object({
    kind: z.enum(ANNOUNCEMENT_KINDS),
    tone: z.enum(ANNOUNCEMENT_TONES),
    title: z
      .string()
      .trim()
      .max(120, "A cím legfeljebb 120 karakter.")
      .transform((v) => (v.length > 0 ? v : null)),
    message: z
      .string()
      .trim()
      .min(1, "Az üzenet nem lehet üres.")
      .max(1000, "Az üzenet legfeljebb 1000 karakter."),
    paths: z
      .array(
        z
          .string()
          .regex(
            PATH_PATTERN,
            "Érvénytelen útvonal (pl. *, /orarend, /tanari/*).",
          ),
      )
      .min(1, "Adj meg legalább egy útvonalat (vagy *-ot)."),
    active: z.boolean(),
    startsAt: z.date().nullable(),
    endsAt: z.date().nullable(),
  })
  .refine((v) => !v.startsAt || !v.endsAt || v.startsAt < v.endsAt, {
    message: "A kezdés a befejezés előtt legyen.",
    path: ["endsAt"],
  });

export type AnnouncementInput = z.infer<typeof announcementInput>;
