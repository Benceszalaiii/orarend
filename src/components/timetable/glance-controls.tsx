"use client";

import { LayoutGrid } from "lucide-react";
import { SheetItemBody, sheetItem } from "@/components/chrome/chrome-sheet";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

//* ---------------------------------------------------------------------------
//* TELJES ÓRAREND — egy pillantás az iskola órarendjére
//* ---------------------------------------------------------------------------
//! A SZŰRÉS AZ ÓRAREND LÉNYEGE, DE NEM ZÁRHAT BE. Az összevonások és a duális
//! beosztás a diák SAJÁT órarendjét rajzolják ki — csakhogy néha épp az a
//! kérdés, ami el van rejtve: „hol van most a másik csoport?", „mi lenne ma
//! órám, ha nem a munkahelyen lennék?". Eddig erre egyetlen válasz volt: a
//! döntéseket visszavonni, megnézni, majd egyenként újra meghozni.
//!
//! EZÉRT EZ PILLANTÁS, NEM BEÁLLÍTÁS. Semmit nem ír a tárolóba, és semmit nem
//! töröl: a döntések érintetlenül várnak a háttérben, és egy koppintással
//! visszajönnek. Újratöltéskor és alanyváltáskor magától is véget ér — egy
//! elfelejtett teljes nézet az órarend-nézőben rosszabb, mint egy elfelejtett
//! szűrés, mert épp azt mutatja, amire a diák NEM jár.

//* A lap sora: a kapcsoló maga a sor (lásd `sheetItem`).
export function GlanceToggle({
  active,
  onToggle,
  className,
}: {
  active: boolean;
  onToggle: () => void;
  className?: string;
}) {
  return (
    <Button
      variant="ghost"
      data-key="s"
      aria-pressed={active}
      onClick={onToggle}
      className={sheetItem(cn(active && "bg-muted", className))}
    >
      <LayoutGrid
        className={cn(
          "size-4 shrink-0",
          active ? "text-primary" : "text-muted-foreground",
        )}
        aria-hidden
      />
      <SheetItemBody
        label="Teljes órarend"
        hint={active ? "Bekapcsolva" : "Minden óra, a beállításaid nélkül"}
      />
    </Button>
  );
}

//! A NÉZET SOHA NEM NÉMA. A teljes rács pontosan úgy néz ki, mint a saját —
//! csak több kártya van rajta. Ha ennek a különbségnek csak a lapban lenne
//! nyoma, a diák egy idegen csoport óráját nézné a sajátjaként. Ezért egy sor
//! áll a rács fölött, ugyanott, ahol a mentett hét jelzése (`StaleNote`), és
//! ugyanabban a sorban a kiút is.
export function GlanceNote({
  onExit,
  className,
}: {
  onExit: () => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-center gap-2 text-xs text-muted-strong",
        className,
      )}
    >
      <LayoutGrid className="size-3.5 shrink-0 text-primary" aria-hidden />
      <span className="min-w-0 text-pretty">
        <span className="font-semibold text-foreground">
          A teljes órarendet látod.
        </span>{" "}
        A beállításaid megmaradtak.
      </span>
      <Button
        variant="ghost"
        size="sm"
        onClick={onExit}
        className="h-7 shrink-0 touch-target rounded-full bg-primary/12 px-2.5 text-xs font-medium text-primary hover:bg-primary/20"
      >
        Vissza a sajátomhoz
      </Button>
    </div>
  );
}
