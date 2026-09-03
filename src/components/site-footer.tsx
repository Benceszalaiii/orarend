"use client";

import { ArrowUpRight, Download, Star } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { IosInstallSteps } from "@/components/pwa/add-to-home-screen";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useInstall, useInstallOffer } from "@/lib/install-prompt";
import { cn } from "@/lib/utils";

//* ---------------------------------------------------------------------------
//* A LÁBLÉC — AMI NEM AZ ÓRAREND, DE A LAPHOZ TARTOZIK
//* ---------------------------------------------------------------------------
//! A LÁBLÉC A MARADÉK HELYE, NEM EGY MÁSODIK NAVIGÁCIÓ. A fejlécsáv arról szól,
//! amiért a diák idejött: melyik osztály, melyik nézet, melyik hét. Minden más
//! — ki írta, hol a forrás, mi változott, mit tárolunk — az ő szempontjából
//! LÁBJEGYZET: egyszer elolvassa, aztán soha többé. Egy ilyen sor nem
//! érdemel keretet, hátteret vagy saját ikonokat; egy halvány vonal alatt egy
//! sor apró szöveg pontosan annyi hangsúly, amennyit ér.
//*
//! EZÉRT VAN EGY HELYEN. Ezek a hivatkozások eddig szétszórva éltek (az
//! adatvédelem a `/orarend` jelmagyarázat-buborékában, a telepítés egy
//! egyszer felbukkanó kártyán), vagy sehol. Ha mindegyiknek külön helyet
//! keresünk, mindegyik útban lesz valahol. Egy lábléc egyszer kerül útba: a
//! lap alján, ahol már úgyis vége a tartalomnak.
//*
//! A SORREND A HASZNÁLAT SORRENDJE, nem a fontosságé. Elöl a két CSELEKVÉS
//! (telepítés, Google-forrás) — ezekre rá lehet koppintani, és tesznek valamit.
//! Utánuk a három OLVASNIVALÓ (változások, adatvédelem, forráskód), amiket
//! elolvasnak, és nem térnek vissza rájuk.

const REPO_URL = "https://github.com/Benceszalaiii/orarend";
const DEVELOPER = "Szalai Bence";

//! A GOOGLE ÁTVISZ MINKET A SAJÁT FELÜLETÉRE — A SAJÁT SZKRIPTJE NÉLKÜL.
//! A Google ad egy kész, beágyazható gombot (`news.google.com/swg/js`), de
//! azzal minden lapbetöltéskor lefutna egy harmadik fél kódja azoknál is, akik
//! soha rá nem koppintanak — egy olyan lapon, ami az `/adatvedelem`-ben azt
//! állítja magáról, hogy a látogatottságmérésen kívül nem tölt be idegen
//! kódot. A Google saját dokumentációja ezért ad egy „deeplink" változatot is:
//! ugyanaz a cél, de csak akkor, ha a felhasználó tényleg elindul oda.
//* https://developers.google.com/search/docs/appearance/preferred-sources
const PREFERRED_SOURCES = "https://www.google.com/preferences/source?q=";

//! A SAJÁT CÍMÜNKET NEM ÍRJUK BE KÉTSZER. A Google-nak a lap DOMAINJÉT kell
//! átadni; ez az egyetlen adat a láblécben, ami nem a kódból, hanem a
//! telepítésből következik. Ha van beállítva kanonikus cím
//! (`NEXT_PUBLIC_SITE_HOST`), az az igazság forrása — előnézeti telepítéseken
//! ugyanis a böngésző címe nem az éles domain. Ha nincs, a böngészőtől
//! kérdezzük meg, mert egy rossz domain rosszabb, mint egy hiányzó gomb.
const CONFIGURED_HOST = process.env.NEXT_PUBLIC_SITE_HOST ?? "";

function useSiteHost(): string {
  const [host, setHost] = useState(CONFIGURED_HOST);
  useEffect(() => {
    if (!CONFIGURED_HOST) setHost(window.location.hostname);
  }, []);
  return host;
}

//* A lábléc szövegmérete és színe egy helyen: a sorok között így nincs
//* rangsor — mind ugyanaz a lábjegyzet.
const ITEM =
  "inline-flex items-center gap-1 rounded-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none";

//! A TELEPÍTÉS GOMBJA CSAK OTT VAN, AHOL TUD IS VALAMIT. Három állapot, három
//! válasz: ahol a böngésző átadta az ajánlatot, ott egy gomb elindítja; iPhone
//! Safariban nincs API, ott a két lépést mutatjuk meg; máshol (asztali
//! Firefox, már telepített ablak) NINCS gomb — egy vezérlő, ami koppintásra
//! nem tud mit tenni, rosszabb, mint a hiánya.
function InstallItem() {
  const offer = useInstallOffer();
  const install = useInstall();

  if (offer === null) return null;

  if (offer === "prompt") {
    return (
      <button type="button" className={ITEM} onClick={install}>
        <Download className="size-3.5" aria-hidden />
        Telepítés
      </button>
    );
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className={ITEM}>
          <Download className="size-3.5" aria-hidden />
          Telepítés
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[17rem] p-3 text-sm">
        <p className="font-semibold text-foreground">
          Tedd ki a kezdőképernyőre
        </p>
        <div className="mt-2">
          <IosInstallSteps />
        </div>
      </PopoverContent>
    </Popover>
  );
}

//! MIT KÉRÜNK ÉS MIT NEM. Ez a hivatkozás nem állít be semmit — a Google saját
//! beállítólapjára visz, ahol a felhasználó maga dönt. Ezért nem „Kövess
//! minket", hanem az, ami történni fog: átmegy egy másik lapra. A külső nyíl
//! ugyanezt mondja el annak, aki nem olvassa a szöveget.
function PreferredSourceItem() {
  const host = useSiteHost();
  if (!host) return null;

  return (
    <a
      href={`${PREFERRED_SOURCES}${encodeURIComponent(host)}`}
      target="_blank"
      rel="noopener noreferrer"
      className={ITEM}
      title="Az Órarend hozzáadása a Google keresés kedvenc forrásaihoz"
    >
      <Star className="size-3.5" aria-hidden />
      Google kedvenc forrás
      <ArrowUpRight className="size-3 opacity-60" aria-hidden />
    </a>
  );
}

//! A HIVATKOZÁSOK KÉT HELYEN KELLENEK, EGY HELYEN ÁLLNAK. A `/orarend` teljes
//! képernyős rácsa alá nem kerülhet lábléc (az a lap szándékosan nem gördül),
//! ezért ott a jelmagyarázat-buborék veszi át ugyanezt a listát — lásd
//! `timetable/calendar.tsx`. Ha a két helyen két lista lenne, az egyik előbb-
//! utóbb lemaradna a másikról.
export function SiteFooterLinks({ className }: { className?: string }) {
  return (
    <nav
      aria-label="Lábléc"
      className={cn(
        "flex flex-wrap items-center gap-x-4 gap-y-2 text-xs",
        className,
      )}
    >
      <InstallItem />
      <PreferredSourceItem />
      <Link href="/valtozasok" className={ITEM}>
        Változások
      </Link>
      <Link href="/adatvedelem" className={ITEM}>
        Adatvédelem
      </Link>
      <a
        href={REPO_URL}
        target="_blank"
        rel="noopener noreferrer"
        className={ITEM}
      >
        GitHub
        <ArrowUpRight className="size-3 opacity-60" aria-hidden />
      </a>
    </nav>
  );
}

//! A NÉV NEM A HIVATKOZÁSOK KÖZÖTT ÁLL. „Készítette: Szalai Bence" nem egy
//! hatodik hivatkozás, hanem az egyetlen ÁLLÍTÁS a láblécben: megmondja, kié a
//! lap, és — ami fontosabb — hogy NEM az iskoláé. Ezért van külön sorban
//! (telefonon) vagy külön oldalon (asztali gépen), és ezért kap ugyanolyan
//! halvány betűt: nem dicsekvés, hanem felelősségvállalás.
export function SiteFooter({ className }: { className?: string }) {
  return (
    <footer
      className={cn(
        "mt-auto border-t border-border/60 print:hidden",
        className,
      )}
    >
      <div
        //* A biztonságos sáv alul a „home indicator" helye — a lábléc utolsó
        //* sora nem csúszhat alá telepített ablakban.
        className="mx-auto flex w-full max-w-5xl flex-col gap-3 px-4 py-6 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] sm:flex-row sm:items-center sm:justify-between sm:px-6"
      >
        <p className="text-xs text-muted-foreground">
          Készítette{" "}
          <span className="font-medium text-muted-strong">{DEVELOPER}</span> —
          nem hivatalos, magánjellegű projekt.
        </p>
        <SiteFooterLinks />
      </div>
    </footer>
  );
}
