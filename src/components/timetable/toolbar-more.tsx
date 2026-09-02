"use client";

import { SlidersHorizontal } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

//* ---------------------------------------------------------------------------
//* A beállítás-csoport — egy sor ikon, telefonon egy gomb mögött
//* ---------------------------------------------------------------------------
//! NYOLC VEZÉRLŐ NEM FÉR EL KÉT SORBAN. Egy 375 px-es telefonon a sáv belseje
//! 351 px, egy durva mutatóeszközön minden gomb legalább 44 px (lásd
//! `.touch-target`) — nyolc gomb önmagában 352 px, gombköz nélkül. Az
//! osztályválasztó (104) és a nézetváltó (136) fixen elvisz 240-et, a hetelő és
//! a hét címkéje a másik sort tölti ki: marad KÉT ikonnyi hely, a ritkán nyúlt
//! vezérlőkből viszont NÉGY van. Ezért nem az a kérdés, hogy összevonjuk-e
//! őket, hanem hogy mind a négyet egy helyre tesszük-e, vagy kettőt kiemelünk
//! és kettőt eldugunk. Egy hely, egységesen: a „melyiket miért éppen azt"
//! kérdésre nincs jó válasz.
//*
//* Amit a telefonos alak cserébe MEGNYER: feliratot. Eddig egy ⓘ, egy
//* összevonás-jel, egy aktatáska és egy harang állt a sávban, kizárólag
//* `aria-label`-lel — a diák látta a négy ikont, és nem tudta, melyik mit nyit.
//* A panelben mind a négy ki van írva.
//
//! A PANEL NEM RADIX-RÉTEG, ÉS EZ SZÁNDÉKOS. A benne álló négy vezérlő MIND
//! saját buborékot vagy párbeszédet nyit; ha a panel maga is portálozott,
//! elbocsátható réteg lenne, a belőle nyíló buborék kívülre esne, a panel
//! becsukódna, és vele a még meg sem nyílt tartalom szerelne le a fáról. Egy
//! sima, a saját fájában maradó doboz ezt a versenyt meg sem rendezi: a
//! gyerekek végig a fán vannak, a saját rétegkezelésük érintetlen.
export function ToolbarMore({
  /** A szűrések száma — a becsukott gombon is látszania kell, mert a rács
   *  tartalmát változtatja meg (lásd lentebb). */
  badge = 0,
  className,
  children,
}: {
  badge?: number;
  className?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      //! AZ ESC A LEGFELSŐ RÉTEGET CSUKJA BE, NEM MINDET. A panelből nyílt
      //! párbeszéd vagy buborék fölötte van; ha ugyanaz a leütés a panelt is
      //! bezárná, egy „mégsem" a beállítás-listát is elvinné, és a diák a
      //! rácson találná magát. Amíg van fölötte réteg, ez a kezelő hallgat —
      //! a következő Esc már a panelé.
      if (
        document.querySelector(
          "[role=dialog],[role=alertdialog],[data-slot=popover-content]",
        )
      ) {
        return;
      }
      setOpen(false);
    };
    const onDown = (event: PointerEvent) => {
      const target = event.target as Element | null;
      if (!target) return;
      if (boxRef.current?.contains(target)) return;
      //! A PANELBŐL NYÍLÓ FELÜLET NINCS „KÍVÜL". A jelmagyarázat és a szűrések
      //! buborékja, a duális és az értesítés párbeszéde portálba kerül, vagyis
      //! a DOM-ban nem a panel gyereke — a rájuk eső koppintás mégis a panel
      //! HASZNÁLATA, nem az elhagyása.
      if (
        target.closest(
          "[data-slot=popover-content],[data-radix-popper-content-wrapper],[role=dialog],[role=alertdialog]",
        )
      ) {
        return;
      }
      setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown, true);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown, true);
    };
  }, [open]);

  return (
    //! A PANEL A SÁVHOZ IGAZODIK, NEM A GOMBHOZ. A „…" gomb 44 px széles és a
    //! sáv jobb szélétől ~250 px-re ül; egy hozzá kötött, jobbra zárt 240 px-es
    //! panel bal széle -129 px-nél kezdődne — a képernyőn kívül (mérve). Ezért
    //! a doboz telefonon NEM pozicionált: a panel igazodási pontja a fejlécsáv
    //! (annak `relative`-ja), így a jobb széle a sáv jobb széléhez tapad.
    //! `sm`-től nincs mihez igazodni — ott a doboz sima ikonsor.
    <div
      ref={boxRef}
      className={cn("flex items-center sm:relative", className)}
    >
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={badge > 0 ? `Beállítások (${badge} szűrés)` : "Beállítások"}
        title="Beállítások"
        onClick={() => setOpen((value) => !value)}
        className={cn(
          "relative size-9 shrink-0 touch-target rounded-full sm:hidden",
          open
            ? "bg-muted text-foreground"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        <SlidersHorizontal className="size-4" aria-hidden />
        {/*//! A SZŰRÉS SZÁMA NEM MEHET A MENÜ MÖGÉ. Az összevonás órákat TÜNTET
            //! EL a rácsból; ha az egyetlen nyoma egy becsukott menüben van, a
            //! diák egy hiányos órarendet lát, és nincs miből rájönnie, hogy ő
            //! maga szűrte. A szám ezért a becsukott gombon is ott áll. */}
        {badge > 0 && (
          <span
            aria-hidden
            className="absolute top-0 right-0 inline-flex h-[17px] min-w-[17px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold tabular-nums text-primary-foreground ring-2 ring-card"
          >
            {badge}
          </span>
        )}
      </Button>

      <div
        id={panelId}
        //* `sm`-től ez már nem panel, hanem az eddigi ikonsor — ugyanaz a doboz,
        //* más alak. Szerep NEM tartozik hozzá: a gomb `aria-expanded` +
        //* `aria-controls` párosa már megmondja, mit nyit ki — egy ráadás
        //* csoportszerep `sm`-től, ahol nincs is mit kinyitni, csak egy üres
        //* réteget tenne a képernyőolvasó útjába.
        className={cn(
          "tt-more flex items-center gap-1.5 sm:gap-2",
          "max-sm:absolute max-sm:top-full max-sm:right-3 max-sm:z-50 max-sm:mt-2 max-sm:w-60 max-sm:flex-col max-sm:items-stretch max-sm:gap-0.5 max-sm:rounded-xl max-sm:bg-popover max-sm:p-1.5 max-sm:shadow-lg max-sm:ring-1 max-sm:ring-foreground/10",
          !open && "max-sm:hidden",
        )}
      >
        {children}
      </div>
    </div>
  );
}
