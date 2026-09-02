//! A NAPHATÁR BUDAPESTI, NEM UTC-S. Két külön ok miatt kell ez, és mindkettő
//! elromlana `toISOString()`-gel:
//!
//! 1. A SZERVER UTC-ben fut a Vercelen, a suli viszont nem. UTC szerint a
//!    magyar éjfél utáni első két óra még az ELŐZŐ naphoz számítana.
//! 2. A kliens a saját időzónájában él. Külföldről (vagy elállított órával)
//!    megnyitva a napi deduplikáció más napot látna, mint amit a szerver
//!    könyvel — ugyanaz az eszköz így kétszer is beleszámíthatna egy napba.
//!
//! Mindkét oldal EZT az egy függvényt használja, így a két számítás nem tud
//! elcsúszni egymástól.
const TIME_ZONE = "Europe/Budapest";

//* Az `en-CA` formátum épp `YYYY-MM-DD` — ugyanaz az alak, amit az app
//* mindenhol máshol is dátumkulcsként használ.
const dayFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function usageDayKey(date = new Date()): string {
  return dayFormatter.format(date);
}

//* Napkulcsból napkulcs, `n` nappal korábbra. A számolás a kulcson megy (UTC
//* délben, hogy a nyári időszámítás váltása se tolja el), nem valós időn.
export function shiftDayKey(dayKey: string, days: number): string {
  const [y, m, d] = dayKey.split("-").map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d, 12));
  utc.setUTCDate(utc.getUTCDate() + days);
  return utc.toISOString().slice(0, 10);
}
