"use client";

import { Archive, Check, Pencil, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  approveClub,
  archiveClub,
  type ClubActionResult,
  rejectProposal,
} from "../actions";

//* A szakkör lapjának kezelőgombjai. Hogy melyik látszik, azt a szerver dönti
//* el (`club-access.ts`), és az action ugyanazt újra megkérdezi — itt csak a
//* gomb és a hibaüzenet él.
export function ClubControls({
  slug,
  canEdit,
  canApprove,
  canReject,
  canArchive,
}: {
  slug: string;
  canEdit: boolean;
  canApprove: boolean;
  canReject: boolean;
  canArchive: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(
    action: (slug: string) => Promise<ClubActionResult>,
    after: "refresh" | "list",
  ) {
    setError(null);
    startTransition(async () => {
      const result = await action(slug);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (after === "list") router.push("/szakkorok");
      else router.refresh();
    });
  }

  if (!canEdit && !canApprove && !canReject && !canArchive) return null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {canApprove && (
          <Button
            disabled={pending}
            onClick={() => run(approveClub, "refresh")}
            className="rounded-full"
          >
            <Check aria-hidden />
            Jóváhagyom, vállalom
          </Button>
        )}
        {canEdit && (
          <Button asChild variant="outline" className="rounded-full">
            <Link href={`/szakkorok/${slug}/szerkesztes`}>
              <Pencil aria-hidden />
              Szerkesztés
            </Link>
          </Button>
        )}
        {canReject && (
          <Button
            variant="outline"
            disabled={pending}
            onClick={() => {
              if (window.confirm("Biztosan törlöd ezt a javaslatot?")) {
                run(rejectProposal, "list");
              }
            }}
            className="rounded-full"
          >
            <X aria-hidden />
            {canApprove ? "Elutasítom" : "Visszavonom"}
          </Button>
        )}
        {canArchive && (
          <Button
            variant="ghost"
            disabled={pending}
            onClick={() => {
              if (
                window.confirm(
                  "Lezárod a szakkört? A listából és az órarendből is eltűnik.",
                )
              ) {
                run(archiveClub, "list");
              }
            }}
            className="rounded-full text-muted-strong"
          >
            <Archive aria-hidden />
            Megszűnt
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
