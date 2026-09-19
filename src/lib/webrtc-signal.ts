"use client";

import type {
  SignalEnvelope,
  SignalKind,
  StreamSummary,
} from "./webrtc-shared";

//! ═══════════════════════════════════════════════════════════════════════════
//! A JELZŐCSATORNA BÖNGÉSZŐOLDALA
//! ═══════════════════════════════════════════════════════════════════════════
//! Négy hívás, és egyik sem tart tovább egy pillanatnál. A modul SZÁNDÉKOSAN
//! nem tud sem az `RTCPeerConnection`-ről, sem a felületről: ő csak a postát
//! viszi. A hibát sem kezeli — visszaadja, és a hívó dönt, mert csak ő tudja,
//! mit jelent egy elmaradt válasz (a néző újrapróbálja, a megosztó a következő
//! szívverésig vár).
//! ═══════════════════════════════════════════════════════════════════════════

/** Aki küld — a nevet ebből a SZERVER oldja fel (lásd `webrtc-identity.ts`). */
export type Me = { peer: string; nickname: string | null };

const JSON_HEADERS = { "Content-Type": "application/json" };

export async function sendSignal(
  me: Me,
  to: string,
  streamId: string,
  kind: SignalKind,
  payload: unknown,
): Promise<boolean> {
  try {
    const res = await fetch("/api/webrtc/signal", {
      method: "POST",
      headers: JSON_HEADERS,
      //* A süti kell: ebből lesz a hitelesített név a belépetteknél.
      credentials: "same-origin",
      body: JSON.stringify({
        peer: me.peer,
        nickname: me.nickname,
        to,
        streamId,
        kind,
        payload,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

//* A saját láda kiürítése. A szerver `LPOP`-pal ad: amit egyszer kivettünk, az
//* többé nem jön vissza — ezért a hívónak fel kell dolgoznia, amit kapott.
export async function drainSignals(
  peer: string,
  signal?: AbortSignal,
): Promise<SignalEnvelope[]> {
  try {
    const res = await fetch(
      `/api/webrtc/signal?peer=${encodeURIComponent(peer)}`,
      { cache: "no-store", signal },
    );
    if (!res.ok) return [];
    const body = (await res.json()) as { messages?: SignalEnvelope[] };
    return body.messages ?? [];
  } catch {
    return [];
  }
}

export type StreamList = {
  streams: StreamSummary[];
  /** Hamis: a szerver memóriájában tartjuk a jegyzéket (fejlesztői mód). */
  distributed: boolean;
};

export async function fetchStreams(
  signal?: AbortSignal,
): Promise<StreamList | null> {
  try {
    const res = await fetch("/api/webrtc/streams", {
      cache: "no-store",
      signal,
    });
    if (!res.ok) return null;
    return (await res.json()) as StreamList;
  } catch {
    return null;
  }
}

//! Létrehozás ÉS szívverés: ugyanaz a hívás (lásd `webrtc-store.ts`).
//! A VÁLASZ AZÉRT ÉRDEKES, mert a szerver a megosztó HITELESÍTETT nevét írja
//! bele — ebből tudja meg a megosztó, milyen néven látják őt a nézők, és ezt
//! teszi a saját csevegő-üzeneteire is. A név itt sem a kliensé.
export type Heartbeat = {
  stream: StreamSummary;
  /** Hány jelzés vár a megosztó postaládájában — lásd `HEARTBEAT_MS`. */
  mail: number;
};

export async function announceStream(
  me: Me,
  id: string,
  title: string,
  viewers: number,
  locked: boolean,
): Promise<Heartbeat | null> {
  try {
    const res = await fetch("/api/webrtc/streams", {
      method: "POST",
      headers: JSON_HEADERS,
      credentials: "same-origin",
      body: JSON.stringify({
        peer: me.peer,
        nickname: me.nickname,
        id,
        title,
        viewers,
        locked,
      }),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as {
      stream?: StreamSummary;
      mail?: number;
    };
    return body.stream ? { stream: body.stream, mail: body.mail ?? 0 } : null;
  } catch {
    return null;
  }
}

//! A LEVÉTEL CSAK GYORSÍT. Ha nem érkezik meg (bezárt lap, elvesztett hálózat),
//! a bejegyzés 45 másodpercen belül magától lejár — a helyes működés NEM ezen
//! a híváson múlik. Ezért használ `keepalive`-ot: a lap bezárásakor indított
//! kérés így még elmegy.
export function endStream(me: Me, id: string): void {
  try {
    void fetch("/api/webrtc/streams", {
      method: "DELETE",
      headers: JSON_HEADERS,
      credentials: "same-origin",
      keepalive: true,
      body: JSON.stringify({ peer: me.peer, id }),
    }).catch(() => {});
  } catch {
    /* a lejárat úgyis elintézi */
  }
}
