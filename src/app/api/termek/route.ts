import { freeRoomsAt } from "@/lib/free-rooms";
import {
  isServableDate,
  loadWeekOccupancy,
  servableWeeks,
} from "@/lib/free-rooms-source";
import { budapestNow } from "@/lib/push-plan";
import { mondayOf } from "@/lib/timetable";

//! ─── MELYIK TEREM ÜRES MOST ────────────────────────────────────────────────
//! A böngésző NEM kérdezheti meg magától: egy hét teremfoglaltsága 71 kérés a
//! Jedlikinfo felé (miért, azt a `free-rooms-source.ts` fejléce írja le), és
//! ezt minden egyes látogatónál újrafuttatni annyi volna, mint az iskola saját
//! szerverét terhelni azzal, hogy nálunk nincs gyorsítótár. Ezért a seprés ITT,
//! a szerveren történik, egyszer óránként, és minden látogató ugyanabból a
//! pillanatképből kap választ.
//*
//* Nyilvános végpont, mint maga az órarend: nincs benne semmi, ami egy diákról
//* szólna — csak az, hogy melyik teremben van óra.

const TIME_PATTERN = /^(\d{1,2}):(\d{2})$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function parseMinute(value: string | null): number | null {
  if (!value) return null;
  const match = TIME_PATTERN.exec(value.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const now = budapestNow();

  const dayParam = params.get("nap");
  //! A SZERVER UTC-BEN FUT, A CSENGŐ NEM. Nap és perc egyaránt budapesti idő —
  //! ugyanaz a megfontolás, mint a `push-plan.ts`-ben.
  const dateKey = dayParam?.trim() || now.dayKey;
  if (!DATE_PATTERN.test(dateKey)) {
    return Response.json(
      { error: "A `nap` paraméter alakja `ÉÉÉÉ-HH-NN`." },
      { status: 400 },
    );
  }

  const timeParam = params.get("ido");
  const minute = timeParam ? parseMinute(timeParam) : now.minutes;
  if (minute === null) {
    return Response.json(
      { error: "Az `ido` paraméter alakja `ÓÓ:PP`." },
      { status: 400 },
    );
  }

  //! AZ ABLAKON KÍVÜLI NAP NEM HIBA, HANEM HATÁR. Enélkül elég volna elég sok
  //! különböző dátumot végigkérni ahhoz, hogy minden egyes kérés egy újabb
  //! 71-es seprést indítson a Jedlikinfo felé — a válasz ezért megmondja, mi a
  //! lekérhető tartomány, ahelyett hogy csendben üres listát adna.
  if (!isServableDate(dateKey)) {
    const weeks = servableWeeks();
    return Response.json(
      {
        error:
          "Csak a mai hét környékére tudunk teremfoglaltságot mondani. A `nap` ezen kívül esik.",
        weekStart: mondayOf(dateKey),
        servableWeeks: weeks,
      },
      { status: 400 },
    );
  }

  const occupancy = await loadWeekOccupancy(mondayOf(dateKey));
  if (!occupancy) {
    //* Se friss, se lejárt példány — a Jedlikinfo nem érhető el, és nem a
    //* látogató hibájából. Az 503 megmondja, hogy érdemes később újrapróbálni.
    return Response.json(
      {
        error:
          "A Jedlikinfo API-ból most nem sikerült lekérni a teremfoglaltságot.",
      },
      { status: 503 },
    );
  }

  const answer = freeRoomsAt(occupancy, dateKey, minute);

  return Response.json({
    ...answer,
    //! MENNYIRE RÉGI EZ A VÁLASZ. A pillanatkép óránként frissül, és egy
    //! sikertelen seprés után LEJÁRT példányt is kiszolgálunk — ezt elhallgatni
    //! rosszabb volna, mint kiírni. A hívó ebből tudja, mennyire hihet neki.
    ageMinutes: Math.max(
      0,
      Math.floor((Date.now() - answer.fetchedAt) / 60_000),
    ),
  });
}
