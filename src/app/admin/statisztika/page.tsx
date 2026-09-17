import type { Metadata } from "next";
import { loadAccountStats } from "@/lib/admin-stats";
import { requireAdmin } from "@/lib/announcement-store";
import { rankUsage, readUsage, usageStoreReady } from "@/lib/usage-store";
import { AccessDenied } from "../_components/access-denied";
import { StatsDashboard } from "./dashboard";

export const metadata: Metadata = {
  title: "Statisztika – Órarend",
  robots: { index: false, follow: false },
};

//! MINDIG FRISS. A munkamenet dönti el, mit lát a látogató, és a számok is
//! percről percre változnak — ezt az oldalt tilos előre kirenderelni.
export const dynamic = "force-dynamic";

//* Csak a felkínált időszakokat engedjük — a napok száma így nem lehet se
//* nulla, se ezres nagyságrendű lekérés.
const ALLOWED_DAYS = [1, 7, 30, 90, 365];

export default async function AdminStatisztikaPage({
  searchParams,
}: PageProps<"/admin/statisztika">) {
  if (!(await requireAdmin())) {
    return <AccessDenied next="/admin/statisztika" />;
  }

  const params = await searchParams;
  const raw = Array.isArray(params.days) ? params.days[0] : params.days;
  const requested = Number(raw);
  const days = ALLOWED_DAYS.includes(requested) ? requested : 30;

  //! A KÉT FORRÁS EGYMÁSTÓL FÜGGETLENÜL HIÁNYOZHAT. A névtelen számláló a
  //! Redisben él, a fiókok a Postgresben — ha az egyik nincs beállítva vagy
  //! épp elhasal, a másik fele a lapnak attól még mondjon valamit.
  const [daily, accounts] = await Promise.all([
    usageStoreReady() ? readUsage(days) : Promise.resolve(null),
    process.env.DB_URL
      ? loadAccountStats(days).catch((error: unknown) => {
          console.error("[orarend] admin statisztika:", error);
          return null;
        })
      : Promise.resolve(null),
  ]);

  return (
    <StatsDashboard
      days={days}
      usage={daily ? { daily, ranked: rankUsage(daily) } : null}
      accounts={accounts}
    />
  );
}
