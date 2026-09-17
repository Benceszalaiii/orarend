import type { Metadata } from "next";
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

  if (!usageStoreReady()) {
    return (
      <main className="mt-6 max-w-2xl">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">
          A számláló nincs beállítva
        </h2>
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

  const params = await searchParams;
  const raw = Array.isArray(params.days) ? params.days[0] : params.days;
  const requested = Number(raw);
  const days = ALLOWED_DAYS.includes(requested) ? requested : 30;

  const daily = await readUsage(days);

  return <StatsDashboard days={days} ranked={rankUsage(daily)} daily={daily} />;
}
