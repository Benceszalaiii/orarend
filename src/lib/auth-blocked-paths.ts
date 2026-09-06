//! ═══════════════════════════════════════════════════════════════════════════
//! AMIT A BETTER AUTH FELCSATOL, DE MI NEM ADUNK KI
//! ═══════════════════════════════════════════════════════════════════════════
//! Egy Better Auth bővítmény nem végpontonként kapcsolható: a `dash()` egyetlen
//! sora ~90 útvonalat csatol fel az `/api/auth/*` alá, és mindegyik azonnal
//! nyilvánosan hívható. A legtöbbjük az infra által aláírt JWT-t követel, tehát
//! kulcs nélkül zárva van — DE NEM MIND. Ez a lista azokat nevezi meg, amelyek
//! nem, és amelyeket ez az app soha nem akar kiszolgálni.
//!
//! MIÉRT ITT, ÉS NEM AZ `auth.ts`-BEN: hogy tesztelhető legyen. Ez tiszta
//! függvény, nincs se adatbázisa, se `server-only` importja — így a
//! regressziós teszt megfuttathatja anélkül, hogy fel kellene húznia a fél
//! alkalmazást. A tiltás akkor ér valamit, ha nem lehet véletlenül elrontani.
//! ═══════════════════════════════════════════════════════════════════════════

//! ─── A MEGHÍVÓS ÁG: HITELESÍTÉS NÉLKÜL CSINÁL FIÓKOT ÉS MUNKAMENETET ───────
//! Ez a három végpont NEM használ se munkamenetet, se JWT-t. Egy lekérdezési
//! paraméterből (`token`, `handoff`) dolgoznak, és a sikeres ág
//! `internalAdapter.createUser` + `createSession` + `setSessionCookie` — azaz
//! FIÓKOT HOZNAK LÉTRE ÉS BELÉPTETNEK. A `complete-invitation` ráadásul
//! jelszavas (credential) fiókot is felvesz, pontosan azt a „második, gyengébb
//! bejáratot" nyitva, amit az `emailAndPassword: { enabled: false }` zár.
//!
//! Az app egyetlen fiókkeletkezési útja az iskolai belépés (`auth-jedlik.ts`).
//! Meghívós folyamat itt NINCS és nem is lesz: nincs `organization` bővítmény,
//! nincs csapat, nincs kit meghívni. Egy olyan bejárat, amit nem használunk, de
//! nyitva áll, tiszta veszteség — ezért zárjuk.
//!
//! A `complete-invitation-social` munkamenettel megy, de ugyanennek a
//! folyamatnak a része (és menet közben TÖRLI a hívó munkamenetét), ezért itt a
//! helye.
const INVITATION_PATHS = [
  "/dash/accept-invitation",
  "/dash/complete-invitation",
  "/dash/complete-invitation-handoff",
  "/dash/complete-invitation-social",
] as const;

//! ─── AZ „ÖSSZES NAPLÓ" NÉZET: NÁLUNK ÉRTELMEZHETETLEN ─────────────────────
//! Az `/events/all-audit-logs` munkamenettel hívható, és a jogosultságát a
//! `member` táblából olvassa ki (szervezeti tulajdonos/adminisztrátor lehet-e a
//! hívó). Ilyen tábla ebben a sémában nincs — nincs `organization` bővítmény.
//! Így a végpont a legjobb esetben is csak adatbázishibát tud visszaadni.
//!
//! Nyitva hagyni azért rossz, mert a jogosultsági ága EGY MÁSIK BŐVÍTMÉNY
//! adataira támaszkodik: ha valaha bekerülne az `organization` bővítmény, ez a
//! végpont ugyanabban a percben, csendben, egy diák munkamenetével hívhatóvá
//! válna. A saját naplóhoz az `/events/audit-logs` marad — az a munkamenet
//! felhasználójára szűr.
const FOREIGN_SCOPE_PATHS = ["/events/all-audit-logs"] as const;

//! A PROFIL AZ ISKOLÁÉ, NEM A KLIENSÉ. A Better Auth `/update-user` végpontja
//! alapból engedi a nevet és a profilképet átírni; az osztályt és a
//! tanár-státuszt a bővítmény `input: false` mezői már védik (`auth-jedlik.ts`).
//! Ez a maradékot zárja, hogy a felületen megjelenő név biztosan az legyen,
//! amit az iskola mond.
const PROFILE_PATHS = ["/update-user"] as const;

export const BLOCKED_AUTH_PATHS: ReadonlySet<string> = new Set<string>([
  ...PROFILE_PATHS,
  ...INVITATION_PATHS,
  ...FOREIGN_SCOPE_PATHS,
]);

//! A LEKÉRDEZÉSI RÉSZT LE KELL VÁGNI. A `ctx.path` rendesen tiszta útvonal, de
//! ez a lista biztonsági kapu: ha egy jövőbeli verzió a lekérdezéssel együtt
//! adná át, egy `?token=…` néma átengedéssé változtatná a tiltást. Az egyenlő
//! összehasonlítás azért marad (nem prefix), mert a prefix véletlenül olyan
//! végpontot is elkapna, amit ki AKARUNK szolgálni.
export function isBlockedAuthPath(path: string | undefined | null): boolean {
  if (!path) return false;
  const clean = path.split("?")[0] ?? path;
  return BLOCKED_AUTH_PATHS.has(clean);
}
