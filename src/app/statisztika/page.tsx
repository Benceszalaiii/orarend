import type { Metadata } from "next";
import { cookies } from "next/headers";
import { STATS_COOKIE, sessionIsValid } from "@/lib/stats-auth";
import { readUsage, usageStoreReady } from "@/lib/usage-store";
import { StatsDashboard } from "./dashboard";
import { LoginForm } from "./login-form";

//! EZ AZ OLDAL NEM A NYILVÁNOSSÁGÉ. A jelszó védi, de a keresők elől külön is
//! elzárjuk: egy indexelt belépőképernyő fölösleges támadási felület, és a
//! találati listában sem keresnivalója.
export const metadata: Metadata = {
  title: "Statisztika - Órarend",
  robots: { index: false, follow: false },
};

//! MINDIG FRISS. A süti alapján dől el, mit lát a látogató, és a számok is
//! percről percre változnak — ezt az oldalt tilos előre kirenderelni vagy
//! gyorsítótárazni.
export const dynamic = "force-dynamic";

export default async function StatisztikaPage({
  searchParams,
}: PageProps<"/statisztika">) {
  const store = await cookies();
  const authed = await sessionIsValid(store.get(STATS_COOKIE)?.value);

  if (!authed) {
    return (
      <main className="mx-auto flex min-h-[100dvh] max-w-2xl items-center px-5 py-10">
        <LoginForm />
      </main>
    );
  }

  const params = await searchParams;
  const raw = Array.isArray(params.days) ? params.days[0] : params.days;
  //* Csak a felkínált időszakokat engedjük — a napok száma így nem lehet se
  //* nulla, se ezres nagyságrendű lekérés.
  const allowed = [7, 30, 90, 365];
  const requested = Number(raw);
  const days = allowed.includes(requested) ? requested : 30;

  if (!usageStoreReady()) {
    return (
      <main className="mx-auto min-h-[100dvh] max-w-2xl px-5 py-16">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          A számláló nincs beállítva
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Hiányzik a{" "}
          <code className="text-foreground">REDIS_KV_REST_API_URL</code> vagy a{" "}
          <code className="text-foreground">REDIS_KV_REST_API_TOKEN</code>{" "}
          környezeti változó, ezért nincs honnan olvasni a számokat. Az órarend
          ettől függetlenül működik.
        </p>
      </main>
    );
  }

  const daily = await readUsage(days);

  const total: Record<string, number> = {};
  for (const day of daily) {
    for (const [short, count] of Object.entries(day.classes)) {
      total[short] = (total[short] ?? 0) + Number(count);
    }
  }
  const ranked = Object.entries(total)
    .map(([short, count]) => ({ class: short, count }))
    .sort((a, b) => b.count - a.count);

  return <StatsDashboard days={days} ranked={ranked} daily={daily} />;
}
