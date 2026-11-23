"use client";

import { ExternalLink, WifiOff } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  formatScreenAddress,
  isIpv4Literal,
  type ScreenAddress,
  screenTaskFrameUrl,
  screenTaskPageUrl,
} from "@/lib/lesson-extras";

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

export type LinkState = "connecting" | "live" | "lost";

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

//! ─── A KÉPKOCKA-HUROK ──────────────────────────────────────────────────────
//! A `/kivetites/[terem]` lap hurka (az órarend részletlapja is oda visz). A képelemeket a hurok közvetlenül a `frameRef` elembe
//! teszi (`replaceChildren`) — annak az elemnek ne legyen React-gyereke.
export function useScreenTaskFeed(
  screen: ScreenAddress | null,
  frameRef: React.RefObject<HTMLDivElement | null>,
): { link: LinkState; hasFrame: boolean } {
  const host = screen?.host ?? null;
  const port = screen?.port ?? null;
  const [link, setLink] = useState<LinkState>("connecting");
  const [hasFrame, setHasFrame] = useState(false);

  useEffect(() => {
    setLink("connecting");
    setHasFrame(false);
    frameRef.current?.replaceChildren();
    if (host === null || port === null) return;
    const address: ScreenAddress = { host, port };
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

      img.src = screenTaskFrameUrl(address, `${Date.now()}`);
    }

    tick();
    return () => {
      disposed = true;
      clearTimeout(timer);
      clearTimeout(watchdog);
      if (pending) abandon(pending);
    };
  }, [host, port, frameRef]);

  return { link, hasFrame };
}

//* Rövid, felolvasható állapot a fejlécbe.
export function feedStatusText(link: LinkState, hasFrame: boolean): string {
  return link === "live"
    ? "élő"
    : link === "connecting"
      ? "kapcsolódás…"
      : hasFrame
        ? "megszakadt, újracsatlakozás…"
        : "nem érhető el";
}

//! A HIBA OKA ITT NEM TUDHATÓ, CSAK A LEHETSÉGES OKOK. A böngésző egy elbukott
//! képnél nem mondja meg, miért bukott el (rossz hálózat, leállított szerver,
//! megtagadott engedély, jelszavas megosztás) — ezért mind a négyet kimondjuk,
//! a leggyakoribbal kezdve, és mindegyik mellé azt, mit tehet a diák.
//!
//! A LAP NEM BESZÉL EGYES SZÁM ELSŐ SZEMÉLYBEN. Nem „nem érem el", hanem „nem
//! érhető el": a tény az oldalé, a teendő a diáké (felszólító mód, tegezve).
export function Unreachable({ screen }: { screen: ScreenAddress }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center overflow-y-auto p-6">
      <div className="max-w-md text-sm text-white/80">
        <p className="flex items-center gap-2 text-base font-semibold text-white">
          <WifiOff className="size-4 shrink-0" aria-hidden />A tanár képernyője
          nem érhető el
        </p>
        <ul className="mt-3 list-disc space-y-1.5 pl-5 text-pretty">
          <li>
            Ellenőrizd, hogy ugyanarra a wifire csatlakozol-e, mint a tanári
            gép.
          </li>
          <li>
            Ellenőrizd, hogy fut-e a ScreenTask, és elindult-e a megosztás. A
            tanári gépen ennek a címnek kell megjelennie:{" "}
            <span className="font-mono text-white">
              {formatScreenAddress(screen)}
            </span>
          </li>
          <li>
            Ha a böngésző engedélyt kér a helyi hálózat eléréséhez, engedélyezd.
            Safariban és Firefoxban ez nem lehetséges, ott a ScreenTask saját
            oldalát használd.
          </li>
          <li>
            Jelszóval védett megosztás csak a ScreenTask saját oldalán nyílik
            meg.
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
          Az oldal közben tovább próbálkozik, és magától megjeleníti a képet,
          amint elérhető.
        </p>
      </div>
    </div>
  );
}
