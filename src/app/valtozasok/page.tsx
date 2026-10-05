import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/components/site-footer";
import { clubsLaunched } from "@/lib/club-access";

export const metadata: Metadata = {
  title: "Változások - Jedlik Info",
  description: "Mi változott a Jedlik Infóban, és mikor.",
};

//! ---------------------------------------------------------------------------
//! A VÁLTOZÁSNAPLÓ A DIÁKNAK SZÓL, NEM A FEJLESZTŐNEK
//! ---------------------------------------------------------------------------
//! NEM A COMMITOK LISTÁJA. A `git log` már létezik, egy koppintásra van innen
//! (lásd a lábléc GitHub-hivatkozását), és pontosan azt mondja el, ami a diákot
//! NEM érdekli: melyik fájl, melyik refaktor, melyik elgépelés. Itt az áll, ami
//! MEGVÁLTOZOTT A LAPON — amit a következő megnyitáskor észrevesz, vagy
//! észrevehetne, ha szólnánk.
//*
//! EGY NAP EGY BEJEGYZÉS. Nem verziószámozunk: a lapnak nincs letölthető
//! kiadása, folyamatosan frissül, és egy „v0.4.2" itt csak úgy TENNE, mintha
//! jelentene valamit. A dátum viszont valódi kapaszkodó: a diák arra emlékszik,
//! hogy „a múlt héten még máshogy nézett ki".
//*
//* A lista kézzel bővül, és ez szándékos: ami ide bekerül, arról valaki
//* eldöntötte, hogy ELMONDANI is érdemes. Új bejegyzés a tömb ELEJÉRE megy.

type Entry = {
  //* ISO dátum — a megjelenítést a `DATE_FMT` végzi, hogy a lista egységes
  //* maradjon akkor is, ha valaki más formában írná be.
  date: string;
  title: string;
  items: readonly string[];
};

//! A SZAKKÖRÖK ÉS A VERSENYEK CSAK A BEVEZETÉS UTÁN KERÜLNEK A NAPLÓBA. Előtte a
//! diáknak 404 a lapjuk (lásd `clubsLaunched`) — a napló ne hirdessen olyat,
//! amit a látogató nem nyithat meg. Ugyanaz a kapcsoló, mint a nyitólap
//! szalagjáé (`home/_components/latest.tsx`).
const CLUB_ITEMS: readonly string[] = clubsLaunched()
  ? [
      "Szakkörök (/szakkorok): mikor, hol és kinek szólnak. A lista megmondja, melyik fér bele a hetedbe, és ha ütközik, melyik órával; a követett szakkör az órarendedben is megjelenik.",
      "A szakkör lapján hírfolyam: a tagok és a vezető tanár bejegyzést és hozzászólást írhat. Olvasni belépve lehet.",
      "Szakkört tanár indít; diákként javasolhatsz egyet, vagy felírhatod, mire lenne igény.",
      "Versenyek (/versenyek): elöl áll, meddig lehet még nevezni. Nevezni fiókkal lehet, a határidőig vissza is léphetsz, és ha kéred, push-értesítés emlékeztet a határidő előtt.",
    ]
  : [];

const ENTRIES: readonly Entry[] = [
  {
    date: "2026-10-04",
    title: "Új név és jel: Jedlik Info",
    items: [
      "Az oldal neve mostantól Jedlik Info. Az új jel a „ji”: a betűk az iskola címerének kékjét viselik, az i pontja a címer pirosát — ugyanazt a pirosat, ami az órarendben a „most”-ot jelöli.",
      "Az oldal fő színe a címer kékje lett. A kék gombok felirata így világos és sötét témában is jól olvasható.",
      "A kezdőképernyőre korábban kitett ikont az Android magától lecseréli; iPhone-on ehhez újra ki kell tenni.",
      "A Jedlik Info továbbra is nem hivatalos, magánjellegű projekt, és nem azonos az iskola JedlikInfó portáljával.",
    ],
  },
  {
    date: "2026-10-03",
    title: clubsLaunched()
      ? "Szakkörök, versenyek és tantárgyak"
      : "Tantárgyak és bontott órák",
    items: [
      ...CLUB_ITEMS,
      "Tantárgyak (/tantargyak): tárgyanként ki tanítja, és melyik osztálynak, linkkel a tanár és az osztály órarendjére. Ékezet nélkül is keres.",
      "Új kapcsoló a Beállításokban — Bontott órák kitöltése: ha a másik csoportnak abban a sávban nincs órája, a csak egy csoportnak szóló óra a teljes oszlopot kitölti.",
    ],
  },
  {
    date: "2026-09-10",
    title: "Google-belépés, teremkereső és naptár",
    items: [
      "Teremkereső (/teremkereso): melyik terem üres most, óránkénti bontásban, és meddig marad az.",
      "Az órarend felvehető a telefonod naptárába. Pontosan azok az órák kerülnek bele, amiket a rácson látsz; a linket egy kattintással vissza lehet vonni.",
      "Belépni mostantól az iskolai Google-fiókoddal (@jedlik.eu vagy @students.jedlik.eu) is lehet — jelszó begépelése nélkül.",
      "Iskolai jelszóval új fiók már nem hozható létre. Ha még sosem léptél be, a Google-gombot használd; a korábban létrehozott fiókok egyelőre változatlanul be tudnak lépni vele.",
      "Aki eddig iskolai jelszóval lépett be, a fiókgombon (vagy a /belepes lapon) tudja összekötni a fiókját a Google-fiókjával — érdemes minél előbb megtenni, hogy a beállításai (és a gyors belépés, ha van) ne vesszenek el, mire az iskolai jelszavas belépés is teljesen megszűnik.",
      "A korábban beállított gyors belépés (ujjlenyomat) változatlanul működik.",
    ],
  },
  {
    date: "2026-09-09",
    title: "Ügyelet",
    items: [
      "Folyosóügyelet egy képernyőn (/ugyelet): ki ügyel most és hol, mikor jön a következő szünet, és kié a napi vezetői ügyelet.",
    ],
  },
  {
    date: "2026-09-04",
    title: "Lábléc",
    items: [
      "A lap aljára került egy halvány sor, amiben egy helyen megvan minden, ami nem az órarend: ki készítette, mi változott, mit tárolunk, és hol a forráskód.",
      "A telepítés („tedd ki a kezdőképernyőre”) mostantól bármikor elindítható a láblécből — eddig csak az az egyszeri kártya kínálta, ami elsőre felugrott.",
      "A Jedlik Info felvehető a Google keresés kedvenc forrásai közé.",
    ],
  },
  {
    date: "2026-09-03",
    title: "Progresszív mód",
    items: [
      "A napi nézet saját napsávot kapott: a hét napjai egy sorban, a mai kiemelve, koppintásra vált.",
      "Tanítás nélküli napokra külön lap került, évszakhoz illő háttérrel és visszaszámlálóval a következő tanítási napig.",
      "A „most” sáv pontosabban követi a csengetési rendet.",
    ],
  },
  {
    date: "2026-09-02",
    title: "Értesítések és duális hetek",
    items: [
      "Push-értesítés 10 perccel az óra kezdése előtt, és ha megváltozik az órarend. Osztályonként kapcsolható, az engedélyt csak a harang ikonra koppintva kérjük.",
      "A duális képzés hetei külön jelölést kaptak: a lap tudja, mikor van iskola és mikor cég.",
      "Az órarend a tanítási naptárt is figyelembe veszi — a szünetek és az áthelyezett napok a helyükre kerültek.",
      "iPhone-on egyszer megjelenik egy tipp arról, hogyan lehet a lapot a kezdőképernyőre tenni.",
    ],
  },
  {
    date: "2026-09-01",
    title: "Megnevezett hibák és nyomtatás",
    items: [
      "Minden hibafajta saját üzenetet kapott: kiderül belőle, kinél van a baj — nálunk, a hálózatnál vagy az iskola szerverénél —, és van-e értelme várni.",
      "A heti rács A4-es fekvő lapra nyomtatható, saját világos palettával, ami megtartja a tantárgyak színeit.",
    ],
  },
  {
    date: "2026-08-31",
    title: "Első változat",
    items: [
      "A Jedlik heti órarendje teljes képernyőn, bejelentkezés nélkül.",
      "Az osztály csoportbontásai összevonhatók arra a csoportra, ahová tényleg jársz; a választás megmarad az eszközön.",
    ],
  },
];

const DATE_FMT = new Intl.DateTimeFormat("hu-HU", {
  year: "numeric",
  month: "long",
  day: "numeric",
});

export default function ValtozasokPage() {
  return (
    //! A LÁBLÉC AKKOR IS ALUL VAN, HA A TARTALOM RÖVID. A `flex-col` + a
    //! láblécen ülő `mt-auto` együtt tolja a lap aljára — enélkül egy rövid
    //! lista után középen lógna, és úgy nézne ki, mintha a lap ott érne véget.
    <div className="flex min-h-[100dvh] flex-col">
      <main className="mx-auto w-full max-w-2xl px-5 py-10 sm:py-16">
        <Link
          href="/orarend"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Vissza az órarendhez
        </Link>

        <h1 className="mt-6 text-2xl font-bold tracking-tight text-foreground">
          Változások
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Mi változott a lapon, és mikor.
        </p>

        <ol className="mt-8 flex flex-col gap-8">
          {ENTRIES.map((entry) => (
            <li key={entry.date} className="flex flex-col gap-2">
              {/*//* A dátum a gépnek is olvasható (`dateTime`), a szemnek
                  //* magyarul — a `text-xs` és a halvány szín miatt a CÍM marad
                  //* a bejegyzés belépési pontja, nem a dátum. */}
              <time
                dateTime={entry.date}
                className="text-xs font-medium text-muted-foreground"
              >
                {DATE_FMT.format(new Date(`${entry.date}T00:00:00`))}
              </time>
              <h2 className="text-base font-semibold text-foreground">
                {entry.title}
              </h2>
              <ul className="flex flex-col gap-2 text-sm leading-relaxed text-muted-strong">
                {entry.items.map((item) => (
                  <li key={item} className="flex gap-2.5">
                    <span
                      aria-hidden
                      className="mt-2 size-1 shrink-0 rounded-full bg-muted-foreground"
                    />
                    <span className="text-pretty">{item}</span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      </main>

      <SiteFooter />
    </div>
  );
}
