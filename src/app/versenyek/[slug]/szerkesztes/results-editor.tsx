"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import type { ResultInput } from "@/lib/competitions";
import { cn } from "@/lib/utils";
import { saveResults } from "../../actions";

//! AZ EREDMÉNY RÖGZÍTÉSE ÉS KÖZZÉTÉTELE KÉT KÜLÖN LÉPÉS. Itt a tanár nyugodtan
//! beírhatja fokozatosan (előbb a helyezéseket, aztán a különdíjakat); a diákok
//! csak akkor látják, amikor a verseny lapján „Lezajlott"-ra állítja.

const FIELD =
  "rounded-md border border-input bg-background px-2 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

type Row = {
  userId: string;
  name: string;
  className: string | null;
  rank: string;
  award: string;
  points: string;
};

export function ResultsEditor({
  slug,
  entries,
  published,
}: {
  slug: string;
  entries: {
    userId: string;
    name: string;
    className: string | null;
    rank: number | null;
    award: string | null;
    points: number | null;
  }[];
  published: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(
    null,
  );
  const [rows, setRows] = useState<Row[]>(
    entries.map((e) => ({
      userId: e.userId,
      name: e.name,
      className: e.className,
      rank: e.rank?.toString() ?? "",
      award: e.award ?? "",
      points: e.points?.toString() ?? "",
    })),
  );

  if (entries.length === 0) {
    return (
      <p className="text-sm text-muted-strong">
        Még senki nem nevezett — nincs mihez eredményt írni.
      </p>
    );
  }

  function update(i: number, patch: Partial<Row>) {
    setRows((all) => all.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  }

  function save() {
    setMessage(null);
    const payload: ResultInput = rows.map((r) => ({
      userId: r.userId,
      rank: r.rank ? Number(r.rank) : null,
      award: r.award.trim() || null,
      points: r.points ? Number(r.points.replace(",", ".")) : null,
    }));
    startTransition(async () => {
      const result = await saveResults(slug, payload);
      setMessage(
        result.ok
          ? {
              ok: true,
              text: published
                ? "Elmentve — a verseny lapján már látszik."
                : "Elmentve. A diákok akkor látják, amikor a versenyt „Lezajlott”-ra állítod.",
            }
          : { ok: false, text: result.error },
      );
      if (result.ok) router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[32rem] text-sm">
          <thead className="bg-muted/40 text-left text-xs text-muted-strong">
            <tr>
              <th className="px-3 py-2 font-medium">Nevező</th>
              <th className="w-24 px-3 py-2 font-medium">Helyezés</th>
              <th className="px-3 py-2 font-medium">Díj</th>
              <th className="w-24 px-3 py-2 font-medium">Pont</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r, i) => (
              <tr key={r.userId}>
                <td className="px-3 py-2">
                  {r.name}
                  {r.className && (
                    <span className="ml-1.5 text-xs text-muted-strong">
                      {r.className}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <input
                    type="number"
                    min={1}
                    aria-label={`${r.name} helyezése`}
                    value={r.rank}
                    onChange={(e) => update(i, { rank: e.target.value })}
                    className={cn(FIELD, "h-8 w-full tabular-nums")}
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    maxLength={80}
                    aria-label={`${r.name} díja`}
                    placeholder="pl. Különdíj"
                    value={r.award}
                    onChange={(e) => update(i, { award: e.target.value })}
                    className={cn(FIELD, "h-8 w-full")}
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    inputMode="decimal"
                    aria-label={`${r.name} pontszáma`}
                    value={r.points}
                    onChange={(e) => update(i, { points: e.target.value })}
                    className={cn(FIELD, "h-8 w-full tabular-nums")}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={save} disabled={pending} className="rounded-full">
          Eredmény mentése
        </Button>
        {message && (
          <p
            role={message.ok ? "status" : "alert"}
            className={cn(
              "text-sm",
              message.ok ? "text-muted-strong" : "text-destructive",
            )}
          >
            {message.text}
          </p>
        )}
      </div>
    </div>
  );
}
