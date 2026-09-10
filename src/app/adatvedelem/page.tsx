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
          Utolsó frissítés: 2026. szeptember 7.
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
              minden funkciója használható. Három olyan lehetőség van, amely
              adatkezeléssel jár, és mindhárom kizárólag akkor lép működésbe, ha
              te magad kéred: az{" "}
              <span className="font-medium text-foreground">Értesítések</span>{" "}
              (a böngésződ push-címe), a{" "}
              <span className="font-medium text-foreground">
                Naptár-feliratkozás
              </span>{" "}
              (az órarended és a csoportválasztásaid, hogy a naptáralkalmazásod
              le tudja kérni) és a{" "}
              <span className="font-medium text-foreground">
                Belépés az iskolai fiókkal
              </span>{" "}
              (a beállításaid átvitele másik eszközre). Mindháromról külön
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
              Teljesítménymérés (Vercel Speed Insights)
            </h2>
            <p>
              Az oldal a Vercel Speed Insights szolgáltatását használja a
              betöltési sebesség mérésére (pl. mennyi idő alatt jelenik meg a
              tartalom, mennyire gyorsan válaszol az oldal az első érintésre). A
              mérés nem használ cookie-t, és nem gyűjt olyan adatot, amiből egy
              látogató munkamenete oldalakon átívelően összeállítható, vagy egy
              látogató felismerhető lenne. Amit a szolgáltatás rögzít: a
              megnyitott útvonal, a hálózat típusa (pl. 4g), a böngésző és
              eszköz típusa, az ország (nem pontosabb helyadat), valamint a mért
              teljesítményértékek. Ebben a folyamatban is a Vercel Inc. jár el
              adatfeldolgozóként.
            </p>
            <p>
              Bővebben:{" "}
              <a
                href="https://vercel.com/docs/speed-insights/privacy-policy"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline underline-offset-2"
              >
                a Vercel Speed Insights adatvédelmi tájékoztatója
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
              általad kiválasztott osztályok — tanárként a tanári jelek — nevét
              tároljuk. Ez az oldal egyetlen olyan adata, amely egy adott
              készülékhez köthető; enélkül az értesítés nem tudna megérkezni.
              Nevet, e-mail-címet, IP-címet, eszközleírót vagy
              csoportbontás-beállítást nem tárolunk mellé, és az értesítésekből
              gyűjtött adatot semmilyen más célra — statisztikára sem —
              használjuk fel.
            </p>
            {/*//! A TANÁRI FELIRATKOZÁS TÖBBET MOND EL EGY EMBERRŐL, MINT EGY
              //! OSZTÁLYOS — ezért külön bekezdést kap. Nem az adat titkos (az
              //! órarend nyilvános), hanem az, hogy ez a lap EGY KONKRÉT
              //! EMBER munkanapját küldi el egy készülékre nap mint nap. Az
              //! ehhez kötött feltételt (iskolai belépés) ezért ki kell
              //! mondani, nem csak a kódban betartani. */}
            <p>
              Tanár órarendjéről csak az kaphat értesítést, aki iskolai
              belépéssel, tanári fiókkal jelentkezett be — a beállítást a
              kiszolgáló ehhez köti, nem csak a felület. A feliratkozás így is
              ugyanannyit tárol, mint az osztályos: a push-címet, a kulcsokat és
              a kiválasztott tanári jelet; azt nem, hogy ki állította be.
            </p>
            <p>
              A tárolt sor legfeljebb 400 napig él, és minden alkalommal
              újraindul, amikor megnyitod az oldalt. Ha kikapcsolod az
              értesítéseket a harangnál, a sor azonnal törlődik; ugyanez
              történik akkor is, ha a böngészőben vonod vissza az engedélyt,
              vagy törlöd az oldal adatait.
            </p>
          </section>

          {/*//! A NAPTÁR-FEED MEGTÖRI EGY EDDIGI ÍGÉRETÜNKET, ÉS EZT KI KELL
            //! MONDANI. A lap eddig végig azt írta — és az igaz is volt —, hogy
            //! a csoportbontás-döntés a böngészőben marad. Egy naptár-feednél ez
            //! LEHETETLEN: a naptáralkalmazás süti nélkül, a készülékedtől
            //! függetlenül kéri le a fájlt, tehát a szűrést csak a kiszolgáló
            //! végezheti el. Elhallgatva a fenti mondat valótlanná válna;
            //! ezért itt nevesítve áll, mi kerül a tárolóba, meddig, ki láthatja,
            //! és hogyan lehet visszavonni. */}
          <section className="flex flex-col gap-2">
            <h2 className="text-base font-semibold text-foreground">
              Naptár-feliratkozás (opcionális)
            </h2>
            <p>
              Az órarended felvehető a telefonod (vagy a géped) naptárába. Ez
              kizárólag a te döntésed: a link akkor és csak akkor jön létre,
              amikor a Naptár ablakban megnyomod a{" "}
              <span className="font-medium text-foreground">
                Link készítése
              </span>{" "}
              gombot. Amíg ezt nem teszed meg, semmi nem kerül a kiszolgálóra.
            </p>
            <p>
              A link elkészítésekor a kiszolgálóra kerül a választott osztály
              (vagy tanári jel), a{" "}
              <span className="font-medium text-foreground">
                csoportbontás-választásaid
              </span>{" "}
              és — ha beállítottad — a duális beosztásod. Erre azért van
              szükség, mert a naptáralkalmazásod a saját nevében, bejelentkezés
              nélkül kéri le a fájlt: a kiszolgálónak magának kell tudnia, mely
              órák a tieid. Ez az egyetlen funkció, amelynél ezek a beállítások
              elhagyják a böngésződet. Nevet, e-mail-címet, IP-címet vagy
              eszközleírót nem tárolunk mellé, és nem vezetünk naplót arról,
              mikor kérte le a naptárad a fájlt.
            </p>
            <p>
              A link egy hosszú, véletlen azonosítót tartalmaz, amit nem lehet
              kitalálni és nem lehet visszafejteni belőle, kié.{" "}
              <span className="font-medium text-foreground">
                Aki viszont megkapja a linket, látja ezt az órarendet
              </span>{" "}
              — jelszót nem lehet hozzá kérni, mert egy naptáralkalmazásnak
              nincs hova beírnia. Ezért a linket úgy kezeld, mint egy
              magánügyet; ha mégis kikerült, vond vissza, és kérj újat.
            </p>
            <p>
              Tanár órarendjéhez csak az készíthet naptár-linket, aki iskolai
              belépéssel, tanári fiókkal jelentkezett be — ugyanaz a feltétel,
              mint az értesítéseknél, és ugyanazért: egy folyamatosan frissülő
              link egy konkrét ember munkanapjáról akkor is követés, ha minden
              adata nyilvános.
            </p>
            <p>
              A tárolt sor legfeljebb 400 napig él, és minden lekéréssel
              újraindul; ha a naptárad többé nem kérdezi, magától törlődik. A{" "}
              <span className="font-medium text-foreground">
                Link visszavonása
              </span>{" "}
              gomb azonnal és véglegesen törli: a link ettől kezdve nem ad
              órarendet senkinek.
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
              Amit a sikeres belépés után eltárolunk: a neved (ha az iskola
              rendszere megadja; ha nem, a felhasználóneved), az iskolai
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

          {/*//! A GOOGLE-BELÉPÉS ÚJ ADATFELDOLGOZÓT VON BE — MAGÁT A GOOGLE-T.
            //! Ez a szakasz azért áll ITT, az iskolai fiókos szakasz UTÁN, mert
            //! ez a belépési mód került be másodikként: a diákok egy része már
            //! ismerte az iskolai belépést, amikor ez megjelent. Mire a
            //! kivezetés véget ér, ez a szakasz kerül előre. */}
          <section className="flex flex-col gap-2">
            <h2 className="text-base font-semibold text-foreground">
              Belépés Google-fiókkal (opcionális)
            </h2>
            <p>
              A belépéshez az iskolai Google-fiókodat használjuk (
              <span className="font-mono text-xs">@jedlik.eu</span> vagy{" "}
              <span className="font-mono text-xs">@students.jedlik.eu</span>) —
              más domainű, például személyes Gmail-fiókkal a belépés
              elutasításra kerül. A Google csak azt igazolja vissza, hogy
              tényleg te vagy;{" "}
              <span className="font-medium text-foreground">
                a jelszavadat mi soha nem látjuk
              </span>{" "}
              — az a Google és közted marad.
            </p>
            <p>
              Amit a Google átad, és amit ebből eltárolunk: a neved, az iskolai
              e-mail-címed és a profilképed (ha van). Nem kérünk és nem kapunk
              hozzáférést a leveleidhez, a naptáradhoz, a meghajtódhoz vagy
              bármi máshoz a Google-fiókodban, és a belépésen túl soha nem
              küldünk kérést a Google felé — nincs olyan jogosultságunk
              (hozzáférési token), amivel ezt megtehetnénk.
            </p>
            <p>
              A Google ebből NEM tudja megmondani, melyik osztályba jársz — ezt
              csak az iskola saját (Jedlikinfo) rendszere adja meg, lásd fent.
              Google-belépés után ezért kézzel kell kiválasztanod az osztályod,
              ahogy bejelentkezés nélkül is tennéd. Azt viszont a Google-fiókod
              domainjéből (<span className="font-mono text-xs">@jedlik.eu</span>{" "}
              a tantestület,{" "}
              <span className="font-mono text-xs">@students.jedlik.eu</span> a
              diákok címe) megállapítjuk, hogy tanárként vagy diákként lépsz-e
              be — ez dönti el, kaphatsz-e tanári órarend-értesítést.
            </p>
            <p>
              Ebben a folyamatban a Google (Google Ireland Limited)
              adatfeldolgozóként/harmadik félként jár el, a saját{" "}
              <a
                href="https://policies.google.com/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline underline-offset-2"
              >
                adatvédelmi szabályzata
              </a>{" "}
              szerint.
            </p>
          </section>

          {/*//! A BEJELENTKEZÉST KISZOLGÁLÓ HÁTTÉRSZOLGÁLTATÓ (Better Auth
            //! Infra: `dash()` + `sentinel()`) EGY ÖNÁLLÓ ADATFELDOLGOZÓ, NEM
            //! CSAK EGY KÖNYVTÁR. A `dash()` minden belépésről, kilépésről és
            //! munkamenet-létrehozásról eseményt küld a saját szervereire, ezt
            //! semmilyen kapcsoló nem tiltja le — ezért ezt itt, nevesítve
            //! kell kimondani, nem elég a fenti szakaszokba rejteni. */}
          <section className="flex flex-col gap-2">
            <h2 className="text-base font-semibold text-foreground">
              A bejelentkezést kiszolgáló háttérszolgáltató (Better Auth)
            </h2>
            <p>
              Az iskolai belépést a Better Auth nevű, nyílt forráskódú
              hitelesítési keretrendszer szolgálja ki, ennek egy kiegészítője (a
              „Better Auth Infra") pedig üzemeltetői rálátást és visszaélés
              elleni védelmet ad hozzá. Ebben a folyamatban a Better Auth
              (Better Auth, Inc.) adatfeldolgozóként jár el.
            </p>
            <p>
              Minden sikeres és sikertelen belépésről, kilépésről és új
              munkamenet létrehozásáról esemény megy a Better Auth szervereire;
              ez a nevedet (vagy a felhasználónevedet), a helykitöltő
              e-mail-címedet, az IP-címedet, az IP-címből származtatott
              hozzávetőleges város/ország adatot és a böngésződ azonosítóját
              tartalmazza. Erre a funkcióra nincs kapcsoló — ameddig az iskolai
              belépés elérhető, ez az esemény minden belépéssel együtt jár.
            </p>
            <p>
              Emellett a lap egy „Sentinel" nevű visszaélés-védelmi kiegészítőt
              is bekapcsolva tart, amely a gyors, jelszó nélküli belépéshez
              (passkey) tartozó kéréseknél az IP-címedet továbbítja a Better
              Auth ellenőrző szolgáltatásának, hogy kiszűrje az automatizált,
              tömeges próbálkozásokat. Jelenleg egyetlen konkrét szabályt (pl.
              helyszín szerinti tiltás, bot- vagy VPN-felismerés) sem
              kapcsoltunk hozzá — a kérés így is elmegy, de érdemi döntést
              (kizárást, kihívást) egyelőre nem hoz belőle a rendszer. Tudatosan
              NEM használjuk ennek a kiegészítőnek a böngésző-ujjlenyomatot vevő
              kliens felét (ami képernyő-, betűkészlet- és hardveradatokból
              azonosítana egy eszközt) — ez nem illene ahhoz, amit ez az oldal a
              diákok adatairól vállal.
            </p>
            <p>
              Bővebben:{" "}
              <a
                href="https://better-auth.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline underline-offset-2"
              >
                a Better Auth honlapja
              </a>
              .
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
              nem kerülnek elküldésre semmilyen szerverre — két kivétellel: a
              fentebb leírt osztályszintű statisztika magát az osztály nevét (és
              semmi mást) továbbítja, a{" "}
              <span className="font-medium text-foreground">
                naptár-feliratkozás
              </span>{" "}
              pedig — ha te magad kéred — a csoportbontás-választásaidat is
              (lásd a saját szakaszát fentebb). Ha bejelentkezel, ugyanezek a
              beállítások a fiókodhoz is mentődnek, hogy másik eszközön is
              megjelenjenek — lásd a{" "}
              <span className="font-medium text-foreground">
                Belépés az iskolai fiókkal
              </span>{" "}
              szakaszt. Minden helyben tárolt adat bármikor törölhető a böngésző
              adatainak törlésével.
            </p>
            {/*//! EZT KI KELL MONDANI, MERT ITT EGY SÜTI VAN. A többi
                //! beállítás a böngésző helyi tárolójában marad, és a
                //! kiszolgáló soha nem látja — ez az egy viszont MINDEN
                //! kéréssel elmegy, tehát nem sorolható a fenti mondat alá. A
                //! szakasz ezért megnevezi a sütit, megmondja, mi van benne,
                //! meddig él, és mi történik, ha nincs. */}
            <p>
              Egyetlen kivétel az utoljára megnyitott nézet, amely a
              localStorage mellett egy sütiben is eltárolódik (
              <span className="font-medium text-foreground">
                orarend_last_view_v2
              </span>
              ). Ennek egyetlen tartalma az utoljára megnyitott nézet címe (pl.{" "}
              <span className="font-medium text-foreground">/orarend</span>), és
              egyetlen dolgot csinál: a nyitóoldal ebből tudja, hogy jártál-e
              már az órarenden, és ha igen, rögtön oda visz, a bemutatkozó
              nyitólap helyett. Nem tartalmaz azonosítót, nem alkalmas a
              felismerésedre, és nem használjuk mérésre vagy hirdetésre. A süti
              legfeljebb 400 napig él, és a böngésző adatainak törlésével
              megszűnik — utána a nyitóoldal ismét a nyitólapot mutatja.
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
