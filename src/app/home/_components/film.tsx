"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { minLabel, rangeLabel } from "@/components/timetable/shared";
import { Iphone } from "@/components/ui/iphone";
import {
  AXIS_W,
  BOARD_H,
  BOARD_W,
  COL_W,
  colCenter,
  colLeft,
  DAY_END_MIN,
  DAY_START_MIN,
  DUAL_END_MIN,
  DUAL_START_MIN,
  heightOf,
  NEXT_EVENT,
  NOW_EVENT,
  NOW_MIN,
  PERIODS,
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
  //! AZ ÁTADÁS KÉT CSATORNÁJA. A `hand` a kamera ABLAKÁT zárja le a telefon
  //! kijelzőjének téglalapjára (mértan), a `shot` pedig a valódi felvételt
  //! úsztatja a helyére (áttetszőség). Azért kettő, mert a kettő nem ugyanaz
  //! a fajta mozgás: csökkentett mozgás mellett a `hand` végig 0 marad, a
  //! `shot` viszont ott is fut — egy áttetszőség senkinek nem szédül.
  hand: number;
  shot: number;
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
  //! AZ ÁTADÁS NAGYÍTÁSÁT NEM ÍRJUK BE, HANEM MÉRJÜK. A kamera akkor adja át
  //! a képet a készüléknek, ha a kivágás PONTOSAN a telefon kijelzőjének
  //! téglalapja — vagyis a nagyításnak a kijelző tényleges képpontos
  //! szélességéből kell következnie, amit viszont a lap CSS-e szab meg
  //! (töréspontonként más). Egy beírt szám itt minden töréspont fölött
  //! elcsúszna, és a tábla vagy kilógna a kijelzőből, vagy keret maradna
  //! körülötte. A `handFit` jelöli meg azokat a pózokat, amiknek a
  //! nagyítását a `layout()` a mért kijelzőből számolja.
  handFit?: boolean;
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
  hand: 0,
  shot: 0,
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

//! ─── AZ ÁTADÁS KIVÁGÁSA: AZ IDŐSÁV ÉS A HÉTFŐ ──────────────────────────────
//! A film utolsó kameraállása nem egy közeli, hanem egy ALAKVÁLTÁS. Telefon
//! arányú ablakban az idősáv plusz EGY oszlop pontosan annyi, amennyi egy
//! napból egyszerre olvasható — vagyis a heti rács legkisebb olyan darabja,
//! ami már NAPI NÉZETKÉNT áll össze. A progresszív módot ezért nem
//! elmagyarázzuk: a tábla fölveszi az alakját.
//*
//! A SZÉLESSÉG NEM VÁLASZTOTT SZÁM. Az idősáv és egy oszlop — ha a rács
//! mértéke változik, a kivágás magától követi.
const HAND_SPAN = AXIS_W + COL_W;
//* Az egész magasságot mutatja: a nap eleje és vége egyszerre van a képen.
const HAND_CAM = centerOn(HAND_SPAN / 2, BOARD_H / 2);

//* A telefonváz kijelzőjének aránya a váz teljes szélességéhez (lásd
//* `ui/iphone.tsx`) — a mért nagyítás ezen keresztül számol.
const SCREEN_RATIO = 389.5 / 433;

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
    //* Mérve (375x812): a nyitószöveg 419 képpontnyi görgetésig hiánytalanul
    //* látszik, és 719-nél hagyja el a képernyő tetejét — a `film-transit`
    //* megnyújtott szakaszában ez az átmenet 0.32-nél kezdődik.
    narrowT: 0.32,
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
      hand: 0,
      shot: 0,
    },
    //! TELEFONON A KOBALT ITT MÉG NEM SÖTÉTEDIK. Széles kijelzőn a papír és
    //! az éjszakai felület átfedi egymást: mire a papír elfogy, az `ink` már
    //! 0.55-ön áll, és a kobalt egy áthaladó árnyalat marad. Telefonon a
    //! tábla ezután MÁSFÉL képernyőnyit nagyít, mielőtt betöltené a képet —
    //! ha az alap addigra sötét, az a másfél képernyő egy jellegtelen fekete
    //! mező. Az `ink` ezért itt még majdnem nulla: a kobalt végigkíséri a
    //! ránagyítást, és csak a csoportbontás közelijén megy át éjszakaiba.
    //*
    //* Telefonon a kiélesedés már befelé indul: a tábla két széle kicsúszik a
    //* képből, és ettől kezdve a kamera nem a hetet mutatja, hanem benne jár.
    narrow: { scale: 1.15, ink: 0.06 },
    //* És a kiélesedés vele mozdul: a papírról az alkalmazás felületére
    //* való átmenet telefonon a szakasz végén történik, nem a közepén.
    narrowT: 0.64,
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
      hand: 0,
      shot: 0,
    },
    //* A hétfői sáv telefonon a képernyő teljes szélességét megkapja: az
    //* ütköző pár két fél kártyája így ~85 képpont széles, a feliratuk pedig
    //* nagyobb, mint az `/orarend`-en. A közeli itt nem illusztráció, hanem az
    //* egyetlen mód, hogy a két kártya egyszerre legyen olvasható.
    //* Az alap itt ér át kobaltból az éjszakai felületbe — a maradék utat a
    //* csoportbontás feloldása teszi meg (a következő póz `ink`-je 1).
    narrow: { scale: 4.8, ink: 0.62 },
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
      hand: 0,
      shot: 0,
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
      hand: 0,
      shot: 0,
    },
    //! TELEFONON NEM A HÉT, HANEM A VARRAT. Öt oszlop 375 képpontban napi 75
    //! képpontot jelent: a napfejek 4 képpontosra esnének, és pont az veszne
    //! el, amit a szakasz állít — hogy MELYIK nap hová tartozik. A kamera
    //! ezért a keddre és a szerdára áll: az utolsó iskolai nap sűrű
    //! kártyaoszlopa mellett az első duális nap egyetlen blokkja. A vágott
    //! szomszédok mondják meg, hogy a hét folytatódik.
    narrow: { scale: 3.0, ...SEAM_CAM },
  },
  //! ─── AZ ÁTADÁS: A TÁBLÁBÓL KÉSZÜLÉK LESZ ─────────────────────────────────
  //! A lap eddig azt állította, hogy egyetlen tárgyat mutat négy távolságból.
  //! Ha az utolsó szakasz átvágna egy külön telefonos képre, ez az állítás
  //! pont a végén dőlne meg. Ezért NEM VÁGUNK: a kamera rááll a hétfő
  //! oszlopára, az ABLAKA összezárul a telefon kijelzőjének téglalapjára, a
  //! készülék köré rajzolódik, és csak ezután úszik a helyére a valódi
  //! felvétel. Ugyanaz a rács, ugyanaz a DOM — csak már egy kijelzőben.
  //*
  //! A HÁROM LÉPÉS NEM EGYSZERRE TÖRTÉNIK, ÉS EZ SZÁNDÉKOS. Egyben elvégezve
  //! az egész egy „átúszásnak" látszana, vagyis pont annak, ami elől
  //! kitérünk. Külön véve a szem sorra veszi: EZ egy nap → EZ egy telefon →
  //! EZ a te napod.

  //* 1. A kamera rááll a hétfőre, és felkapcsolja a futó óra jelzését.
  {
    at: 2,
    toward: 3,
    t: 0.4,
    handFit: true,
    pose: {
      //* A nagyítást a `layout()` írja felül a mért kijelzőből.
      scale: 1,
      ...HAND_CAM,
      tilt: 0,
      detail: 1,
      split: 1,
      now: 1,
      cream: 0,
      ink: 1,
      intro: 0,
      hand: 0,
      shot: 0,
    },
  },
  //* 2. Az ablak lezárul a kijelzőre, és megjelenik körülötte a készülék.
  {
    at: 2,
    toward: 3,
    t: 0.72,
    handFit: true,
    pose: {
      scale: 1,
      ...HAND_CAM,
      tilt: 0,
      detail: 1,
      split: 1,
      now: 1,
      cream: 0,
      ink: 1,
      intro: 0,
      hand: 1,
      shot: 0,
    },
  },
  //* 3. A szakasz közepén a valódi felvétel van a kijelzőn.
  {
    at: 3,
    handFit: true,
    pose: {
      scale: 1,
      ...HAND_CAM,
      tilt: 0,
      detail: 1,
      split: 1,
      now: 1,
      cream: 0,
      ink: 1,
      intro: 0,
      hand: 1,
      shot: 1,
    },
  },
  //* 4. A kifutó ugyanezt tartja: a lap a készülékkel hagyja el a filmet.
  {
    at: 4,
    handFit: true,
    pose: {
      scale: 1,
      ...HAND_CAM,
      tilt: 0,
      detail: 1,
      split: 1,
      now: 1,
      cream: 0,
      ink: 1,
      intro: 0,
      hand: 1,
      shot: 1,
    },
  },
];

//* Csökkentett mozgás mellett a kamera ÁLL. A rács a kibontott állapotában
//* marad (feloldott csoportbontás, látszó „most" jelzés), a szakaszok szövege
//* pedig magától is teljes — a mozgás itt magyarázat, nem információ.
//! ÉS AZ ÁTADÁS MÉRTANA ITT KIMARAD (`hand: 0`). Egy összezáruló ablak
//! MOZGÁS, a `shot` áttetszősége viszont nem az — a `write()` ezért a
//! `shot`-ot a görgetésből veszi, a `hand`-et pedig innen. Aki csökkentett
//! mozgást kért, a készüléket egyszerűen ELŐTŰNNI látja a tábla helyén.
const STILL: Omit<Pose, "cream" | "ink" | "intro" | "shot"> = {
  scale: 1,
  x: 0,
  y: 0,
  tilt: 0,
  detail: 1,
  split: 1,
  now: 1,
  hand: 0,
};

//! TELEFONON A MOZDULATLAN KAMERA IS MÁS. Ugyanaz az álló beállítás itt a
//! teljes hetet mutatná 0,27-es nagyításon — vagyis olvashatatlan méretű
//! feliratokat, ami félrevezetőbb, mint a semmi. Csökkentett mozgás mellett a
//! telefon ezért a totált tartja, feliratok NÉLKÜL: a tábla színmező marad, a
//! négy szakasz szövege pedig magától is teljes.
const NARROW_STILL: Omit<Pose, "cream" | "ink" | "intro" | "shot"> = {
  scale: 0.98,
  x: 0,
  y: 18,
  tilt: 0,
  detail: 0,
  split: 1,
  now: 1,
  hand: 0,
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
  "hand",
  "shot",
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

//! ─── A CSATORNÁK: MINDEN SZÁM ODA MEGY, AHOL ELOLVASSÁK ────────────────────
//! A hajtás korábban MIND A TIZENKÉT számot a film gyökerére írta, öröklődő
//! egyedi tulajdonságként — kényelmes volt, és pontosan ezért lett drága. Egy
//! öröklődő tulajdonság megváltozása a TELJES részfa stílusát újraszámoltatja,
//! a `.film` alatt viszont 314 elem áll: a rács minden kártyája és mind a négy
//! szakasz szövege. Mérve (375x812-es ablakban): egyetlen képkocka írása
//! 3,2 ms stílus-újraszámolás — holott a papír→kobalt átmenet alatt a tizenkét
//! számból csak négy változik.
//*
//! ÉS EZ NEM AKADÁS VOLT, HANEM ANNAK LÁTSZÓ ALACSONY FRISSÍTÉS. A görgetést
//! az összeállító viszi, tehát a lap simán csúszott; az alapszín viszont csak
//! akkor váltott, amikor a főszál végzett — telefonon másodpercenként húszszor
//! -harmincszor, egy 120 Hz-es kijelzőn. A tábla nem lassult le, csak a HÁTTÉR
//! járt tizedannyi képkockán, mint alatta a mozgás.
//*
//! A JAVÍTÁS NEM GYORSÍTÁS, HANEM CÍMZÉS. Minden szám annak az elemnek a saját
//! stílusába íródik, amelyik tényleg olvassa, és a `@property` mindegyiket
//! `inherits: false`-ra állítja: a változás így EGY elem stílusát érinti, nem
//! egy részfáét. Ugyanott mérve: a lencse négy száma 1,84 ms helyett 0,03, a
//! `--cam-hand` 1,93 helyett 0,055, a két alapszín-szám 2,43 helyett 0,17.
//*
//! A LISTA EGYBEN A FÜGGŐSÉGEK JEGYZÉKE IS. Ha egy új szabály fölvesz egy
//! kamera-számot, ide is be kell írnia a választóját — különben a szabály
//! némán a kezdőértéken marad. Ez a csere ára, és szándékosan látható: a
//! választók így egy helyen állnak, nem a stíluslap ezer sorában szétszórva.
type Channel = { key: keyof Pose; prop: string; sel: string };

const CHANNELS: readonly Channel[] = [
  //* A lencse pózát csak a lencse olvassa.
  { key: "scale", prop: "--cam-scale", sel: ".film-lens" },
  { key: "x", prop: "--cam-x", sel: ".film-lens" },
  { key: "y", prop: "--cam-y", sel: ".film-lens" },
  { key: "tilt", prop: "--cam-tilt", sel: ".film-lens" },
  //* A rács magyarázó rétegei: idősáv, napfejek, óravonalak.
  { key: "detail", prop: "--cam-detail", sel: ".wg-detail" },
  { key: "split", prop: "--cam-split", sel: ".wg-half-mine, .wg-half-other" },
  { key: "now", prop: "--cam-now", sel: ".wg-now-ring, .wg-now-line" },
  //* Az ablak összezárása: a kamera vágja magát, a váz ettől tűnik elő.
  { key: "hand", prop: "--cam-hand", sel: ".film-camera, .film-phone-body" },
  //* A felvétel előúszása: a váz, a benne ülő kép, és amitől a helyet kapja.
  {
    key: "shot",
    prop: "--cam-shot",
    sel: ".film-camera, .film-phone-body, .film-phone-body img, .film-veil",
  },
  //* Az alapszín három rétege — a fátyol a saját másolatait viseli.
  { key: "cream", prop: "--f-cream", sel: ".film-cream" },
  { key: "ink", prop: "--f-ink", sel: ".film-ink, .film-vignette" },
  { key: "intro", prop: "--f-intro", sel: ".film-intro" },
];

//! A VÁLTOZATLAN SZÁMOT NEM ÍRJUK KI. A tizenkét csatornából egy adott
//! szakaszban három-négy mozog; a többi ugyanazt a számot kapná képkockánként,
//! és a böngésző az azonos értékre is érvénytelenítené a stílust. A negyedik
//! tizedesjegy az a finomság, ami a legnagyobb nagyításnál (4,8-szeres) is a
//! képpont töredéke marad, tehát a kerekítés nem látszik, a kihagyás viszont
//! igen: álló görgetésnél nulla írás megy ki.
const QUANT = 1e4;

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
    //* A csatornák célelemei egyszer keresődnek ki, és az elrendezés
    //* újramérésekor frissülnek — nem képkockánként.
    let targets: HTMLElement[][] = CHANNELS.map(() => []);
    //* A legutóbb kiírt (kerekített) szám csatornánként; `NaN` = még semmi,
    //* tehát az első írás mindig kimegy.
    let last: number[] = CHANNELS.map(() => Number.NaN);

    //! A PÓZOK GÖRGETÉSI HELYE MÉRT ADAT. Végigmegyünk a szakaszokon, kiszedjük
    //! a KÖZÉPPONTJUK görgetési helyét, és ebből számoljuk, hol áll a kamera.
    //! Ez az egyetlen hely, ahol a lap elrendezése és a kameramozgás
    //! találkozik: ha a szakaszok magassága vagy a kifutó változik, a
    //! choreográfia magától követi.
    const layout = () => {
      const beats = film.querySelectorAll<HTMLElement>(".film-beat");
      const stage = film.querySelector<HTMLElement>(".film-stage");
      //! A CÉLELEMEK ÚJRAKERESÉSE AZ ELRENDEZÉSSEL EGYÜTT JÁR. A rács
      //! kártyái, a fátyol és a készülék töréspontonként más DOM-ot adhatnak
      //! (a `.film-veil` például telefonon `display: none`); a mért
      //! elrendezéssel együtt tehát a címzettek listája is elavulhat. A
      //! legutóbbi értékek ilyenkor nullázódnak, különben egy frissen
      //! megtalált elem a kezdőértékén maradna, amíg a szám legközelebb
      //! magától meg nem változik.
      targets = CHANNELS.map((c) => [
        ...film.querySelectorAll<HTMLElement>(c.sel),
      ]);
      last = CHANNELS.map(() => Number.NaN);
      const filmTop = film.getBoundingClientRect().top + window.scrollY;
      narrow = narrowQuery.matches;
      //! A KÉPERNYŐ MAGASSÁGA ITT A SZÍNPADÉ, NEM A `window.innerHeight`-É.
      //! Telefonon a görgetéssel visszahúzódó címsor alatt az `innerHeight`
      //! menet közben ~60-80 képponttal megnő — a lap elrendezése viszont
      //! `svh`-ban van, tehát MOZDULATLAN. A kettőt keverve a címsor
      //! behúzódása átméretezésnek számított: a `travel` és vele minden
      //! kameraállás görgetési helye elugrott, épp az első hüvelykmozdulat
      //! alatt, vagyis pontosan a papír→kobalt átmenet közben. Ez volt az a
      //! „kattanás", amit a széles kijelző soha nem mutatott. A ragadós
      //! színpad `100svh` magas, tehát ugyanabban a mértékben él, mint a
      //! szakaszok — belőle mérve a choreográfia a címsortól függetlenül áll.
      const view = stage?.offsetHeight || window.innerHeight;
      travel = film.offsetHeight - view;

      //! AZ ÁTADÁS NAGYÍTÁSA ITT SZÜLETIK MEG, A MÉRT KÉSZÜLÉKBŐL. A film
      //! utolsó állásában a kamera ablaka a telefon kijelzőjének téglalapja
      //! lesz — ez csak akkor illeszkedik hézag nélkül, ha a tábla `HAND_SPAN`
      //! széles darabja PONT annyi képpont, amennyi a kijelző. A készülék
      //! méretét a lap CSS-e szabja (töréspontonként, a kamera ablakának
      //! magasságából), a nagyítás tehát KÖVETKEZMÉNY, nem beállítás.
      //* A `--cam-fit` a tábla alap-illesztése; a póz nagyítása erre szorzódik,
      //* ezért itt ki kell osztani vele.
      const phone = film.querySelector<HTMLElement>(".film-phone-body");
      const camFit =
        Number.parseFloat(
          getComputedStyle(film).getPropertyValue("--cam-fit"),
        ) || 1;
      const screenW = (phone?.offsetWidth ?? 0) * SCREEN_RATIO;
      const handScale = screenW > 0 ? screenW / (HAND_SPAN * camFit) : 1;
      if (travel <= 0 || beats.length === 0) {
        stops = [];
        return;
      }
      //* A szakasz közepe akkor van a képernyő közepén, amikor idáig görgettünk.
      const center = (i: number) => {
        const b = beats[Math.min(i, beats.length - 1)];
        const top = b.getBoundingClientRect().top + window.scrollY - filmTop;
        return clamp01((top + b.offsetHeight / 2 - view / 2) / travel);
      };
      stops = KEYFRAMES.map((k) => {
        const from = center(k.at);
        //* A keskeny kamerasornak saját időzítése is lehet: lásd `narrowT`.
        const t = (narrow ? (k.narrowT ?? k.t) : k.t) ?? 0.5;
        const p =
          k.toward === undefined ? from : from + (center(k.toward) - from) * t;
        const base = narrow && k.narrow ? { ...k.pose, ...k.narrow } : k.pose;
        return {
          p,
          pose: k.handFit ? { ...base, scale: handScale } : base,
        };
      })
        //* Egy soha nem növekvő sorozat a mintavételt megzavarná; a szakaszok
        //* sorrendje adja a monotonitást, a `sort` csak biztosítja.
        .sort((a, b) => a.p - b.p);
    };

    const write = (pose: Pose, still: boolean) => {
      //! A SZÍN ÉS A NYITÓSZÖVEG AKKOR IS A GÖRGETÉST KÖVETI, HA A KAMERA ÁLL —
      //! és ezt nem külön ág mondja ki, hanem a `STILL` ALAKJA. Az álló
      //! beállítás a `cream`/`ink`/`intro`/`shot` kulcsokat nem is tartalmazza
      //! (lásd `Omit<Pose, …>`), tehát a szétterítés után ezek a póz saját,
      //! görgetésből számolt értékei maradnak. Egyik sem térbeli mozgás,
      //! viszont nélkülük a sötét nyitócím a sötét alapon maradna.
      const cam = still
        ? { ...pose, ...(narrow ? NARROW_STILL : STILL) }
        : pose;
      for (let i = 0; i < CHANNELS.length; i++) {
        const v = Math.round(cam[CHANNELS[i].key] * QUANT) / QUANT;
        if (v === last[i]) continue;
        last[i] = v;
        const text = `${v}`;
        const prop = CHANNELS[i].prop;
        for (const el of targets[i]) el.style.setProperty(prop, text);
      }
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

//! ─── A GÖRGETÉSJELZŐ A CSENGETÉSI REND ──────────────────────────
//! A jel nem ÚJ tárgy a lapon, hanem a TÁBLA IDŐSÁVJA, elforgatva a hasáb
//! aljára. A sín a nap ábrázolt sávja (`DAY_START_MIN`–`DAY_END_MIN`), a
//! rovátkák pedig a `PERIODS` VALÓDI percei — ugyanaz a tömb, amiből a rács az
//! óravonalait húzza (`week-grid.tsx`). Ezért nem egyenletesek: a 3. és a 4.
//! óra után tizenöt perc szünet van, a többi után tíz. A sín alján pedig
//! marad egy szakasz rovátka nélkül: az az utolsó óra hossza — a nap nem az
//! utolsó becsengetéssel ér véget. Egy szabályos létra ezt nem tudná
//! kimondani.
//*
//! ÉS EZÉRT NINCS RAJTA SZÁM. Nyolc sorszám nyolcvan képponton nyolc olvashatatlan
//! pöttyöt adna, a kontrasztszabályt pedig megbukná. A jelentést a rovátkák
//! RITMUSA hordozza, nem egy felirat.
const DAY_SPAN = DAY_END_MIN - DAY_START_MIN;

//* Egy perc helye a sínen, arányosan — pontosan az a számítás, amit a tábla a
//* `topOf()`-fal képpontban végez.
const railAt = (min: number) => (min - DAY_START_MIN) / DAY_SPAN;

//! A JELÖLŐ A RÁCS „MOST" VONALA, NEM EGY ÚJ JEL. Egy pont, mellette egy
//! hajszálvonal — szó szerint az, amit a `week-grid.tsx` húz az aktuális
//! percnél. A különbség a SZÍNE: a rácson az a vonal `--brand` piros, mert ott
//! egy VALÓDI perc áll alatta; itt egy nyitóképi díszjel, és a piros ebben a
//! lapban kizárólag élő és cselekvő szerepben szólal meg (lásd
//! `globals.css`: `--brand`). A jelölő ezért a lap MÁSIK színét viseli, a
//! kobaltot — azt, amivé a film a következő mozdulatnál amúgy is válik.
function BellRail() {
  return (
    <span className="film-scroll-day">
      <span className="film-scroll-spine" />
      {PERIODS.map((p) => (
        <span
          key={p.n}
          className="film-scroll-bell"
          style={{ top: `${railAt(p.start) * 100}%` }}
        />
      ))}
    </span>
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
        <div className="film-camera film-frame absolute inset-0" inert>
          <div className="film-lens antialiased ">
            <WeekGrid />
          </div>
        </div>

        {/*//! A KÉSZÜLÉK A KAMERA ABLAKÁVAL KONCENTRIKUS — EZ AZ EGÉSZ TRÜKK.
            //! A váz ugyanazt a keretet (`film-frame`) és ugyanazt a
            //! középpont-eltolást (`--stage-oy`) kapja, mint a lencse, tehát a
            //! kijelzője PONT ott van, ahová a kamera ablaka összezárul. Így a
            //! lezáráshoz nem kell mérni és képpontokat írni: a `clip-path`
            //! ugyanabból a néhány CSS-változóból számol, amiből a váz mérete.
            //*
            //! ÉS EZÉRT VAN A KAMERÁN KÍVÜL. A `film-camera` maga vágódik le —
            //! ami benne van, azt a vágás magával vinné. A vázat tehát nem
            //! tartalmazza, hanem TAKARJA: a kijelző lyuka alatt a levágott
            //! tábla látszik, körülötte a készülék.
            //*
            //* Díszréteg: a felvétel `alt=""`-tal jön, a szakasz tényeit a
            //* műszerlap mondja ki mellette. */}
        <div className="film-phone film-frame absolute inset-0" aria-hidden>
          <Iphone src="/progressive.png" className="film-phone-body" />
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

        <div className="film-vignette  pointer-events-none absolute inset-x-0 top-0 h-[100lvh]" />
      </div>

      {/*//! A SZÖVEG A SZÍNPAD FÖLÉ KERÜL, NEM ALÁ. A ragadós színpad a
          //! folyamban akkor is elfoglalja a maga 100svh-ját, ha közben
          //! odatapad a képernyő tetejére — enélkül a negatív margó nélkül a
          //! nyitócím egy teljes képernyőnyivel a hajtás alá csúszna. */}
      <div className="film-beats relative z-10 -mt-[100svh]">
        {/*//* ─── 1. Totál ─────────────────────────────────────────────── */}
        <section className="film-beat film-intro flex min-h-[92svh] items-center px-5 pt-24 pb-16 md:px-8">
          {/*//* A 10vw behúzás a KÜLSŐ hasábon van, a belső pedig `relative`:
              //* így a görgetésjelző abszolút helyzetben is pontosan a szöveg
              //* bal élén áll, egyetlen megismételt méret nélkül. */}
          <div className="mx-auto w-full max-w-[120rem] pl-[10vw]">
            <div className="relative max-w-[32rem] md:max-w-[42rem] xl:max-w-[32rem]">
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

              {/*//! ─── A GÖRGETÉSJELZŐ ────────────────────────────────────
                  //! A lap MINDENE a görgetés: a négy szakasz szövege egy
                  //! mozgó kamerát magyaráz, és aki a nyitóképen megáll, nem
                  //! egy rövidebb lapot lát, hanem egyetlen mozdulatlan
                  //! rácsot. A szöveg ki is mondja („görgess"), de a szó
                  //! elolvasása maga is döntés — a jelnek előbb kell ott
                  //! lennie, mint a mondatnak.
                  //*
                  //! ÉS NEM NYÍL, HANEM A NAP. A lefelé mutató pipa a
                  //! kategória alapértelmezése, és semmit nem mond arról,
                  //! hogy ez a lap hol tart. A rács SAJÁT jelrendszere
                  //! viszont készen áll: egy idősáv, rajta a csengetés
                  //! rovátkáival, és egy pont, ami az aktuális percet jelöli
                  //! (lásd a „most" vonalat a `week-grid.tsx`-ben). A jelző
                  //! ugyanez a sáv, a hasáb aljára forgatva: a pont VÉGIGMEGY
                  //! a tanítási napon, és amit maga mögött hagy, az kiszínesedik.
                  //! A lap a saját nyelvén mondja meg, merre megy — és
                  //! ugyanazzal a mozdulattal azt is, hogy MI van odalent.
                  //*
                  //! A KÉT RÉTEG UGYANAZ A SÁV, KÉTSZER. Alul a halvány, meg
                  //! nem történt nap; fölötte ugyanaz kobalt színben,
                  //! `clip-path`-tal levágva a jelölő MAGASSÁGÁIG. Így a
                  //! rovátkák egyesével gyulladnak ki, ahogy a pont elhalad
                  //! fölöttük — egyetlen elem vágásából, képkockánkénti
                  //! JavaScript nélkül.
                  //*
                  //* Díszjel: a mondanivalót a bekezdés hordozza, ez csak az
                  //* irányt adja. */}
              <div
                className="film-scroll"
                aria-hidden
                //* A csökkentett mozgás állóképe is mért adat: lásd lentebb.
                style={{ "--now-f": railAt(NOW_MIN) } as React.CSSProperties}
              >
                <span className="film-scroll-rail">
                  <BellRail />
                  <span className="film-scroll-lit">
                    <BellRail />
                  </span>
                  <span className="film-scroll-now" />
                </span>
              </div>
            </div>
          </div>
        </section>

        {/*//! A NÉMA ÁTMENET SAJÁT GÖRGETÉSI SÁVOT KAP — TELEFONON. A nyitókép
            //! és a csoportbontás között történik a lap legtöbb dolga: a meleg
            //! papír kobaltra vált, a rács kiélesedik, és a kamera 1,15-ről
            //! 4,8-re nagyít. Széles kijelzőn erre 747 képpontnyi görgetés jut
            //! — bőven. Telefonon ugyanennyi, csakhogy ott egyetlen
            //! hüvelykmozdulat 800-2000 képpont: az egész átmenet egy
            //! szemvillanás alatt lefut, és nem lassúnak, hanem KAPCSOLÓNAK
            //! látszik. Ez az üres sáv nem szünet, hanem a némajáték helye:
            //! a szakasz csak addig tart tovább, amíg a szem követni tudja.
            //*
            //! MIÉRT NEM A NYITÓSZAKASZ MAGASABB? Mert telefonon a szakaszok
            //! tartalma az ALJUKHOZ igazodik (lásd `.film-beat`): egy
            //! magasabb nyitószakasz a címet a hajtás alá vinné. A hely a
            //! szöveg UTÁN kell, nem alatta. */}
        <div className="film-transit" aria-hidden />

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
        {/*//! A LAP UTOLSÓ SZAKASZA NEM A MÓDRÓL BESZÉL, HANEM MUTATJA. A
            //! kamera ekkorra már készülékké zárta a táblát, a kijelzőn a
            //! valódi felvétel áll — a szöveg dolga ezért nem a magyarázat,
            //! hanem a MEGNEVEZÉS: mi az, amit a látogató épp néz. */}
        <section
          id="progressziv"
          className="film-beat flex min-h-[92svh] items-center px-5 py-16 md:px-8"
        >
          <div className="mx-auto w-full max-w-[120rem]">
            <Panel className="max-w-[33rem]">
              <h2 className="text-[clamp(1.9rem,4vw,3rem)] font-semibold leading-[1.02] tracking-[-0.04em] text-white">
                Mindig tudod, mi megy éppen.
              </h2>
              <p className="mt-5 max-w-[46ch] text-[15px] leading-7 text-white/70">
                A progresszív mód a futó órát mutatja: mennyi van hátra belőle,
                és melyik terem következik.
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

        {/*//! A KIFUTÓ MOST SZAKASZ, NEM ÜRES HELY. Eddig egy néma távtartó
            //! volt; a kameraállások viszont a SZAKASZOK középpontjaihoz
            //! kötődnek (lásd a `KEYFRAMES` jelölését), és az átadásnak kell
            //! egy állomás, ami a kész képet TARTJA, amíg a film kigördül.
            //! Enélkül az utolsó póz a progresszív szakasz közepén állna, és a
            //! készülék a saját szövegével együtt még mozogna kifelé. */}
        <div className="film-beat film-outro" aria-hidden />
      </div>

      <style>{`
        /*//! MIND A TIZENKETTŐ ÖRÖKÍTHETETLEN, ÉS EZ A LAP LEGOLCSÓBB SORA.
            //! Öröklődő tulajdonságként a film gyökerére írva mindegyikük a
            //! teljes, 314 elemű részfa stílusát számoltatta újra — ettől járt
            //! a háttér színváltása töredék képkockán a görgetés alatt (a
            //! számokat lásd a CHANNELS táblázat fölött). A hajtás mostantól annak az
            //! elemnek a saját stílusába ír, amelyik olvassa, tehát nincs mit
            //! örökíteni: a kezdőérték itt egyben az a kép is, amit a
            //! kiszolgálóról érkező lap script nélkül mutat. */
        @property --cam-scale { syntax: "<number>"; inherits: false; initial-value: 0.7; }
        @property --cam-x { syntax: "<number>"; inherits: false; initial-value: 0; }
        @property --cam-y { syntax: "<number>"; inherits: false; initial-value: 40; }
        @property --cam-tilt { syntax: "<number>"; inherits: false; initial-value: 15; }
        @property --cam-detail { syntax: "<number>"; inherits: false; initial-value: 0; }
        @property --cam-split { syntax: "<number>"; inherits: false; initial-value: 0; }
        @property --cam-now { syntax: "<number>"; inherits: false; initial-value: 0; }
        @property --cam-hand { syntax: "<number>"; inherits: false; initial-value: 0; }
        @property --cam-shot { syntax: "<number>"; inherits: false; initial-value: 0; }
        @property --f-cream { syntax: "<number>"; inherits: false; initial-value: 1; }
        @property --f-ink { syntax: "<number>"; inherits: false; initial-value: 0; }
        @property --f-intro { syntax: "<number>"; inherits: false; initial-value: 1; }

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

          /*//! ─── A KÉSZÜLÉK MÉRETE A KAMERA ABLAKÁBÓL KÖVETKEZIK ─────────
              //! A telefon nem kap kerek számot: a magassága a kamera ablakának
              //! MÉRT magasságából jön (--cam-h), egy felső határral. Így a
              //! sávos telefonos elrendezésben nem lóg bele a szöveg sávjába,
              //! táblán pedig nem nő a képernyő fölé — és a layout() ebből a
              //! szélességből számolja vissza a kamera átadási nagyítását.
              //*
              //* A két szorzó a vázé (ui/iphone.tsx): 433/882 az arány,
              //* 389,5/433 és 843,5/882 a kijelző a vázon belül, 55,75/389,5
              //* pedig a kijelző lekerekítése. */
          --cam-h: calc(100svh - var(--beat-band));
          --ph-cap: 24rem;
          --ph-h: min(var(--ph-cap), calc(var(--cam-h) * 0.86));
          --ph-w: calc(var(--ph-h) * 0.49093);
          --sc-w: calc(var(--ph-w) * 0.899538);
          --sc-h: calc(var(--ph-h) * 0.956349);
          --sc-r: calc(var(--sc-w) * 0.143132);
        }

        /*//* A néma átmenet sávja: széles kijelzőn nincs rá szükség (lásd a
            //* jelölésnél), telefonon a --transit-band nyitja ki. */
        .film-transit { height: var(--transit-band, 0px); }

        /*//! A KIFUTÓ SZAKASZ CSUPASZ. A .film-beat bélése a szövegé; ez a
            //! szakasz nem tartalmaz semmit, csak görgetési utat ad az utolsó
            //! kameraállásnak. A magasabb fajsúly (.film .film-outro) azért
            //! kell, hogy a töréspontok .film-beat szabályai se tegyenek rá
            //! bélést. */
        .film .film-outro {
          height: 52svh;
          min-height: 0;
          padding: 0;
        }

        /*//! A KAMERA ABLAKA ÉS A KÉSZÜLÉK UGYANAZ A KERET. Ha a kettő doboza
            //! akár egyetlen töréspontnál elcsúszna, az átadás mértana
            //! elromlana: az ablak nem oda zárulna, ahol a kijelző van. A
            //! keret ezért EGY szabálysor, amit mindkettő visel. */
        .film-frame {
          bottom: var(--beat-band);
        }

        /*//! A KÉSZÜLÉK PONTOSAN A LENCSE KÖZÉPPONTJÁRA ÜL. Ugyanaz a
            //! 50%/50% + --stage-oy recept, mint a .film-lens-é — a
            //! kijelző lyuka így a tábla középpontja fölött van, és a
            //! clip-path ugyanabból a középpontból számolhat.
            //*
            //! ELŐBB A VÁZ, UTÁNA A KÉP — ÉS A VÁZ KÉSŐN JÖN. Az ablak a
            //! --cam-hand felénél még KÉTSZER olyan széles, mint a kijelző:
            //! egy ott már látható készülék alól arasznyi táblafolt lógna ki
            //! mindkét oldalon, ami nem sűrűsödésnek látszik, hanem
            //! pontatlanságnak. A váz ezért csak az utolsó harmadban kel
            //! életre, ahol a kivágás már a kijelző méretének közelében jár —
            //! mérve: 0,86-nál a túllógás oldalanként 32 képpont, 0,93-nál 9.
            //! Csökkentett mozgás mellett viszont a --cam-hand végig 0, ezért
            //! a max() a --cam-shot-ra vált: a készülék ott egyszerűen
            //! előtűnik. */
        .film-phone { pointer-events: none; }

        .film-phone-body {
          position: absolute;
          left: 50%;
          top: 50%;
          width: var(--ph-w);
          transform: translate(-50%, -50%) translate3d(0, var(--stage-oy), 0);
          opacity: max(clamp(0, calc((var(--cam-hand) - 0.68) / 0.32), 1), var(--cam-shot));
          filter: drop-shadow(0 24px 44px oklch(0 0 0 / 0.6));
          will-change: opacity;
        }

        /*//* A felvétel a váz kijelzőlyukában ül; amíg nem úszott elő, a lyuk
            //* ÁTLÁTSZÓ, tehát a levágott tábla látszik rajta keresztül. */
        .film-phone-body img { opacity: var(--cam-shot); }

        /*//! AZ ALAPSZÍN HÁROM RÉTEGE SAJÁT RAJZRÉTEGET KAP. Az áttetszőségük
            //! MINDEN képkockán változik, alattuk pedig egy teljes képernyős
            //! festett felület van; saját réteg nélkül a böngésző képkockánként
            //! újrafesti az egészet, a hajtás pedig hiába írt pontos számokat.
            //! Így a keverés az összeállítóé — ugyanaz a művelet, amit a
            //! görgetés maga is használ.
            //*
            //! ÉS HÁROM RÉTEG VOLT LEÍRVA, DE CSAK KETTŐ KAPTA MEG. A
            //! peremsötétítés az --f-ink-en lóg, vagyis pontosan a
            //! papír→kobalt átmenet alatt változik képkockánként — réteg
            //! nélkül viszont képkockánként újra is FESTETTE a maga teljes
            //! képernyős színátmenetét. Ugyanez a nyitószöveg: az --f-intro
            //! a lap első hüvelykmozdulata alatt mozog, és a szakasz minden
            //! betűje, a gomb és annak árnyéka újrarajzolódott vele. A két
            //! kimaradt réteg együtt annyiba került, mint az összes többi
            //! munka — a bejelentett „akadás" másik fele. */
        .film-cream,
        .film-ink,
        .film-vignette,
        .film-intro {
          will-change: opacity;
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
            //! amit a széles elrendezés használ („left: 36%"), csak itt
            //! vízszintes osztás helyett vízszintes VÁGÁS.
            //*
            //! ÉS A VÁGÁS LÁGY. Egy éles alsó él úgy nézne ki, mintha a táblát
            //! elharapná valami; a maszk ehelyett az alapszínbe olvasztja —
            //! a rács a szöveg alá csúszik, nem elé. */
        .film-camera {
          overflow: hidden;
          /*//! A LÁGY ALSÓ ÉL AZ ÁTADÁSRA KINYÍLIK. A maszk a tábla alját
              //! olvasztja az alapszínbe — csakhogy a film végén a kamera
              //! ablaka MAGA lesz a kijelző, és a kijelző alsó pereme épp
              //! ebbe az elhalványuló sávba esne: a felvétel alja fakulna ki.
              //! A --cam-hand ezért a törésponttal együtt tolja a maszk
              //! utolsó megállóját 84%-ról 100%-ra — mire a kijelző
              //! összeáll, nincs mit kimosni. */
          -webkit-mask-image: linear-gradient(180deg, #000 0%, #000 calc(84% + 16% * var(--cam-hand)), transparent 100%);
          mask-image: linear-gradient(180deg, #000 0%, #000 calc(84% + 16% * var(--cam-hand)), transparent 100%);
          -webkit-mask-repeat: no-repeat;
          mask-repeat: no-repeat;

          /*//! ─── AZ ABLAK ÖSSZEZÁRUL A KIJELZŐRE ────────────────────────
              //! Nem a tábla zsugorodik és nem egy külön elem nő: a KAMERA
              //! ABLAKA lesz kisebb, pontosan akkorára és oda, ahol a
              //! készülék kijelzője van. Ezért nincs mit átúsztatni — ami a
              //! lyukban marad, az ugyanaz a rács, amit a lap végig mutatott.
              //*
              //! A NÉGY BEHÚZÁS A LENCSE KÖZÉPPONTJÁBÓL SZÁMOL, nem a doboz
              //! tetejéből: a függőleges felezőt a --stage-oy tolja el,
              //! ugyanaz a szám, ami a lencsét és a vázat is mozgatja. A
              //! --cam-hand mindegyiket 0-ról a saját célértékére viszi,
              //! tehát nulla állásban a vágás pontosan a teljes ablak. */
          clip-path: inset(
            calc((50% - var(--sc-h) / 2 + var(--stage-oy)) * var(--cam-hand))
            calc((50% - var(--sc-w) / 2) * var(--cam-hand))
            calc((50% - var(--sc-h) / 2 - var(--stage-oy)) * var(--cam-hand))
            calc((50% - var(--sc-w) / 2) * var(--cam-hand))
            round calc(var(--sc-r) * var(--cam-hand))
          );
          will-change: clip-path;
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
          /*//* A fátyol a rácsra kerülő szöveget védi; az átadás után nincs
              //* mit védenie, a készüléket viszont letompítaná. */
          opacity: calc(1 - var(--cam-shot));
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
            //* kobaltra vált, a szöveg kimegy vele együtt, nem marad rajta.
            //* A görgetésjelző ezen belül van, tehát vele együtt megy ki: a
            //* jel csak addig szól, amíg van mit kezdeni vele. */
        .film-intro { opacity: var(--f-intro); }

        /*//! A JELZŐ KIKERÜL A FOLYAMBÓL. Folyamban maradva a nyitókép
            //! FÜGGŐLEGES KERETÉBŐL vett volna el — mérve: 320x640-en a
            //! címsor 29 képponttal a táblába csúszott, fekvő telefonon pedig
            //! a jel maga lógott a hajtás alá. A hasáb alatt viszont minden
            //! méretben van üres sáv (a nyitószakasz 92svh magas, a képernyő
            //! 100): a jel ODA kerül, a hasáb aljához kötve, tehát a
            //! nyitókép mérete pontosan annyi marad, amennyi eddig volt. */
        .film-scroll {
          position: absolute;
          left: 0;
          top: 100%;
          margin-top: 2.5rem;
          /*//! A SÍN HOSSZA EGYETLEN SZÁM, ÉS MINDEN EBBŐL KÖVETKEZIK. A
              //! rovátkák arányos helyen ülnek, a jelölő útja a sín magassága,
              //! az állókép helye pedig ennek a „--now-f"-szerese — a
              //! töréspontokon tehát elég EZT átírni, a csengetési rend
              //! ritmusa és az ütem magától követi. Beírt képpontok mellett a
              //! rövidebb sínen a nap más ütemben telne, mint a hosszabbon. */
          --rail-h: 5.25rem;
          /*//* A rovátka hossza és a jelölő szélessége. A rovátka rövid (a
              //* tábla óravonala is csak megjelöli a percet), a jelölő
              //* hosszabb: az MUTAT valamerre. */
          --bell-w: 0.3125rem;
          --now-w: 0.9375rem;
          /*//! A MEG NEM TÖRTÉNT NAP ÉS A MEGTÖRTÉNT. A halvány a nyitókép
              //! saját tintája (ugyanaz a szín, amivel a bekezdés is íródik,
              //! csak töredék erővel); a kobalt a lap „--primary"-je egy
              //! árnyalattal mélyítve. Az eredeti kobalt a meleg papíron
              //! 2,5:1-et ad, ami egy hajszálvonalnak kevés — 0,52-es
              //! világossággal 4,1:1, és még mindig ugyanaz a kék, ami a
              //! cím második sorát és a gombot is festi. */
          --bell-dim: oklch(0.26 0.05 248 / 0.22);
          --bell-lit: oklch(0.52 0.155 245);
        }

        /*//* A sín doboza a jelölő teljes szélessége: a „most" hajszálvonal a
            //* rovátkákon TÚL nyúlik, tehát nem vághatja le semmi. */
        .film-scroll-rail {
          position: relative;
          display: block;
          width: var(--now-w);
          height: var(--rail-h);
          /*//! AZ ALAPSZÍN A SÍNEN ÜL, NEM A SÁVON. A kigyúlt réteg a SAJÁT
              //! sávpéldányát tartalmazza; ha a szín a sávon lenne, az a
              //! belső példányon visszaírná magát a halványra, és a kobalt
              //! soha nem jutna el a rovátkákig — a jel némán elveszítené
              //! a felét. Így a sáv csak OLVASSA a színt, a réteg meg
              //! felülírja. */
          --bell-ink: var(--bell-dim);
        }

        /*//* A sáv két példánya azonos elemekből áll; a színt a szülő adja,
            //* ezért ugyanaz a jelölés szolgálja a halvány és a kigyúlt
            //* réteget is. */
        .film-scroll-day {
          position: absolute;
          inset: 0;
        }

        .film-scroll-spine {
          position: absolute;
          left: 0;
          top: 0;
          bottom: 0;
          width: 1px;
          background: var(--bell-ink);
        }

        .film-scroll-bell {
          position: absolute;
          left: 0;
          height: 1px;
          width: var(--bell-w);
          background: var(--bell-ink);
        }

        /*//! A KIGYÚLT RÉTEG NEM MÉRETET VÁLTOZTAT, HANEM VÁGÓDIK. Egy nyúló
            //! elem a benne ülő rovátkákat is nyújtaná (a nap ritmusa
            //! menet közben torzulna), és magasságot animálni elrendezést
            //! számoltat képkockánként. A „clip-path" ugyanezt rajzolásban
            //! intézi el: a rovátkák a helyükön maradnak, csak láthatóvá
            //! válnak. */
        .film-scroll-lit {
          position: absolute;
          inset: 0;
          --bell-ink: var(--bell-lit);
          clip-path: inset(0 0 100% 0);
          /*//! EZ AZ EGYETLEN MOZGÁS A LAPON, AMI NEM KAMERA — ÉS EZÉRT NEM IS
              //! ÚGY LASSUL. Az ease-out-quart (a film saját görbéje) az út
              //! háromnegyedét az idő első harmadában teszi meg: a pont ESIK,
              //! aztán megáll. Egy nap viszont TELIK. A lágy indulás-érkezés
              //! közötti egyenletes szakasz az, ami órákat ábrázol, nem
              //! zuhanást. */
          animation: film-scroll-day 2.6s cubic-bezier(0.5, 0, 0.5, 1) infinite;
        }

        /*//* A jelölő maga: pont + hajszálvonal, ugyanabban a sorrendben, ahogy
            //* a rács a „most" vonalát rajzolja. A vonal jobbra elhal — a rácson
            //* egy oszlopot ér át, itt nincs mit átérnie, tehát a lap felé
            //* mutat és ott ér véget. */
        .film-scroll-now {
          position: absolute;
          left: -1.5px;
          top: -2px;
          display: block;
          width: var(--now-w);
          height: 4px;
          /*//! KÉT ANIMÁCIÓ, MERT KÉT KÜLÖN DOLGOT CSINÁLNAK. Ha az
              //! áttetszőség kulcsképei ugyanabban a menetben ülnének, a
              //! MOZGÁS lassítási szakaszait is felszabdalnák — a jelölő
              //! máshogy lassulna, mint amennyire a réteg kigyúl, és a kettő
              //! menet közben szétcsúszna. Külön menetben a haladás
              //! kulcsképei pontosan egybeesnek a vágáséval. */
          animation:
            film-scroll-mark 2.6s cubic-bezier(0.5, 0, 0.5, 1) infinite,
            film-scroll-mark-fade 2.6s linear infinite;
        }

        .film-scroll-now::before {
          content: "";
          position: absolute;
          left: 0;
          top: 0;
          width: 4px;
          height: 4px;
          border-radius: 999px;
          background: var(--bell-lit);
        }

        .film-scroll-now::after {
          content: "";
          position: absolute;
          left: 4px;
          right: 0;
          top: 50%;
          height: 1px;
          /*//* A vonal a hosszának kétharmadán tömör, és csak a végén hal el:
              //* egy végig halványuló csík csonknak látszott a pont mellett,
              //* nem vonalnak. */
          background: linear-gradient(
            90deg,
            var(--bell-lit) 0%,
            var(--bell-lit) 62%,
            oklch(0.52 0.155 245 / 0) 100%
          );
        }

        /*//! A NAP LETELIK, MEGÁLL EGY PILLANATRA, MAJD LEHÚZÓDIK. Nem
            //! visszaugrik: a vágás felső éle megy tovább lefelé, tehát a
            //! ciklus vége is LEFELÉ mutat — ugyanaz a mozdulat, amit a jel
            //! kér. Egy nullára visszaugró kitöltés kapcsolónak látszana. */
        @keyframes film-scroll-day {
          0% { clip-path: inset(0 0 100% 0); }
          58%, 72% { clip-path: inset(0 0 0 0); }
          100% { clip-path: inset(100% 0 0 0); }
        }

        @keyframes film-scroll-mark {
          0% { transform: translateY(0); }
          58%, 100% { transform: translateY(var(--rail-h)); }
        }

        /*//* A jelölő a sín két végén nem villan, hanem beúszik és elhal: a
            //* ciklus varrata így nem látszik. */
        @keyframes film-scroll-mark-fade {
          0% { opacity: 0; }
          9%, 72% { opacity: 1; }
          88%, 100% { opacity: 0; }
        }

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
            //! telefonon a kijelző SZÉLES, de alacsony — a Tailwind „md:"
            //! szerint ott a nagy betűk jönnének, és a műszerlap kilógna a
            //! képernyőből. Ugyanaz a lekérdezés vezérli, mint a kamerasort. */
        @media (min-width: 23rem) { .film { --cam-fit: 0.27; } }
        @media (min-width: 25.5rem) { .film { --cam-fit: 0.305; } }

        @media (max-width: 47.99rem), (max-height: 34rem) {
          /*//* Mérve (375x812): enélkül a nyitóképtől a csoportbontásig 747
              //* képpont vezet, amiből a papír→kobalt váltásra 254 jut. A sáv
              //* ezt ~1190-re, illetve ~380-ra nyitja: ugyanaz a mozdulat,
              //* csak követhető sebességgel. */
          .film { --transit-band: 55svh; }

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
          /*//! A NYITÓKÉPNEK A SAJÁT SÁVJÁBAN KELL MARADNIA (lásd fentebb): a
              //! jelző itt nem elhagyható, de nem is kérhet annyi helyet, mint
              //! táblán — a sín rövidül, a nap ütemével együtt.
              //*
              //! ÉS A ROVÁTKA RÖVIDÜL VELE. Nyolc bell egy 3,25rem-es sínen
              //! ~6 képpontonként ül; a táblai hosszal ezek egy tömör
              //! fésűvé állnának össze, és a csengetési rend ritmusából
              //! textúra lenne. Rövidebb rovátka mellett a köz marad a
              //! hangsúlyos — a nap ott is OLVASHATÓ, nem csak látszik. */
          .film-scroll {
            margin-top: 1.25rem;
            --rail-h: 3.25rem;
            --bell-w: 0.25rem;
            --now-w: 0.8125rem;
          }

          .film-panel {
            padding: 1.25rem;
            /*//! HÁTTÉRELMOSÁS NÉLKÜL. A „backdrop-filter" a mögötte MOZGÓ
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
            /*//* A lencse középpontja 25svh-val a képernyő közepe FÖLÖTT áll,
                //* tehát a készüléknek szimmetrikusan ennyi hely jut fölfelé:
                //* a szabad magasság 2 × 25svh. */
            --cam-h: 50svh;
            --ph-cap: 30rem;
          }
          /*//* Táblasávtól fölfelé a rács visszakapja az egész színpadot, és a
              //* szöveget megint a fátyol választja el tőle. */
          .film-frame { bottom: 0; }
          .film-camera {
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
            --cam-h: 100svh;
            --ph-cap: 36rem;
          }
          .film-frame {
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
          .film {
            --cam-fit: 0.82;
            --ph-cap: 40rem;
          }
          .film-frame { left: 34%; }
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
          .film-scroll {
            margin-top: 0.875rem;
            --rail-h: 2.5rem;
            --bell-w: 0.1875rem;
            --now-w: 0.75rem;
          }
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
            --cam-h: 100svh;
            --ph-cap: 30rem;
          }
          .film-frame {
            left: 44%;
            bottom: 0;
          }
          .film-beat {
            align-items: center;
            padding-bottom: max(0.75rem, env(safe-area-inset-bottom));
          }
          .film-panel { max-width: min(100%, 25rem); }
          .film-veil { display: none; }
          /*//! FEKVŐ TELEFONON A NYITÓKÉP FELSŐ BÉLÉSE HIBA VOLT. A pt-24
              //! egy 390 képpont MAGAS képernyőn a látható terület negyedét
              //! vitte el, és emiatt a hasáb tartalma a hajtás alá csúszott —
              //! a görgetésjelző csak megmutatta, ami addig is így volt. Az
              //! álló sor a jobb felső sarokban ül, a szöveg pedig balra: egy
              //! arasznyi bélés itt bőven elég hozzá. */
          .film-intro { padding-top: max(1.5rem, env(safe-area-inset-top)); }
        }

        /*//! CSÖKKENTETT MOZGÁS: A KAMERA ÁLL, A SZÍN NEM. A hajtás ilyenkor a
            //! STILL kameraállást írja — nincs nagyítás, nincs pásztázás —, az
            //! alap színváltása és a nyitószöveg elhalványodása viszont MEGMARAD:
            //! az nem térbeli mozgás, viszont enélkül a nyitószöveg sötét betűi
            //! a sötét alapon maradnának. */
        @media (prefers-reduced-motion: reduce) {
          /*//! AZ ÁTADÁS ITT KÉT ÁTTETSZŐSÉG, SEMMI MÁS. A --cam-hand végig
              //! 0 (lásd STILL), tehát az ablak nem zárul össze — helyette a
              //! tábla hátrál ki ugyanazzal a számmal, amivel a készülék
              //! előjön. A film utolsó képe ugyanaz marad: egy telefon a
              //! valódi nappal, csak nem mozdul érte semmi. */
          .film-camera { opacity: calc(1 - var(--cam-shot)); }
          /*//! A GÖRGETÉSJELZŐ NEM TŰNIK EL, CSAK MEGÁLL — ÉS OTT ÁLL MEG,
              //! AHOL A TÁBLÁN IS ÁLL. A jelölő a „NOW_MIN" percére parkol le:
              //! pontosan arra, amit a rács „most" vonala jelöl a hétfői első
              //! blokkban, néhány centivel odébb ugyanezen a képernyőn (lásd
              //! „week.ts"). A „--now-f" ezt az arányt hozza a JSX-ből, tehát
              //! a két jel akkor sem csúszhat szét, ha a hét adata változik.
              //*
              //! A KITÖLTÉS PEDIG MEGMARAD ODÁIG. Egy üres sín mellett a
              //! parkoló pont csak egy pötty lenne; a mögötte kigyúlt szakasz
              //! mozgás nélkül is kimondja, hogy van hova tovább. */
          .film-scroll-lit {
            animation: none;
            clip-path: inset(0 0 calc(100% - var(--now-f) * 100%) 0);
          }
          .film-scroll-now {
            animation: none;
            transform: translateY(calc(var(--rail-h) * var(--now-f)));
          }
        }
      `}</style>
    </div>
  );
}
