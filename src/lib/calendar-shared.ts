import {
  CLASS_MAX_LENGTH,
  looksLikeClass,
  looksLikeTeacher,
  TEACHER_MAX_LENGTH,
} from "./known-class";
import {
  type DualScheduleEntry,
  type MergePrefEntry,
  sanitizeDual,
  sanitizeMergeList,
} from "./prefs-shared";
import type { TimetableSubjectKind } from "./timetable";

//! ═══════════════════════════════════════════════════════════════════════════
//! A NAPTÁR-FELIRATKOZÁS KÖZÖS SZERZŐDÉSE
//! ═══════════════════════════════════════════════════════════════════════════
//! Ugyanezt a fájlt olvassa a böngésző (mit küldjön fel) és a szerver (mit
//! fogadjon el) — ugyanaz a megfontolás, mint a `prefs-shared.ts`-ben, és az
//! ellenőrzés java részét ONNAN vesszük át, nem újraírjuk: a naptár-végpont
//! pontosan ugyanazt a döntés-listát kapja, amit a beállítás-szinkron, tehát
//! két külön korlátrendszerből csak az egyik lehetne a lazább.
//!
//! ─── AMI ITT ÚJ, ÉS AMIÉRT EZ A FÁJL EGYÁLTALÁN LÉTEZIK ────────────────────
//! EZ AZ ELSŐ FUNKCIÓ, AMI A CSOPORTBONTÁS-DÖNTÉST A SZERVERRE VISZI. Eddig
//! kimondhattuk, hogy az a döntés a böngészőben marad (lásd `push-store.ts` és
//! `/adatvedelem`) — egy naptár-feednél ez LEHETETLEN: a naptáralkalmazás süti
//! nélkül, a diák készülékétől függetlenül kéri le a fájlt, tehát a szűrést
//! csak a szerver tudja elvégezni.
//!
//! Ezért a funkció kizárólag a diák EXPLICIT kérésére jön létre (nincs
//! automatikus feliratkozás, nincs „bekapcsoljuk, hátha kell"), a linket ő
//! bármikor visszavonhatja, és az adatvédelmi lap nevesítve leírja, mi kerül
//! ezzel a szerverre. Ez nem apróbetű, hanem a funkció ára.
//! ═══════════════════════════════════════════════════════════════════════════

/** Amit a böngésző feltölt, amikor linket kér (vagy frissít). */
export type CalendarFeedRequest = {
  kind: TimetableSubjectKind;
  /** Az alany jele — `13C` vagy `KJ`. */
  short: string;
  //! A DÖNTÉSEK NYERSEN, NEM KILAPÍTVA. Kézenfekvő lenne „elrejtett órák
  //! halmazát" feltölteni — és pont az lenne a hiba: a `resolveDay` szabálya
  //! szerint a klaszterre mentett VÁLASZTÁS erősebb az általános elnémításnál,
  //! tehát egy kilapított halmaz más órarendet adna, mint a rács. A nyers lista
  //! feltöltésével a szerver UGYANAZT a függvényt futtatja, amit a böngésző.
  prefs: MergePrefEntry[];
  /** A diák duális beosztása erre az alanyra, vagy `null`, ha nincs. */
  dual: DualScheduleEntry | null;
};

//! A TÖRZS PLAFONJA. Jóval a valós használat fölött: 80 döntés × ~100 karakter
//! is belefér. Ez nem az „ésszerű használat" határa, hanem a TÁMADÁSI FELÜLET
//! határa — ez a végpont bejelentkezés NÉLKÜL is hívható (az osztály órarendje
//! nyilvános), tehát szigorúbb plafont kap, mint a fiókhoz kötött
//! beállítás-szinkron.
export const MAX_CALENDAR_BYTES = 16 * 1024;

/**
 * Ismeretlen bemenetből érvényes kérést épít, vagy `null`-t, ha nem megy.
 *
 * @remarks A `prefs` és a `dual` ellenőrzése SZÓ SZERINT a beállítás-szinkroné
 * (`prefs-shared.ts`) — a korlátok is onnan jönnek.
 */
export function sanitizeFeedRequest(
  input: unknown,
): CalendarFeedRequest | null {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return null;
  }
  const raw = input as Record<string, unknown>;

  const kind: TimetableSubjectKind =
    raw.kind === "teacher" ? "teacher" : "class";

  if (typeof raw.short !== "string") return null;
  const short = raw.short.trim();
  //! ALAKRA ELLENŐRZÜNK, A LISTÁHOZ A VÉGPONT MÉR. Ugyanaz a kétlépcsős
  //! szabály, mint az értesítés-feliratkozásnál: az alak hálózat nélkül szűr
  //! (ez a kulcstér határa), a tényleges létezést viszont a Jedlikinfo listája
  //! mondja meg — és azt a lépést csak a szerver teheti meg (`known-class.ts`).
  const validShort =
    kind === "teacher"
      ? short.length <= TEACHER_MAX_LENGTH && looksLikeTeacher(short)
      : short.length <= CLASS_MAX_LENGTH && looksLikeClass(short);
  if (!validShort) return null;

  const prefs = sanitizeMergeList(raw.prefs);
  //* `null` és „minden nap iskolai" KÜLÖNBÖZŐ állapot, de a feed szempontjából
  //* egyre megy: egyik sem rejt el napot. Az üres beosztást mégis megtartjuk,
  //* mert a frissítés így nem felejti el, hogy a diák már nyilatkozott.
  const dual = raw.dual === null ? null : sanitizeDual(raw.dual);

  return { kind, short, prefs, dual };
}

//! ─── A JEGY ALAKJA ─────────────────────────────────────────────────────────
//! 16 bájt véletlen, base64url-ben 22 karakter. NEM származtatott (se a
//! felhasználóból, se az osztályból): ezért nem lehet sem kitalálni, sem
//! visszafejteni belőle, kinek az órarendje — és ezért lehet egyetlen
//! mozdulattal visszavonni úgy, hogy a régi link azonnal halott legyen.
export const CALENDAR_TOKEN_BYTES = 16;
const TOKEN_SHAPE = /^[A-Za-z0-9_-]{22}$/;

export function isCalendarToken(value: unknown): value is string {
  return typeof value === "string" && TOKEN_SHAPE.test(value);
}

export function createCalendarToken(): string {
  const bytes = new Uint8Array(CALENDAR_TOKEN_BYTES);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

//! ─── A CÍM ─────────────────────────────────────────────────────────────────
//! A `.ics` VÉGZŐDÉS NEM DÍSZ. Az Outlook asztali változata és több Android-
//! naptár a KITERJESZTÉSBŐL dönti el, hogy naptárt kapott — a `Content-Type`
//! fejlécet egyesek meg sem nézik. A kiszolgáló a végződést levágja, tehát a
//! jegy mindkét alakban működik.
export function feedPath(token: string): string {
  return `/api/naptar/${token}.ics`;
}

//! A `webcal://` SÉMA A KÜLÖNBSÉG EGY LINK ÉS EGY FELIRATKOZÁS KÖZÖTT. Egy
//! `https://` címre koppintva a telefon LETÖLT egy fájlt: az események egyszer
//! bekerülnek a naptárba, és soha többé nem frissülnek. A `webcal://` ugyanazt
//! a címet adja át a naptáralkalmazásnak FELIRATKOZÁSKÉNT — onnantól magától
//! újraolvassa. A két cím ugyanaz, csak a séma más.
export function webcalUrl(origin: string, token: string): string {
  return `${origin.replace(/^https?:/, "webcal:")}${feedPath(token)}`;
}

export function httpsFeedUrl(origin: string, token: string): string {
  return `${origin}${feedPath(token)}`;
}

/** A Google Naptár „URL alapján" párbeszédje — a feedet egy kattintással veszi fel. */
export function googleCalendarUrl(origin: string, token: string): string {
  return `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(
    httpsFeedUrl(origin, token),
  )}`;
}

/** A kliensnek visszaadott csomag — a három cím egy helyen. */
export type CalendarFeedLinks = {
  token: string;
  webcal: string;
  https: string;
  google: string;
};

export function feedLinks(origin: string, token: string): CalendarFeedLinks {
  return {
    token,
    webcal: webcalUrl(origin, token),
    https: httpsFeedUrl(origin, token),
    google: googleCalendarUrl(origin, token),
  };
}
