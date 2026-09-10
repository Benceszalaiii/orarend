//! ═══════════════════════════════════════════════════════════════════════════
//! MELYIK GOOGLE-FIÓK SZÁMÍT ISKOLAINAK
//! ═══════════════════════════════════════════════════════════════════════════
//! Az iskolai AD-belépés kivezetése után a Google-fiók a belépés EGYETLEN
//! útja (a passkey nem az — az csak egy már létező fiókhoz vehető fel). Ez a
//! modul dönti el, mely e-mail-domainek fogadhatók el, és domainenként milyen
//! szerepet (diák/tanár) jelent a cím.
//!
//! MIÉRT KÜLÖN FÁJL, ÉS NEM AZ `auth.ts`-BEN: hogy tesztelhető legyen. Ez
//! tiszta függvény, nincs se adatbázisa, se `server-only` importja — a
//! regressziós teszt (`school-domain.test.ts`) megfuttathatja anélkül, hogy
//! fel kellene húznia a fél alkalmazást. Ugyanez az indok áll az
//! `auth-blocked-paths.ts` mögött is.
//!
//! ─── MIÉRT NEM ELÉG A GOOGLE `hd` PARAMÉTERE ────────────────────────────────
//! A Google `hd`-je EGYETLEN domaint tud megkövetelni (vagy `"*"`-ot, ami
//! bármilyen Workspace-domaint elfogad). Nálunk KETTŐ van — a tanári
//! (`jedlik.eu`) és a diák (`students.jedlik.eu`) —, és a kettő más szerepet
//! jelent. Az `auth.ts` ezért a `hd: "*"`-ot csak arra használja, hogy egy
//! személyes `@gmail.com` cím ne juthasson be a `hd` hiányán; a TÉNYLEGES
//! kaput ez a modul állítja, a hitelesített e-mail-cím alapján.
//! ═══════════════════════════════════════════════════════════════════════════

export type SchoolRole = "teacher" | "student";

//* A tantestület a fő domainen ül, a diákok egy aldomainen. Ha az iskola
//* valaha átszervezné a Workspace-t (pl. `staff.jedlik.eu`), ez az egyetlen
//* hely, amit módosítani kell.
const SCHOOL_DOMAIN_ROLES: ReadonlyMap<string, SchoolRole> = new Map([
  ["jedlik.eu", "teacher"],
  ["students.jedlik.eu", "student"],
]);

//! A DOMAIN KIOLVASÁSA NEM BÍZHATÓ A `split("@")`-RA. Egy technikailag
//! érvénytelen, de a `@` karaktert TÖBBSZÖR tartalmazó cím (pl. helyi
//! rész idézőjelben) a `split`-tel az UTOLSÓ szegmenst adná domainként —
//! ami itt is helyes, de csak azért, mert az UTOLSÓ `@` utáni rész
//! SOSEM lehet más, mint a domain. Az `indexOf` helyett ezért
//! `lastIndexOf`: az elsőt keresné, ami egy `foo@bar@jedlik.eu` alakú
//! (érvénytelen, de érkezhet) címnél `bar@jedlik.eu`-t adna domainként.
function domainOf(email: string | null | undefined): string | null {
  if (!email) return null;
  const at = email.lastIndexOf("@");
  if (at < 0 || at === email.length - 1) return null;
  return email.slice(at + 1).toLowerCase();
}

/**
 * Az e-mail-cím domainje alapján megmondja, ez egy iskolai fiók-e, és ha
 * igen, milyen szerepet jelent. `null` = nem iskolai cím (személyes Gmail,
 * másik iskola, elgépelt domain, …) — ilyen belépést az `auth.ts`
 * `validateUserInfo`-ja elutasít.
 */
export function schoolRoleForEmail(
  email: string | null | undefined,
): SchoolRole | null {
  const domain = domainOf(email);
  if (!domain) return null;
  return SCHOOL_DOMAIN_ROLES.get(domain) ?? null;
}

//* Kényelmi csomagolás a leggyakoribb kérdéshez (`auth.ts`
//* `databaseHooks.user.create.before`).
export function isSchoolEmail(email: string | null | undefined): boolean {
  return schoolRoleForEmail(email) !== null;
}
