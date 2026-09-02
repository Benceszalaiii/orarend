"use client";

import { Download, Share, SquarePlus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  markA2HSSeen,
  shouldOfferAndroidA2HS,
  shouldOfferIosA2HS,
} from "@/lib/a2hs";

//* ---------------------------------------------------------------------------
//* „TEDD KI A KEZDŐKÉPERNYŐRE" — EGYSZER, iOS-EN ÉS ANDROIDON
//* ---------------------------------------------------------------------------
//! EGYSZER SZÓLUNK, AZTÁN SOHA. A tipp értéke az első alkalommal a legnagyobb,
//! és minden ismétléssel csak fogy; egy szünetben megnyitott órarend elé
//! másodszor odaállni már kártétel. A jelölőt ezért a MEGJELENÉSKOR írjuk ki,
//! nem az elutasításkor: aki elgörget mellette, az is látta — és a látott
//! ajánlatot nem tesszük elé újra.
//!
//! NEM MODÁLIS. A diák azért nyitotta meg a lapot, hogy megnézze, mi jön most.
//! Egy párbeszédablak ezt a választ takarná el, és a telepítés kedvéért
//! elhalasztaná — pedig a telepítés A MI érdekünk, nem az övé. Ezért alul ül,
//! a tartalom mellett, és bezárható.
//!
//! UGYANAZ A KÁRTYA, KÉT KÜLÖNBÖZŐ TARTALOMMAL. A keret, a hely és a bezárás
//! közös; ami eltér, az a MUNKA, amit a felhasználótól kérünk:
//!
//! * iOS-en LÉPÉSEK. Nincs API, amivel elindíthatnánk a telepítést — csak
//!   elmondani tudjuk, hol a menüpont. A lépések NEM mondják meg, hol a gomb:
//!   a Safari eszköztára a beállítástól függően a képernyő alján VAGY a tetején
//!   áll, egy „lent" a felhasználók egy részének egyszerűen hazugság lenne. A
//!   gombot a saját IKONJÁVAL azonosítjuk: az mindkét elrendezésben ugyanaz.
//! * Androidon EGY GOMB. A `beforeinstallprompt` eseménnyel a böngésző a
//!   kezünkbe adja a telepítést, úgyhogy nem magyarázunk semmit: a felhasználó
//!   koppint egyet, és a rendszer saját párbeszéde jön. Lépéseket leírni ott,
//!   ahol egy gomb elvégzi a munkát, csak munka a felhasználónak.

//* A Chrome telepítési ajánlata. A típus nincs benne a szabványos DOM
//* leírásokban (a Safari és a Firefox nem küldi), ezért írjuk le mi.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

type Variant = "ios" | "android";

//* A megjelenés késleltetése: a lap első képkockája az órarendé. A tipp akkor
//* jön, amikor a diák már megkapta, amiért jött.
const DELAY_MS = 2500;

export function AddToHomeScreen() {
  const [variant, setVariant] = useState<Variant | null>(null);
  //* Az esemény akkor is a miénk marad, amikor a kártya már látszik — a
  //* telepítést a gomb róla indítja, jóval a megérkezése után.
  const installEvent = useRef<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    let timer: number | undefined;
    const cleanups: Array<() => void> = [];
    let revealed = false;

    //! A HÁTTÉRBEN NYITOTT LAPNAK NEM SZÓLUNK. Az „egyszer" csak akkor
    //! tisztességes, ha az az egy alkalom LÁTHATÓ is volt: egy másik fülön
    //! lejáró időzítő elhasználná a jelölőt anélkül, hogy bárki olvasta volna.
    const reveal = (next: Variant) => {
      if (revealed) return;
      revealed = true;

      const arm = () => {
        if (document.visibilityState !== "visible") return;
        document.removeEventListener("visibilitychange", arm);
        timer = window.setTimeout(() => {
          setVariant(next);
          markA2HSSeen();
        }, DELAY_MS);
      };

      document.addEventListener("visibilitychange", arm);
      cleanups.push(() =>
        document.removeEventListener("visibilitychange", arm),
      );
      arm();
    };

    if (shouldOfferIosA2HS()) {
      reveal("ios");
    } else if (shouldOfferAndroidA2HS()) {
      //! A `preventDefault` NEM ELNYELI AZ AJÁNLATOT, ÁTVESZI. Nélküle a
      //! Chrome a saját sávját mutatná, és a miénk mellé kerülne egy második,
      //! ugyanarról szóló kérdés; vele az ajánlat egyetlen helyre költözik — a
      //! kártyánk gombjára. Ezért kötelező, hogy a gomb tényleg működjön: ha
      //! eldobnánk az eseményt, a telepítés ELÉRHETETLENNÉ válna.
      const onBeforeInstallPrompt = (event: Event) => {
        event.preventDefault();
        installEvent.current = event as BeforeInstallPromptEvent;
        reveal("android");
      };
      window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      cleanups.push(() =>
        window.removeEventListener(
          "beforeinstallprompt",
          onBeforeInstallPrompt,
        ),
      );

      //! HA KÖZBEN TELEPÍTETTÉK, ELTŰNÜNK. A telepítés a böngésző saját
      //! menüjéből is elindítható, és a `display-mode` a MÁR FUTÓ böngészőlapon
      //! nem vált át — a kártya ott maradna, és olyat kérne, ami épp megtörtént.
      const onInstalled = () => {
        installEvent.current = null;
        setVariant(null);
        markA2HSSeen();
      };
      window.addEventListener("appinstalled", onInstalled);
      cleanups.push(() =>
        window.removeEventListener("appinstalled", onInstalled),
      );
    }

    return () => {
      for (const off of cleanups) off();
      window.clearTimeout(timer);
    };
  }, []);

  if (!variant) return null;

  const install = () => {
    const event = installEvent.current;
    installEvent.current = null;
    //* Előbb a saját kártyát tesszük el: a rendszer párbeszéde elé nem kell egy
    //* második, ugyanarról szóló felület. A választ már nem kérdezzük vissza —
    //* elutasítás után sem szólunk újra (ezt a `userChoice` meg tudná mondani,
    //* de nem lenne mit kezdenünk vele).
    setVariant(null);
    void event?.prompt();
  };

  return (
    <div
      //* A biztonságos sáv alul a „home indicator" helye — a kártya fölötte ül.
      className="fixed inset-x-0 bottom-0 z-50 flex justify-center px-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] print:hidden"
    >
      <div
        role="dialog"
        aria-labelledby="a2hs-title"
        aria-describedby="a2hs-body"
        className="relative w-full max-w-sm rounded-2xl bg-popover p-4 text-sm text-popover-foreground shadow-lg ring-1 ring-foreground/10 animate-in fade-in-0 slide-in-from-bottom-4 duration-300 motion-reduce:animate-none"
      >
        <Button
          variant="ghost"
          size="icon-sm"
          className="absolute top-2 right-2 touch-target text-muted-foreground"
          aria-label="Bezárás"
          onClick={() => setVariant(null)}
        >
          <X />
        </Button>

        <h2
          id="a2hs-title"
          className="pr-10 text-base font-semibold text-foreground"
        >
          {variant === "ios"
            ? "Tedd ki a kezdőképernyőre"
            : "Telepítsd az Órarendet"}
        </h2>
        <p id="a2hs-body" className="mt-1 text-pretty text-muted-strong">
          Az Órarend így teljes képernyőn indul, böngészősáv nélkül — és a
          legutóbb betöltött hetet térerő nélkül is megmutatja.
        </p>

        {variant === "ios" ? (
          /*//* A két lépés a Safari saját ikonjaival: a menüpontot a felhasználó
              //* a képen ismeri fel, nem a szövegben. */
          <ol className="mt-3 space-y-2 text-muted-strong">
            <li className="flex items-center gap-2.5">
              <Share className="size-4 shrink-0 text-primary" aria-hidden />
              <span>
                Koppints a{" "}
                <strong className="font-medium text-foreground">
                  Megosztás
                </strong>{" "}
                gombra a Safari eszköztárán.
              </span>
            </li>
            <li className="flex items-center gap-2.5">
              <SquarePlus
                className="size-4 shrink-0 text-primary"
                aria-hidden
              />
              <span>
                Válaszd a{" "}
                <strong className="font-medium text-foreground">
                  Főképernyőhöz adás
                </strong>{" "}
                pontot.
              </span>
            </li>
          </ol>
        ) : (
          <Button className="mt-3 w-full" onClick={install}>
            <Download aria-hidden />
            Telepítés
          </Button>
        )}
      </div>
    </div>
  );
}
