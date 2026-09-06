"use client";

import { CalendarDays, Star } from "lucide-react";
import Link from "next/link";
import { PineRidge, SeasonalSky } from "@/components/ma/seasonal-sky";
import { longCountdownLabel } from "@/components/timetable/now";
import { minLabel } from "@/components/timetable/shared";
import { accentStyle } from "@/lib/accent";
import {
  nightsUntil,
  type RestDay,
  type RestSeason,
  weekendVoice,
} from "@/lib/rest-day";
import { cn } from "@/lib/utils";

//* ---------------------------------------------------------------------------
//* A PIHENŐNAP HERO BLOKKJA
//* ---------------------------------------------------------------------------
//! EGY ÜRES DOBOZ VOLT ITT. Iskolai napon a `NowBlock` felel a lap egyetlen
//! kérdésére, duális napon a `DualHero` — hétvégén és szünetben viszont
//! egyikük sem talált mit mondani, és a hero helyén egy 176 képpontos, üres,
//! `aria-hidden` téglalap állt. Az év napjainak közel FELE ilyen: a hétvégék, a
//! négy szünet és az ünnepek együtt. A lap a saját legfontosabb sávjában
//! hallgatott az idő feléről.
//!
//! HÁROM NAPFAJTA, HÁROM VÁLASZ — mert nem ugyanaz a kérdésük:
//!
//!  • HÉTVÉGE. Hetente visszatér, tehát nem ünnep: itt a kérdés MÉRHETŐ —
//!    „mennyi van még belőle". Ugyanaz a műszer felel rá, mint a duális
//!    napon (`DualHero`), csak megfordítva: ott a munkanap telik, itt a
//!    szabadság fogy. A két végpont valódi adat — szombat éjfél, és a
//!    következő tanítási nap ELSŐ órája a diák SAJÁT órarendjéből.
//!
//!  • SZÜNET. Évente ötször van, és a végét a lap NEM LÁTJA (a betöltött hét
//!    öt napján túl nincs adat). Itt tehát nincs mit visszaszámolni, és a
//!    nagy elem kivételesen nem az idő, hanem a nap neve. Ez a lap egyetlen
//!    helye, ahol a mozgás nem állapotot közöl — lásd `seasonal-sky.tsx`.
//!
//!  • SZABADNAP. Tanítási nap, órák nélkül: se nem ünnep, se nem szünet. Itt a
//!    lap nem ünnepel, hanem a KÖVETKEZŐ órára mutat — ez az egyetlen, amit
//!    ilyenkor tudni akarnak.

const block =
  "relative isolate block overflow-hidden rounded-2xl border border-hero-foreground/15 bg-hero-foreground/[0.06] p-5 sm:p-6";

//* Rövid napnév a vonalzó két végén — a hosszú alak nem fér ki telefonon.
const dowFmt = new Intl.DateTimeFormat("hu-HU", { weekday: "short" });

const SKY: Record<RestSeason, string> = {
  christmas: "ma-sky-christmas",
  newyear: "ma-sky-newyear",
  autumn: "ma-sky-autumn",
  spring: "ma-sky-spring",
  summer: "ma-sky-summer",
  none: "",
};

export type RestNext = {
  dateKey: string;
  dayName: string;
  startMin: number;
  /** „Holnap", ha az; egyébként `null` — a nap nevét a `dayName` viszi. */
  relative: string | null;
  //! AMI A VISSZASZÁMLÁLÁS TÚLSÓ VÉGÉN ÁLL. A sáv jobb felirata eddig egy
  //! IDŐPONTOT mondott („H 08:00") — a hétvége tehát egy falig tartott, aminek
  //! nem volt neve. Ez az óra a diák SAJÁT, csoportbontás-feloldott órarendjéből
  //! jön; `null`, ha a bontás eldöntetlen, mert ott két óra állítaná ugyanazt a
  //! percet, és egyiket kimondani találgatás lenne.
  lesson: {
    title: string;
    room: string;
    accentSeed: string;
    /** A diák lapján a tanár, a tanárén az osztály — az adat dönti el. */
    who: { kind: "teacher" | "class"; label: string } | null;
  } | null;
};

export function RestHero({
  rest,
  //! MINDEN IDŐ EZREDMÁSODPERCBEN ÉRKEZIK, KÉSZEN. A napokon átnyúló távolság
  //! nem 24 óra többszöröse (nyári időszámítás), ezért a számítás a lapon
  //! marad, ahol a mai dátum is ott van — ez a blokk csak rajzol.
  nowMs,
  span,
  next,
  className,
}: {
  rest: RestDay;
  nowMs: number | null;
  /** A pihenő két végpontja — csak ha MINDKETTŐ valódi adat. */
  span: { fromMs: number; toMs: number } | null;
  next: RestNext | null;
  className?: string;
}) {
  const sky = SKY[rest.season];
  const winter = rest.season === "christmas" || rest.season === "newyear";

  //! HIDRATÁLÁS ELŐTT NEM TALÁLUNK KI IDŐPONTOT — ugyanaz a szabály, mint a
  //! `NowBlock`-ban. A hétvége kártyája óra nélkül elveszítené a nagy számot és
  //! a vonalzót; ha ez a rövidebb alak megjelenne egy képkockára, a lap fele
  //! megugrana, amikor az órajel megérkezik. Ez a helykitöltő ugyanakkora.
  if (rest.kind === "weekend" && (nowMs === null || span === null)) {
    //* A kész hétvége-kártya lemért magassága: 282 képpont telefonon (375),
    //* 255 a szélesebb hasábon, ahol az ív mondata és a hétfői óra sora is
    //* egyetlen sorba fér. Ha a kártya tartalma változik, ezt ÚJRA KELL MÉRNI.
    return (
      <div
        className={cn(block, "h-[282px] sm:h-[255px]", className)}
        aria-hidden
      />
    );
  }

  //* Csak akkor számolunk vissza, ha van MIRE: a következő óra ideje és a mai
  //* pillanat is a kezünkben van.
  const remainingSec =
    nowMs !== null && span !== null && span.toMs > nowMs
      ? (span.toMs - nowMs) / 1000
      : null;
  //! A HÉTVÉGE SAJÁT EGYSÉGE — lásd `longCountdownLabel`. A `span` csak
  //! hétvégén valódi, tehát ez a formátum sehol máshol nem tud megjelenni.
  const countdown =
    remainingSec !== null ? longCountdownLabel(remainingSec) : null;
  const fraction =
    nowMs !== null && span !== null && span.toMs > span.fromMs
      ? Math.min(
          1,
          Math.max(0, (nowMs - span.fromMs) / (span.toMs - span.fromMs)),
        )
      : null;

  //! A NAGY ELEM VAGY AZ IDŐ, VAGY A NAP NEVE — SOSEM MINDKETTŐ. Ha a szünet
  //! végét nem látjuk, egy visszaszámláló helyére kitalált dátum kerülne; ha
  //! látjuk, akkor viszont a köszöntés melletti számot senki nem olvasná el.
  const counting = countdown !== null && rest.kind === "weekend";

  //! HÁNY ÉJFÉL VAN MÉG. A hétvége nem órákban telik, hanem alvásokban; a
  //! kártya mondata ebből az egyetlen számból dolgozik. Ugyanaz a léptetés,
  //! mint a vonalzó osztásánál — a `setHours(24, …)` a nyári időszámítás
  //! átállását is helyesen viszi át.
  const nights =
    nowMs !== null && span !== null ? nightsUntil(nowMs, span.toMs) : 0;

  //! A CÍMKE CSAK AKKOR ÁLL OTT, HA MOND VALAMIT. A szünetek egy részén a nap
  //! neve maga a nagy sor („Nyári szünet"), és fölé írva ugyanaz vagy annak egy
  //! darabja („Szünet") kétszer mondaná ki ugyanazt, két méretben. A téli
  //! szünet viszont KÉT dolgot mond — mi ez a nap („Téli szünet") és mit
  //! kívánunk rajta („Áldott karácsonyt!") —, ott mindkét sor keresi a helyét.
  const headline = rest.headline.toLowerCase();
  const label = rest.label.toLowerCase();
  const lead = counting
    ? "A hétvégédből"
    : headline.includes(label) || label.includes(headline)
      ? null
      : rest.label;

  return (
    <section className={cn(block, className)} aria-label={rest.label}>
      {sky && (
        <div
          aria-hidden
          className={cn("ma-scene absolute inset-0 -z-10", sky)}
        />
      )}
      {winter && <PineRidge className="ma-scene -z-10" />}
      <SeasonalSky season={rest.season} className="-z-10" />
      {/*//! EGY CSILLAG A FENYŐK FÖLÖTT. Nem a sarokban ülő díszjel: a
          //! fenyősor fölé, a horizont közelébe kerül, mert ott jelenetté áll
          //! össze a hóval és a fákkal. Egy csillag, nem három — a több már
          //! mintázat lenne, és a mintázat dekoráció. */}
      {winter && (
        <Star
          aria-hidden
          className="ma-twinkle ma-scene absolute right-[22%] bottom-12 -z-10 size-4 fill-current text-hero-foreground/50 sm:bottom-14 sm:size-5"
        />
      )}

      {/*//! EGY MONDAT A KÉPERNYŐOLVASÓNAK. A nagy szám, a sáv és a felirat
          //! ugyanannak a két adatnak a széttördelése; felolvasva ez egy
          //! mondat, és a visszaszámláló nem élő régió (másodpercenként
          //! felolvasva használhatatlan lenne). */}
      {counting && countdown && (
        <p className="sr-only">
          {rest.label}: {countdown.value}
          {countdown.unit ? ` ${countdown.unit}` : ""} van hátra belőle.
        </p>
      )}

      {lead && (
        <p className="text-sm font-medium text-hero-foreground/70">{lead}</p>
      )}

      {counting && countdown ? (
        <p className="mt-1.5 flex flex-wrap items-baseline gap-x-3">
          <span className="text-4xl font-bold tracking-tight tabular-nums sm:text-5xl">
            {countdown.value}
          </span>
          {countdown.unit && (
            <span className="text-xl font-semibold text-hero-foreground/75 sm:text-2xl">
              {countdown.unit}
            </span>
          )}
          <span className="text-sm text-hero-foreground/60">van hátra</span>
        </p>
      ) : (
        <h2
          className={cn(
            "text-3xl font-bold tracking-tight text-balance sm:text-4xl",
            lead && "mt-1.5",
          )}
        >
          {rest.headline}
        </h2>
      )}

      {/*//! A MONDAT KÖVETI AZ ÍVET. Eddig szombat reggel és vasárnap este
          //! ugyanaz a négy szó állt itt, egy másodpercenként mozduló szám
          //! alatt. A hétvége szövege mostantól ugyanabból a két végpontból
          //! jön, mint a szám — csak a másik egységben (lásd `weekendVoice`). */}
      <p className="mt-2 max-w-md text-sm text-pretty text-hero-foreground/70">
        {counting && remainingSec !== null
          ? weekendVoice({ nights, remainingSec })
          : rest.note}
      </p>

      {/*//! A KÖVETKEZŐ ÓRA — DE VISSZASZÁMLÁLÁS NÉLKÜL, ha a nagy elem már
          //! megmondta. Ugyanaz az adat kétszer, két alakban: az egyik felesleg. */}
      {/*//! A KÖVETKEZŐ ÓRA — CSAK OTT, AHOL A NAGY ELEM NEM MONDTA MÁR EL.
          //! Hétvégén a visszaszámláló és a vonalzó jobb felirata együtt
          //! ugyanezt viszi; ez a sor ott harmadszor ismételné meg. */}
      {next && !counting && (
        <p className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-hero-foreground/70">
          <CalendarDays
            className="size-4 shrink-0 text-hero-foreground/45"
            aria-hidden
          />
          <span>Újra becsengetnek:</span>
          <span className="font-semibold text-hero-foreground first-letter:uppercase">
            {next.relative ?? next.dayName}
          </span>
          <span className="font-semibold tabular-nums text-hero-foreground">
            {minLabel(next.startMin)}
          </span>
        </p>
      )}

      {/*//! A MŰSZER — CSAK OTT, AHOL MÉR VALAMIT. A hétvége két végpontja
          //! ismert, tehát a sáv leolvasható: a szombat délelőtt és a vasárnap
          //! este nem ugyanaz a hétvége, és a kitöltésből ez látszik. Szünetben
          //! a sáv olyan egészet rajzolna körül, aminek a végét nem ismerjük —
          //! ott inkább nincs. */}
      {fraction !== null && rest.kind === "weekend" && (
        <RestRail fraction={fraction} span={span} next={next} />
      )}

      {/*//! A TÚLSÓ VÉGNEK NEVE VAN. A vonalzó jobb széle egy időpontnál ér
          //! véget, és a visszaszámlálás addig tart — de attól, hogy tudom,
          //! MIKOR csengetnek, még nem tudom, MIVEL kezdem. Ez az egyetlen
          //! adat, amiért egy vasárnap esti diák amúgy is legörgetne; a hero
          //! feladata pedig épp az, hogy ne kelljen.
          //!
          //! NEM ISMÉTLÉS: a nap és az óra fentebb kétszer is elhangzik, a
          //! TANTÁRGY viszont egyszer sem. */}
      {counting && next?.lesson && (
        <p className="mt-4 flex flex-wrap items-baseline gap-x-2 gap-y-1 border-t border-hero-foreground/10 pt-3 text-sm text-hero-foreground/70">
          <span className="text-hero-foreground/55">Ezzel indul a hét:</span>
          {/*//! AZ ÓRA EGY DARABBAN TÖR. A pötty, a név és a terem EGY
              //! becsomagolt elem: külön `flex` testvérekként a „102" a
              //! „Node.js altantárgy" után egy saját sorba esett, a bal
              //! margóhoz tapadva, mintha egy másik adat lenne. A terem ezért
              //! a névvel EGY szövegfolyamban ül — a hosszú tantárgynév (~40
              //! karakter) így is tördelhet, de a terem mindig az utolsó
              //! szava mellett marad. */}
          <span className="flex min-w-0 items-start gap-2">
            {/*//! A PÖTTY A TANTÁRGYÉ, ÉS CSAK AZÉ. A tanár lapján ebben a
                //! sorban az OSZTÁLY a hír („10E · 208") — a tizenkét hue
                //! viszont a tantárgyat azonosítja, és az osztály mellé húzva
                //! ugyanaz a szín két különböző dolgot jelölne. Ugyanez a
                //! szabály áll a `now-block.tsx`-ben; ott a tantárgy külön
                //! sort kap, ide viszont egy sor jut, tehát a pötty marad el. */}
            {next.lesson.who?.kind !== "class" && (
              <span
                className="mt-[0.45em] size-2 shrink-0 rounded-full acc-dot"
                style={accentStyle(next.lesson.accentSeed)}
                aria-hidden
              />
            )}
            <span className="min-w-0 font-semibold text-hero-foreground">
              {next.lesson.who?.kind === "class"
                ? next.lesson.who.label
                : next.lesson.title}
              {next.lesson.room && (
                <span className="ml-2 inline-block rounded-[4px] bg-hero-foreground/12 px-1.5 py-px text-xs font-bold tabular-nums">
                  {next.lesson.room}
                </span>
              )}
            </span>
          </span>
        </p>
      )}

      {rest.kind !== "weekend" && (
        <Link
          href="/orarend"
          className={cn(
            "mt-4 inline-flex touch-target items-center gap-1.5 rounded-full text-sm font-medium text-hero-foreground/80 underline-offset-4",
            "hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          )}
        >
          Heti órarend
        </Link>
      )}
    </section>
  );
}

//! A HÉTVÉGE VONALZÓJA. Ugyanaz a szótár, mint a duális nap műszerén: a
//! kitöltés az eltelt hányad, a bevésett osztás pedig azért kell, hogy a sáv
//! LEOLVASHATÓ legyen — enélkül csak annyit mondana, hogy „valamennyi". Itt az
//! osztás az ÉJFÉL: abból derül ki, hogy szombat van-e még, vagy már vasárnap.
function RestRail({
  fraction,
  span,
  next,
}: {
  fraction: number;
  span: { fromMs: number; toMs: number } | null;
  next: RestNext | null;
}) {
  if (!span) return null;
  const total = span.toMs - span.fromMs;
  //* Az osztás az ÉJFÉL. A végpontokat a feliratok tartják — egy vonal ott csak
  //* ismételné őket —, a köztes napváltások viszont sehol máshol nem látszanak.
  const ticks: number[] = [];
  const cursor = new Date(span.fromMs);
  cursor.setHours(24, 0, 0, 0);
  while (cursor.getTime() < span.toMs && ticks.length < 7) {
    ticks.push((cursor.getTime() - span.fromMs) / total);
    cursor.setHours(24, 0, 0, 0);
  }
  const elapsedH = Math.round((total * fraction) / 3600000);

  return (
    <div className="mt-5" aria-hidden>
      <div className="relative">
        <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-hero-foreground/10">
          <span
            className="tt-rail-fill absolute inset-0 rounded-full bg-primary/55"
            style={{ "--tt-f": fraction } as React.CSSProperties}
          />
          {/*//! AZ OSZTÁS A KITÖLTÉS FÖLÖTT ÁLL. Alatta az eltelt napokat
              //! elnyelné a kék — pont ott, ahol a leolvasás számít. */}
          {ticks.map((t) => (
            <span
              key={t}
              className="absolute inset-y-0 w-px bg-background/45"
              style={{ left: `${t * 100}%` }}
            />
          ))}
        </div>
        {/*//* A vezető él: hol tart a hétvége most. A sávon KÍVÜL ül, mert
            //* túllóg rajta. Piros — a lapon ez az élő „most" szerepe. */}
        <span
          className="tt-rail-head absolute inset-y-0 left-0 w-full"
          style={{ "--tt-p": `${fraction * 100}%` } as React.CSSProperties}
        >
          <span className="absolute inset-y-[-4px] left-0 w-0.5 -translate-x-1/2 rounded-full bg-brand" />
        </span>
      </div>
      <div className="mt-1.5 flex justify-between gap-2 text-[11px] font-medium text-hero-foreground/50">
        <span className="first-letter:uppercase">
          {dowFmt.format(span.fromMs)}
        </span>
        {/*//* A KÖZÉPSŐ FELIRAT AZ ELTELT IDŐT MONDJA, nem a hátralévőt: azt a
            //* nagy szám már kimondta két sorral feljebb. */}
        <span className="min-w-0 truncate font-bold tabular-nums text-hero-foreground/80">
          {elapsedH} órája tart
        </span>
        <span className="tabular-nums first-letter:uppercase">
          {next ? `${dowFmt.format(span.toMs)} ${minLabel(next.startMin)}` : ""}
        </span>
      </div>
    </div>
  );
}
