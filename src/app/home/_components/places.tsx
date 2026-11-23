import { ArrowUpRight, CalendarPlus, Cast, ShieldCheck } from "lucide-react";
import Image, { type StaticImageData } from "next/image";
import Link from "next/link";
import tantargyakShot from "../../../../public/landing/tantargyak.webp";
import teremShot from "../../../../public/landing/terem.webp";
import teremkeresoShot from "../../../../public/landing/teremkereso.webp";

//! ─── NEM CSAK ÓRAREND: AZ ISKOLA TÖBBI KÉRDÉSE ─────────────────────────────
//! A film egyetlen osztály hetét mutatja, a kobalt sáv pedig azt, ami ehhez a
//! héthez hozzájött. Ami eddig SEHOL nem állt a nyitólapon, az a lap többi
//! fele: a helyek (`chrome/places.ts`), amik nem a diák órarendjére, hanem az
//! iskolára kérdeznek rá — melyik terem üres, ki tanítja a tárgyat, ki ügyel.
//! Aki a keresőből „jedlik teremkereső"-re érkezik, annak itt kell kiderülnie,
//! hogy jó helyen jár, és EGY koppintásra ott is kell lennie.
//*
//! A KÉPEK VALÓDI FELVÉTELEK, NEM RAJZOK. A `run-orarend` meghajtójával,
//! telefonos nézetben készültek a valódi lapokról (2026. november). Amit
//! mutatnak, az pontosan az, amit a link mögött a látogató talál — csak a
//! dátum régebbi. Az Ügyelet SZÁNDÉKOSAN nem kapott képet: a lapja a tanárok
//! teljes nevét mutatja, azt pedig nem tesszük ki reklámképre.
//*
//! A KÉPEK TARTALMI KÉPEK, NEM DÍSZEK — ezért van `alt` szövegük, ellentétben
//! a film készülékével (`alt=""`). A keresőnek és a képernyőolvasónak ugyanazt
//! mondják el, amit a szemnek: mi látszik a kijelzőn.

type Shot = {
  href: string;
  title: string;
  body: string;
  image: StaticImageData;
  alt: string;
};

const shots: Shot[] = [
  {
    href: "/teremkereso",
    title: "Teremkereső",
    body: "Melyik terem üres most, és meddig marad az: óránként, géptermekre szűrhetően.",
    image: teremkeresoShot,
    alt: "A Teremkereső telefonon: a mostani óra kijelölve, alatta a szabad termek listája azzal, hogy meddig üresek.",
  },
  {
    href: "/terem",
    title: "Terem órarendje",
    body: "Egy terem heti rácsa: mikor, melyik osztály és melyik tanár van benne. A link megosztható.",
    image: teremShot,
    alt: "A 102-es terem órarendje telefonon: a futó óra a „Most” sávban, alatta a nap órái a teremben.",
  },
  {
    href: "/tantargyak",
    title: "Tantárgyak",
    body: "Tárgyanként: ki tanítja és melyik osztálynak, egy koppintásra a tanár és az osztály órarendjével.",
    image: tantargyakShot,
    alt: "A Tantárgyak lap telefonon: kereső, alatta a tárgyak listája a tanárok és az osztályok számával.",
  },
];

const extras = [
  {
    href: "/ugyelet",
    title: "Ügyelet",
    body: "Ki ügyel most és hol, mikor jön a következő szünet.",
    Icon: ShieldCheck,
  },
  {
    href: "/kivetites",
    title: "Kivetítés",
    body: "A terem kivetítője a telefonodon, ugyanarról a wifiről.",
    Icon: Cast,
  },
  {
    //! A NAPTÁR-FELIRATKOZÁS A HETI RÁCS MENÜJÉBEN ÉL, NEM SAJÁT LAPON — a
    //! link ezért oda visz, ahol a gomb van.
    href: "/orarend",
    title: "Naptár-feliratkozás",
    body: "Az órarended a telefon naptárában, csak azokkal az órákkal, amikre jársz.",
    Icon: CalendarPlus,
  },
];

export default function Places() {
  return (
    <section
      aria-labelledby="helyek-cim"
      className="bg-card px-5 pt-24 md:px-8 md:pt-32"
    >
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between lg:gap-16">
          <h2
            id="helyek-cim"
            className="max-w-[16ch] text-[clamp(2.1rem,5.5vw,4rem)] font-semibold leading-[1.0] tracking-[-0.045em] text-foreground"
          >
            Nem csak órarend.
          </h2>
          <p className="max-w-[40ch] text-base leading-7 text-muted-foreground lg:pb-2 lg:text-right">
            A Jedlik termei, tárgyai és ügyeletei ugyanazon a lapon — osztály
            nélkül is, belépés nélkül is.
          </p>
        </header>

        {/*//* A HÁROM KÉP EGY SORBAN ÁLL `md`-TŐL: egyforma kijelzők, egyforma
            //* kivágással (felülről, mert a lap lényege a tetején van), így a
            //* szem a különbséget látja, nem a méreteket. */}
        <ul className="mt-14 grid gap-12 md:mt-16 md:grid-cols-3 md:gap-8">
          {shots.map((shot) => (
            <li key={shot.href}>
              <Link
                href={shot.href}
                className="group flex flex-col gap-6 rounded-[calc(var(--radius)+0.5rem)] focus-visible:outline-2 focus-visible:outline-offset-8 focus-visible:outline-primary"
              >
                <figure className="relative mx-auto aspect-[39/52] w-full max-w-[22rem] overflow-hidden rounded-[2rem] border border-border bg-[#0b0c10] shadow-[0_30px_60px_-36px_oklch(0_0_0/0.65)] transition-transform duration-300 group-hover:-translate-y-1 motion-reduce:transition-none">
                  <Image
                    src={shot.image}
                    alt={shot.alt}
                    sizes="(min-width: 768px) 22rem, 90vw"
                    placeholder="blur"
                    className="size-full object-cover object-top"
                  />
                </figure>
                <div className="flex flex-col gap-2">
                  <h3 className="flex items-center gap-2 text-xl font-semibold tracking-[-0.02em] text-foreground">
                    {shot.title}
                    <ArrowUpRight
                      aria-hidden
                      className="size-4 opacity-50 transition-opacity group-hover:opacity-100"
                    />
                  </h3>
                  <p className="max-w-[38ch] text-sm leading-6 text-muted-foreground">
                    {shot.body}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>

        <ul className="mt-16 grid gap-4 border-t border-border pt-10 sm:grid-cols-3 sm:gap-8">
          {extras.map(({ href, title, body, Icon }) => (
            <li key={title}>
              <Link
                href={href}
                className="group flex gap-4 rounded-[var(--radius)] py-2 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
              >
                <Icon
                  aria-hidden
                  className="mt-0.5 size-5 shrink-0 text-primary"
                />
                <span className="flex flex-col gap-1">
                  <span className="font-semibold text-foreground underline-offset-4 group-hover:underline">
                    {title}
                  </span>
                  <span className="text-sm leading-6 text-muted-foreground">
                    {body}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
