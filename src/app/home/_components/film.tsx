"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { minLabel, rangeLabel } from "@/components/timetable/shared";
import {
  BOARD_H,
  BOARD_W,
  COL_W,
  colCenter,
  colLeft,
  DUAL_END_MIN,
  DUAL_START_MIN,
  heightOf,
  NEXT_EVENT,
  NOW_EVENT,
  SPLIT_MINE,
  SPLIT_OTHER,
  topOf,
} from "./week";
import { WeekGrid } from "./week-grid";

//! ─── EGY RÁCS, NÉGY KAMERAÁLLÁS ────────────────────────────────────────────
//! A nyitólap nem szakaszokból áll, hanem EGYETLEN órarendből, amit a görgetés
//! közelebb-távolabb visz. Ugyanaz a DOM-beli rács van a nagy totálban és a
//! csoportbontás közelijében is — nincs átvágás, mert nincs mit átvágni.
//*
//! MIÉRT JAVASCRIPT ÉS NEM `animation-timeline: scroll()`? Mert a Firefox
//! máig nem szállítja, és ennél a lapnál a kameramozgás NEM dísz: nélküle a
//! négy szakasz szövege ugyanazt a mozdulatlan rácsot magyarázná. Egy statikus
//! tartalék itt a lap felét venné el. A hajtás cserébe pontosan annyit tesz,
//! amennyit szabad: `requestAnimationFrame`-be terelt, passzív görgetésfigyelő,
//! ami EGY elemre ír néhány számot — a rajzolás onnantól a böngészőé.

//! A KAMERAÁLLÁS EGY PÓZ, NEM EGY GÖRGETÉSI SZÁZALÉK. Az `x`/`y` képpont a
//! tábla közepéhez képest (lásd `week.ts`: `BOARD_W`/`BOARD_H`), nem a
//! képernyőhöz — ezért marad ugyanott a beállítás minden kijelzőméreten, és a
//! `--cam-fit` csak a nagyítást igazítja.
type Pose = {
  scale: number;
  x: number;
  y: number;
  tilt: number;
  detail: number;
  split: number;
  now: number;
  cream: number;
  ink: number;
  intro: number;
};

//! ─── A PÓZOK A SZAKASZOKHOZ VANNAK KÖTVE, NEM SZÁMOKHOZ ────────────────────
//! Az első változat kézzel írt görgetési arányokkal dolgozott (0.14 / 0.42 /
//! 0.70 / 0.97). Ez azonnal elcsúszott: a szakaszok TÉNYLEGES középpontjai
//! 0 / 0.28 / 0.573 / 0.866-nál álltak, vagyis minden szakasz mellé egy
//! képkockával korábbi kameraállás került — a csoportbontás szövege mellett a
//! teljes hét látszott, a duális mellett a közeli. A számokat pedig minden
//! szakaszmagasság-, kifutó- vagy töréspont-változtatás újra elrontotta volna.
//*
//! EZÉRT A PÓZ AZT MONDJA MEG, MELYIK SZAKASZHOZ TARTOZIK — a görgetési arányt
//! a hajtás MÉRI ki a valódi elrendezésből (és újraméri átméretezéskor). Az
//! `at` a szakasz sorszáma; a `toward`/`t` a két szakasz KÖZÖTTI átmenetre
//! tesz egy pózt, ott, ahol nincs saját szöveg — például amikor a hét
//! kiélesedik a nyitókép és a csoportbontás között.
//*
//! A TELEFON MÁSIK KAMERA, NEM UGYANAZ KICSIBEN. A tábla 1240 képpont széles;
//! egy 375 képpontos kijelzőn a teljes hét 0,29-es nagyításon fér ki, ahol a
//! kártyák felirata 3 képpont — olvashatatlan pép, nem információ. A `narrow`
//! ezért NEM a széles pózok kicsinyítése, hanem saját beállítássor: a telefon
//! közelebb megy (a csoportbontásnál majdnem ötszörös nagyításra), a totált
//! pedig szándékosan felirat nélküli színmezőként hagyja. Egyetlen pózban tér
//! el a TÁRGYA is: széles kijelzőn a duális szakasz az egész hetet mutatja,
//! telefonon a kedd–szerda VARRATOT, mert az iskola és a munkahely határa az,
//! ami ott egyáltalán olvasható méretben elfér.
type Keyframe = {
  at: number;
  toward?: number;
  t?: number;
  pose: Pose;
  narrow?: Partial<Pose>;
  narrowT?: number;
};

const FAR: Pose = {
  scale: 0.7,
  x: 0,
  y: 40,
  tilt: 15,
  detail: 0,
  split: 0,
  now: 0,
  cream: 1,
  ink: 0,
  intro: 1,
};

//! A KAMERA CÉLPONTJAI A RÁCS MODELLJÉBŐL SZÁMOLÓDNAK, NEM KÉZZEL. Ha az
//! ütköző óra egy sávval arrébb kerül, vagy a csengetési rend változik, a
//! közeli magától odanéz — beírt képpontszámok mellett a kamera némán a
//! rossz kártyára állna, és semmi nem szólna érte.
//* A tábla közepe és a célpont közepe közti különbség; a lencse ennyivel tolja
//* el a táblát, mielőtt ránagyítana.
const centerOn = (x: number, y: number) => ({
  x: BOARD_W / 2 - x,
  y: BOARD_H / 2 - y,
});

const midOf = (e: typeof SPLIT_MINE) =>
  topOf(e.startMin) + heightOf(e.startMin, e.endMin) / 2;

//* Az ütköző sáv: a hétfői oszlop közepe, a csoportbontott óra magasságában.
const SPLIT_CAM = centerOn(colCenter(0), midOf(SPLIT_MINE));

//* A progresszív nézet: a futó óra ÉS a rá következő közé állunk, hogy a
//* „Most" és az „Utána" egyszerre legyen a képen.
const NOW_CAM = centerOn(
  colCenter(0),
  (midOf(NOW_EVENT) + midOf(NEXT_EVENT)) / 2,
);

//! ─── A TELEFON KÉT SAJÁT CÉLPONTJA ─────────────────────────────────────────
//* A VARRAT: a kedd és a szerda oszlopa együtt — az utolsó iskolai nap és az
//* első duális nap. Széles kijelzőn ezt az egész hét mondja el; telefonon a
//* két oszlop az a legnagyobb kivágás, amiben a napfejek („Kedd · iskola",
//* „Szerda · duális") még olvasható méretben maradnak.
const SEAM_CAM = centerOn(
  (colLeft(1) + colLeft(2) + COL_W) / 2,
  //* Nem a duális blokk közepe: a fejlécnek is a képen kell maradnia, tehát a
  //* blokk felső harmadára állunk.
  topOf(DUAL_START_MIN) + heightOf(DUAL_START_MIN, DUAL_END_MIN) * 0.2,
);

//* A progresszív nézet telefonon a FUTÓ óra felé húz: keskeny képen a két
//* kártya közti pontos felezés mindkettőt félig vágná el, így viszont a „most"
//* gyűrűs blokk egészben látszik, a következő pedig belóg a kép aljába.
const NOW_CAM_NARROW = centerOn(
  colCenter(0),
  midOf(NOW_EVENT) + (midOf(NEXT_EVENT) - midOf(NOW_EVENT)) * 0.36,
);

const KEYFRAMES: readonly Keyframe[] = [
  //* Totál — az egész hét egyszerre, még olvashatatlanul: ez a lap első képe.
  { at: 0, pose: FAR, narrow: { scale: 0.98, y: 20, tilt: 14 } },
  //* A nyitószöveg még áll, a kamera már indul.
  {
    at: 0,
    toward: 1,
    t: 0.28,
    pose: { ...FAR, scale: 0.82, y: 26, tilt: 11, detail: 0.25 },
    narrow: { scale: 1.04, y: 14, tilt: 9, detail: 0.15 },
    //! TELEFONON A PAPÍR TOVÁBB TART. Széles kijelzőn a nyitószöveg a kép
    //! közepén áll, és a görgetés első harmadában ki is sétál belőle — ott
    //! az alapszín váltása pontosan a távozását kíséri. Telefonon viszont a
    //! szöveg a képernyő alsó sávjához tapad, és a szakasz FELÉIG teljes
    //! egészében látszik: ugyanezekkel az arányokkal a meleg papír már
    //! eltűnt volna a cím alól, amíg az még olvasható. A `narrowT` ezért
    //! oda tolja a váltást, ahol a nyitókép ténylegesen elhagyja a képernyőt.
    narrowT: 0.46,
  },
  //! A HÉT KIÉLESEDÉSE — A LAP EGYETLEN OLYAN PILLANATA, AMIHEZ NINCS SZÖVEG.
  //! Itt jön be az idősáv, a napfejek és az óravonalak, és itt vált a meleg
  //! papír az alkalmazás saját felületére. Szándékosan a két szakasz KÖZÉ esik:
  //! ez az átmenet, nem egy állomás.
  {
    at: 0,
    toward: 1,
    t: 0.62,
    pose: {
      scale: 1,
      x: 0,
      y: 0,
      tilt: 0,
      detail: 1,
      split: 0,
      now: 0,
      cream: 0,
      ink: 0.55,
      intro: 0,
    },
    //* Telefonon a kiélesedés már befelé indul: a tábla két széle kicsúszik a
    //* képből, és ettől kezdve a kamera nem a hetet mutatja, hanem benne jár.
    narrow: { scale: 1.15 },
    //* És a kiélesedés vele mozdul: a papírról az alkalmazás felületére
    //* való átmenet telefonon a szakasz végén történik, nem a közepén.
    narrowT: 0.8,
  },
  //! A CSOPORTBONTÁS KÉT PÓZON ÁLL, EGY KAMERAÁLLÁSBAN. A szakasz közepén a
  //! kamera beáll az ütköző sávra, és ott MÉG MINDKÉT kártya látszik — ez a
  //! kiindulás, amit a Jedlikinfo ad. A következő póz ugyanonnan, mozdulatlan
  //! kamerával oldja fel: a saját óra kinyílik a teljes sávra. Ha a kettő egy
  //! póz lenne, a látogató csak a KÉSZ állapotot látná, és épp az maradna el,
  //! amiről a szakasz szól.
  {
    at: 1,
    pose: {
      scale: 1.85,
      ...SPLIT_CAM,
      tilt: 0,
      detail: 1,
      split: 0,
      now: 0,
      cream: 0,
      ink: 1,
      intro: 0,
    },
    //* A hétfői sáv telefonon a képernyő teljes szélességét megkapja: az
    //* ütköző pár két fél kártyája így ~85 képpont széles, a feliratuk pedig
    //* nagyobb, mint az `/orarend`-en. A közeli itt nem illusztráció, hanem az
    //* egyetlen mód, hogy a két kártya egyszerre legyen olvasható.
    narrow: { scale: 4.8 },
  },
  {
    at: 1,
    toward: 2,
    t: 0.42,
    pose: {
      scale: 1.85,
      ...SPLIT_CAM,
      tilt: 0,
      detail: 1,
      split: 1,
      now: 0,
      cream: 0,
      ink: 1,
      intro: 0,
    },
    narrow: { scale: 4.8 },
  },
  //* Vissza a teljes hétre: a három duális blokk csak innen olvasható együtt.
  {
    at: 2,
    pose: {
      scale: 1.06,
      x: 0,
      y: 0,
      tilt: 0,
      detail: 1,
      split: 1,
      now: 0,
      cream: 0,
      ink: 1,
      intro: 0,
    },
    //! TELEFONON NEM A HÉT, HANEM A VARRAT. Öt oszlop 375 képpontban napi 75
    //! képpontot jelent: a napfejek 4 képpontosra esnének, és pont az veszne
    //! el, amit a szakasz állít — hogy MELYIK nap hová tartozik. A kamera
    //! ezért a keddre és a szerdára áll: az utolsó iskolai nap sűrű
    //! kártyaoszlopa mellett az első duális nap egyetlen blokkja. A vágott
    //! szomszédok mondják meg, hogy a hét folytatódik.
    narrow: { scale: 3.0, ...SEAM_CAM },
  },
  //* A futó óra ÉS a rá következő: a progresszív nézet nézőpontja. A szakasz
  //* kiírása mindkettőt megnevezi („Most" / „Utána"), tehát a képnek is
  //* mindkettőt mutatnia kell — egyetlen kártyára zoomolva a mondat fele
  //* képen kívül maradna.
  {
    at: 3,
    pose: {
      scale: 1.7,
      ...NOW_CAM,
      tilt: 0,
      detail: 1,
      split: 1,
      now: 1,
      cream: 0,
      ink: 1,
      intro: 0,
    },
    narrow: { scale: 3.6, ...NOW_CAM_NARROW },
  },
];

//* Csökkentett mozgás mellett a kamera ÁLL. A rács a kibontott állapotában
//* marad (feloldott csoportbontás, látszó „most" jelzés), a szakaszok szövege
//* pedig magától is teljes — a mozgás itt magyarázat, nem információ.
const STILL: Omit<Pose, "cream" | "ink" | "intro"> = {
  scale: 1,
  x: 0,
  y: 0,
  tilt: 0,
  detail: 1,
  split: 1,
  now: 1,
};

//! TELEFONON A MOZDULATLAN KAMERA IS MÁS. Ugyanaz az álló beállítás itt a
//! teljes hetet mutatná 0,27-es nagyításon — vagyis olvashatatlan méretű
//! feliratokat, ami félrevezetőbb, mint a semmi. Csökkentett mozgás mellett a
//! telefon ezért a totált tartja, feliratok NÉLKÜL: a tábla színmező marad, a
//! négy szakasz szövege pedig magától is teljes.
const NARROW_STILL: Omit<Pose, "cream" | "ink" | "intro"> = {
  scale: 0.98,
  x: 0,
  y: 18,
  tilt: 0,
  detail: 0,
  split: 1,
  now: 1,
};

//* A keskeny kamerasor akkor lép be, ha a kamera ABLAKA kicsi — nemcsak a
//* telefon álló helyzetében, hanem fekvő telefonon is, ahol a képernyő széles
//* ugyan, de alacsony.
const NARROW_QUERY = "(max-width: 47.99rem), (max-height: 34rem)";

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

//* Simított átmenet a két szomszédos póz között: a mozgás a beállásoknál
//* lassul le, közben gyorsul — így minden szakasz közepén a kamera ÁLL, nem
//* épp fékez.
function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

type Stop = { p: number; pose: Pose };

const POSE_KEYS = [
  "scale",
  "x",
  "y",
  "tilt",
  "detail",
  "split",
  "now",
  "cream",
  "ink",
  "intro",
] as const;

function sample(stops: readonly Stop[], p: number): Pose {
  if (stops.length === 0) return FAR;
  if (p <= stops[0].p) return stops[0].pose;
  const last = stops[stops.length - 1];
  if (p >= last.p) return last.pose;
  let i = 0;
  while (i < stops.length - 2 && stops[i + 1].p < p) i++;
  const a = stops[i];
  const b = stops[i + 1];
  const span = b.p - a.p;
  const t = span <= 0 ? 1 : smooth((p - a.p) / span);
  const out = {} as Pose;
  for (const k of POSE_KEYS) out[k] = a.pose[k] + (b.pose[k] - a.pose[k]) * t;
  return out;
}

function useCamera() {
  //! A VÁLTOZÓK A FILM GYÖKERÉRE MENNEK, NEM A SZÍNPADRA. A szakaszok szövege
  //! a színpad TESTVÉRE (hogy fölé rajzolódjon), így a színpadra írt egyedi
  //! tulajdonságokat nem örökölné — a nyitószöveg elhalványodása és az alap
  //! színváltása ugyanabból a számból kell hogy jöjjön.
  const filmRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const film = filmRef.current;
    if (!film) return;

    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const narrowQuery = window.matchMedia(NARROW_QUERY);
    let raf = 0;
    let stops: Stop[] = [];
    let travel = 0;
    let narrow = narrowQuery.matches;

    //! A PÓZOK GÖRGETÉSI HELYE MÉRT ADAT. Végigmegyünk a szakaszokon, kiszedjük
    //! a KÖZÉPPONTJUK görgetési helyét, és ebből számoljuk, hol áll a kamera.
    //! Ez az egyetlen hely, ahol a lap elrendezése és a kameramozgás
    //! találkozik: ha a szakaszok magassága vagy a kifutó változik, a
    //! choreográfia magától követi.
    const layout = () => {
      const beats = film.querySelectorAll<HTMLElement>(".film-beat");
      const filmTop = film.getBoundingClientRect().top + window.scrollY;
      narrow = narrowQuery.matches;
      travel = film.offsetHeight - window.innerHeight;
      if (travel <= 0 || beats.length === 0) {
        stops = [];
        return;
      }
      //* A szakasz közepe akkor van a képernyő közepén, amikor idáig görgettünk.
      const center = (i: number) => {
        const b = beats[Math.min(i, beats.length - 1)];
        const top = b.getBoundingClientRect().top + window.scrollY - filmTop;
        return clamp01(
          (top + b.offsetHeight / 2 - window.innerHeight / 2) / travel,
        );
      };
      stops = KEYFRAMES.map((k) => {
        const from = center(k.at);
        //* A keskeny kamerasornak saját időzítése is lehet: lásd `narrowT`.
        const t = (narrow ? (k.narrowT ?? k.t) : k.t) ?? 0.5;
        const p =
          k.toward === undefined ? from : from + (center(k.toward) - from) * t;
        return {
          p,
          pose: narrow && k.narrow ? { ...k.pose, ...k.narrow } : k.pose,
        };
      })
        //* Egy soha nem növekvő sorozat a mintavételt megzavarná; a szakaszok
        //* sorrendje adja a monotonitást, a `sort` csak biztosítja.
        .sort((a, b) => a.p - b.p);
    };

    const write = (pose: Pose, still: boolean) => {
      const s = film.style;
      const cam = still
        ? { ...pose, ...(narrow ? NARROW_STILL : STILL) }
        : pose;
      s.setProperty("--cam-scale", `${cam.scale}`);
      s.setProperty("--cam-x", `${cam.x}`);
      s.setProperty("--cam-y", `${cam.y}`);
      s.setProperty("--cam-tilt", `${cam.tilt}`);
      s.setProperty("--cam-detail", `${cam.detail}`);
      s.setProperty("--cam-split", `${cam.split}`);
      s.setProperty("--cam-now", `${cam.now}`);
      //* A szín és a nyitószöveg akkor is a görgetést követi, ha a kamera áll:
      //* egyik sem térbeli mozgás, viszont nélkülük a sötét nyitócím a sötét
      //* alapon maradna.
      s.setProperty("--f-cream", `${pose.cream}`);
      s.setProperty("--f-ink", `${pose.ink}`);
      s.setProperty("--f-intro", `${pose.intro}`);
    };

    const measure = () => {
      const rect = film.getBoundingClientRect();
      const p = travel <= 0 ? 0 : clamp01(-rect.top / travel);
      write(sample(stops, p), motionQuery.matches);
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
    motionQuery.addEventListener("change", onResize);
    //* Az arányváltás (telefon ↔ tábla) NEM mindig jár átméretezéssel — fekvő
    //* telefonon a magasság-feltétel a képernyő elforgatásakor billen át —,
    //* ezért a kamerasort a lekérdezés maga is újraépítheti.
    narrowQuery.addEventListener("change", onResize);

    //! A SZAKASZOK MAGASSÁGA A SZÖVEGTŐL FÜGG. Betűbetöltés, sortörés vagy egy
    //! később érkező kép után a mért középpontok elmozdulnak — a figyelő
    //! ilyenkor újraszámol, hogy a kamera ne egy elavult elrendezéshez járjon.
    const resizeObserver = new ResizeObserver(onResize);
    resizeObserver.observe(film);

    return () => {
      if (raf) cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      motionQuery.removeEventListener("change", onResize);
      narrowQuery.removeEventListener("change", onResize);
    };
  }, []);

  return { filmRef };
}

//* ---------------------------------------------------------------------------
//* A szakaszok — a lap MONDANIVALÓJA. A rács mutat, ez mondja ki.
//* ---------------------------------------------------------------------------

//! A KIÍRÁS UGYANABBÓL AZ ADATBÓL OLVAS, MINT A RÁCS. A szakasz azt mondja
//! ki szavakban, amit a kamera épp mutat — ha a kettő két külön helyen
//! íródna, előbb-utóbb mást állítanának.
const named = (e: typeof SPLIT_MINE) => `${e.full} · ${e.room}`;
const slot = (e: typeof SPLIT_MINE) => rangeLabel(e.startMin, e.endMin);

//! A MŰSZERLAP TELEFONON SŰRŰBB, NEM RÖVIDEBB. A tények ugyanazok maradnak —
//! a kamera alatti sávban viszont minden képpont a tábláé, amit elveszünk.
//! Ezért a sorköz és a betűméret enged, a TARTALOM nem.
function Readout({ children }: { children: React.ReactNode }) {
  return (
    <dl className="film-readout mt-7 grid gap-px overflow-hidden rounded-[10px] border border-white/12 bg-white/[0.07] text-sm">
      {children}
    </dl>
  );
}

function Row({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 bg-[oklch(0.17_0.014_250)] px-3.5 py-2.5">
      <dt className="text-white/55">{term}</dt>
      <dd className="text-right font-medium tabular-nums text-white">
        {children}
      </dd>
    </div>
  );
}

function Panel({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  //! A SZÖVEG SAJÁT ALAPON ÁLL, NEM A KAMERÁÉN. Ha a hajtás nem fut le
  //! (régi böngésző, hibás szkript), a rács alapszíne a nyitókép meleg
  //! papírja marad — a magyarázó szakaszok fehér betűi azon olvashatatlanok
  //! lennének. A saját, sötét műszerlap ezt függetleníti: a lap akkor is
  //! olvasható, ha a kamera meg sem mozdul.
  //* A HÁTTÉRELMOSÁS A TELEFONON KIMARAD (lásd a lap CSS-ét): egy görgetéssel
  //* mozgatott réteg fölött minden képkockára újraszámolna. A lemez helyette
  //* tömörebb lesz — ugyanaz a hatás, töredék áron.
  return (
    <div
      className={`film-panel rounded-[calc(var(--radius)-6px)] border border-white/12 bg-[oklch(0.155_0.012_250/0.82)] p-6 backdrop-blur-xl sm:p-8 ${className}`}
    >
      {children}
    </div>
  );
}

export function GridFilm() {
  const { filmRef } = useCamera();

  return (
    <div ref={filmRef} className="film relative">
      {/*//! A VÁGÁS A KAMERÁÉ, NEM A SZÍNPADÉ. A színpad korábban maga
          //! vágott — csakhogy akkor az alapszín sem lóghat túl rajta, márpedig
          //! épp arra van szükség (lásd lentebb a `100lvh`-t). A vágás ezért
          //! egy réteggel beljebb került, a kamera ablakára. Mérve: a tábla
          //! SAJÁT tartalma egyetlen széles kameraállásban sem ér a kamera
          //! dobozán kívülre, tehát a széles elrendezésből semmi nem vész el. */}
      <div className="film-stage sticky top-0 z-0 h-[100svh]">
        {/*//* A HÁTTÉR HÁROM RÉTEG, NEM EGY SZÍNÁTMENET. A meleg papír, a
            //* kobalt és az alkalmazás saját éjszakai felülete külön él, a
            //* kamera pedig csak az átlátszóságukat keveri — így a három
            //* színvilág mindegyike a SAJÁT pontos értékén szólal meg, nem egy
            //* interpolált középúton.
            //*
            //! ÉS AZ ALAP MAGASABB, MINT A SZÍNPAD. Telefonon a görgetéssel
            //! visszahúzódó címsor alatt a látható terület `100svh`-ról
            //! `100lvh`-ra nő; egy pontosan `100svh` magas alap ilyenkor egy
            //! sötét csíkot hagyna a képernyő alján, épp a meleg papír alatt.
            //! A `100lvh` ezt a rést eleve kitölti, a kamera pedig továbbra is
            //! az `svh`-hoz igazodik, hogy a beállítás ne ugráljon. */}
        <div className="absolute inset-x-0 top-0 h-[100lvh]">
          <div className="absolute inset-0 bg-primary" />
          <div className="film-cream absolute inset-0 bg-[#F3EBDD]" />
          <div className="film-ink absolute inset-0 bg-card" />
        </div>

        {/*//! A RÁCS NEM OLVASHATÓ FEL ÉS NEM FÓKUSZÁLHATÓ. Minta-adat: az
            //! `EventCard` valódi gombokat rajzol, amik itt sehová nem
            //! vezetnek. Az `inert` mindkettőt egyszerre intézi el.
            //*
            //! ÉS EZ A KAMERA ABLAKA IS, NEM CSAK A TARTÁLYA. Telefonon a lap
            //! CSS-e ezt a dobozt a képernyő FELSŐ sávjára szűkíti (lásd
            //! `--beat-band`), és itt vágja el a táblát — így a rács soha nem
            //! ér bele a szöveg sávjába. Ugyanaz a fogás, amit a széles
            //! elrendezés is használ, csak ott vízszintesen. */}
        <div className="film-camera absolute inset-0" inert>
          <div className="film-lens">
            <WeekGrid />
          </div>
        </div>

        {/*//* A fátyol UGYANAZ a három réteg, maszkolva: a szöveg alatt tömör
            //* felület, a rács fölött semmi. Egy fekete árnyékoló a meleg
            //* papírt bepiszkolná — ez a megoldás minden alapszínen a saját
            //* színét teszi a szöveg alá. */}
        <div className="film-veil absolute inset-0">
          <div className="absolute inset-0 bg-primary" />
          <div className="film-cream absolute inset-0 bg-[#F3EBDD]" />
          <div className="film-ink absolute inset-0 bg-card" />
        </div>

        <div className="film-vignette pointer-events-none absolute inset-x-0 top-0 h-[100lvh]" />
      </div>

      {/*//! A SZÖVEG A SZÍNPAD FÖLÉ KERÜL, NEM ALÁ. A ragadós színpad a
          //! folyamban akkor is elfoglalja a maga 100svh-ját, ha közben
          //! odatapad a képernyő tetejére — enélkül a negatív margó nélkül a
          //! nyitócím egy teljes képernyőnyivel a hajtás alá csúszna. */}
      <div className="film-beats relative z-10 -mt-[100svh]">
        {/*//* ─── 1. Totál ─────────────────────────────────────────────── */}
        <section className="film-beat film-intro flex min-h-[92svh] items-center px-5 pt-24 pb-16 md:px-8">
          <div className="mx-auto w-full max-w-[120rem]">
            <div className="max-w-[32rem] pl-[10vw] md:max-w-[42rem] xl:max-w-[32rem]">
              <h1 className="text-[clamp(2.1rem,5vw,3.9rem)] font-bold leading-[0.98] tracking-[-0.045em] text-[oklch(0.26_0.05_248)]">
                Amire eddig vágytatok.
                <span className="mt-2 block font-script text-[clamp(2.9rem,7.4vw,5.75rem)] leading-[0.86] text-primary">
                  Már valóság
                </span>
              </h1>
              <p className="mt-8 max-w-[34ch] text-base leading-7 text-[oklch(0.26_0.05_248/0.72)] md:text-lg">
                A Jedlik órarendje, végre úgy, ahogy a heted tényleg kinéz. Ez
                itt a 13A egy B hete — görgess, és nézd meg közelebbről.
              </p>
              <Link
                href="/orarend"
                className="mt-9 inline-flex items-center rounded-full bg-primary px-6 py-3.5 text-sm font-semibold text-ink-on-primary shadow-[0_12px_32px_-14px_oklch(0.45_0.16_245/0.85)] transition-transform hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[oklch(0.35_0.09_248)] motion-reduce:transition-none"
              >
                Nyisd meg az órarendet
              </Link>
            </div>
          </div>
        </section>

        {/*//* ─── 2. Csoportbontás ─────────────────────────────────────── */}
        <section
          id="csoportbontas"
          className="film-beat flex min-h-[92svh] items-center px-5 py-16 md:px-8"
        >
          <div className="mx-auto w-full max-w-[120rem]">
            <Panel className="max-w-[34rem]">
              <h2 className="text-[clamp(1.9rem,4vw,3rem)] font-semibold leading-[1.02] tracking-[-0.04em] text-white">
                Csak azt látod, amit szeretnél
              </h2>
              <p className="mt-5 max-w-[46ch] text-[15px] leading-7 text-white/70">
                Konfiguráld a saját csoportbontásodat, és rejtsd el azokat az órákat, amire nem jársz. 
              </p>
              <Readout>
                <Row term="Ütköző sáv">Hétfő, {slot(SPLIT_MINE)}</Row>
                <Row term="A te csoportod">{named(SPLIT_MINE)}</Row>
                <Row term="Elrejtve">{named(SPLIT_OTHER)}</Row>
              </Readout>
            </Panel>
          </div>
        </section>

        {/*//* ─── 3. Duális képzés ─────────────────────────────────────── */}
        <section
          id="dualis"
          className="film-beat flex min-h-[92svh] items-center px-5 py-16 md:px-8"
        >
          <div className="mx-auto w-full max-w-[120rem]">
            <Panel className="max-w-[33rem]">
              <h2 className="text-[clamp(1.9rem,4vw,3rem)] font-semibold leading-[1.02] tracking-[-0.04em] text-white">
                Duális képzésre jársz?
              </h2>
              <p className="mt-5 max-w-[44ch] text-[15px] leading-7 text-white/70">
                A hét A/B jelöléséből következik, mikor vagy iskolában és mikor
                a munkahelyen.
              </p>
              <Readout>
                <Row term="Ez a hét">B</Row>
                <Row term="Hétfő-kedd">Iskola</Row>
                <Row term="Szerda-péntek">Duális, 08:00-15:00</Row>
              </Readout>
            </Panel>
          </div>
        </section>

        {/*//* ─── 4. Progresszív mód ───────────────────────────────────── */}
        <section
          id="progressziv"
          className="film-beat flex min-h-[92svh] items-center px-5 py-16 md:px-8"
        >
          <div className="mx-auto w-full max-w-[120rem]">
            <Panel className="max-w-[33rem]">
              <h2 className="text-[clamp(1.9rem,4vw,3rem)] font-semibold leading-[1.02] tracking-[-0.04em] text-white">
                Progresszív mód
              </h2>
              <p className="mt-5 max-w-[46ch] text-[15px] leading-7 text-white/70">
                A progresszív mód egy képernyőre húzza a napot: mi megy éppen,
                mennyi van hátra belőle, és melyik terem következik.
              </p>
              <Readout>
                <Row term="Most">{named(NOW_EVENT)}</Row>
                <Row term="Vége">{minLabel(NOW_EVENT.endMin)}</Row>
                <Row term="Utána">
                  {NEXT_EVENT.full} · {minLabel(NEXT_EVENT.startMin)}
                </Row>
              </Readout>
            </Panel>
          </div>
        </section>

        <div className="h-[46svh]" aria-hidden />
      </div>

      <style>{`
        @property --cam-scale { syntax: "<number>"; inherits: true; initial-value: 0.7; }
        @property --cam-x { syntax: "<number>"; inherits: true; initial-value: 0; }
        @property --cam-y { syntax: "<number>"; inherits: true; initial-value: 40; }
        @property --cam-tilt { syntax: "<number>"; inherits: true; initial-value: 15; }
        @property --cam-detail { syntax: "<number>"; inherits: true; initial-value: 0; }
        @property --cam-split { syntax: "<number>"; inherits: true; initial-value: 0; }
        @property --cam-now { syntax: "<number>"; inherits: true; initial-value: 0; }
        @property --f-cream { syntax: "<number>"; inherits: true; initial-value: 1; }
        @property --f-ink { syntax: "<number>"; inherits: true; initial-value: 0; }
        @property --f-intro { syntax: "<number>"; inherits: true; initial-value: 1; }

        .film {
          /*//* A tábla képpontos szélessége 1240 — a --cam-fit ezt igazítja a
              //* kijelzőhöz, a kameraállások nagyítása pedig erre szorzódik.
              //! TELEFONON A FIT A KIJELZŐ SZÉLESSÉGÉBŐL JÖN, HÁROM LÉPCSŐBEN.
              //! Egyetlen érték nem elég: 0,27 mellett a totál 328 képpont, ami
              //! 375-ön pontosan jó, egy 320 képpontos kijelzőn viszont
              //! szélről szélig ér (a lemez pereme is levágódik), egy 430-ason
              //! pedig félénken lebeg. A lépcsők a totál KÉPERNYŐN MÉRT
              //! szélességét tartják nagyjából 87%-on, és mivel a közelik erre
              //! szorzódnak, a nagyobb telefon nagyobb kártyákat is kap. */
          --cam-fit: 0.235;
          --stage-oy: 0svh;

          /*//! A SZÖVEG SÁVJA NÉVVEL BÍR, MERT A KAMERA IS OLVASSA. Telefonon a
              //! képernyő alsó sávja a szövegé, a fölötte maradó rész a kameráé
              //! — a kettő NEM úszik egymásba. A méret a műszerlap tényleges
              //! magasságából jön (a leghosszabb, a csoportbontásé 382 képpont
              //! 375-ön mérve), nem a képernyő arányából: így magas
              //! telefonon a többlet mind a tábláé lesz, alacsonyon pedig a
              //! szöveg kap elsőbbséget. */
          --beat-band: min(25.5rem, 58svh);
        }

        .film-cream { opacity: var(--f-cream); }
        .film-ink { opacity: var(--f-ink); }

        /*//! A LENCSE ABSZOLÚT ÁLL, NEM RÁCSKÖZÉPEN. A tábla 920 képpont széles;
            //! telefonon ez SZÉLESEBB, mint a képernyő, és a rács-igazítás az
            //! ilyen elemet a spec szerint a kezdőélhez csapja („safe" túlcsordulás),
            //! nem középre — a nagyítás onnantól egy 460 képponttal jobbra
            //! csúszott középpont körül történt, és a tábla kilógott a képből.
            //! A saját 50%/50% + fél táblányi visszatolás ettől független. */
        .film-lens {
          position: absolute;
          left: 50%;
          top: 50%;
          transform:
            translate(-50%, -50%)
            translate3d(0, var(--stage-oy), 0)
            perspective(1600px)
            rotateX(calc(var(--cam-tilt) * 1deg))
            scale(calc(var(--cam-fit) * var(--cam-scale)))
            translate3d(calc(var(--cam-x) * 1px), calc(var(--cam-y) * 1px), 0);
          transform-origin: 50% 50%;
          will-change: transform;
        }

        /*//! A KAMERA ABLAKA TELEFONON A FELSŐ SÁV. Korábban a rács a teljes
            //! képernyőt kapta, a magyarázó szakaszok pedig RÁÜLTEK: a
            //! csoportbontás közelijéből — a lap legfontosabb képéből — a
            //! 375x812-es kijelzőn semmi nem látszott, mert a műszerlap a
            //! képernyő 65%-át elfoglalta. Az ablak szűkítése ugyanaz a fogás,
            //! amit a széles elrendezés használ („left: 36%”), csak itt
            //! vízszintes osztás helyett vízszintes VÁGÁS.
            //*
            //! ÉS A VÁGÁS LÁGY. Egy éles alsó él úgy nézne ki, mintha a táblát
            //! elharapná valami; a maszk ehelyett az alapszínbe olvasztja —
            //! a rács a szöveg alá csúszik, nem elé. */
        .film-camera {
          bottom: var(--beat-band);
          overflow: hidden;
          -webkit-mask-image: linear-gradient(180deg, #000 0%, #000 84%, transparent 100%);
          mask-image: linear-gradient(180deg, #000 0%, #000 84%, transparent 100%);
          -webkit-mask-repeat: no-repeat;
          mask-repeat: no-repeat;
        }

        /*//* A rács „magyarázó" rétegei — idősáv, napfejek, vonalak — csak a
            //* közelítéssel jönnek be. Totálban a hét SZÍNMEZŐ, nem táblázat. */
        .film .wg-detail { opacity: var(--cam-detail); }

        /*//! A CSOPORTBONTÁS FELOLDÁSA — A HÉT MINDEN SÁVJÁN EGYSZERRE. A valódi
            //! 13A-héten a hétfő-kedd minden órája bontott, tehát a nyers rács
            //! végig két fél oszlop. A --cam-split a döntés pillanata: a diák
            //! csoportjának órái kinyílnak a teljes sávra, a másik csoportéi
            //! visszahúzódnak. Ez a rács VALÓDI viselkedése, nem külön animáció
            //! róla. */
        .wg-half-mine {
          left: 0;
          width: calc(50% + 50% * var(--cam-split));
          z-index: 2;
        }
        .wg-half-other {
          left: 50%;
          width: 50%;
          opacity: calc(1 - 0.82 * var(--cam-split));
          transform: scale(calc(1 - 0.06 * var(--cam-split)));
          transform-origin: 100% 50%;
        }

        .wg-now-ring,
        .wg-now-line { opacity: var(--cam-now); }

        /*//! TELEFONON NINCS FÁTYOL — MERT NINCS MIT VÉDENI. A fátyol arra
            //! való volt, hogy a rács fölé kerülő szöveg alá tömör felületet
            //! tegyen. A sávos elrendezésben a kettő nem fedi egymást, a maszk
            //! viszont a tábla alsó harmadát MOSTA KI, épp ott, ahol a
            //! csoportbontás közelijében a két fél kártya áll. A táblasávon
            //! (48–80rem) marad, mert ott a szöveg tényleg a rácson ül. */
        .film-veil {
          display: none;
          /*//* A töréspontok a táblás elrendezésből jönnek: a tábla a kép
              //* felső ~42%-át foglalja, a szöveg az 50% alatti részt. A fátyol
              //* ezért 40%-ig teljesen átlátszó — különben pont a táblát mosná ki. */
          -webkit-mask-image: linear-gradient(180deg, transparent 0%, transparent 38%, rgba(0,0,0,0.9) 48%, #000 56%);
          mask-image: linear-gradient(180deg, transparent 0%, transparent 38%, rgba(0,0,0,0.9) 48%, #000 56%);
        }

        /*//! A PEREMSÖTÉTÍTÉS CSAK A SÖTÉT ALAPOKÉ. Fekete színátmenet a meleg
            //! papíron nem mélységet ad, hanem KOSZT: a nyitókép alsó harmada
            //! szürkésre fakult tőle. Az --f-ink-hez kötve pontosan ott
            //! kapcsol be, ahol dolga van — az alkalmazás éjszakai felületén. */
        .film-vignette {
          opacity: var(--f-ink);
          background:
            radial-gradient(120% 80% at 50% 12%, transparent 45%, oklch(0 0 0 / 0.28) 100%);
        }

        /*//* A nyitószakasz szövege a meleg papírhoz tartozik: ahogy az alap
            //* kobaltra vált, a szöveg kimegy vele együtt, nem marad rajta. */
        .film-intro { opacity: var(--f-intro); }

        /*//* Telefonon a tábla a kép felső sávjában ül, a szöveg pedig alul —
            //* ezért a szakaszok tartalma az aljához igazodik, nem a közepéhez.
            //* Széles kijelzőn a kettő két hasábban áll, ott a közép a helyes. */
        .film-beat {
          align-items: flex-end;
          /*//* A műszerlap a sáv aljára ül, a kivágott kijelzők alsó
              //* biztonsági zónáján kívül. */
          padding-bottom: max(1.75rem, calc(env(safe-area-inset-bottom) + 1rem));
          padding-left: max(1.25rem, env(safe-area-inset-left));
          padding-right: max(1.25rem, env(safe-area-inset-right));
        }

        /*//! ─── A MŰSZERLAP TELEFONOS SŰRŰSÉGE ────────────────────────────
            //! Minden képpont, amit a szöveg elvesz, a tábláé lett volna. A
            //! szöveg ezért NEM rövidül — a tények ugyanazok maradnak —, csak
            //! a sorköz, a betűméret és a bélés enged annyit, hogy a
            //! leghosszabb szakasz (a csoportbontás) is a saját sávjában
            //! maradjon: 528 képpontról ~350-re.
            //*
            //! ÉS EZ SZÉLESSÉG HELYETT A KAMERA FELTÉTELÉHEZ KÖTŐDIK. Fekvő
            //! telefonon a kijelző SZÉLES, de alacsony — a Tailwind „md:”
            //! szerint ott a nagy betűk jönnének, és a műszerlap kilógna a
            //! képernyőből. Ugyanaz a lekérdezés vezérli, mint a kamerasort. */
        @media (min-width: 23rem) { .film { --cam-fit: 0.27; } }
        @media (min-width: 25.5rem) { .film { --cam-fit: 0.305; } }

        @media (max-width: 47.99rem), (max-height: 34rem) {
          /*//! A NYITÓKÉPNEK NINCS MŰSZERLAPJA, TEHÁT NEKI KELL BEFÉRNIE. A
              //! többi szakasz szövege saját, tömör lemezen ül: ha az egy
              //! kicsit a tábla alá lóg, a lemez eltakarja. A nyitócím
              //! viszont csupasz betű a meleg papíron — ott egy átfedés a
              //! rácsra írt sötét szöveg lenne. A méret ezért a sávhoz van
              //! szabva, nem fordítva; a felső határ 320-tól 767-ig tartja a
              //! címet a szöveg sávjában. */
          .film-intro h1 { font-size: clamp(1.75rem, 9vw, 2.35rem); }
          .film-intro h1 span { font-size: clamp(2.4rem, 12.4vw, 3.25rem); }
          .film-intro p {
            margin-top: 1.5rem;
            font-size: 15px;
            line-height: 1.6;
          }
          .film-intro a { margin-top: 1.75rem; }

          .film-panel {
            padding: 1.25rem;
            /*//! HÁTTÉRELMOSÁS NÉLKÜL. A „backdrop-filter” a mögötte MOZGÓ
                //! rácsot minden képkockán újramintázza; telefonon ez pont a
                //! görgetés alatt esik szét. A lemez helyette tömörebb lesz —
                //! a szöveg kontrasztja nő, a költség eltűnik. */
            backdrop-filter: none;
            -webkit-backdrop-filter: none;
            background-color: oklch(0.155 0.012 250 / 0.94);
          }
          .film-panel h2 {
            font-size: 1.45rem;
            line-height: 1.08;
            letter-spacing: -0.035em;
          }
          .film-panel p {
            margin-top: 0.875rem;
            font-size: 13px;
            line-height: 1.5;
          }
          .film-readout {
            margin-top: 1rem;
            font-size: 12.5px;
          }
          .film-readout > div {
            gap: 0.75rem;
            padding: 0.5rem 0.75rem;
          }
        }

        /*//! A TÁBLETSÁV MÉG NEM KÉT HASÁB, DE MÁR NAGY KÉPERNYŐ. 1024x768-on
            //! mérve: a szöveghasáb alulról 360 képpontot kér, tehát a tábla
            //! alja legfeljebb 330-ig érhet — a -15svh eltolás mellett 400-ig
            //! ért, és a nyitócím RAJTA feküdt. A -25svh ezt felviszi, a
            //! kisebb nagyítás pedig helyet hagy a fátyol lágy pereme alatt. */
        @media (min-width: 48rem) {
          .film {
            --cam-fit: 0.60;
            --stage-oy: -25svh;
          }
          /*//* Táblasávtól fölfelé a rács visszakapja az egész színpadot, és a
              //* szöveget megint a fátyol választja el tőle. */
          .film-camera {
            bottom: 0;
            -webkit-mask-image: none;
            mask-image: none;
          }
          .film-veil { display: block; }
          .film-beat { padding-bottom: 9svh; }
        }

        /*//! A KÉT HASÁB CSAK 1280 KÉPPONT FÖLÖTT NYÍLIK KI. Mérve: a hasáb 32
            //! rem-nyi szöveg plusz margó, a tábla a nyitóképen ~580 képpont —
            //! a kettő 1200 alatt egyszerűen nem fér el egymás mellett. 64
            //! rem-nél a tábla RÁCSÚSZOTT a nyitócímre (1024 px-en mérve), és
            //! ott már a fátyol sem védte, mert azt ugyanez a töréspont
            //! kapcsolta ki. 1280 alatt ezért marad a telefonos rend: tábla
            //! fent, szöveg lent.
            //*
            //! ÉS NEM ELTOLJUK A TÁBLÁT, HANEM SZŰKÍTJÜK A SZÍNPADOT. A kamera
            //! ablaka a képernyő jobb oldali sávja lesz; a tábla ezen belül
            //! marad középen, minden kameraállásban. Egy vw-ben megadott
            //! eltolás ehelyett minden nagyításnál másképp csúszott volna el. */
        @media (min-width: 80rem) {
          .film {
            --cam-fit: 0.71;
            --stage-oy: 0svh;
          }
          .film-camera {
            left: 36%;
          }
          .film-beat {
            align-items: center;
            padding-bottom: 0;
          }
          /*//! SZÉLES KIJELZŐN NINCS FÁTYOL. A hasáb és a tábla két külön
              //! sávban áll, a magyarázó szakaszok pedig saját műszerlapon
              //! ülnek — a fátyol itt nem védene semmit, viszont a tábla bal
              //! harmadát MOSTA KI: a hétfő és a kedd oszlopa halványabb volt,
              //! mint a többi, pontosan azon a két kameraállason, ahol számít. */
          .film-veil { display: none; }
        }

        @media (min-width: 100rem) {
          .film { --cam-fit: 0.82; }
          .film-camera { left: 34%; }
        }

        /*//! KIS TELEFONON MÉG EGY FOKOZAT. 320×640-en a sáv 371 képpont, a
            //! csoportbontás műszerlapja viszont 421 — vagyis a szakasz
            //! szövege a kamera ablakának közel harmadát elvenné, épp azon a
            //! képen, amiért a lap egyáltalán közelít. Ez a fokozat még egy
            //! lépést enged a sorközön és a bélésen, a TÉNYEKHEZ továbbra sem
            //! nyúlva. A második feltétel a fekvő telefoné: ott ugyanez a
            //! szűkösség áll fenn, csak nem a szélesség árulja el. */
        @media (max-width: 47.99rem) and (max-height: 44rem), (max-height: 34rem) {
          .film-panel { padding: 1rem; }
          .film-panel h2 { font-size: 1.3rem; }
          .film-panel p {
            margin-top: 0.75rem;
            font-size: 12.5px;
            line-height: 1.45;
          }
          .film-readout {
            margin-top: 0.75rem;
            font-size: 12px;
          }
          .film-readout > div { padding: 0.4375rem 0.625rem; }
        }

        /*//! FEKVŐ TELEFON: SZÉLES, DE ALACSONY. Itt a szélesség-alapú
            //! töréspontok mind a nagy elrendezést hoznák — 844×390-en viszont
            //! a képernyő MAGASSÁGA a szűk erőforrás, és egy alul-fölül osztás
            //! mindkét félnek 195 képpontot adna. Amiből van, az a szélesség:
            //! a lap ilyenkor a széles elrendezés két hasábjára vált (szöveg
            //! balra, kamera jobbra), de a telefon kamerasorát tartja meg,
            //! mert a kamera ablaka itt is kicsi. */
        @media (min-width: 48rem) and (max-height: 34rem) {
          .film {
            --cam-fit: 0.30;
            --stage-oy: 0svh;
          }
          .film-camera {
            left: 44%;
            bottom: 0;
          }
          .film-beat {
            align-items: center;
            padding-bottom: max(0.75rem, env(safe-area-inset-bottom));
          }
          .film-panel { max-width: min(100%, 25rem); }
          .film-veil { display: none; }
        }

        /*//! CSÖKKENTETT MOZGÁS: A KAMERA ÁLL, A SZÍN NEM. A hajtás ilyenkor a
            //! STILL kameraállást írja — nincs nagyítás, nincs pásztázás —, az
            //! alap színváltása és a nyitószöveg elhalványodása viszont MEGMARAD:
            //! az nem térbeli mozgás, viszont enélkül a nyitószöveg sötét betűi
            //! a sötét alapon maradnának. */
      `}</style>
    </div>
  );
}
