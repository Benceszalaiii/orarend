"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  acceptCandidate,
  type CandidateQueue,
  escalateAfterGrace,
  flushCandidates,
  newConnection,
} from "./webrtc-peer";
import { Pump } from "./webrtc-poll";
import {
  type ChatMessage,
  type HubMessage,
  joinProof,
  type Participant,
  type SignalEnvelope,
  type StreamSummary,
  viewerDelay,
} from "./webrtc-shared";
import {
  drainSignals,
  IceOutbox,
  type Me,
  readCandidates,
  sendSignal,
} from "./webrtc-signal";

//! ═══════════════════════════════════════════════════════════════════════════
//! A NÉZŐ
//! ═══════════════════════════════════════════════════════════════════════════
//! A néző csak FOGAD: nem ajánl kapcsolatot, nem küld képet, és nem is tud
//! róla. Egyetlen kezdeményezése a `join`; onnantól a megosztó vezeti a
//! párbeszédet. Ez nem szegényesebb szerep, hanem kevesebb hibalehetőség: nincs
//! két egyszerre érkező ajánlat (glare), tehát nincs szükség a bonyolult
//! „tökéletes tárgyalás" mintára sem.
//!
//! ─── AMIÉRT EZ AZ EGÉSZ ÉPÜL: A NÉZÉS MINDENHOL MŰKÖDIK ────────────────────
//! A ScreenTask kliense Firefoxban és Safariban elvileg sem működhetett
//! beágyazva: `https` lapról `http` képet kérni vegyes tartalom, amit ezek a
//! böngészők nem engednek (lásd `screentask-viewer.tsx`). A WebRTC-kapcsolat
//! ezzel szemben SAJÁT MAGA titkosított (DTLS/SRTP) — nincs mit kifogásolni
//! rajta. Ami eddig csak Chrome-ban ment, az itt Firefoxban, Safariban,
//! iPhone-on is megy.
//! ═══════════════════════════════════════════════════════════════════════════

export type ViewerPhase =
  | "idle"
  | "connecting"
  | "live"
  //* Volt kapcsolat, és megszakadt — a képet még mutatjuk, amíg visszajön.
  | "lost"
  //* A megosztó abbahagyta, vagy mi léptünk ki. Ez nem hiba.
  | "ended"
  //! ELFOGYOTT A TÜRELEM. Nem hiba, és nem is vég: a kapcsolat a háttérben
  //! tovább épülhet a már kicserélt jelöltekből — csak a szervert nem
  //! kérdezgetjük tovább. A felület újrapróbálkozást ajánl.
  | "givenup";

export type ViewerSession = {
  phase: ViewerPhase;
  /** A megosztó által kimondott ok (`bye`), ha volt. */
  ended: string | null;
  //! A ROSSZ JELSZÓ SAJÁT ÁLLAPOT, NEM EGY HIBAÜZENET A SOK KÖZÜL. Egyedül
  //! ezt tudja a néző MAGA orvosolni — a felület ezért nem a „nem sikerült"
  //! dobozt mutatja rá, hanem újra a jelszómezőt.
  wrongPassword: boolean;
  screen: MediaStream | null;
  title: string;
  roster: Participant[];
  chat: ChatMessage[];
  say: (text: string) => void;
};

//! ─── EGY CSATLAKOZÁSI KÍSÉRLET ────────────────────────────────────────────
//! NEM A JELSZÓ A FÜGGŐSÉG, HANEM A KÍSÉRLET. Ha a horog a jelszó SZÖVEGÉRE
//! figyelne, a második, ugyanolyan rossz próbálkozás nem indítana új kört (a
//! szöveg nem változott), és a néző azt látná, hogy a gomb nem csinál semmit.
//! Egy kísérlet viszont mindig új — ezért egy tárgy, amit a hívó minden
//! elküldéskor újra létrehoz.
export type JoinAttempt = { password: string | null };

//! HÁROM MÁSODPERC UTÁN ÚJRA JELENTKEZÜNK. A `join` elveszhet (lejárt láda,
//! épp induló megosztó, egy megszakadt kérés), és ilyenkor a néző örökre
//! „kapcsolódás…" maradna. Az ismétlés ártalmatlan: a megosztó egy újabb
//! `join`-ra egyszerűen új kapcsolatot épít, a régit eldobva.
const REJOIN_MS = 3000;

export function useScreenViewer(
  me: Me,
  target: StreamSummary | null,
  /** Egy konkrét csatlakozási kísérlet. `null`: nem nézünk semmit. */
  attempt: JoinAttempt | null = null,
): ViewerSession {
  const [phase, setPhase] = useState<ViewerPhase>("idle");
  const [ended, setEnded] = useState<string | null>(null);
  const [wrongPassword, setWrongPassword] = useState(false);
  const [screen, setScreen] = useState<MediaStream | null>(null);
  const [title, setTitle] = useState("");
  const [roster, setRoster] = useState<Participant[]>([]);
  const [chat, setChat] = useState<ChatMessage[]>([]);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const channelRef = useRef<RTCDataChannel | null>(null);
  const meRef = useRef(me);
  meRef.current = me;

  const say = useCallback((text: string) => {
    const channel = channelRef.current;
    if (!channel || channel.readyState !== "open") return;
    //! A NÉZŐ CSAK A SZÖVEGET KÜLDI. Nevet nem — azt a megosztó írja rá, abból,
    //! amit a szervertől kapott róla (lásd `webrtc-host.ts`). Ha itt nevet
    //! küldenénk, azzal pont azt a lyukat nyitnánk ki, amit a hitelesítés zár.
    const message: HubMessage = { t: "say", text };
    try {
      channel.send(JSON.stringify(message));
    } catch {
      /* egy épp bezáruló csatorna — a felület úgyis „megszakadt"-ot mutat */
    }
  }, []);

  //! ─── EGY NÉZÉS ÉLETE EGYETLEN EFFEKTBEN ────────────────────────────────────
  //! MINDEN, AMI A KAPCSOLATHOZ KELL, ITT SZÜLETIK ÉS ITT HAL MEG. Ha a néző
  //! másik megosztást választ vagy elhagyja a lapot, a takarítás egyetlen helyen
  //! van — nem lehet elfelejteni egy órát vagy egy nyitva maradt kapcsolatot.
  useEffect(() => {
    if (!target || !attempt) {
      setPhase("idle");
      return;
    }
    const password = attempt.password;

    setPhase("connecting");
    setEnded(null);
    setWrongPassword(false);
    setScreen(null);
    setTitle(target.title);
    setRoster([]);
    setChat([]);

    const host = target.hostPeer;
    const streamId = target.id;
    let disposed = false;
    let joinTimer: ReturnType<typeof setTimeout> | undefined;

    const pc = newConnection();
    pcRef.current = pc;
    const queue: CandidateQueue = [];

    //! A SÁVOT A BÖNGÉSZŐ ADJA, ÉS EGYSZER. Az `ontrack` a `streams[0]`-t
    //! hozza — ugyanazt a `MediaStream`-et, amit a megosztó összerakott. Ezt
    //! adjuk a `<video>`-nak; cserélgetni nem kell.
    pc.ontrack = (event) => {
      const media = event.streams[0];
      if (media) setScreen(media);
    };

    //* A jelölteket kötegelve adjuk fel — lásd `IceOutbox`. Öt külön kérés
    //* helyett jellemzően egy.
    const ice = new IceOutbox(() => meRef.current, host, streamId);
    pc.onicecandidate = (event) => {
      if (event.candidate) ice.add(event.candidate.toJSON());
      //* `null` jelölt = vége a gyűjtésnek; ami maradt, az most megy.
      else ice.flush();
    };

    const wire = (channel: RTCDataChannel) => {
      channelRef.current = channel;
      channel.onmessage = (event) => {
        if (typeof event.data !== "string") return;
        let message: HubMessage;
        try {
          message = JSON.parse(event.data) as HubMessage;
        } catch {
          return;
        }
        switch (message.t) {
          case "welcome":
            setTitle(message.title);
            setRoster(message.roster);
            setChat(message.history);
            return;
          case "roster":
            setRoster(message.roster);
            return;
          case "chat":
            //* A megosztó a KÜLDÉS sorrendjében küldi mindenkinek — a helyi
            //* lista így magától rendezett marad.
            setChat((prev) => [...prev, message.message]);
            return;
          case "bye":
            setEnded(message.reason);
            setPhase("ended");
            return;
          default:
            //* `say` a megosztótól nem jöhet.
            return;
        }
      };
    };
    pc.ondatachannel = (event) => wire(event.channel);

    //! ─── AMIKOR MEGSZAKAD ────────────────────────────────────────────────────
    //! A „megszakadt" NEM ugyanaz, mint a „vége". Egy wifi-váltás, egy alvó
    //! laptop, egy pillanatnyi csomagvesztés mind `disconnected` — ilyenkor a
    //! képet MEGTARTJUK a képernyőn, és újra kérdezni kezdjük a postát, hogy az
    //! újratárgyalt ajánlat megtaláljon. Csak a megosztó `bye`-ja jelent véget.
    pc.onconnectionstatechange = () => {
      if (disposed) return;
      switch (pc.connectionState) {
        case "connected":
          setPhase("live");
          //! ÖSSZEÁLLT: A JELZÉSRE NINCS TÖBB SZÜKSÉG, ÉS A LEKÉRDEZÉS ITT ÁLL
          //! LE. Ez az, amitől egy órán át nézett megosztás NULLA kérést jelent
          //! a szerver felé — a kép és a csevegés közvetlenül megy.
          mail.stop();
          clearTimeout(joinTimer);
          return;
        case "disconnected":
        case "failed":
          setPhase((prev) => (prev === "ended" ? prev : "lost"));
          //! ÚJRAINDUL A POSTA: a megosztó ICE-újraindítása új ajánlatot küld,
          //! és azt csak a ládából tudjuk kivenni. A `restart` akkor is
          //! biztonságos, ha épp fut egy kör — nem lesz belőle két hurok
          //! (lásd `webrtc-poll.ts`).
          mail.restart();
          return;
        default:
          return;
      }
    };

    const handle = async (envelope: SignalEnvelope) => {
      if (envelope.streamId !== streamId || envelope.from.peer !== host) return;
      switch (envelope.kind) {
        case "offer": {
          try {
            await pc.setRemoteDescription(
              envelope.payload as RTCSessionDescriptionInit,
            );
            await flushCandidates(pc, queue);
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            await sendSignal(
              meRef.current,
              host,
              streamId,
              "answer",
              pc.localDescription,
            );
          } catch {
            //* Egy elrontott kézfogás után a következő `join` újrakezdi.
          }
          return;
        }
        case "ice":
          for (const candidate of readCandidates(envelope.payload)) {
            await acceptCandidate(pc, queue, candidate);
          }
          return;
        case "bye": {
          const reason = (envelope.payload as { reason?: unknown } | null)
            ?.reason;
          if (reason === "rossz-jelszo") {
            //! NEM PRÓBÁLKOZUNK TOVÁBB. Enélkül a `join` ismétlése
            //! másodpercenként kopogtatna a megosztó ajtaján egy rossz
            //! jelszóval — az már nem újrapróbálkozás, hanem törés.
            clearTimeout(joinTimer);
            setWrongPassword(true);
            setPhase("ended");
            return;
          }
          setEnded("a megosztó abbahagyta");
          setPhase("ended");
          return;
        }
        default:
          return;
      }
    };

    //! A SZIVATTYÚ A KAPCSOLAT ELŐTT GYORS, UTÁNA NINCS, ÉS KÖZBEN RITKUL.
    //! Amíg épül a kapcsolat, az első másodpercekben minden lekérdezés számít
    //! (az SDP és a jelöltek ilyenkor mozognak); ahogy telik az idő, egyre
    //! kevésbé valószínű, hogy a szerveren vár még valami — ezért lépcsőzetesen
    //! ritkul, majd `viewerDelay` egyszer csak `null`-t ad, és megállunk.
    //!
    //! Amint összeállt a kapcsolat, a `connected` ág azonnal leállítja, és a
    //! szerver többé nem hall felőlünk.
    const startedAt = Date.now();
    const mail = new Pump(async () => {
      if (disposed) return null;
      const messages = await drainSignals(meRef.current.peer);
      for (const envelope of messages) {
        if (disposed) return null;
        await handle(envelope);
      }
      if (disposed || pc.connectionState === "connected") return null;

      const next = viewerDelay(Date.now() - startedAt);
      if (next === null) {
        //! KIMONDJUK, HOGY FELADTUK. Némán abbahagyni a legrosszabb: a diák egy
        //! örökké pörgő jelzést nézne, és nem tudná, hogy rajta már nem múlik
        //! semmi.
        clearTimeout(joinTimer);
        setPhase((prev) =>
          prev === "ended" || prev === "live" ? prev : "givenup",
        );
        return null;
      }
      return next;
    });

    //! A LENYOMAT MINDEN JELENTKEZÉSNÉL ÚJRA KÉSZÜL, de mindig ugyanaz lesz: a
    //! só a megosztás azonosítója. A számítás azért van a hívásban és nem
    //! előtte, mert így a JELSZÓ maga sosem kerül olyan változóba, ami a
    //! kapcsolat teljes életét végigkíséri.
    const join = async () => {
      if (disposed) return;
      let proof: string | null = null;
      if (password) {
        try {
          proof = await joinProof(streamId, password);
        } catch {
          //* Nincs `crypto.subtle` — a megosztó úgyis elutasít, és a felület
          //* a rossz jelszó ágán mondja meg, hogy itt nem megy.
          setWrongPassword(true);
          setPhase("ended");
          return;
        }
      }
      if (disposed) return;
      void sendSignal(
        meRef.current,
        host,
        streamId,
        "join",
        proof ? { proof } : null,
      );
      //! AZ ISMÉTLÉS IS ELFOGY. Amíg nincs távoli leírás, nincs miből
      //! válaszolni — de ha a megosztó fél perce nem felel, a további
      //! jelentkezés sem fog rajta segíteni. Ugyanaz a türelem szabja meg,
      //! mint a postát (`viewerDelay`).
      joinTimer = setTimeout(() => {
        if (disposed || pc.remoteDescription) return;
        if (viewerDelay(Date.now() - startedAt) === null) return;
        void join();
      }, REJOIN_MS);
    };

    const cancelEscalation = escalateAfterGrace(pc, () => {
      //* A néző csak átáll; az ICE-t a megosztó indítja újra, és a következő
      //* ajánlatot már a bővebb konfigurációval válaszoljuk meg.
    });

    void join();
    mail.restart();

    return () => {
      disposed = true;
      mail.stop();
      clearTimeout(joinTimer);
      cancelEscalation();
      ice.close();
      //! ELKÖSZÖNÜNK, HOGY A NÉVSOR NE HAZUDJON. Enélkül a megosztó csak a
      //! kapcsolat elhalásából tudná meg, hogy elmentünk — és addig a többiek
      //! egy ott sem lévő nézőt látnának a listában.
      void sendSignal(meRef.current, host, streamId, "bye", {
        reason: "kilep",
      });
      channelRef.current = null;
      pcRef.current = null;
      try {
        pc.close();
      } catch {
        /* már zárva */
      }
    };
  }, [target, attempt]);

  return { phase, ended, wrongPassword, screen, title, roster, chat, say };
}
