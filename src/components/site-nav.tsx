"use client";

import { House } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { AccountMenu } from "@/components/account-menu";
import { useSession } from "@/lib/auth-client";
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

type NavRoute = {
  href: ViewRoute;
  label: string;
  short: string;
  title: string;
};

const ROUTES: readonly NavRoute[] = [
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

//! ─── A TANÁRI NÉZET NEM MINDENKINEK NÉZET ──────────────────────────────────
//! A `/tanari` ugyanaz a rács, más alannyal: a tanárnak azt mondja meg, hova
//! kell mennie. A diáknak viszont SEMMIT nem mond — egy állandó harmadik
//! pirula neki csak egy zsákutca, amit egyszer megnyom, és soha többé.
//!
//! Ezért a váltó ezt a pirulát CSAK ott mutatja, ahol tényleg nézet:
//!   • aki iskolai belépéssel jött, és az iskola rendszere tanárnak mondja;
//!   • aki éppen a `/tanari` lapon áll (különben a váltó eltakarná előle,
//!     hogy hol van, és nem lenne mivel visszalépni).
//* A tanári lap ettől függetlenül közvetlen címmel is elérhető: a pirula
//* megjelenése kényelem, nem jogosultság — órarendet amúgy is bárki megnéz.
const TEACHER_ROUTE: NavRoute = {
  href: "/tanari",
  label: "Tanári",
  short: "Tanári",
  title: "Tanári órarend — kinek hol kell lennie",
};

//! ─── A VÁLTÓ KÉT FELÜLETEN ÉL ──────────────────────────────────────────────
//! `bar`: a váltó egy MÁR SÖTÉT eszköztárban ül (`/orarend`, `/ma`, `/design`).
//! Ott a lap tokenjei érvényesek, és a pirula átlátszó marad — ez a
//! változatlan, eredeti viselkedés.
//*
//! `floating`: a váltó egy TARTALOM FÖLÖTT lebeg, aminek a színét nem ő
//! választja. A nyitólapon ez konkrét hiba volt: a lap `colorScheme: "dark"`-kal
//! fut, tehát a váltó `--foreground`-ja majdnem fehér és a `--input` kerete
//! sötétkék — a nyitókép `#F3EBDD` meleg papírján a „Hét / Progresszív mód"
//! pirula és a „Belépés" gomb gyakorlatilag LÁTHATATLAN volt, és csak akkor
//! bukkant elő, amikor a lap kobaltra váltott.
//*
//! A JAVÍTÁS NEM A GOMBOKBAN VAN. A váltó, a fióklista és minden benne álló
//! vezérlő ugyanabból a néhány tokenből él; ezért a lebegő változat SAJÁT,
//! zárt színvilágot kap (`.nav-glass`, lásd `globals.css`), és a vezérlők
//! kódja egy sorral sem változik. Így akkor is helyes marad, ha a lap alatta
//! papírról kobaltra, kobaltról éjszakai felületre vált.
export function SiteNav({
  className,
  surface = "bar",
}: {
  className?: string;
  surface?: "bar" | "floating";
}) {
  const pathname = usePathname();
  const floating = surface === "floating";
  //* A munkamenetet a sáv fiókgombja (`AccountMenu`) úgyis lekéri — ez ugyanaz
  //* a megosztott állapot, nem egy második kérés.
  const { data: session } = useSession();
  const showTeacher =
    pathname === TEACHER_ROUTE.href || session?.user.isTeacher === true;
  const routes = showTeacher ? [...ROUTES, TEACHER_ROUTE] : ROUTES;

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
        "flex h-9 shrink-0 touch-target items-center self-start",
        floating
          ? //! A LEBEGŐ VÁLTÓ EGYETLEN TÁBLA. A homály itt nem díszítés: a
            //! sáv alatt görgő rács végig mozgásban van, és csak a homályos,
            //! majdnem tömör alap tartja olvashatónak a feliratokat minden
            //! képkockán.
            "nav-glass gap-1 rounded-full border border-white/14 bg-[oklch(0.17_0.014_250/0.82)] p-1 shadow-[0_10px_30px_-14px_oklch(0_0_0/0.8)] backdrop-blur-xl"
          : "gap-1.5 sm:gap-2",
        className,
      )}
    >
      {/*//! A NYITÓLAP A SÁV BAL SZÉLÉN. Nem nézet, hanem KIJÁRAT a nézetek
          //! közül — ezért nem kerülhet a váltó pirulái közé: ott egy harmadik
          //! címkének látszana, amit a diák a „Hét" és a „Progresszív" testvérének
          //! olvas. Balra, a váltó ELŐTT áll, ahol a webes megszokás szerint a
          //! „vissza a kezdetre" lakik, és ikon, nem felirat — a sáv szűk, és
          //! ez az egyetlen vezérlő, aminek a jelentése ikonból is egyértelmű. */}
      <Link
        href="/home"
        title="Nyitólap"
        aria-current={pathname === "/home" ? "page" : undefined}
        className={cn(
          "flex size-8 shrink-0 touch-target items-center justify-center rounded-full transition-colors",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none",
          pathname === "/home"
            ? "bg-foreground text-background"
            : "text-muted-strong hover:bg-muted hover:text-foreground",
        )}
      >
        <span className="sr-only">Nyitólap</span>
        <House aria-hidden className="size-4" />
      </Link>
      {/*//! A FIÓK A VÁLTÓ MELLETT ÜL, NEM KÜLÖN. Ez az egyetlen hely, amit
          //! MINDHÁROM fejlécsáv (az `/orarend` rácsáé, a `/ma`-é és a
          //! designlapé) egyformán kirajzol — ha a gomb a lapokon külön-külön
          //! kerülne be, ugyanaz a néhány pixelnyi elcsúszás állna elő, amit a
          //! váltónál egyszer már megmértünk és kijavítottunk (lásd fentebb). */}
      {routes.length > 1 ? (
        <nav
          aria-label="Nézetek"
          className={cn(
            "flex shrink-0 items-center gap-0.5 rounded-full",
            //* Lebegve a KERET a táblát illeti, nem a benne álló pirulát:
            //* két egymásba rajzolt kerek keret egymás gyűrűjének látszana.
            floating ? "p-0" : "border border-input p-0.5 dark:bg-input/30",
          )}
        >
          {routes.map((route) => {
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
