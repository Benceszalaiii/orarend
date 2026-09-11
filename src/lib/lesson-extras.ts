//! ═══════════════════════════════════════════════════════════════════════════
//! AZ ÓRÁHOZ KÖTÖTT LINKEK ÉS A KIVETÍTŐ CÍME — A KÖZÖS SZABÁLYOK
//! ═══════════════════════════════════════════════════════════════════════════
//! Ezt a modult a szerver (`/api/ora-kiegeszitok`) ÉS a böngésző is használja,
//! ezért nincs benne se adatbázis, se `server-only`. A szerver ugyanezekkel a
//! függvényekkel ellenőriz, mielőtt írna — a kliens csak azért hívja őket, hogy
//! a hibát már gépelés után, hálózati kör nélkül kimondhassa.
//!
//! KÉT KULCS, KÉT KÉRDÉS:
//!   • a LINK a TANÁR + TANTÁRGY párhoz tartozik — a Classroom-kurzus, a
//!     feladatlap, a Teams-csoport ugyanaz minden héten, bármelyik teremben;
//!   • a KIVETÍTŐ CÍME a TANÁR + TEREM párhoz — a ScreenTask a tanár GÉPÉN fut,
//!     és az IP-cím attól függ, melyik teremben, melyik hálózaton ül.
//! ═══════════════════════════════════════════════════════════════════════════

//* A ScreenTask saját alapértelmezése — aki nem ad meg portot, ezt kapja.
export const SCREENTASK_DEFAULT_PORT = 7070;

//! A KORLÁTOK A TÁROLÓT VÉDIK, NEM A DIÁKOT. Egy órához ennyi link bőven elég;
//! az összesített plafon azt zárja ki, hogy egy elszabadult kliens (vagy egy
//! szándékos hívássorozat) tetszőleges mennyiségű sort írjon az adatbázisba.
export const MAX_LINKS_PER_LESSON = 12;
export const MAX_LINKS_TOTAL = 300;
export const MAX_SCREENS_TOTAL = 100;

const MAX_KEY_LENGTH = 64;
const MAX_URL_LENGTH = 2048;
const MAX_LABEL_LENGTH = 80;

export type LessonLink = {
  id: string;
  teacher: string;
  subject: string;
  url: string;
  label: string | null;
  createdAt: string;
};

export type ScreenAddress = { host: string; port: number };

export type ScreenHost = ScreenAddress & {
  teacher: string;
  room: string;
  updatedAt: string;
};

export type LessonExtras = { links: LessonLink[]; screens: ScreenHost[] };

//! ─── A KULCS ALAKJA ─────────────────────────────────────────────────────────
//! A tanár jele a diák órarendjén a kártya sarkából jön (`teacherShort`), a
//! tanári nézetben a választóból — a kettő betűzése eltérhet kis- és
//! nagybetűben, szóközben. Kisbetűsítve, összevont szóközzel tároljuk, így
//! ugyanaz a tanár mindkét nézetből ugyanazt a sort találja meg.
export function extrasKey(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const key = value.normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase();
  if (!key || key.length > MAX_KEY_LENGTH) return null;
  return key;
}

//! ─── A LINK ─────────────────────────────────────────────────────────────────
//! CSAK `http` ÉS `https`. Egy `javascript:` vagy `data:` cím a lapon egy
//! kattintással kódot futtatna; a séma nélküli bemenet („classroom.google.com")
//! viszont a leggyakoribb, ezért azt `https://`-sel egészítjük ki, nem dobjuk el.
//!
//! BELÉPÉSI ADAT NEM MEHET BE. A `https://nev:jelszo@…` alak működne, de a
//! jelszó így sima szövegként ülne az adatbázisban — inkább elutasítjuk.
export function sanitizeLinkUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  let raw = value.trim();
  if (!raw || raw.length > MAX_URL_LENGTH) return null;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(raw)) raw = `https://${raw}`;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (!url.hostname || url.username || url.password) return null;
  return url.href.length > MAX_URL_LENGTH ? null : url.href;
}

//* A felirat opcionális; üresen `null`, és vezérlőkarakter nem marad benne.
export function sanitizeLinkLabel(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const label = value
    .normalize("NFC")
    // biome-ignore lint/suspicious/noControlCharactersInRegex: épp a vezérlőkaraktereket szűrjük ki
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .trim()
    .replace(/\s+/g, " ");
  if (!label) return null;
  return label.slice(0, MAX_LABEL_LENGTH);
}

//* Ha nincs felirat, a cím olvasható része: tartomány + útvonal, séma nélkül.
export function linkDisplayName(link: Pick<LessonLink, "url" | "label">) {
  if (link.label) return link.label;
  try {
    const url = new URL(link.url);
    const path = url.pathname === "/" ? "" : url.pathname.replace(/\/$/, "");
    return `${url.hostname.replace(/^www\./, "")}${path}`;
  } catch {
    return link.url;
  }
}

//! ─── A KIVETÍTŐ CÍME ────────────────────────────────────────────────────────
//! CSAK HELYI HÁLÓZATI CÍM. Két okból:
//!   1. A ScreenTask a tanári gépen, a terem hálózatán fut — nyilvános cím
//!      mögött nincs mit keresni.
//!   2. A böngésző CSAK helyi IP-re engedi, hogy egy `https`-es lap titkosítatlan
//!      (`http`) képet töltsön be (Chrome: Local Network Access). Nyilvános címre
//!      a néző egyszerűen nem működne.
//!
//! A kimenet mindig a KANONIKUS tízes számrendszerű alak: a böngésző a
//! „192.168.010.5"-öt nyolcas számrendszerben olvasná (…8.5), mi viszont azt
//! tároljuk, amit a diák nagy valószínűséggel gondolt.
export function sanitizeScreenHost(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const raw = value.trim().toLowerCase();
  if (!raw || raw.length > 253) return null;

  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(raw);
  if (ipv4) {
    const octets = ipv4.slice(1).map(Number);
    if (octets.some((n) => n > 255)) return null;
    return isPrivateIpv4(octets) ? octets.join(".") : null;
  }

  //* mDNS-név (pl. `tanari-gep.local`) — ezt is helyinek tekinti a böngésző.
  if (/^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+local$/.test(raw)) return raw;
  return null;
}

function isPrivateIpv4([a, b]: number[]): boolean {
  return (
    a === 10 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254)
  );
}

export function sanitizePort(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isInteger(value)) return null;
  return value >= 1 && value <= 65535 ? value : null;
}

//! EGY MEZŐ, NEM KETTŐ. A tanár a ScreenTask ablakából jellemzően az egész
//! címet másolja („http://192.168.1.20:7070/"), a diák pedig csak az IP-t
//! diktálja le a tábláról. Mindkettőből ugyanaz lesz; port nélkül a
//! ScreenTask alapértelmezése.
export function parseScreenAddress(input: string): ScreenAddress | null {
  const raw = input
    .trim()
    .replace(/^https?:\/\//i, "")
    .split(/[/?#]/, 1)[0];
  const match = /^([^:]+)(?::(\d{1,5}))?$/.exec(raw ?? "");
  if (!match) return null;
  const host = sanitizeScreenHost(match[1]);
  const port =
    match[2] === undefined
      ? SCREENTASK_DEFAULT_PORT
      : sanitizePort(Number(match[2]));
  if (!host || port === null) return null;
  return { host, port };
}

export function formatScreenAddress({ host, port }: ScreenAddress): string {
  return port === SCREENTASK_DEFAULT_PORT ? host : `${host}:${port}`;
}

//* A ScreenTask saját webes nézője — jelszavas megosztásnál csak ez működik.
export function screenTaskPageUrl({ host, port }: ScreenAddress): string {
  return `http://${host}:${port}/`;
}

//! A ScreenTask EGYETLEN képet szolgál ki (`/ScreenTask.jpg`), és folyamatosan
//! felülírja. A saját nézője is ezt kéri újra és újra, egy véletlen
//! paraméterrel — enélkül a böngésző a gyorsítótárból adná vissza az első
//! képkockát.
export function screenTaskFrameUrl(
  { host, port }: ScreenAddress,
  nonce: string,
): string {
  return `http://${host}:${port}/ScreenTask.jpg?rand=${encodeURIComponent(nonce)}`;
}

//* ---------------------------------------------------------------------------
//* KERESÉS AZ ÓRA KULCSAIVAL
//* ---------------------------------------------------------------------------
export function linksFor(
  extras: LessonExtras,
  teacher: string,
  subject: string,
): LessonLink[] {
  const t = extrasKey(teacher);
  const s = extrasKey(subject);
  if (!t || !s) return [];
  return extras.links.filter((l) => l.teacher === t && l.subject === s);
}

export function screenFor(
  extras: LessonExtras,
  teacher: string,
  room: string,
): ScreenHost | null {
  const t = extrasKey(teacher);
  const r = extrasKey(room);
  if (!t || !r) return null;
  return extras.screens.find((s) => s.teacher === t && s.room === r) ?? null;
}
