import { NextResponse } from "next/server";
import { listLiveAnnouncements } from "@/lib/announcement-store";

//! ─── A KÖZLEMÉNYEK NYILVÁNOS VÉGPONTJA ─────────────────────────────────────
//! MINDENKINEK UGYANAZ, tehát a CDN nyugodtan eltarthatja — rövid ideig. Egy
//! bekapcsolt karbantartás így legfeljebb fél perc alatt ér ki mindenkihez, és
//! közben nem minden oldalbetöltés kérdezi meg az adatbázist.
//*
//! MIÉRT NEM A LAYOUT OLVASSA KÖZVETLENÜL: a lapok statikusak. Egy adatbázis-
//! lekérés a gyökér-layoutban MINDEN lapot kérésenként rendereltté tenne egy
//! olyan adatért, ami az idő 99%-ában üres lista.
export const dynamic = "force-dynamic";

export async function GET() {
  const announcements = await listLiveAnnouncements();
  return NextResponse.json(
    { announcements },
    {
      headers: {
        "Cache-Control":
          "public, max-age=0, s-maxage=30, stale-while-revalidate=60",
      },
    },
  );
}
