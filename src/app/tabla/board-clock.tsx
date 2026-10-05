"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

//! A KIJELZŐ MAGÁTÓL FRISSÜL. Senki nem nyúl hozzá: a „most" és a
//! „következik" csak akkor igaz, ha a lap újra lekéri magát. Két percenként
//! elég — a szakkörök órahatáron kezdenek, és a drága rész a szerveren
//! gyorsítótárban ül.
const REFRESH_MS = 2 * 60_000;

const clockFmt = new Intl.DateTimeFormat("hu-HU", {
  timeZone: "Europe/Budapest",
  hour: "2-digit",
  minute: "2-digit",
});

export function BoardClock() {
  const router = useRouter();
  const [time, setTime] = useState<string | null>(null);

  useEffect(() => {
    const tick = () => setTime(clockFmt.format(new Date()));
    tick();
    const clock = window.setInterval(tick, 10_000);
    const refresh = window.setInterval(() => router.refresh(), REFRESH_MS);
    return () => {
      window.clearInterval(clock);
      window.clearInterval(refresh);
    };
  }, [router]);

  return (
    <time
      className="text-5xl font-bold tabular-nums tracking-tight lg:text-7xl"
      suppressHydrationWarning
    >
      {time ?? " "}
    </time>
  );
}
