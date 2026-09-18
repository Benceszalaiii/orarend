import "server-only";

import { Redis } from "@upstash/redis";
import {
  MAILBOX_MAX,
  MAILBOX_TTL_SECONDS,
  type SignalEnvelope,
  STREAM_TTL_SECONDS,
  type StreamSummary,
} from "./webrtc-shared";

//! ═══════════════════════════════════════════════════════════════════════════
//! A JELZÉS TÁROLÓJA — AMI A SZERVEREN MEGÁLL, ÉS AMI NEM
//! ═══════════════════════════════════════════════════════════════════════════
//! KÉT ADAT VAN, ÉS MINDKETTŐ MAGÁTÓL ELMÚLIK:
//!
//!   1. A MEGOSZTÁSOK JEGYZÉKE (45 mp). Cím, a megosztó neve, a postaládája,
//!      a nézők száma. Ebből áll a felfedező lista.
//!   2. POSTALÁDÁK (120 mp). Rövid üzenetsorok, amiken a két böngésző
//!      megbeszéli a kapcsolatot. Egy sikeres kapcsolat után ÜRESEN állnak,
//!      majd lejárnak.
//!
//! AMI NINCS: kép, hang, felvétel, csevegés, IP-cím, kapcsolati napló. A média
//! és a csevegés a két böngésző között megy — ez a modul nem tud róluk.
//!
//! A LEJÁRAT NEM TAKARÍTÁS, HANEM A MŰKÖDÉS. Nincs olyan végpont, aminek
//! „rendet kell tennie", és nincs olyan hiba, ami szemetet hagyna: egy
//! lezuhant lap, egy lecsapott laptopfedél, egy megszakadt wifi mind ugyanaz —
//! a szívverés elmarad, a bejegyzés elmúlik.
//!
//! ─── REDIS NÉLKÜL IS MŰKÖDIK, DE CSAK EGY GÉPEN ────────────────────────────
//! Fejlesztéskor (nincs `REDIS_KV_*`) egy modulszintű `Map` áll a helyére.
//! Ez EGY folyamaton belül tökéletes, és pontosan addig — több szerverpéldány
//! esetén a két fél két külön memóriába jelezne, és sosem találkozna. Éles
//! üzemben tehát Redis kell; ezt a `webrtcStoreDistributed()` mondja meg, és a
//! felület ki is írja, ahelyett hogy csendben félmegoldás lenne.
//! ═══════════════════════════════════════════════════════════════════════════

const url = process.env.REDIS_KV_REST_API_URL;
const token = process.env.REDIS_KV_REST_API_TOKEN;
const redis = url && token ? new Redis({ url, token }) : null;

/** Több szerverpéldányon csak Redisszel megbízható — a felület ezt kiírja. */
export function webrtcStoreDistributed(): boolean {
  return redis !== null;
}

const STREAM_KEY = (id: string) => `rtc:stream:${id}`;
//* Melyik megosztások LÉTEZHETNEK. A halmaz tagjai a kulcsuknál tovább élnek
//* (a halmaznak nincs elemenkénti lejárata), ezért a listázás mindig a
//* KULCSOKAT olvassa, és a talált szemetet ott helyben kiveszi.
const STREAM_INDEX = "rtc:streams";
const BOX_KEY = (peer: string) => `rtc:box:${peer}`;

export type StoredStream = StreamSummary & { updatedAt: number };

//* ---------------------------------------------------------------------------
//* HELYI PÓTLÉK (csak fejlesztéshez)
//* ---------------------------------------------------------------------------
type Expiring<T> = { value: T; expiresAt: number };
const localStreams = new Map<string, Expiring<StoredStream>>();
const localBoxes = new Map<string, Expiring<SignalEnvelope[]>>();

function readLocal<T>(map: Map<string, Expiring<T>>, key: string): T | null {
  const entry = map.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    map.delete(key);
    return null;
  }
  return entry.value;
}

//* ---------------------------------------------------------------------------
//* A JEGYZÉK
//* ---------------------------------------------------------------------------

//! A BEJEGYZÉS MINDEN SZÍVVERÉSSEL ÚJRAÍRÓDIK, ÉS AZ ÓRÁJA ÚJRAINDUL. Nincs
//! külön „létrehozás" és „frissítés" — ugyanaz a hívás. Így egy hálózati
//! zökkenő (egy kimaradt szívverés) nem hagy félkész állapotot: a következő
//! írás mindent helyrerak.
export async function putStream(stream: StoredStream): Promise<void> {
  if (redis) {
    await redis.set(STREAM_KEY(stream.id), stream, { ex: STREAM_TTL_SECONDS });
    await redis.sadd(STREAM_INDEX, stream.id);
    return;
  }
  localStreams.set(stream.id, {
    value: stream,
    expiresAt: Date.now() + STREAM_TTL_SECONDS * 1000,
  });
}

export async function getStream(id: string): Promise<StoredStream | null> {
  if (redis) return await redis.get<StoredStream>(STREAM_KEY(id));
  return readLocal(localStreams, id);
}

export async function dropStream(id: string): Promise<void> {
  if (redis) {
    await redis.del(STREAM_KEY(id));
    await redis.srem(STREAM_INDEX, id);
    return;
  }
  localStreams.delete(id);
}

//! A LISTÁZÁS TAKARÍT IS. A halmazban ottmaradhat egy lejárt megosztás
//! azonosítója (a `SET` tagjának nincs saját lejárata); ilyenkor a kulcs már
//! nincs meg, és a tagot itt vesszük ki. Ez az egyetlen hely, ahol a szemét
//! keletkezhet, és pont az olvassa, aki érintett.
export async function listStreams(): Promise<StreamSummary[]> {
  if (!redis) {
    const out: StreamSummary[] = [];
    for (const id of [...localStreams.keys()]) {
      const stream = readLocal(localStreams, id);
      if (stream) out.push(stream);
    }
    return out.sort((a, b) => b.startedAt - a.startedAt);
  }

  const ids = (await redis.smembers(STREAM_INDEX)) ?? [];
  if (ids.length === 0) return [];
  const rows = await Promise.all(
    ids.map((id) => redis.get<StoredStream>(STREAM_KEY(id))),
  );

  const stale: string[] = [];
  const live: StreamSummary[] = [];
  rows.forEach((row, i) => {
    if (row) live.push(row);
    else stale.push(ids[i]);
  });
  if (stale.length > 0) await redis.srem(STREAM_INDEX, ...stale);

  return live.sort((a, b) => b.startedAt - a.startedAt);
}

//* ---------------------------------------------------------------------------
//* POSTALÁDÁK
//* ---------------------------------------------------------------------------
//! A LÁDA CÍME MAGA A KULCS, ÉS A KULCS EGY 122 BITES VÉLETLEN (`newPeerId`).
//! Aki ismeri, írhat bele — pontosan ezért ismeri a néző a megosztóét, és
//! ezért NEM ismeri senki a nézőkét a megosztón kívül. Ez nem jogosultsági
//! rendszer, hanem az, ami egy jelzőcsatornától egyáltalán elvárható: a
//! jelzésből a képhez nem vezet út, mert a képet a DTLS-kézfogás védi, nem a
//! jelzés titkossága.
//!
//! A LÁDA HOSSZA KORLÁTOS (`MAILBOX_MAX`), ÉS A RÉGI ESIK KI. Aki ismer egy
//! címet, tele tudja írni — de csak az adott ládát, csak 120 másodpercre, és
//! csak annyival, amennyi belefér. A kár így egyetlen kapcsolat meghiúsulása,
//! nem a szolgáltatás.
export async function pushSignal(
  to: string,
  envelope: SignalEnvelope,
): Promise<void> {
  if (redis) {
    await redis.rpush(BOX_KEY(to), JSON.stringify(envelope));
    await redis.ltrim(BOX_KEY(to), -MAILBOX_MAX, -1);
    await redis.expire(BOX_KEY(to), MAILBOX_TTL_SECONDS);
    return;
  }
  const box = readLocal(localBoxes, to) ?? [];
  box.push(envelope);
  localBoxes.set(to, {
    value: box.slice(-MAILBOX_MAX),
    expiresAt: Date.now() + MAILBOX_TTL_SECONDS * 1000,
  });
}

//! ─── AZ OLVASÁS ÜRÍT ───────────────────────────────────────────────────────
//! A KIOLVASOTT ÜZENET ELTŰNIK (`LPOP`), nem kurzorral lépkedünk rajta. Két
//! oka van, és a második a fontosabb:
//!
//!   • Kurzorral a láda a lejáratáig őrizné az egész párbeszédet — fölöslegesen.
//!   • Egy elveszett kurzor (újratöltött lap) az ELEJÉRŐL olvasná újra az egészet,
//!     és a böngésző egy már lezajlott kézfogás SDP-jét kapná meg másodszor.
//!
//! Ennek AZ ÁRA, hogy egy megszakadt válasz üzenetet veszíthet. Ezt a jelzés
//! elviseli: az ICE-jelöltek amúgy is folyamatosan érkeznek, egy elveszett
//! `join`-t pedig a néző megismétel, amíg nem kap ajánlatot.
export async function drainSignals(peer: string): Promise<SignalEnvelope[]> {
  if (redis) {
    //* Az `lpop` darabszámmal atomi: ami kijött, az biztosan csak egyszer jött ki.
    const raw = await redis.lpop<unknown[]>(BOX_KEY(peer), MAILBOX_MAX);
    if (!raw || raw.length === 0) return [];
    await redis.expire(BOX_KEY(peer), MAILBOX_TTL_SECONDS);
    return raw.flatMap((item) => {
      //* Az Upstash a JSON-nak látszó értéket már feloldva adja vissza — a
      //* string-ág a nem így viselkedő kliensverziókra van.
      if (typeof item === "string") {
        try {
          return [JSON.parse(item) as SignalEnvelope];
        } catch {
          return [];
        }
      }
      return item ? [item as SignalEnvelope] : [];
    });
  }

  const box = readLocal(localBoxes, peer);
  if (!box || box.length === 0) return [];
  localBoxes.set(peer, {
    value: [],
    expiresAt: Date.now() + MAILBOX_TTL_SECONDS * 1000,
  });
  return box;
}
