import { StandingLine } from "@/components/chrome/standing-line";
import { SiteFooter } from "@/components/site-footer";
import Cta from "./cta";
import { GridFilm } from "./film";
import Latest from "./latest";

//! ─── A NYITÓLAP EGY TÁRGYAT MUTAT ──────────────────────────────────────────
//! A lap nem szakaszokban magyarázza el az órarendet, hanem EGYETLEN hetet
//! rajzol ki, és a görgetés viszi rá a kamerát: totál → csoportbontás →
//! duális hét → egyetlen óra. A `GridFilm` ezért nem három komponens
//! egymás alatt, hanem egy rács négy nézőpontból (lásd `_components/film.tsx`).
//*
//! A SORREND A KAMERÁÉ. A film után jön a kobalt „Ami most már működik" sáv
//! — a lap ütemének egyetlen világos csíkja —, és a lapot két egyenrangú
//! ajtó zárja: a heti rács és a progresszív mód.
//*
//! MIÉRT KÜLÖN KOMPONENS, ÉS NEM EGYSZERŰEN A `home/page.tsx` TÖRZSE? Mert
//! ugyanez a lap KÉT címen áll: a `/`-en (ott a nyitólap az ELSŐ látogató
//! kezdőképernyője, lásd `app/page.tsx`) és a `/home`-on (ott az a lap, ahova
//! a váltó „Nyitólap" hivatkozása bármikor visszavisz). Két `page.tsx`,
//! egyetlen törzs — különben a kettő idővel elcsúszna egymástól.
export function Landing() {
  return (
    <main className="bg-card">
      {/*//! A VÁLTÓ ÁTKEL HÁROM ALAPSZÍNEN. A film meleg papírral nyit, kobalton
          //! megy át és éjszakai felületen zár — egy rögzített sáv mindhármon
          //! rajta ül. A `floating` változat ezért saját, sötét üvegtáblát
          //! visel: nem a mögötte lévő laptól kéri a kontrasztot. */}
      <StandingLine
        surface="floating"
        className="fixed top-[calc(env(safe-area-inset-top)+0.75rem)] right-[calc(env(safe-area-inset-right)+0.75rem)] z-50 sm:top-4 sm:right-4"
      />
      <GridFilm />
      <Latest />
      <Cta />
      <SiteFooter />
    </main>
  );
}
