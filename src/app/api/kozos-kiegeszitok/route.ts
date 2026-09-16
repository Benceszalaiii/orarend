import { type NextRequest, NextResponse } from "next/server";
import { listSharedExtras, requireTeacher } from "@/lib/classroom-store";
import {
  classKeys,
  extrasKey,
  MAX_TEACHER_LINKS_PER_LESSON,
  MAX_TEACHER_LINKS_PER_TEACHER,
  SCREENTASK_DEFAULT_PORT,
  sanitizeLinkLabel,
  sanitizeLinkUrl,
  sanitizePort,
  sanitizeScreenHost,
} from "@/lib/lesson-extras";
import prisma from "@/lib/prisma";

//! ═══════════════════════════════════════════════════════════════════════════
//! A KÖZÖS KIVETÍTŐ-CÍMEK ÉS TANÁRI LINKEK VÉGPONTJA
//! ═══════════════════════════════════════════════════════════════════════════
//!   GET     — mindenkinek, belépés nélkül; CDN-en fél percig eltehető
//!   PUT     — `{ kind: "screen", room, host, port? }` — bármelyik tanár
//!   POST    — `{ kind: "link", teacher, subject, classes, url, label? }` —
//!             csak az óra saját tanára
//!   DELETE  — `{ kind: "screen", room }` bármelyik tanár;
//!             `{ kind: "link", id }` csak a link tanára
//!
//! A GET EGYETLEN, MINDENKINEK AZONOS VÁLASZ. Nincs benne semmi személyes, így
//! a CDN kiszolgálja: ezer diák órarend-megnyitása nem ezer adatbázis-lekérés,
//! hanem fél percenként egy. Az írás ára ennyi: a módosítás legfeljebb fél perc
//! alatt ér el a többiekhez (az író saját lapja azonnal frissül).
//! ═══════════════════════════════════════════════════════════════════════════

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 8 * 1024;

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function GET() {
  return NextResponse.json(await listSharedExtras(), {
    headers: {
      "Cache-Control":
        "public, max-age=0, s-maxage=30, stale-while-revalidate=300",
    },
  });
}

//! CSAK JSON — egy idegen lapról indított JSON-`fetch` előzetes CORS-kérést
//! kényszerít ki, amit nem engedélyezünk (lásd `/api/ora-kiegeszitok`).
async function readBody(
  req: NextRequest,
): Promise<Record<string, unknown> | NextResponse> {
  const type = req.headers.get("content-type") ?? "";
  if (!type.toLowerCase().startsWith("application/json")) {
    return json({ error: "unsupported-media-type" }, 415);
  }
  const raw = await req.text();
  if (new Blob([raw]).size > MAX_BODY_BYTES) {
    return json({ error: "too-large" }, 413);
  }
  try {
    const value: unknown = JSON.parse(raw);
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
  } catch {
    //* Lent egységesen válaszolunk.
  }
  return json({ error: "invalid-json" }, 400);
}

export async function PUT(req: NextRequest) {
  const teacher = await requireTeacher();
  if (!teacher) return json({ error: "forbidden" }, 403);

  const body = await readBody(req);
  if (body instanceof Response) return body;
  if (body.kind !== "screen") return json({ error: "invalid-kind" }, 400);

  const room = extrasKey(body.room);
  if (!room) return json({ error: "invalid-room" }, 400);
  const host = sanitizeScreenHost(body.host);
  const port =
    body.port === undefined ? SCREENTASK_DEFAULT_PORT : sanitizePort(body.port);
  if (!host || port === null) return json({ error: "invalid-host" }, 400);

  const row = await prisma.classroomScreen.upsert({
    where: { room },
    create: { room, host, port, updatedById: teacher.id },
    update: { host, port, updatedById: teacher.id },
  });
  return json({
    screen: {
      room: row.room,
      host: row.host,
      port: row.port,
      updatedAt: row.updatedAt.toISOString(),
    },
  });
}

export async function POST(req: NextRequest) {
  const teacher = await requireTeacher();
  if (!teacher) return json({ error: "forbidden" }, 403);

  const body = await readBody(req);
  if (body instanceof Response) return body;
  if (body.kind !== "link") return json({ error: "invalid-kind" }, 400);

  const lessonTeacher = extrasKey(body.teacher);
  const subject = extrasKey(body.subject);
  if (!lessonTeacher || !subject) return json({ error: "invalid-lesson" }, 400);
  //! A KÉRÉSBEN ÁLLÓ TANÁR CSAK AZ ÓRÁT AZONOSÍTJA, JOGOT NEM AD. A jog a
  //! belépett tanár listabeli jeléből jön.
  if (teacher.short !== lessonTeacher) {
    return json({ error: "not-your-lesson" }, 403);
  }

  const url = sanitizeLinkUrl(body.url);
  if (!url) return json({ error: "invalid-url" }, 400);
  const label = sanitizeLinkLabel(body.label);
  const classes = classKeys(body.classes);

  const [perLesson, total] = await Promise.all([
    prisma.teacherLessonLink.count({
      where: { teacher: lessonTeacher, subject },
    }),
    prisma.teacherLessonLink.count({ where: { teacher: lessonTeacher } }),
  ]);
  if (
    perLesson >= MAX_TEACHER_LINKS_PER_LESSON ||
    total >= MAX_TEACHER_LINKS_PER_TEACHER
  ) {
    return json({ error: "too-many" }, 409);
  }

  const row = await prisma.teacherLessonLink.create({
    data: {
      teacher: lessonTeacher,
      subject,
      classes,
      url,
      label,
      createdById: teacher.id,
    },
  });
  return json(
    {
      link: {
        id: row.id,
        teacher: row.teacher,
        subject: row.subject,
        classes: row.classes,
        url: row.url,
        label: row.label,
        createdAt: row.createdAt.toISOString(),
      },
    },
    201,
  );
}

export async function DELETE(req: NextRequest) {
  const teacher = await requireTeacher();
  if (!teacher) return json({ error: "forbidden" }, 403);

  const body = await readBody(req);
  if (body instanceof Response) return body;

  if (body.kind === "screen") {
    const room = extrasKey(body.room);
    if (!room) return json({ error: "invalid-room" }, 400);
    await prisma.classroomScreen.deleteMany({ where: { room } });
    return json({ ok: true });
  }

  if (body.kind === "link") {
    if (typeof body.id !== "string" || body.id.length > 64) {
      return json({ error: "invalid-id" }, 400);
    }
    if (!teacher.short) return json({ error: "not-your-lesson" }, 403);
    //* A tanár jelére is szűrünk: más tanár linkjét az azonosító ismerete
    //* sem törli. Idempotens, és nem árulja el, létezik-e a sor.
    await prisma.teacherLessonLink.deleteMany({
      where: { id: body.id, teacher: teacher.short },
    });
    return json({ ok: true });
  }

  return json({ error: "invalid-kind" }, 400);
}
