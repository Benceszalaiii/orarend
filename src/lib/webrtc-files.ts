"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  type AttachmentKind,
  type ChatAttachment,
  FILE_CHUNK_BYTES,
  MAX_FILE_BYTES,
  MAX_FILE_NAME_LENGTH,
} from "./webrtc-shared";

//! ═══════════════════════════════════════════════════════════════════════════
//! FÁJLOK A CSEVEGÉSBEN — SZERVER NÉLKÜL
//! ═══════════════════════════════════════════════════════════════════════════
//! A FÁJL UGYANAZON AZ ÚTON MEGY, MINT A CSEVEGÉS: a küldő böngészőjéből a
//! megosztó gépébe, onnan annak, aki kéri. A szerverünk egyetlen bájtját sem
//! látja, és nem is tárol belőle semmit — ahogy a képből és a beszélgetésből
//! sem. A megosztás végével a fájlok megszűnnek létezni.
//!
//! EZ NEM FÁJLMEGOSZTÓ, HANEM EGY ÓRA IDEJÉRE SZÓLÓ ÁTADÁS. Ezért van 5 MB-os
//! korlát, ezért nincs mappa, előzmény és keresés, és ezért nem lehet rá
//! később visszatérni. Aki archiválni akar, letölti.
//!
//! ─── MIÉRT DARABOLVA ───────────────────────────────────────────────────────
//! Az adatcsatorna alatt SCTP van, aminek ÜZENETHATÁRA van, és ezt a böngészők
//! különböző méretűre szabják (`pc.sctp.maxMessageSize`). Egy 5 MB-os
//! `send()`-et a legtöbb böngésző eldob vagy a csatornát zárja. Ezért a fájl
//! 16 kB-os keretekre esik szét (`FILE_CHUNK_BYTES`).
//!
//! ─── MIÉRT NINCS SORSZÁM A KERETEKEN ───────────────────────────────────────
//! Mert a csatorna `ordered: true` ÉS megbízható (lásd `createDataChannel` a
//! `webrtc-host.ts`-ben): amit előbb küldtünk, az előbb is érkezik meg, és
//! semmi nem vész el. Egy sorszám tehát olyan kérdésre válaszolna, amit a
//! szállítóréteg már megválaszolt — viszont minden keretet 4 bájttal hizlalna,
//! és egy újabb hibalehetőséget hozna be.
//!
//! AMI VISZONT KELL: az AZONOSÍTÓ. A megosztó csatornáján egyszerre több
//! átvitel is futhat (két néző egyszerre tölt fel), ezért minden keret elején
//! ott áll, melyik fájlhoz tartozik. Ez fix 36 bájt — egy UUID szövegként.
//! ═══════════════════════════════════════════════════════════════════════════

const ID_BYTES = 36;

//! ─── VISSZANYOMÁS: A CSATORNÁT NEM SZABAD TELETÖLTENI ──────────────────────
//! A `send()` NEM VÁR. Ha 320 keretet egymás után beadunk, mind a böngésző
//! kimenő pufferébe kerül, és egy nagy fájl feltöltése alatt a memória elszáll
//! — rosszabb esetben a böngésző ELDOBJA a csatornát.
//!
//! Ezért a küldés megáll, ha a puffer `HIGH_WATER` fölé nő, és akkor indul
//! újra, amikor a böngésző szól, hogy lement `bufferedAmountLowThreshold` alá.
//! A két szám között van a lélegzetvétel: elég nagy ahhoz, hogy a hálózat ne
//! álljon üresen, elég kicsi ahhoz, hogy a kép mellett is elférjen.
const HIGH_WATER = 1024 * 1024;
const LOW_WATER = 256 * 1024;

//! A VISSZATÉRÉSI TÍPUS SZÁNDÉKOSAN `Uint8Array<ArrayBuffer>`, nem a puszta
//! `Uint8Array`. Az utóbbi ma már `ArrayBufferLike`-ot jelent, amibe a
//! megosztott memória (`SharedArrayBuffer`) is belefér — a `send()` és a `Blob`
//! viszont csak sima puffert fogad el. A megkötés itt mondja ki, hogy ez a
//! puffer a miénk, és nem megosztott.
function frame(id: string, body: Uint8Array): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(ID_BYTES + body.byteLength);
  //* Az azonosító ASCII (UUID), tehát a hossza bájtban is pontosan 36.
  out.set(new TextEncoder().encode(id), 0);
  out.set(body, ID_BYTES);
  return out;
}

/** `null`: nem fájlkeret (túl rövid, vagy nem ide tartozó bináris üzenet). */
export function readFrame(
  data: ArrayBuffer,
): { id: string; body: Uint8Array } | null {
  if (data.byteLength <= ID_BYTES) return null;
  const bytes = new Uint8Array(data);
  const id = new TextDecoder().decode(bytes.subarray(0, ID_BYTES));
  return { id, body: bytes.subarray(ID_BYTES) };
}

function drain(channel: RTCDataChannel): Promise<void> {
  if (channel.bufferedAmount <= HIGH_WATER) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      channel.removeEventListener("bufferedamountlow", done);
      resolve();
    };
    channel.addEventListener("bufferedamountlow", done);
  });
}

export type SendOptions = {
  onProgress?: (sent: number, total: number) => void;
  /** Igazra váltva a küldés a következő keretnél abbamarad. */
  cancelled?: () => boolean;
};

//! A BLOBOT NEM OLVASSUK BE EGYBEN. A `slice().arrayBuffer()` mindig csak a
//! soron következő 16 kB-ot húzza a memóriába — egy 5 MB-os fájl feltöltése
//! így nem jelent 5 MB-nyi egyidejű foglalást a küldő oldalán sem.
export async function sendBlob(
  channel: RTCDataChannel,
  id: string,
  blob: Blob,
  options: SendOptions = {},
): Promise<boolean> {
  channel.bufferedAmountLowThreshold = LOW_WATER;
  let sent = 0;
  while (sent < blob.size) {
    if (channel.readyState !== "open") return false;
    if (options.cancelled?.()) return false;
    await drain(channel);
    if (channel.readyState !== "open") return false;

    const end = Math.min(sent + FILE_CHUNK_BYTES, blob.size);
    const part = new Uint8Array(await blob.slice(sent, end).arrayBuffer());
    try {
      channel.send(frame(id, part));
    } catch {
      //* A csatorna épp bezárult vagy megtelt — az átvitel elveszett, de a
      //* kapcsolat és a csevegés nem.
      return false;
    }
    sent = end;
    options.onProgress?.(sent, blob.size);
  }
  return true;
}

//* ---------------------------------------------------------------------------
//* A FOGADÓ OLDAL
//* ---------------------------------------------------------------------------
//! A BEJELENTETT MÉRET EGY ÁLLÍTÁS, NEM TÉNY. A küldő mondhat 1 kB-ot, és
//! küldhet gigabájtokat; mondhat 5 GB-ot, hogy a fogadó előre foglaljon. Ezért
//! ez az osztály MINDKÉT irányból őrzi magát:
//!
//!   • a bejelentett méret csak `1 … MAX_FILE_BYTES` között fogadható el;
//!   • a TÉNYLEGESEN érkezett bájtok sem léphetik túl a bejelentettet — a
//!     túlcsordulás azonnal megszakítja az átvitelt;
//!   • egy féltől egyszerre csak `MAX_OPEN` átvitel lehet nyitva, különben egy
//!     néző ezer „megkezdett" fájllal ehetné meg a megosztó memóriáját.
//!
//! Amit ez NEM véd: a tartalom maga. Aki bent van a megosztásban, azt a
//! megosztó beengedte — a fájl attól még lehet bármi. A felület ezért SOHA nem
//! futtat és nem értelmez semmit a kapott fájlból: szövegként mutatja, vagy
//! letölthetővé teszi (lásd `attachment-view.tsx`).
const MAX_OPEN = 3;

export type IncomingMeta = {
  id: string;
  name: string;
  mime: string;
  size: number;
  kind: AttachmentKind;
  /** A fájl mellé írt üzenet — csak feltöltésnél. */
  text?: string;
};

type Open = {
  meta: IncomingMeta;
  parts: Uint8Array<ArrayBuffer>[];
  received: number;
  //* Az utolsó életjel ideje — ebből tudjuk, melyik átvitel halt meg félúton.
  touched: number;
};

//! ─── A FÉLBEHAGYOTT ÁTVITEL NEM FOGLALHAT HELYET ÖRÖKRE ─────────────────────
//! Egy `file-begin` után elmaradó keretek (bezárt fül, elaludt laptop, vagy
//! szándék) különben a `MAX_OPEN` egyik helyét a kapcsolat végéig ülnék — három
//! ilyen, és az a néző többé semmit nem tud feltölteni. Tizenöt másodperc
//! csend egy 16 kB-os keretek között haladó átvitelben már nem lassúság.
export const STALE_TRANSFER_MS = 15_000;

export type ChunkResult = "ok" | "done" | "unknown" | "overflow";

export class Inbox {
  private open = new Map<string, Open>();

  /** Hamis: elutasítottuk (hibás méret, túl sok nyitott átvitel, ismétlés). */
  begin(meta: IncomingMeta): boolean {
    if (!Number.isInteger(meta.size) || meta.size <= 0) return false;
    if (meta.size > MAX_FILE_BYTES) return false;
    if (this.open.has(meta.id) || this.open.size >= MAX_OPEN) return false;
    this.open.set(meta.id, {
      meta,
      parts: [],
      received: 0,
      touched: Date.now(),
    });
    return true;
  }

  //* `done`: együtt van a bejelentett méret. A hívó ettől függetlenül várhat
  //* `file-end`-et is — de nem kell rá várnia.
  chunk(id: string, body: Uint8Array): ChunkResult {
    const entry = this.open.get(id);
    if (!entry) return "unknown";
    if (entry.received + body.byteLength > entry.meta.size) {
      this.open.delete(id);
      return "overflow";
    }
    //* Másolat kell: a `body` egy nagyobb, újrahasznosuló pufferre mutató
    //* nézet lehet, amit a böngésző a következő üzenetnél felülír.
    entry.parts.push(new Uint8Array(body));
    entry.received += body.byteLength;
    entry.touched = Date.now();
    return entry.received === entry.meta.size ? "done" : "ok";
  }

  /** `null`: nincs ilyen átvitel, vagy nem jött meg az egész. */
  take(id: string): { meta: IncomingMeta; blob: Blob } | null {
    const entry = this.open.get(id);
    if (!entry || entry.received !== entry.meta.size) return null;
    this.open.delete(id);
    return {
      meta: entry.meta,
      //! A TÍPUST A KÜLDŐ MONDJA, DE NEM HISSZÜK EL VAKON: a `Blob` típusa csak
      //! a letöltés nevét és a kép-előnézet próbáját befolyásolja. Végrehajtható
      //! tartalomként a lap SEMMIT nem kezel (lásd fent).
      blob: new Blob(entry.parts, { type: entry.meta.mime }),
    };
  }

  drop(id: string): void {
    this.open.delete(id);
  }

  /** Mindent eldob; a visszaadott azonosítók folyamatjelzőit a hívó törli. */
  clear(): string[] {
    const ids = [...this.open.keys()];
    this.open.clear();
    return ids;
  }

  /** Eldobja, ami `idleMs` óta nem mozdult, és visszaadja az azonosítóikat. */
  sweep(idleMs: number = STALE_TRANSFER_MS): string[] {
    const cutoff = Date.now() - idleMs;
    const dead: string[] = [];
    for (const [id, entry] of this.open) {
      if (entry.touched < cutoff) dead.push(id);
    }
    for (const id of dead) this.open.delete(id);
    return dead;
  }

  get size(): number {
    return this.open.size;
  }

  /** Épp érkezik-e, és hol tart. A felület ebből rajzol folyamatjelzőt. */
  progress(id: string): { received: number; size: number } | null {
    const entry = this.open.get(id);
    return entry ? { received: entry.received, size: entry.meta.size } : null;
  }
}

//* ---------------------------------------------------------------------------
//* MI EZ A FÁJL
//* ---------------------------------------------------------------------------
//! A KITERJESZTÉS DÖNT, NEM A MIME-TÍPUS. Egy `.sql` fájlt a rendszerek fele
//! `application/octet-stream`-nek, másik fele üres típusnak adja; a `.tsx`-re
//! pedig gyakorlatilag semmi nem mond semmit. A kiterjesztés viszont pont az,
//! amit a diák és a tanár is lát és ért.
const CODE_EXTENSIONS = new Set([
  "sql",
  "js",
  "mjs",
  "cjs",
  "ts",
  "tsx",
  "jsx",
  "json",
  "py",
  "java",
  "cs",
  "c",
  "h",
  "cpp",
  "hpp",
  "php",
  "rb",
  "go",
  "rs",
  "kt",
  "swift",
  "sh",
  "bash",
  "ps1",
  "html",
  "htm",
  "xml",
  "css",
  "scss",
  "yml",
  "yaml",
  "toml",
  "ini",
  "csv",
  "md",
  "txt",
  "log",
  "env",
]);

export function fileExtension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
}

export function classifyFile(name: string, mime: string): AttachmentKind {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("text/")) return "code";
  if (CODE_EXTENSIONS.has(fileExtension(name))) return "code";
  //* A JSON és az XML `application/*` alatt is szövegek.
  if (/^application\/(json|xml|sql|javascript|x-sh)$/.test(mime)) return "code";
  return "other";
}

//! A FÁJLNÉV IDEGEN SZÖVEG, ÉS ÚGY IS BÁNUNK VELE. Az útvonal-részek kiesnek
//! (`../`, `\`, `/`) — nem azért, mert írnánk vele lemezre (nem írunk), hanem
//! mert a letöltés neveként a böngészőhöz kerül. A láthatatlan és irányváltó
//! jelek ugyanazért esnek ki, mint a becenevekből: velük egy `szamla.pdf.exe`
//! a listában `szamla.fdp.exe`-ként is mutathatna.
export function sanitizeFileName(value: unknown): string {
  if (typeof value !== "string") return "fajl";
  const flat = Array.from(value)
    .filter((ch) => {
      const code = ch.codePointAt(0) ?? 0;
      return !(
        code <= 0x1f ||
        code === 0x7f ||
        (code >= 0x200b && code <= 0x200f) ||
        (code >= 0x202a && code <= 0x202e) ||
        (code >= 0x2066 && code <= 0x2069)
      );
    })
    .join("")
    .replace(/[/\\]+/g, "_")
    .replace(/\s+/g, " ")
    .trim();
  const safe = flat.replace(/^\.+/, "").slice(0, MAX_FILE_NAME_LENGTH);
  return safe.length > 0 ? safe : "fajl";
}

//* Emberi méret. A tizedesjegy csak MB fölött ér valamit.
export function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} kB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

//* ---------------------------------------------------------------------------
//* A RAKTÁR — AMI MÁR NÁLUNK VAN
//* ---------------------------------------------------------------------------
//! AZ `URL.createObjectURL` FOGLAL, ÉS NEM ENGEDI EL MAGÁTÓL. Minden cím,
//! amit kiadunk, életben tartja a mögötte álló blobot a lap bezárásáig — egy
//! óra alatt megnyitott húsz fájl így akkor is a memóriában maradna, ha rég
//! kigörgettek a csevegésből. Ezért a raktár KORLÁTOS, a régit kidobja, és a
//! kidobott címet VISSZAVONJA.
//!
//! A KORLÁT A MEGOSZTÓNÁL TÖBBET JELENT, MINT A NÉZŐNÉL: nála ez dönti el,
//! meddig kérhető el egy fájl (ő az egyetlen forrás). Ezért mondja ki a
//! `file-gone` üzenet, ha valami már kiesett — nem hallgatunk.
export type FileBody = { blob: Blob; url: string };

export type Vault = {
  files: ReadonlyMap<string, FileBody>;
  put: (id: string, blob: Blob) => FileBody;
  //! A `get` NEM UGYANAZ, MINT A `files`-BÓL OLVASNI. A `files` az a pillanatkép,
  //! amivel a komponens épp rajzol; egy hosszan futó kiszolgálás (`serveFile`)
  //! viszont a LEGFRISSEBB állapotot akarja látni, nem azt, ami az indulásakor
  //! érvényes volt.
  get: (id: string) => FileBody | undefined;
  drop: (id: string) => void;
  //! A MEGOSZTÁS VÉGE A FÁJLOK VÉGE IS. Nem elég, hogy többé senki nem kérheti
  //! el őket: amíg a raktárban vannak, a memóriában is ott ülnek — a fejléc
  //! ígérete („a megosztás végével a fájlok megszűnnek létezni") csak ezzel igaz.
  clear: () => void;
};

export function useFileVault(budget: number): Vault {
  const [files, setFiles] = useState<ReadonlyMap<string, FileBody>>(
    () => new Map(),
  );
  //* A refben mindig a FRISS térkép áll: két gyorsan egymás után érkező fájl
  //* közül a második se a másikat felülíró, elavult másolatra épüljön.
  const held = useRef(new Map<string, FileBody>());

  const put = useCallback(
    (id: string, blob: Blob): FileBody => {
      const next = new Map(held.current);
      const existing = next.get(id);
      if (existing) URL.revokeObjectURL(existing.url);
      const body: FileBody = { blob, url: URL.createObjectURL(blob) };
      next.set(id, body);

      //* A `Map` a beillesztés sorrendjét tartja, tehát az első kulcs a
      //* legrégebbi. Addig dobunk, amíg belefér.
      let total = 0;
      for (const item of next.values()) total += item.blob.size;
      while (total > budget && next.size > 1) {
        const oldest = next.keys().next().value as string;
        //! A LEGFRISSEBBET SOHA NEM DOBJUK KI, akkor sem, ha egymaga túllépi a
        //! keretet: azt épp most kérte valaki. A `next.size > 1` feltétel ezt
        //! őrzi — egy 5 MB-os fájl egy 1 MB-os keret mellett is megérkezik,
        //! csak egyedül marad.
        const victim = next.get(oldest);
        if (!victim) break;
        URL.revokeObjectURL(victim.url);
        total -= victim.blob.size;
        next.delete(oldest);
      }

      held.current = next;
      setFiles(next);
      return body;
    },
    [budget],
  );

  const get = useCallback((id: string) => held.current.get(id), []);

  const drop = useCallback((id: string) => {
    const existing = held.current.get(id);
    if (!existing) return;
    URL.revokeObjectURL(existing.url);
    const next = new Map(held.current);
    next.delete(id);
    held.current = next;
    setFiles(next);
  }, []);

  const clear = useCallback(() => {
    if (held.current.size === 0) return;
    for (const body of held.current.values()) URL.revokeObjectURL(body.url);
    held.current = new Map();
    setFiles(held.current);
  }, []);

  //! A LAP ELHAGYÁSAKOR MINDEN CÍMET VISSZAVONUNK. Enélkül egy hosszú órán
  //! végignézett megosztás után a fül a bezárásáig tartaná a fájlokat.
  useEffect(
    () => () => {
      for (const body of held.current.values()) URL.revokeObjectURL(body.url);
      held.current = new Map();
    },
    [],
  );

  return { files, put, get, drop, clear };
}

//* ---------------------------------------------------------------------------
//* AMIT A FELÜLET LÁT — A MEGOSZTÓNÁL ÉS A NÉZŐNÉL UGYANAZ
//* ---------------------------------------------------------------------------
//! EGY FELÜLET, KÉT FORRÁS. A csevegőpanel nem tudja (és nem is kell tudnia),
//! hogy a fájl helyben van-e, mert a megosztó ő maga, vagy mert elkérte. Ezért
//! mindkét horog ugyanezt az alakot adja ki.
export type UploadState = {
  name: string;
  /** 0…1 */
  ratio: number;
  failed: boolean;
};

export type FileSession = {
  /** Ami már nálunk van: csatolmány-azonosító → tartalom. */
  files: ReadonlyMap<string, FileBody>;
  /** Épp érkező vagy menő átvitelek: azonosító → 0…1. */
  transfers: ReadonlyMap<string, number>;
  /** Amit a megosztó már nem tart — ezt hiába kérnénk el. */
  unavailable: ReadonlySet<string>;
  /** A saját, épp futó feltöltésünk. A megosztónál mindig `null`. */
  upload: UploadState | null;
  sendFile: (file: File, text: string) => void;
  requestFile: (attachment: ChatAttachment) => void;
};
