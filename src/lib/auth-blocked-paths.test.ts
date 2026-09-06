import { describe, expect, test } from "bun:test";
import { BLOCKED_AUTH_PATHS, isBlockedAuthPath } from "./auth-blocked-paths";

//! ═══════════════════════════════════════════════════════════════════════════
//! REGRESSZIÓS TESZT — MIÉRT ÉPP EZ
//! ═══════════════════════════════════════════════════════════════════════════
//! A `dash()` bővítmény felcsatol három olyan végpontot, amelyik HITELESÍTÉS
//! NÉLKÜL hoz létre fiókot és ad munkamenet-sütit. Nem lehet őket a bővítmény
//! oldaláról kikapcsolni; egyedül a `hooks.before` tiltása zárja őket.
//!
//! Egy ilyen tiltást pontosan kétféleképpen lehet elrontani: kiesik egy sor a
//! listából, vagy az összehasonlítás nem azt nézi, amit hisz róla (lekérdezési
//! rész, kis/nagybetű). Ez a teszt mindkettőt fogja. Nem az `auth.ts`-t húzza
//! fel — az `server-only`, adatbázissal —, hanem azt a tiszta függvényt, ami a
//! döntést hozza.
//! ═══════════════════════════════════════════════════════════════════════════

//* Ezek a `@better-auth/infra` 0.4.5 útvonalai, amelyeknek NINCS `use:`
//* köztes rétege (`accept-invitation`, `complete-invitation`,
//* `complete-invitation-handoff`), illetve amelyik munkamenettel megy, de
//* ugyanennek a folyamatnak a része (`complete-invitation-social`).
const UNAUTHENTICATED_DASH_PATHS = [
  "/dash/accept-invitation",
  "/dash/complete-invitation",
  "/dash/complete-invitation-handoff",
  "/dash/complete-invitation-social",
];

describe("isBlockedAuthPath", () => {
  test.each(
    UNAUTHENTICATED_DASH_PATHS,
  )("zárja a hitelesítés nélküli meghívós végpontot: %s", (path) => {
    expect(isBlockedAuthPath(path)).toBe(true);
  });

  test("zárja az idegen hatókörű naplónézetet", () => {
    expect(isBlockedAuthPath("/events/all-audit-logs")).toBe(true);
  });

  test("zárja a profilírást", () => {
    expect(isBlockedAuthPath("/update-user")).toBe(true);
  });

  //! A LEKÉRDEZÉSI RÉSZ NEM KERÜLHETI MEG A TILTÁST. A meghívós végpontok
  //! GET-tel, `?token=…`-nel hívhatók — ha az összehasonlítás a teljes
  //! sztringet nézné, ez a hívás átcsúszna.
  test("a lekérdezési rész nem kerüli meg a tiltást", () => {
    expect(isBlockedAuthPath("/dash/accept-invitation?token=abc")).toBe(true);
    expect(
      isBlockedAuthPath("/dash/complete-invitation-handoff?handoff=x"),
    ).toBe(true);
  });

  //! AMIT NEM SZABAD ELKAPNI. A tiltás akkor is hibás, ha túl sokat zár: az
  //! iskolai belépés és a saját napló a lap működésének a része.
  test("nem zárja a valóban használt végpontokat", () => {
    for (const path of [
      "/sign-in/jedlik",
      "/sign-out",
      "/get-session",
      "/events/audit-logs",
      "/events/list",
      "/passkey/generate-register-options",
    ]) {
      expect(isBlockedAuthPath(path)).toBe(false);
    }
  });

  test("üres bemenetre nem omlik össze", () => {
    expect(isBlockedAuthPath(undefined)).toBe(false);
    expect(isBlockedAuthPath(null)).toBe(false);
    expect(isBlockedAuthPath("")).toBe(false);
  });

  //! A LISTA NEM SZŰKÜLHET ÉSZREVÉTLENÜL. Ha valaki kiszed egy sort, ez a
  //! teszt bukik — nem azért, mert a szám szent, hanem mert a törlésnek
  //! tudatos döntésnek kell lennie, nem mellékhatásnak.
  test("minden hitelesítés nélküli meghívós útvonal benne van a listában", () => {
    for (const path of UNAUTHENTICATED_DASH_PATHS) {
      expect(BLOCKED_AUTH_PATHS.has(path)).toBe(true);
    }
  });
});
