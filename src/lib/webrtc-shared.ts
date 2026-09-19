//! ═══════════════════════════════════════════════════════════════════════════
//! KÉPERNYŐMEGOSZTÁS A BÖNGÉSZŐBŐL — A KÖZÖS SZÓTÁR
//! ═══════════════════════════════════════════════════════════════════════════
//! EZ A MODUL A SZERZŐDÉS, NEM A MŰKÖDÉS. Ugyanezeket a típusokat olvassa a
//! böngésző (`webrtc-host.ts`, `webrtc-viewer.ts`) és a szerver
//! (`webrtc-store.ts`, `/api/webrtc/*`) — ezért itt nincs se Redis, se
//! `RTCPeerConnection`, se JSX. Csak nevek, korlátok és tisztítók.
//!
//! MIÉRT ÉPÜL EZ, AMIKOR VAN SCREENTASK. A ScreenTask a tanári gépen egy
//! `http`-s képszervert futtat, és a diák böngészője kéri le a képet. Ebből
//! három baj következik, és mindhárom a böngészőn múlik, nem rajtunk:
//!
//!   • VEGYES TARTALOM. A lapunk `https`, a ScreenTask `http`. Chrome a helyi
//!     hálózatra tett kivétellel (LNA) még beengedi; a Firefox és a Safari NEM
//!     — ott a beágyazott néző elvileg sem működhet (lásd `canViewInPage`).
//!   • KERESGÉLÉS. A tanári gép IP-jét ki kell találni: a `screen-discovery.ts`
//!     ötven címet próbál végig, mert a böngésző nem árulja el a helyi címeket.
//!   • KÜLÖN PROGRAM. A tanárnak telepítenie és indítania kell valamit.
//!
//! A WebRTC mindhármat megszünteti. A kapcsolat titkosított (DTLS/SRTP), tehát
//! nincs vegyes tartalom; a címeket az ICE gyűjti össze magától, tehát nincs
//! keresgélés; és mindez a böngészőben van, tehát nincs telepítés. Cserébe kell
//! egy JELZŐCSATORNA, amin a két fél megbeszéli a kapcsolatot — ez az egyetlen
//! dolog, amit a szerverünk csinál.
//!
//! ─── AMIT A SZERVER NEM CSINÁL ─────────────────────────────────────────────
//! NEM LÁTJA A KÉPET. A média a két böngésző között megy, közvetlenül. Nincs
//! felvétel, nincs átjátszás (TURN), nincs tárolás. Ha holnap valaki a
//! szerverre néz, egyetlen képkockát sem talál — nem azért, mert töröljük,
//! hanem mert sosem járt ott.
//!
//! NINCS HANG. A `getDisplayMedia` hívása `audio: false`, és a megosztó fél
//! egyetlen hangsávot sem tesz a kapcsolatra. Egy tanterem képernyője
//! megosztható; a tanterem HANGJA egy osztálynyi ember magánbeszélgetése.
//!
//! A CSEVEGÉS SEM A SZERVEREN MEGY. A megosztó gépe a központ: minden néző
//! hozzá kapcsolódik, és ő továbbítja a többieknek az üzenetet (lásd lent,
//! `HubMessage`). A szerver a csevegés EGYETLEN szavát sem látja.
//! ═══════════════════════════════════════════════════════════════════════════

//! ─── A RÉSZTVEVŐ NEVE NEM A RÉSZTVEVŐTŐL JÖN ───────────────────────────────
//! EZ A MODUL LEGFONTOSABB DÖNTÉSE. A nevet minden jelzésre A SZERVER ÜTI RÁ,
//! a munkamenet-süti alapján — sosem az, amit a kliens a törzsbe írt. Enélkül
//! bárki bárminek nevezhetné magát egy olyan lapon, ahol a diákok egymás valódi
//! nevét látják.
//!
//! Ezért két fokozat van, és a felület KIÍRJA a különbséget:
//!   • `verified: true`  — bejelentkezett fiók, a név a fiókból jön;
//!   • `verified: false` — vendég, a becenevet ő maga adta. Ez nem kevesebb
//!     jog, csak kevesebb állítás: a felület nem tesz úgy, mintha tudná, ki az.
//!
//! A megosztó gépe ugyanezt az elvet viszi tovább a csevegésre: a beérkező
//! üzenetre Ő írja rá a küldő SZERVER ÁLTAL HITELESÍTETT nevét, nem azt, amit
//! az üzenet állít magáról. Így egy ügyes néző sem szólalhat meg máséként.
export type PeerIdentity = {
  /** Véletlen, kitalálhatatlan azonosító — egy megnyitott lap élettartamára. */
  peer: string;
  name: string;
  verified: boolean;
};

//* A megosztás, ahogy a felfedező lista látja. Címet, IP-t, semmi ilyet nem
//* tartalmaz: a hálózati részleteket az ICE intézi a két fél között.
export type StreamSummary = {
  id: string;
  title: string;
  /** A megosztó postaládája — ide megy a csatlakozási kérés. */
  hostPeer: string;
  host: { name: string; verified: boolean };
  startedAt: number;
  /** A megosztó gépe számolja, és a szívveréssel küldi fel. */
  viewers: number;
  //! ─── A MEGOSZTÁS A TANÁRHOZ VAN KÖTVE, NEM AZ ÓRÁHOZ ────────────────────
  //! EGY TANÁR EGY IDŐBEN TÖBB ÓRÁT IS TARTHAT: két összevont osztály, három
  //! csoport egy teremben, vagy egy blokkosított sáv. Ha a megosztást az ÓRÁHOZ
  //! kötnénk, ezekben az esetekben el kellene dönteni, MELYIK órához — és
  //! bármelyiket választjuk, a többi osztály diákjai nem találnák meg.
  //!
  //! A TANÁRHOZ KÖTVE A KÉRDÉS FEL SEM MERÜL: aki most ennél a tanárnál ül,
  //! annak a kártyáján megjelenik a jelzés, akármelyik osztályból nézi. A
  //! tanárnak pedig nincs mit kiválasztania: egy megosztás, minden órájához.
  //!
  //! A JELET A SZERVER OLDJA FEL (a Jedlikinfo tanárlistájából, a
  //! munkamenetből — lásd `requireTeacher`), sosem a kliens küldi. Enélkül
  //! bárki bármelyik tanár nevében tehetne „élő" jelzést a diákok órarendjére.
  /** A tanár jele (`extrasKey` alak), ha a megosztó tanár. */
  teacher: string | null;
  //! JELSZÓ CSAK A CSATLAKOZÁSHOZ KELL, ÉS A LISTA CSAK A LÉTÉT MONDJA MEG.
  //! Maga a jelszó sehol nem utazik és sehol nem áll meg — lásd `joinProof`.
  locked: boolean;
};

//! ─── A JELZŐÜZENET ─────────────────────────────────────────────────────────
//! Négy fajta, és ennyi elég. A `join` az egyetlen, amit a néző KEZDEMÉNYEZ; a
//! többi már a két fél párbeszéde.
//!
//!   join   — „szeretnék nézni" (a nézőtől a megosztóhoz), `payload: null`
//!   offer  — a megosztó ajánlata (SDP), benne a képsávval
//!   answer — a néző válasza (SDP)
//!   ice    — egy hálózati jelölt, ahogy megszületik (trickle ICE)
//!   bye    — „elmegyek" / „vége a megosztásnak"
export type SignalKind = "join" | "offer" | "answer" | "ice" | "bye";

export type SignalEnvelope = {
  kind: SignalKind;
  /** A SZERVER tölti ki, a munkamenetből. A kliens állítása ide nem jut el. */
  from: PeerIdentity;
  streamId: string;
  payload: unknown;
  at: number;
};

//! ─── A KÖZPONT NYELVE (adatcsatorna) ───────────────────────────────────────
//! A megosztó gépe a csillag közepe: minden nézővel külön kapcsolata van, és
//! rajta megy a névsor meg a csevegés. A nézők EGYMÁST nem látják hálózatilag —
//! csak a megosztón keresztül. Ez nem korlát, hanem a lényeg: egy 30 fős
//! osztályban a teljes háló 435 kapcsolat lenne, a csillag 30.
//!
//! `say` az EGYETLEN üzenet, ami nézőtől jöhet. Minden más iránya megosztó → néző.
export type Participant = PeerIdentity & { host: boolean };

//! ─── A CSATOLMÁNY LEÍRÁSA ÉS A TARTALMA KÜLÖN ÚTON JÁR ─────────────────────
//! EZ A TÍPUS CSAK AZT MONDJA MEG, HOGY VAN EGY FÁJL — a bájtjait nem
//! tartalmazza, és nem is tartalmazhatná: az üzenet JSON-ként megy át a
//! csatornán, egy 5 MB-os fájl base64-ben 6,7 MB-nyi SZÖVEG lenne, egyetlen
//! üzenetben. Az SCTP ekkora üzenetet nem is visz át.
//!
//! ÉS AZÉRT SEM, MERT A TARTALMAT NEM MINDENKI AKARJA. Egy 5 MB-os fájl 30
//! nézőnek automatikusan kiküldve 150 MB feltöltés a megosztó gépéről — egy
//! iskolai wifin ez megölné magát a képmegosztást, amiért az egész lap van. A
//! LEÍRÁS megy mindenkinek, a TARTALMAT az kéri el, aki megnyitja (lásd
//! `file-request`).
export type AttachmentKind = "code" | "image" | "other";

export type ChatAttachment = {
  /** Ezzel kérhető el a tartalma a megosztótól. */
  id: string;
  name: string;
  mime: string;
  size: number;
  //* A felület ebből dönti el, mit mutasson: kódrészletet, képet vagy csak egy
  //* letöltő sort. A KÜLDŐ mondja meg, tehát nem hit kérdése — a megnyitás
  //* módja a fogadó döntése marad (lásd `attachment-view.tsx`).
  kind: AttachmentKind;
};

export type ChatMessage = {
  id: string;
  /** A küldő SZERVER által hitelesített neve — lásd a `PeerIdentity` blokkot. */
  from: PeerIdentity;
  text: string;
  at: number;
  attachment?: ChatAttachment;
};

export type HubMessage =
  | {
      t: "welcome";
      title: string;
      roster: Participant[];
      history: ChatMessage[];
    }
  | { t: "roster"; roster: Participant[] }
  | { t: "chat"; message: ChatMessage }
  //* A megosztó abbahagyta. A néző ezt látja, nem egy néma, megfagyott képet.
  | { t: "bye"; reason: string }
  //* Néző → megosztó. Csak a szöveget küldi: a nevet a megosztó teszi hozzá.
  | { t: "say"; text: string }
  //! ─── A FÁJLÁTVITEL ÖT ÜZENETE ───────────────────────────────────────────
  //! A BÁJTOK NEM EZEKBEN UTAZNAK, hanem külön, BINÁRIS keretekben, ugyanazon
  //! a csatornán (lásd `webrtc-files.ts`). Ezek csak a keretek köré tesznek
  //! zárójelet: mi jön, kinek, és mikor van vége.
  //!
  //! `file-begin` — „most küldöm X azonosító bájtjait". KÉT irányban él, és a
  //! JELENTÉSE az iránytól függ: nézőtől a megosztónak FELTÖLTÉS (ilyenkor a
  //! `text` a kísérő üzenet), megosztótól a nézőnek a kért fájl LEKÜLDÉSE.
  | {
      t: "file-begin";
      id: string;
      name: string;
      mime: string;
      size: number;
      kind: AttachmentKind;
      /** Csak feltöltésnél: a fájl mellé írt üzenet. */
      text?: string;
    }
  //* Az utolsó keret után. A fogadó ettől függetlenül is figyeli a bájtszámot
  //* — egy elmaradt lezárás nem hagyhat félkész fájlt „készen" állni.
  | { t: "file-end"; id: string }
  | { t: "file-abort"; id: string; reason: string }
  //* Néző → megosztó: „ezt a fájlt kérem". Ettől indul a letöltés.
  | { t: "file-request"; id: string }
  //! Megosztó → feltöltő: „megjött, és EZ lett az azonosítója". A raktári
  //! kulcsot a megosztó osztja (lásd `finishUpload`), tehát a feltöltőnek is
  //! meg kell tudnia — különben a saját, épp most elküldött fájlját NEM ISMERNÉ
  //! FEL a csevegésben, és visszatöltené magának azt, ami már nála van.
  | { t: "file-ready"; transferId: string; id: string }
  //! Megosztó → néző: „ez már nincs meg". A megosztó korlátos helyen tartja a
  //! fájlokat (lásd `FILE_RETENTION_BYTES`), és a régieket elengedi — egy óra
  //! végéig élő csevegésben ez helyes, de KI KELL MONDANI, nem elhallgatni egy
  //! soha be nem érkező válasszal.
  | { t: "file-gone"; id: string };

//* ---------------------------------------------------------------------------
//* KORLÁTOK
//* ---------------------------------------------------------------------------

export const MAX_TITLE_LENGTH = 60;
export const MAX_NICKNAME_LENGTH = 24;
export const MIN_NICKNAME_LENGTH = 2;
export const MAX_CHAT_LENGTH = 500;
/** Ennyit kap az újonnan érkező a `welcome`-ban. */
export const CHAT_HISTORY_LENGTH = 50;

//! ─── A FÁJLOK KORLÁTAI ─────────────────────────────────────────────────────
//! ÖT MEGABÁJT. Ez nem technikai határ, hanem szándék: ide SQL-lekérdezés,
//! kódrészlet, egy feladatlap kerül, nem videó. A korlátot a KÜLDŐ és a
//! FOGADÓ is betartatja — egy hamis méretet bejelentő küldő a fogadónál akad
//! el (lásd `webrtc-files.ts`).
export const MAX_FILE_BYTES = 5 * 1024 * 1024;

//! A KERET MÉRETE 16 KB, ÉS EZ SZÁNDÉKOSAN ÓVATOS. Az SCTP üzenethatárát a
//! böngészők eltérően szabják meg (`pc.sctp.maxMessageSize`); 16 KB az a
//! méret, amit minden ma használt böngésző elvisz, darabolás nélkül. 5 MB így
//! 320 keret — ez a néhány száz `send()` hívás semmibe nem kerül.
export const FILE_CHUNK_BYTES = 16 * 1024;

//! MENNYI FÁJLT TART MEG A MEGOSZTÓ. A csevegés a megosztással együtt megszűnik,
//! de amíg tart, a később érkező is elkérheti a korábbi fájlokat. A keret
//! azért kell, mert a megosztó gépének memóriájáról van szó: 24 MB néhány
//! kódrészlet és feladatlap, nem egy fájlszerver. A régiek esnek ki előbb.
export const FILE_RETENTION_BYTES = 24 * 1024 * 1024;

//! EDDIG A MÉRETIG MAGÁTÓL LEHOZZUK. Egy 4 kB-os SQL-fájlnál a „Letöltés" gomb
//! csak egy fölösleges koppintás — egy 3 MB-os PDF-nél viszont a néző döntse
//! el, akarja-e. A határ fölött a leírás látszik, a tartalom kérésre jön.
export const FILE_AUTO_FETCH_BYTES = 256 * 1024;

export const MAX_FILE_NAME_LENGTH = 120;

//! ─── A MEGOSZTÁS ÉLETIDEJE ─────────────────────────────────────────────────
//! A bejegyzés MAGÁTÓL ELMÚLIK. Nincs „takarító" feladat, és nincs olyan
//! állapot, amiből egy lezuhant lap szemetet hagyna: ha a megosztó lapja
//! bezárul, a szívverés elmarad, és a bejegyzés lejár. A `bye` csak gyorsít
//! ezen, nem ő a megoldás.
//*
//! A HATÁRIDŐ A SZÍVVERÉS HÁROMSZORosa. Két kimaradt szívverés (rossz wifi,
//! alvó gép) még nem tünteti el a megosztást a listáról; a harmadik igen.
export const STREAM_TTL_SECONDS = 90;

//! ─── A SZÍVVERÉS EGYBEN A POSTA IS ─────────────────────────────────────────
//! HARMINC MÁSODPERC, ÉS EZ A MEGOSZTÓ EGYETLEN RENDSZERES KÉRÉSE. Korábban
//! kettő volt: egy szívverés (15 mp) és egy külön postalekérdezés (1,5–4 mp).
//! A kettő közül a posta volt a drága, pedig az idő 99%-ában ÜRESET hozott.
//!
//! Ezért a szívverés válasza MOST MEGMONDJA, VÁR-E LEVÉL (`mail`). Ez ugyanaz
//! az egy kérés, egy `LLEN`-nyi többletmunkával a szerveren — és ebből a
//! megosztó pontosan tudja, mikor ÉRDEMES egyáltalán a ládához nyúlnia.
//!
//! AZ EREDMÉNY: egy üresjáratban futó megosztás 0,03 kérés/másodperc. Egy
//! 45 perces óra alatt kilencven kérés, nem tízezer.
export const HEARTBEAT_MS = 30_000;

/** A postaláda is lejár — egy meg nem érkezett néző nem hagy nyomot. */
export const MAILBOX_TTL_SECONDS = 120;
/** Egy ládában legfeljebb ennyi üzenet áll; a régiek kiesnek. */
export const MAILBOX_MAX = 200;

//! ─── LEKÉRDEZÉSI ÜTEM ──────────────────────────────────────────────────────
//! HOSSZÚ KAPCSOLAT HELYETT RÖVID KÉRDÉSEK. Egy SSE- vagy WebSocket-kapcsolat
//! a szerveren egy futó példányt köt le, amíg nyitva van — egy órán át nyitva
//! hagyott lap így akkor is fizet, amikor semmi nem történik. A jelzés viszont
//! MÁSODPERCEKIG tart, nem órákig: utána a kép már közvetlenül megy.
//!
//! Ezért kérdezünk, és csak akkor, amikor van mit kérdezni:
//!   • a néző gyorsan, AMÍG kapcsolódik, aztán ABBAHAGYJA (lásd `webrtc-viewer.ts`);
//!   • a megosztó lassabban, de folyamatosan — neki az új nézőket kell elkapnia.
//!
//! Egy élő megosztás így nagyságrendileg 40 kérés percenként. Egy órán át nyitva
//! tartott SSE ennél nem kevesebb, csak nehezebben látszik.
export const VIEWER_POLL_MS = 700;

//! ─── A NÉZŐ NEM PRÓBÁLKOZIK A VÉGTELENSÉGIG ────────────────────────────────
//! EZ EGY ÉLES NAPLÓBÓL TANULT LECKE. A `/webrtc` nyilvános címen fut, a diákok
//! pedig nem mind ugyanazon a wifin vannak: van, aki mobilnetről nyitja meg. A
//! közvetlen kapcsolat ilyenkor TURN nélkül NEM JÖN LÉTRE — és ez nem hiba,
//! hanem a szándékolt korlát (lásd `webrtc-peer.ts`).
//!
//! A baj az volt, hogy a néző ezt SOHA nem mondta ki: másodpercenként kérdezte
//! a postáját, háromemásodpercenként újra jelentkezett, és ezt tette percekig.
//! Egy ilyen lap magában 1,4 kérés/másodperc — húsz reménytelenül próbálkozó
//! diák pedig harminc.
//!
//! Ezért a próbálkozás LÉPCSŐZETESEN RITKUL, majd VÉGET ÉR. A lépcsők:
//!   • 0–10 mp: sűrűn (a kapcsolatok többsége itt áll össze),
//!   • 10–30 mp: ritkábban (lassú hálózat, második ICE-kör STUN-nal),
//!   • 30–75 mp: még ritkábban (utolsó esély),
//!   • utána: leállunk, és a felület KIMONDJA, hogy nem sikerült.
//!
//! A leállás NEM bontja a kapcsolatot: az ICE a háttérben tovább próbálkozik a
//! már kicserélt jelöltekkel. Csak a SZERVERT hagyjuk békén — onnan úgysem jön
//! már semmi új.
export const VIEWER_STEPS: readonly { until: number; every: number }[] = [
  { until: 10_000, every: VIEWER_POLL_MS },
  { until: 30_000, every: 2_000 },
  { until: 75_000, every: 5_000 },
];

/** `null`: elfogyott a türelem — a felület újrapróbálkozást ajánl. */
export function viewerDelay(elapsedMs: number): number | null {
  for (const step of VIEWER_STEPS) {
    if (elapsedMs < step.until) return step.every;
  }
  return null;
}
export const HOST_POLL_MS = 1500;

//! ─── AZ ÉBREN TÖLTÖTT IDŐ ──────────────────────────────────────────────────
//! A MEGOSZTÓ NEM FOLYAMATOSAN FIGYEL, HANEM ROHAMOKBAN. Ébren van
//!
//!   • a megosztás indítása után egy percig (ekkor csatlakoznak a diákok),
//!   • és minden olyan szívverés után, ami levelet jelzett,
//!
//! utána pedig elhallgat: a következő szívverésig egyetlen kérést sem küld.
//! Minden beérkező jelzés újraindítja ezt az egy percet, tehát egy folyamatosan
//! csatlakozó osztály alatt végig ébren marad.
//*
//! AMI EBBŐL KÖVETKEZIK, ÉS AMIT A FELÜLET KI IS MOND: egy csendes óra közepén
//! becsatlakozó diákra a megosztó legrosszabb esetben a következő szívverésig
//! (30 mp) nem figyel fel. A tanár a „Nézők keresése" gombbal ezt azonnal
//! lerövidítheti — ezért van ott a gomb.
export const HOST_ACTIVE_WINDOW_MS = 60_000;

//! KÉT „NÉZZÜK MEG" KÖZÖTT ENNYINEK EL KELL TELNIE. A lapváltás sűrűbben jön,
//! mint hinnénk (mérve: húsz másodperc alatt hatszor egy ablakok között váltó
//! gépen), és mindegyikre lekérdezni ugyanoda vezetne, ahonnan indultunk.
export const PEEK_GAP_MS = 10_000;

export const DISCOVERY_POLL_MS = 4000;

//! ─── ELŐBB A HELYI HÁLÓ, CSAK AZTÁN A VILÁG ────────────────────────────────
//! A NÉZŐK 95%-A UGYANAZON A WIFIN VAN, MINT A MEGOSZTÓ. Ezért az első kör
//! SZÁNDÉKOSAN STUN NÉLKÜL megy (`iceServers: []`): ilyenkor a böngésző csak a
//! saját hálózati címeit (host candidate) ajánlja fel, azokat viszont AZONNAL —
//! nincs külső szerverhez fordulás, nincs várakozás, és a kapcsolat jellemzően
//! a másodperc törtrésze alatt összeáll, a terem switchén keresztül.
//!
//! A SORREND AMÚGY IS EZ LENNE — csak lassabban. Az ICE a jelöltpárokat
//! prioritás szerint próbálja, és a helyi-helyi pár kapja a legmagasabb
//! prioritást. A STUN elhagyása tehát nem MÁS eredményt ad, hanem ugyanazt,
//! hamarabb és külső függés nélkül.
//!
//! HA MÉGSEM (a diák mobilneten néz, vagy a wifi elszigeteli a klienseket), a
//! `LAN_GRACE_MS` letelte után jön a STUN, és az ICE újraindul. Ez a kör már
//! lassabb, de a 95% nem fizet érte.
//!
//! TURN SZÁNDÉKOSAN NINCS. Egy TURN-szerver a KÉPET játszaná át magán — az
//! percenként gigabájtokat és egy olyan gépet jelentene, ami látja, amit a
//! tanár mutat. Ezt a lehetőséget nem „később vezetjük be": nem akarjuk. Ahol
//! a hálózat a közvetlen kapcsolatot sem engedi, ott a megosztás nem jön létre,
//! és a felület ezt ki is mondja.
export const LAN_GRACE_MS = 4000;

//! A STUN NEM LÁTJA A KÉPET, CSAK A CÍMET MONDJA MEG. Egy STUN-szerver
//! egyetlen kérdésre válaszol: „milyen címről érkeztem hozzád?" Média nem megy
//! rajta, tehát a második kör is a két böngésző között marad — csak a
//! találkozáshoz kell egy kívülálló, aki megmondja a NAT mögötti félnek a saját
//! külső címét.
//*
//* A `NEXT_PUBLIC_WEBRTC_STUN` vesszős listával felülírható
//* (`stun:host:port,stun:…`). A `"none"` (vagy bármi, amiben nincs `stun:`)
//* KIKAPCSOLJA: ilyenkor a második kör is helyi marad. Egy zárt iskolai
//* hálózaton, ahol a nézők úgyis bent vannak, ez a helyes beállítás.
const DEFAULT_STUN =
  "stun:stun.l.google.com:19302,stun:stun.cloudflare.com:3478";

export function stunServers(configured: string | undefined): RTCIceServer[] {
  const urls = (configured === undefined ? DEFAULT_STUN : configured)
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.startsWith("stun:"));
  return urls.length > 0 ? [{ urls }] : [];
}

//* ---------------------------------------------------------------------------
//* TISZTÍTÓK — a szerver és a kliens UGYANEZT futtatja
//* ---------------------------------------------------------------------------
//! A KLIENS TISZTÍTÁSA KÉNYELEM, A SZERVERÉ A SZABÁLY. Ugyanaz a függvény fut
//! mindkét oldalon, hogy a felület ne engedjen be olyat, amit a szerver úgyis
//! eldobna — de a döntést a szerver hozza.

//! ─── A LÁTHATATLAN JELEK KIESNEK ──────────────────────────────────────────
//! A vezérlőkarakterek és az IRÁNYVÁLTÓ jelek egy névsorban nem díszek. Az
//! utóbbiakkal (`U+202A`–`U+202E`, `U+2066`–`U+2069`) a megjelenített szöveg
//! sorrendje elfordítható: egy becenév így úgy nézhet ki a listában, mint
//! valaki másé, pedig karakterről karakterre más. A nulla szélességű jelek
//! (`U+200B`–`U+200F`) ugyanezt csendben teszik — két, a képernyőn AZONOS név
//! között tesznek különbséget.
//*
//! KÓDPONTONKÉNT SZŰRÜNK, NEM REGEXSZEL. Egy vezérlőkaraktereket tartalmazó
//! reguláris kifejezés a forrásban maga is láthatatlan jeleket jelentene —
//! olyan kódot, aminek a helyessége szemmel nem ellenőrizhető.
function invisible(code: number): boolean {
  return (
    code <= 0x1f ||
    code === 0x7f ||
    (code >= 0x200b && code <= 0x200f) ||
    (code >= 0x202a && code <= 0x202e) ||
    (code >= 0x2066 && code <= 0x2069)
  );
}

//* `keepNewline`: a csevegésben a sortörés TARTALOM (egy beillesztett
//* felsorolás enélkül egyetlen sorrá folyna össze), a névben nem az.
function strip(value: string, keepNewline: boolean): string {
  let out = "";
  for (const ch of value) {
    const code = ch.codePointAt(0) ?? 0;
    if (invisible(code)) {
      if (keepNewline && ch === "\n") out += ch;
      continue;
    }
    out += ch;
  }
  return out;
}

function collapse(value: string): string {
  return strip(value, false).replace(/\s+/g, " ").trim();
}

export function sanitizeNickname(value: unknown): string | null {
  if (typeof value !== "string") return null;
  //* Előbb vágunk, aztán tisztítunk: egy megabájtos „becenéven" ne menjen
  //* végig a szűrő.
  const text = collapse(value.slice(0, MAX_NICKNAME_LENGTH * 4));
  if (text.length < MIN_NICKNAME_LENGTH) return null;
  return text.slice(0, MAX_NICKNAME_LENGTH);
}

export function sanitizeTitle(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = collapse(value.slice(0, MAX_TITLE_LENGTH * 4));
  if (text.length === 0) return null;
  return text.slice(0, MAX_TITLE_LENGTH);
}

export function sanitizeChatText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  //* A `\r` már a `strip`-ben kiesett (vezérlőkarakter), tehát a windowsos
  //* `\r\n`-ből is egyetlen sortörés maradt.
  const text = strip(value.slice(0, MAX_CHAT_LENGTH * 4), true)
    //* Vízszintes térköz összevonása — a sortörést nem érinti.
    .replace(/[^\S\n]+/g, " ")
    //* Legfeljebb egy üres sor: egy enterekből álló üzenet különben kitolná a
    //* csevegést a képernyőről.
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (text.length === 0) return null;
  return text.slice(0, MAX_CHAT_LENGTH);
}

//! ═══════════════════════════════════════════════════════════════════════════
//! A JELSZÓ — AMI SOHA NEM UTAZIK, ÉS SOHA NEM ÁLL MEG
//! ═══════════════════════════════════════════════════════════════════════════
//! A FELADAT KICSI ÉS PONTOSAN KÖRÜLHATÁROLT: a tanár kimond egy szót a
//! teremben, és aki nincs ott, ne tudjon belépni. Nem titkosszolgálati
//! védelem, hanem egy ajtó, ami nincs sarkig tárva.
//!
//! EZÉRT NEM KÜLDJÜK EL A JELSZÓT. Sem a szervernek, sem a megosztónak. A
//! csatlakozó fél egy LENYOMATOT küld: `SHA-256(megosztás-azonosító + ":" +
//! jelszó)`. A megosztó ugyanezt kiszámolja a saját jelszavából, és a kettőt
//! hasonlítja össze.
//!
//! A SÓ MAGA A MEGOSZTÁS AZONOSÍTÓJA. Véletlen, 122 bites, és megosztásonként
//! más — tehát ugyanaz a jelszó két órán KÜLÖNBÖZŐ lenyomatot ad. Egy
//! lehallgatott lenyomat így egyetlen megosztásra érvényes, és azzal is csak
//! addig, amíg az tart.
//!
//! AMIT EZ NEM VÉD KI, ÉS KI IS MONDJUK: a szerver LÁTJA a lenyomatot és
//! ismeri a sót, tehát egy rövid szót („alma") ki tudna próbálgatni. Ez nem
//! azért nem baj, mert nehéz, hanem mert nem ez ellen véd: a szerver a miénk,
//! és ha ő rosszindulatú, a jelszó a legkisebb gond. A védelem a KÍVÜLÁLLÓ
//! ellen szól, aki a nyilvános listát olvassa — neki a lenyomat sem segít.
//!
//! ÉS A DÖNTÉST A MEGOSZTÓ HOZZA MEG, NEM A SZERVER. Hiába engedné át a
//! szerver a kérést: ha a lenyomat nem stimmel, a megosztó gépe nem épít
//! kapcsolatot, tehát nincs honnan képet kapni. A kép ott van, ahol a döntés.
//! ═══════════════════════════════════════════════════════════════════════════

export const MIN_PASSWORD_LENGTH = 3;
export const MAX_PASSWORD_LENGTH = 64;

//* A jelszóból a szóközök a végekről esnek le, a belsejéből NEM: „nagy kutya"
//* két szó, és a tanár így is mondja ki. A láthatatlan jelek viszont itt is
//* kiesnek — egy bemásolt, nulla szélességű jel néma hibát okozna.
export function sanitizePassword(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = strip(value.slice(0, MAX_PASSWORD_LENGTH * 4), false).trim();
  if (text.length < MIN_PASSWORD_LENGTH) return null;
  return text.slice(0, MAX_PASSWORD_LENGTH);
}

//! `crypto.subtle` CSAK BIZTONSÁGOS EREDETEN LÉTEZIK (https vagy localhost).
//! Ez a lap mindkettőn fut, de ha egyszer mégsem, a jelszó néma elhagyása
//! lenne a legrosszabb válasz — ezért a hívás ilyenkor dob, és a felület
//! kimondja, hogy jelszavas megosztás itt nem indítható.
export async function joinProof(
  streamId: string,
  password: string,
): Promise<string> {
  const data = new TextEncoder().encode(`${streamId}:${password}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

//! AZONOS HOSSZ MELLETT MINDEN BÁJTOT VÉGIGNÉZÜNK. Egy korán kiugró
//! összehasonlítás a válaszidőn keresztül elárulná, hányadik jegynél tért el —
//! itt ez csak elvi kockázat (egy hash-t nem így törnek), de a helyes alak
//! ennyibe kerül.
export function sameProof(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function isProof(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
}

//! AZ AZONOSÍTÓ NEM SORSZÁM. A postaláda címe maga az azonosító: aki ismeri,
//! írhat bele. Ezért `randomUUID` (122 bit véletlen), és nem valami
//! kitalálható. A megosztóé szükségképpen nyilvános — a nézőknek oda kell
//! írniuk —, a nézőké viszont csak a megosztóhoz jut el.
export function newPeerId(): string {
  return crypto.randomUUID();
}

export function isPeerId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value)
  );
}

//* Emberi idő a csevegéshez és a névsorhoz.
export const CLOCK_FMT = new Intl.DateTimeFormat("hu-HU", {
  hour: "2-digit",
  minute: "2-digit",
});
