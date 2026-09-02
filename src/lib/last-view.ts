//* ---------------------------------------------------------------------------
//* AZ UTOLJÁRA HASZNÁLT NÉZET
//*
//! A KÉT NÉZET EGYENRANGÚ (lásd `components/site-nav.tsx`): a „Hét" és a
//! „Progresszív mód" ugyanarra az adatra néz, csak más kérdésre válaszol. Ezért
//! a nyitóoldal nem dönthet a diák helyett — oda visz vissza, ahol legutóbb
//! járt. Amíg nincs ilyen emlék (első nyitás, privát mód, törölt tárhely), a
//! `/orarend` az alapértelmezés: a teljes rácsból mindenki ki tudja olvasni,
//! ami kell.
//*
//* A jelölő KIZÁRÓLAG a böngészőben marad — cookie-t az oldal nem használ
//* (lásd `/adatvedelem`), így ezt a szerver nem is látja: a `/` átirányítása
//* ezért történik kliensoldalon.
//* ---------------------------------------------------------------------------

export const VIEW_ROUTES = ["/orarend", "/ma"] as const;

export type ViewRoute = (typeof VIEW_ROUTES)[number];

export const DEFAULT_VIEW: ViewRoute = "/orarend";

const LAST_VIEW_STORAGE_KEY = "orarend:last-view:v1";

export function isViewRoute(
  value: string | null | undefined,
): value is ViewRoute {
  return VIEW_ROUTES.includes(value as ViewRoute);
}

//! CSAK ISMERT NÉZETET ADUNK VISSZA. A tárolóba bármi kerülhetett (régi
//! verzió, kézzel írt érték) — egy ismeretlen útvonalra átirányítani 404-et
//! jelentene, ezért az érvénytelen emléket úgy kezeljük, mintha nem lenne.
export function loadLastView(): ViewRoute | null {
  try {
    const raw = window.localStorage.getItem(LAST_VIEW_STORAGE_KEY);
    return isViewRoute(raw) ? raw : null;
  } catch {
    return null;
  }
}

export function saveLastView(route: ViewRoute): void {
  try {
    window.localStorage.setItem(LAST_VIEW_STORAGE_KEY, route);
  } catch {
    /* privát módban nincs tárhely — ilyenkor a `/` marad az alapértelmezésen */
  }
}
