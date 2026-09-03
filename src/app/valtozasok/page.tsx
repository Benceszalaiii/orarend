import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/components/site-footer";

export const metadata: Metadata = {
  title: "Változások - Órarend",
  description: "Mi változott az Órarendben, és mikor.",
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

const ENTRIES: readonly Entry[] = [
  {
    date: "2026-09-04",
    title: "Lábléc",
    items: [
      "A lap aljára került egy halvány sor, amiben egy helyen megvan minden, ami nem az órarend: ki készítette, mi változott, mit tárolunk, és hol a forráskód.",
      "A telepítés („tedd ki a kezdőképernyőre”) mostantól bármikor elindítható a láblécből — eddig csak az az egyszeri kártya kínálta, ami elsőre felugrott.",
      "Az Órarend felvehető a Google keresés kedvenc forrásai közé.",
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
