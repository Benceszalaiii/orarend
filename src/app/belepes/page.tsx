import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { SiteFooter } from "@/components/site-footer";
import { SignInPanel } from "./sign-in-panel";

export const metadata: Metadata = {
  title: "Belépés - Órarend",
  description:
    "Belépés az iskolai fiókkal, hogy az órarend-beállításaid átjöjjenek a többi eszközödre.",
  //* Ennek a lapnak nincs keresőben helye: se tartalma, se célja azon kívül,
  //* hogy egy gombot mutasson a saját látogatóinknak.
  robots: { index: false, follow: false },
};

export default function BelepesPage() {
  return (
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
          Belépés
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-strong">
          Az órarend megtekintéséhez <strong>nem kell belépni</strong> — enélkül
          is minden működik. A belépés azt adja, hogy a beállításaid (osztály,
          összevont csoportbontások, duális beosztás) átjönnek a telefonodról a
          gépedre és vissza.
        </p>
        <p className="mt-2 text-sm leading-relaxed text-muted-strong">
          Az iskolai <strong>Google-fiókoddal</strong> (
          <span className="whitespace-nowrap">@jedlik.eu</span> vagy{" "}
          <span className="whitespace-nowrap">@students.jedlik.eu</span>)
          léphetsz be — ez lesz az egyetlen út, miután az alább még elérhető,
          iskolai jelszavas belépés megszűnik.
        </p>

        <div className="mt-8">
          {/*//! A `useSearchParams` miatt kell a határ: enélkül a Next az egész
              //! lapot kliensoldali rendelésre kényszerítené, és a fenti,
              //! statikus magyarázat is csak JS után jelenne meg. */}
          <Suspense fallback={<div className="h-40" aria-hidden />}>
            <SignInPanel />
          </Suspense>
        </div>

        {/*//! AMIT A DIÁK JOGGAL MEGKÉRDEZ. Ez az oldal nem az iskoláé, mégis
            //! iskolai belépést kínál — pontosan az a minta, amire gyanakodni
            //! kell tanítjuk a diákokat. Ezért itt, a gomb MELLETT áll, mit
            //! kérünk és mit nem; egy adatvédelmi lap alján ezt senki nem
            //! olvasná el a döntés pillanatában. */}
        <section className="mt-10 flex flex-col gap-3 border-t border-border pt-6 text-sm leading-relaxed text-muted-strong">
          <h2 className="text-base font-semibold text-foreground">
            Mi történik Google-belépéskor
          </h2>
          <p>
            A Google csak azt igazolja vissza, hogy tényleg te vagy — a{" "}
            <strong className="text-foreground">
              neved, iskolai e-mail-címed és profilképed
            </strong>{" "}
            kerül át hozzánk, semmi más. Nem kapunk hozzáférést a leveleidhez, a
            naptáradhoz vagy bármi máshoz a Google-fiókodban, és a Google felé
            sem küldünk soha semmilyen kérést a belépésen túl.
          </p>
          <p>
            Csak a{" "}
            <span className="whitespace-nowrap font-mono text-xs">
              @jedlik.eu
            </span>{" "}
            és a{" "}
            <span className="whitespace-nowrap font-mono text-xs">
              @students.jedlik.eu
            </span>{" "}
            címekkel lehet belépni — egy személyes Gmail-cím nem elég, ezt a
            szerverünk minden belépésnél ellenőrzi.
          </p>
          <p>
            Az iskola rendszere (a Jedlikinfo) ebből NEM tudja megmondani,
            melyik osztályba jársz — ezt eddig csak az alábbi, kivezetés alatt
            álló iskolai jelszavas belépés adta meg. Google-belépés után ezért
            kézzel kell kiválasztanod az osztályod, ahogy bejelentkezés nélkül
            is tennéd.
          </p>
        </section>

        <section className="mt-10 flex flex-col gap-3 border-t border-border pt-6 text-sm leading-relaxed text-muted-strong">
          <h2 className="text-base font-semibold text-foreground">
            Mi történik iskolai jelszavas belépéskor
          </h2>
          <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-foreground">
            Ez a belépési mód <strong>megszűnőben van</strong>. Iskolai
            jelszóval mostantól <strong>új fiók nem hozható létre</strong> — ha
            még sosem léptél be itt, a fenti Google-gombot használd. Ha korábban
            már volt fiókod, ezzel most is be tudsz lépni; az itt leírtak addig
            érvényesek, amíg ez a belépési mód teljesen el nem tűnik, és a fenti
            Google-gomb marad az egyetlen út (a korábban beállított gyors
            belépés mellett).
          </p>
          <p>
            A felhasználóneved és a jelszavad ugyanaz, amivel a Jedlikinfóba
            belépsz. A szerverünk ezeket{" "}
            <strong className="text-foreground">
              változtatás nélkül továbbadja az iskola rendszerének
            </strong>
            , és az mondja meg, hogy helyesek-e. A jelszavadat{" "}
            <strong className="text-foreground">
              nem tároljuk és nem naplózzuk
            </strong>{" "}
            — sem nyílt, sem titkosított formában: a belépés után nem marad
            belőle nyoma nálunk.
          </p>
          <p>
            Az iskola rendszere a sikeres belépéskor azt is megmondja, melyik{" "}
            <strong className="text-foreground">osztályba</strong> jársz. Ez az
            egyetlen ok, amiért ez a belépési mód egyáltalán létezik: így a lap
            belépés után rögtön a te órarendedet mutatja, anélkül hogy kézzel
            kellene kiválasztanod.
          </p>
          {/*//! EZT KI KELL MONDANI, MERT AZ OLDAL NEM AZ ISKOLÁÉ. Egy nem
              //! hivatalos lap, ami iskolai jelszót kér, pontosan úgy néz ki,
              //! mint egy adathalász oldal — a gyanakvás itt HELYES reakció. Ha
              //! elhallgatnánk, azzal a gyanakvó diáknak adnánk igazat. Ehelyett
              //! megmondjuk, mit ellenőrizzen: a címsort. */}
          <p>
            Mielőtt beírod: nézd meg a böngésző címsorát. Iskolai jelszót
            kizárólag ezen az egy lapon kérünk, és soha nem kérjük e-mailben,
            üzenetben vagy felugró ablakban. Ha bizonytalan vagy, ne írd be — az
            órarend bejelentkezés nélkül is teljes egészében használható.
          </p>
          <p>
            Amit a belépés után tárolunk: a fenti azonosító adatok, és a saját
            órarend-beállításaid. Sem az órarend-nézegetésedet, sem azt, mikor
            és honnan lépsz be, nem kötjük a fiókodhoz. Részletesen:{" "}
            <Link
              href="/adatvedelem"
              className="text-primary underline underline-offset-2"
            >
              adatvédelmi tájékoztató
            </Link>
            .
          </p>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
