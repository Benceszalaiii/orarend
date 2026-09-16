import "server-only";

import { headers } from "next/headers";
import { auth } from "./auth";
import type { SharedExtras } from "./lesson-extras";
import { extrasKey } from "./lesson-extras";
import prisma from "./prisma";
import { loadTeacherDirectory } from "./teacher-directory";
import { findTeacherByName, normalizeName } from "./teacher-name";

//! ═══════════════════════════════════════════════════════════════════════════
//! A TANÁR ÁLTAL BEÁLLÍTOTT, KÖZÖS SOROK — SZERVEROLDAL
//! ═══════════════════════════════════════════════════════════════════════════
//! Két jog, két szigorúság:
//!   • TEREM KIVETÍTŐJE — bármelyik tanár (`isTeacher`). A gép a teremé; ha új
//!     IP-t kap, az javítsa, aki épp ott áll.
//!   • LINK EGY ÓRÁHOZ — csak az óra SAJÁT tanára. A jelét a Jedlikinfo
//!     tanárlistájából oldjuk fel, nem a kérésből vesszük.
//! ═══════════════════════════════════════════════════════════════════════════

export type TeacherActor = {
  id: string;
  //* A tanár jele `extrasKey` alakban; `null`, ha a listában nem találtuk
  //* egyértelműen (vagy épp nem elérhető). Termet ilyenkor is állíthat.
  short: string | null;
};

//! A JOG AZ ADATBÁZISBÓL JÖN, NEM A SÜTIBŐL — ugyanaz az indok, mint a
//! `requireAdmin`-nál: a süti gyorsítótára egy visszavont jogot percekig vinne.
export async function requireTeacher(): Promise<TeacherActor | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, isTeacher: true, teacherName: true, name: true },
  });
  if (!user?.isTeacher) return null;
  return { id: user.id, short: await resolveTeacherShort(user) };
}

//! KÉT ÚT A JELIG, MINDKETTŐ PONTOS EGYEZÉS.
//!   • Google-belépésnél a `teacherName` MÁR a lista neve — egy az egyben.
//!   • AD-belépésnél nincs `teacherName`; a megjelenített nevet vetjük össze a
//!     listával, ugyanazzal a szigorú (többértelműségre `null`-t adó)
//!     illesztéssel, ami a Google-fiókoknak tanári jogot ad.
async function resolveTeacherShort(user: {
  teacherName: string | null;
  name: string;
}): Promise<string | null> {
  const directory = await loadTeacherDirectory();
  if (!directory) return null;
  if (user.teacherName) {
    //! ELŐBB BETŰRE PONTOSAN. A normalizálás a zárójeles dátumot is eldobja,
    //! tehát a két `Horváth Norbert (…)` normalizálva azonos — a pontos név
    //! viszont egyedi, és a `teacherName` épp a lista neve.
    const exact = directory.filter((t) => t.name === user.teacherName);
    if (exact.length === 1) return extrasKey(exact[0].short);
    const wanted = normalizeName(user.teacherName);
    const hits = directory.filter((t) => normalizeName(t.name) === wanted);
    return hits.length === 1 ? extrasKey(hits[0].short) : null;
  }
  const match = findTeacherByName(user.name, directory);
  return match ? extrasKey(match.short) : null;
}

//* Minden közös sor egy körben — kevés sor, és a válasz CDN-en gyorsítótárazható.
//* Adatbázis nélkül (vagy ha elhasal) üres: az órarend ettől nem állhat meg.
export async function listSharedExtras(): Promise<SharedExtras> {
  if (!process.env.DB_URL) return { screens: [], links: [] };
  try {
    const [screens, links] = await Promise.all([
      prisma.classroomScreen.findMany({ orderBy: { room: "asc" } }),
      prisma.teacherLessonLink.findMany({ orderBy: { createdAt: "asc" } }),
    ]);
    return {
      screens: screens.map((row) => ({
        room: row.room,
        host: row.host,
        port: row.port,
        updatedAt: row.updatedAt.toISOString(),
      })),
      links: links.map((row) => ({
        id: row.id,
        teacher: row.teacher,
        subject: row.subject,
        classes: row.classes,
        url: row.url,
        label: row.label,
        createdAt: row.createdAt.toISOString(),
      })),
    };
  } catch (error) {
    console.error("[kozos-kiegeszitok] lekérés sikertelen", error);
    return { screens: [], links: [] };
  }
}
