"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

//! ═══════════════════════════════════════════════════════════════════════════
//! A PULT GRAFIKONJAI — EGY SZÍN, HALK TENGELYEK
//! ═══════════════════════════════════════════════════════════════════════════
//! Minden grafikon EGYETLEN sorozat, ezért egyetlen szín: a `--primary`. A
//! kategóriák (téma, paletta, osztály) nem rangsorolhatók — ha mindegyik más
//! színt kapna, a szín semmit nem kódolna, amit a hossz ne mondana el már.
//!
//! A színek CSS-változók, nem kiszámolt értékek: így a tweakcn-preset és a
//! világos/sötét váltás a grafikonokat is magával viszi, újrarenderelés nélkül.
//! A szövegek a szöveg-tokeneket viselik, soha nem a sorozat színét.
//! ═══════════════════════════════════════════════════════════════════════════

const AXIS_TICK = { fill: "var(--muted-foreground)", fontSize: 12 };

const nf = (n: number) => n.toLocaleString("hu-HU");

//* „2026-09-17" → „szept. 17." — a tengelyen az év csak zaj.
const shortDate = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("hu-HU", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

const longDate = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("hu-HU", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
    timeZone: "UTC",
  });

function TooltipBox({
  title,
  value,
  hint,
}: {
  title: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-md border border-border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="text-muted-foreground">{title}</p>
      <p className="mt-0.5 text-sm font-semibold text-popover-foreground tabular-nums">
        {value}
      </p>
      {hint ? <p className="mt-0.5 text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

//! ─── IDŐSOR ────────────────────────────────────────────────────────────────
//! Terület a folytonos mennyiségre (összesített létszám, napi megnyitás), oszlop
//! a darabos eseményre (napi új fiók) — az oszlop nem sugall átmenetet két nap
//! között, ahol nem volt semmi.

export type TrendPoint = { date: string; value: number };

export function TrendChart({
  data,
  unit,
  kind = "area",
  height = 180,
}: {
  data: TrendPoint[];
  unit: string;
  kind?: "area" | "bar";
  height?: number;
}) {
  const common = {
    data,
    responsive: true,
    style: { width: "100%", height },
    margin: { top: 8, right: 8, bottom: 0, left: 0 },
    accessibilityLayer: true,
  };

  const axes = (
    <>
      <CartesianGrid vertical={false} stroke="var(--border)" />
      <XAxis
        dataKey="date"
        tickFormatter={shortDate}
        tick={AXIS_TICK}
        tickLine={false}
        axisLine={false}
        minTickGap={24}
      />
      <YAxis
        tick={AXIS_TICK}
        tickLine={false}
        axisLine={false}
        allowDecimals={false}
        width={36}
      />
      <Tooltip
        cursor={
          kind === "area"
            ? { stroke: "var(--muted-foreground)", strokeDasharray: "3 3" }
            : { fill: "var(--muted)", opacity: 0.5 }
        }
        content={({ active, payload }) => {
          const point = payload?.[0]?.payload as TrendPoint | undefined;
          if (!active || !point) return null;
          return (
            <TooltipBox
              title={longDate(point.date)}
              value={`${nf(point.value)} ${unit}`}
            />
          );
        }}
      />
    </>
  );

  if (kind === "bar") {
    return (
      <BarChart {...common}>
        {axes}
        <Bar
          dataKey="value"
          fill="var(--primary)"
          radius={[4, 4, 0, 0]}
          maxBarSize={24}
        />
      </BarChart>
    );
  }

  return (
    <AreaChart {...common}>
      {axes}
      <Area
        dataKey="value"
        type="linear"
        stroke="var(--primary)"
        strokeWidth={2}
        fill="var(--primary)"
        fillOpacity={0.15}
        activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }}
      />
    </AreaChart>
  );
}

//! ─── MEGOSZLÁS ─────────────────────────────────────────────────────────────
//! Vízszintes oszlop, mert a feliratok hosszúak („Heti órarend", „Duális
//! beosztás") — függőlegesen elfordítva olvashatatlanok lennének. Minden sor
//! mellett ott a szám: kevés kategória van, a pontos érték többet ér a
//! tengelynél, amit ezért el is hagyunk.

export type DistributionRow = { key: string; label: string; count: number };

export function DistributionChart({
  data,
  total,
  unit = "fiók",
  ordered = false,
}: {
  data: DistributionRow[];
  //* A százalék alapja. Ha nincs megadva, a sorok összege.
  total?: number;
  unit?: string;
  //* `true`: a sorrend jelentést hordoz (pl. időskála) — ilyenkor a nulla
  //* értékű sorok is maradnak, hogy a skála ne lyukas legyen.
  ordered?: boolean;
}) {
  const rows = ordered ? data : data.filter((d) => d.count > 0);
  if (rows.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        Még nincs adat.
      </p>
    );
  }
  const base = total ?? rows.reduce((sum, r) => sum + r.count, 0);
  const pct = (n: number) =>
    base > 0 ? `${Math.round((n / base) * 100)}%` : "—";

  return (
    <BarChart
      data={rows}
      layout="vertical"
      responsive
      style={{ width: "100%", height: rows.length * 34 + 8 }}
      margin={{ top: 4, right: 56, bottom: 4, left: 0 }}
      barCategoryGap={8}
      accessibilityLayer
    >
      <XAxis type="number" hide domain={[0, "dataMax"]} />
      <YAxis
        type="category"
        dataKey="label"
        tick={{ ...AXIS_TICK, fill: "var(--foreground)" }}
        tickLine={false}
        axisLine={false}
        width={128}
      />
      <Tooltip
        cursor={{ fill: "var(--muted)", opacity: 0.5 }}
        content={({ active, payload }) => {
          const row = payload?.[0]?.payload as DistributionRow | undefined;
          if (!active || !row) return null;
          return (
            <TooltipBox
              title={row.label}
              value={`${nf(row.count)} ${unit}`}
              hint={`${pct(row.count)} az összesből`}
            />
          );
        }}
      />
      <Bar
        dataKey="count"
        fill="var(--primary)"
        radius={[0, 4, 4, 0]}
        minPointSize={2}
      >
        <LabelList
          dataKey="count"
          position="right"
          formatter={(v) => nf(Number(v))}
          style={{
            fill: "var(--muted-foreground)",
            fontSize: 12,
            fontVariantNumeric: "tabular-nums",
          }}
        />
      </Bar>
    </BarChart>
  );
}
