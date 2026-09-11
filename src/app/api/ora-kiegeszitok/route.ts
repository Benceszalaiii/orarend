import { headers } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  extrasKey,
  type LessonExtras,
  type LessonLink,
  MAX_LINKS_PER_LESSON,
  MAX_LINKS_TOTAL,
  MAX_SCREENS_TOTAL,
  SCREENTASK_DEFAULT_PORT,
  type ScreenHost,
  sanitizeLinkLabel,
  sanitizeLinkUrl,
  sanitizePort,
  sanitizeScreenHost,
} from "@/lib/lesson-extras";
import prisma from "@/lib/prisma";

//! ═══════════════════════════════════════════════════════════════════════════
//! AZ ÓRÁHOZ KÖTÖTT LINKEK ÉS KIVETÍTŐ-CÍMEK VÉGPONTJA
//! ═══════════════════════════════════════════════════════════════════════════
//! Ugyanaz az elv, mint a beállítás-szinkronnál (`/api/beallitasok`): minden
//! művelet KIZÁRÓLAG a bejelentkezett felhasználó SAJÁT soraira vonatkozik, és a
//! felhasználó azonosítója a munkamenetből jön, sosem a kérésből.
//!
//!   GET     — az összes saját link és kivetítő-cím (kevés sor, egy körben)
//!   POST    — új link egy tanár + tantárgy párhoz
//!   PUT     — kivetítő-cím beállítása egy tanár + terem párhoz (felülírja)
//!   DELETE  — `{ kind: "link", id }` vagy `{ kind: "screen", teacher, room }`
//! ═══════════════════════════════════════════════════════════════════════════

const MAX_BODY_BYTES = 8 * 1024;

async function currentUserId(): Promise<string | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user.id ?? null;
}

//! Személyes adat — köztes gyorsítótár sosem teheti el (lásd `/api/beallitasok`).
function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

const unauthorized = () => json({ error: "unauthenticated" }, 401);

//! CSAK JSON-T FOGADUNK EL. Egy másik oldalról indított `fetch` JSON-törzzsel
//! előzetes CORS-kérést kényszerít ki, amit mi nem engedélyezünk — így egy
//! idegen lap akkor sem írhat a diák nevében, ha a süti valahogy átjutna.
async function readBody(
  req: NextRequest,
): Promise<Record<string, unknown> | NextResponse> {
  const type = req.headers.get("content-type") ?? "";
  if (!type.toLowerCase().startsWith("application/json")) {
    return json({ error: "unsupported-media-type" }, 415);
  }
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) {
    return json({ error: "too-large" }, 413);
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

function toLink(row: {
  id: string;
  teacher: string;
  subject: string;
  url: string;
  label: string | null;
  createdAt: Date;
}): LessonLink {
  return {
    id: row.id,
    teacher: row.teacher,
    subject: row.subject,
    url: row.url,
    label: row.label,
    createdAt: row.createdAt.toISOString(),
  };
}

function toScreen(row: {
  teacher: string;
  room: string;
  host: string;
  port: number;
  updatedAt: Date;
}): ScreenHost {
  return {
    teacher: row.teacher,
    room: row.room,
    host: row.host,
    port: row.port,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function GET() {
  const userId = await currentUserId();
  if (!userId) return unauthorized();

  const [links, screens] = await Promise.all([
    prisma.lessonLink.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
    }),
    prisma.screenTaskHost.findMany({ where: { userId } }),
  ]);

  return json({
    links: links.map(toLink),
    screens: screens.map(toScreen),
  } satisfies LessonExtras);
}

export async function POST(req: NextRequest) {
  const userId = await currentUserId();
  if (!userId) return unauthorized();

  const body = await readBody(req);
  if (body instanceof Response) return body;

  const teacher = extrasKey(body.teacher);
  const subject = extrasKey(body.subject);
  if (!teacher || !subject) return json({ error: "invalid-lesson" }, 400);

  const url = sanitizeLinkUrl(body.url);
  if (!url) return json({ error: "invalid-url" }, 400);
  const label = sanitizeLinkLabel(body.label);

  //* Ugyanaz a cím ugyanahhoz az órához kétszer nem kerül fel — a második
  //* mentés a meglévő sort adja vissza (a felirat frissül, ha adtak újat).
  const duplicate = await prisma.lessonLink.findFirst({
    where: { userId, teacher, subject, url },
  });
  if (duplicate) {
    const row =
      label && label !== duplicate.label
        ? await prisma.lessonLink.update({
            where: { id: duplicate.id },
            data: { label },
          })
        : duplicate;
    return json({ link: toLink(row) });
  }

  const [perLesson, total] = await Promise.all([
    prisma.lessonLink.count({ where: { userId, teacher, subject } }),
    prisma.lessonLink.count({ where: { userId } }),
  ]);
  if (perLesson >= MAX_LINKS_PER_LESSON || total >= MAX_LINKS_TOTAL) {
    return json({ error: "too-many" }, 409);
  }

  const row = await prisma.lessonLink.create({
    data: { userId, teacher, subject, url, label },
  });
  return json({ link: toLink(row) }, 201);
}

export async function PUT(req: NextRequest) {
  const userId = await currentUserId();
  if (!userId) return unauthorized();

  const body = await readBody(req);
  if (body instanceof Response) return body;

  const teacher = extrasKey(body.teacher);
  const room = extrasKey(body.room);
  if (!teacher || !room) return json({ error: "invalid-lesson" }, 400);

  const host = sanitizeScreenHost(body.host);
  const port =
    body.port === undefined ? SCREENTASK_DEFAULT_PORT : sanitizePort(body.port);
  if (!host || port === null) return json({ error: "invalid-host" }, 400);

  const key = { userId_teacher_room: { userId, teacher, room } };
  const existing = await prisma.screenTaskHost.findUnique({ where: key });
  if (!existing) {
    const total = await prisma.screenTaskHost.count({ where: { userId } });
    if (total >= MAX_SCREENS_TOTAL) return json({ error: "too-many" }, 409);
  }

  const row = await prisma.screenTaskHost.upsert({
    where: key,
    create: { userId, teacher, room, host, port },
    update: { host, port },
  });
  return json({ screen: toScreen(row) });
}

//! A TÖRLÉS MINDIG A `userId`-RA IS SZŰR. Egy idegen link azonosítójának
//! ismerete így sem elég ahhoz, hogy valaki más sorát törölje: a feltétel
//! egyszerűen nem talál semmit. A válasz ilyenkor is `ok` — a törlés
//! idempotens, és nem árulja el, létezik-e a másik sor.
export async function DELETE(req: NextRequest) {
  const userId = await currentUserId();
  if (!userId) return unauthorized();

  const body = await readBody(req);
  if (body instanceof Response) return body;

  if (body.kind === "link") {
    if (typeof body.id !== "string" || body.id.length > 64) {
      return json({ error: "invalid-id" }, 400);
    }
    await prisma.lessonLink.deleteMany({ where: { id: body.id, userId } });
    return json({ ok: true });
  }

  if (body.kind === "screen") {
    const teacher = extrasKey(body.teacher);
    const room = extrasKey(body.room);
    if (!teacher || !room) return json({ error: "invalid-lesson" }, 400);
    await prisma.screenTaskHost.deleteMany({
      where: { userId, teacher, room },
    });
    return json({ ok: true });
  }

  return json({ error: "invalid-kind" }, 400);
}
