import "server-only";
import { z } from "zod";
import { ANNOUNCEMENT_KINDS, ANNOUNCEMENT_TONES } from "./announcements";

//! ─── MIÉRT KÜLÖN FÁJL ──────────────────────────────────────────────────────
//! A `lib/announcements.ts`-t a böngésző is behúzza (a közlemény-sáv a
//! gyökér-elrendezésben ül, tehát MINDEN oldalon). Amíg ez a séma ott állt, a
//! teljes zod — minden nyelvi fájljával — minden lap első betöltésébe
//! belekerült: ~375 kB nyers JS, amit a telefon minden hidegindításkor
//! értelmezett, pedig a böngésző soha nem ellenőriz vele semmit. A séma csak a
//! server action-nek kell; a `server-only` gondoskodik róla, hogy ne is
//! kerülhessen vissza a kliensre.

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
