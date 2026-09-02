import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Adatvédelem - Órarend",
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
        Utolsó frissítés: 2026. szeptember 2.
      </p>

      <div className="mt-8 flex flex-col gap-8 text-sm leading-relaxed text-muted-strong">
        <section className="flex flex-col gap-2">
          <h2 className="text-base font-semibold text-foreground">
            Ki üzemelteti az oldalt
          </h2>
          <p>
            Az Órarendet Szalai Bence üzemelteti, magánjellegű, nem hivatalos
            projektként. Az oldal nem az iskola
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
            nincs szükség semmilyen adat megadására. Egyetlen kivétel van, és az
            is csak akkor, ha te magad kéred: az órarend-értesítésekhez a
            böngésződ push-címét tárolnunk kell — lásd az{" "}
            <span className="font-medium text-foreground">Értesítések</span>{" "}
            szakaszt lentebb.
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
            Osztályszintű használati statisztika
          </h2>
          <p>
            Az oldal összesített statisztikát vezet arról, hogy melyik osztály
            órarendjét nézik a legtöbben. Ehhez az eszközöd naponta és
            osztályonként egyetlen jelzést küld, amely kizárólag az osztály
            nevét tartalmazza (pl. „13C”) — se nevet, se eszköz- vagy
            felhasználóazonosítót, se IP-címet, se pontos időpontot nem tárolunk
            mellé. A jelzések napi bontásban, osztályonkénti darabszámként
            összegződnek, így az adatból sem visszamenőleg, sem összevetéssel
            nem állapítható meg, hogy ki nyitotta meg az oldalt.
          </p>
          <p>
            Hogy ugyanaz az eszköz naponta csak egyszer számítson bele, a
            böngésződ helyben megjegyzi, mely osztályokat jelezte aznap. Ez a
            jelölő kizárólag a te eszközödön marad, elküldésre soha nem kerül.
            Az összesített számokat az üzemeltető legfeljebb két tanévig őrzi
            meg.
          </p>
        </section>

        {/*//! EZ AZ EGYETLEN ADAT, AMI EGY KÉSZÜLÉKHEZ KÖTHETŐ — ÉS EZT KI KELL
            //! MONDANI. A lap többi szakasza azzal kezdődik, hogy semmilyen
            //! azonosítót nem tárolunk; a push-végpont ezt megtöri, mert az MAGA
            //! a cím, ahová a jelzés megy. Elhallgatva a fenti mondatok
            //! valótlanná válnának, ezért itt nevesítve áll: mi kerül a
            //! tárolóba, mi nem, meddig, és hogyan lehet visszavonni. */}
        <section className="flex flex-col gap-2">
          <h2 className="text-base font-semibold text-foreground">
            Értesítések (opcionális)
          </h2>
          <p>
            Az órarend-értesítés bekapcsolása kizárólag a te döntésed: a
            böngésző engedélykérése csak akkor jelenik meg, ha a harang ikonra
            koppintasz, és a megjelenő ablakban külön megerősíted. Enélkül az
            oldal soha nem kérdez rá, és nem tárol semmit.
          </p>
          <p>
            Ha bekapcsolod, a böngésződ létrehoz egy úgynevezett push-végpontot
            — ez egy cím a böngésződ gyártójának szolgáltatásánál (Google,
            Apple, Mozilla), amelyre az értesítés érkezhet. Ezt a címet, a
            hozzá tartozó titkosítási kulcsokat és az általad kiválasztott
            osztályok nevét tároljuk. Ez az oldal egyetlen olyan adata, amely
            egy adott készülékhez köthető; enélkül az értesítés nem tudna
            megérkezni. Nevet, e-mail-címet, IP-címet, eszközleírót vagy
            csoportbontás-beállítást nem tárolunk mellé, és az értesítésekből
            gyűjtött adatot semmilyen más célra — statisztikára sem —
            használjuk fel.
          </p>
          <p>
            A tárolt sor legfeljebb 400 napig él, és minden alkalommal
            újraindul, amikor megnyitod az oldalt. Ha kikapcsolod az
            értesítéseket a harangnál, a sor azonnal törlődik; ugyanez történik
            akkor is, ha a böngészőben vonod vissza az engedélyt, vagy törlöd az
            oldal adatait.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-base font-semibold text-foreground">
            Helyi tárolás a böngészőben
          </h2>
          <p>
            A kiválasztott osztály, a beállítások (pl. összevont
            csoportbontások) és az utoljára megnyitott nézet a böngésző saját,
            helyi tárolójában (localStorage) mentődnek, kizárólag a te
            eszközödön. Ezek a beállítások nem kerülnek elküldésre semmilyen
            szerverre — az egyetlen kivétel a fentebb leírt osztályszintű
            statisztika, amely magát az osztály nevét (és semmi mást)
            továbbítja. Minden helyben tárolt adat bármikor törölhető a böngésző
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
