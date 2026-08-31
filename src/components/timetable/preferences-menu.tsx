"use client";

import { EyeOff, Merge, RotateCcw, Undo2 } from "lucide-react";
import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { IdentityParts, PreferenceRow } from "@/lib/timetable-merge";
import { cn } from "@/lib/utils";

//* ---------------------------------------------------------------------------
//* Összevonás-beállítások menüje
//* ---------------------------------------------------------------------------
//* Minden döntés EGY sor, azonnali visszavonással — a diák sose maradjon olyan
//* szűréssel, amiről nem tudja, honnan jött és hogyan kapcsolható ki.

function IdentityLine({
  parts,
  muted = false,
}: {
  parts: IdentityParts;
  muted?: boolean;
}) {
  return (
    <span className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
      {/*//! Nem csonkolunk: hosszú tantárgynévnél a `truncate` flex-gyerekként
          //! `min-w-0` nélkül kilógott a buborékból, ráadásul itt épp az a neve
          //! a döntésnek, amit a diák keres. */}
      <span
        className={cn(
          "min-w-0 text-pretty break-words text-[13px] font-semibold",
          muted ? "text-muted-strong" : "text-foreground",
        )}
      >
        {parts.subject}
      </span>
      {parts.group && (
        <span
          className={cn(
            "shrink-0 rounded-full px-1.5 py-px text-[11px] font-medium",
            muted
              ? "bg-muted/60 text-muted-strong"
              : "bg-muted text-foreground/75",
          )}
        >
          {parts.group}
        </span>
      )}
      {parts.teacher && (
        <span className="min-w-0 break-words text-[11px] text-muted-strong">
          {parts.teacher}
        </span>
      )}
    </span>
  );
}

export function PreferencesMenu({
  rows,
  onUndo,
  onReset,
  className,
}: {
  rows: PreferenceRow[];
  onUndo: (clusterKey: string) => void;
  onReset: () => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn("h-9 gap-1.5 rounded-full px-3", className)}
          aria-label={`Összevonások (${rows.length})`}
        >
          <Merge className="size-4" aria-hidden />
          <span className="hidden sm:inline">Összevonások</span>
          {rows.length > 0 && (
            <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-primary px-1 text-[11px] font-bold tabular-nums text-primary-foreground">
              {rows.length}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[min(22rem,calc(100vw-1.5rem))] p-0"
      >
        <div className="border-b border-border px-3 py-2.5">
          <p className="text-sm font-semibold text-foreground">
            Órarend-összevonások
          </p>
          <p className="mt-0.5 text-xs text-muted-strong">
            {rows.length === 0
              ? "Még nem vontál össze ütköző órákat."
              : "Ezek az órák maradnak láthatóak az ütköző sávokban."}
          </p>
        </div>

        {rows.length === 0 ? (
          //! ÜRES ÁLLAPOT: nem „nincs semmi", hanem megtanítja a mechanikát —
          //! a diák egyébként sosem találná meg a rácsban ülő gombot.
          <div className="flex flex-col items-center gap-2 px-5 py-7 text-center">
            <span className="flex size-9 items-center justify-center rounded-full bg-primary/10">
              <Merge className="size-4 text-foreground/70" aria-hidden />
            </span>
            <p className="text-pretty text-xs text-muted-strong">
              Ha két órád ugyanabban a sávban van, a rácson megjelenik az
              összevonás gombja. Kattints rá, és válaszd ki, melyikre jársz — a
              másik onnantól rejtve marad.
            </p>
          </div>
        ) : (
          <ul className="max-h-[19rem] overflow-y-auto py-1">
            {rows.map((row) => (
              <li
                key={row.clusterKey}
                className={cn(
                  "flex items-start gap-2 px-3 py-2",
                  !row.active && "opacity-60",
                )}
              >
                <div className="min-w-0 flex-1">
                  {/* A választott kombináció — általában egy óra, de lehet több. */}
                  <span className="flex min-w-0 flex-col gap-0.5">
                    {row.chosen.map((chosen) => (
                      <IdentityLine
                        key={`${chosen.subject}-${chosen.group}-${chosen.teacher}`}
                        parts={chosen}
                      />
                    ))}
                  </span>
                  <span className="mt-1 flex min-w-0 items-start gap-1 text-muted-strong">
                    <EyeOff className="mt-1 size-3 shrink-0" aria-hidden />
                    <span className="flex min-w-0 flex-col gap-0.5">
                      {row.hidden.map((hidden) => (
                        <IdentityLine
                          key={`${hidden.subject}-${hidden.group}-${hidden.teacher}`}
                          parts={hidden}
                          muted
                        />
                      ))}
                    </span>
                  </span>
                  {!row.active && (
                    //* Régi döntés: az órarendből azóta eltűnt a sáv. Nem hiba,
                    //* de jelezzük, hogy ne tűnjön elakadt beállításnak.
                    <span className="mt-1 block text-[11px] text-muted-strong">
                      Ezen a héten nincs ilyen óra.
                    </span>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 shrink-0 rounded-full"
                  aria-label={`${row.chosen.map((c) => c.subject).join(", ")} összevonás visszavonása`}
                  onClick={() => onUndo(row.clusterKey)}
                >
                  <Undo2 className="size-3.5" aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
        )}

        {rows.length > 0 && (
          <div className="border-t border-border p-2">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-full justify-start gap-1.5 text-muted-strong hover:text-foreground"
                >
                  <RotateCcw className="size-3.5" aria-hidden />
                  Naptár visszaállítása
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    Visszaállítod az órarendet?
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    Mind a(z) {rows.length} összevonásod törlődik, és minden
                    ütköző óra újra megjelenik a rácson. Bármikor összevonhatod
                    őket újra.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Mégse</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => {
                      setOpen(false);
                      onReset();
                    }}
                  >
                    Visszaállítás
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
