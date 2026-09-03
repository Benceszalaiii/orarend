"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { AccountMenu } from "@/components/account-menu";
import { isViewRoute, saveLastView, type ViewRoute } from "@/lib/last-view";
import { cn } from "@/lib/utils";

//* A `/adatvedelem` szándékosan NINCS benne: az nem egy nézet ugyanarra az
//* adatra, hanem egy lábjegyzet — a helye a lap alján van, nem a váltóban.

//! A KÉT NÉZET UGYANARRA AZ ADATRA NÉZ, CSAK MÁS KÉRDÉSRE VÁLASZOL. A „Hét" a
//! teljes rács: a diák maga olvassa ki belőle, ami kell. A „Progresszív mód" a
//! napi menet: mi megy most, mennyi van hátra, hova mész utána. Egy váltó, két
//! címke — a lap nem dönti el a diák helyett, melyikre van szüksége.
//*
//* A `short` a szűk eszköztáré: a /orarend fejlécében a hetelő és az
//* osztályválasztó mellett a teljes név külön sorba törné a váltót. A `label`
//* attól marad meg, hogy a nézet NEVE „Progresszív mód" — a rövidítés csak a
//* hely szűkössége, nem átkeresztelés; a `title` és az olvasónév teljes.
//! A VÁLTÓ HELYE A LAPÉ, NEM A LAPON LÉVŐ TARTALOMÉ. Ez az egyetlen vezérlő,
//! amit egymás után kétszer nyomnak meg: egyszer, hogy elmenj innen, egyszer,
//! hogy visszagyere. Ha a két lapon máshol van, a második koppintás a semmibe
//! megy. Mérve, 375 px-en a javítás előtt: `/ma` 27 px-nél, `/orarend` 126
//! px-nél — 99 px, a váltó saját magasságának több mint háromszorosa; 1280
//! px-en pedig 141 px-nyi vízszintes ugrás, mert az egyik lap sávja
//! `max-w-5xl`, a másiké teljes szélességű volt.
//*
//* Ezért a fejlécsáv MÉRTANA itt áll, egy helyen, és mindkét lap innen veszi:
//* ugyanaz a legnagyobb szélesség, ugyanaz a margó, ugyanaz a függőleges
//* térköz. A sáv az ABLAKÉ — a tartalom lehet keskenyebb hasáb alatta (a
//* `/ma` az is), de a sáv két vége az ablak két széléhez tapad, mert a
//* jobbra tapadás az egyetlen, ami független attól, mi van a sáv bal
//* oldalán.
export const SITE_BAR_MAX = "max-w-[120rem]";
export const SITE_BAR_METRICS = "gap-x-2 px-3 py-2 sm:gap-x-3 sm:px-4";
//* A sáv jobb oldali csoportja — a lapváltót tartó vezérlők. A `min-h-9` a
//* váltó függőleges közepét rögzíti: enélkül a csoport magassága a benne álló
//* legmagasabb vezérlőtől függne (a két lap osztályválasztója nem azonos), és a
//* váltó néhány pixellel elcsúszna asztali gépen.
export const SITE_BAR_CLUSTER =
  "flex min-h-9 items-center justify-end gap-1.5 sm:gap-2";

const ROUTES: readonly {
  href: ViewRoute;
  label: string;
  short: string;
  title: string;
}[] = [
  {
    href: "/orarend",
    label: "Hét",
    short: "Hét",
    title: "A teljes heti órarend",
  },
  {
    href: "/ma",
    label: "Progresszív mód",
    short: "Progresszív",
    title: "Progresszív mód — a mai nap egy képernyőn",
  },
];

export function SiteNav({ className }: { className?: string }) {
  const pathname = usePathname();

  //! A VÁLTÓ AZ EGYETLEN HELY, AHOL MINDEN NÉZET ÁTMEGY — ezért itt jegyezzük
  //! meg, melyiket nézte utoljára a diák, hogy a `/` oda vigyen vissza. Csak a
  //! váltóban szereplő útvonalak számítanak: ezt a sávot más lap is
  //! kirajzolhatja anélkül, hogy nyitóoldalnak való lenne.
  useEffect(() => {
    if (isViewRoute(pathname)) {
      saveLastView(pathname);
    }
  }, [pathname]);

  return (
    //! A VÁLTÓ SAJÁT, RÖGZÍTETT MAGASSÁGÚ HELYET KAP. A pirula maga 30 px; a
    //! sávban körülötte álló vezérlők 36 px-esek (durva mutatóeszközön 44 —
    //! lásd `.touch-target`). Ha a váltó közvetlenül a csoport gyereke lenne,
    //! a függőleges közepét a MELLETTE álló legmagasabb elem döntené el, és
    //! ott, ahol a többi vezérlő két sorba tördel (a `/dualis` tervválasztója
    //! ezt teszi telefonon), a váltó lecsúszna a második sor mellé. A saját
    //! doboz ehelyett mindig az ELSŐ sor magasságát veszi fel, és a `self-start`
    //! a csoport tetejéhez köti — így a váltó minden lapon és minden méretben
    //! ugyanabban a magasságban ül.
    <div
      className={cn(
        "flex h-9 shrink-0 touch-target items-center gap-1.5 self-start sm:gap-2",
        className,
      )}
    >
      {/*//! A FIÓK A VÁLTÓ MELLETT ÜL, NEM KÜLÖN. Ez az egyetlen hely, amit
          //! MINDHÁROM fejlécsáv (az `/orarend` rácsáé, a `/ma`-é és a
          //! designlapé) egyformán kirajzol — ha a gomb a lapokon külön-külön
          //! kerülne be, ugyanaz a néhány pixelnyi elcsúszás állna elő, amit a
          //! váltónál egyszer már megmértünk és kijavítottunk (lásd fentebb). */}
      {ROUTES.length > 1 ? (
        <nav
          aria-label="Nézetek"
          className="flex shrink-0 items-center gap-0.5 rounded-full border border-input p-0.5 dark:bg-input/30"
        >
          {ROUTES.map((route) => {
            const active = pathname === route.href;
            return (
              <Link
                key={route.href}
                href={route.href}
                title={route.title}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none",
                  active
                    ? "bg-foreground text-background"
                    : "text-muted-strong hover:bg-muted hover:text-foreground",
                )}
              >
                {/*//! A CÍMKE RÖVIDÜL, A NÉV NEM. Képernyőolvasónak és a
                //! `title`-nek mindig a teljes név jár — a `sm` alatt csak a
                //! látható szöveg kurtul. */}
                <span className="sr-only">{route.label}</span>
                <span aria-hidden className="sm:hidden">
                  {route.short}
                </span>
                <span aria-hidden className="hidden sm:inline">
                  {route.label}
                </span>
              </Link>
            );
          })}
        </nav>
      ) : null}
      <AccountMenu />
    </div>
  );
}
