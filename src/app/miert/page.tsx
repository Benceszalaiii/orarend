import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/components/site-footer";

export const metadata: Metadata = {
  title: "Miért - Órarend",
  description: "Miért készült az Órarend, és mihez tartja magát.",
};


export default function MiertPage() {
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
          Miért van ez az oldal
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Utolsó frissítés: 2026. szeptember 16.
        </p>

        <div className="mt-8 flex flex-col gap-8 text-sm leading-relaxed text-muted-strong">
          <section className="flex flex-col gap-2">
            <h2 className="text-base font-semibold text-foreground">Miért?</h2>
            <p>
              Régota gondolkodtam azon, hogyan járuljak hozzá a Jedlik
              működéséhez. Ezzel az oldallal jött el az első alkalom, hogy ezt
              megtehettem.
            </p>
            <p>
              Sokszor hallani, hogy "lehetne jobb", vagy "miért nincs ilyen". És
              ez legtöbbször a szakmai tantárgyakra vonatkozik (Ez a szemlélet
              az oldal fókuszában is látszik). Ezt viszont nem lehet teljesen az
              iskolára hárítani.
            </p>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="text-base font-semibold text-foreground">
              Mi a probléma a szakmai tantárgyakkal?
            </h2>
            <p>
              Főleg a szoftverfejesztésnél, de a szakmai tantárgyaknál is az a
              probléma, hogy a tananyagnak és a tanítási módszereknek kevesebb,
              mint évente kellene alkalmazkodniuk a piachoz. Ez lehetetlen,
              főleg ha az iskolának nincs erre specializált eszközei, hogy
              tényleg az legyen fókuszban, aminek lennie kell, a tanulás. A
              legtöbb diáktól azt hallani, hogy nem tudnak mit kezdeni a szakmai
              tárgyakkal, sokan elfogadták, hogy nem lesznek jók a szakmában.
            </p>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="text-base font-semibold text-foreground">
              Miért fontos ez?
            </h2>
            <p>
              A diákok legtöbbször a tanulás "hírneve" miatt nem foglalkoznak
              vele. Ha egy kicsit is meg lehet változtatni az alapköveit az
              oktatásnak, azokat a diákokat is rá lehet venni, akik csak túlélni
              mennek be. Részben ezért is készül az oldal, főleg olyan
              változásokkal, hogy valós időt ír ki, nem tanóraszámot.
            </p>
            <p>
              Van egy szabály (Pareto Principle), ami szerint az eredmény 80%-át
              a tevékenységek 20%-a adja. Ha a 20% egy részét meg lehet
              kényelmes, digitális megoldásokkal tenni, már közelebb állunk
              ahhoz, hogy sikeres emberek hagyják el az iskolát.
            </p>
            <p>
              Hiszek abban, hogy a diákok kényelme arányos a tanulás
              sikerességével.
            </p>
          </section>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
