import type { RestSeason } from "@/lib/rest-day";
import { cn } from "@/lib/utils";

//* ---------------------------------------------------------------------------
//* AZ ÉVSZAK RÉTEGE — a szünet háttere
//* ---------------------------------------------------------------------------
//! EZ AZ EGYETLEN HELY A LAPON, AHOL A MOZGÁS NEM ÁLLAPOTOT KÖZÖL. Mindenütt
//! máshol a mozgás munkát végez: a sáv az eltelt időt rajzolja, a napköteg a
//! mozdulat irányát mutatja, a „most" sor az érkezését. Itt nincs mit közölni —
//! ez a nap ATTÓL nap, hogy nincs rajta dolgod.
//!
//! ÉS PONT EZÉRT NEM MINDEN ÜRES NAP KAPJA MEG. A hétvége évente negyvenszer
//! jön el; ha havazna rajta, a második hétvégére dísz lenne, a harmadikra zaj.
//! A szünet évente ötször van — annyiszor egy felület megengedhet magának egy
//! ünneplést. Ünnepnapon (`kind: "holiday"`) pedig `none` az évszak: október
//! 23-a nem hangulat.
//!
//! A SZEMCSÉK HELYE SZÁMÍTOTT, NEM VÉLETLEN. Egy `Math.random()` minden
//! újrarajzoláskor újrakeverné a mezőt — másodpercenként egyszer, mert a hero
//! az órajelre fut. Ez a hash az indexből ugyanazt a „véletlent" adja vissza
//! mindig: a hó ugyanott esik két képkockával később is.

//! TIZENHAT SZEMCSE, NEM HARMINC. A köteg a hét mind az öt napját előre
//! felépíti, szünethéten tehát ötször áll ott ugyanez a mező. A sűrűség fölött
//! egy ponton már nem szebb a hó, csak több — a szórás és a méretkülönbség
//! csinálja a mélységet, nem a darabszám.
const COUNT = 16;

//! EGYENLETES 0–1 EGÉSZ SZÁMOKBÓL — ÉS UGYANAZ MINDKÉT OLDALON. A `Math.sin`
//! pontossága implementációfüggő: a szerver (Node) és a böngésző az utolsó
//! néhány jegyben eltérő eredményt ad, amit a React hidratálási eltérésként
//! jelent („-73.31456772706588deg" kontra „…804813deg"). A kerekítés ezt a
//! farkat vágja le: három tizedesjegyen a két oldal biztosan megegyezik, a
//! szórás pedig ettől semmit nem veszít.
function noise(i: number, salt: number): number {
  const x = Math.sin((i + 1) * 12.9898 + salt * 78.233) * 43758.5453;
  return Math.round((x - Math.floor(x)) * 1000) / 1000;
}

//* Minden szám a jelenetbe kerekítve megy: a stílus-értékek így karakterről
//* karakterre ugyanazok a szerveren és a kliensen.
function r(value: number, digits = 2): number {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}

type Grain = {
  /** Állandó azonosító: a mező sosem keveredik újra, a kulcs sem mozdulhat. */
  id: string;
  /** Vízszintes kiindulás, a doboz százalékában. */
  x: number;
  /** Oldalirányú sodródás a teljes út alatt, képpontban. */
  drift: number;
  /** Egy teljes áthaladás ideje, másodpercben. */
  dur: number;
  /** Negatív késleltetés: a mező már az első képkockán tele van. */
  delay: number;
  /** Méret, képpontban. */
  size: number;
  /** Átlátszatlanság. */
  opacity: number;
  /** Elfordulás a végén, fokban — csak a leveleknek és a szirmoknak. */
  spin: number;
  /** Hol áll meg a szemcse, ha a látogató kevesebb mozgást kért (cqh). */
  rest: number;
};

function field(salt: number, slow: boolean): Grain[] {
  return Array.from({ length: COUNT }, (_, i) => {
    const a = noise(i, salt);
    const b = noise(i, salt + 1);
    const c = noise(i, salt + 2);
    const base = slow ? 22 : 14;
    const dur = r(base + a * base * 0.9);
    return {
      id: `${salt}-${i}`,
      x: r((i / COUNT) * 100 + (b - 0.5) * (100 / COUNT)),
      drift: r((c - 0.5) * 90),
      dur,
      //! MINDEN SZEMCSE MÁR ÚTON VAN. Késleltetés nélkül a mező felülről
      //! töltődne fel, és a szünet első másodperce egy üres doboz lenne —
      //! pont az a pillanat, amiért a lap megnyílt.
      delay: r(-a * dur),
      size: r(3 + b * 5),
      opacity: r(0.25 + c * 0.5),
      spin: r((b - 0.5) * 540),
      //! A MOZGÁS NÉLKÜLI MEZŐ SAJÁT SZÓRÁST KAP. Ha a szemcse ott állna meg,
      //! ahol a késleltetése épp tartja, a mező szeszélyesen csomósodna — a
      //! képernyő teteje üresen maradhatna. Ez a képlet ugyanúgy oszt, mint a
      //! vízszintes hely: egyenletesen, egy szemcsényi bizonytalansággal.
      rest: r(((i + c) / COUNT) * 110 - 5, 1),
    };
  });
}

const SHAPE: Record<
  Exclude<RestSeason, "none">,
  { cls: string; slow: boolean; rise: boolean; salt: number }
> = {
  //* Hó: kerek, hideg, egyenletes — a legnyugodtabb esés.
  christmas: { cls: "dsg-grain-snow", slow: false, rise: false, salt: 1 },
  newyear: { cls: "dsg-grain-snow", slow: false, rise: false, salt: 3 },
  //* Levél: hosszabb, pörgő út, melegebb szín.
  autumn: { cls: "dsg-grain-leaf", slow: true, rise: false, salt: 5 },
  //* Szirom: a levélnél könnyebb és halványabb.
  spring: { cls: "dsg-grain-petal", slow: true, rise: false, salt: 7 },
  //! A NYÁR NEM ESIK, HANEM SZÁLL. Lefelé hulló meleg fény hamis képet adna:
  //! a forró levegő felfelé megy, és a szemnek ez az, ami nyárnak érződik.
  summer: { cls: "dsg-grain-mote", slow: true, rise: true, salt: 11 },
};

export function SeasonalSky({
  season,
  className,
}: {
  season: RestSeason;
  className?: string;
}) {
  if (season === "none") return null;
  const shape = SHAPE[season];
  const grains = field(shape.salt, shape.slow);

  return (
    <div
      aria-hidden
      className={cn(
        "dsg-sky dsg-scene pointer-events-none absolute inset-0 overflow-hidden",
        className,
      )}
    >
      {grains.map((g) => (
        <span
          key={g.id}
          className={cn(
            "absolute top-0 block",
            shape.rise ? "dsg-rise" : "dsg-fall",
            shape.cls,
          )}
          style={
            {
              left: `${g.x}%`,
              width: `${g.size}px`,
              height: `${g.size}px`,
              opacity: g.opacity,
              "--dsg-dur": `${g.dur}s`,
              "--dsg-delay": `${g.delay}s`,
              "--dsg-drift": `${g.drift}px`,
              "--dsg-spin": `${g.spin}deg`,
              //! REDUKÁLT MOZGÁSNÁL A MEZŐ ÁLL — DE OTT VAN. Az animáció
              //! kikapcsolása egy üres dobozt hagyna maga után; ehelyett a
              //! szemcse a saját fázisában, mozdulatlanul kimerevedik, és a
              //! szünetnek marad hangulata annak is, aki nem kér a mozgásból.
              "--dsg-rest": `${g.rest}cqh`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}

//! A FENYŐSOR. Csak a téli szünet kapja meg — ez az egyetlen évszak, aminek a
//! lapon SAJÁT rajza van. Sziluett, nem illusztráció: a szövegszín töredékével,
//! a kártya alsó élére ülve. Így a kártya háttere marad háttér; a fenyők nem
//! versenyeznek a nagy sorral, csak megtámasztják.
//!
//! HÁROM SOR, HÁROM MÉLYSÉG. Egyetlen sávban a fák egyforma távolinak
//! látszanának; egymás mögé rétegezve a kártya alja TÉRRÉ válik, amiben a hó
//! esik. A hátsó sor halványabb és alacsonyabb — ugyanaz a szabály, amit a köd
//! csinál a valóságban.
const RIDGES = [
  { count: 15, top: 26, opacity: 0.05, salt: 2 },
  { count: 11, top: 34, opacity: 0.08, salt: 4 },
  { count: 8, top: 42, opacity: 0.12, salt: 6 },
];

function pines(count: number, top: number, salt: number): string {
  const step = 100 / count;
  let d = "";
  for (let i = 0; i <= count; i += 1) {
    const cx = i * step + (noise(i, salt) - 0.5) * step * 0.6;
    //* A magasság és a szélesség EGYÜTT nő: egy magas, keskeny fa nyárfa lenne.
    const scale = 0.65 + noise(i, salt + 1) * 0.6;
    const h = (60 - top) * scale;
    const w = step * 0.62 * scale;
    d += `M${(cx - w).toFixed(2)} 60L${cx.toFixed(2)} ${(60 - h).toFixed(2)}L${(cx + w).toFixed(2)} 60Z`;
  }
  return d;
}

export function PineRidge({ className }: { className?: string }) {
  return (
    <svg
      role="presentation"
      aria-hidden="true"
      viewBox="0 0 100 60"
      preserveAspectRatio="none"
      className={cn(
        "pointer-events-none absolute inset-x-0 bottom-0 h-12 w-full text-hero-foreground",
        className,
      )}
    >
      {RIDGES.map((ridge) => (
        <path
          key={ridge.salt}
          fill="currentColor"
          fillOpacity={ridge.opacity}
          d={pines(ridge.count, ridge.top, ridge.salt)}
        />
      ))}
    </svg>
  );
}
