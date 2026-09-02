"use client";

import { Share, SquarePlus, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { markA2HSSeen, shouldOfferA2HS } from "@/lib/a2hs";

//* ---------------------------------------------------------------------------
//* „TEDD KI A KEZDŐKÉPERNYŐRE" — EGYSZER, iOS-EN
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
//! A LÉPÉSEK NEM MONDJÁK MEG, HOL A GOMB. A Safari eszköztára a beállítástól
//! függően a képernyő alján VAGY a tetején áll — egy „lent" a felhasználók
//! egy részének egyszerűen hazugság lenne. A gombot a saját IKONJÁVAL
//! azonosítjuk: az mindkét elrendezésben ugyanaz.

//* A megjelenés késleltetése: a lap első képkockája az órarendé. A tipp akkor
//* jön, amikor a diák már megkapta, amiért jött.
const DELAY_MS = 2500;

export function AddToHomeScreen() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!shouldOfferA2HS()) return;

    let timer: number | undefined;

    //! A HÁTTÉRBEN NYITOTT LAPNAK NEM SZÓLUNK. Az „egyszer" csak akkor
    //! tisztességes, ha az az egy alkalom LÁTHATÓ is volt: egy másik fülön
    //! lejáró időzítő elhasználná a jelölőt anélkül, hogy bárki olvasta volna.
    const arm = () => {
      if (document.visibilityState !== "visible") return;
      document.removeEventListener("visibilitychange", arm);
      timer = window.setTimeout(() => {
        setOpen(true);
        markA2HSSeen();
      }, DELAY_MS);
    };

    document.addEventListener("visibilitychange", arm);
    arm();

    return () => {
      document.removeEventListener("visibilitychange", arm);
      window.clearTimeout(timer);
    };
  }, []);

  if (!open) return null;

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
          onClick={() => setOpen(false)}
        >
          <X />
        </Button>

        <h2
          id="a2hs-title"
          className="pr-10 text-base font-semibold text-foreground"
        >
          Tedd ki a kezdőképernyőre
        </h2>
        <p id="a2hs-body" className="mt-1 text-pretty text-muted-strong">
          Az Órarend így teljes képernyőn indul, böngészősáv nélkül — és a
          legutóbb betöltött hetet térerő nélkül is megmutatja.
        </p>

        {/*//* A két lépés a Safari saját ikonjaival: a menüpontot a felhasználó
            //* a képen ismeri fel, nem a szövegben. */}
        <ol className="mt-3 space-y-2 text-muted-strong">
          <li className="flex items-center gap-2.5">
            <Share className="size-4 shrink-0 text-primary" aria-hidden />
            <span>
              Koppints a{" "}
              <strong className="font-medium text-foreground">Megosztás</strong>{" "}
              gombra a Safari eszköztárán.
            </span>
          </li>
          <li className="flex items-center gap-2.5">
            <SquarePlus className="size-4 shrink-0 text-primary" aria-hidden />
            <span>
              Válaszd a{" "}
              <strong className="font-medium text-foreground">
                Főképernyőhöz adás
              </strong>{" "}
              pontot.
            </span>
          </li>
        </ol>
      </div>
    </div>
  );
}
