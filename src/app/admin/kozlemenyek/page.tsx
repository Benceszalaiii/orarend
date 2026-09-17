import type { Metadata } from "next";
import { requireAdmin } from "@/lib/announcement-store";
import prisma from "@/lib/prisma";
import { AccessDenied } from "../_components/access-denied";
import { AnnouncementManager } from "./announcement-manager";

export const metadata: Metadata = {
  title: "Közlemények – Órarend",
  robots: { index: false, follow: false },
};

//! MINDIG FRISS: a munkamenettől függ, mit lát a látogató.
export const dynamic = "force-dynamic";

export default async function KozlemenyekPage() {
  if (!(await requireAdmin())) {
    return <AccessDenied next="/admin/kozlemenyek" />;
  }

  const rows = await prisma.announcement.findMany({
    orderBy: { createdAt: "desc" },
  });

  return (
    <main className="mt-6 max-w-3xl">
      <p className="text-sm leading-relaxed text-muted-foreground">
        Üzenet a lap tetejére, kattintásig maradó buborék, vagy a lapot letiltó
        hibaképernyő. Mentés után legfeljebb fél perc, mire mindenkinél
        megjelenik. Az <code>/admin</code> és a <code>/belepes</code> lapot a
        letiltás sosem takarja el.
      </p>
      <AnnouncementManager
        rows={rows.map((row) => ({
          id: row.id,
          kind: row.kind,
          tone: row.tone,
          title: row.title,
          message: row.message,
          paths: row.paths,
          active: row.active,
          startsAt: row.startsAt?.toISOString() ?? null,
          endsAt: row.endsAt?.toISOString() ?? null,
          updatedAt: row.updatedAt.toISOString(),
        }))}
      />
    </main>
  );
}
