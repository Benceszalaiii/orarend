"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  acceptCandidate,
  type CandidateQueue,
  escalateAfterGrace,
  flushCandidates,
  newConnection,
  requestScreen,
  tuneScreenSender,
} from "./webrtc-peer";
import {
  CHAT_HISTORY_LENGTH,
  type ChatMessage,
  HEARTBEAT_MS,
  HOST_POLL_MS,
  type HubMessage,
  isProof,
  joinProof,
  newPeerId,
  type Participant,
  type PeerIdentity,
  type SignalEnvelope,
  sameProof,
  sanitizeChatText,
} from "./webrtc-shared";
import {
  announceStream,
  drainSignals,
  endStream,
  type Me,
  sendSignal,
} from "./webrtc-signal";

//! ═══════════════════════════════════════════════════════════════════════════
//! A MEGOSZTÓ — EGY CSILLAG KÖZEPE
//! ═══════════════════════════════════════════════════════════════════════════
//! A megosztó gépe minden nézővel KÜLÖN kapcsolatot tart, és ugyanazt a
//! képsávot küldi mindegyiken. Ezért ő az egyetlen, aki mindenkit lát — és
//! ezért ő a névsor és a csevegés központja is. A nézők egymást hálózatilag nem
//! ismerik.
//!
//! MIÉRT CSILLAG, ÉS NEM TELJES HÁLÓ. Egy 30 fős osztályban a teljes háló 435
//! kapcsolat lenne, a csillag 30. Ráadásul a képet úgyis egyvalaki adja: a
//! nézők között nem lenne mit átvinni.
//!
//! MI EBBŐL A FELTÖLTÉS ÁRA. A kép MINDEN nézőnek külön megy fel — tíz néző
//! tízszeres feltöltés. Ezt egy SFU (átjátszó szerver) oldaná meg, de az pont
//! az, amit nem akarunk: egy gép, ami látja a képet. Ehelyett a sávszélesség
//! van megfogva (lásd `tuneScreenSender`), és a felület kiírja, hányan nézik.
//!
//! ─── A NÉV ITT NEM SZÜLETIK, CSAK ÉRKEZIK ──────────────────────────────────
//! Minden résztvevő nevét a SZERVER hitelesíti a jelzésben (`envelope.from`).
//! A megosztó ezt jegyzi meg, és a csevegő-üzenetekre EZT írja rá — nem azt,
//! amit az adatcsatornán érkező üzenet állít magáról. Egy néző így nem tud
//! máséként megszólalni, pedig a csevegés végig a megosztó gépén megy át.
//! ═══════════════════════════════════════════════════════════════════════════

type Link = {
  pc: RTCPeerConnection;
  channel: RTCDataChannel;
  queue: CandidateQueue;
  who: PeerIdentity;
  open: boolean;
  cancelEscalation: () => void;
};

export type HostPhase = "idle" | "asking" | "live" | "ended";

export type HostSession = {
  phase: HostPhase;
  error: string | null;
  streamId: string | null;
  title: string;
  screen: MediaStream | null;
  roster: Participant[];
  chat: ChatMessage[];
  /** `password`: üresen hagyva bárki csatlakozhat. */
  start: (title: string, password: string | null) => void;
  stop: () => void;
  say: (text: string) => void;
  /** Igaz, ha a megosztás jelszót kér — a felület ezt kiírja. */
  locked: boolean;
  /** Hány csatlakozást utasítottunk el rossz jelszó miatt. */
  refused: number;
};

export function useScreenHost(me: Me): HostSession {
  const [phase, setPhase] = useState<HostPhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [streamId, setStreamId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [screen, setScreen] = useState<MediaStream | null>(null);
  const [roster, setRoster] = useState<Participant[]>([]);
  const [chat, setChat] = useState<ChatMessage[]>([]);

  //! A GÉPEZET REFEKBEN ÉL, NEM ÁLLAPOTBAN. A kapcsolatok, az órák és az
  //! előzmény nem rajzolnak semmit — ha állapotban lennének, minden ICE-jelölt
  //! újrarajzolná a lapot. Ami a felületre tartozik (névsor, csevegés,
  //! fázis), az külön, és csak akkor mozdul, amikor tényleg változott.
  const links = useRef(new Map<string, Link>());
  const history = useRef<ChatMessage[]>([]);
  const idRef = useRef<string | null>(null);
  const titleRef = useRef("");
  const screenRef = useRef<MediaStream | null>(null);
  const selfRef = useRef<PeerIdentity | null>(null);
  const meRef = useRef(me);
  meRef.current = me;
  const liveRef = useRef(false);
  //! A VÁRT LENYOMAT, NEM A JELSZÓ. A jelszó a `start`-ban egyszer megfordul,
  //! kiszámoljuk belőle a lenyomatot, és maga a szó sehol nem marad meg — se
  //! állapotban, se refben, se kérésben. Amit a nézőtől kapunk, azt ezzel
  //! hasonlítjuk össze (lásd `joinProof`).
  const expectedProof = useRef<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [refused, setRefused] = useState(0);

  //* ── A névsor és a csevegés kiküldése ─────────────────────────────────────

  const participants = useCallback((): Participant[] => {
    const self = selfRef.current;
    const list: Participant[] = self ? [{ ...self, host: true }] : [];
    for (const link of links.current.values()) {
      if (link.open) list.push({ ...link.who, host: false });
    }
    return list;
  }, []);

  const post = useCallback((message: HubMessage, only?: RTCDataChannel) => {
    const raw = JSON.stringify(message);
    const targets = only
      ? [only]
      : [...links.current.values()].map((l) => l.channel);
    for (const channel of targets) {
      if (channel.readyState !== "open") continue;
      try {
        channel.send(raw);
      } catch {
        //* Egy épp bezáruló csatorna nem állíthatja meg a többit.
      }
    }
  }, []);

  const publishRoster = useCallback(() => {
    const list = participants();
    setRoster(list);
    post({ t: "roster", roster: list });
  }, [participants, post]);

  //! A MEGOSZTÓ IS LÁTJA A SAJÁT ÜZENETÉT — UGYANAZON AZ ÚTON. Nincs külön
  //! „helyi" ág: minden üzenet ugyanitt kap azonosítót és időt, akárkitől jött.
  //! Így a megosztó és a nézők ugyanazt a beszélgetést látják, ugyanabban a
  //! sorrendben.
  const publishChat = useCallback(
    (from: PeerIdentity, text: string) => {
      const clean = sanitizeChatText(text);
      if (!clean) return;
      const message: ChatMessage = {
        id: newPeerId(),
        from,
        text: clean,
        at: Date.now(),
      };
      history.current = [...history.current, message].slice(
        -CHAT_HISTORY_LENGTH,
      );
      setChat(history.current);
      post({ t: "chat", message });
    },
    [post],
  );

  //* ── Egy néző kapcsolata ──────────────────────────────────────────────────

  const dropLink = useCallback(
    (peer: string) => {
      const link = links.current.get(peer);
      if (!link) return;
      links.current.delete(peer);
      link.cancelEscalation();
      try {
        link.pc.close();
      } catch {
        /* már zárva */
      }
      publishRoster();
    },
    [publishRoster],
  );

  const offerTo = useCallback(
    async (link: Link, iceRestart: boolean) => {
      const id = idRef.current;
      if (!id) return;
      try {
        const offer = await link.pc.createOffer({ iceRestart });
        await link.pc.setLocalDescription(offer);
        await sendSignal(
          meRef.current,
          link.who.peer,
          id,
          "offer",
          link.pc.localDescription,
        );
      } catch {
        //* Nem sikerült ajánlatot tenni — a néző újra jelentkezik, és akkor új
        //* kapcsolat épül. Egy félbemaradt ajánlat nem hagyhat maga után
        //* használhatatlan kapcsolatot.
        dropLink(link.who.peer);
      }
    },
    [dropLink],
  );

  const admit = useCallback(
    (who: PeerIdentity, proof: unknown) => {
      const id = idRef.current;
      const media = screenRef.current;
      if (!id || !media) return;

      //! ─── A ZÁR ITT VAN, ÉS CSAK ITT ───────────────────────────────────────
      //! A SZERVER NEM ŐRZI AZ AJTÓT, MERT NEM IS TUDNÁ: a jelszót nem ismeri.
      //! A döntés ott születik, ahol a kép van — ha a lenyomat nem stimmel, a
      //! megosztó egyszerűen nem épít kapcsolatot. Nincs mit megkerülni: a
      //! képhez nem vezet másik út.
      //*
      //! A VISSZAUTASÍTÁS KIMONDOTT. Egy néma elutasítás után a néző a
      //! végtelenségig „kapcsolódna", és a rossz jelszót sem tudná meg — ezért
      //! kap egy `bye`-t az okkal.
      const want = expectedProof.current;
      if (want !== null && (!isProof(proof) || !sameProof(want, proof))) {
        void sendSignal(meRef.current, who.peer, id, "bye", {
          reason: "rossz-jelszo",
        });
        setRefused((n) => n + 1);
        return;
      }

      //! ÚJ JELENTKEZÉS = ÚJ KAPCSOLAT. Ha ugyanaz a néző ismét `join`-t küld
      //! (újratöltötte a lapot, vagy az első ajánlat elveszett), a régit
      //! eldobjuk. Két párhuzamos kapcsolat ugyanahhoz a nézőhöz kétszer
      //! küldené a képet, és a névsorban is kétszer szerepelne.
      dropLink(who.peer);

      const pc = newConnection();
      const queue: CandidateQueue = [];
      //* A csevegés és a névsor csatornája. A képpel EGY hálózati úton megy
      //* (lásd `bundlePolicy` a `webrtc-peer.ts`-ben).
      const channel = pc.createDataChannel("hub", { ordered: true });
      const link: Link = {
        pc,
        channel,
        queue,
        who,
        open: false,
        cancelEscalation: () => {},
      };
      links.current.set(who.peer, link);

      for (const track of media.getVideoTracks()) {
        void tuneScreenSender(pc.addTrack(track, media), track);
      }

      pc.onicecandidate = (event) => {
        if (!event.candidate) return;
        void sendSignal(
          meRef.current,
          who.peer,
          id,
          "ice",
          event.candidate.toJSON(),
        );
      };

      pc.onconnectionstatechange = () => {
        if (
          pc.connectionState === "failed" ||
          pc.connectionState === "closed"
        ) {
          dropLink(who.peer);
        }
      };

      channel.onopen = () => {
        link.open = true;
        //! AZ ÚJONNAN ÉRKEZŐ MEGKAPJA, AMI EDDIG TÖRTÉNT. Enélkül egy késve
        //! csatlakozó diák üres csevegést látna, és nem értené, mire válaszol
        //! a többi.
        post(
          {
            t: "welcome",
            title: titleRef.current,
            roster: participants().concat({ ...who, host: false }),
            history: history.current,
          },
          channel,
        );
        publishRoster();
      };
      channel.onclose = () => {
        link.open = false;
        publishRoster();
      };
      channel.onmessage = (event) => {
        if (typeof event.data !== "string") return;
        let message: HubMessage;
        try {
          message = JSON.parse(event.data) as HubMessage;
        } catch {
          return;
        }
        //! A NÉZŐTŐL EGYETLEN ÜZENETFAJTÁT FOGADUNK EL, ÉS ABBÓL IS CSAK A
        //! SZÖVEGET. A nevet a `link.who` adja — az, amit a SZERVER hitelesített
        //! a jelzésben. Ha az üzenet nevet is hozna, az itt elvész.
        if (message.t === "say") publishChat(link.who, message.text);
      };

      link.cancelEscalation = escalateAfterGrace(pc, () => {
        //* Második kör: a konfiguráció már kibővült, most az ICE induljon újra.
        void offerTo(link, true);
      });

      void offerTo(link, false);
    },
    [dropLink, offerTo, participants, post, publishChat, publishRoster],
  );

  //* ── A jelzések feldolgozása ──────────────────────────────────────────────

  const handle = useCallback(
    async (envelope: SignalEnvelope) => {
      if (envelope.streamId !== idRef.current) return;
      const link = links.current.get(envelope.from.peer);

      switch (envelope.kind) {
        case "join":
          admit(
            envelope.from,
            (envelope.payload as { proof?: unknown } | null)?.proof,
          );
          return;
        case "answer": {
          if (!link) return;
          //* A név minden jelzéssel frissül — ha közben belépett, a névsorban
          //* is hitelesítettként jelenik meg.
          link.who = envelope.from;
          try {
            await link.pc.setRemoteDescription(
              envelope.payload as RTCSessionDescriptionInit,
            );
            await flushCandidates(link.pc, link.queue);
          } catch {
            dropLink(envelope.from.peer);
          }
          return;
        }
        case "ice": {
          if (!link) return;
          await acceptCandidate(
            link.pc,
            link.queue,
            envelope.payload as RTCIceCandidateInit,
          );
          return;
        }
        case "bye":
          dropLink(envelope.from.peer);
          return;
        default:
          //* `offer` nézőtől nem jöhet: a megosztó az egyetlen ajánlattevő.
          return;
      }
    },
    [admit, dropLink],
  );

  //* ── Indítás és leállítás ─────────────────────────────────────────────────

  const teardown = useCallback(
    (reason: string) => {
      if (!liveRef.current) return;
      liveRef.current = false;

      post({ t: "bye", reason });
      const id = idRef.current;
      for (const link of links.current.values()) {
        link.cancelEscalation();
        if (id) {
          void sendSignal(meRef.current, link.who.peer, id, "bye", {
            reason: "vege",
          });
        }
        try {
          link.pc.close();
        } catch {
          /* már zárva */
        }
      }
      links.current.clear();

      //! A SÁVOKAT LE KELL ÁLLÍTANI, KÜLÖNBEN A BÖNGÉSZŐ TOVÁBB MUTATJA A
      //! „megosztás folyamatban" sávot — a tanár azt hinné, még látják.
      for (const track of screenRef.current?.getTracks() ?? []) track.stop();
      screenRef.current = null;
      if (id) endStream(meRef.current, id);
      idRef.current = null;
      expectedProof.current = null;

      setScreen(null);
      setRoster([]);
      setStreamId(null);
      setPhase("ended");
    },
    [post],
  );

  const start = useCallback(
    (wanted: string, password: string | null) => {
      if (liveRef.current || phase === "asking") return;
      setError(null);
      setPhase("asking");

      void (async () => {
        let media: MediaStream;
        try {
          media = await requestScreen();
        } catch (cause) {
          //! A MEGSZAKÍTÁS NEM HIBA. Ha a tanár a böngésző ablakválasztójában a
          //! Mégsem-re nyom, `NotAllowedError` jön — ugyanaz a kivétel, mint a
          //! megtagadott engedélynél. A felület ezért nem panaszkodik, csak
          //! visszaáll.
          const name = (cause as { name?: string })?.name;
          setPhase("idle");
          if (name !== "NotAllowedError" && name !== "AbortError") {
            setError("Nem sikerült elindítani a képernyőmegosztást.");
          }
          return;
        }

        const id = newPeerId();
        const clean = wanted.trim() || "Képernyőmegosztás";

        //! A LENYOMAT A MEGHIRDETÉS ELŐTT KÉSZÜL EL. Ha a `crypto.subtle` nem
        //! elérhető (nem biztonságos eredet), itt állunk meg — jelszavasnak
        //! hirdetett, de valójában nyitott megosztást nem engedünk létrejönni.
        let proof: string | null = null;
        if (password) {
          try {
            proof = await joinProof(id, password);
          } catch {
            for (const track of media.getTracks()) track.stop();
            setPhase("idle");
            setError(
              "Ebben a böngészőben nem indítható jelszavas megosztás. Jelszó nélkül működik.",
            );
            return;
          }
        }

        const record = await announceStream(
          meRef.current,
          id,
          clean,
          0,
          proof !== null,
        );
        if (!record) {
          for (const track of media.getTracks()) track.stop();
          setPhase("idle");
          setError("Nem sikerült meghirdetni a megosztást. Próbáld újra.");
          return;
        }

        idRef.current = id;
        expectedProof.current = proof;
        setLocked(proof !== null);
        setRefused(0);
        titleRef.current = record.title;
        screenRef.current = media;
        //* A megosztó saját, hitelesített neve — a szerver válaszából.
        selfRef.current = {
          peer: meRef.current.peer,
          name: record.host.name,
          verified: record.host.verified,
        };
        history.current = [];
        liveRef.current = true;

        //! A BÖNGÉSZŐ SAJÁT „MEGOSZTÁS LEÁLLÍTÁSA" GOMBJA IS IDE FUT BE. A sáv
        //! nem a mi felületünk, de a következménye a miénk: ha a tanár ott
        //! állítja le, a megosztásnak itt is véget kell érnie — különben egy
        //! élő bejegyzés maradna, ami mögött már nincs kép.
        for (const track of media.getVideoTracks()) {
          track.addEventListener("ended", () =>
            teardown("a megosztás véget ért"),
          );
        }

        setStreamId(id);
        setTitle(record.title);
        setScreen(media);
        setChat([]);
        setRoster(participants());
        setPhase("live");
      })();
    },
    [participants, phase, teardown],
  );

  const stop = useCallback(() => teardown("a megosztás véget ért"), [teardown]);

  const say = useCallback(
    (text: string) => {
      const self = selfRef.current;
      if (self && liveRef.current) publishChat(self, text);
    },
    [publishChat],
  );

  //! ─── AZ ÜTEM ──────────────────────────────────────────────────────────────
  //! Két óra fut, amíg él a megosztás: a postáé és a szívverésé. Mindkettő
  //! `setTimeout`-lánc, nem `setInterval` — egy lassú válasz így nem torlaszol
  //! fel kéréseket egymás mögé.
  //*
  //! HÁTTÉRBE TETT LAPNÁL A BÖNGÉSZŐ RITKÍTJA AZ ÓRÁKAT. Chrome az aktív
  //! WebRTC-kapcsolattal rendelkező lapot felmenti ez alól, tehát amint van egy
  //! néző, az ütem helyreáll — de az ELSŐ néző becsatlakozása egy percig is
  //! késhet, ha a tanár közben átváltott egy másik lapra. Ezért a lap
  //! visszatérésekor azonnal kérdezünk egyet, hogy a várakozó `join` ne álljon
  //! ott feleslegesen.
  useEffect(() => {
    if (phase !== "live") return;
    let disposed = false;
    let pollTimer: ReturnType<typeof setTimeout> | undefined;
    let beatTimer: ReturnType<typeof setTimeout> | undefined;

    const poll = async () => {
      if (disposed || !liveRef.current) return;
      const messages = await drainSignals(meRef.current.peer);
      for (const envelope of messages) {
        if (disposed) return;
        await handle(envelope);
      }
      if (!disposed) pollTimer = setTimeout(poll, HOST_POLL_MS);
    };

    const beat = async () => {
      if (disposed || !liveRef.current) return;
      const id = idRef.current;
      if (id) {
        const viewers = [...links.current.values()].filter(
          (l) => l.open,
        ).length;
        await announceStream(
          meRef.current,
          id,
          titleRef.current,
          viewers,
          expectedProof.current !== null,
        );
      }
      if (!disposed) beatTimer = setTimeout(beat, HEARTBEAT_MS);
    };

    const wake = () => {
      if (document.visibilityState !== "visible" || disposed) return;
      clearTimeout(pollTimer);
      void poll();
    };
    document.addEventListener("visibilitychange", wake);

    void poll();
    beatTimer = setTimeout(beat, HEARTBEAT_MS);

    return () => {
      disposed = true;
      clearTimeout(pollTimer);
      clearTimeout(beatTimer);
      document.removeEventListener("visibilitychange", wake);
    };
  }, [phase, handle]);

  //! A LAP BEZÁRÁSA IS LEÁLLÍTÁS. A `pagehide` a `beforeunload`-dal szemben a
  //! mobil böngészőkben is megbízhatóan lefut, és a visszaléptethető gyorsítótár
  //! (bfcache) sem akad meg tőle.
  useEffect(() => {
    const bye = () => teardown("a megosztó bezárta a lapot");
    window.addEventListener("pagehide", bye);
    return () => {
      window.removeEventListener("pagehide", bye);
      bye();
    };
  }, [teardown]);

  return {
    phase,
    error,
    streamId,
    title,
    screen,
    roster,
    chat,
    start,
    stop,
    say,
    locked,
    refused,
  };
}
