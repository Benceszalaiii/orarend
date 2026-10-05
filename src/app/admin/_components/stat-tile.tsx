import { cn } from "@/lib/utils";

//* A pult fejlécének számai. A kiemelés annak jár, ami DÖNTÉSRE vár
//* (jóváhagyás, lépés) — nem annak, ami nagy.
export function StatTile({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border px-4 py-3",
        highlight ? "border-primary/50 bg-primary/5" : "border-border bg-card",
      )}
    >
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-bold tracking-tight text-foreground tabular-nums">
        {value.toLocaleString("hu-HU")}
      </p>
    </div>
  );
}
