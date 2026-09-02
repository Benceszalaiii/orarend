//! NEM FELHASZNÁLÓT MÉRÜNK, HANEM OSZTÁLYT.
//!
//! Az egyetlen elküldött adat az osztály neve. Eszközazonosító, session-kulcs,
//! időbélyeg — semmi ilyen nem megy át a dróton, és a szerver sem tárol ilyet.
//! A lenti `SEEN_KEY` HELYI jelölő: kizárólag azért van, hogy ugyanaz az eszköz
//! naponta egyszer számítson bele egy osztályba. EZT A KULCSOT SOHA NEM KÜLDJÜK
//! EL — ha elküldenénk, pont az az azonosító keletkezne, aminek nem szabad.
import { usageDayKey } from "./usage-day";

const SEEN_KEY = "orarend:usage:v1";

type Seen = { date: string; classes: string[] };

//* Naponta és osztályonként egy jelzés eszközönként. Enélkül a szünetben tízszer
//* frissítő diák elnyomná az egész osztályt: a kérdés az, hányan használják egy
//* osztály órarendjét, nem az, hányszor töltik újra.
function markSeen(short: string): boolean {
  //! UGYANAZ A NAPHATÁR, MINT A SZERVERÉ (budapesti) — különben egy külföldről
  //! megnyitott eszköz máshol húzná meg a nap végét, mint ahová a szerver
  //! könyvel, és kétszer is beleszámíthatna ugyanabba a napba.
  const today = usageDayKey();
  try {
    const raw = window.localStorage.getItem(SEEN_KEY);
    const parsed = raw ? (JSON.parse(raw) as Seen | null) : null;
    const seen: Seen =
      parsed?.date === today && Array.isArray(parsed.classes)
        ? parsed
        : { date: today, classes: [] };
    if (seen.classes.includes(short)) return false;
    seen.classes.push(short);
    window.localStorage.setItem(SEEN_KEY, JSON.stringify(seen));
    return true;
  } catch {
    //! Privát módban nincs tárhely, tehát nincs deduplikáció sem. Ilyenkor
    //! inkább NEM mérünk, mint hogy egyetlen eszköz többszöröse torzítsa a
    //! számokat.
    return false;
  }
}

export function reportClassUse(short: string | null | undefined): void {
  if (!short || typeof window === "undefined") return;
  if (!markSeen(short)) return;

  //! A STATISZTIKA SOHA NEM RONTHATJA EL AZ ÓRARENDET. A hibát elnyeljük: se
  //! toast, se konzol-zaj, se újrapróbálkozás. A `keepalive` azért kell, hogy a
  //! lap elhagyása ne szakítsa félbe a kérést.
  void fetch("/api/hasznalat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ class: short }),
    keepalive: true,
  }).catch(() => {});
}
