"use client";

import { Pencil } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import type { CompetitionStatus } from "@/lib/competitions";
import { deleteDraft, setCompetitionStatus } from "../actions";

//! AZ ÁLLAPOT A SZERVEZŐ DÖNTÉSE, ÉS MINDIG A KÖVETKEZŐ LÉPÉST KÍNÁLJUK.
//! Nem egy legördülő lista öt állapottal, hanem az a gomb, ami épp értelmes:
//! a piszkozatnál a nevezés megnyitása, a nyitottnál a lezárása, a lezártnál
//! az eredményhirdetés. A visszalépés (újranyitás) is ott van, mert egy
//! határidő-hosszabbítás gyakori.
const NEXT: Record<
  CompetitionStatus,
  { to: CompetitionStatus; label: string; confirm?: string }[]
> = {
  DRAFT: [
    {
      to: "OPEN",
      label: "Nevezés megnyitása",
      confirm: "Megnyitod a nevezést? Innentől minden diák látja a versenyt.",
    },
  ],
  OPEN: [
    { to: "CLOSED", label: "Nevezés lezárása" },
    {
      to: "CANCELLED",
      label: "Elmarad",
      confirm: "Elmarad a verseny? A nevezők és a követők látni fogják.",
    },
  ],
  CLOSED: [
    {
      to: "FINISHED",
      label: "Lezajlott — eredmény közzététele",
      confirm:
        "Közzéteszed az eredményt? A rögzített helyezések és díjak nyilvánosak lesznek.",
    },
    { to: "OPEN", label: "Nevezés újranyitása" },
    {
      to: "CANCELLED",
      label: "Elmarad",
      confirm: "Elmarad a verseny? A nevezők és a követők látni fogják.",
    },
  ],
  FINISHED: [{ to: "CLOSED", label: "Eredmény visszavonása" }],
  CANCELLED: [{ to: "OPEN", label: "Mégis megtartjuk" }],
};

export function ManageControls({
  slug,
  status,
}: {
  slug: string;
  status: CompetitionStatus;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function move(to: CompetitionStatus, confirm?: string) {
    if (confirm && !window.confirm(confirm)) return;
    setError(null);
    startTransition(async () => {
      const result = await setCompetitionStatus(slug, to);
      if (!result.ok) setError(result.error);
      else router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-dashed border-border p-3">
      <p className="text-xs font-medium text-muted-strong">Szervezőként</p>
      <div className="flex flex-wrap gap-2">
        {NEXT[status].map((step, i) => (
          <Button
            key={step.to}
            size="sm"
            variant={i === 0 ? "default" : "outline"}
            disabled={pending}
            onClick={() => move(step.to, step.confirm)}
            className="rounded-full"
          >
            {step.label}
          </Button>
        ))}
        <Button asChild size="sm" variant="outline" className="rounded-full">
          <Link href={`/versenyek/${slug}/szerkesztes`}>
            <Pencil aria-hidden />
            Szerkesztés, eredmény
          </Link>
        </Button>
        {status === "DRAFT" && (
          <Button
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() => {
              if (!window.confirm("Törlöd a piszkozatot?")) return;
              startTransition(async () => {
                const result = await deleteDraft(slug);
                if (!result.ok) setError(result.error);
                else router.push("/versenyek");
              });
            }}
            className="rounded-full text-muted-strong"
          >
            Piszkozat törlése
          </Button>
        )}
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
