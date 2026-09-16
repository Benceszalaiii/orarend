import "server-only";

import { headers } from "next/headers";
import type { PublicAnnouncement } from "./announcements";
import { auth } from "./auth";
import prisma from "./prisma";

//! A JOG AZ ADATBÁZISBÓL JÖN, NEM A MUNKAMENET-SÜTIBŐL. A süti gyorsítótára
//! (`cookieCache`, 5 perc) egy visszavont jogot még percekig hordozhatna —
//! írásnál ez a néhány milliszekundumos lekérdezés megéri.
export async function requireAdmin(): Promise<{ id: string } | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, isAdmin: true },
  });
  return user?.isAdmin ? { id: user.id } : null;
}

//* A most érvényes közlemények, a böngészőnek szánt alakban. Adatbázis nélkül
//* (vagy ha elhasal) üres lista — a közlemény soha nem viheti magával a lapot.
export async function listLiveAnnouncements(): Promise<PublicAnnouncement[]> {
  if (!process.env.DB_URL) return [];
  const now = new Date();
  try {
    const rows = await prisma.announcement.findMany({
      where: {
        active: true,
        AND: [
          { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
          { OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
        ],
      },
      orderBy: { createdAt: "desc" },
    });
    return rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      tone: row.tone,
      title: row.title,
      message: row.message,
      paths: row.paths,
      updatedAt: row.updatedAt.toISOString(),
    }));
  } catch (error) {
    console.error("[kozlemenyek] lekérés sikertelen", error);
    return [];
  }
}
