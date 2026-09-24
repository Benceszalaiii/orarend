"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  classifyFile,
  type FileSession,
  Inbox,
  readFrame,
  sanitizeFileName,
  sendBlob,
  useFileVault,
} from "./webrtc-files";
import {
  acceptCandidate,
  type CandidateQueue,
  escalateAfterGrace,
  flushCandidates,
  newConnection,
  requestScreen,
  tuneScreenSender,
} from "./webrtc-peer";
import { afterFailure, Pump } from "./webrtc-poll";
import {
  CHAT_HISTORY_LENGTH,
  type ChatAttachment,
  type ChatMessage,
  FILE_RETENTION_BYTES,
  HEARTBEAT_MS,
  HOST_ACTIVE_WINDOW_MS,
  HOST_POLL_MS,
  type HubMessage,
  isPeerId,
  isProof,
  joinProof,
  MAX_FILE_BYTES,
  newPeerId,
  type Participant,
  PEEK_GAP_MS,
  type PeerIdentity,
  type SignalEnvelope,
  sameProof,
  sanitizeChatText,
} from "./webrtc-shared";
import {
  announceStream,
  drainSignals,
  endStream,
  IceOutbox,
  type Me,
  readCandidates,
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
  //! EGY NÉZŐNEK EGYSZERRE EGY FÁJLT KÜLDÜNK LE. Enélkül egy néző tíz
  //! kéréssel tízszeresen terhelné a megosztó feltöltését — pont azt, amiből a
  //! kép megy. A második kérés nem hiba, csak vár a sorára: elutasítjuk, és a
  //! felület újrapróbálhatóként mutatja.
  serving: boolean;
  //* A jelöltek kötegelve mennek ennek a nézőnek — lásd `IceOutbox`.
  ice: IceOutbox;
  //! MINDEN NÉZŐNEK SAJÁT POSTAFIÓKJA VAN A FÁJLOKHOZ. Közös fiókkal az egyik
  //! néző elkezdhetne egy átvitelt a másik azonosítójával — így viszont a
  //! bejövő keret csak abba a fiókba kerülhet, amelyik csatornán érkezett.
  inbox: Inbox;
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
  //! ─── „NÉZŐK KERESÉSE" ─────────────────────────────────────────────────────
  //! A megosztó üresjáratban félpercenként néz a ládájába (lásd az ütemet). Ez
  //! a hívás AZONNAL megnézi, és egy percre ébren is tartja — ennyi a teljes
  //! különbség a türelmetlen és a türelmes tanár között.
  lookNow: () => void;
  //* A fájlok a nézőével azonos alakban — lásd `FileSession`. A megosztónál
  //* minden fájl helyben van (ő a forrás), tehát a `requestFile` üres, és az
  //* `unavailable` csak azt mondja meg, ha egy régi már kiesett a raktárból.
} & FileSession;

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
  //* Az ütemet indító hurkokhoz a felületnek is hozzá kell férnie („Nézők
  //* keresése" gomb), de azok az effektben születnek — ezért refen át.
  const wakeRef = useRef<(() => void) | null>(null);
  const beatRef = useRef<Pump | null>(null);

  //! ─── A MEGOSZTÓ AZ EGYETLEN FORRÁS ────────────────────────────────────────
  //! Minden fájl nála áll meg, és tőle kérik el a nézők. Ez nem külön szerep:
  //! ugyanaz a csillag, mint a csevegésnél — csak itt a raktárnak MÉRETE is
  //! van, ezért korlátos (`FILE_RETENTION_BYTES`), és a régi kiesik.
  const vault = useFileVault(FILE_RETENTION_BYTES);
  const [transfers, setTransfers] = useState<ReadonlyMap<string, number>>(
    () => new Map(),
  );

  //* A folyamatjelző MINDIG csak a saját gépen zajló mozgásról szól: amit épp
  //* feltöltenek hozzánk, vagy amit épp leküldünk valakinek.
  const mark = useCallback((id: string, ratio: number | null) => {
    setTransfers((prev) => {
      if (ratio === null) {
        if (!prev.has(id)) return prev;
        const next = new Map(prev);
        next.delete(id);
        return next;
      }
      const next = new Map(prev);
      next.set(id, ratio);
      return next;
    });
  }, []);

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
    (from: PeerIdentity, text: string, attachment?: ChatAttachment) => {
      const clean = sanitizeChatText(text);
      //* Üres üzenetet nem küldünk — hacsak nincs mellette fájl. Egy csatolmány
      //* önmagában is teljes üzenet; kísérőszöveg nélkül is.
      if (!clean && !attachment) return;
      const message: ChatMessage = {
        id: newPeerId(),
        from,
        text: clean ?? "",
        at: Date.now(),
        ...(attachment ? { attachment } : {}),
      };
      history.current = [...history.current, message].slice(
        -CHAT_HISTORY_LENGTH,
      );
      setChat(history.current);
      //! A CSATOLMÁNY LEÍRÁSA MEGY KI, A TARTALMA NEM. Aki megnyitja, az kéri
      //! el (`file-request`) — lásd a `ChatAttachment` melletti indoklást.
      post({ t: "chat", message });
    },
    [post],
  );

  //* ── Fájlok ───────────────────────────────────────────────────────────────

  //! A `vault` minden rendereléskor új tárgy, a benne lévő függvények viszont
  //! állandóak — ezért ezeket vesszük ki, és NEM magát a tárgyat írjuk a
  //! függőségek közé. Enélkül minden visszahívás minden képkockán újraszületne.
  const { put: putFile, get: getFile, clear: clearFiles } = vault;

  //! EGY NÉZŐ FÉLKÉSZ FELTÖLTÉSEI VELE EGYÜTT MENNEK. Enélkül egy félúton
  //! bezárt fül folyamatjelzője a megosztónál örökre ott állna, és a fiók a
  //! kapcsolat szemetévé válna.
  const abandon = useCallback(
    (link: Link) => {
      for (const id of link.inbox.clear()) mark(id, null);
    },
    [mark],
  );

  //! ─── EGY FELTÖLTÉS BEFEJEZÉSE ─────────────────────────────────────────────
  //! A RAKTÁRI AZONOSÍTÓT MI ADJUK, NEM A KÜLDŐ. A küldő azonosítója csak az
  //! ÁTVITELT nevezi meg (a keretek előtagja), és eddig a pontig él. Ha az ő
  //! azonosítója alatt raktároznánk, két néző — szándékosan vagy véletlenül —
  //! ugyanarra a névre írhatna, és a második felülírná az első fájlját. Így
  //! viszont a raktár kulcsait EGYEDÜL a megosztó osztja.
  const finishUpload = useCallback(
    (link: Link, transferId: string) => {
      const done = link.inbox.take(transferId);
      mark(transferId, null);
      if (!done) return;
      const id = newPeerId();
      putFile(id, done.blob);
      //* A feltöltő megtudja, milyen kulcsot kapott — így a saját fájlját nem
      //* kéri vissza magának (lásd `file-ready`).
      post({ t: "file-ready", transferId, id }, link.channel);
      publishChat(link.who, done.meta.text ?? "", {
        id,
        name: done.meta.name,
        mime: done.meta.mime,
        size: done.meta.size,
        kind: done.meta.kind,
      });
    },
    [mark, post, publishChat, putFile],
  );

  const takeChunk = useCallback(
    (link: Link, data: ArrayBuffer) => {
      const part = readFrame(data);
      if (!part) return;
      const result = link.inbox.chunk(part.id, part.body);
      if (result === "unknown") return;
      if (result === "overflow") {
        //! TÖBBET KÜLDÖTT, MINT AMENNYIT BEJELENTETT. Ez nem hálózati hiba,
        //! hanem szabályszegés — az átvitel itt véget ér, és a küldő meg is
        //! tudja, miért.
        post(
          { t: "file-abort", id: part.id, reason: "tul-nagy" },
          link.channel,
        );
        mark(part.id, null);
        return;
      }
      const at = link.inbox.progress(part.id);
      if (at) mark(part.id, at.received / at.size);
      //* A bejelentett méret együtt van — nem várunk a `file-end`-re.
      if (result === "done") finishUpload(link, part.id);
    },
    [finishUpload, mark, post],
  );

  const openUpload = useCallback(
    (link: Link, message: Extract<HubMessage, { t: "file-begin" }>) => {
      //! AZ AZONOSÍTÓ A KERETEK ELŐTAGJA, ÉS AZ FIX 36 BÁJT (lásd `readFrame`).
      //! Ami nem UUID, arra egyetlen keret sem illene — csak a helyet foglalná.
      if (!isPeerId(message.id)) return;
      //* Mielőtt új helyet adnánk, kidobjuk, ami félúton elhalt.
      for (const id of link.inbox.sweep()) mark(id, null);
      const name = sanitizeFileName(message.name);
      //* A MIME-típus csak egy felirat: a hosszát vágjuk, a tartalmát nem
      //* hisszük el (lásd `Inbox`).
      const mime =
        typeof message.mime === "string" ? message.mime.slice(0, 100) : "";
      const accepted = link.inbox.begin({
        id: message.id,
        name,
        mime,
        size: message.size,
        //! A FAJTÁT MI DÖNTJÜK EL A NÉVBŐL, nem a küldő állításából. Így nem
        //! lehet egy bináris fájlt „kódnak" hazudni, hogy a többiek felülete
        //! szövegként próbálja megnyitni.
        kind: classifyFile(name, mime),
        text: message.text,
      });
      if (!accepted) {
        post(
          { t: "file-abort", id: message.id, reason: "elutasitva" },
          link.channel,
        );
        return;
      }
      mark(message.id, 0);
    },
    [mark, post],
  );

  //! ─── EGY FÁJL LEKÜLDÉSE ANNAK, AKI KÉRTE ──────────────────────────────────
  //! A LEÍRÁS A CSEVEGÉS-ELŐZMÉNYBŐL JÖN, nem a kérésből: a kérő csak egy
  //! azonosítót küld, a nevet és a méretet mi tesszük hozzá. Így egy elkért
  //! fájl neve nem hamisítható meg útközben.
  const serveFile = useCallback(
    async (link: Link, id: string) => {
      const body = getFile(id);
      const known = history.current.find((m) => m.attachment?.id === id);
      const meta = known?.attachment;
      if (!body || !meta) {
        post({ t: "file-gone", id }, link.channel);
        return;
      }
      if (link.serving) {
        post({ t: "file-abort", id, reason: "epp-mas-megy" }, link.channel);
        return;
      }

      link.serving = true;
      post(
        {
          t: "file-begin",
          id,
          name: meta.name,
          mime: meta.mime,
          size: meta.size,
          kind: meta.kind,
        },
        link.channel,
      );
      const ok = await sendBlob(link.channel, id, body.blob, {
        onProgress: (sent, total) => mark(id, sent / total),
        cancelled: () => !liveRef.current,
      });
      link.serving = false;
      mark(id, null);
      post(
        ok
          ? { t: "file-end", id }
          : { t: "file-abort", id, reason: "megszakadt" },
        link.channel,
      );
    },
    [getFile, mark, post],
  );

  //! A MEGOSZTÓ SAJÁT FÁJLJA SEHOVA NEM UTAZIK FELFELÉ: ő a forrás. A raktárba
  //! kerül, és a többiek ugyanúgy elkérik, mint bármelyik másikat.
  const sendFile = useCallback(
    (file: File, text: string) => {
      const self = selfRef.current;
      if (!self || !liveRef.current) return;
      if (file.size <= 0 || file.size > MAX_FILE_BYTES) return;
      const id = newPeerId();
      const name = sanitizeFileName(file.name);
      putFile(id, file);
      publishChat(self, text, {
        id,
        name,
        mime: file.type,
        size: file.size,
        kind: classifyFile(name, file.type),
      });
    },
    [publishChat, putFile],
  );

  //* A megosztónál nincs mit elkérni: ami megvan, az helyben van, ami nincs, az
  //* kiesett a raktárból. A felület a `files`-ból tudja, melyik eset áll fenn.
  const requestFile = useCallback(() => {}, []);

  const unavailable = useMemo(() => {
    const gone = new Set<string>();
    for (const message of chat) {
      const id = message.attachment?.id;
      if (id && !vault.files.has(id)) gone.add(id);
    }
    return gone;
  }, [chat, vault.files]);

  //* A szívverést is meglökjük: a nézőszám és a cím így egyszerre frissül a
  //* listában, nem csak a postát nézzük meg.
  const lookNow = useCallback(() => {
    wakeRef.current?.();
    beatRef.current?.restart();
  }, []);

  //* ── Egy néző kapcsolata ──────────────────────────────────────────────────

  const dropLink = useCallback(
    (peer: string) => {
      const link = links.current.get(peer);
      if (!link) return;
      links.current.delete(peer);
      link.cancelEscalation();
      link.ice.close();
      abandon(link);
      try {
        link.pc.close();
      } catch {
        /* már zárva */
      }
      publishRoster();
    },
    [abandon, publishRoster],
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
      //! A FÁJLKERETEK BINÁRISAK. Alapértelmezésben a böngésző `Blob`-ként adná
      //! oda őket, amiből az azonosító-előtagot csak aszinkron lehetne
      //! kiolvasni — és az üzenetek sorrendje felborulhatna. Az `arraybuffer`
      //! szinkron, tehát a keret ott helyben a helyére kerül.
      channel.binaryType = "arraybuffer";
      const link: Link = {
        pc,
        channel,
        queue,
        who,
        open: false,
        cancelEscalation: () => {},
        serving: false,
        ice: new IceOutbox(() => meRef.current, who.peer, id),
        inbox: new Inbox(),
      };
      links.current.set(who.peer, link);

      for (const track of media.getVideoTracks()) {
        void tuneScreenSender(pc.addTrack(track, media), track);
      }

      pc.onicecandidate = (event) => {
        if (event.candidate) link.ice.add(event.candidate.toJSON());
        //* `null` jelölt = vége a gyűjtésnek; ami maradt, az most megy.
        else link.ice.flush();
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
        abandon(link);
        publishRoster();
      };
      channel.onmessage = (event) => {
        //! ─── BINÁRIS KERET = FÁJLDARAB ────────────────────────────────────
        //! A darab MINDIG annak a nézőnek a fiókjába megy, akinek a csatornáján
        //! érkezett (`link.inbox`). Egy idegen azonosítóra hivatkozó keret így
        //! nem tud más átvitelébe belenyúlni: abban a fiókban nincs ilyen.
        if (typeof event.data !== "string") {
          takeChunk(link, event.data as ArrayBuffer);
          return;
        }
        let message: HubMessage;
        try {
          message = JSON.parse(event.data) as HubMessage;
        } catch {
          return;
        }
        //! A NÉZŐTŐL NÉGY ÜZENETFAJTÁT FOGADUNK EL, ÉS EGYIKBŐL SEM A NEVET. Azt
        //! a `link.who` adja — amit a SZERVER hitelesített a jelzésben. Ha az
        //! üzenet nevet is hozna, az itt elvész.
        switch (message.t) {
          case "say":
            publishChat(link.who, message.text);
            return;
          case "file-begin":
            openUpload(link, message);
            return;
          case "file-end":
            finishUpload(link, message.id);
            return;
          case "file-abort":
            link.inbox.drop(message.id);
            mark(message.id, null);
            return;
          case "file-request":
            void serveFile(link, message.id);
            return;
          default:
            //* A többi üzenet iránya megosztó → néző; nézőtől nem értelmes.
            return;
        }
      };

      link.cancelEscalation = escalateAfterGrace(pc, () => {
        //* Második kör: a konfiguráció már kibővült, most az ICE induljon újra.
        void offerTo(link, true);
      });

      void offerTo(link, false);
    },
    [
      abandon,
      dropLink,
      finishUpload,
      mark,
      offerTo,
      openUpload,
      participants,
      post,
      publishChat,
      publishRoster,
      serveFile,
      takeChunk,
    ],
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
          for (const candidate of readCandidates(envelope.payload)) {
            await acceptCandidate(link.pc, link.queue, candidate);
          }
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
        link.ice.close();
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
      //! A FÁJLOK A MEGOSZTÁSSAL EGYÜTT SZŰNNEK MEG — lásd `Vault.clear`. A
      //! csevegés látható marad (a tanár visszaolvashatja), a csatolmányai
      //! viszont „már nem elérhetők".
      clearFiles();
      setTransfers(new Map());

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
    //! MINDEN FÜGGŐSÉG ÁLLANDÓ, ÉS ENNEK ÍGY KELL MARADNIA: a `pagehide`
    //! effekt a `teardown`-ra figyel, és a takarításában MEGHÍVJA — egy új
    //! `teardown` a futó megosztást állítaná le.
    [clearFiles, post],
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

        const first = await announceStream(
          meRef.current,
          id,
          clean,
          0,
          proof !== null,
        );
        if (!first) {
          for (const track of media.getTracks()) track.stop();
          setPhase("idle");
          setError("Nem sikerült meghirdetni a megosztást. Próbáld újra.");
          return;
        }
        const record = first.stream;

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

  //! ─── AZ ÜTEM: EGY RENDSZERES KÉRÉS, A TÖBBI ROHAMOKBAN ────────────────────
  //! A MEGOSZTÓNAK ÜRESJÁRATBAN EGYETLEN ÁLLANDÓ KÉRÉSE VAN: a szívverés,
  //! félpercenként. Ennek a válasza megmondja, vár-e levél (`mail`) — tehát a
  //! postaládához csak akkor nyúlunk, ha VAN benne valami.
  //!
  //! Ez a lap eredetileg két, egymástól független hurkot járatott (szívverés
  //! 15 mp + posta 1,5 mp), vagyis percenként közel ötven kérést egy olyan
  //! ládáért, ami az idő 99%-ában üres. Most percenként kettő.
  //!
  //! ─── MIKOR VAGYUNK MÉGIS ÉBREN ────────────────────────────────────────────
  //! Egy csatlakozás nem tűrne félperces késleltetést, ezért a posta ROHAMOKBAN
  //! fut, gyorsan (`HOST_POLL_MS`), és a roham egy percig tart az utolsó
  //! eseménytől (`HOST_ACTIVE_WINDOW_MS`). Rohamot indít:
  //!
  //!   • a megosztás indulása (ekkor jönnek be a diákok),
  //!   • egy levelet jelző szívverés,
  //!   • a lap visszatérése a háttérből,
  //!   • és a tanár „Nézők keresése" gombja.
  //!
  //! Minden beérkezett jelzés újraindítja az egy percet, tehát egy folyamatosan
  //! csatlakozó osztály alatt a posta végig gyors marad, és csak utána hallgat
  //! el.
  useEffect(() => {
    if (phase !== "live") return;

    //* Eddig marad ébren a posta. A `start` utáni első perc mindenképp ébren
    //* telik — ekkor kattintanak rá a diákok.
    let awakeUntil = Date.now() + HOST_ACTIVE_WINDOW_MS;

    const mail = new Pump(async () => {
      if (!liveRef.current) return null;
      const messages = await drainSignals(meRef.current.peer);
      for (const envelope of messages) await handle(envelope);
      //* Bármi érkezett: kezdődik elölről az ébren töltött perc.
      if (messages.length > 0) awakeUntil = Date.now() + HOST_ACTIVE_WINDOW_MS;
      //! A ROHAM VÉGE NEM SZÜNET, HANEM LEÁLLÁS. A `null` megállítja a
      //! szivattyút; innen a következő szívverés (vagy a tanár gombja) ébreszti.
      return Date.now() < awakeUntil ? HOST_POLL_MS : null;
    });

    //! ─── KÉT ÉBRESZTÉS, ÉS A KÜLÖNBSÉG SZÁMÍT ────────────────────────────
    //! `wake()` — „VÁRHATÓAN TÖRTÉNIK MÉG VALAMI": egy teljes percre ébren
    //! marad. Ezt az indítás, egy levelet jelző szívverés, egy beérkezett
    //! jelzés és a tanár gombja váltja ki.
    //!
    //! `peek()` — „NÉZZÜK MEG EGYSZER": pontosan EGY kör, utána visszaalszik,
    //! hacsak nem talált valamit. Ez kell a lapváltáshoz.
    //!
    //! MIÉRT NEM ELÉG EGY. Mert a `visibilitychange` sűrűbben jön, mint hinnénk:
    //! egy ablakot váltogató tanárnál mérve HÚSZ MÁSODPERC ALATT HATSZOR. Ha
    //! mindegyik egy teljes percet nyitna, a megosztó SOHA nem aludna el, és a
    //! takarékosságból nem maradna semmi — pontosan ez a hiba volt itt.
    const wake = () => {
      awakeUntil = Date.now() + HOST_ACTIVE_WINDOW_MS;
      mail.restart();
    };
    wakeRef.current = wake;

    //* Az `awakeUntil` MOSTRA állítása azt jelenti: a kör lefut egyszer, és a
    //* végén már nem lesz igaz, hogy ébren kell maradni — hacsak közben nem
    //* érkezett valami, mert az felülírja.
    let lastPeek = 0;
    const peek = () => {
      const now = Date.now();
      //* Egymás hegyén-hátán érkező lapváltásokból egy nézés legyen.
      if (now - lastPeek < PEEK_GAP_MS) return;
      lastPeek = now;
      awakeUntil = now;
      mail.restart();
    };

    //! A SZÍVVERÉS AZ EGYETLEN ÁLLANDÓ KÉRÉS, ezért ITT SZÁMÍT LEGINKÁBB, hogy
    //! egy tartós kiesés ne váljon kérés-özönné: elbukott kör után a várakozás
    //! duplázódik, az első sikeres után visszaáll.
    let failures = 0;
    const beat = new Pump(async () => {
      if (!liveRef.current) return null;
      const id = idRef.current;
      if (!id) return HEARTBEAT_MS;

      const viewers = [...links.current.values()].filter((l) => l.open).length;
      const pulse = await announceStream(
        meRef.current,
        id,
        titleRef.current,
        viewers,
        expectedProof.current !== null,
      );
      if (!pulse) {
        failures += 1;
        return afterFailure(failures, HEARTBEAT_MS);
      }
      failures = 0;
      //* A szívverés a posta helyett is megkérdezte: ha van levél, ébredünk.
      if (pulse.mail > 0) wake();
      return HEARTBEAT_MS;
    });
    beatRef.current = beat;

    const onVisible = () => {
      //! HÁTTÉRBE TETT LAPNÁL A BÖNGÉSZŐ RITKÍTJA AZ ÓRÁKAT. Chrome az aktív
      //! WebRTC-kapcsolattal rendelkező lapot felmenti ez alól, de az ELSŐ néző
      //! előtt még nincs ilyen kapcsolat — ezért a visszatérés MEGNÉZETI a
      //! ládát. Egyszer: a lapváltás önmagában nem esemény, csak alkalom.
      if (document.visibilityState === "visible") peek();
    };
    document.addEventListener("visibilitychange", onVisible);

    mail.restart();
    //* A szívverés első köre egy periódus múlva esedékes: a bejegyzést a
    //* `start` már felvitte.
    const first = setTimeout(() => beat.restart(), HEARTBEAT_MS);

    return () => {
      clearTimeout(first);
      mail.stop();
      beat.stop();
      wakeRef.current = null;
      beatRef.current = null;
      document.removeEventListener("visibilitychange", onVisible);
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
    lookNow,
    files: vault.files,
    transfers,
    unavailable,
    upload: null,
    sendFile,
    requestFile,
  };
}
