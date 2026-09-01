"use client";

import { ChevronDown, Info, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { DualPlan } from "@/lib/dual-plan";
import { cn } from "@/lib/utils";

//! ─── TERVVÁLASZTÓ ──────────────────────────────────────────────────────────
//! Az `/orarend` osztályválasztójának a helyén ül, és ugyanazt a szerepet
//! tölti be: ez dönti el, MI látszik a rácson. Csak épp nem osztályt választ,
//! hanem egy tantárgy→csoport hozzárendelést — az A, B, C… tervek egyikét.
//!
//! NATÍV `<select>`, ugyanabból az okból, amiért az osztályválasztó is az:
//! ez a lap leggyakrabban használt vezérlője, és a rendszer saját kereke
//! (mobil) meg a betűre ugrás (billentyűzet) többet ér, mint bármilyen egyedi
//! lista. A terv RÉSZLETEIT viszont egy `<option>` nem tudja elmondani — arra
//! van mellette a buborék.

function planLabel(plan: DualPlan): string {
  const base = `${plan.id} · ${plan.hours} óra`;
  return plan.kind === "partial" ? `${base} · −${plan.skipped}` : base;
}

export function PlanPicker({
  plans,
  index,
  onSelect,
  unreachable,
  className,
}: {
  plans: DualPlan[];
  index: number;
  onSelect: (index: number) => void;
  unreachable: string[];
  className?: string;
}) {
  const plan = plans[index];
  if (!plan) return null;

  return (
    <div className={cn("flex shrink-0 items-center gap-1.5", className)}>
      <div className="relative shrink-0">
        <select
          aria-label="Órarendi terv"
          value={index}
          onChange={(e) => onSelect(Number(e.target.value))}
          className={cn(
            "h-9 w-[132px] touch-target appearance-none rounded-full border border-input bg-transparent py-1 pr-7 pl-3 text-sm transition-colors outline-none",
            "hover:bg-muted focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
            "dark:bg-input/30 dark:hover:bg-input/50",
          )}
        >
          {plans.map((p, i) => (
            <option key={p.id} value={i}>
              {planLabel(p)}
            </option>
          ))}
        </select>
        <ChevronDown
          className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
      </div>

      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-8 shrink-0 rounded-full touch-target"
            aria-label="A terv részletei"
          >
            <Info className="size-4 text-muted-foreground" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-80 p-0">
          <div className="flex flex-col gap-3 p-3 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-base font-bold text-foreground">
                {plan.id} terv
              </span>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-xs font-semibold",
                  plan.kind === "clean"
                    ? "bg-primary/15 text-primary"
                    : "bg-destructive/15 text-destructive",
                )}
              >
                {plan.kind === "clean"
                  ? "Ütközésmentes"
                  : `${plan.skipped} óra kiesik`}
              </span>
              <span className="ml-auto text-xs text-muted-strong tabular-nums">
                {plan.hours} óra
              </span>
            </div>

            {/*//! AMIT VISZEL — ÉS KITŐL. A tanár a lényeg: a szabály az, hogy
                //! egy tantárgy VÉGIG ugyanabból a csoportból megy, tehát ez a
                //! lista maga a döntés, amit a tervvel meghozol. */}
            <div className="flex flex-col gap-1">
              <div className="text-xs font-semibold text-muted-strong">
                Viszed ({plan.subjects.length})
              </div>
              <ul className="flex flex-col gap-0.5">
                {plan.subjects.map((s) => (
                  <li key={s} className="flex items-baseline gap-2 text-xs">
                    <span className="font-medium text-foreground">{s}</span>
                    <span className="ml-auto text-muted-foreground">
                      {plan.groups[s]}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            {plan.sacrificed.length > 0 && (
              <div className="flex flex-col gap-1">
                <div className="text-xs font-semibold text-muted-strong">
                  Feláldozva ({plan.sacrificed.length})
                </div>
                <p className="text-xs text-muted-foreground">
                  {plan.sacrificed.join(", ")}
                </p>
              </div>
            )}

            {/*//! AZ ELÉRHETETLEN TANTÁRGY NEM A TERV HIBÁJA. Ezek CSAK duális
                //! napon futnak, tehát egyetlen terv sem tudja beszedni őket —
                //! külön mondjuk el, nehogy a következő terv keresésével
                //! próbálja valaki megoldani. */}
            {unreachable.length > 0 && (
              <div className="flex items-start gap-2 rounded-lg bg-muted/60 px-2 py-1.5">
                <TriangleAlert
                  className="mt-0.5 size-3.5 shrink-0 text-muted-foreground"
                  aria-hidden
                />
                <p className="text-xs text-muted-foreground">
                  Egyik terv sem érheti el:{" "}
                  <span className="font-medium text-muted-strong">
                    {unreachable.join(", ")}
                  </span>{" "}
                  — ezek csak duális napon futnak.
                </p>
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
