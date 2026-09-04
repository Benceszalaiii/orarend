import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/components/site-footer";

export const metadata: Metadata = {
  title: "Adatvédelem - Órarend",
  description: "Adatvédelmi tájékoztató az Órarend alkalmazáshoz.",
};

export default function AdatvedelemPage() {
  return (
    //! A LÁBLÉC AKKOR IS ALUL VAN, HA A TARTALOM RÖVID. A `flex-col` + a
    //! láblécen ülő `mt-auto` együtt tolja a lap aljára — enélkül egy rövid
    //! szöveg után középen lógna.
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
          Adatvédelmi tájékoztató
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Utolsó frissítés: 2026. szeptember 4.
        </p>

        <div className="mt-8 flex flex-col gap-8 text-sm leading-relaxed text-muted-strong">
          <section className="flex flex-col gap-2">
            <h2 className="text-base font-semibold text-foreground">
              Ki üzemelteti az oldalt
            </h2>
            <p>
              Az Órarendet Szalai Bence üzemelteti, magánjellegű, nem hivatalos
              projektként. Az oldal nem az iskola hivatalos szolgáltatása,
              kizárólag a nyilvánosan elérhető órarendadatok kényelmesebb
              megjelenítését szolgálja.
            </p>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="text-base font-semibold text-foreground">
              Milyen adatokat kezelünk
            </h2>
            <p>
              Az órarend megtekintéséhez semmilyen adat megadására nincs
              szükség: regisztráció nincs, és bejelentkezés nélkül az oldal
              minden funkciója használható. Két olyan lehetőség van, amely
              adatkezeléssel jár, és mindkettő kizárólag akkor lép működésbe, ha
              te magad kéred: az{" "}
              <span className="font-medium text-foreground">Értesítések</span>{" "}
              (a böngésződ push-címe) és a{" "}
              <span className="font-medium text-foreground">
                Belépés az iskolai fiókkal
              </span>{" "}
              (a beállításaid átvitele másik eszközre). Mindkettőről külön
              szakasz szól lentebb.
            </p>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="text-base font-semibold text-foreground">
              Látogatottsági statisztika (Vercel Analytics)
            </h2>
            <p>
              Az oldal a Vercel Web Analytics szolgáltatását használja anonim,
              összesített látogatottsági adatok gyűjtésére (pl. megtekintett
              oldalak, hivatkozó oldal, ország szintű helyadat, eszköz típusa).
              A szolgáltatás nem használ cookie-kat, és nem tárol olyan
              azonosítót, amellyel egy látogató a későbbiekben felismerhető
              lenne. A látogató IP-címét a Vercel csak átmenetileg, egy naponta
              változó, vissza nem fejthető kivonat előállítására dolgozza fel,
              nyers formában nem tárolja. Ebben a folyamatban a Vercel Inc.
              adatfeldolgozóként jár el.
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
              felhasználóazonosítót, se IP-címet, se pontos időpontot nem
              tárolunk mellé. A jelzések napi bontásban, osztályonkénti
              darabszámként összegződnek, így az adatból sem visszamenőleg, sem
              összevetéssel nem állapítható meg, hogy ki nyitotta meg az oldalt.
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
              Ha bekapcsolod, a böngésződ létrehoz egy úgynevezett
              push-végpontot — ez egy cím a böngésződ gyártójának
              szolgáltatásánál (Google, Apple, Mozilla), amelyre az értesítés
              érkezhet. Ezt a címet, a hozzá tartozó titkosítási kulcsokat és az
              általad kiválasztott osztályok nevét tároljuk. Ez az oldal
              egyetlen olyan adata, amely egy adott készülékhez köthető; enélkül
              az értesítés nem tudna megérkezni. Nevet, e-mail-címet, IP-címet,
              eszközleírót vagy csoportbontás-beállítást nem tárolunk mellé, és
              az értesítésekből gyűjtött adatot semmilyen más célra —
              statisztikára sem — használjuk fel.
            </p>
            <p>
              A tárolt sor legfeljebb 400 napig él, és minden alkalommal
              újraindul, amikor megnyitod az oldalt. Ha kikapcsolod az
              értesítéseket a harangnál, a sor azonnal törlődik; ugyanez
              történik akkor is, ha a böngészőben vonod vissza az engedélyt,
              vagy törlöd az oldal adatait.
            </p>
          </section>

          {/*//! A BEJELENTKEZÉS AZ EGYETLEN OLYAN FUNKCIÓ, AMI SZEMÉLYHEZ KÖTHETŐ
            //! ADATOT TÁROL — ezért nem elég egy mondattal elintézni.
            //! Külön ki van mondva, mi történik a JELSZÓVAL, mert ez az oldal
            //! NEM az iskoláé: egy nem hivatalos lap, ami iskolai jelszót kér,
            //! pontosan az a minta, amire gyanakodni kell. Ha ezt elhallgatnánk
            //! vagy szépítenénk, a gyanakvó diáknak lenne igaza. */}
          <section className="flex flex-col gap-2">
            <h2 className="text-base font-semibold text-foreground">
              Belépés az iskolai fiókkal (opcionális)
            </h2>
            <p>
              A belépés két dolgot ad: az iskola rendszere megmondja, melyik
              osztályba jársz (így nem kell kiválasztanod), és a beállításaid
              átjönnek az egyik eszközödről a másikra. Az órarend enélkül is
              teljes egészében használható, és az oldal soha nem kéri, hogy
              bejelentkezz.
            </p>
            <p>
              A belépéshez az iskolai (Jedlikinfo) felhasználóneved és jelszavad
              kell. A szerverünk ezeket változtatás nélkül továbbadja az iskola
              rendszerének, és az dönti el, hogy helyesek-e.{" "}
              <span className="font-medium text-foreground">
                A jelszavadat nem tároljuk és nem naplózzuk
              </span>{" "}
              — sem nyílt, sem titkosított, sem kivonatolt formában: a belépés
              után nem marad belőle nyoma nálunk. Iskolai jelszót kizárólag a
              belépő oldalon kérünk, és soha nem kérünk e-mailben, üzenetben
              vagy felugró ablakban.
            </p>
            <p>
              Amit a sikeres belépés után eltárolunk: az iskolai
              felhasználóneved, az iskola rendszere által megadott{" "}
              <span className="font-medium text-foreground">osztályod</span> (és
              hogy tanár vagy-e), valamint a bejelentkezett állapotot fenntartó
              munkamenet — egy süti a böngésződben és egy sor az
              adatbázisunkban, IP-címmel és böngészőazonosítóval, hogy a saját
              munkameneteidet fel tudd ismerni. E-mail-címet nem tárolunk: a
              fiókodhoz egy technikai, nem létező című helykitöltő tartozik,
              amelyre levelet küldeni nem lehet.
            </p>
            <p>
              Az osztályodat minden belépéskor újra megkérdezzük az iskola
              rendszerétől, hogy egy átsorolás után se maradjon rajtad a régi.
            </p>
            <p>
              Belépés után a saját órarend-beállításaid (osztály, összevont
              csoportbontások, duális beosztás, utoljára megnyitott nézet) a
              fiókodhoz mentődnek. Ezen kívül semmi mást nem kötünk a fiókodhoz:
              sem azt, hogy melyik osztály órarendjét mikor nézted meg, sem az
              értesítés-feliratkozásaidat — a használati statisztika és az
              értesítések ugyanúgy névtelenek maradnak, mint bejelentkezés
              nélkül.
            </p>
            <p>
              Kijelentkezéskor a munkamenet törlődik, a beállításaid pedig
              megmaradnak azon az eszközön, amelyiken vagy. Ha a fiókodat és a
              hozzá mentett beállításokat véglegesen törölni szeretnéd, írj az
              üzemeltetőnek.
            </p>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="text-base font-semibold text-foreground">
              Helyi tárolás a böngészőben
            </h2>
            <p>
              A kiválasztott osztály, a beállítások (pl. összevont
              csoportbontások, duális beosztás) és az utoljára megnyitott nézet
              a böngésző saját, helyi tárolójában (localStorage) mentődnek,
              kizárólag a te eszközödön. Bejelentkezés nélkül ezek a beállítások
              nem kerülnek elküldésre semmilyen szerverre — az egyetlen kivétel
              a fentebb leírt osztályszintű statisztika, amely magát az osztály
              nevét (és semmi mást) továbbítja. Ha bejelentkezel, ugyanezek a
              beállítások a fiókodhoz is mentődnek, hogy másik eszközön is
              megjelenjenek — lásd a{" "}
              <span className="font-medium text-foreground">
                Belépés az iskolai fiókkal
              </span>{" "}
              szakaszt. Minden helyben tárolt adat bármikor törölhető a böngésző
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
            <h2 className="text-base font-semibold text-foreground">
              Kapcsolat
            </h2>
            <p>
              Az adatkezeléssel kapcsolatos kérdéssel az oldal üzemeltetőjéhez,
              Szalai Bencéhez fordulhatsz.
            </p>
          </section>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
