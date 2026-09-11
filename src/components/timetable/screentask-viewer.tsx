"use client";

import { ExternalLink, Maximize2, Minimize2, WifiOff, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import {
  formatScreenAddress,
  isIpv4Literal,
  type ScreenAddress,
  screenTaskFrameUrl,
  screenTaskPageUrl,
} from "@/lib/lesson-extras";
import { cn } from "@/lib/utils";

//! ═══════════════════════════════════════════════════════════════════════════
//! SCREENTASK-NÉZŐ — A TANÁR KÉPERNYŐJE A HELYI HÁLÓZATRÓL
//! ═══════════════════════════════════════════════════════════════════════════
//! A ScreenTask a tanári gépen egy kis webszervert futtat, ami egyetlen,
//! folyamatosan felülírt képet ad ki (`/ScreenTask.jpg`). A saját nézője is
//! csak ennyit csinál: újra és újra lekéri, véletlen paraméterrel. Mi ugyanezt
//! tesszük, közvetlenül a böngészőből — a szerverünk NEM látja a képet, és nem
//! is láthatná: a tanári gép a terem hálózatán van, nem az interneten.
//!
//! A `https` → `http` ÁTLÉPÉS A BÖNGÉSZŐN MÚLIK. A lapunk titkosított, a
//! ScreenTask nem. Ezt a nézőt ezért csak ott nyitjuk meg, ahol a böngésző
//! biztosan beengedi a képet (lásd `canViewInPage`); máshol a ScreenTask SAJÁT
//! oldala nyílik új lapon.
//!
//! KÉPKOCKÁNKÉNT ÚJ KÉPELEM, ÉS CSAK A KÉSZ KERÜL KI. Ha a látható kép `src`-jét
//! cserélnénk, minden frissítés egy üres villanással járna, amíg a következő
//! meg nem jön. Így a régi kép addig marad, amíg az új teljesen be nem töltött.
//! ═══════════════════════════════════════════════════════════════════════════

//* A ScreenTask saját nézőjének alapértelmezése.
const FRAME_INTERVAL_MS = 500;
//! Egy beragadt kérés (a gép eltűnt a hálózatról) se `load`-ot, se `error`-t
//! nem ad — e nélkül a hurok csendben megállna.
const FRAME_TIMEOUT_MS = 8000;
const LOST_AFTER_FAILURES = 3;
const MAX_RETRY_MS = 5000;
//* Háttérbe tett lapon nem kérünk képet — csak figyeljük, mikor jön vissza.
const HIDDEN_POLL_MS = 1000;

type LinkState = "connecting" | "live" | "lost";

//! ─── BEÁGYAZHATÓ-E EGYÁLTALÁN ───────────────────────────────────────────────
//! ELŐRE KELL ELDÖNTENI, NEM PRÓBÁLGATÁSSAL. Egy `https`-es lapon a böngésző a
//! `http://…` képet sokszor nem hibaként adja vissza, hanem csendben
//! `https://`-re írja át (Safari, Firefox, régebbi Chrome) — a ScreenTask
//! viszont csak `http`-t tud, így a néző a végtelenségig „kapcsolódna".
//!
//! Beágyazni csak két esetben lehet:
//!   • a lap maga is `http` (pl. helyi telepítés) — nincs vegyes tartalom;
//!   • a böngésző ismeri a helyi hálózati hozzáférést (Chrome LNA — a jele a
//!     `Request.targetAddressSpace`), ÉS a cím nyers helyi IP: a böngésző csak
//!     így tudja MÁR A KÉRÉS ELŐTT, hogy a helyi hálózatra megy, és csak ekkor
//!     menti fel a vegyes tartalom szabálya alól. Egy `.local` névnél nem
//!     kockáztatunk — a névre vonatkozó https-átírás megelőzheti.
//!
//! Minden más esetben a ScreenTask saját nézője nyílik, új lapon. Az önálló
//! `http` oldal, nem beágyazott tartalom — a vegyes tartalom szabálya rá nem
//! vonatkozik, tehát minden böngészőben működik.
export function canViewInPage(host: string): boolean {
  if (typeof window === "undefined") return false;
  if (window.location.protocol === "http:") return true;
  return (
    isIpv4Literal(host) &&
    typeof Request !== "undefined" &&
    "targetAddressSpace" in Request.prototype
  );
}

const DARK_BUTTON =
  "text-white/80 hover:bg-white/10 hover:text-white dark:hover:bg-white/10";

export function ScreenTaskViewer({
  screen,
  title,
  onClose,
}: {
  screen: ScreenAddress;
  title: string;
  onClose: () => void;
}) {
  const { host, port } = screen;
  const stageRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const [link, setLink] = useState<LinkState>("connecting");
  const [hasFrame, setHasFrame] = useState(false);
  const [canFullscreen, setCanFullscreen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    //* iPhone-on nincs elem-szintű teljes képernyő — ott a gomb meg sem jelenik.
    setCanFullscreen(document.fullscreenEnabled === true);
    const onChange = () =>
      setFullscreen(
        stageRef.current !== null &&
          document.fullscreenElement === stageRef.current,
      );
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let watchdog: ReturnType<typeof setTimeout> | undefined;
    let pending: HTMLImageElement | null = null;
    let failures = 0;

    const abandon = (img: HTMLImageElement) => {
      img.onload = null;
      img.onerror = null;
      img.src = "";
    };

    const schedule = (ms: number) => {
      timer = setTimeout(tick, ms);
    };

    const fail = () => {
      failures += 1;
      if (failures >= LOST_AFTER_FAILURES) setLink("lost");
      schedule(Math.min(MAX_RETRY_MS, 1000 * failures));
    };

    function tick() {
      if (disposed) return;
      if (document.visibilityState === "hidden") {
        schedule(HIDDEN_POLL_MS);
        return;
      }

      const img = new Image();
      pending = img;
      img.alt = "A tanár megosztott képernyője";
      img.draggable = false;
      img.className = "size-full select-none object-contain";

      img.onload = () => {
        clearTimeout(watchdog);
        if (disposed || pending !== img) return;
        pending = null;
        failures = 0;
        frameRef.current?.replaceChildren(img);
        setHasFrame(true);
        setLink("live");
        schedule(FRAME_INTERVAL_MS);
      };
      img.onerror = () => {
        clearTimeout(watchdog);
        if (disposed || pending !== img) return;
        pending = null;
        fail();
      };
      watchdog = setTimeout(() => {
        if (disposed || pending !== img) return;
        pending = null;
        abandon(img);
        fail();
      }, FRAME_TIMEOUT_MS);

      img.src = screenTaskFrameUrl({ host, port }, `${Date.now()}`);
    }

    tick();
    return () => {
      disposed = true;
      clearTimeout(timer);
      clearTimeout(watchdog);
      if (pending) abandon(pending);
    };
  }, [host, port]);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void stageRef.current?.requestFullscreen().catch(() => {});
    }
  };

  const statusText =
    link === "live"
      ? "élő"
      : link === "connecting"
        ? "kapcsolódás…"
        : hasFrame
          ? "megszakadt, újrapróbálom…"
          : "nem érhető el";

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="top-0 left-0 flex h-dvh w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-none bg-black p-0 text-white ring-0 sm:max-w-none"
      >
        <div className="flex shrink-0 items-center gap-3 border-b border-white/10 pt-[max(0.5rem,env(safe-area-inset-top))] pr-[max(0.75rem,env(safe-area-inset-right))] pb-2 pl-[max(0.75rem,env(safe-area-inset-left))]">
          <span
            aria-hidden
            className={cn(
              "size-2 shrink-0 rounded-full",
              link === "live" && "bg-emerald-400",
              link === "lost" && "bg-red-400",
              link === "connecting" && "animate-pulse bg-white/50",
            )}
          />
          <div className="min-w-0 flex-1">
            <DialogTitle className="truncate text-sm font-semibold text-white">
              {title}
            </DialogTitle>
            <DialogDescription className="truncate text-[11px] text-white/60">
              <span className="font-mono">{formatScreenAddress(screen)}</span>
              {" · "}
              <span aria-live="polite">{statusText}</span>
            </DialogDescription>
          </div>
          {canFullscreen && hasFrame && (
            <Button
              size="icon-sm"
              variant="ghost"
              className={DARK_BUTTON}
              aria-label={
                fullscreen ? "Kilépés a teljes képernyőből" : "Teljes képernyő"
              }
              onClick={toggleFullscreen}
            >
              {fullscreen ? <Minimize2 /> : <Maximize2 />}
            </Button>
          )}
          <Button
            asChild
            size="icon-sm"
            variant="ghost"
            className={DARK_BUTTON}
          >
            <a
              href={screenTaskPageUrl(screen)}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Megnyitás a ScreenTask saját oldalán"
              title="Megnyitás a ScreenTask saját oldalán"
            >
              <ExternalLink />
            </a>
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            className={DARK_BUTTON}
            aria-label="Bezárás"
            onClick={onClose}
          >
            <X />
          </Button>
        </div>

        <div
          ref={stageRef}
          className="relative flex min-h-0 flex-1 items-center justify-center bg-black"
        >
          {/*//! A képkockákat a hurok teszi ide közvetlenül (`replaceChildren`) —
              //! ennek a elemnek szándékosan nincs React-gyereke. */}
          <div
            ref={frameRef}
            className="flex size-full items-center justify-center"
          />

          {!hasFrame &&
            (link === "lost" ? (
              <Unreachable screen={screen} />
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-sm text-white/70">
                <Spinner className="size-5" />
                Kapcsolódás a tanári géphez…
              </div>
            ))}

          {hasFrame && link === "lost" && (
            <output className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/80 px-3 py-1.5 text-xs text-white ring-1 ring-white/15">
              Megszakadt a kapcsolat — újrapróbálom…
            </output>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

//! A HIBA OKA ITT NEM TUDHATÓ, CSAK A LEHETSÉGES OKOK. A böngésző egy elbukott
//! képnél nem mondja meg, miért bukott el (rossz hálózat, leállított szerver,
//! megtagadott engedély, jelszavas megosztás) — ezért mind a négyet kimondjuk,
//! a leggyakoribbal kezdve, és mindegyik mellé azt, mit tehet a diák.
function Unreachable({ screen }: { screen: ScreenAddress }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center overflow-y-auto p-6">
      <div className="max-w-md text-sm text-white/80">
        <p className="flex items-center gap-2 text-base font-semibold text-white">
          <WifiOff className="size-4 shrink-0" aria-hidden />
          Nem érem el a tanár képernyőjét
        </p>
        <ul className="mt-3 list-disc space-y-1.5 pl-5 text-pretty">
          <li>Ugyanarra a wifire csatlakozol, mint a tanári gép?</li>
          <li>
            Fut a ScreenTask, és elindult a megosztás? A címnek egyeznie kell:{" "}
            <span className="font-mono text-white">
              {formatScreenAddress(screen)}
            </span>
          </li>
          <li>
            Ha a böngésző a helyi hálózat eléréséről kérdez, engedélyezd. Egyes
            böngészők (Safari, Firefox) ezt a lapról nem engedik — ott a
            ScreenTask saját oldala működik.
          </li>
          <li>
            Jelszavas megosztás csak a ScreenTask saját oldalán nyílik meg.
          </li>
        </ul>
        <Button asChild className="mt-4 gap-1.5 rounded-full px-4">
          <a
            href={screenTaskPageUrl(screen)}
            target="_blank"
            rel="noopener noreferrer"
          >
            Megnyitás a ScreenTask oldalán
            <ExternalLink className="size-3.5" aria-hidden />
          </a>
        </Button>
        <p className="mt-2 text-xs text-white/50">
          Addig a háttérben tovább próbálkozom.
        </p>
      </div>
    </div>
  );
}
