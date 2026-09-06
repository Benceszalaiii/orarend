//* ---------------------------------------------------------------------------
//* AZ UTOLJÁRA HASZNÁLT NÉZET
//*
//! A KÉT NÉZET EGYENRANGÚ (lásd `components/chrome/standing-line.tsx`): a „Hét" és a
//! „Progresszív mód" ugyanarra az adatra néz, csak más kérdésre válaszol. Ezért
//! a nyitóoldal nem dönthet a diák helyett — oda visz vissza, ahol legutóbb
//! járt. Amíg nincs ilyen emlék (első nyitás, privát mód, törölt tárhely), a
//! `/`-en a NYITÓLAP marad: aki még sosem járt itt, annak előbb a lap szól
//! magáról (lásd `app/page.tsx`).
//*
//! AZ EMLÉK KÉT HELYEN ÁLL, ÉS EZ NEM MÁSOLÁS, HANEM KÉT KÜLÖNBÖZŐ MUNKA:
//*
//! - `localStorage` (`:v1`): a beállítás-szinkron nyersanyaga. Ez megy fel a
//!   fiókhoz belépéskor, hogy a másik eszköz is tudja, hol jártál
//!   (`prefs-local.ts`, `prefs-shared.ts`). A szerver ezt SOHA nem látja.
//! - süti (`v2`): ugyanaz az egy adat, de olyan alakban, amit a szerver is
//!   olvas. Enélkül a `/` nem tudná még a kirajzolás ELŐTT eldönteni, hogy
//!   nyitólapot mutasson vagy továbbküldjön — a döntés a böngészőbe csúszna,
//!   és a régi villanó átirányítás jönne vissza (`proxy.ts`).
//*
//! MIÉRT `v2`, ÉS MIÉRT NEM OLVASSUK A RÉGIT? Mert a régi jelölő MÁS KÉRDÉSRE
//! válaszolt: „melyik nézetben járt utoljára" — abból nem következik, hogy
//! LÁTTA-E MÁR a nyitólapot. Aki a mostani `/`-ről érkezik, az a nézet első
//! megnyitásakor megkapja a `v2` sütit; a `v1` emléke ehhez nem elég bizonyíték.
//! A `v1` ezért érintetlenül a szinkroné marad, a kapu pedig tiszta lappal
//! indul.
//* ---------------------------------------------------------------------------

import { notifyPrefsChanged } from "./prefs-events";

//! A TANÁRI RÁCS IS NÉZET, CSAK NEM MINDENKIÉ. Az emlék attól ér valamit,
//! hogy a `/` oda visz vissza, ahol legutóbb jártak — egy tanárnak ez a
//! `/tanari`, és fölösleges lenne minden megnyitáskor újra odanavigálnia. A
//! VÁLTÓ pirulái között viszont nem szerepel automatikusan (lásd
//! `chrome/standing-line.tsx`): a diákok többségének nem nézet, csak zaj lenne.
export const VIEW_ROUTES = ["/orarend", "/ma", "/tanari"] as const;

export type ViewRoute = (typeof VIEW_ROUTES)[number];

export const DEFAULT_VIEW: ViewRoute = "/orarend";

const LAST_VIEW_STORAGE_KEY = "orarend:last-view:v1";

//! A SÜTI NEVE NEM TARTALMAZ KETTŐSPONTOT. A `localStorage` kulcsában a
//! `orarend:last-view:v1` alak olvasható, egy süti nevében viszont a `:` a
//! szabvány szerint elválasztó — a böngészők többsége elnézi, de nem mind.
export const LAST_VIEW_COOKIE = "orarend_last_view_v2";

//* 400 nap: ennél hosszabb élettartamot a böngészők úgyis levágnak.
const LAST_VIEW_COOKIE_MAX_AGE = 60 * 60 * 24 * 400;

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

//! A SÜTIT A BÖNGÉSZŐ ÍRJA, NEM A SZERVER. A nézetváltás kliensoldali esemény
//! (`standing-line.tsx`); egy `Set-Cookie` fejléchez külön szerverkérés kellene
//! egyetlen szó miatt. A szerver csak OLVASSA — ezért nem `HttpOnly`.
function writeLastViewCookie(route: ViewRoute): void {
  try {
    //* Helyi fejlesztésben (http://localhost) a `Secure` süti eldobódna.
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    //! A `cookieStore` (amit a linter ajánl) ASZINKRON, ÉS A SAFARI RÉGEBBI
    //! VERZIÓIBAN NINCS MEG — az iskolai telefonok jó része ilyen. Egy
    //! szinkron, egysoros írásért nem éri meg két utat tartani, a régi
    //! `document.cookie` pedig mindenhol ugyanazt csinálja.
    // biome-ignore lint/suspicious/noDocumentCookie: lásd fentebb — a Cookie Store API itt nem elérhető mindenhol.
    document.cookie = `${LAST_VIEW_COOKIE}=${route}; Path=/; Max-Age=${LAST_VIEW_COOKIE_MAX_AGE}; SameSite=Lax${secure}`;
  } catch {
    /* privát mód vagy letiltott sütik — ilyenkor a `/` a nyitólap marad */
  }
}

export function saveLastView(route: ViewRoute): void {
  //! A SÜTI ELŐSZÖR. A `localStorage` privát módban DOBHAT — ha az írás
  //! sorrendje fordított lenne, egy kivétel elvinné a sütit is, és a diák
  //! minden megnyitáskor újra a nyitólapon kötne ki.
  writeLastViewCookie(route);
  try {
    window.localStorage.setItem(LAST_VIEW_STORAGE_KEY, route);
    notifyPrefsChanged();
  } catch {
    /* privát módban nincs tárhely — a szinkron ilyenkor kimarad */
  }
}
