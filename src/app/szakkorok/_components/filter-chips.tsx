"use client";

import { cn } from "@/lib/utils";

//* ---------------------------------------------------------------------------
//* SZŰRŐ-CSIPEK — a szakkörök fajtája és a versenyek területe
//* ---------------------------------------------------------------------------
//! TELEFONON EGY SOR, OLDALRA GÖRGETVE; gépen tördelve. Két sorba tört csipek
//! telefonon a lista első sorát tolnák a képernyő alá — egy sor marad, és a
//! szélén kifutó csip mutatja, hogy van még.
export function FilterChips<T extends string>({
  legend,
  options,
  value,
  onChange,
  className,
}: {
  legend: string;
  options: readonly { id: T; label: string }[];
  value: T;
  onChange: (next: T) => void;
  className?: string;
}) {
  return (
    <fieldset
      className={cn(
        "-mx-4 flex min-w-0 gap-1.5 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 [&::-webkit-scrollbar]:hidden",
        className,
      )}
    >
      <legend className="sr-only">{legend}</legend>
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          aria-pressed={value === option.id}
          onClick={() => onChange(option.id)}
          className={cn(
            "press h-8 shrink-0 whitespace-nowrap rounded-full border px-3 text-xs font-medium touch-target focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
            value === option.id
              ? "border-foreground bg-foreground text-background"
              : "border-border text-muted-strong hover:border-foreground/30 hover:text-foreground",
          )}
        >
          {option.label}
        </button>
      ))}
    </fieldset>
  );
}
