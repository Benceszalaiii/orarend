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

//! A CÍM ÉS A LEÍRÁS A KERESŐNEK SZÓL, NEM A MÁRKÁNAK. Aki a Jedlik
//! órarendjét keresi, az „jedlik órarend"-et, „jedlik teremkereső"-t gépel —
//! a régi cím („a Jedlik hete egy lapon") egyikre sem felelt. A márkanév a
//! cím végén áll, ahogy a többi lapé is (`… - Jedlik Info`).
const TITLE = "Jedlik órarend osztályra, tanárra, teremre | Jedlik Info";
const DESCRIPTION =
  "A győri Jedlik Ányos technikum órarendje: csoportbontások, duális hetek, teremkereső, ügyelet és értesítések egy helyen — ingyen, belépés nélkül.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  //! A NYITÓLAP KÉT CÍMEN ÁLL (`/` és `/home`), DE EGY LAP. A kanonikus cím a
  //! gyökér: oda mutat a keresőtalálat, oda gyűlik a hivatkozásokból származó
  //! súly, és a `/home` csak egy megőrzött belső visszaút.
  alternates: { canonical: "https://jedlik.info/" },
  //* A megosztott link előnézete. A képet a `opengraph-image.png` adja (fájl
  //* szerinti konvenció), ide csak a szöveg és a típus kell.
  openGraph: {
    type: "website",
    locale: "hu_HU",
    url: "https://jedlik.info/",
    siteName: "Jedlik Info",
    title: TITLE,
    description: DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
};

//! ─── STRUKTURÁLT ADAT ──────────────────────────────────────────────────────
//! A `WebSite` a keresőtalálat fölötti webhelynevet adja („Jedlik Info"), a
//! `WebApplication` pedig kimondja, mi ez: ingyenes webes alkalmazás. NINCS
//! `EducationalOrganization` és nincs `publisher: iskola` — a Jedlik Info nem
//! hivatalos projekt, és a strukturált adat sem állíthatja az ellenkezőjét.
const JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": "https://jedlik.info/#website",
      url: "https://jedlik.info/",
      name: "Jedlik Info",
      alternateName: "Jedlik órarend",
      inLanguage: "hu-HU",
    },
    {
      "@type": "WebApplication",
      "@id": "https://jedlik.info/#app",
      name: "Jedlik Info",
      url: "https://jedlik.info/",
      description: DESCRIPTION,
      inLanguage: "hu-HU",
      applicationCategory: "EducationalApplication",
      operatingSystem: "Web, iOS, Android",
      isAccessibleForFree: true,
      offers: { "@type": "Offer", price: "0", priceCurrency: "HUF" },
      featureList: [
        "Heti órarend osztályra, tanárra és teremre",
        "Csoportbontások összevonása",
        "Duális hetek jelölése",
        "Progresszív mód: a mai nap egy képernyőn",
        "Teremkereső: szabad termek óránként",
        "Folyosóügyelet",
        "Tantárgyak: ki tanítja, melyik osztálynak",
        "Push-értesítések és naptár-feliratkozás",
        "Offline elérés",
      ],
      isPartOf: { "@id": "https://jedlik.info/#website" },
    },
  ],
};

export default function Page() {
  return (
    <>
      <script
        type="application/ld+json"
        //* Állandó, saját adat — a `<` cseréje csak a szokásos óvintézkedés.
        // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD, a Next ajánlott módja
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(JSON_LD).replace(/</g, "\\u003c"),
        }}
      />
      <Landing />
    </>
  );
}
