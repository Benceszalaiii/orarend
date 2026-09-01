import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Adatvédelem – Órarend",
  description: "Adatvédelmi tájékoztató az Órarend alkalmazáshoz.",
};

export default function AdatvedelemPage() {
  return (
    <main className="mx-auto min-h-[100dvh] max-w-2xl px-5 py-10 sm:py-16">
      <Link
        href="/orarend"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Vissza az órarendhez
      </Link>

      <h1 className="mt-6 text-2xl font-bold tracking-tight text-foreground">
        Adatvédelmi tájékoztató
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Utolsó frissítés: 2026. szeptember 1.
      </p>

      <div className="mt-8 flex flex-col gap-8 text-sm leading-relaxed text-muted-strong">
        <section className="flex flex-col gap-2">
          <h2 className="text-base font-semibold text-foreground">
            Ki üzemelteti az oldalt
          </h2>
          <p>
            Az Órarendet Szalai Bence üzemelteti, magánjellegű, nem hivatalos
            projektként. Az oldal nem a Jedlik Szakmai Portál vagy az iskola
            hivatalos szolgáltatása, kizárólag a nyilvánosan elérhető
            órarendadatok kényelmesebb megjelenítését szolgálja.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-base font-semibold text-foreground">
            Milyen adatokat kezelünk
          </h2>
          <p>
            Az oldal nem kér és nem tárol személyes adatot: nincs regisztráció,
            bejelentkezés vagy felhasználói fiók, és az órarend megtekintéséhez
            nincs szükség semmilyen adat megadására.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-base font-semibold text-foreground">
            Látogatottsági statisztika (Vercel Analytics)
          </h2>
          <p>
            Az oldal a Vercel Web Analytics szolgáltatását használja anonim,
            összesített látogatottsági adatok gyűjtésére (pl. megtekintett
            oldalak, hivatkozó oldal, ország szintű helyadat, eszköz típusa). A
            szolgáltatás nem használ cookie-kat, és nem tárol olyan azonosítót,
            amellyel egy látogató a későbbiekben felismerhető lenne. A látogató
            IP-címét a Vercel csak átmenetileg, egy naponta változó, vissza nem
            fejthető kivonat előállítására dolgozza fel, nyers formában nem
            tárolja. Ebben a folyamatban a Vercel Inc. adatfeldolgozóként jár
            el.
          </p>
          <p>
            Bővebben:{" "}
            <a
              href="https://vercel.com/docs/analytics/privacy-policy"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline underline-offset-2"
            >
              a Vercel Web Analytics adatvédelmi tájékoztatója
            </a>
            .
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-base font-semibold text-foreground">
            Helyi tárolás a böngészőben
          </h2>
          <p>
            A kiválasztott osztály és a beállítások (pl. összevont
            csoportbontások) a böngésző saját, helyi tárolójában (localStorage)
            mentődnek, kizárólag a te eszközödön. Ezek az adatok nem kerülnek
            elküldésre semmilyen szerverre, és bármikor törölhetők a böngésző
            adatainak törlésével.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-base font-semibold text-foreground">
            Az órarend adatainak forrása
          </h2>
          <p>
            Az oldal a Jedlik hivatalos, nyilvánosan elérhető
            órarendrendszeréből tölti be az órarendadatokat (osztályok, órák,
            csoportbontások), az iskolával fennálló saját felhasználói
            kapcsolatod nélkül.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-base font-semibold text-foreground">Kapcsolat</h2>
          <p>
            Az adatkezeléssel kapcsolatos kérdéssel az oldal üzemeltetőjéhez,
            Szalai Bencéhez fordulhatsz.
          </p>
        </section>
      </div>
    </main>
  );
}
