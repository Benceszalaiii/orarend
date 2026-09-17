import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import type { AccountStats } from "@/lib/admin-stats";
import type { UsageDay, UsageRank } from "@/lib/usage-store";
import { DistributionChart, TrendChart } from "./charts";

//! MIÉRT EGYETLEN SZÍN
//!
//! Egy sorozat van: „hány eszköz nézte". Az osztályok NEM rangsorolható
//! kategóriák — a 09A nem „kevesebb", mint a 13C, csak más. Ha minden oszlop
//! más színt kapna, a szín semmit nem kódolna (a hosszt már a hossz mutatja),
//! és pont az app saját elve sérülne: a szín információ, nem dekoráció. Ezért
//! minden oszlop ugyanaz a `--primary` — a sötét felületen ellenőrzött
//! kontraszttal. Ugyanez igaz a fiók- és beállítás-megoszlásokra is.

//! A „MA" NEM IDŐSZAK, HANEM PILLANATKÉP. Ugyanaz a napi bontású tároló adja,
//! csak egyetlen napra — így a mai nap önmagában is megnézhető anélkül, hogy egy
//! hetes átlagba olvadna bele. A szövegek külön nyelvtant kapnak rá lentebb.
const PERIODS = [
  { days: 1, label: "Ma" },
  { days: 7, label: "7 nap" },
  { days: 30, label: "30 nap" },
  { days: 90, label: "90 nap" },
  { days: 365, label: "1 év" },
] as const;

//* ISO hétfő-első sorrend; a `getUTCDay` vasárnappal kezd.
const WEEKDAYS = [
  "Hétfő",
  "Kedd",
  "Szerda",
  "Csütörtök",
  "Péntek",
  "Szombat",
  "Vasárnap",
];

const nf = (n: number) => n.toLocaleString("hu-HU");

export function StatsDashboard({
  days,
  usage,
  accounts,
}: {
  days: number;
  usage: { ranked: UsageRank[]; daily: UsageDay[] } | null;
  accounts: AccountStats | null;
}) {
  return (
    <main className="mt-6">
      <h2 className="text-lg font-semibold tracking-tight text-foreground">
        Statisztika
      </h2>
      <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
        A névtelen megnyitásszámláló és a fiókok összesített adatai. Egyik szám
        sem azonosít felhasználót, és a két forrás soha nem kapcsolódik össze.
      </p>

      {/*//* Az időszakválasztó egy sorban, a számok fölött — minden idősorra hat. */}
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
                href={`/admin/statisztika?days=${period.days}`}
                aria-current={active ? "page" : undefined}
              >
                {period.label}
              </Link>
            </Button>
          );
        })}
      </nav>

      <UsageSection days={days} usage={usage} />
      <AccountsSection days={days} accounts={accounts} />
      <PreferencesSection accounts={accounts} />
    </main>
  );
}

//! ─── HASZNÁLAT ─────────────────────────────────────────────────────────────

function UsageSection({
  days,
  usage,
}: {
  days: number;
  usage: { ranked: UsageRank[]; daily: UsageDay[] } | null;
}) {
  //* Egynapos nézetben az „elmúlt 1 nap" se nem magyaros, se nem igaz: az a mai
  //* nap. A számok ugyanazok, csak a szöveg igazodik.
  const today = days === 1;

  if (!usage) {
    return (
      <Section title="Használat" id="hasznalat">
        <Notice title="A számláló nincs beállítva">
          Hiányzik a{" "}
          <code className="text-foreground">REDIS_KV_REST_API_URL</code> vagy a{" "}
          <code className="text-foreground">REDIS_KV_REST_API_TOKEN</code>{" "}
          környezeti változó, ezért nincs honnan olvasni a számokat. Az órarend
          ettől függetlenül működik.
        </Notice>
      </Section>
    );
  }

  const { ranked, daily } = usage;
  const total = ranked.reduce((sum, row) => sum + row.count, 0);
  const top = ranked[0];
  const max = top?.count ?? 0;

  //* A napok a tárolóból ma→vissza sorrendben jönnek; az idővonalnak balról
  //* jobbra kell nőnie.
  const timeline = [...daily].reverse().map((day) => ({
    date: day.date,
    value: Object.values(day.classes).reduce((sum, n) => sum + Number(n), 0),
  }));
  const peak = timeline.reduce(
    (best, d) => (d.value > best.value ? d : best),
    timeline[0],
  );

  //! A HÉT NAPJAI CSAK HOSSZABB IDŐSZAKON MONDANAK VALAMIT. Egy hét alatt
  //! minden napból egy van — ott a napi görbe ugyanezt már megmutatja.
  const weekday = WEEKDAYS.map((label, i) => ({
    key: String(i),
    label,
    count: 0,
  }));
  for (const d of timeline) {
    const dow = (new Date(`${d.date}T12:00:00Z`).getUTCDay() + 6) % 7;
    weekday[dow].count += d.value;
  }

  return (
    <Section
      title="Használat"
      id="hasznalat"
      description="Hány eszköz nyitotta meg az egyes osztályok órarendjét. Egy eszköz naponta és osztályonként egyszer számít. Gépi kiolvasásra: GET /api/hasznalat, x-stats-key fejléccel."
    >
      {total === 0 ? (
        <EmptyState days={days} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile label="Összes megnyitás" value={nf(total)} />
            <StatTile
              label="Napi átlag"
              value={nf(Math.round(total / Math.max(days, 1)))}
            />
            <StatTile label="Aktív osztály" value={String(ranked.length)} />
            <StatTile
              label="Legtöbbet nézett"
              value={top ? top.class : "—"}
              hint={top ? `${nf(top.count)} megnyitás` : undefined}
            />
          </div>

          {timeline.length > 1 ? (
            <div
              className={
                days >= 14 ? "mt-3 grid gap-3 lg:grid-cols-[2fr_1fr]" : "mt-3"
              }
            >
              <Card
                title="Napi megnyitások"
                hint={`Csúcs: ${nf(peak.value)} megnyitás (${peak.date})`}
              >
                <TrendChart data={timeline} unit="megnyitás" />
              </Card>
              {days >= 14 ? (
                <Card title="A hét napjai szerint">
                  <DistributionChart
                    data={weekday}
                    total={total}
                    unit="megnyitás"
                    ordered
                  />
                </Card>
              ) : null}
            </div>
          ) : null}

          <div className="mt-8">
            <h4 className="text-sm font-semibold text-foreground">Osztályok</h4>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {today ? "A mai nap." : `Az elmúlt ${days} nap összesítve.`}
            </p>

            {/*//! TÁBLÁZAT ÉS DIAGRAM EGYSZERRE. Huszonhét osztálynál a puszta
                //! diagram már nem olvasható vissza pontosan, a puszta táblázatból
                //! viszont nem látszik az arány — ezért mindkettő: a sáv a
                //! nagyságrendé, a szám a pontosságé. */}
            <table className="mt-4 w-full max-w-3xl border-collapse">
              <caption className="sr-only">
                {today
                  ? "Osztályok megnyitás szerint csökkenő sorrendben, a mai napon"
                  : `Osztályok megnyitás szerint csökkenő sorrendben, az elmúlt ${days} napban`}
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
                      {nf(row.count)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mt-6 text-xs leading-relaxed text-muted-foreground">
            A számok osztályszintűek. Ha bárhol megmutatod őket, az 5 alatti
            értékeket hagyd ki — egyetlen megnyitás már nem egy csoportról szól.
          </p>
        </>
      )}
    </Section>
  );
}

//! ─── FIÓKOK ────────────────────────────────────────────────────────────────

function AccountsSection({
  days,
  accounts,
}: {
  days: number;
  accounts: AccountStats | null;
}) {
  if (!accounts) {
    return (
      <Section title="Felhasználók" id="felhasznalok">
        <DatabaseNotice />
      </Section>
    );
  }

  const { totals } = accounts;
  const growth = accounts.growth.map((d) => ({ date: d.date, value: d.total }));
  const signups = accounts.growth.map((d) => ({
    date: d.date,
    value: d.value,
  }));

  return (
    <Section
      title="Felhasználók"
      id="felhasznalok"
      description="A bejelentkezett fiókok — a belépés nélküli látogatók nem szerepelnek itt."
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Összes fiók" value={nf(totals.users)} />
        <StatTile
          label={days === 1 ? "Új fiók ma" : `Új fiók (${days} nap)`}
          value={nf(totals.newInPeriod)}
        />
        <StatTile
          label="Aktív (7 nap)"
          value={nf(
            accounts.activity
              .filter((a) => a.key === "1" || a.key === "7")
              .reduce((sum, a) => sum + a.count, 0),
          )}
        />
        <StatTile
          label="Passkey-vel"
          value={nf(totals.withPasskey)}
          hint={percentOf(totals.withPasskey, totals.users)}
        />
        <StatTile label="Diák osztállyal" value={nf(totals.students)} />
        <StatTile label="Tanár" value={nf(totals.teachers)} />
        <StatTile label="Üzemeltető" value={nf(totals.admins)} />
        <StatTile label="Kitiltva" value={nf(totals.banned)} />
      </div>

      {days > 1 ? (
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          <Card title="Összes fiók" hint="A létszám a nap végén.">
            <TrendChart data={growth} unit="fiók" />
          </Card>
          <Card title="Új fiókok naponta">
            <TrendChart data={signups} unit="új fiók" kind="bar" />
          </Card>
        </div>
      ) : null}

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <Card
          title="Utolsó aktivitás"
          hint="Mikor járt itt utoljára bejelentkezve."
        >
          <DistributionChart
            data={accounts.activity}
            total={totals.users}
            ordered
          />
        </Card>
        <Card
          title="Belépési mód"
          hint="Egy fióknak több is lehet, ezért az összeg eltérhet."
        >
          <DistributionChart
            data={accounts.providers}
            total={totals.users}
            unit="kötés"
          />
        </Card>
        <Card
          title="Képességek"
          hint="Hány fiók használja az egyes funkciókat."
        >
          <DistributionChart data={accounts.features} total={totals.users} />
        </Card>
        <Card title="Tartalom" hint="Az eddig felvett sorok száma.">
          <dl className="grid grid-cols-3 gap-3 pt-1">
            <MiniStat
              label="Saját óralink"
              value={accounts.content.lessonLinks}
            />
            <MiniStat
              label="Tanári link"
              value={accounts.content.teacherLinks}
            />
            <MiniStat label="Kivetítő" value={accounts.content.screens} />
          </dl>
        </Card>
      </div>

      {accounts.classes.length > 0 ? (
        <Card
          className="mt-3"
          title="Diákfiókok osztályonként"
          hint="Csak az iskolai rendszerből ismert osztállyal rendelkező diákok."
        >
          <DistributionChart data={accounts.classes} total={totals.students} />
        </Card>
      ) : null}
    </Section>
  );
}

//! ─── BEÁLLÍTÁSOK ───────────────────────────────────────────────────────────
//! A megoszlások alapja a SZINKRONIZÁLT beállítással rendelkező fiókok száma,
//! nem az összes fiók — aki sosem szinkronizált, arról nem tudunk semmit, és
//! ezt nem szabad „nincs beállítva"-ként elkönyvelni. Kivétel a preset: az a
//! `User` saját oszlopa, tehát ott mindenki számít.

function PreferencesSection({ accounts }: { accounts: AccountStats | null }) {
  if (!accounts) return null;
  const { prefs, totals } = accounts;
  const base = totals.withPrefs;

  return (
    <Section
      title="Beállítások"
      id="beallitasok"
      description={`Mit választanak a felhasználók. ${nf(base)} fióknak van szinkronizált beállítása (${percentOf(base, totals.users)}).`}
    >
      <div className="grid gap-3 lg:grid-cols-2">
        <Card title="Téma" hint="Világos, sötét vagy a készülék beállítása.">
          <DistributionChart data={prefs.theme} total={base} />
        </Card>
        <Card title="Tantárgyszínek" hint="A választott paletta.">
          <DistributionChart data={prefs.palette} total={base} />
        </Card>
        <Card
          title="Színséma (tweakcn)"
          hint="A leggyakoribb presetek, az összes fiókra vetítve."
        >
          <DistributionChart
            data={topWithOther(prefs.preset, 8)}
            total={totals.users}
          />
        </Card>
        <Card title="Utoljára nézett nézet">
          <DistributionChart data={prefs.lastView} total={base} />
        </Card>
        <Card title="Kinek a szemével" hint="Osztály- vagy tanári olvasat.">
          <DistributionChart data={prefs.identity} total={base} />
        </Card>
        <Card
          title="Elrejtett menüpontok"
          hint="Hány fiók rejtette el az egyes sorokat."
        >
          <DistributionChart data={prefs.hiddenMenu} total={base} />
        </Card>
      </div>
    </Section>
  );
}

//! ─── ÉPÍTŐKÖVEK ────────────────────────────────────────────────────────────

//* Hosszú farok helyett „Egyéb": kilenc sornál több már nem összehasonlítás.
function topWithOther<T extends { key: string; label: string; count: number }>(
  rows: T[],
  limit: number,
) {
  if (rows.length <= limit) return rows;
  const rest = rows.slice(limit - 1).reduce((sum, r) => sum + r.count, 0);
  return [
    ...rows.slice(0, limit - 1),
    { key: "__other", label: "Egyéb", count: rest },
  ];
}

function percentOf(part: number, whole: number): string {
  return whole > 0 ? `${Math.round((part / whole) * 100)}%` : "—";
}

function Section({
  title,
  id,
  description,
  children,
}: {
  title: string;
  id: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="mt-12 first-of-type:mt-8">
      <h3
        id={id}
        className="text-base font-semibold tracking-tight text-foreground"
      >
        {title}
      </h3>
      {description ? (
        <p className="mt-1 mb-4 max-w-2xl text-sm text-muted-foreground">
          {description}
        </p>
      ) : (
        <div className="mb-4" />
      )}
      {children}
    </section>
  );
}

function Card({
  title,
  hint,
  className,
  children,
}: {
  title: string;
  hint?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={`min-w-0 rounded-lg border border-border bg-card px-4 py-3.5 ${className ?? ""}`}
    >
      <h4 className="text-sm font-medium text-foreground">{title}</h4>
      {hint ? (
        <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
      ) : null}
      <div className="mt-3">{children}</div>
    </div>
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

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-xl font-bold tracking-tight text-foreground tabular-nums">
        {nf(value)}
      </dd>
    </div>
  );
}

function Notice({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card px-5 py-4">
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
        {children}
      </p>
    </div>
  );
}

function DatabaseNotice() {
  return (
    <Notice title="Az adatbázis nem érhető el">
      Hiányzik a <code className="text-foreground">DB_URL</code> környezeti
      változó, vagy a lekérdezés hibára futott (részletek a szervernaplóban).
    </Notice>
  );
}

//! AZ ÜRES ÁLLAPOT IS MONDJON VALAMIT. „Nincs adat" önmagában nem segít: azt
//! kell megmondania, hogy ez hiba-e, és mikor várható adat.
function EmptyState({ days }: { days: number }) {
  const today = days === 1;
  return (
    <div className="rounded-lg border border-border bg-card px-5 py-8 text-center">
      <p className="text-sm font-medium text-foreground">
        {today ? "Ma még nincs adat" : "Még nincs adat erre az időszakra"}
      </p>
      <p className="mx-auto mt-1.5 max-w-md text-sm leading-relaxed text-muted-foreground">
        {today
          ? "Ma még egyetlen megnyitást sem rögzítettünk."
          : `Az elmúlt ${days} napban egyetlen megnyitást sem rögzítettünk.`}{" "}
        Ez nem hiba: a számláló csak akkor kap adatot, ha valaki megnyitja az
        órarendet, és eszközönként naponta egyszer számol.
      </p>
    </div>
  );
}
