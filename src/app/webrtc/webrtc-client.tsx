"use client";

import {
  ArrowLeft,
  Expand,
  Lock,
  Maximize2,
  Minimize2,
  MonitorOff,
  MonitorUp,
  PanelRightClose,
  PanelRightOpen,
  RefreshCw,
  ShieldAlert,
  Shrink,
  Users,
  WifiOff,
} from "lucide-react";
import { useSearchParams } from "next/navigation";
import {
  type FormEvent,
  Suspense,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { CrestField, PAGE_CHROME } from "@/components/chrome/page-field";
import { SITE_BAR_MAX, StandingLine } from "@/components/chrome/standing-line";
import { SiteFooter } from "@/components/site-footer";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { ChatPanel } from "@/components/webrtc/chat";
import { RosterList } from "@/components/webrtc/roster";
import { LinkDot, Stage } from "@/components/webrtc/stage";
import { cn } from "@/lib/utils";
import { useScreenHost } from "@/lib/webrtc-host";
import { useWebrtcIdentity } from "@/lib/webrtc-me";
import { canShareScreen, canWatch, hasWideFallback } from "@/lib/webrtc-peer";
import { afterFailure, Pump } from "@/lib/webrtc-poll";
import {
  DISCOVERY_POLL_MS,
  MAX_NICKNAME_LENGTH,
  MAX_PASSWORD_LENGTH,
  MAX_TITLE_LENGTH,
  MIN_PASSWORD_LENGTH,
  type StreamSummary,
  sanitizeNickname,
  sanitizePassword,
} from "@/lib/webrtc-shared";
import { fetchStreams, type Me, type StreamList } from "@/lib/webrtc-signal";
import { type JoinAttempt, useScreenViewer } from "@/lib/webrtc-viewer";

//! ═══════════════════════════════════════════════════════════════════════════
//! /webrtc — PRÓBALAP A SAJÁT KÉPERNYŐMEGOSZTÁSHOZ
//! ═══════════════════════════════════════════════════════════════════════════
//! EZ A LAP AZT A KÉRDÉST TESZTELI, HOGY LE LEHET-E VÁLNI A SCREENTASKRÓL. A
//! mai megoldás (lásd `screentask-viewer.tsx`) egy külön programot kíván a
//! tanári gépre, cserébe csak Chrome-ban ágyazható be, és a gép IP-jét ötven
//! cím végigpróbálásával kell megkeresni. Itt ebből semmi nincs:
//!
//!   • a megosztás a böngészőből indul, telepítés nélkül;
//!   • a nézés Firefoxban és Safariban (iPhone-on is) ugyanúgy megy;
//!   • címet senkinek nem kell begépelnie — a lista mutatja, mi megy;
//!   • a szerver csak a jelzést viszi: se kép, se hang, se csevegés, se felvétel.
//!
//! A TANÁRI MEGOSZTÁS A TANÁRHOZ VAN KÖTVE (lásd `StreamSummary.teacher`): aki
//! tanárként indít, annak MINDEN óráján megjelenik az „élő" jelzés, és a
//! diákjai onnan érkeznek ide. Két osztály egyszerre, három csoport egy
//! teremben — egyik sem külön eset, mert a megosztás nem az óráé.
//!
//! AMI MÉG NINCS KÉSZ, ÉS EZÉRT PRÓBALAP: nincs moderáció (a megosztó csak
//! bontani tud, kizárni nem), és a lista mindenkinek ugyanaz — a jelszó szűkíti,
//! de nem rejti el a megosztást. A `/kivetites` csak akkor válthat erre, ha ez
//! a kettő megvan.
//! ═══════════════════════════════════════════════════════════════════════════

//* A képre ültetett gombok: a lap színeitől függetlenül sötét háttéren ülnek,
//* tehát a világos témában sem vehetik át a lap szövegszínét.
const DARK_CONTROL =
  "text-white/80 hover:bg-white/15 hover:text-white dark:hover:bg-white/15";

//* Ugyanaz a mezőalak, mint a lap többi űrlapjában (`timetable/lesson-extras.tsx`).
const INPUT =
  "h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 text-base text-foreground placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50 aria-invalid:border-destructive sm:text-sm dark:bg-input/30";

//! ─── A NÉGY ÁLLAPOT ────────────────────────────────────────────────────────
//! A JELSZÓ SAJÁT ÁLLAPOT (`ask`), NEM EGY MEZŐ A NÉZÉSEN BELÜL. Amíg nincs
//! jelszó, NINCS kapcsolat: a `useScreenViewer` cél nélkül áll, tehát semmi nem
//! épül fel, amit aztán le kellene bontani. Egy rossz jelszó ugyanide tér
//! vissza — nem hibaüzenet lesz belőle, hanem újra a kérdés.
type Mode =
  | { kind: "browse" }
  | { kind: "host" }
  | { kind: "ask"; stream: StreamSummary }
  | { kind: "watch"; stream: StreamSummary; attempt: JoinAttempt };

export function WebrtcPage() {
  const identity = useWebrtcIdentity();

  return (
    <main className="relative flex min-h-[100dvh] flex-col bg-background tt-safe">
      <CrestField />

      <div className={PAGE_CHROME}>
        <div className={cn("mx-auto w-full", SITE_BAR_MAX)}>
          <StandingLine
            line={{ subject: "Képernyőmegosztás", context: "próbalap" }}
          />
        </div>
      </div>

      {/*//! SZÁNDÉKOSAN NINCS `z-10` EZEN A BUROKON, pedig a lap többi hasonló
          //! burka ezt viseli. Egy `z-index` SAJÁT RÉTEGRENDET nyit: ami benne
          //! van, az egymáshoz képest rendeződik, a külvilághoz képest viszont
          //! EGYBEN, ezen az egy szinten. A nagy nézet (`filling`) így hiába
          //! kapna `z-50`-et, a ragadó fejléc (`z-30`) fölé nem tudna kerülni —
          //! és a fejléc átlógna a kiterített képre.
          //*
          //! A `relative` maradhat, mert önmagában nem nyit réteget: a
          //! fénymező (`CrestField`) ettől függetlenül alul marad, hiszen
          //! hamarabb áll a DOM-ban, és ez a burok pozicionált. */}
      <div className="relative mx-auto w-full max-w-5xl grow px-4 pb-10 sm:px-6">
        {/*//! A SUSPENSE-KERET NEM DÍSZ, HANEM KÖVETELMÉNY. A lap az URL
            //! keresőrészét olvassa (`?adas=`, `?cim=` — lásd `Room` és
            //! `Browse`), az pedig előrendereléskor nem ismert. A keret nélkül
            //! az EGÉSZ lap kiesne az előrenderelésből; így csak ez a doboz vár
            //! a böngészőre, a fejléc és a lábléc a HTML-ben érkezik.
            //*
            //! Az űrlapokhoz amúgy is kell a böngésző (postaláda-cím, képesség-
            //! vizsgálat), ezért ugyanaz a pörgettyű a tartaléka, mint amit a
            //! cím megszületéséig mutatunk — nem villan két különböző váz. */}
        <Suspense fallback={<Waiting />}>
          {identity.me === null ? (
            <Waiting />
          ) : (
            <Room me={identity.me} identity={identity} />
          )}
        </Suspense>
      </div>

      <SiteFooter />
    </main>
  );
}

//* Zárt megosztásnál előbb a kérdés, nyitottnál egyből a kép. Egy helyen, hogy
//* a listáról és az órarendi linkről érkező út ne térhessen el.
function watchOrAsk(stream: StreamSummary): Mode {
  return stream.locked
    ? { kind: "ask", stream }
    : { kind: "watch", stream, attempt: { password: null } };
}

function Waiting() {
  return (
    <div className="flex min-h-64 items-center justify-center">
      <Spinner className="size-5 text-muted-foreground" />
    </div>
  );
}

//! A HOROGOKAT CSAK AKKOR SZABAD FELÉPÍTENI, AMIKOR MÁR VAN POSTALÁDA-CÍM.
//! Ezért külön komponens: a `me` itt már biztosan megvan, tehát a
//! `useScreenHost` és a `useScreenViewer` feltétel nélkül hívható.
function Room({
  me,
  identity,
}: {
  me: Me;
  identity: ReturnType<typeof useWebrtcIdentity>;
}) {
  const [mode, setMode] = useState<Mode>({ kind: "browse" });
  const list = useStreamList(mode.kind === "browse");
  const host = useScreenHost(me);
  const viewer = useScreenViewer(
    me,
    mode.kind === "watch" ? mode.stream : null,
    mode.kind === "watch" ? mode.attempt : null,
  );

  //! ─── AZ ÓRARENDRŐL ÉRKEZŐ LINK ───────────────────────────────────────────
  //! `?adas=<azonosító>` — a diák az óra mellől jött (lásd `LiveBlock`), és
  //! nem a listát akarja, hanem AZT az egy megosztást. A cím feloldásához meg
  //! kell várni az első listát; addig a lap a listát mutatja, ami nem hazugság:
  //! ha a megosztás közben véget ért, pontosan ez a helyes végállapot.
  const wanted = useSearchParams().get("adas");
  const arrived = useRef(false);
  useEffect(() => {
    if (arrived.current || !wanted || mode.kind !== "browse") return;
    const stream = list.streams.find((s) => s.id === wanted);
    if (!stream) return;
    arrived.current = true;
    setMode(watchOrAsk(stream));
  }, [wanted, list.streams, mode.kind]);

  //* A megosztás bármikor véget érhet a böngésző saját sávjáról is — ilyenkor
  //* a lap magától visszatér a listához, nem marad egy halott nézeten.
  useEffect(() => {
    if (mode.kind === "host" && host.phase === "ended") {
      setMode({ kind: "browse" });
    }
  }, [mode.kind, host.phase]);

  if (!canWatch()) {
    return (
      <Notice icon={<ShieldAlert />} title="Ez a böngésző nem tud WebRTC-t">
        A képernyőmegosztás nézéséhez is kell. Próbáld egy frissebb böngészőben.
      </Notice>
    );
  }

  //! A KAPU CSAK A LISTÁN ÁLL, A SZOBÁBAN SOHA. Aki már bent van, azt egy
  //! megingó munkamenet-lekérdezés nem küldheti vissza névválasztani — a
  //! nézetet leszerelni annyi lenne, mint bontani a kapcsolatot, a kép közepén.
  //! (A megingást magát a `webrtc-me.ts` retesze szünteti meg; ez a második zár.)
  if (mode.kind === "browse" && !identity.ready) {
    return <NicknameGate identity={identity} />;
  }

  if (mode.kind === "host") {
    return (
      <HostView
        host={host}
        me={me}
        onLeave={() => {
          host.stop();
          setMode({ kind: "browse" });
        }}
      />
    );
  }

  //! ─── A ROSSZ JELSZÓ NEM VÉGÁLLAPOT, ÉS NEM IS ÁLLAPOTVÁLTÁS ─────────────
  //! A kérdés ITT, RENDERELÉSKOR dől el, nem egy effektben. Effekttel ugyanis
  //! versenyhelyzet keletkezett: az „elutasítva" jelzés egy képkockával
  //! tovább élt, mint a hozzá tartozó kísérlet, és a JÓ jelszót is azonnal
  //! visszadobta a kérdéshez. Levezetve ez nem tud megtörténni — amit látunk,
  //! az mindig az ÉPPEN futó kísérlet állapota.
  if (mode.kind === "ask" || (mode.kind === "watch" && viewer.wrongPassword)) {
    const stream = mode.stream;
    return (
      <PasswordGate
        stream={stream}
        retry={mode.kind === "watch"}
        onCancel={() => setMode({ kind: "browse" })}
        onSubmit={(password) =>
          //* Minden elküldés ÚJ kísérlet — lásd `JoinAttempt`.
          setMode({ kind: "watch", stream, attempt: { password } })
        }
      />
    );
  }

  if (mode.kind === "watch") {
    return (
      <WatchView
        viewer={viewer}
        me={me}
        onLeave={() => setMode({ kind: "browse" })}
      />
    );
  }

  return (
    <Browse
      identity={identity}
      list={list}
      onHost={(title, password) => {
        host.start(title, password);
        setMode({ kind: "host" });
      }}
      hostError={host.error}
      onWatch={(stream) => setMode(watchOrAsk(stream))}
    />
  );
}

//* ---------------------------------------------------------------------------
//* A JELSZÓ KAPUJA
//* ---------------------------------------------------------------------------
//! A JELSZÓ INNEN NEM MEGY TOVÁBB, CSAK A LENYOMATA (lásd `joinProof`). Ez a
//! doboz az egyetlen hely a lapon, ahol a szó maga egyáltalán létezik — utána
//! a `useScreenViewer` már csak a belőle számolt lenyomatot küldi el.
//*
//! NINCS „PRÓBÁLD ÚJRA" GOMB, MERT NINCS MIT ÚJRAPRÓBÁLNI. Aki rossz jelszót
//! írt, annak nem várnia kell, hanem másikat beírnia — ezért a mező marad, a
//! tartalma kijelölve, és fölötte egy mondat, ami megmondja, mi történt.
function PasswordGate({
  stream,
  retry,
  onCancel,
  onSubmit,
}: {
  stream: StreamSummary;
  retry: boolean;
  onCancel: () => void;
  onSubmit: (password: string) => void;
}) {
  const inputId = useId();
  const [draft, setDraft] = useState("");
  const clean = sanitizePassword(draft);

  //! A MEZŐBE ÁLLUNK, ÉS ROSSZ JELSZÓ UTÁN KI IS JELÖLJÜK. Aki ide kerül, egy
  //! dolgot akar: beírni a szót, amit az előbb hallott. Újrapróbálkozásnál a
  //! régi tartalom kijelölve várja — a gépelés felülírja, nem kell törölni.
  const fieldRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const field = fieldRef.current;
    if (!field) return;
    field.focus();
    if (retry) field.select();
  }, [retry]);

  return (
    <section className="mx-auto mt-10 max-w-md">
      <h1 className="flex items-center gap-2 text-lg font-semibold">
        <Lock className="size-4 shrink-0" aria-hidden />
        Jelszavas megosztás
      </h1>
      <p className="mt-1 text-sm text-pretty text-muted-foreground">
        <span className="font-medium text-foreground">{stream.title}</span> —{" "}
        {stream.host.name} jelszót kért. A teremben mondja meg.
      </p>

      {retry && (
        <p className="mt-3 text-sm text-destructive" role="alert">
          Ez a jelszó nem jó. Kérdezd meg újra — a kis- és nagybetű számít.
        </p>
      )}

      <form
        className="mt-4 flex items-center gap-2"
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          if (clean) onSubmit(clean);
        }}
      >
        <label htmlFor={inputId} className="sr-only">
          Jelszó
        </label>
        <input
          ref={fieldRef}
          id={inputId}
          type="password"
          //! NEM A BÖNGÉSZŐ JELSZÓKEZELŐJÉBE VALÓ. Ez egy óra végéig élő,
          //! kimondott szó, nem egy fiók jelszava — az `off` azt akadályozza
          //! meg, hogy a böngésző felajánlja a mentését egy „fiókhoz", ami
          //! nem létezik.
          autoComplete="off"
          maxLength={MAX_PASSWORD_LENGTH}
          placeholder="Jelszó"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          className={INPUT}
        />
        <Button type="submit" disabled={clean === null}>
          Belépek
        </Button>
      </form>

      <Button
        variant="ghost"
        size="sm"
        className="mt-3 gap-1.5"
        onClick={onCancel}
      >
        <ArrowLeft className="size-3.5" aria-hidden />
        Vissza a listához
      </Button>
    </section>
  );
}

//* ---------------------------------------------------------------------------
//* A BECENÉV KAPUJA
//* ---------------------------------------------------------------------------
//! NEM AZÉRT KÉRJÜK, HOGY TUDJUK, KI VAGY. A megosztás résztvevői EGYMÁST
//! látják a névsorban; egy „ismeretlen 3" senkinek nem mond semmit, és a
//! csevegésben végképp nem. A becenév a gépeden marad (lásd `webrtc-me.ts`),
//! a szerver nem tárolja.
function NicknameGate({
  identity,
}: {
  identity: ReturnType<typeof useWebrtcIdentity>;
}) {
  const inputId = useId();
  const [draft, setDraft] = useState(identity.nickname);
  const clean = sanitizeNickname(draft);

  return (
    <section className="mx-auto mt-10 max-w-md">
      <h1 className="text-lg font-semibold">Hogy hívjunk?</h1>
      <p className="mt-1 text-sm text-pretty text-muted-foreground">
        A megosztás többi résztvevője ezt a nevet fogja látni melletted. Ha
        belépsz, a fiókod neve kerül ide, és a többiek látják is, hogy az
        igazolt.
      </p>

      <form
        className="mt-4 flex items-center gap-2"
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          if (clean) identity.setNickname(clean);
        }}
      >
        <label htmlFor={inputId} className="sr-only">
          Becenév
        </label>
        <input
          id={inputId}
          type="text"
          autoComplete="nickname"
          maxLength={MAX_NICKNAME_LENGTH}
          placeholder="Becenév"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          className={INPUT}
        />
        <Button type="submit" disabled={clean === null}>
          Tovább
        </Button>
      </form>

      <p className="mt-3 text-xs text-muted-foreground">
        Vagy{" "}
        <a href="/belepes?next=/webrtc" className="underline">
          lépj be
        </a>{" "}
        — akkor nem kell becenevet választanod.
      </p>
    </section>
  );
}

//* ---------------------------------------------------------------------------
//* A FELFEDEZŐ LISTA
//* ---------------------------------------------------------------------------
//! A LISTÁT KÉRDEZGETJÜK, ÉS EZ ITT BŐVEN ELÉG. Négy másodperc egy megosztás
//! megjelenéséhez nem sok — senki nem MÁSODPERCRE vár rá —, és cserébe a
//! szerveren nincs nyitva tartott kapcsolat. Aki türelmetlen, ott a frissítés
//! gomb.
export type StreamListState = StreamList & {
  loading: boolean;
  refresh: () => void;
  /** Igaz, amíg a frissítés jelzése látszik (lásd `SPIN_MS`). */
  spinning: boolean;
};

//* Egy teljes fordulat. Rövidebbnél a szem nem fogja fel, hosszabbnál a gomb
//* lomhának tűnik egy olyan műveletnél, ami valójában azonnal kész.
const SPIN_MS = 600;

function useStreamList(active: boolean): StreamListState {
  const [streams, setStreams] = useState<StreamSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [distributed, setDistributed] = useState(true);
  //! A FRISSÍTÉS LÁTHATÓ IDEJE. Egy helyi hálózaton a válasz 8 ms alatt
  //! megjön, és a pörgés egyetlen képkockára villanna — a felhasználó számára
  //! ez megkülönbözhetetlen attól, mintha a gomb nem is működne. Ezért a
  //! forgás egy rövid, FIX ideig mindenképp látszik.
  const [spinning, setSpinning] = useState(false);
  const pump = useRef<Pump | null>(null);

  const refresh = useCallback(() => {
    setSpinning(true);
    //! EZ KORÁBBAN NEM CSINÁLT SEMMIT. A régi változat egy refet léptetett és
    //! újrarajzolt — de a lekérdező effekt függőségei üresek voltak, tehát a
    //! kérés SOHA nem indult újra. A gomb megnyomható volt, forgott volna is,
    //! és pontosan semmi nem történt. Most a szivattyút indítja újra.
    pump.current?.restart();
    setTimeout(() => setSpinning(false), SPIN_MS);
  }, []);

  //! ─── CSAK AKKOR KÉRDEZÜNK, AMIKOR VALAKI NÉZI IS ─────────────────────────
  //! A lista a `Room` szintjén él, hogy az órarendről érkező `?adas=` linket
  //! fel tudjuk oldani — de amíg valaki MEGOSZT vagy NÉZ, a listát senki nem
  //! látja. Az `active` ilyenkor hamis, és a lekérdezés áll. Enélkül egy egész
  //! órán át nézett megosztás négymásodpercenként kérdezett volna rá egy
  //! listára, ami nincs is a képernyőn.
  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    let failures = 0;
    const mail = new Pump(async () => {
      const list = await fetchStreams(controller.signal);
      setLoading(false);
      if (!list) {
        //* A lista hibája nem tünteti el a korábbi választ — csak ritkítunk,
        //* amíg a szerver vissza nem jön (lásd `afterFailure`).
        failures += 1;
        return afterFailure(failures, DISCOVERY_POLL_MS);
      }
      failures = 0;
      setStreams(list.streams);
      setDistributed(list.distributed);
      return DISCOVERY_POLL_MS;
    });
    pump.current = mail;
    mail.restart();

    return () => {
      mail.stop();
      pump.current = null;
      controller.abort();
    };
  }, [active]);

  return { streams, loading, distributed, refresh, spinning };
}

function Browse({
  identity,
  list,
  onHost,
  hostError,
  onWatch,
}: {
  identity: ReturnType<typeof useWebrtcIdentity>;
  list: StreamListState;
  onHost: (title: string, password: string | null) => void;
  hostError: string | null;
  onWatch: (stream: StreamSummary) => void;
}) {
  const { streams, loading, distributed, refresh, spinning } = list;
  //! A CÍM AZ ÓRARENDRŐL IS JÖHET (`?cim=…`, lásd `LiveBlock`): a tanár az óra
  //! mellől indul, és a tantárgy, az osztály és a terem már ki van töltve. Ez
  //! KEZDŐÉRTÉK, nem kényszer — át lehet írni.
  const suggested = useSearchParams().get("cim") ?? "";
  const [title, setTitle] = useState(suggested);
  const [password, setPassword] = useState("");
  const [wantsPassword, setWantsPassword] = useState(false);
  const titleId = useId();
  const passwordId = useId();
  const [canShare, setCanShare] = useState(true);

  //* A képességet csak a böngészőben szabad megkérdezni — a kiszolgálón nincs
  //* `navigator`, és egy kiszolgálón eldöntött „nem tudod" hidratálási
  //* eltérést okozna.
  useEffect(() => setCanShare(canShareScreen()), []);

  const cleanPassword = sanitizePassword(password);
  const passwordMissing = wantsPassword && cleanPassword === null;

  return (
    <div className="space-y-8 pt-6">
      <header>
        <h1 className="text-xl font-semibold">Képernyőmegosztás</h1>
        <p className="mt-1 max-w-2xl text-sm text-pretty text-muted-foreground">
          A kép közvetlenül a két gép között megy, a terem hálózatán — a
          szerverünk csak összeismerteti a két böngészőt. Nincs felvétel, nincs
          hang.{" "}
          <span className="font-medium text-foreground">
            {identity.name ?? "Vendég"}
          </span>{" "}
          néven látnak a többiek.
        </p>
      </header>

      {!distributed && (
        <Notice icon={<ShieldAlert />} title="Fejlesztői mód">
          A jegyzék a szerver memóriájában van, nem Redisben. Egy gépen minden
          működik; több szerverpéldány esetén a két fél nem találná meg egymást.
        </Notice>
      )}

      {/* ── Megosztás indítása ─────────────────────────────────────────── */}
      <section className="rounded-xl border border-border p-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <MonitorUp className="size-4" aria-hidden />
          Megosztom a képernyőmet
        </h2>

        {canShare ? (
          <form
            className="mt-3 space-y-2"
            onSubmit={(event: FormEvent) => {
              event.preventDefault();
              if (passwordMissing) return;
              onHost(title, wantsPassword ? cleanPassword : null);
            }}
          >
            <div className="flex flex-col gap-2 sm:flex-row">
              <label htmlFor={titleId} className="sr-only">
                Mit osztasz meg?
              </label>
              <input
                id={titleId}
                type="text"
                maxLength={MAX_TITLE_LENGTH}
                autoComplete="off"
                placeholder="Pl. 218 — matek, Pitagorasz"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                className={INPUT}
              />
              <Button type="submit" className="shrink-0">
                Indítás
              </Button>
            </div>

            {/*//! A JELSZÓ OPCIÓ, NEM ALAPÉRTELMEZÉS. Egy iskolai hálózaton a
                //! megosztások többsége nyitott lehet; a zár arra való, amikor
                //! a tanár tudja, hogy kell. Kipipálva viszont KÖTELEZŐ kitölteni
                //! — egy üres jelszavú „zárt" megosztás a legrosszabb: úgy néz ki,
                //! mint a védelem, de nem az. */}
            <label
              htmlFor={passwordId}
              className="flex items-center gap-2 pt-1 text-xs text-foreground"
            >
              <input
                type="checkbox"
                className="size-4 accent-primary"
                checked={wantsPassword}
                onChange={(event) => setWantsPassword(event.target.checked)}
              />
              <Lock className="size-3.5 text-muted-foreground" aria-hidden />
              Jelszóval védem
            </label>

            {wantsPassword && (
              <>
                <input
                  id={passwordId}
                  type="text"
                  autoComplete="off"
                  maxLength={MAX_PASSWORD_LENGTH}
                  placeholder="A jelszó, amit az osztálynak mondasz"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className={INPUT}
                  aria-invalid={passwordMissing ? true : undefined}
                />
                <p className="text-[11px] text-pretty text-muted-foreground">
                  Mondd ki a teremben. Se a szerverünk, se a nézők böngészője
                  nem kapja meg magát a szót — csak azt tudják ellenőrizni, hogy
                  ugyanazt írták-e be. Legalább {MIN_PASSWORD_LENGTH} karakter.
                </p>
              </>
            )}

            {identity.verified ? null : (
              <p className="text-[11px] text-pretty text-muted-foreground">
                Belépés nélkül is megoszthatsz, de a diákjaid az óráik mellett
                csak akkor látják meg, ha tanárként vagy belépve.
              </p>
            )}
          </form>
        ) : (
          //! iOS-EN NINCS KÉPERNYŐMEGOSZTÁS, ÉS EZT KI KELL MONDANI. Nem a mi
          //! hiányosságunk: a WebKitben nincs `getDisplayMedia`, tehát iPhone-on
          //! és iPaden EGYETLEN böngésző sem tud megosztani. Nézni viszont
          //! mindegyik tud — épp ez az, amit a ScreenTask kliense nem tudott.
          <p className="mt-2 text-sm text-pretty text-muted-foreground">
            Ez a böngésző nem tud képernyőt megosztani (iPhone-on és iPaden
            egyik sem). Nézni viszont tudsz — az alábbi listából.
          </p>
        )}

        {hostError && (
          <p className="mt-2 text-sm text-destructive">{hostError}</p>
        )}
      </section>

      {/* ── Az élő megosztások ─────────────────────────────────────────── */}
      <section>
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold">Most megy</h2>
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={refresh}
            disabled={spinning}
            aria-label="Lista frissítése"
            className="ml-auto text-muted-foreground"
          >
            {/*//! A FORGÁS A GOMB EGYETLEN VISSZAJELZÉSE. A lista tartalma
                //! jellemzően NEM változik egy frissítéstől (ugyanaz megy, mint
                //! az előbb), tehát ha az ikon sem mozdulna, a felhasználó azt
                //! látná, hogy a koppintása elveszett. A `motion-reduce` ág
                //! azoknak szól, akik a mozgást kikapcsolták: nekik a halványítás
                //! marad a jelzés. */}
            <RefreshCw
              className={cn(
                "transition-opacity",
                spinning && "animate-spin motion-reduce:animate-none",
                spinning && "motion-reduce:opacity-50",
              )}
            />
          </Button>
        </div>

        {loading ? (
          <div className="flex min-h-24 items-center justify-center">
            <Spinner className="size-4 text-muted-foreground" />
          </div>
        ) : streams.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            Épp senki nem oszt meg semmit.
          </p>
        ) : (
          <ul className="mt-2 space-y-2">
            {streams.map((stream) => (
              <li key={stream.id}>
                <button
                  type="button"
                  onClick={() => onWatch(stream)}
                  className="flex w-full items-center gap-3 rounded-xl border border-border p-3 text-left transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  <LinkDot tone="live" />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="min-w-0 truncate text-sm font-medium">
                        {stream.title}
                      </span>
                      {stream.locked && (
                        <Lock
                          className="size-3 shrink-0 text-muted-foreground"
                          aria-label="Jelszót kér"
                        />
                      )}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {stream.host.name}
                      {/*//! A TANÁRI JELZÉS A SZERVERTŐL JÖN, nem a megosztó
                          //! állításából — ezért lehet kiírni (lásd
                          //! `requireTeacher` a jegyzék végpontjában). */}
                      {stream.teacher
                        ? " · tanár"
                        : stream.host.verified
                          ? " · belépett"
                          : " · vendég"}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground tabular-nums">
                    <Users className="size-3.5" aria-hidden />
                    {stream.viewers}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Footnotes />
    </div>
  );
}

//* ---------------------------------------------------------------------------
//* A KÉT NÉZET
//* ---------------------------------------------------------------------------
//! A MEGOSZTÓ ÉS A NÉZŐ UGYANAZT A HÁROM DOBOZT LÁTJA (kép, névsor, csevegés),
//! mert ugyanabban a szobában vannak. Ami eltér, az a fejléc és a gomb: az
//! egyik leállít, a másik kilép.

function HostView({
  host,
  me,
  onLeave,
}: {
  host: ReturnType<typeof useScreenHost>;
  me: Me;
  onLeave: () => void;
}) {
  const live = host.phase === "live";
  const viewers = host.roster.filter((p) => !p.host).length;

  return (
    <RoomShell
      title={host.title || "Képernyőmegosztás"}
      status={
        host.phase === "asking"
          ? "válaszd ki, mit osztasz meg…"
          : live
            ? `${viewers} néző`
            : "leállítva"
      }
      tone={live ? "live" : "wait"}
      action={
        <>
          {/*//! EZ A GOMB A TAKARÉKOSSÁG ÁRÁT FIZETI KI. A megosztó
              //! üresjáratban félpercenként néz a postájára (lásd az ütemet a
              //! `webrtc-host.ts`-ben) — ez egy 45 perces órán néhány száz
              //! kérést spórol, cserébe egy középen becsatlakozó diákra fél
              //! percet késhet. A tanár ezzel a gombbal nézeti meg azonnal.
              //*
              //! Csak akkor van itt, amikor van értelme: élő megosztásnál. */}
          {live && <LookNowButton onLook={host.lookNow} />}
          <Button variant="destructive" onClick={onLeave} className="gap-1.5">
            <MonitorOff className="size-4" aria-hidden />
            Leállítom
          </Button>
        </>
      }
      stage={
        <Stage
          screen={host.screen}
          label="A megosztott képernyőd"
          overlay={
            host.screen ? null : (
              <p className="text-sm text-white/70">
                {host.phase === "asking"
                  ? "Válaszd ki az ablakot vagy a képernyőt…"
                  : "Nincs kép."}
              </p>
            )
          }
        />
      }
      roster={host.roster}
      chat={host.chat}
      onSay={host.say}
      chatDisabled={!live}
      mePeer={me.peer}
      note={
        viewers === 0 && live
          ? "Még senki nem csatlakozott. A listában már látszik, amit megosztasz."
          : null
      }
    />
  );
}

function WatchView({
  viewer,
  me,
  onLeave,
}: {
  viewer: ReturnType<typeof useScreenViewer>;
  me: Me;
  onLeave: () => void;
}) {
  const { phase } = viewer;

  return (
    <RoomShell
      title={viewer.title || "Képernyőmegosztás"}
      status={
        phase === "live"
          ? "él"
          : phase === "connecting"
            ? "kapcsolódás…"
            : phase === "lost"
              ? "megszakadt, újrapróbálom…"
              : "vége"
      }
      tone={
        phase === "live" ? "live" : phase === "connecting" ? "wait" : "lost"
      }
      action={
        <Button variant="outline" onClick={onLeave} className="gap-1.5">
          <ArrowLeft className="size-4" aria-hidden />
          Vissza
        </Button>
      }
      stage={
        <Stage
          screen={viewer.screen}
          label="A megosztott képernyő"
          overlay={
            phase === "ended" ? (
              <p className="text-sm text-white/80">
                Vége — {viewer.ended ?? "a megosztó abbahagyta"}.
              </p>
            ) : viewer.screen ? null : phase === "lost" ? (
              <Unreachable />
            ) : (
              <Connecting />
            )
          }
        />
      }
      roster={viewer.roster}
      chat={viewer.chat}
      onSay={viewer.say}
      chatDisabled={phase !== "live"}
      mePeer={me.peer}
      note={null}
    />
  );
}

//! ═══════════════════════════════════════════════════════════════════════════
//! A SZÍNHÁZ — KÉP BALRA, BESZÉD JOBBRA, TELJES KÉPERNYŐN IS
//! ═══════════════════════════════════════════════════════════════════════════
//! A TELJES KÉPERNYŐ NEM A VIDEÓÉ, HANEM ENNEK A DOBOZNAK A JOGA. Ez az egész
//! elrendezés lényege: ha a `<video>` elemet tennénk teljes képernyőre (ahogy
//! a régi néző tette), a csevegés és a névsor ELTŰNNE a képernyőről — pont
//! akkor, amikor a diák a leginkább nézi a képet, és a leginkább kérdezne.
//! Ezért a teljes képernyő célpontja a kép ÉS az oldalsáv közös kerete; a
//! böngésző így a kettőt együtt nagyítja ki.
//!
//! UGYANAZ AZ ELRENDEZÉS KICSIBEN ÉS NAGYBAN. Nem két nézet van, hanem egy,
//! két méretben: a sor (kép | oldalsáv) a lapon és teljes képernyőn ugyanaz,
//! csak a magasságot mondja meg más. Egy külön „teljes képernyős mód" két
//! helyen élő elrendezést jelentene, ami előbb-utóbb szétcsúszik.
//!
//! AZ OLDALSÁV ELREJTHETŐ, ÉS EZ NEM DÍSZ. Egy kivetített kódrészletnél a
//! képnek kell a hely; egy megbeszélésnél a beszédnek. A döntés a nézőé, és
//! MEGMARAD a teljes képernyőre lépéskor is.
//!
//! TELEFONON EGYMÁS ALATT. 768 px alatt a sor oszloppá válik: a kép felül
//! marad (16:9), a beszéd alá kerül. Egy 375 px-es kijelzőn egy 20rem-es
//! oldalsáv nem oldalsáv, hanem a kép halála.
//! ═══════════════════════════════════════════════════════════════════════════

//! A FORGÁS ITT UGYANAZT JELENTI, MINT A LISTA FRISSÍTÉSÉNÉL, ÉS UGYANANNYI
//! IDEIG TART (`SPIN_MS`): „megnéztem". A keresés eredménye jellemzően nem
//! látszik azonnal (a néző csak pár másodperc múlva épül be a névsorba), ezért
//! a gombnak MAGÁNAK kell visszajeleznie — enélkül a tanár azt hinné, nem
//! történt semmi.
function LookNowButton({ onLook }: { onLook: () => void }) {
  const [spinning, setSpinning] = useState(false);
  //* Az óra a leszereléskor sem állíthat állapotot — a gomb eltűnhet a
  //* megosztás leállításával, miközben a `setTimeout` még függőben van.
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <Button
      variant="outline"
      className="gap-1.5"
      disabled={spinning}
      onClick={() => {
        onLook();
        setSpinning(true);
        timer.current = setTimeout(() => setSpinning(false), SPIN_MS);
      }}
      title="Megnézi, jelentkezett-e új néző"
    >
      <RefreshCw
        className={cn(
          "size-4",
          spinning && "animate-spin motion-reduce:animate-none",
        )}
      />
      Nézők keresése
    </Button>
  );
}

//! ─── A VÁRAKOZÁS OKÁT KI KELL MONDANI ─────────────────────────────────────
//! A megosztó gépe üresjáratban félpercenként néz a postájára (lásd az ütemet
//! a `webrtc-host.ts`-ben), ezért egy óra közepén becsatlakozó diák akár fél
//! percig is állhat a „Kapcsolódás…" felirat előtt. Ez nem hiba, de NÉMÁN
//! elviselhetetlen: pár másodperc után mindenki azt hiszi, elromlott.
//*
//! Ezért a magyarázat csak KÉSVE jelenik meg. A csatlakozások többsége két
//! másodperc alatt lezajlik (a megosztás indítása utáni első percben a
//! megosztó végig ébren van), és ott ez a mondat fölösleges ijesztgetés lenne.
const PATIENCE_MS = 2500;

function Connecting() {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), PATIENCE_MS);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="max-w-xs text-sm text-white/70">
      <p className="flex items-center justify-center gap-2">
        <Spinner className="size-4" />
        Kapcsolódás…
      </p>
      {slow && (
        <p className="mt-2 text-pretty text-xs text-white/50">
          A megosztó gépe fél percenként nézi meg, jelentkezett-e valaki. Ha
          sokáig tart, szólj neki — nála a „Nézők keresése" gomb azonnal megnéz.
        </p>
      )}
    </div>
  );
}

function RoomShell({
  title,
  status,
  tone,
  action,
  stage,
  roster,
  chat,
  onSay,
  chatDisabled,
  mePeer,
  note,
}: {
  title: string;
  status: string;
  tone: "live" | "wait" | "lost";
  action: React.ReactNode;
  stage: React.ReactNode;
  roster: React.ComponentProps<typeof RosterList>["roster"];
  chat: React.ComponentProps<typeof ChatPanel>["chat"];
  onSay: (text: string) => void;
  chatDisabled: boolean;
  mePeer: string;
  note: string | null;
}) {
  const theatreRef = useRef<HTMLDivElement>(null);
  const [canFullscreen, setCanFullscreen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [theatre, setTheatre] = useState(false);
  const [sideOpen, setSideOpen] = useState(true);
  const [rosterOpen, setRosterOpen] = useState(true);

  useEffect(() => {
    //* iPhone-on nincs elem-szintű teljes képernyő — ott a gomb meg sem jelenik.
    setCanFullscreen(document.fullscreenEnabled === true);
    //! A KILÉPÉST NEM CSAK MI KEZDEMÉNYEZHETJÜK: az Esc és a böngésző saját
    //! gombja is kilép, és arról CSAK ez az esemény szól. Enélkül a gomb
    //! ikonja hazudna.
    const onChange = () =>
      setFullscreen(
        theatreRef.current !== null &&
          document.fullscreenElement === theatreRef.current,
      );
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  //! ─── A NAGY NÉZET A LAPON BELÜL ───────────────────────────────────────────
  //! MIÉRT KELL A VALÓDI TELJES KÉPERNYŐ MELLÉ EGY MÁSIK IS. A böngésző teljes
  //! képernyője elveszi az egész gépet: eltűnik a fülsor, a címsor, az óra, és
  //! a kilépés is a böngésző szabálya szerint megy (Esc, és egy figyelmeztető
  //! buborék). Egy tanórán ez gyakran több, mint amit a diák akar — ő csak azt
  //! szeretné, hogy a kép NE egy doboz legyen a lap közepén.
  //!
  //! EZ A MÓD EZÉRT CSAK A LAPOT TÖLTI KI: `fixed inset-0`, a lap fölé
  //! kiterítve. A böngésző sávjai maradnak, a fülre lehet váltani, a kilépés a
  //! saját gombunk (és az Esc). Cserébe az elrendezés PONTOSAN ugyanaz, mint
  //! teljes képernyőn — egyetlen sor, két méretben.
  //!
  //! VALÓDI TELJES KÉPERNYŐ MELLETT KIKAPCSOLJUK. Egy `fixed` elem a teljes
  //! képernyős rétegben már nem a lap fölé kerül, hanem a semmibe: a kettő
  //! ugyanazt a helyet foglalná el, két különböző szabály szerint.
  const filling = theatre && !fullscreen;

  //! A HÁTTÉR NE GÖRDÜLJÖN A NAGY NÉZET ALATT. Egy telefonon a kiterített
  //! doboz fölött tett ujjmozdulat különben a MÖGÖTTE lévő lapot görgetné, és
  //! kilépéskor a diák máshol találná magát, mint ahol hagyta.
  useEffect(() => {
    if (!filling) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setTheatre(false);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKey);
    };
  }, [filling]);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    //! A VALÓDI TELJES KÉPERNYŐ FELÜLÍRJA A LAPON BELÜLIT. Ha a `fixed`
    //! kiterítés bent maradna, a teljes képernyős rétegben egy „a laphoz
    //! képest rögzített" doboz keletkezne, aminek ott nincs mihez igazodnia.
    else {
      setTheatre(false);
      void theatreRef.current?.requestFullscreen().catch(() => {});
    }
  };

  //* A két nagy nézet egy dolgot jelent az elrendezésnek: a sor a rendelkezésre
  //* álló MAGASSÁGOT töltse ki, ne a képarány szabja meg.
  const big = filling || fullscreen;

  const viewers = roster.length;

  return (
    <div className="space-y-4 pt-6">
      {/*//! A LAP FEJLÉCE TELJES KÉPERNYŐN NINCS SEHOL — ott a kerten kívül
          //! esik. Ezért a cím és az állapot a képre ültetve MEGISMÉTLŐDIK
          //! (lásd lent, a színpad fölötti sáv): teljes képernyőn is látszania
          //! kell, mit nézel és él-e még. */}
      <header className="flex items-center gap-3">
        <LinkDot tone={tone} />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-semibold">{title}</h1>
          <p
            className="truncate text-xs text-muted-foreground"
            aria-live="polite"
          >
            {status}
          </p>
        </div>
        {action}
      </header>

      <div
        ref={theatreRef}
        className={cn(
          "overflow-hidden rounded-xl border border-border bg-black",
          //* Teljes képernyőn a keret és a lekerekítés értelmetlen: a doboz
          //* MAGA a képernyő.
          fullscreen && "size-full rounded-none border-0",
          //* A lapot kitöltő nézet a lap FÖLÉ terül — a `z-50` a ragadó fejléc
          //* (`z-30`) fölé emeli, különben az átlógna rá.
          filling && "fixed inset-0 z-50 rounded-none border-0",
        )}
      >
        <div
          className={cn(
            "flex flex-col md:flex-row",
            big ? "h-full" : "md:h-[min(68vh,34rem)]",
          )}
        >
          {/* ── A kép ────────────────────────────────────────────────────── */}
          <div
            className={cn(
              "relative min-w-0 flex-1",
              //* A lapon a kép aránya szabja meg a magasságot telefonon; a
              //* sorban (md-től) a sor magassága szabja meg, és a `Stage`
              //* `object-contain`-je tartja az arányt.
              big ? "min-h-0" : "aspect-video md:aspect-auto",
            )}
          >
            {stage}

            {/*//! A CÍM A KÉPEN, DE NEM A KÉP ELŐTT. Halványuló sáv, nem doboz:
                //! teljes képernyőn ez az egyetlen hely, ahol a cím elfér, a
                //! kép felső sávja viszont ritkán hordoz tartalmat. */}
            <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center gap-2 bg-linear-to-b from-black/70 to-transparent px-3 pt-2 pb-8 text-white">
              <LinkDot tone={tone} />
              <span className="min-w-0 truncate text-xs font-medium">
                {title}
              </span>
              <span className="shrink-0 text-[11px] text-white/70">
                · {status}
              </span>
              <span className="ml-auto flex shrink-0 items-center gap-1 text-[11px] text-white/70 tabular-nums">
                <Users className="size-3" aria-hidden />
                {viewers}
              </span>
            </div>

            {/* ── A vezérlők ──────────────────────────────────────────────── */}
            <div className="absolute right-2 bottom-2 flex items-center gap-1 rounded-full bg-black/60 p-1 backdrop-blur-sm">
              <Button
                size="icon-sm"
                variant="ghost"
                onClick={() => setSideOpen((open) => !open)}
                aria-pressed={sideOpen}
                aria-label={
                  sideOpen ? "Csevegés elrejtése" : "Csevegés megjelenítése"
                }
                title={
                  sideOpen ? "Csevegés elrejtése" : "Csevegés megjelenítése"
                }
                className={DARK_CONTROL}
              >
                {sideOpen ? <PanelRightClose /> : <PanelRightOpen />}
              </Button>
              {/*//! TELJES KÉPERNYŐBEN NINCS ÉRTELME: ott a doboz már mindent
                  //! betölt, és a gomb két egymásra rakott „nagy nézetet"
                  //! kínálna, amiből csak az egyik látszana. */}
              {!fullscreen && (
                <Button
                  size="icon-sm"
                  variant="ghost"
                  onClick={() => setTheatre((open) => !open)}
                  aria-pressed={theatre}
                  aria-label={
                    theatre ? "Kilépés a nagy nézetből" : "Nagy nézet"
                  }
                  title={
                    theatre
                      ? "Kilépés a nagy nézetből (Esc)"
                      : "Nagy nézet — a lapot tölti ki, a böngésző marad"
                  }
                  className={DARK_CONTROL}
                >
                  {theatre ? <Shrink /> : <Expand />}
                </Button>
              )}
              {canFullscreen && (
                <Button
                  size="icon-sm"
                  variant="ghost"
                  onClick={toggleFullscreen}
                  aria-label={
                    fullscreen
                      ? "Kilépés a teljes képernyőből"
                      : "Teljes képernyő"
                  }
                  title={
                    fullscreen
                      ? "Kilépés a teljes képernyőből"
                      : "Teljes képernyő"
                  }
                  className={DARK_CONTROL}
                >
                  {fullscreen ? <Minimize2 /> : <Maximize2 />}
                </Button>
              )}
            </div>
          </div>

          {/* ── A beszéd ─────────────────────────────────────────────────── */}
          {sideOpen && (
            <aside
              //! A SAJÁT HÁTTERE AZÉRT KELL, mert teljes képernyőn nincs mögötte
              //! lap: a keret fekete, és egy háttér nélküli csevegés a képre
              //! folyna rá.
              className={cn(
                "flex min-h-0 shrink-0 flex-col border-border bg-background",
                "h-80 border-t md:h-auto md:w-80 md:border-t-0 md:border-l",
                //* Teljes képernyőn a szélesség ne egyen meg egy keskeny
                //* kijelzőt: legfeljebb a képernyő harmada.
                big && "md:w-[min(22rem,33vw)]",
              )}
            >
              <RosterList
                roster={roster}
                mePeer={mePeer}
                open={rosterOpen}
                onToggle={() => setRosterOpen((open) => !open)}
                className={cn(
                  "shrink-0 border-b border-border",
                  rosterOpen && "max-h-44",
                )}
              />
              <ChatPanel
                chat={chat}
                onSay={onSay}
                disabled={chatDisabled}
                mePeer={mePeer}
                className="min-h-0 flex-1"
              />
            </aside>
          )}
        </div>
      </div>

      {note && <p className="text-xs text-muted-foreground">{note}</p>}

      <Footnotes />
    </div>
  );
}

//* ---------------------------------------------------------------------------
//* KIMONDOTT DOLGOK
//* ---------------------------------------------------------------------------

//! A HIBA OKA ITT SEM TUDHATÓ — CSAK A LEHETSÉGES OKOK. A böngésző egy meg
//! nem született ICE-párról nem mondja meg, miért nem született meg. A
//! leggyakoribb ok az iskolai wifi kliensizolációja: ilyenkor a két gép egy
//! hálózaton van, de nem látják egymást. Ezen a lap nem tud segíteni, viszont
//! ki tudja mondani, hogy a diák ne a saját készülékét hibáztassa.
function Unreachable() {
  return (
    <div className="max-w-sm text-sm text-white/80">
      <p className="flex items-center justify-center gap-2 font-semibold text-white">
        <WifiOff className="size-4 shrink-0" aria-hidden />
        Nem áll össze a kapcsolat
      </p>
      <ul className="mt-3 list-disc space-y-1.5 pl-5 text-left text-pretty">
        <li>Ugyanazon a wifin vagytok, mint a megosztó?</li>
        <li>
          Az iskolai wifi néha elszigeteli a készülékeket egymástól — ilyenkor a
          közvetlen kapcsolat nem jöhet létre.
        </li>
        <li>
          {hasWideFallback()
            ? "Ha máshonnan nézed, pár másodperc után újrapróbálom egy tágabb úton."
            : "A kapcsolat csak a helyi hálózaton belül épülhet fel."}
        </li>
      </ul>
      <p className="mt-3 text-xs text-white/50">
        A háttérben tovább próbálkozom.
      </p>
    </div>
  );
}

function Notice({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-muted/40 p-4">
      <p className="flex items-center gap-2 text-sm font-semibold [&_svg]:size-4">
        {icon}
        {title}
      </p>
      <p className="mt-1 text-sm text-pretty text-muted-foreground">
        {children}
      </p>
    </div>
  );
}

//! AMI A LAP ALJÁN ÁLL, AZ NEM APRÓBETŰ. Egy képernyőmegosztásnál a diáknak
//! joga van tudni, hova megy a kép és ki látja a csevegést — és ez pont az a
//! két dolog, amit egy ilyen felület a leggyakrabban elhallgat.
function Footnotes() {
  return (
    <p className="border-t border-border/60 pt-4 text-[11px] text-pretty text-muted-foreground">
      A kép és a csevegés közvetlenül a résztvevők gépei között megy,
      titkosítva; a szerverünk csak a kapcsolat felépítéséhez ad jelzést, és
      semmit nem tárol belőle. Hang nem megy át, felvétel nem készül. A
      csevegést a megosztó gépe továbbítja, tehát ő mindent lát. A név melletti
      pipa azt jelenti, hogy a nevet a belépett fiók igazolja; a többi név
      önmegadott becenév.
    </p>
  );
}
