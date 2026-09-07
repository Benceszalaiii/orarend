"use client";

import { RotateCcw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  CELL_RADIUS,
  DAY_NAMES,
  DAY_SHORT,
  minLabel,
} from "@/components/timetable/shared";
import { accentStyle } from "@/lib/accent";
import {
  addBody,
  advanceWorld,
  createWorld,
  type PhysicsWorld,
  resizeWorld,
  seededRandom,
  worldSettled,
} from "@/lib/card-physics";
import { cn } from "@/lib/utils";
import {
  DAY_SPAN,
  DAY_START,
  GLYPH_CARDS,
  GLYPH_LANES,
  PERIODS,
  WEEK_CARDS,
} from "./week-scene";

//* ---------------------------------------------------------------------------
//* A SZÉTESŐ HÉT
//* ---------------------------------------------------------------------------
//! A LAP ELŐSZÖR EGY ÓRARENDET MUTAT, ÉS EZ SZÁNDÉKOS. Aki 404-re fut, egy
//! pillanatra a megszokott képet látja: az idősávot, a csoportbontásokat, a
//! tantárgyszíneket. Aztán az egész kiszakad a helyéről, lezuhan, kihullik a
//! kép aljából — és ami a kiürült rácsban marad, az a 404. Ez a MONDAT képben:
//! „ez az óra nincs az órarendben".
//!
//! EGY MOZDULAT, NEM KETTŐ. A szám nem a hullás UTÁN kezd emelkedni, hanem
//! közben (`GLYPH_START` a hullás közepén jár): a kettő egyetlen eseménnyé
//! olvad, nem két egymás után lejátszott effektté.
//!
//! JS NÉLKÜL IS ÉP A LAP. A kártyák helye SZÁZALÉKBAN áll a jelölésben, tehát a
//! szerver által küldött HTML egy kész, arányos heti rácsot mutat; a fizika
//! csak akkor veszi át, ha a böngésző tényleg elindította. A hibaüzenet és a
//! két visszavezető hivatkozás fölötte, szövegben áll — a rács a jelenet, nem
//! az információ.

/** Ennyi ms után indul a szám megjelenése — még a hullás alatt. */
const GLYPH_START = 620;
/** Hasábonkénti késleltetés a szám megjelenésében (ms). */
const GLYPH_STEP = 40;
/** A visszarakás úszásának hossza másodpercben. */
const RETURN_SEC = 0.5;

const REDUCED = "(prefers-reduced-motion: reduce)";

//* A szám hasábjai és a hét sávjai ugyanabból a képletből kapják a helyüket:
//* a naposzlop `1/5`, azon belül a sáv `1/lanes`.
const laneLeft = (day: number, lane: number, lanes: number) =>
  `${((day + lane / lanes) / 5) * 100}%`;
const laneWidth = (lanes: number) => `calc(${100 / (5 * lanes)}% - 3px)`;
const rowTop = (startMin: number) =>
  `calc(${((startMin - DAY_START) / DAY_SPAN) * 100}% + 1.5px)`;
const rowHeight = (startMin: number, endMin: number) =>
  `calc(${((endMin - startMin) / DAY_SPAN) * 100}% - 3px)`;

export function CollapsingWeek() {
  const layerRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef(new Map<string, HTMLDivElement>());
  const worldRef = useRef<PhysicsWorld | null>(null);
  const originsRef = useRef(new Map<string, { x: number; y: number }>());
  const rndRef = useRef(seededRandom(0x404));
  const frameRef = useRef(0);
  const lastRef = useRef(0);
  const phaseRef = useRef<"falling" | "returning">("falling");
  const returnRef = useRef(0);
  const glyphTimerRef = useRef(0);

  //* A szám megjelenése és a gomb megjelenése állapotváltás, nem képkockánkénti
  //* adat — ezért React-állapot, nem `ref`.
  const [glyphUp, setGlyphUp] = useState(false);
  const [fallen, setFallen] = useState(false);
  //! A CSÖKKENTETT MOZGÁS ÁGA A JELÖLÉSBEN IS LÁTSZIK, ezért állapot: ott nem
  //! fizika van, hanem egy halkabb, de ugyanazt mondó átmenet (lásd lentebb).
  const [reduced, setReduced] = useState(false);

  const paint = useCallback(() => {
    const world = worldRef.current;
    if (!world) return;
    for (const body of world.bodies) {
      const el = cardRefs.current.get(body.id);
      if (!el) continue;
      if (body.gone) {
        //* Ami kiesett, azt a böngésző se rajzolja többé.
        if (el.style.visibility !== "hidden") {
          el.style.visibility = "hidden";
          el.style.willChange = "auto";
        }
        continue;
      }
      if (el.style.visibility === "hidden") {
        el.style.visibility = "";
        el.style.willChange = "transform";
      }
      el.style.transform = `translate3d(${body.x - body.hw}px, ${
        body.y - body.hh
      }px, 0) rotate(${body.a}rad)`;
    }
  }, []);

  //! ─── A MÉRÉS ÉS AZ ÁTVÉTEL ────────────────────────────────────────────────
  //! A kártyák a CSS-től kapják a helyüket (százalék), a fizika viszont
  //! képpontban dolgozik. Ez a lépés ELŐSZÖR mindet leméri, és CSAK UTÁNA ír:
  //! ha mérés és írás váltakozna, minden kártya külön újratördelést kérne a
  //! böngészőtől.
  const capture = useCallback(() => {
    const layer = layerRef.current;
    if (!layer) return null;
    const box = layer.getBoundingClientRect();
    //! NULLA SZÉLESSÉGGEL NEM MÉRÜNK. Egy még el nem rendezett vagy elrejtett
    //! lapon (háttérfül, `content-visibility`) a doboz üres — az ilyenkor
    //! rögzített „jelenet" minden kártyát egy pontba tenne. Ilyenkor nem
    //! történik semmi: a `ResizeObserver` úgyis szól, amint van valódi méret.
    if (box.width < 8 || box.height < 8) return null;
    const measured: {
      id: string;
      el: HTMLDivElement;
      x: number;
      y: number;
      hw: number;
      hh: number;
    }[] = [];
    for (const card of WEEK_CARDS) {
      const el = cardRefs.current.get(card.id);
      if (!el) continue;
      const r = el.getBoundingClientRect();
      measured.push({
        id: card.id,
        el,
        x: r.left - box.left + r.width / 2,
        y: r.top - box.top + r.height / 2,
        hw: r.width / 2,
        hh: r.height / 2,
      });
    }
    if (measured.length === 0) return null;

    const world = createWorld(box.width, box.height);
    originsRef.current.clear();
    for (const m of measured) {
      //! A KISZAKADÁS BALRÓL JOBBRA SÖPÖR VÉGIG A HÉTEN. Nem egyszerre esik
      //! minden — az esemény iránya az, ami olvashatóvá teszi —, a véletlen
      //! szórás pedig megtöri a sort, hogy ne gépiesnek lássék.
      const sweep = (m.x / box.width) * 0.42;
      addBody(world, {
        id: m.id,
        x: m.x,
        y: m.y,
        hw: m.hw,
        hh: m.hh,
        delay: 0.14 + sweep + rndRef.current() * 0.12,
      });
      originsRef.current.set(m.id, { x: m.x, y: m.y });
      //* Az elem mostantól kizárólag `transform`-mal mozog: a százalékos hely
      //* átadja a helyét a lemért képpontnak.
      m.el.style.left = "0px";
      m.el.style.top = "0px";
      m.el.style.width = `${m.hw * 2}px`;
      m.el.style.height = `${m.hh * 2}px`;
      m.el.style.willChange = "transform";
    }
    worldRef.current = world;
    paint();
    return world;
  }, [paint]);

  const loop = useCallback(
    (now: number) => {
      const world = worldRef.current;
      if (!world) return;
      const dt = Math.min((now - lastRef.current) / 1000, 0.05);
      lastRef.current = now;

      if (phaseRef.current === "returning") {
        //! A VISSZARAKÁS NEM FIZIKA. Fölfelé zuhanni nem lehet: a kártyák egy
        //! kifutó görbén ÚSZNAK vissza a helyükre, és csak ott veszi át őket
        //! újra a gravitáció. Ugyanaz az exponenciális lassulás, amivel a rács
        //! a hetek között vált.
        returnRef.current = Math.min(returnRef.current + dt / RETURN_SEC, 1);
        const k = 1 - (1 - returnRef.current) ** 3;
        for (const body of world.bodies) {
          const origin = originsRef.current.get(body.id);
          if (!origin) continue;
          body.gone = false;
          body.x += (origin.x - body.x) * k * 0.3;
          body.y += (origin.y - body.y) * k * 0.3;
          body.a += (0 - body.a) * k * 0.3;
        }
        paint();
        if (returnRef.current >= 1) {
          for (const body of world.bodies) {
            const origin = originsRef.current.get(body.id);
            if (origin) {
              body.x = origin.x;
              body.y = origin.y;
            }
            body.a = 0;
            body.va = 0;
            body.vx = 0;
            body.vy = 0;
            body.released = false;
          }
          world.t = 0;
          world.acc = 0;
          phaseRef.current = "falling";
          paint();
        }
        frameRef.current = requestAnimationFrame(loop);
        return;
      }

      advanceWorld(world, dt, rndRef.current);
      paint();

      //! A HUROK MEGÁLL, AMINT AZ UTOLSÓ KÁRTYA KIÉRT A KÉPBŐL. Egy hibalap nem
      //! tartja ébren a processzort: nincs több képkocka, amíg a látogató nem
      //! kéri újra a jelenetet.
      if (worldSettled(world)) {
        frameRef.current = 0;
        setFallen(true);
        return;
      }
      frameRef.current = requestAnimationFrame(loop);
    },
    [paint],
  );

  const start = useCallback(() => {
    if (frameRef.current) return;
    lastRef.current = performance.now();
    frameRef.current = requestAnimationFrame(loop);
  }, [loop]);

  //! ─── AZ INDÍTÁS A MÉRETFIGYELŐN LÓG ───────────────────────────────────────
  //! NEM A CSATOLÁSKOR INDULUNK, HANEM AMIKOR VAN MIT MÉRNI. A `ResizeObserver`
  //! a rákötéskor is szól egyszer, tehát ez a szokásos esetben ugyanaz, mintha
  //! egy `useLayoutEffect` indítaná — viszont attól az esettől is megvéd, amikor
  //! a lap nulla szélességgel rendereldik (háttérfül, még nem látható panel,
  //! `display:none` alatti elrendezés). Ott a mérés hazudna, itt pedig
  //! egyszerűen nem történik semmi, amíg a doboznak nincs valódi mérete.
  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    const reduce = window.matchMedia(REDUCED).matches;
    setReduced(reduce);

    let width = 0;
    let timer = 0;

    const begin = () => {
      const world = capture();
      if (!world) return;
      start();
      glyphTimerRef.current = window.setTimeout(
        () => setGlyphUp(true),
        GLYPH_START,
      );
    };

    if (reduce) {
      //! CSÖKKENTETT MOZGÁS: UGYANAZ A MONDAT, ZUHANÁS NÉLKÜL. Nem hagyjuk el a
      //! jelenetet, és nem is mutatunk üres rácsot: a hét ugyanabban a balról
      //! jobbra tartó sorrendben HALVÁNYUL EL, ahogy egyébként kihullana, és a
      //! szám ugyanúgy a helyébe lép. Áttűnés van, mozgás nincs — ennyit kér a
      //! beállítás, és pontosan ennyit adunk.
      const enter = window.setTimeout(() => {
        setGlyphUp(true);
        setFallen(true);
      }, 260);
      return () => window.clearTimeout(enter);
    }

    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (!box || box.width < 8 || box.height < 8) return;
      const world = worldRef.current;
      if (!world) {
        width = box.width;
        begin();
        return;
      }
      //! A MAGASSÁG VÁLTOZÁSA NEM ÚJ JELENET. Telefonon a böngésző címsora
      //! ki-be csúszik, és ettől a doboz folyamatosan magasabb-alacsonyabb —
      //! ott elég a falakat és a kiesési határt odébb tenni. A SZÉLESSÉG érdemi
      //! változása (forgatás, ablakméret) viszont más rácsot jelent: ott a
      //! kártyák mérete is más, tehát újra kell mérni.
      if (Math.abs(box.width - width) < 48) {
        resizeWorld(world, box.width, box.height);
        return;
      }
      width = box.width;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        window.clearTimeout(glyphTimerRef.current);
        //* A kártyákat visszaadjuk a CSS-nek, hogy a százalékos hely újra
        //* megszólaljon, aztán a következő képkockán újramérünk.
        for (const el of cardRefs.current.values()) {
          el.style.cssText = "";
        }
        worldRef.current = null;
        setGlyphUp(false);
        setFallen(false);
        phaseRef.current = "falling";
        rndRef.current = seededRandom(0x404);
        requestAnimationFrame(begin);
      }, 220);
    });
    observer.observe(layer);
    return () => {
      observer.disconnect();
      window.clearTimeout(timer);
      window.clearTimeout(glyphTimerRef.current);
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      frameRef.current = 0;
    };
  }, [capture, start]);

  //* Háttérbe tett fül: a `requestAnimationFrame` amúgy is áll, de az utolsó
  //* időbélyeg elavul — visszatéréskor onnan folytatjuk, ahol abbahagytuk.
  useEffect(() => {
    const onVisible = () => {
      lastRef.current = performance.now();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  //! A JELENET ÚJRAJÁTSZHATÓ, ÉS EZ NEM JÁTÉK. Ez az egyetlen dolog a lapon,
  //! ami nem visz el innen: aki lekéste a mozdulatot (mert a fül háttérben
  //! nyílt meg, vagy mert épp máshova nézett), ne kelljen újratöltenie a lapot
  //! azért, hogy lássa, mi történt.
  const replay = () => {
    if (reduced) {
      setGlyphUp(false);
      setFallen(false);
      window.setTimeout(() => {
        setGlyphUp(true);
        setFallen(true);
      }, 620);
      return;
    }
    const world = worldRef.current;
    if (!world) return;
    window.clearTimeout(glyphTimerRef.current);
    setGlyphUp(false);
    setFallen(false);
    rndRef.current = seededRandom(0x404);
    phaseRef.current = "returning";
    returnRef.current = 0;
    for (const body of world.bodies) {
      body.vx = 0;
      body.vy = 0;
      body.va = 0;
    }
    glyphTimerRef.current = window.setTimeout(
      () => setGlyphUp(true),
      RETURN_SEC * 1000 + GLYPH_START,
    );
    start();
  };

  const registerCard = (id: string) => (el: HTMLDivElement | null) => {
    if (el) cardRefs.current.set(id, el);
    else cardRefs.current.delete(id);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/*//! AZ ÚJRAJÁTSZÁS A RÁCS FÖLÖTT ÁLL, NEM RAJTA. Egy lebegő gomb a rács
          //! sarkában pont azt takarná el, ami miatt a jelenet van — a szám alsó
          //! hasábját —, és a hulló kártyák is átmennének alatta. Itt viszont a
          //! saját sávjában ül: semmit nem fed le, és a rács tetejét jelölő
          //! vonal alatt rögtön ott a magyarázata is, hogy mire vonatkozik.
          //*
          //! A SÁV AKKOR IS OTT VAN, AMIKOR A GOMB MÉG NINCS. Ha a sor a gombbal
          //! együtt jelenne meg, a teljes rács megugrana alatta a hullás
          //! végén — egy 24 képpontos ugrás pont abban a pillanatban, amikor a
          //! szám a helyére ér. */}
      <div className="flex h-9 shrink-0 items-center justify-end px-3">
        <button
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-muted-strong",
            "transition-[color,opacity] duration-300 hover:text-foreground",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none",
            fallen ? "opacity-100" : "pointer-events-none opacity-0",
          )}
          onClick={replay}
          tabIndex={fallen ? undefined : -1}
          type="button"
        >
          <RotateCcw aria-hidden className="size-3.5" />
          Játszd újra
        </button>
      </div>

      {/*//! A RÁCS DÍSZLET, NEM ADAT. A hét egy valódi osztályé, de nem a
          //! látogatóé; a képernyőolvasónak a lap szövege mondja el ugyanazt,
          //! ezért ez az egész blokk rejtett. */}
      <div
        className="relative flex min-h-[21rem] flex-1 overflow-hidden border-t border-border bg-muted/25"
        aria-hidden
      >
        {/* Idősáv — a `/orarend` gutterének szótárával */}
        <div className="relative z-20 w-12 shrink-0 border-r border-border bg-card">
          {PERIODS.map((p) => (
            <div
              key={p.number}
              className="absolute inset-x-0 flex flex-col items-end pr-2 leading-none"
              style={{ top: rowTop(p.startMin) }}
            >
              <span className="text-[13px] font-bold text-foreground/70">
                {p.number}
              </span>
              <span className="mt-0.5 text-[10px] tabular-nums text-muted-strong">
                {minLabel(p.startMin)}
              </span>
            </div>
          ))}
        </div>

        {/* Naposzlopok: az üres rács, ami a hét alól előjön */}
        <div className="relative flex min-w-0 flex-1">
          {DAY_NAMES.map((name, i) => (
            <div
              key={name}
              className="relative min-w-0 flex-1 border-l border-border/70"
            >
              {PERIODS.map((p) => (
                <div
                  className="pointer-events-none absolute inset-x-0 border-t border-border/45"
                  key={p.number}
                  style={{ top: rowTop(p.startMin) }}
                />
              ))}
              <span className="absolute inset-x-0 top-1.5 text-center text-[11px] font-semibold text-muted-strong sm:text-xs">
                <span className="sm:hidden">{DAY_SHORT[i]}</span>
                <span className="hidden sm:inline">{name}</span>
              </span>
            </div>
          ))}

          {/*//! A SZÁM A HÉT ALATT VAN, a zuhanó kártyák fölötte: a lehulló hét
              //! TAKARJA a számjegyeket, amíg el nem fogy fölülük — ettől lesz
              //! mélysége a jelenetnek, nem két egymás mellé tett réteg. */}
          <div className="pointer-events-none absolute inset-0 z-10">
            {GLYPH_CARDS.map((g) => (
              <div
                className={cn(
                  "acc-tint-strong absolute border shadow-xs",
                  CELL_RADIUS,
                  //! A SZÁM NEM PATTAN BE. Egy rövid, kifutó emelkedés a hét
                  //! helyére — a hullással ELLENTÉTES irány, mert nem ugyanaz
                  //! az esemény folytatódik, hanem az, ami utána marad.
                  "transition-[transform,opacity] duration-[560ms] ease-[cubic-bezier(0.16,1,0.3,1)]",
                  glyphUp
                    ? "translate-y-0 opacity-100"
                    : "translate-y-6 opacity-0",
                  //* Csökkentett mozgás mellett csak az áttűnés marad.
                  "motion-reduce:translate-y-0 motion-reduce:duration-500",
                )}
                key={g.id}
                style={{
                  ...accentStyle(g.seed),
                  left: laneLeft(
                    Math.floor(g.col / GLYPH_LANES),
                    g.col % GLYPH_LANES,
                    GLYPH_LANES,
                  ),
                  width: laneWidth(GLYPH_LANES),
                  top: rowTop(g.startMin),
                  height: rowHeight(g.startMin, g.endMin),
                  transitionDelay: glyphUp ? `${g.col * GLYPH_STEP}ms` : "0ms",
                }}
              />
            ))}
          </div>

          {/* A hét — amíg tart */}
          <div
            className="pointer-events-none absolute inset-0 z-20"
            ref={layerRef}
          >
            {WEEK_CARDS.map((card, i) => (
              <SceneLesson
                card={card}
                //! CSÖKKENTETT MOZGÁS MELLETT A SORREND MARAD, CSAK A MÓD
                //! VÁLTOZIK: ugyanaz a balról jobbra tartó söprés, csak
                //! elhalványulással. A késleltetés a nap sorszámából jön, hogy
                //! ne kelljen hozzá megmérni a rácsot.
                faded={reduced && fallen}
                fadeDelay={reduced ? card.day * 90 + (i % 3) * 40 : 0}
                key={card.id}
                ref={registerCard(card.id)}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

//* Egy óra a rácson. Szándékosan NEM a `LessonBlock`: az a valódi
//* adatszerkezetre (`LessonRun`) és az összevonás gépezetére épül, amiből itt
//* egy sor sem kell. Ami közös — a felület, a keret, a sarok, a szín —, az
//* ugyanabból a két helyről jön (`acc-tint`, `CELL_RADIUS`), tehát a kártya
//* akkor is együtt mozdul a rács kártyáival, ha azok változnak.
const SceneLesson = ({
  card,
  faded,
  fadeDelay,
  ref,
}: {
  card: (typeof WEEK_CARDS)[number];
  faded: boolean;
  fadeDelay: number;
  ref: (el: HTMLDivElement | null) => void;
}) => {
  //* Ugyanaz a sűrűség-gondolat, mint a valódi kártyán: az egyórás blokkra a
  //* tantárgy és a terem fér rá, a hosszabbra az időpont és a tanár is.
  const roomy = card.endMin - card.startMin > 50;
  return (
    <div
      className={cn(
        "acc-tint absolute overflow-hidden border px-1.5 py-1 text-left shadow-xs",
        CELL_RADIUS,
        //! AZ ÁTTŰNÉS CSAK A CSÖKKENTETT MOZGÁS ÁGÁN SZÓLAL MEG. A zuhanó
        //! változatban a kártyát képkockánként a `transform` mozgatja, és egy
        //! ráadás CSS-átmenet a `transform`-on épp azt kenné el.
        "motion-reduce:transition-opacity motion-reduce:duration-[420ms] motion-reduce:ease-out",
        faded && "motion-reduce:opacity-0",
      )}
      ref={ref}
      style={{
        ...accentStyle(card.short),
        left: laneLeft(card.day, card.lane, card.lanes),
        width: laneWidth(card.lanes),
        top: rowTop(card.startMin),
        height: rowHeight(card.startMin, card.endMin),
        transitionDelay: `${fadeDelay}ms`,
      }}
    >
      <div className="flex items-start gap-1">
        <span className="min-w-0 flex-1 truncate text-[11px] font-bold leading-tight text-foreground">
          {card.short}
        </span>
        <span className="shrink-0 rounded-[4px] bg-foreground/[0.08] px-1 py-px text-[10px] font-bold leading-tight tabular-nums text-foreground dark:bg-foreground/15">
          {card.room}
        </span>
      </div>
      {roomy && (
        <span className="mt-0.5 block truncate text-[10px] leading-tight tabular-nums text-muted-strong">
          {minLabel(card.startMin)}–{minLabel(card.endMin)}
        </span>
      )}
      {roomy && (
        <span className="mt-px block truncate text-[10px] leading-tight text-muted-strong">
          {card.teacher}
        </span>
      )}
    </div>
  );
};
