"use client";

import { BadgeCheck, ChevronDown, MonitorUp, User, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Participant } from "@/lib/webrtc-shared";

//! ═══════════════════════════════════════════════════════════════════════════
//! KI VAN ITT
//! ═══════════════════════════════════════════════════════════════════════════
//! A NÉVSOR A MEGOSZTÓ GÉPÉRŐL JÖN, NEM A SZERVERRŐL. Ő az egyetlen, aki
//! mindenkivel kapcsolatban van, tehát ő az egyetlen, aki tudja, ki van bent —
//! és a tudása nem elhiszi, hanem MÉRI: aki a listán van, azzal élő kapcsolata
//! van ebben a pillanatban.
//!
//! A KÉT NÉVFAJTA LÁTHATÓAN KÜLÖNBÖZIK, ÉS EZ NEM DÍSZ. A pipa azt jelenti,
//! hogy a nevet a SZERVER tette oda a fiókból — nem a tulajdonosa írta be. A
//! pipa nélküli név egy vendég becenevét jelenti: lehet igaz, de senki nem
//! állította. Ha a kettő egyformán nézne ki, a becenév ingyen kapná meg a
//! fiók hitelét — pont azt, amit a hitelesítés véd.
//!
//! ÖSSZECSUKHATÓ, MERT A CSEVEGÉS MELLETT ÁLL. A színház oldalsávjában a két
//! doboz ugyanazon a függőleges helyen osztozik (lásd `webrtc-client.tsx`);
//! aki épp beszélget, az összecsukja a névsort, és a SZÁM a fejlécben marad —
//! „hányan vannak" enélkül sem tűnik el.
//! ═══════════════════════════════════════════════════════════════════════════

export function RosterList({
  roster,
  mePeer,
  open = true,
  onToggle,
  className,
}: {
  roster: Participant[];
  mePeer: string | null;
  open?: boolean;
  /** Megadva a fejléc gombbá válik. Enélkül a lista mindig nyitva áll. */
  onToggle?: () => void;
  className?: string;
}) {
  //* A megosztó elöl, aztán a nézők érkezési sorrendben — ez a sorrend a
  //* megosztó gépén már kialakult, itt csak a házigazdát emeljük ki.
  const sorted = [...roster].sort((a, b) => Number(b.host) - Number(a.host));

  const head = (
    <>
      <Users className="size-3.5 shrink-0" aria-hidden />
      Résztvevők
      <span className="ml-auto tabular-nums">{sorted.length}</span>
      {onToggle && (
        <ChevronDown
          aria-hidden
          className={cn(
            "size-3.5 shrink-0 transition-transform",
            !open && "-rotate-90",
          )}
        />
      )}
    </>
  );

  const headClass =
    "flex w-full items-center gap-2 px-3 py-2 text-xs font-semibold text-muted-foreground";

  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      {onToggle ? (
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className={cn(
            headClass,
            "hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
          )}
        >
          {head}
        </button>
      ) : (
        <div className={headClass}>{head}</div>
      )}

      {open &&
        (sorted.length === 0 ? (
          <p className="px-3 pb-3 text-xs text-muted-foreground">
            Még senki nincs bent.
          </p>
        ) : (
          <ul className="min-h-0 flex-1 overflow-y-auto pb-1">
            {sorted.map((person) => (
              <li
                key={person.peer}
                className="flex items-center gap-2 px-3 py-1.5 text-sm"
              >
                {person.host ? (
                  <MonitorUp
                    className="size-3.5 shrink-0 text-primary"
                    aria-label="Ő oszt meg"
                  />
                ) : (
                  <User
                    className="size-3.5 shrink-0 text-muted-foreground"
                    aria-hidden
                  />
                )}
                <span className="min-w-0 flex-1 truncate">{person.name}</span>
                {person.peer === mePeer && (
                  <span className="shrink-0 text-[11px] text-muted-foreground">
                    te
                  </span>
                )}
                {person.verified && (
                  <BadgeCheck
                    className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400"
                    aria-label="A nevét a belépett fiókja igazolja"
                  />
                )}
              </li>
            ))}
          </ul>
        ))}
    </div>
  );
}
