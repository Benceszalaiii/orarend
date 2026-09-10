//! ═══════════════════════════════════════════════════════════════════════════
//! AZ iCALENDAR SZÖVEG — CSAK A FORMA, SEMMI ÓRAREND
//! ═══════════════════════════════════════════════════════════════════════════
//! Ez a modul nem tud az órarendről: eseményeket kap, és RFC 5545 szerinti
//! szöveget ad. Azért él külön, mert az iCalendar három olyan szabályt ír elő,
//! amit első nekifutásra MINDENKI elront, és a hibája nem kivétel, hanem egy
//! naptár, ami némán nem importál:
//!
//!  1. CRLF. Nem `\n`. Egy LF-es feedet az Outlook csendben eldob.
//!  2. 75 OKTETTES SORHOSSZ, és a hajtás nem a karakterszámon múlik, hanem a
//!     BÁJTOKON — „Hálózat programozása és IoT elmélet" ékezetei kétszer
//!     számolnak. Egy többbájtos karakter KÖZÉPEN hajtva érvénytelen UTF-8-at
//!     ad, és onnantól a fájl maradéka is romlott.
//!  3. ESCAPE. A tantárgynevekben van vessző és pontosvessző (a forrásból
//!     jönnek, nem mi írjuk őket); escape nélkül ezek új mezőt kezdenek, és az
//!     esemény fele elveszik.
//!
//! AZ IDŐZÓNA KÜLÖN DÖNTÉS, ÉS SZÁNDÉKOSAN NEM UTC. Az órarend percei helyi
//! (budapesti) idők éjféltől; UTC-re váltani azt jelentené, hogy minden
//! eseményhez ki kell számolni, épp nyári időszámítás van-e — ez az a fajta
//! hiba, ami évente kétszer, egy hétvégén, egy órával elcsúszott órarendként
//! derül ki. A `TZID` + beágyazott `VTIMEZONE` ezt a számítást TELJESEN
//! megkerüli: a nyers helyi időt írjuk le, és a szabályt a naptár alkalmazza.
//! ═══════════════════════════════════════════════════════════════════════════

import { pad } from "@/components/timetable/shared";

export const ICS_TIME_ZONE = "Europe/Budapest";

//! A SOR HOSSZA OKTETTBEN, NEM KARAKTERBEN (RFC 5545 3.1). A folytatósor EGY
//! szóközzel kezdődik, és az a szóköz is beleszámít a 75-be — ezért a második
//! és további darabok 74 oktettet kapnak.
const MAX_OCTETS = 75;

const encoder = new TextEncoder();

function octets(value: string): number {
  return encoder.encode(value).length;
}

//! KÓDPONTONKÉNT LÉPÜNK, NEM BÁJTONKÉNT. Az `Array.from` a surrogate párokat
//! (emoji a terem nevében — a forrás ilyet is küldött már) egyben hagyja, tehát
//! a hajtás sosem esik egy karakter közepére.
function fold(line: string): string {
  if (octets(line) <= MAX_OCTETS) return line;

  const out: string[] = [];
  let current = "";
  let limit = MAX_OCTETS;

  for (const char of Array.from(line)) {
    if (octets(current) + octets(char) > limit) {
      out.push(current);
      current = char;
      //* A folytatósorok elé szóköz kerül az összefűzésnél — annyival kevesebb
      //* hely marad a tartalomnak.
      limit = MAX_OCTETS - 1;
      continue;
    }
    current += char;
  }
  out.push(current);
  return out.join("\r\n ");
}

//! AZ ESCAPE SORRENDJE KÖTÖTT. A visszaperjel MEGY ELŐRE: ha utólag cserélnénk,
//! a saját, frissen beszúrt perjeleinket escape-elnénk újra, és a szövegben
//! `\\,` jelenne meg `\,` helyett.
function escapeText(value: string): string {
  return (
    value
      .replace(/\\/g, "\\\\")
      .replace(/;/g, "\\;")
      .replace(/,/g, "\\,")
      //* A tényleges sortörés az iCalendarban `\n` (két karakter), nem CRLF.
      .replace(/\r\n|\r|\n/g, "\\n")
  );
}

/** `YYYY-MM-DD` + percek éjféltől → `YYYYMMDDTHHMMSS` (helyi idő, `TZID`-vel). */
export function icsLocalTime(dateKey: string, minutes: number): string {
  const date = dateKey.replaceAll("-", "");
  const hour = Math.floor(minutes / 60);
  const minute = Math.round(minutes % 60);
  return `${date}T${pad(hour)}${pad(minute)}00`;
}

/** Epoch ms → `YYYYMMDDTHHMMSSZ`. A `DTSTAMP` mindig UTC, ez a szabvány. */
export function icsUtcStamp(epochMs: number): string {
  return `${new Date(epochMs).toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`;
}

export type IcsEvent = {
  //! AZ UID A NAPTÁR SZÁMÁRA AZ ESEMÉNY AZONOSSÁGA. Ha frissítéskor más lenne,
  //! a naptár nem felülírná az előzőt, hanem MELLÉ tenne egy másodikat — és egy
  //! óránként frissülő feedből napok alatt olvashatatlan kása lenne. Ezért a
  //! hívó dolga stabil azonosítót adni (lásd `calendar-feed.ts`).
  uid: string;
  /** A nap (`YYYY-MM-DD`), budapesti olvasatban. */
  dateKey: string;
  /** Percek budapesti éjféltől. */
  startMin: number;
  endMin: number;
  summary: string;
  location?: string;
  description?: string;
};

//! ─── A VTIMEZONE ─────────────────────────────────────────────────────────────
//! BEÁGYAZVA, NEM HIVATKOZVA. Egy `TZID=Europe/Budapest` önmagában arra
//! hagyatkozna, hogy a naptár ismeri ezt a zónanevet — a legtöbb ismeri, de az
//! Outlook asztali változata és több Android-naptár a beágyazott definíciót
//! keresi, és nélküle az eseményeket UTC-ként (vagy a gép zónájában) olvassa.
//!
//! A SZABÁLY 1996 ÓTA VÁLTOZATLAN az EU-ban: március utolsó vasárnap 02:00-kor
//! +1 → +2, október utolsó vasárnap 03:00-kor vissza. Ezért írható ki két
//! ismétlődési szabállyal, dátumlista nélkül. Ha az EU egyszer eltörli az
//! átállást, EZ a hat sor az, amit módosítani kell.
const VTIMEZONE = [
  "BEGIN:VTIMEZONE",
  `TZID:${ICS_TIME_ZONE}`,
  `X-LIC-LOCATION:${ICS_TIME_ZONE}`,
  "BEGIN:DAYLIGHT",
  "TZOFFSETFROM:+0100",
  "TZOFFSETTO:+0200",
  "TZNAME:CEST",
  "DTSTART:19700329T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU",
  "END:DAYLIGHT",
  "BEGIN:STANDARD",
  "TZOFFSETFROM:+0200",
  "TZOFFSETTO:+0100",
  "TZNAME:CET",
  "DTSTART:19701025T030000",
  "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU",
  "END:STANDARD",
  "END:VTIMEZONE",
];

export type IcsCalendar = {
  /** A naptár neve, ahogy a telefonon megjelenik („13C órarend"). */
  name: string;
  /** Egy mondat a naptárról — a legtöbb kliens a beállításai közt mutatja. */
  description?: string;
  events: readonly IcsEvent[];
  /** A generálás pillanata (epoch ms) — ez lesz minden esemény `DTSTAMP`-ja. */
  stamp: number;
  //! MILYEN SŰRŰN ÉRDEMES ÚJRAKÉRDEZNI — TIPP, NEM PARANCS. Az Apple Naptár és
  //! az Outlook figyeli (`REFRESH-INTERVAL`, `X-PUBLISHED-TTL`), a Google
  //! Naptár NEM: ő a maga ütemében, jellemzően jóval ritkábban olvas újra. A
  //! felületen ezért nem ígérünk óránkénti frissülést a naptárban — csak azt,
  //! hogy MINÁLUNK legfeljebb ennyit áll az adat (lásd `calendar-source.ts`).
  refreshMinutes: number;
};

export function buildIcs(calendar: IcsCalendar): string {
  const stamp = icsUtcStamp(calendar.stamp);
  const refresh = `PT${calendar.refreshMinutes}M`;

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    //* A PRODID a fájl előállítóját nevezi meg; a formátum szabad, a jelenléte
    //* kötelező.
    "PRODID:-//orarend//Jedlik orarend//HU",
    "CALSCALE:GREGORIAN",
    //* Feliratkozásos (nem meghívós) naptár: a kliens a teljes listát átveszi,
    //* és ami kimaradt belőle, azt törli. Ezért nincs `METHOD:CANCEL` sem.
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(calendar.name)}`,
    `NAME:${escapeText(calendar.name)}`,
    `X-WR-TIMEZONE:${ICS_TIME_ZONE}`,
    `REFRESH-INTERVAL;VALUE=DURATION:${refresh}`,
    `X-PUBLISHED-TTL:${refresh}`,
  ];

  if (calendar.description) {
    lines.push(`X-WR-CALDESC:${escapeText(calendar.description)}`);
    lines.push(`DESCRIPTION:${escapeText(calendar.description)}`);
  }

  lines.push(...VTIMEZONE);

  for (const event of calendar.events) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${event.uid}`,
      `DTSTAMP:${stamp}`,
      `DTSTART;TZID=${ICS_TIME_ZONE}:${icsLocalTime(event.dateKey, event.startMin)}`,
      `DTEND;TZID=${ICS_TIME_ZONE}:${icsLocalTime(event.dateKey, event.endMin)}`,
      `SUMMARY:${escapeText(event.summary)}`,
    );
    if (event.location) {
      lines.push(`LOCATION:${escapeText(event.location)}`);
    }
    if (event.description) {
      lines.push(`DESCRIPTION:${escapeText(event.description)}`);
    }
    //! AZ ÓRA NEM FOGLALTSÁG-NYILATKOZAT, DE IGEN, OTT VAGY. A `BUSY` azért
    //! fontos, mert a csoportos meghívók (és a „mikor jó mindenkinek")
    //! funkciók ezt olvassák — egy `TRANSPARENT` órarend mellé bárki
    //! beszervezhetne egy találkozót a matek óra közepére.
    lines.push("TRANSP:OPAQUE", "END:VEVENT");
  }

  lines.push("END:VCALENDAR");

  //* A hajtás a LEGVÉGÉN fut, egyszer, minden soron — így egyetlen kiírás sem
  //* tudja elfelejteni.
  return `${lines.map(fold).join("\r\n")}\r\n`;
}
