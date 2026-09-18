"use client";

import { LAN_GRACE_MS, stunServers } from "./webrtc-shared";

//! ═══════════════════════════════════════════════════════════════════════════
//! A KAPCSOLAT — ELŐBB A TEREM, AZTÁN A VILÁG
//! ═══════════════════════════════════════════════════════════════════════════
//! Ebben a modulban nincs se felület, se jelzés: csak az a néhány döntés,
//! amitől a kapcsolat a HELYI hálózaton jön létre, gyorsan, és külső szerver
//! érintése nélkül.
//!
//! ─── ELSŐ KÖR: `iceServers: []` ────────────────────────────────────────────
//! A böngésző ilyenkor csak a saját hálózati címeit ajánlja fel (host
//! candidate) — azokat viszont AZONNAL, mert nincs kit megkérdezni. Két, egy
//! wifin lévő gép így jellemzően a másodperc törtrésze alatt összeáll, és a
//! kép a terem switchén megy, nem az iskola internetkapcsolatán.
//!
//! A `.local` NEVEK MIATT EZ NEM SZIVÁROGTAT IP-T. A böngészők a helyi
//! címeket ma már véletlen mDNS-névvel takarják (`a1b2….local`) — a másik fél
//! a saját hálózatán feloldja, egy kívülálló nem tud vele mit kezdeni. Ez
//! egyben az a pont, ahol egy „kliensizolációra" állított wifi (AP isolation)
//! elvágja a megosztást: ott a nevek nem oldódnak fel.
//!
//! ─── MÁSODIK KÖR: STUN, `LAN_GRACE_MS` UTÁN ────────────────────────────────
//! Ha négy másodperc alatt nem állt össze, a néző máshol van (mobilnet,
//! otthonról, másik alhálózat). Ilyenkor a konfiguráció kiegészül STUN-nal, és
//! az ICE újraindul. A STUN csak a külső címet mondja meg — MÉDIA NEM MEGY
//! RAJTA.
//!
//! ─── HARMADIK KÖR NINCS, MERT TURN NINCS ───────────────────────────────────
//! Egy TURN-szerver a képet játszaná át magán: ez sávszélesség, és egy olyan
//! gép, ami LÁTJA, amit a tanár mutat. Ahol a hálózat a közvetlen kapcsolatot
//! sem engedi, ott a megosztás nem jön létre, és a felület ezt megmondja —
//! nem tesz úgy, mintha töltene.
//! ═══════════════════════════════════════════════════════════════════════════

const WIDE_SERVERS = stunServers(process.env.NEXT_PUBLIC_WEBRTC_STUN);

//* Van-e egyáltalán második kör. Ha nincs (kikapcsolt STUN), a felület sem
//* ígérheti, és az óra sem indul el fölöslegesen.
export function hasWideFallback(): boolean {
  return WIDE_SERVERS.length > 0;
}

//! A `bundle-max` + `require` egyetlen hálózati útra teszi a képet és az
//! adatcsatornát: EGY ICE-kézfogás, EGY DTLS-kapcsolat, egy nyitott
//! kapu — nem külön a videónak és külön a csevegésnek.
const BASE: RTCConfiguration = {
  bundlePolicy: "max-bundle",
  rtcpMuxPolicy: "require",
};

export function newConnection(): RTCPeerConnection {
  return new RTCPeerConnection({ ...BASE, iceServers: [] });
}

//* Igaz, ha tényleg váltott. A hívó csak ekkor indítson ICE-újraindítást.
export function widenConnection(pc: RTCPeerConnection): boolean {
  if (WIDE_SERVERS.length === 0) return false;
  try {
    pc.setConfiguration({ ...BASE, iceServers: WIDE_SERVERS });
    return true;
  } catch {
    //* Régebbi Safari nem enged utólagos átállítást — marad a helyi kör.
    return false;
  }
}

//! ─── AZ ÓRA, AMI A MÁSODIK KÖRT INDÍTJA ────────────────────────────────────
//! MINDKÉT FÉL FUTTATJA, de csak az ajánlattevő (a megosztó) indítja újra az
//! ICE-t. A nézőnek is át kell állnia, különben a következő ajánlatra ugyanúgy
//! csak helyi jelölteket adna, és a második kör értelmét vesztené.
export function escalateAfterGrace(
  pc: RTCPeerConnection,
  onWiden: () => void,
): () => void {
  if (!hasWideFallback()) return () => {};
  const timer = setTimeout(() => {
    if (pc.connectionState === "connected" || pc.connectionState === "closed") {
      return;
    }
    if (widenConnection(pc)) onWiden();
  }, LAN_GRACE_MS);
  return () => clearTimeout(timer);
}

//! ─── AZ ICE-JELÖLTEK SORBAN ÁLLNAK ─────────────────────────────────────────
//! A jelöltek MEGELŐZHETIK az SDP-t: a másik fél már szórja őket, mire a
//! `setRemoteDescription` lefut nálunk. Egy ilyenkor hozzáadott jelölt hibát
//! dob, és a kapcsolat pont azt a címet veszíti el, amelyik a leggyorsabb
//! lett volna. Ezért gyűjtjük, és a leírás megérkezésekor öntjük be.
export type CandidateQueue = RTCIceCandidateInit[];

export async function acceptCandidate(
  pc: RTCPeerConnection,
  queue: CandidateQueue,
  init: RTCIceCandidateInit,
): Promise<void> {
  if (!pc.remoteDescription) {
    queue.push(init);
    return;
  }
  try {
    await pc.addIceCandidate(init);
  } catch {
    //* Egy elavult vagy hibás jelölt nem végzetes: a többi pár marad.
  }
}

export async function flushCandidates(
  pc: RTCPeerConnection,
  queue: CandidateQueue,
): Promise<void> {
  const pending = queue.splice(0, queue.length);
  for (const init of pending) {
    try {
      await pc.addIceCandidate(init);
    } catch {
      /* lásd fent */
    }
  }
}

//! ─── A KÉPMINŐSÉG BEÁLLÍTÁSA ───────────────────────────────────────────────
//! EGY TANÁRI KÉPERNYŐN SZÖVEG VAN, NEM MOZGÓKÉP. Ezért:
//!
//!   • `contentHint = "detail"` — a kodek a RÉSZLETET tartsa, ne a simaságot;
//!   • `degradationPreference = "maintain-resolution"` — szűk sávnál a
//!     képkockaszám essen, ne a felbontás. Egy 10 fps-es éles kód olvasható,
//!     egy 30 fps-es elmosott nem;
//!   • `maxBitrate` — egy osztálynyi néző mellett a megosztó FELTÖLTÉSE a szűk
//!     keresztmetszet (a kép minden nézőnek külön megy). 2,5 Mbit/s egy
//!     képernyőnek bőven elég, és tíz nézőnél sem fojtja meg a feltöltést.
export async function tuneScreenSender(
  sender: RTCRtpSender,
  track: MediaStreamTrack,
): Promise<void> {
  try {
    track.contentHint = "detail";
  } catch {
    /* nem minden böngésző engedi — nem végzetes */
  }
  try {
    const params = sender.getParameters();
    //* Tárgyalás előtt üres lehet — ilyenkor mi adunk neki egy kódolást.
    if (!params.encodings || params.encodings.length === 0) {
      params.encodings = [{}];
    }
    params.degradationPreference = "maintain-resolution";
    params.encodings[0].maxBitrate = 2_500_000;
    params.encodings[0].maxFramerate = 30;
    await sender.setParameters(params);
  } catch {
    //* A böngésző alapértelmezése is működik, csak kevésbé takarékos.
  }
}

//! ─── A MEGOSZTÁS KÉRÉSE ────────────────────────────────────────────────────
//! `audio: false`, ÉS EZ NEM ELÍRÁS. Egy tanterem hangja egy osztálynyi ember
//! magánbeszélgetése — a képernyő megosztható, az nem. A `systemAudio:
//! "exclude"` ugyanezt mondja ki a rendszerhang felé is, hogy a böngésző fel
//! se ajánlja.
//*
//* `selfBrowserSurface: "exclude"` — ne lehessen ezt a lapot megosztani
//* (végtelen tükör). `surfaceSwitching: "include"` — a tanár menet közben
//* válthasson ablakot anélkül, hogy újrakezdené a megosztást.
export function requestScreen(): Promise<MediaStream> {
  return navigator.mediaDevices.getDisplayMedia({
    video: { frameRate: { ideal: 15, max: 30 } },
    audio: false,
    //* Nem minden böngésző ismeri ezeket; a nem ismert kulcsokat eldobja.
    systemAudio: "exclude",
    selfBrowserSurface: "exclude",
    surfaceSwitching: "include",
  } as DisplayMediaStreamOptions);
}

//! A MEGOSZTÁS NEM MINDENHOL LEHETSÉGES, A NÉZÉS IGEN. iOS-en (iPhone, iPad —
//! ott MINDEN böngésző a WebKit) nincs `getDisplayMedia`: a telefon nem tud
//! megosztani. Nézni viszont tud, és ez a lényeg — pont ezt nem tudta a
//! ScreenTask kliense Safariban és Firefoxban.
export function canShareScreen(): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.mediaDevices?.getDisplayMedia === "function"
  );
}

export function canWatch(): boolean {
  return typeof window !== "undefined" && "RTCPeerConnection" in window;
}
