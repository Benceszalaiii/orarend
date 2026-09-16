"use client";

import { AlertTriangle, Info, OctagonAlert, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  type AnnouncementTone,
  appliesTo,
  isBlockExempt,
  type PublicAnnouncement,
} from "@/lib/announcements";
import { cn } from "@/lib/utils";

//! ═══════════════════════════════════════════════════════════════════════════
//! KÖZLEMÉNYEK A LAPON — SÁV, BUBORÉK, TELJES LAPOS HIBA
//! ═══════════════════════════════════════════════════════════════════════════
//! A gyökér-layoutban ül, tehát minden nézet alatt ott van. A lista egyszer jön
//! le betöltéskor (és újra, ha a fül visszakerül előtérbe); az útvonal-váltás
//! csak újraszűr, nem kér újra.
//*
//! AMI NEM JÖN LE, AZ NEM HIBA. Offline, adatbázis nélkül, elhasalt kérésnél
//! egyszerűen nincs közlemény — az órarend ettől nem állhat meg.
//! ═══════════════════════════════════════════════════════════════════════════

//* A bezárt buborékok. Az `updatedAt` is a kulcs része: ha az üzemeltető
//* átírja a szöveget, a már bezárt buborék újra megjelenik.
const DISMISSED_KEY = "orarend:announcements-dismissed:v1";

function dismissKey(a: PublicAnnouncement): string {
  return `${a.id}@${a.updatedAt}`;
}

function readDismissed(): Set<string> {
  try {
    const raw = window.localStorage.getItem(DISMISSED_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return new Set(
      Array.isArray(parsed)
        ? parsed.filter((v): v is string => typeof v === "string")
        : [],
    );
  } catch {
    return new Set();
  }
}

function writeDismissed(keys: Set<string>) {
  try {
    //* Csak az utolsó 50 — a régi közlemények jelölője ne gyűljön örökké.
    window.localStorage.setItem(
      DISMISSED_KEY,
      JSON.stringify([...keys].slice(-50)),
    );
  } catch {
    //* Privát mód / tiltott tároló: a buborék ezen a betöltésen bezárva marad.
  }
}

const TONE_ICON: Record<AnnouncementTone, typeof Info> = {
  INFO: Info,
  WARNING: AlertTriangle,
  ERROR: OctagonAlert,
};

const BAR_TONE: Record<AnnouncementTone, string> = {
  INFO: "bg-primary text-primary-foreground",
  WARNING: "bg-amber-400 text-amber-950",
  ERROR: "bg-destructive text-destructive-foreground",
};

const ICON_TONE: Record<AnnouncementTone, string> = {
  INFO: "text-primary",
  WARNING: "text-amber-500",
  ERROR: "text-destructive",
};

export function Announcements() {
  const pathname = usePathname();
  const [items, setItems] = useState<PublicAnnouncement[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/kozlemenyek");
      if (!res.ok) return;
      const body = (await res.json()) as {
        announcements?: PublicAnnouncement[];
      };
      setItems(Array.isArray(body.announcements) ? body.announcements : []);
    } catch {
      //* Offline vagy hálózati hiba — marad, ami volt.
    }
  }, []);

  useEffect(() => {
    setDismissed(readDismissed());
    void load();
    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [load]);

  const dismiss = useCallback((a: PublicAnnouncement) => {
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(dismissKey(a));
      writeDismissed(next);
      return next;
    });
  }, []);

  const here = items.filter((a) => appliesTo(a, pathname));
  const bars = here.filter((a) => a.kind === "BAR");
  const toasts = here.filter(
    (a) => a.kind === "TOAST" && !dismissed.has(dismissKey(a)),
  );
  const block = isBlockExempt(pathname)
    ? undefined
    : here.find((a) => a.kind === "BLOCK");

  return (
    <>
      {bars.length > 0 && (
        <div className="relative z-40 print:hidden">
          {bars.map((a) => {
            const Icon = TONE_ICON[a.tone];
            return (
              <div
                key={a.id}
                role={a.tone === "INFO" ? "status" : "alert"}
                className={cn(
                  "flex items-start justify-center gap-2 px-4 py-2 pt-[max(0.5rem,env(safe-area-inset-top))] text-center text-sm",
                  BAR_TONE[a.tone],
                )}
              >
                <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
                <p className="max-w-3xl text-balance">
                  {a.title && (
                    <strong className="font-semibold">{a.title} — </strong>
                  )}
                  {a.message}
                </p>
              </div>
            );
          })}
        </div>
      )}

      {toasts.length > 0 && !block && (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[90] flex flex-col items-center gap-2 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] print:hidden">
          {toasts.map((a) => {
            const Icon = TONE_ICON[a.tone];
            return (
              //! AZ EGÉSZ BUBORÉK A GOMB. „Kattintásig marad" — nem kell egy
              //! apró X-et célozni telefonon.
              <button
                key={a.id}
                type="button"
                onClick={() => dismiss(a)}
                aria-label={`Közlemény bezárása: ${a.title ?? a.message}`}
                className="pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-2xl border border-border bg-popover p-4 text-left text-popover-foreground shadow-lg transition-transform animate-in fade-in slide-in-from-bottom-4 active:scale-[0.98]"
              >
                <Icon
                  className={cn("mt-0.5 size-5 shrink-0", ICON_TONE[a.tone])}
                  aria-hidden
                />
                <span className="min-w-0 flex-1">
                  {a.title && (
                    <span className="block text-sm font-semibold">
                      {a.title}
                    </span>
                  )}
                  <span className="block text-sm text-muted-foreground">
                    {a.message}
                  </span>
                </span>
                <X className="mt-0.5 size-4 shrink-0 opacity-50" aria-hidden />
              </button>
            );
          })}
        </div>
      )}

      {block && <BlockScreen announcement={block} />}
    </>
  );
}

function BlockScreen({
  announcement: a,
}: {
  announcement: PublicAnnouncement;
}) {
  const Icon = TONE_ICON[a.tone];

  //! A LAP ALATTA NEM GÖRGETHETŐ. A takarás nem biztonsági határ (a tartalom
  //! a DOM-ban van), csak azt mondja: most ezt ne használd.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="announcement-block-title"
      aria-describedby="announcement-block-message"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-background px-6 print:hidden"
    >
      <div className="flex max-w-md flex-col items-center text-center">
        <Icon className={cn("size-10", ICON_TONE[a.tone])} aria-hidden />
        <h1
          id="announcement-block-title"
          className="mt-4 text-2xl font-bold tracking-tight text-foreground"
        >
          {a.title ?? "Az oldal most nem elérhető"}
        </h1>
        <p
          id="announcement-block-message"
          className="mt-2 whitespace-pre-line text-sm leading-relaxed text-muted-foreground"
        >
          {a.message}
        </p>
      </div>
    </div>
  );
}
