"use client";

import { ChevronDown } from "lucide-react";
import type { TimetableSubject } from "@/lib/timetable";
import { cn } from "@/lib/utils";

//! NATÍV `<select>`, MINT A HETI NÉZETBEN: mobilon a rendszer saját kerekét
//! kapja, billentyűvel a betűre ugrást — ezt egy egyedi lista sem adja vissza.
//! Egy tanárnál ez nem kényelmi kérdés: a lista több száz név, és a betűre
//! ugrás az egyetlen, ami ott használható marad.
export function SubjectPicker({
  subjects,
  value,
  disabled,
  label,
  placeholder,
  width = "w-[84px]",
  offlineHint,
  onChange,
}: {
  subjects: TimetableSubject[];
  value: string;
  disabled: boolean;
  /** A vezérlő hozzáférhető neve — „Osztály" vagy „Tanár". */
  label: string;
  //* Csak ott van értelme, ahol nincs alapértelmezés: a tanári lapon a lista
  //* első eleme NEM a felhasználó választása (lásd `initialSubject`).
  placeholder?: string;
  width?: string;
  offlineHint: string;
  onChange: (next: string) => void;
}) {
  if (subjects.length === 0) {
    return value ? (
      <span
        className="shrink-0 rounded-full border border-hero-foreground/20 px-2.5 py-1 text-xs text-hero-foreground/70"
        title={offlineHint}
      >
        {value}
      </span>
    ) : null;
  }
  return (
    <div className={cn("relative shrink-0", width)}>
      <select
        aria-label={label}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className={cn(
          "h-9 w-full touch-target appearance-none rounded-full border border-hero-foreground/20 bg-transparent py-1 pr-6 pl-2.5 text-xs transition-colors outline-none",
          "hover:bg-hero-foreground/10 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
          "disabled:cursor-not-allowed disabled:opacity-50",
        )}
      >
        {placeholder && value === "" && (
          //! ÜRES ÉRTÉK, DE NEM ÜRES SOR. A tanári lapon a választó VALÓBAN
          //! üresen indul; egy jelöletlen `<select>` viszont a lista első
          //! nevét mutatná, és a lap úgy nézne ki, mintha egy tetszőleges
          //! kolléga órarendjét már ki is választotta volna valaki.
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {subjects.map((s) => (
          <option key={s.short} value={s.short}>
            {s.name}
          </option>
        ))}
      </select>
      <ChevronDown
        className="pointer-events-none absolute top-1/2 right-2 size-3.5 -translate-y-1/2 text-hero-foreground/50"
        aria-hidden
      />
    </div>
  );
}
