import { ArrowLeft, LogOut } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { UsageDay } from "@/lib/usage-store";
import { logout } from "./actions";

//! MIÉRT EGYETLEN SZÍN
//!
//! Egy sorozat van: „hány eszköz nézte". Az osztályok NEM rangsorolható
//! kategóriák — a 09A nem „kevesebb", mint a 13C, csak más. Ha minden oszlop
//! más színt kapna, a szín semmit nem kódolna (a hosszt már a hossz mutatja),
//! és pont az app saját elve sérülne: a szín információ, nem dekoráció. Ezért
//! minden oszlop ugyanaz a `--primary` — a sötét felületen ellenőrzött
//! kontraszttal.
const PERIODS = [
  { days: 7, label: "7 nap" },
  { days: 30, label: "30 nap" },
  { days: 90, label: "90 nap" },
  { days: 365, label: "1 év" },
] as const;

type Ranked = { class: string; count: number };

export function StatsDashboard({
  days,
  ranked,
  daily,
}: {
  days: number;
  ranked: Ranked[];
  daily: UsageDay[];
}) {
  const total = ranked.reduce((sum, row) => sum + row.count, 0);
  const top = ranked[0];
  const max = top?.count ?? 0;

  //* A napok a tárolóból ma→vissza sorrendben jönnek; az idővonalnak balról
  //* jobbra kell nőnie.
  const timeline = [...daily].reverse();
  const dailyTotals = timeline.map((day) =>
    Object.values(day.classes).reduce((sum, n) => sum + Number(n), 0),
  );

  return (
    <main className="mx-auto min-h-[100dvh] w-full max-w-3xl px-5 py-10 sm:py-14">
      <div className="flex items-center justify-between gap-4">
        <Link
          href="/orarend"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Vissza az órarendhez
        </Link>
        <form action={logout}>
          <Button type="submit" variant="ghost" size="sm">
            <LogOut aria-hidden />
            Kilépés
          </Button>
        </form>
      </div>

      <h1 className="mt-6 text-2xl font-bold tracking-tight text-foreground">
        Használati statisztika
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Hány eszköz nyitotta meg az egyes osztályok órarendjét. Egy eszköz
        naponta és osztályonként egyszer számít.
      </p>

      {/*//* Az időszakválasztó egy sorban, a számok fölött. */}
      <nav aria-label="Időszak" className="mt-6 flex flex-wrap gap-1.5">
        {PERIODS.map((period) => {
          const active = period.days === days;
          return (
            <Button
              key={period.days}
              asChild
              size="sm"
              variant={active ? "default" : "outline"}
            >
              <Link
                href={`/statisztika?days=${period.days}`}
                aria-current={active ? "page" : undefined}
              >
                {period.label}
              </Link>
            </Button>
          );
        })}
      </nav>

      {total === 0 ? (
        <EmptyState days={days} />
      ) : (
        <>
          <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <StatTile
              label="Összes megnyitás"
              value={total.toLocaleString("hu-HU")}
            />
            <StatTile label="Aktív osztály" value={String(ranked.length)} />
            <StatTile
              label="Legtöbbet nézett"
              value={top ? top.class : "—"}
              hint={
                top
                  ? `${top.count.toLocaleString("hu-HU")} megnyitás`
                  : undefined
              }
            />
          </div>

          <DailyTrend
            dates={timeline.map((d) => d.date)}
            totals={dailyTotals}
          />

          <section className="mt-10">
            <h2 className="text-base font-semibold text-foreground">
              Osztályok
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Az elmúlt {days} nap összesítve.
            </p>

            {/*//! TÁBLÁZAT ÉS DIAGRAM EGYSZERRE. Huszonhét osztálynál a puszta
                //! diagram már nem olvasható vissza pontosan, a puszta táblázatból
                //! viszont nem látszik az arány — ezért mindkettő: a sáv a
                //! nagyságrendé, a szám a pontosságé. */}
            <table className="mt-4 w-full border-collapse">
              <caption className="sr-only">
                Osztályok megnyitás szerint csökkenő sorrendben, az elmúlt{" "}
                {days} napban
              </caption>
              <thead>
                <tr className="border-b border-border">
                  <th
                    scope="col"
                    className="w-16 py-2 text-left text-xs font-medium text-muted-foreground"
                  >
                    Osztály
                  </th>
                  <th
                    scope="col"
                    className="py-2 text-left text-xs font-medium text-muted-foreground"
                  >
                    Arány
                  </th>
                  <th
                    scope="col"
                    className="w-20 py-2 text-right text-xs font-medium text-muted-foreground"
                  >
                    Megnyitás
                  </th>
                </tr>
              </thead>
              <tbody>
                {ranked.map((row) => (
                  <tr
                    key={row.class}
                    className="border-b border-border/50 transition-colors hover:bg-muted/40"
                  >
                    <th
                      scope="row"
                      className="py-2.5 text-left text-sm font-medium text-foreground tabular-nums"
                    >
                      {row.class}
                    </th>
                    <td className="py-2.5 pr-4">
                      {/*//! A SÁV DÍSZ NÉLKÜL. Vékony, lekerekített vég, a
                          //! sávalap egy árnyalattal a felület fölött — keret
                          //! nélkül, mert a keret csak zajt adna hozzá. */}
                      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{
                            width: `${max > 0 ? Math.max((row.count / max) * 100, 2) : 0}%`,
                          }}
                        />
                      </div>
                    </td>
                    <td className="py-2.5 text-right text-sm text-muted-strong tabular-nums">
                      {row.count.toLocaleString("hu-HU")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}

      <p className="mt-10 text-xs leading-relaxed text-muted-foreground">
        A számok osztályszintűek. Ha bárhol megmutatod őket, az 5 alatti
        értékeket hagyd ki — egyetlen megnyitás már nem egy csoportról szól.
      </p>
    </main>
  );
}

function StatTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-bold tracking-tight text-foreground tabular-nums">
        {value}
      </p>
      {hint ? (
        <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

//! A NAPI GÖRBE EGYETLEN SOROZAT, ezért nincs jelmagyarázat — a cím megnevezi.
//! Nem minden pont kap címkét: a tengely két vége és a csúcs elég, a többit a
//! `title` (natív buborék) viszi.
function DailyTrend({ dates, totals }: { dates: string[]; totals: number[] }) {
  if (totals.length < 2) return null;
  const max = Math.max(...totals, 1);
  const width = 100;
  const height = 28;

  const points = totals.map((value, i) => {
    const x = (i / (totals.length - 1)) * width;
    const y = height - (value / max) * height;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });
  const line = `M${points.join(" L")}`;
  const area = `${line} L${width},${height} L0,${height} Z`;

  const peak = totals.indexOf(Math.max(...totals));

  return (
    <section className="mt-6 rounded-lg border border-border bg-card px-4 py-3.5">
      <h2 className="text-xs text-muted-foreground">Napi megnyitások</h2>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className="mt-2 h-16 w-full"
        role="img"
        aria-label={`Napi megnyitások ${dates[0]} és ${dates[dates.length - 1]} között. Csúcs: ${totals[peak]} megnyitás ${dates[peak]} napon.`}
      >
        <title>Napi megnyitások</title>
        <path d={area} className="fill-primary/15" />
        <path
          d={line}
          className="stroke-primary"
          fill="none"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      {/*//! A TENGELY KÉT VÉGE EGY SOR, A CSÚCS EGY MÁSIK. Egy sorba zsúfolva a
          //! három felirat telefonon összeér, és egy hosszabb csúcsérték már át
          //! is fedné a dátumot — a csúcs ezért saját sort kap. */}
      <div className="mt-1.5 flex justify-between text-xs text-muted-foreground tabular-nums">
        <span>{dates[0]}</span>
        <span>{dates[dates.length - 1]}</span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground tabular-nums">
        Csúcs: {totals[peak].toLocaleString("hu-HU")} megnyitás ({dates[peak]})
      </p>
    </section>
  );
}

//! AZ ÜRES ÁLLAPOT IS MONDJON VALAMIT. „Nincs adat" önmagában nem segít: azt
//! kell megmondania, hogy ez hiba-e, és mikor várható adat.
function EmptyState({ days }: { days: number }) {
  return (
    <div className="mt-8 rounded-lg border border-border bg-card px-5 py-8 text-center">
      <p className="text-sm font-medium text-foreground">
        Még nincs adat erre az időszakra
      </p>
      <p className="mx-auto mt-1.5 max-w-md text-sm leading-relaxed text-muted-foreground">
        Az elmúlt {days} napban egyetlen megnyitást sem rögzítettünk. Ez nem
        hiba: a számláló csak akkor kap adatot, ha valaki megnyitja az
        órarendet, és eszközönként naponta egyszer számol.
      </p>
    </div>
  );
}
