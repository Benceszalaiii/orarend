import type { Metadata } from "next";
import { Landing } from "./home/_components/landing";

//! ─── A `/` MOST MÁR LAP, NEM AJTÓ ──────────────────────────────────────────
//! Régen a nyitócím egy üres váz volt, ami a böngészőben eldöntötte, hova
//! menjen tovább (`home-redirect.tsx`). Ez két dolgot rontott el:
//*
//! 1. A KERESŐ EGY ÜRES LAPOT LÁTOTT. A robotnak nincs emléke és nincs
//!    JavaScriptje sem, ha nem várja ki — a `jedlik.info` gyökere így egy
//!    „Órarend betöltése…" feliratot indexelt, miközben a lap tartalma egy
//!    másik címen állt (`/home`).
//! 2. AKI MÁR ITT JÁRT, EGY VILLANÁST KAPOTT. Az átirányítás a lap
//!    betöltése UTÁN futott: előbb megjelent a váz, aztán ugrott.
//*
//! MOST A GYÖKÉR MAGA A NYITÓLAP — statikusan, átirányítás nélkül. Aki pedig
//! már megnyitotta valamelyik nézetet, az ide EL SEM JUT: a `proxy.ts` a süti
//! alapján, még a lap kirajzolása előtt továbbküldi oda, ahol legutóbb járt.
//! A robotnál nincs süti, tehát ő mindig a teljes nyitólapot kapja.
//*
//! A KETTŐ NEM MOND ELLENT EGYMÁSNAK: a nyitólap annak szól, aki még nem
//! tudja, mit tud ez az oldal; aki tudja, annak az órarend kell, azonnal.

export const metadata: Metadata = {
  title: "Órarend — a Jedlik hete egy lapon",
  description:
    "A Jedlik órarendje osztályokra, csoportbontásokra és duális hetekre bontva: heti rács teljes képernyőn, vagy a mai nap egyetlen képernyőn, óráról órára.",
  //! A NYITÓLAP KÉT CÍMEN ÁLL (`/` és `/home`), DE EGY LAP. A kanonikus cím a
  //! gyökér: oda mutat a keresőtalálat, oda gyűlik a hivatkozásokból származó
  //! súly, és a `/home` csak egy megőrzött belső visszaút.
  alternates: { canonical: "https://jedlik.info/" },
};

export default function Page() {
  return <Landing />;
}
