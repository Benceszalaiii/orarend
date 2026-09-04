"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

//! ─── A KOBALT SÁV: EGY FILMSZALAG, NEM EGY LISTA ───────────────────────────
//! Ez az egyetlen szakasz, ami a márkaszín teljes felületén áll — a film meleg
//! papírja és az alkalmazás éjszakai felülete között ez a világos csík adja a
//! lap ütemét. Korábban álló hasáb volt: három szövegtétel egymás alatt, a lap
//! egyetlen helye, ahol a görgetés NEM csinált semmit. A lap többi része egy
//! mozgó tárgyat mutat; ez a sáv leírt. Most már ez is halad: a három tétel
//! VÍZSZINTESEN fut át a képen, alattuk egy sín méri, hol tartunk benne.
//*
//! ÉS EZÉRT SÖTÉT RAJTA A BETŰ. A kobalt (#1C9CF0) fehérrel 2,97:1-et ad, a
//! szokásos halványított másodlagos sorral 2,36:1-et — egy egész sávnyi
//! olvashatatlan szöveg. Az `--ink-on-primary` ugyanezen az alapon 6,2:1-et
//! hoz (85%-on 5,0-et), vagyis a háttér marad, a szöveg sötétedik. Lásd a
//! token indoklását a `globals.css`-ben.
//*
//! A LAP STÍLUSAI JS-OLDALI MEGJEGYZÉSSEL VANNAK DOKUMENTÁLVA, NEM CSS-SEL. A
//! projekt egyik szerkesztő-horga kiszedi a `<style>` sablonliterálba írt CSS
//! megjegyzéseket, és a törléskor a szomszédos kapcsos zárójelet is elviszi —
//! egy néma, fél szabályt hagyó hiba. A `STRIP_CSS` ezért megjegyzés nélküli,
//! az indoklás pedig itt fent áll, ugyanabban a sorrendben, mint a szabályok.

const highlights = [
  {
    title: "Offline elérés",
    description:
      "A legutóbb betöltött hetet hálózat nélkül is meg tudod nyitni.",
  },
  {
    title: "Szinkronizálás",
    description:
      "A Jedlik AD-fiókoddal a csoportbontásaid és beállításaid több eszközön is követhetnek.",
  },
  {
    title: "Értesítések",
    description:
      "Szólunk, ha tanóra kezdődik vagy az iskola módosít az órarenden.",
  },
];

const LAST = highlights.length - 1;

//! A SZALAG MINDKÉT VÉGÉN MEGÁLL. A görgetési út első és utolsó 12%-a nem
//! mozgat: az első kocka olvasható marad, amikor a sáv kitűzi magát, az utolsó
//! pedig azelőtt áll be, hogy a szakasz elengedné a képernyőt. E nélkül a
//! szélső két tétel csak elsuhanna — pont az, amelyik a legfrissebb.
const LEAD = 0.12;
const TAIL = 0.12;

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

//* Ugyanaz a lágyítás, amit a film kamerája használ (`film.tsx`): a
//* szakaszhatárokon nulla a sebesség, tehát minden kocka MEGÁLL, mielőtt a
//* következő elindul — a szalag kattan, nem csúszik.
const smooth = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);

//! ─── A HAJTÁS ──────────────────────────────────────────────────────────────
//! MIÉRT JAVASCRIPT ÉS NEM `animation-timeline: scroll()`? Ugyanazért, amiért a
//! filmnél: a Firefox máig nem szállítja. A lap már egy rAF-be terelt, passzív
//! görgetésfigyelővel dolgozik — egy MÁSIK technika ugyanazon a görgetésen két
//! különböző hibamódot jelentene. A hajtás itt is annyit tesz, amennyit szabad:
//! egyetlen elemre ír két számot, a rajzolás onnantól a böngészőé.
function useStrip() {
  const rootRef = useRef<HTMLElement>(null);
  //! A KITŰZÖTT VÁLTOZAT CSAK AKKOR KAPCSOL BE, HA A HAJTÁS TÉNYLEG FUT. A
  //! kiszolgáló az álló főkönyvet rajzolja meg; a vízszintes szalagot ez az
  //! osztály nyitja ki, a beépülés után. Script nélkül — vagy ha a hidratálás
  //! elhasal — a szakasz nem egy 250svh magas, mozdulatlan üresség marad,
  //! hanem pontosan az a hasáb, ami eddig volt.
  const [scrubbed, setScrubbed] = useState(false);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    setScrubbed(true);

    let raf = 0;
    let travel = 0;

    const layout = () => {
      travel = root.offsetHeight - window.innerHeight;
    };

    const measure = () => {
      const rect = root.getBoundingClientRect();
      const p = travel <= 0 ? 0 : clamp01(-rect.top / travel);
      const q = clamp01((p - LEAD) / (1 - LEAD - TAIL));
      const seg = q * LAST;
      const i = Math.min(Math.floor(seg), LAST - 1);
      const pos = LAST <= 0 ? 0 : i + smooth(seg - i);
      const s = root.style;
      s.setProperty("--strip-pos", `${pos}`);
      //* A sín feje a MOSTANI állomás pöttyére mutat, nem a szalag szélére:
      //* az állomások az oszlopaik közepén állnak, tehát (pos + 0,5) / n.
      s.setProperty("--strip-head", `${(pos + 0.5) / highlights.length}`);
    };

    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        measure();
      });
    };

    const onResize = () => {
      layout();
      onScroll();
    };

    layout();
    measure();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize, { passive: true });

    //! A SZAKASZ MAGASSÁGA A SZÖVEGTŐL FÜGG. Betűbetöltés vagy sortörés után a
    //! mért út elmozdul; a figyelő ilyenkor újraszámol, hogy a szalag ne egy
    //! elavult elrendezéshez járjon.
    const resizeObserver = new ResizeObserver(onResize);
    resizeObserver.observe(root);

    return () => {
      if (raf) cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return { rootRef, scrubbed };
}

//! ─── A STÍLUSOK, SORRENDBEN ────────────────────────────────────────────────
//!
//! 1. `@property` — a három szám, amit a hajtás ír, TIPUSOSAN van bejelentve.
//!    E nélkül a `calc()`-ok token-behelyettesítésre esnének vissza, és a
//!    kockák kiemelése az első átmenetnél elnémulna.
//!
//! 2. AZ ÁLLÓ VÁLTOZAT AZ ALAP. Minden alapszabály a főkönyv-hasábot írja le:
//!    ez megy ki a kiszolgálóról, ez marad script nélkül, és ez a tartalék, ha
//!    a mozgás nem kívánatos vagy nem fér el. A kitűzött szalagot az
//!    `.is-scrubbed` építi rá — így a visszaesés sosem „elromlott szalag",
//!    hanem egy másik, teljes értékű elrendezés.
//!
//! 2b. A SZALAG SÁVJA KÖTÖTT MAGASSÁGÚ, ÉS A HÁROM SOR KÖZÉPRE IGAZODIK. Az
//!    első változat a sávnak adta a színpad teljes maradékát: a cím a képernyő
//!    tetejére, a sín az aljára került, a kocka szövege pedig 290 képpont üres
//!    kobalt közé — nem levegős volt, hanem lyukas. A sáv most annyi, amennyit
//!    a szöveg megkíván, a tömb pedig együtt áll a képernyő közepén.
//!
//! 3. A KITŰZÖTT SZALAG. A szakasz magas, a színpad rátapad a képernyő
//!    tetejére, és a görgetés a szalagot húzza — nem a lapot. A két
//!    kockaváltásra 75svh jut: elég, hogy mindkettő megálljon, kevés ahhoz,
//!    hogy a sáv elnyelje a lapot.
//!
//! 4a. A KOCKA A SÁV TELJES MAGASSÁGÁT ELFOGLALJA, a szöveg benne
//!    függőlegesen középen áll. Az első változat a kockákat középre igazította:
//!    a bal oldali hajszálvonal — ami a filmkocka ÉLE — így egy 550 képpontos
//!    sávban 160 képpontos pöcök lett, vagyis nem szalagot rajzolt, hanem
//!    három lebegő szövegblokkot. Végigfutó vonal nélkül nincs filmszalag.
//!
//! 4. A SZALAG ABLAKA MASZKOLVA FUT KI. Egy éles vágás úgy nézne ki, mintha a
//!    szalagot elharapná valami; a maszk helyette a kobaltba olvasztja — a
//!    következő kocka ÉRKEZIK, nem levágódik.
//!
//! 5. A KOCKA TÁVOLSÁGA A SAJÁT SORSZÁMÁTÓL FÜGG, NEM EGY OSZTÁLYTÓL. A hajtás
//!    egyetlen számot ír a szakaszra; minden kocka ebből és a saját `--i`-jéből
//!    SZÁMOLJA ki a `--d`-t, vagyis mennyire van középen. Így a kiemelés
//!    görgetés közben is folyamatos — nem egy osztály kapcsolgat oda-vissza egy
//!    küszöb körül.
//!
//! 6. A SZOMSZÉD KOCKA NEM HALVÁNY, HANEM ÉLETLEN. Az első változat pusztán
//!    halványította a kifutó kockákat — csakhogy a szomszéd a széles
//!    elrendezésben MEGÁLL a képen, tehát nem „átmenetben lévő", hanem
//!    nyugvó szöveg, 50%-on nagyjából 2,2:1-en. Egy olvashatónak látszó, de
//!    olvashatatlan szövegoszlop rosszabb, mint a semmi. A mélységélesség ezt
//!    egyértelművé teszi: az életlen kocka nem gyenge kontrasztú betű, hanem
//!    a fókuszon KÍVÜL van, és a szem nem is próbálja elolvasni. A NYUGVÓ
//!    kocka cserébe végig teljes erővel, élesen áll: 6,2:1 a címen, 5,0:1 a
//!    leíráson. Fokozott kontraszt mellett mindkettő kikapcsol.
//!
//! 7. A SÍN AZT MÉRI, AMIT A SZALAG MUTAT. Három egyenlő oszlop, mindegyik
//!    KÖZEPÉN egy pötty — a fej ezért pontosan az állomásra fut be, nem mellé.
//!
//! 8. AHOL A KITŰZÉS NEM SZABAD VAGY NEM FÉR. Csökkentett mozgás mellett a
//!    szalag nem lassabb, hanem NINCS: a görgetéshez kötött vízszintes mozgás
//!    pont az, amit a beállítás kizár. Alacsony képernyőn (fekvő telefon) a
//!    színpad három sora nem fér ki 100svh-ban — ott is a hasáb a helyes
//!    válasz. Mindkét esetben ugyanaz a teljes értékű elrendezés jön vissza.
//!
//! 9. Fokozott kontraszt mellett semmi nem halványodik: a kifutó kockák is
//!    teljes erővel állnak, a takarást a maszk egyedül végzi.
const STRIP_CSS = `
@property --strip-pos { syntax: "<number>"; inherits: true; initial-value: 0; }
@property --strip-head { syntax: "<number>"; inherits: true; initial-value: 0.1667; }
@property --i { syntax: "<number>"; inherits: false; initial-value: 0; }

.latest { padding-block: 6rem; }
@media (min-width: 48rem) {
  .latest { padding-block: 7rem; }
}
.latest-title { font-size: clamp(2.1rem, 5vw, 3.75rem); }
.latest-head { margin-bottom: 3.5rem; }
.latest-track {
  display: flex;
  flex-direction: column;
  max-width: 48rem;
  border-top: 1px solid color-mix(in oklab, var(--ink-on-primary) 40%, transparent);
}
.latest-frame {
  padding-block: 1.75rem;
  border-bottom: 1px solid color-mix(in oklab, var(--ink-on-primary) 25%, transparent);
}
.latest-frame-title { font-size: 1.5rem; line-height: 1.2; }
.latest-endcap { display: none; }
.latest-foot { margin-top: 3rem; }
.latest-rail { display: none; }

.latest.is-scrubbed {
  height: calc(100svh + 150svh);
  padding-block: 0;
}
.latest.is-scrubbed .latest-stage {
  position: sticky;
  top: 0;
  height: 100svh;
  display: flex;
  align-items: stretch;
  padding-block: clamp(4.5rem, 11svh, 8rem) clamp(2.5rem, 6svh, 4rem);
  overflow: hidden;
}
.latest.is-scrubbed .latest-inner {
  display: grid;
  grid-template-rows: auto auto auto;
  align-content: center;
  gap: clamp(2rem, 5svh, 4rem);
}
.latest.is-scrubbed .latest-head { margin-bottom: 0; }
.latest.is-scrubbed .latest-foot { margin-top: 0; }

.latest.is-scrubbed .latest-strip {
  --frame-w: 78vw;
  --frame-gap: 1.75rem;
  --frame-step: calc(var(--frame-w) + var(--frame-gap));
  position: relative;
  height: clamp(13rem, 34svh, 20rem);
  overflow: hidden;
  display: flex;
  align-items: stretch;
  -webkit-mask-image: linear-gradient(90deg, #000 0%, #000 88%, transparent 100%);
  mask-image: linear-gradient(90deg, #000 0%, #000 88%, transparent 100%);
  -webkit-mask-repeat: no-repeat;
  mask-repeat: no-repeat;
}
@media (min-width: 40rem) {
  .latest.is-scrubbed .latest-strip {
    --frame-w: min(38rem, 66vw);
    --frame-gap: clamp(2rem, 4vw, 3.5rem);
  }
}
@media (min-width: 64rem) {
  .latest.is-scrubbed .latest-strip { --frame-w: 44rem; }
}

.latest.is-scrubbed .latest-track {
  display: flex;
  flex-direction: row;
  align-items: stretch;
  gap: var(--frame-gap);
  border-top: 0;
  transform: translate3d(calc(var(--strip-pos) * var(--frame-step) * -1), 0, 0);
  will-change: transform;
}
.latest.is-scrubbed .latest-frame {
  --d: min(1, max(calc(var(--strip-pos) - var(--i)), calc(var(--i) - var(--strip-pos))));
  display: flex;
  flex-direction: column;
  justify-content: center;
  flex: 0 0 var(--frame-w);
  width: var(--frame-w);
  padding: clamp(0.25rem, 2svh, 1rem) 0 clamp(0.25rem, 2svh, 1rem) clamp(1.5rem, 3vw, 2.25rem);
  border-bottom: 0;
  border-left: 1px solid color-mix(in oklab, var(--ink-on-primary) calc(22% + 30% * (1 - var(--d))), transparent);
  opacity: calc(1 - 0.35 * var(--d));
  transform: translate3d(0, calc(var(--d) * 0.75rem), 0);
}
@media (min-width: 40rem) {
  .latest.is-scrubbed .latest-frame {
    filter: blur(calc(var(--d) * 2.5px));
  }
}
.latest-frame-body { text-wrap: pretty; }
.latest-title, .latest-frame-title { text-wrap: balance; }
.latest.is-scrubbed .latest-frame-title {
  font-size: clamp(1.5rem, 3.4vw, 2.75rem);
  line-height: 1.05;
}
.latest.is-scrubbed .latest-endcap {
  display: block;
  flex: 0 0 4rem;
  border-left: 1px solid color-mix(in oklab, var(--ink-on-primary) 22%, transparent);
}

.latest.is-scrubbed .latest-rail {
  position: relative;
  display: grid;
  grid-template-columns: repeat(${highlights.length}, 1fr);
  flex: 1 1 auto;
  padding-top: 0.5rem;
}
.latest-rail-line,
.latest-rail-fill {
  position: absolute;
  top: 0.5rem;
  left: 0;
  height: 1px;
}
.latest-rail-line {
  right: 0;
  background: color-mix(in oklab, var(--ink-on-primary) 28%, transparent);
}
.latest-rail-fill {
  width: calc(var(--strip-head) * 100%);
  background: var(--ink-on-primary);
}
.latest-station {
  --d: min(1, max(calc(var(--strip-pos) - var(--i)), calc(var(--i) - var(--strip-pos))));
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
}
.latest-dot {
  width: 0.5rem;
  height: 0.5rem;
  margin-top: 0.25rem;
  border-radius: 999px;
  background: var(--ink-on-primary);
  opacity: calc(0.32 + 0.68 * (1 - var(--d)));
  transform: scale(calc(1 + 0.5 * (1 - var(--d))));
}
.latest-station-label {
  font-size: 0.8125rem;
  line-height: 1.2;
  text-align: center;
  color: var(--ink-on-primary);
  opacity: calc(0.62 + 0.38 * (1 - var(--d)));
  font-weight: calc(500 + 100 * (1 - var(--d)));
}

@media (prefers-reduced-motion: reduce), (max-height: 34rem) {
  .latest.is-scrubbed {
    height: auto;
    padding-block: 6rem;
  }
  .latest.is-scrubbed .latest-stage {
    position: static;
    height: auto;
    display: block;
    padding-block: 0;
    overflow: visible;
  }
  .latest.is-scrubbed .latest-inner { display: flex; gap: 0; }
  .latest.is-scrubbed .latest-head { margin-bottom: 3.5rem; }
  .latest.is-scrubbed .latest-foot { margin-top: 3rem; }
  .latest.is-scrubbed .latest-strip {
    height: auto;
    overflow: visible;
    display: block;
    -webkit-mask-image: none;
    mask-image: none;
  }
  .latest.is-scrubbed .latest-track {
    flex-direction: column;
    gap: 0;
    max-width: 48rem;
    transform: none;
    border-top: 1px solid color-mix(in oklab, var(--ink-on-primary) 40%, transparent);
  }
  .latest.is-scrubbed .latest-frame {
    display: block;
    width: auto;
    flex: initial;
    padding: 1.75rem 0;
    border-left: 0;
    border-bottom: 1px solid color-mix(in oklab, var(--ink-on-primary) 25%, transparent);
    opacity: 1;
    transform: none;
    filter: none;
  }
  .latest.is-scrubbed .latest-frame-title { font-size: 1.5rem; line-height: 1.2; }
  .latest.is-scrubbed .latest-endcap { display: none; }
  .latest.is-scrubbed .latest-rail { display: none; }
}

@media (prefers-contrast: more) {
  .latest.is-scrubbed .latest-frame { opacity: 1; filter: none; }
  .latest-station-label { opacity: 1; }
  .latest-dot { opacity: 1; }
}
`;

export default function Latest() {
  const { rootRef, scrubbed } = useStrip();

  return (
    <section
      ref={rootRef}
      className={`latest bg-primary text-ink-on-primary${scrubbed ? " is-scrubbed" : ""}`}
    >
      <div className="latest-stage px-5 md:px-8">
        <div className="latest-inner mx-auto flex w-full max-w-6xl flex-col">
          <header className="latest-head flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between lg:gap-16">
            <h2 className="latest-title max-w-[12ch] font-display font-semibold leading-[1.0] tracking-[-0.045em]">
              Frissen a sütőből
            </h2>
            <p className="max-w-[32ch] text-base leading-7 text-ink-on-primary/85 lg:pb-2 lg:text-right">
              A legújabb funkciók.
            </p>
          </header>

          <div className="latest-strip">
            <ol className="latest-track">
              {highlights.map((item, i) => (
                <li
                  key={item.title}
                  className="latest-frame"
                  style={{ "--i": i } as React.CSSProperties}
                >
                  <h3 className="latest-frame-title font-display font-semibold tracking-[-0.035em]">
                    {item.title}
                  </h3>
                  <p className="latest-frame-body mt-5 max-w-[42ch] text-[15px] leading-7 text-ink-on-primary/85 sm:text-base">
                    {item.description}
                  </p>
                </li>
              ))}
              {/*//* A szalag vége: nem üres kobalt, hanem lezárt él — a
                  //* hajszálvonal itt fejeződik be, ugyanabban a mértanban,
                  //* amit a sín használ. */}
              <li className="latest-endcap" aria-hidden />
            </ol>
          </div>

          {/*//! A SÍN NEM VERZIÓSZÁMOT ÉS NEM DÁTUMOT MUTAT — olyat a projekt nem
              //! tart nyilván, kitalálni pedig nem szabad. Amit tud: hány tétel
              //! van, hányadiknál tartasz, és hogy a sor a „Minden változás"
              //! linkben ér véget. A sín feje ezért a linkig fut, és ott áll
              //! meg. */}
          <div className="latest-foot flex flex-col gap-6 sm:flex-row sm:items-end sm:gap-10">
            <div className="latest-rail" aria-hidden>
              <span className="latest-rail-line" />
              <span className="latest-rail-fill" />
              {highlights.map((item, i) => (
                <span
                  key={item.title}
                  className="latest-station"
                  style={{ "--i": i } as React.CSSProperties}
                >
                  <span className="latest-dot" />
                  <span className="latest-station-label">{item.title}</span>
                </span>
              ))}
            </div>

            <Link
              href="/valtozasok"
              className="latest-link inline-flex shrink-0 self-start rounded-full border border-ink-on-primary/45 px-5 py-3 text-sm font-semibold transition-colors hover:bg-ink-on-primary hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ink-on-primary motion-reduce:transition-none sm:self-auto"
            >
              Minden változás
            </Link>
          </div>
        </div>
      </div>

      <style>{STRIP_CSS}</style>
    </section>
  );
}
