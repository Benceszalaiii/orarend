import { type NextRequest, NextResponse } from "next/server";
import { requireTeacher } from "@/lib/classroom-store";
import { resolveIdentity } from "@/lib/webrtc-identity";
import {
  isPeerId,
  type StreamSummary,
  sanitizeTitle,
} from "@/lib/webrtc-shared";
import {
  dropStream,
  getStream,
  listStreams,
  putStream,
  webrtcStoreDistributed,
} from "@/lib/webrtc-store";

//! ═══════════════════════════════════════════════════════════════════════════
//! A MEGOSZTÁSOK JEGYZÉKE
//! ═══════════════════════════════════════════════════════════════════════════
//!   GET    — mi megy most (a felfedező lista)
//!   POST   — „élek": bejegyzés létrehozása ÉS szívverése, egyetlen hívásban
//!   DELETE — „vége"
//!
//! A BEJEGYZÉS NEM TARTALMAZ HÁLÓZATI ADATOT. Se IP, se port, se terem — csak
//! cím, a megosztó neve és a postaládája. Ahova a néző csatlakozik, azt az ICE
//! találja meg a két böngésző között; a szervernek ehhez semmi köze.
//!
//! ─── A TANÁRI JELET A SZERVER ADJA ─────────────────────────────────────────
//! Ha a megosztó tanár, a bejegyzés megkapja a JELÉT is — ettől jelenik meg az
//! „élő" jelzés a diákok óráin (lásd `webrtc-live.ts`). A jelet a
//! `requireTeacher` oldja fel az ADATBÁZISBÓL és a Jedlikinfo tanárlistájából;
//! a kérés törzséből SOHA. Enélkül bárki bármelyik tanár óráira tehetne
//! „most élőben" jelzést — a diákok órarendjére, a tanár tudta nélkül.
//! ═══════════════════════════════════════════════════════════════════════════

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 4 * 1024;

//* A lista pillanatkép, és tíz másodperc múlva már nem az — köztes
//* gyorsítótár sosem teheti el.
function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

//! CSAK JSON-T FOGADUNK EL — ugyanaz a védelem, mint az `/api/ora-kiegeszitok`-nál:
//! a JSON-törzsű kérés előzetes CORS-kérdést kényszerít ki, amit nem
//! engedélyezünk, tehát idegen lap a diák sütijével sem tud a nevében megosztást
//! hirdetni.
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
    //* Lent egységes a válasz.
  }
  return json({ error: "invalid-json" }, 400);
}

export async function GET() {
  const streams = await listStreams();
  return json({ streams, distributed: webrtcStoreDistributed() });
}

export async function POST(req: NextRequest) {
  const body = await readBody(req);
  if (body instanceof NextResponse) return body;

  const who = await resolveIdentity(body.peer, body.nickname);
  if (!who.ok) return json({ error: who.reason }, 400);

  const id = body.id;
  if (!isPeerId(id)) return json({ error: "bad-stream" }, 400);
  const title = sanitizeTitle(body.title) ?? "Képernyőmegosztás";

  //! ─── A BEJEGYZÉS TULAJDONOSA A POSTALÁDA ────────────────────────────────
  //! Egy létező megosztást CSAK az írhat felül, aki ugyanazt a `hostPeer`-t
  //! hozza. Enélkül bárki, aki látja a listát, átírhatná más megosztásának a
  //! címét — vagy ami rosszabb, a `hostPeer`-t a SAJÁT ládájára, és a nézők
  //! hozzá csatlakoznának. Mivel a néző azonosítója véletlen és sosem
  //! nyilvános, ez a feltétel elég.
  const existing = await getStream(id);
  if (existing && existing.hostPeer !== who.identity.peer) {
    return json({ error: "taken" }, 409);
  }

  //* A nézők számát a megosztó gépe tudja (annyi kapcsolata van), ezért ő
  //* küldi. Ez a szám tájékoztatás a listában, nem elszámolás: hamisan is
  //* felküldhető, és semmi nem múlik rajta.
  const viewers = Number(body.viewers);

  //! A TANÁRI JEL FELOLDÁSA MINDEN SZÍVVERÉSNÉL ÚJRA MEGTÖRTÉNIK. Így egy
  //! visszavont tanári jog a megosztás alatt is érvényre jut: a jelzés a
  //! következő szívverésnél eltűnik a diákok óráiról. A lekérdezés ára egy
  //! indexelt sor 15 másodpercenként, megosztásonként.
  const teacher = await requireTeacher();

  const stream: StreamSummary & { updatedAt: number } = {
    id,
    title,
    hostPeer: who.identity.peer,
    host: { name: who.identity.name, verified: who.identity.verified },
    //* Az indulás ideje az ELSŐ bejegyzésé — a szívverés nem tolja maga előtt,
    //* különben minden megosztás örökké „most kezdődött" lenne.
    startedAt: existing?.startedAt ?? Date.now(),
    viewers: Number.isFinite(viewers) ? Math.max(0, Math.min(500, viewers)) : 0,
    teacher: teacher?.short ?? null,
    //! A ZÁR TÉNYE A KLIENSTŐL JÖN, ÉS EZ RENDBEN VAN: a bejegyzés csak
    //! MEGMONDJA a nézőnek, hogy jelszót fog kérni. A tényleges ellenőrzés a
    //! megosztó gépén történik (lásd `joinProof`), ahol a kép is van — egy
    //! hamisan „nyitottnak" hirdetett megosztáshoz sem lehet jelszó nélkül
    //! csatlakozni.
    locked: body.locked === true,
    updatedAt: Date.now(),
  };

  await putStream(stream);
  return json({ stream });
}

export async function DELETE(req: NextRequest) {
  const body = await readBody(req);
  if (body instanceof NextResponse) return body;

  const id = body.id;
  const peer = body.peer;
  if (!isPeerId(id) || !isPeerId(peer)) return json({ error: "bad" }, 400);

  //! Ugyanaz a feltétel, mint a felülírásnál: csak a sajátját veheti le. Ha
  //! nem övé, NEM HIBÁZUNK — a válasz ugyanaz, mintha nem is létezne. Egy
  //! idegen így abból sem tud következtetni, hogy egy azonosító él-e.
  const existing = await getStream(id);
  if (existing && existing.hostPeer === peer) await dropStream(id);
  return new Response(null, { status: 204 });
}
