//! ═══════════════════════════════════════════════════════════════════════════
//! A KIVEZETÉS SZÖVEGE — EGY HELYEN
//! ═══════════════════════════════════════════════════════════════════════════
//! Ugyanaz a két mondat áll a `/belepes` lapon, a fiókgomb felugrójában
//! (`account-menu.tsx`) és a globális emlékeztető sávban
//! (`google-link-banner.tsx`). Ha a megfogalmazás változik, itt kell átírni —
//! három egymástól eltérő szöveg rosszabb, mint egy elavult.
//!
//! NINCS ITT NAPTÁRI DÁTUM. A pontos leállási dátum attól függ, mikor
//! engedélyezi az iskola Google Workspace-e a mi OAuth-alkalmazásunkat (a
//! migrációs terv 0. lépése) — ezt előre beírni egy olyan ígéret lenne, amit
//! még nem biztos, hogy tartani tudunk. Amint a dátum eldől, EZ a fájl kapja
//! meg elsőként — egy tényleges visszaszámlálóval e helyett a „hamarosan"
//! szó helyett —, és minden felület, ami innen olvas, automatikusan frissül.
//! ═══════════════════════════════════════════════════════════════════════════

export const AD_MIGRATION_SHORT =
  "Az iskolai jelszavas belépés hamarosan megszűnik.";

export const AD_MIGRATION_LONG =
  "Az iskolai jelszavas belépés hamarosan megszűnik — utána már csak Google-fiókkal, vagy a korábban beállított gyors belépéssel (ujjlenyomat) lehet bejelentkezni.";

//* A fiókgomb felugrójában és a globális sávban ez indokolja, MIÉRT éri meg
//* most, és nem majd akkor, összekötni a fiókot: a fiók addig csak passkey-vel
//* marad elérhető, amit sokan még nem állítottak be.
export const GOOGLE_LINK_REASON =
  "Ha addig nem kötöd össze, a fiókod (és a rajta tárolt beállításaid) a leállás után csak akkor marad elérhető, ha van rajta beállított gyors belépés (ujjlenyomat).";
