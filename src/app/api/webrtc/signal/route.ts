import { type NextRequest, NextResponse } from "next/server";
import { resolveIdentity } from "@/lib/webrtc-identity";
import {
  isPeerId,
  type SignalEnvelope,
  type SignalKind,
} from "@/lib/webrtc-shared";
import { drainSignals, getStream, pushSignal } from "@/lib/webrtc-store";

//! ═══════════════════════════════════════════════════════════════════════════
//! A JELZŐCSATORNA — EZ AZ EGYETLEN DOLOG, AMIT A SZERVER CSINÁL
//! ═══════════════════════════════════════════════════════════════════════════
//!   POST — üzenet a címzett postaládájába (a nevet MI írjuk rá)
//!   GET  — a saját ládám kiürítése
//!
//! AMI ÁTMEGY RAJTA: SDP-leírások és ICE-jelöltek. Ezek a kapcsolat
//! FELÉPÍTÉSÉRŐL szólnak, nem a tartalmáról — a kép a kézfogás után
//! közvetlenül, titkosítva megy a két böngésző között, és ezt a végpontot
//! többé nem érinti.
//!
//! AMI NEM MEGY ÁT RAJTA: a csevegés. Az a megosztó gépén fut össze, az
//! adatcsatornán. Ha valaki ezt a végpontot figyelné, a beszélgetésből semmit
//! nem látna — mert nem itt van.
//!
//! ─── MIÉRT NINCS SSE VAGY WEBSOCKET ────────────────────────────────────────
//! Mert az a szerveren egy futó példányt köt le, amíg a lap nyitva van — egy
//! tanórán át nyitva hagyott néző így akkor is fogyaszt, amikor semmi nem
//! történik. A jelzés ezzel szemben MÁSODPERCEKIG tart: a néző gyorsan
//! kérdezget, amíg kapcsolódik, aztán abbahagyja (lásd `VIEWER_POLL_MS` és a
//! `webrtc-viewer.ts` szüneteltetése). Egy egész délelőtt nézett megosztás így
//! néhány tucat rövid kérés, nem egy órákig nyitva tartott kapcsolat.
//! ═══════════════════════════════════════════════════════════════════════════

export const dynamic = "force-dynamic";

//! A HATÁR AZ SDP MIATT ENNYI, ÉS NEM KEVESEBB. Egy videós ajánlat a
//! kodeklistával együtt simán 8–10 kB; egy 4 kB-os korlát a kapcsolatot
//! magát vágná el. Egy ICE-jelölt ehhez képest pár száz bájt.
const MAX_BODY_BYTES = 64 * 1024;

const KINDS: readonly SignalKind[] = ["join", "offer", "answer", "ice", "bye"];

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(req: NextRequest) {
  const type = req.headers.get("content-type") ?? "";
  if (!type.toLowerCase().startsWith("application/json")) {
    return json({ error: "unsupported-media-type" }, 415);
  }
  const raw = await req.text();
  if (new Blob([raw]).size > MAX_BODY_BYTES) {
    return json({ error: "too-large" }, 413);
  }

  let body: Record<string, unknown>;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return json({ error: "invalid-json" }, 400);
    }
    body = value as Record<string, unknown>;
  } catch {
    return json({ error: "invalid-json" }, 400);
  }

  const to = body.to;
  const streamId = body.streamId;
  const kind = body.kind;
  if (!isPeerId(to) || !isPeerId(streamId)) return json({ error: "bad" }, 400);
  if (typeof kind !== "string" || !KINDS.includes(kind as SignalKind)) {
    return json({ error: "bad-kind" }, 400);
  }

  //! A NÉV NEM A TÖRZSBŐL JÖN. Ez a hívás az egyetlen hely, ahol egy résztvevő
  //! neve megszületik — lásd `webrtc-identity.ts`. A `body.name` mezőt
  //! szándékosan nem is olvassuk; ha egy kliens küld ilyet, elvész.
  const who = await resolveIdentity(body.peer, body.nickname);
  if (!who.ok) return json({ error: who.reason }, 400);

  //! ─── A CSATLAKOZÁS CSAK ÉLŐ MEGOSZTÁSHOZ MEHET ──────────────────────────
  //! A `join` az EGYETLEN üzenet, amit ismeretlen fél küld egy nyilvános
  //! címre — ezért csak ez az egy kerül ellenőrzésre: van-e ilyen megosztás,
  //! és tényleg a megosztó ládájába megy-e. Enélkül a jegyzékből kiolvasott
  //! azonosítóval bárki bárkinek a ládájába dobhatna jelzést.
  //!
  //! A TÖBBI ÜZENET MÁR EGY FOLYÓ PÁRBESZÉD RÉSZE: a néző ládájának címét csak
  //! az a megosztó ismeri, akinek a néző maga megírta. Ott a cím titkossága a
  //! védelem, és ez elég — a képhez a jelzés ismerete úgysem vezet el, azt a
  //! DTLS-kézfogás védi.
  if (kind === "join") {
    const stream = await getStream(streamId);
    if (!stream || stream.hostPeer !== to) {
      return json({ error: "no-stream" }, 404);
    }
  }

  const envelope: SignalEnvelope = {
    kind: kind as SignalKind,
    from: who.identity,
    streamId,
    payload: body.payload ?? null,
    at: Date.now(),
  };
  await pushSignal(to, envelope);
  return new Response(null, { status: 204 });
}

//! A LÁDÁT A CÍMÉVEL LEHET KIÜRÍTENI, ÉS AZ MAGA A JOGOSULTSÁG. Nincs mit
//! hitelesíteni: a cím egy 122 bites véletlen, amit a tulajdonosa hozott
//! létre és csak ő oszt meg. Épp ezért a lekérdezés MUNKAMENETET SEM OLVAS —
//! egy be nem jelentkezett vendégnek is működnie kell.
export async function GET(req: NextRequest) {
  const peer = new URL(req.url).searchParams.get("peer");
  if (!isPeerId(peer)) return json({ error: "bad-peer" }, 400);
  const messages = await drainSignals(peer);
  return json({ messages });
}
