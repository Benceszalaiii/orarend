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
          is minden működik. A belépés egyetlen dolgot ad: a beállításaid (a
          kiválasztott osztály, az összevont csoportbontások, a duális beosztás)
          átjönnek a telefonodról a gépedre és vissza.
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
            Mi történik belépéskor
          </h2>
          <p>
            A gomb a Microsoft saját bejelentkező oldalára visz. A jelszavadat{" "}
            <strong className="text-foreground">
              ez az oldal soha nem látja
            </strong>{" "}
            — nem is kérjük be, nem tároljuk és nem továbbítjuk. A belépés után
            a Microsoft csak annyit ad át, hogy ki vagy: a neved, az iskolai
            e-mail-címed, és egy azonosító.
          </p>
          <p>
            Csak <strong className="text-foreground">iskolai fiókkal</strong>{" "}
            lehet belépni. Más Microsoft-fiók (magáncím, másik iskola) már a
            Microsoft oldalán elakad, nem jut el hozzánk.
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
