//! A FORRÁS UGYANAZ, AZ ÚT ODÁIG NEM. A böngészőből a `/api/jedlik` átirányítón
//! megyünk (lásd `next.config.ts`) — enélkül a kérés más eredetre menne, és a
//! CORS elbukna. A SZERVEREN viszont nincs se `location`, se átirányító: ott a
//! relatív útvonalból nem lesz érvényes URL, ezért közvetlenül a Jedlikinfót
//! hívjuk.
//!
//! EZ A DÖNTÉS EGY HELYEN ÁLL. Az órarend (`timetable.ts`) és a tanév rendje
//! (`school-calendar.ts`) ugyanahhoz az API-hoz megy; ha mindkettő maga
//! találná ki az útvonalat, előbb-utóbb csak az egyik kerülne át egy új
//! átirányító mögé, és a másik némán elbukna a CORS-on.

export const JEDLIK_API_ORIGIN = "https://jedlikinfo.jedlik.eu/api/api";

export const API_BASE =
  typeof window === "undefined" ? JEDLIK_API_ORIGIN : "/api/jedlik";

//! A `timetable/cards` CSAK A SAJÁT OLDALÁNAK VÁLASZOL. A Jedlikinfo a POST
//! kéréseket 403-mal utasítja el, ha nem a saját felülete felől jönnek:
//! `Origin` ÉS `Referer` együtt kell (bármelyik egyedül kevés — ellenőrizve
//! 2026-09-23). A böngészőben ezeket nem mi állítjuk (tiltott fejlécek), a
//! SZERVEREN viszont semmi nem küldi őket helyettünk — enélkül a teremkereső
//! 71 kérése mind elbukik, és a `/api/termek` 503-at ad.
const JEDLIK_SITE = "https://jedlikinfo.jedlik.eu";

export const JEDLIK_POST_HEADERS: Record<string, string> =
  typeof window === "undefined"
    ? {
        "Content-Type": "application/json",
        Origin: JEDLIK_SITE,
        Referer: `${JEDLIK_SITE}/`,
      }
    : { "Content-Type": "application/json" };

export const FETCH_TIMEOUT_MS = 15_000;

//! A KIEGÉSZÍTŐ ADAT NEM VÁRATHATJA MEG A RÁCSOT. A tanév rendje és a napi
//! csengetési rend nem az órarend, hanem a KÖRÜLMÉNYE: ha nem jön meg, a rács
//! attól még igazat mutat. Ezért rövidebb határidőt kap, mint maga az órarend —
//! egy 15 másodpercig várató jegyzet miatt nem érheti késés az órákat.
export const SIDE_FETCH_TIMEOUT_MS = 6_000;
