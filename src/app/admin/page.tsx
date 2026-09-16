import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/announcement-store";
import prisma from "@/lib/prisma";
import { AnnouncementManager } from "./announcement-manager";

export const metadata: Metadata = {
  title: "Közlemények – Órarend",
  robots: { index: false, follow: false },
};

//! MINDIG FRISS: a munkamenettől függ, mit lát a látogató.
export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const admin = await requireAdmin();

  if (!admin) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5 py-10">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Nincs hozzáférésed
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          A közleményeket csak üzemeltetői joggal rendelkező fiók kezelheti. Ha
          van ilyen fiókod, lépj be vele.
        </p>
        <Link
          href="/belepes?tovabb=/admin"
          className="mt-4 text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          Belépés
        </Link>
      </main>
    );
  }

  const rows = await prisma.announcement.findMany({
    orderBy: { createdAt: "desc" },
  });

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-10">
      <h1 className="text-2xl font-bold tracking-tight text-foreground">
        Közlemények
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
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
