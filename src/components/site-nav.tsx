"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { isViewRoute, saveLastView, type ViewRoute } from "@/lib/last-view";
import { cn } from "@/lib/utils";

//* A `/dualis` még nincs kész (WIP), ezért egyelőre nem jelenik meg a
//* navigációban.
//*
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
  //! váltóban szereplő útvonalak számítanak: a `/dualis` (WIP) is kirajzolja
  //! ezt a sávot, de nem nyitóoldalnak való.
  useEffect(() => {
    if (isViewRoute(pathname)) {
      saveLastView(pathname);
    }
  }, [pathname]);

  if (ROUTES.length <= 1) {
    return null;
  }

  return (
    <nav
      aria-label="Nézetek"
      className={cn(
        "flex shrink-0 items-center gap-0.5 rounded-full border border-input p-0.5 dark:bg-input/30",
        className,
      )}
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
  );
}
