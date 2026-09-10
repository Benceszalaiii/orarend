"use client";

import { Eye, EyeOff, RotateCcw, SlidersHorizontal } from "lucide-react";
import { useState } from "react";
import {
  SHEET_POPOVER,
  SheetItemBody,
  sheetItem,
} from "@/components/chrome/chrome-sheet";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  MENU_GROUP_TITLE,
  MENU_ITEMS,
  type MenuItemGroup,
} from "@/lib/menu-items";
import type { HiddenMenu } from "@/lib/use-hidden-menu";
import { cn } from "@/lib/utils";

//! ═══════════════════════════════════════════════════════════════════════════
//! A TESTRESZABÓ — EGY HELY, AHOL A LAP LELTÁRA LÁTSZIK
//! ═══════════════════════════════════════════════════════════════════════════
//! A KAPCSOLÓ NEM A SOR MELLETT VAN, HANEM EGY LISTÁBAN. Kézenfekvő lenne
//! minden sorra tenni egy kis „×"-et — és pont az lenne a hiba, amit a lap
//! egyszer már megfizetett (lásd `sheetItem`): a sor MAGA a vezérlő, egy
//! második, apró gomb benne két találati felületet csinálna egyből, ráadásul
//! egy VÉLETLEN koppintással eltüntethető sort. Ami eltüntet, az itt áll, egy
//! szándékos lépéssel odébb.
//!
//! ÉS EZÉRT LÁTSZIK ITT AZ IS, AMI ÉPP REJTVE VAN. Ha a testreszabó csak a
//! MEGLÉVŐ sorokat sorolná fel, az elrejtés egyirányú utca lenne: ami egyszer
//! eltűnt, arról a diák nem tudná, hogy létezik. A lista ezért mindig teljes —
//! a lap leltára, nem a lap másolata (`MENU_ITEMS`).
//!
//! AMI NINCS BENNE: az alany, a hét és a fiók. Az első kettő MAGA a nézet, a
//! harmadik az egyetlen út a másik készüléken beállítottakhoz — és nincs benne
//! ez a sor sem: egy kapcsoló, ami magát is kikapcsolhatja, zsákutca.
//! ═══════════════════════════════════════════════════════════════════════════

const GROUPS: MenuItemGroup[] = ["settings", "site"];

export function MenuVisibilityMenu({
  menu,
  className,
}: {
  //! A HORGOT A HÍVÓ ADJA, NEM MI KÉRJÜK LE. A fejléc amúgy is megkérdezi
  //! (a saját sorait ő szűri), és két külön példány két külön állapotot
  //! jelentene — ugyanazt olvasva, egy képkockányi csúszással.
  menu: HiddenMenu;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const hiddenCount = menu.hidden.size;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" data-key="r" className={sheetItem(className)}>
          <SlidersHorizontal
            className={cn(
              "size-4 shrink-0",
              hiddenCount > 0 ? "text-primary" : "text-muted-foreground",
            )}
            aria-hidden
          />
          <SheetItemBody
            label="Testreszabás"
            hint={
              hiddenCount > 0
                ? `${hiddenCount} sor elrejtve`
                : "Rejtsd el, amit nem használsz"
            }
          />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        {...SHEET_POPOVER}
        className="w-[min(21rem,calc(100vw-1.5rem))] p-0"
      >
        <div className="border-b border-border px-3 py-2.5">
          <p className="text-sm font-semibold text-foreground">
            Mit mutasson ez a lap
          </p>
          {/*//! A MONDAT AZT MONDJA KI, AMI A LEGTÖBBET ÉR: hogy a döntés
              //! VISSZAVONHATÓ. Az elrejtés csak akkor mer bárki hozzányúlni,
              //! ha tudja, hogy a sor nem VÉGLEG tűnik el — és hogy pontosan
              //! itt találja meg újra. */}
          <p className="mt-0.5 text-pretty text-xs text-muted-strong">
            Amit kikapcsolsz, eltűnik innen — a beállítás megmarad, és itt
            bármikor visszakapcsolhatod.
          </p>
        </div>

        <div className="max-h-[min(60dvh,24rem)] overflow-y-auto">
          {GROUPS.map((group) => (
            <section
              key={group}
              className="px-1.5 py-2 not-first:border-t not-first:border-border"
            >
              {/*//! A CSOPORTOK UGYANAZOK, MINT A LAPON, ÉS UGYANABBAN A
                  //! SORRENDBEN. A testreszabó nem egy MÁSIK rendszer: aki
                  //! becsukja, ugyanazt a képet találja, csak sorokkal
                  //! kevesebbet. */}
              <h3 className="px-1.5 pb-1 text-[11px] font-semibold text-muted-foreground">
                {MENU_GROUP_TITLE[group]}
              </h3>
              <div className="flex flex-col gap-0.5">
                {MENU_ITEMS.filter((item) => item.group === group).map(
                  (item) => {
                    const shown = menu.shows(item.id);
                    return (
                      <button
                        key={item.id}
                        type="button"
                        //* Kapcsoló, nem választás egy halmazból: minden sor
                        //* külön, egymástól függetlenül áll be.
                        role="switch"
                        aria-checked={shown}
                        onClick={() => menu.toggle(item.id)}
                        className={cn(
                          "flex w-full min-h-11 items-center gap-2.5 rounded-lg px-1.5 py-1 text-left transition-colors",
                          "hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none",
                        )}
                      >
                        {shown ? (
                          <Eye
                            className="size-4 shrink-0 text-primary"
                            aria-hidden
                          />
                        ) : (
                          <EyeOff
                            className="size-4 shrink-0 text-muted-foreground"
                            aria-hidden
                          />
                        )}
                        <span className="min-w-0 flex-1">
                          <span
                            className={cn(
                              "block truncate text-sm font-medium",
                              shown
                                ? "text-foreground"
                                : "text-muted-foreground line-through",
                            )}
                          >
                            {item.label}
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {item.hint}
                          </span>
                        </span>
                        {/*//! A KAPCSOLÓ LÁTSZIK IS, NEM CSAK AZ IKON SZÍNE
                            //! MOND VALAMIT. Színvakon egy „halványabb szem" és
                            //! egy „élénkebb szem" ugyanaz a folt; a pirula
                            //! ALAKJA (bal vagy jobb szélen a pötty) szín
                            //! nélkül is olvasható. */}
                        <span
                          aria-hidden
                          className={cn(
                            "flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors motion-reduce:transition-none",
                            shown ? "bg-primary" : "bg-muted-foreground/35",
                          )}
                        >
                          <span
                            className={cn(
                              "size-4 rounded-full bg-background transition-transform motion-reduce:transition-none",
                              shown && "translate-x-4",
                            )}
                          />
                        </span>
                      </button>
                    );
                  },
                )}
              </div>
            </section>
          ))}
        </div>

        {/*//! A VISSZAÁLLÍTÁS CSAK AKKOR VAN OTT, AMIKOR VAN MIT VISSZAÁLLÍTANI
            //! — ugyanaz a szabály, mint a sorban álló „Ma"-nál: egy vezérlő,
            //! aminek nincs dolga, nem foglal helyet. */}
        {hiddenCount > 0 && (
          <div className="border-t border-border p-1.5">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => menu.reset()}
              className="h-9 w-full touch-target justify-start gap-2 rounded-lg px-1.5 text-xs font-medium"
            >
              <RotateCcw className="size-3.5 shrink-0" aria-hidden />
              Mindent visszakapcsolok
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
