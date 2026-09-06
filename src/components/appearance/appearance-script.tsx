import { appearanceScript } from "@/lib/appearance";

//! ═══════════════════════════════════════════════════════════════════════════
//! A FESTÉS ELŐTTI SZKRIPT — EZ ZÁRJA KI A VILLANÁST
//! ═══════════════════════════════════════════════════════════════════════════
//! A TÉMA A BÖNGÉSZŐBEN LAKIK, A HTML VISZONT A SZERVEREN KÉSZÜL. A kiszolgáló
//! nem tudja, ki mit választott (nincs cookie, lásd `/adatvedelem`), tehát
//! valamilyen alapállapotot ír ki — és ha a helyesre csak a React
//! hidratálása után váltanánk, a felhasználó előbb LÁTNÁ a rosszat. Sötétből
//! világosba villanni reggel, félálomban, nem apró szépséghiba.
//!
//! EZ A SZKRIPT A `<head>`-BEN, A TÖRZS ELEMZÉSE ELŐTT FUT LE, szinkron módon.
//! Amire a böngésző az első képpontot kirajzolná, a `<html>`-en már ott a
//! `dark` osztály, a `data-palette` és a `color-scheme` — nincs mit villantani.
//!
//! MIÉRT NEM `useEffect` VAGY `useLayoutEffect`: mindkettő a hidratálás UTÁN
//! fut. Lassú kapcsolaton a böngésző jóval előbb kirajzolja a szerver HTML-jét,
//! mint hogy a React egyáltalán betöltődne — a villanás ott van a legrosszabb,
//! ahol a legtöbb a régi telefon.
//!
//! //! AMIT EZ MEGKÖVETEL: a `<html>`-en `suppressHydrationWarning`. A szkript
//! //! MEGVÁLTOZTATJA az elemet, mielőtt a React megnézné; enélkül a React
//! //! eltérést jelentene, és a lap egy darabját újrarenderelné — épp azt a
//! //! villanást hozva vissza, ami elől idejöttünk.
//! ═══════════════════════════════════════════════════════════════════════════
export function AppearanceScript() {
  return (
    <script
      // biome-ignore lint/security/noDangerouslySetInnerHtml: soron belüli szkript csak nyers szövegként adható ki; a tartalma a `lib/appearance.ts`-ben generált, felhasználói adatot nem tartalmaz.
      dangerouslySetInnerHTML={{ __html: appearanceScript() }}
    />
  );
}
