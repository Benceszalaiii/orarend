"use client";

import type { RefObject } from "react";
import { useEffect, useRef } from "react";
import { accentHue } from "@/lib/accent";
import {
  DAY_END_MIN,
  DAY_START_MIN,
  DUAL_BLOCKS,
  type Lesson,
  MONDAY,
  type Slot,
  TUESDAY,
} from "./week";

//! ═══════════════════════════════════════════════════════════════════════════
//! A KOBALT FÉNYKAMRA — A SÁV MÖGÖTT A HÉT VILÁGÍT
//! ═══════════════════════════════════════════════════════════════════════════
//! MIÉRT NEM DÍSZ. A lap tézise szerint a nyitólap nem beszél az órarendről,
//! hanem AZ órarend (lásd `film.tsx`). A kobalt sáv volt az egyetlen hely, ahol
//! ez nem állt: egy lapos márkaszín, amin szöveg ült. Egy általános
//! shader-háttér ezen nem segített volna — csak egy szebb lapos felület lenne.
//! Ezért ez a mező NEM absztrakt zaj: a `week.ts` VALÓDI hetének kártyáiból
//! épül, a saját tantárgyszíneikkel (`lib/accent.ts`). Ami a sáv mögött
//! lélegzik, az ugyanaz a hétfő és kedd, amit a film fölötte kirajzol — csak
//! nagyon közelről, fényként.
//*
//! CSAK VILÁGOSÍT, SOSEM SÖTÉTÍT. Ez nem esztétikai döntés, hanem ez tartja a
//! szöveget olvashatóként. Az `--ink-on-primary` a kobalton 6,21:1-et ad (85%-on
//! 5,00:1-et); minden képpont, amit a mező megvilágít, ENNÉL VILÁGOSABB alapot
//! kap, tehát a kontraszt csak nőhet (+0,15 lineáris fénynél 8,8:1). Egyetlen
//! sötétítő tag sincs a shaderben — se vignetta, se árnyék. A szemcse
//! szimmetrikus és ±0,006, vagyis a mérésben nem látszik.
//*
//! AMI NÉLKÜL IS TELJES A SÁV. A vászon egy TARTALÉK FÖLÉ kerül: a
//! `.latest-field` CSS-gradiensei ugyanazt a kompozíciót rajzolják állóképben.
//! Ha nincs WebGL, ha elveszik a kontextus, ha a felhasználó csökkentett
//! mozgást kért, vagy ha az első képkockák mérve lassúak (lásd `SLOW_MS`), a
//! vászon nem jelenik meg — és a sáv pontosan az marad, ami e nélkül volt.

//* ---------------------------------------------------------------------------
//* 1. A TÁBLA MINT FÉNYFORRÁS
//* ---------------------------------------------------------------------------
//! A KÁRTYÁK KOORDINÁTÁI A VALÓDI HÉTBŐL JÖNNEK. Ugyanaz a `MONDAY`/`TUESDAY`/
//! `DUAL_BLOCKS` adat, amiből a rács épül — itt csak normalizálva: x az öt
//! naposzlop 0..1-en, y a nap sávja (08:00–15:15) 0..1-en.
//*
//! ÉS A BONTÁS ITT IS LÁTSZIK. Ahol a két csoport MÁS tantárgyat kap (hétfő
//! első két blokkja), ott két féloszlopnyi folt áll egymás mellett, két
//! különböző tantárgyszínnel — a csoportbontás a fényben is két szín. Ahol a
//! két csoport ugyanazt tanulja, ott egyetlen folt: a fél oszlop ilyenkor nem
//! információ, csak részlet, és ebben a homályban úgysem látszana.
type FieldRect = {
  /** Középpont és félméret a tábla terében (0..1). */
  cx: number;
  cy: number;
  hw: number;
  hh: number;
  hue: number;
  /** Mennyi fényt enged át a folt. Lásd a duális blokkok indoklását lentebb. */
  weight: number;
};

const DAY_SPAN = DAY_END_MIN - DAY_START_MIN;
const COL_SPAN = 1 / 5;
//! AZ OSZLOPKÖZ ITT SZÉLESEBB, MINT A RÁCSON. A `week.ts` réslistája arányosítva
//! 13 képpont lenne egy 1440-es sávon — egy nagyra nagyított, homályos fényben
//! ez nem rés, hanem semmi, és az öt nap egyetlen világító falba olvadna. A
//! mező azt a RITMUST mutatja, amit a rács is: öt hasáb, köztük sötét varrat.
//! Ehhez a varratnak látszania kell, nem méretarányosnak lennie.
const COL_INSET = 0.17 * COL_SPAN;
//* A bontott sáv két féloszlopa között ugyanez a varrat, feleakkorán.
const HALF_GAP = 0.09 * COL_SPAN;

function yOf(min: number): number {
  return (min - DAY_START_MIN) / DAY_SPAN;
}

function rectFor(
  day: number,
  half: 0 | 1 | null,
  lesson: Lesson,
  weight = 1,
): FieldRect {
  const left = day * COL_SPAN + COL_INSET;
  const width = COL_SPAN - 2 * COL_INSET;
  const w = half === null ? width : (width - HALF_GAP) / 2;
  const x = half === 1 ? left + width - w : left;
  const top = yOf(lesson.startMin);
  const bottom = yOf(lesson.endMin);
  return {
    cx: x + w / 2,
    cy: (top + bottom) / 2,
    hw: w / 2,
    hh: (bottom - top) / 2,
    hue: accentHue(lesson.title),
    weight,
  };
}

function slotRects(day: number, slot: Slot): FieldRect[] {
  if ("whole" in slot) return [rectFor(day, null, slot.whole)];
  //* Azonos tantárgy → azonos szín → egy folt. Lásd a fenti indoklást.
  if (slot.a.title === slot.b.title) return [rectFor(day, null, slot.a)];
  return [rectFor(day, 0, slot.a), rectFor(day, 1, slot.b)];
}

const RECTS: readonly FieldRect[] = [
  ...MONDAY.flatMap((slot) => slotRects(0, slot)),
  ...TUESDAY.flatMap((slot) => slotRects(1, slot)),
  //! A DUÁLIS NAP EGY EGÉSZ NAPOS BLOKK — HÁROM ILYEN EGYMÁS MELLETT FAL LENNE.
  //! A rácson ez rendben van: ott a blokknak KERETE van, és a keret rajzolja
  //! meg, hogy három külön napról van szó. A fényben nincs keret, csak folt;
  //! három teli oszlop egymás mellett a kép jobb kétharmadát egyetlen világító
  //! lappá mosná, és pont az veszne el, amit a mező mutat: a hét ritmusa. A
  //! duális nap ezért halkabban ég — ott van, de nem nyom el mindent.
  ...DUAL_BLOCKS.map((block, i) => rectFor(i + 2, null, block, 0.5)),
];

const N = RECTS.length;

//* ---------------------------------------------------------------------------
//* 2. SZÍN — UGYANAZOK A TOKENEK, LINEÁRIS TÉRBEN
//* ---------------------------------------------------------------------------
//! A SHADER LINEÁRIS FÉNNYEL SZÁMOL, A CSS OKLCH-BAN ÁLL. A két világ között
//! itt van az EGYETLEN átjáró: az Oklab-visszaút, amit a böngésző is használ.
//! Az alapszín ezért képpontra ugyanaz, mint a `--primary` — a vászon széle nem
//! ad varratot a `bg-primary` felület felé, és a token maradhat a forrás.
function oklchToLinear(
  L: number,
  C: number,
  H: number,
): [number, number, number] {
  const h = (H * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

//* `--primary` a sötét palettából (`globals.css`) — a lap `colorScheme: dark`.
const BASE = oklchToLinear(0.6692, 0.1607, 245.011);

//! A FOLT SZÍNE VILÁGOS ÉS HALVÁNY, NEM A KÁRTYA TELÍTETT SZÍNE. A tizenkét hue
//! a tantárgyat azonosítja, de itt nem azonosít semmit: nem olvasható, csak
//! érződik. Ha a kártya saját telítettségével égne, a sáv diszkó lenne, és a
//! szín ott állítana valamit, ahol nincs mit állítania.
//*
//! EZ AZ EGYETLEN HELY, AMI NEM KÖVETI A VÁLASZTOTT PALETTÁT, ÉS EZ TUDATOS.
//! Az `accentHue` itt alapértelmezéssel (`ciklus`) hívódik, mert a mező nem a
//! FELHASZNÁLÓ hetét mutatja, hanem egy rögzített mintahetet a nyitólapon — és
//! mert a fenti bekezdés szerint a hue itt nem azonosít, csak hangulatot ad. A
//! palettához kötni azt jelentené, hogy a WebGL-tábla (`u_tint`) minden
//! váltásnál újratöltődik, olyan különbségért, amit a homályos fényfoltokon
//! szinte nem is látni. A NYITÓLAP KÁRTYÁI viszont követik a palettát: azok az
//! `accentStyle`-on és a CSS-választón mennek (`week-grid.tsx`).
const TINTS = RECTS.map((r) => {
  const [tr, tg, tb] = oklchToLinear(0.88, 0.13, r.hue);
  //* A súly ELŐRE beszorozva: a shader belső hurkában egy szorzással kevesebb,
  //* és a `vec4` negyedik helye maradhat a lélegzés ütemének.
  const k = r.weight * 0.62;
  return [tr * k, tg * k, tb * k] as [number, number, number];
});

//* ---------------------------------------------------------------------------
//* 3. A SHADER
//* ---------------------------------------------------------------------------
const VERT = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

//! MIÉRT EGYETLEN MENET. Nincs elmosó utómenet, nincs framebuffer-lánc: a
//! lágyság a foltok SAJÁT peremében van (`softBox` széles átmenettel), tehát
//! egy fragmentum egyszer íródik. Ez az, ami miatt a mező elfér egy közepes
//! telefonon is — nem az, hogy kevés a folt.
//*
//! A HULLÁMZÁS TÖRÉS, NEM MOZGÁS. A tábla nem úszik: a MINTAVÉTEL helye
//! torzul, mintha a kobalt vastag, lassan mozgó üveg lenne, és a hét mögötte
//! állna. Ezért két alacsony frekvenciájú szinusz, nem zajtextúra — egy
//! háromnegyed hertzes hullámnál a zaj csak drágább lenne, nem szebb.
const FRAG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

#define N ${N}

uniform vec2 u_res;
uniform float u_time;
uniform float u_p;
uniform vec3 u_pointer;
uniform vec3 u_base;
uniform vec4 u_rect[N];
uniform vec4 u_tint[N];

varying vec2 v_uv;

float softBox(vec2 p, vec2 c, vec2 h, float soft) {
  vec2 d = abs(p - c) - h;
  float dist = length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
  return 1.0 - smoothstep(-soft, soft, dist);
}

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

vec3 toSrgb(vec3 c) {
  vec3 lo = c * 12.92;
  vec3 hi = 1.055 * pow(max(c, vec3(0.0004)), vec3(1.0 / 2.4)) - 0.055;
  return mix(lo, hi, step(vec3(0.0031308), c));
}

void main() {
  float aspect = u_res.x / max(u_res.y, 1.0);

  // A NAP FELÜLRŐL LEFELÉ TELIK, mint a rácson: a v_uv.y a vászon alján nulla,
  // tehát a reggel a KÉP TETEJÉN van, nem az alján. A látott ablak a nap 82%-a,
  // és a görgetéssel lejjebb csúszik benne: a hét ÁTHALAD a sáv mögött, ahogy a
  // szalag a kockáit lépteti.
  vec2 board = vec2(v_uv.x, (1.0 - v_uv.y) * 0.82 - 0.10 + u_p * 0.34);

  float t = u_time * 0.055;
  vec2 w = board;
  w.x += 0.024 * sin(board.y * 4.4 + t * 2.1) + 0.012 * sin(board.y * 9.7 - t * 1.4);
  w.y += 0.028 * sin(board.x * 3.6 * aspect - t * 1.7) + 0.014 * sin(board.x * 7.1 * aspect + t * 2.6);

  vec3 accum = vec3(0.0);
  for (int i = 0; i < N; i++) {
    vec4 r = u_rect[i];
    vec4 tint = u_tint[i];
    // A FOLT CSAK A SAJÁT OSZLOPÁBAN SZÁMÍT. Egy képpont a hétfő sávjában nem
    // kaphat fényt a péntektől: a hatókörön kívüli foltok kihagyása a belső
    // hurok munkájának négyötödét viszi el, és mivel a kihagyás OSZLOP szerint
    // megy, egy rajzolási csoport képpontjai együtt hagyják ki ugyanazt.
    if (abs(w.x - r.x) > r.z + 0.14 || abs(w.y - r.y) > r.w + 0.14) continue;
    // KÉT TAG: EGY MAG ÉS EGY UDVAR. Egyetlen lágy folttal a sáv vagy egyenletes
    // kék pép lett (széles perem), vagy rideg téglalapokból állt (keskeny).
    // A mag megrajzolja a kártya ALAKJÁT, az udvar adja a levegőt körülötte —
    // és mivel az udvar halkabb, a napok közti varrat sötét marad.
    float g = softBox(w, r.xy, r.zw, 0.014) * 0.82
            + softBox(w, r.xy, r.zw + 0.028, 0.10) * 0.30;
    float breathe = 0.74 + 0.26 * sin(u_time * tint.w + float(i) * 1.73);
    accum += tint.rgb * g * breathe;
  }

  // A csengetési rend leheletnyi vízszintes rácsa — nyolc óra, nyolc sáv.
  float per = abs(fract(w.y * 8.0) - 0.5) * 2.0;
  accum += vec3(0.85, 0.92, 1.0) * smoothstep(0.9, 1.0, per) * 0.05;

  // A kurzor egy lámpa a fal mögött. Durva mutatón (érintés) a gazda nullázza.
  vec2 pd = (v_uv - u_pointer.xy) * vec2(aspect, 1.0);
  accum += vec3(0.9, 0.95, 1.0) * exp(-dot(pd, pd) * 4.5) * 0.42 * u_pointer.z;

  // Tónusleképezés: az átfedő foltok telítődnek, nem égnek ki.
  vec3 light = vec3(1.0) - exp(-accum * 1.10);

  // CSAK ÖSSZEADÁS. Lásd a fájl fejlécét: ez tartja a szöveg kontrasztját.
  vec3 col = u_base + light * 0.19;

  // Szórás a sávosodás ellen: a nagy, lapos kobalt felület 8 biten csíkozna.
  col += (hash(gl_FragCoord.xy + fract(u_time) * 91.7) - 0.5) * 0.006;

  gl_FragColor = vec4(toSrgb(col), 1.0);
}
`;

//* ---------------------------------------------------------------------------
//* 4. A HAJTÁS
//* ---------------------------------------------------------------------------
//! HÁROM KAPCSOLÓ ÁLLÍTJA LE, ÉS MIND A HÁROM MÉR, NEM TIPPEL:
//!
//! 1. LÁTHATÓSÁG. `IntersectionObserver` + `visibilitychange`: a hurok csak
//!    akkor jár, ha a sáv a képen van és a lap az előtérben. Egy nyitólap
//!    aljára görgetve nem szabad, hogy egy fenti shader vigye az akkumulátort.
//! 2. CSÖKKENTETT MOZGÁS. Ilyenkor a vászon el sem indul — a mező nem lassabb
//!    lesz, hanem nincs, és a CSS állóképe marad. Ugyanaz a döntés, mint a
//!    szalagnál.
//! 3. MÉRT SEBESSÉG. Az első `SLOW_SAMPLE` képkocka KÖZTI idő mérve: ha a
//!    medián `SLOW_MS` fölött van (vagyis a lap a mezővel együtt nem tart
//!    ~38 képkockát másodpercenként), a vászon leáll és visszaadja a helyét az
//!    állóképnek. Ez az egyetlen becsületes „közepes eszköz" teszt — a
//!    magszám vagy a `deviceMemory` nem mondja meg, mit bír EZ a gép.
//*
//! ÉS A KÖZTI IDŐT MÉRJÜK, NEM A RAJZOLÁS IDEJÉT. Az első változat a
//! `drawArrays` köré tett `gl.finish()`-sel mért — csakhogy a `finish()` nem
//! minden megvalósításban vár meg mindent, és ahol nem, ott a mérés a
//! PARANCSBEADÁST méri, nem a képet: szoftveres rajzolás mellett, 83 ms-os
//! képkockákon is „gyorsnak" látszott a gép. A képkockák közti idő ellenben
//! pont azt méri, ami a felhasználót zavarja — hogy akadozik-e a lap.
const SLOW_SAMPLE = 24;
const SLOW_MS = 26;
//* Az első képkockák (fordítás, első feltöltés, elrendezés) sosem jellemzők.
const SLOW_WARMUP = 6;
//* A vászon a CSS-képpontok alatt renderel: a mező csupa lágy átmenet, a
//* felskálázás rajta nem látszik, a fragmentumszám viszont a felére esik.
const RENDER_SCALE = 0.75;
const MAX_DPR = 1.6;

function compile(
  gl: WebGLRenderingContext,
  type: number,
  src: string,
): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

export function LightField({
  progressRef,
}: {
  //* A szalag mért haladása (0..1). NEM külön görgetésfigyelő: a lapon egyetlen
  //* mérés van (`useStrip`), a mező abból olvas — két figyelő két igazságot
  //* jelentene ugyanarról a görgetésről.
  progressRef: RefObject<number>;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return;

    const motionOk =
      typeof window.matchMedia !== "function" ||
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!motionOk) return;

    //! A KONTEXTUS A VÁSZONHOZ TARTOZIK, NEM EHHEZ A LEFUTÁSHOZ. React Strict
    //! Mode-ban (fejlesztésben) a hatás kétszer fut: ha a takarítás elveszejtené
    //! a kontextust, a MÁSODIK lefutás ugyanazt az elveszett kontextust kapná
    //! vissza — `createShader` onnantól `null`, a mező néma marad, és mivel a
    //! vászon `alpha: false`, egy fekete téglalap ülne a sáv helyén. A takarítás
    //! ezért csak a hurkot állítja meg és a figyelőket szedi le; egy vászon egy
    //! kontextus, tehát nincs mit szivárogtatni.
    const gl = (canvas.getContext("webgl", {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: "low-power",
      preserveDrawingBuffer: false,
    }) ??
      canvas.getContext("experimental-webgl", {
        alpha: false,
      })) as WebGLRenderingContext | null;
    if (!gl || gl.isContextLost()) return;

    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    const program = vs && fs ? gl.createProgram() : null;
    if (!vs || !fs || !program) return;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;
    //* A WebGL `useProgram` nem React-horog, csak a nevével annak látszik —
    //* ezért kap kivételt, nem átnevezést.
    // biome-ignore lint/correctness/useHookAtTopLevel: a `gl.useProgram` a WebGL API-ja, nem React-horog.
    gl.useProgram(program);

    //* Egy háromszög, nem egy négyzet: ugyanaz a felület, eggyel kevesebb
    //* primitív és nincs átlós varrat.
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]),
      gl.STATIC_DRAW,
    );
    const aPos = gl.getAttribLocation(program, "a_pos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const uRes = gl.getUniformLocation(program, "u_res");
    const uTime = gl.getUniformLocation(program, "u_time");
    const uP = gl.getUniformLocation(program, "u_p");
    const uPointer = gl.getUniformLocation(program, "u_pointer");

    gl.uniform3fv(gl.getUniformLocation(program, "u_base"), BASE);

    //* A táblát egyszer töltjük fel: a geometria és a szín állandó, csak az idő
    //* és a haladás változik képkockánként.
    const rects = new Float32Array(N * 4);
    const tints = new Float32Array(N * 4);
    RECTS.forEach((r, i) => {
      rects.set([r.cx, r.cy, r.hw, r.hh], i * 4);
      //* A lélegzés üteme foltonként más és irracionális arányú — így a mező
      //* sosem lüktet együtt, vagyis sosem lesz belőle ritmus.
      tints.set([...TINTS[i], 0.12 + (i % 7) * 0.031], i * 4);
    });
    gl.uniform4fv(gl.getUniformLocation(program, "u_rect"), rects);
    gl.uniform4fv(gl.getUniformLocation(program, "u_tint"), tints);

    let width = 0;
    let height = 0;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      const w = Math.max(1, Math.round(host.clientWidth * dpr * RENDER_SCALE));
      const h = Math.max(1, Math.round(host.clientHeight * dpr * RENDER_SCALE));
      if (w === width && h === height) return;
      width = w;
      height = h;
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
      gl.uniform2f(uRes, w, h);
    };

    //! A KURZOR CSAK OTT LÁMPA, AHOL VAN KURZOR. Érintőképernyőn a `pointermove`
    //! a koppintás helyére ugrasztaná a fényt — egy lámpa, ami az ujj után
    //! kapkod. Durva mutatón az erőssége ezért nulla marad.
    const fine =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(pointer: fine)").matches;
    //* A mező a tartalom MÖGÖTT áll (`z-index: -1`), tehát ő maga sosem kapna
    //* mutatóeseményt: a kurzor a fölötte fekvő színpadot találja el. A lámpa
    //* ezért a SZAKASZRA figyel, és a saját dobozához méri a helyet.
    const pointerHost = host.parentElement ?? host;
    const pointer = { x: 0.5, y: 0.4, tx: 0.5, ty: 0.4, s: 0 };
    const onPointer = (e: PointerEvent) => {
      const rect = host.getBoundingClientRect();
      pointer.tx = (e.clientX - rect.left) / Math.max(rect.width, 1);
      pointer.ty = 1 - (e.clientY - rect.top) / Math.max(rect.height, 1);
      pointer.s = 1;
    };
    const onLeave = () => {
      pointer.s = 0;
    };

    let raf = 0;
    let visible = false;
    let running = false;
    let start = 0;
    let seen = 0;
    let prev = 0;
    const deltas: number[] = [];
    let dead = false;

    const frame = (now: number) => {
      raf = 0;
      if (dead) return;
      if (!start) start = now;

      resize();
      //* A lámpa nem ugrik: a cél felé tart, tehát a fény ÚSZIK a kurzor után.
      pointer.x += (pointer.tx - pointer.x) * 0.08;
      pointer.y += (pointer.ty - pointer.y) * 0.08;
      gl.uniform1f(uTime, (now - start) / 1000);
      gl.uniform1f(uP, progressRef.current ?? 0);
      gl.uniform3f(uPointer, pointer.x, pointer.y, fine ? pointer.s : 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      if (deltas.length < SLOW_SAMPLE) {
        seen++;
        if (seen > SLOW_WARMUP && prev) deltas.push(now - prev);
        prev = now;
        if (deltas.length === SLOW_SAMPLE) {
          const sorted = [...deltas].sort((a, b) => a - b);
          if (sorted[sorted.length >> 1] > SLOW_MS) {
            stop();
            delete host.dataset.lit;
            dead = true;
            return;
          }
        }
      }

      if (running) raf = requestAnimationFrame(frame);
    };

    const play = () => {
      if (dead || running) return;
      running = true;
      //* Az idő NEM fut tovább a szünet alatt: ha a lap fél óráig háttérben áll,
      //* a mező visszatéréskor ne egy fél órával későbbi fázisba ugorjon. A
      //* sebességmérés ugyanezért felejti el az előző képkocka idejét: a
      //* szünet hossza nem egy lassú képkocka.
      start = 0;
      prev = 0;
      raf = requestAnimationFrame(frame);
    };
    function stop() {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    }

    const sync = () => {
      if (visible && document.visibilityState === "visible") play();
      else stop();
    };

    const io = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting;
        sync();
      },
      { rootMargin: "10% 0px" },
    );
    io.observe(host);

    const ro = new ResizeObserver(() => {
      resize();
      if (!running && !dead) requestAnimationFrame(frame);
    });
    ro.observe(host);

    //! A KONTEXTUS ELVESZHET (háttérbe tett fül, GPU-visszaállítás). Ilyenkor a
    //! vászon nem fehéredik ki és nem fagy be egy régi képkockán: elengedi a
    //! helyét, és a CSS állóképe jön vissza. A `preventDefault` elmarad —
    //! nem kérünk visszaállítást, mert a tartalék teljes értékű.
    const onLost = () => {
      dead = true;
      stop();
      delete host.dataset.lit;
    };
    canvas.addEventListener("webglcontextlost", onLost);
    document.addEventListener("visibilitychange", sync);
    if (fine) {
      pointerHost.addEventListener("pointermove", onPointer, { passive: true });
      pointerHost.addEventListener("pointerleave", onLeave, { passive: true });
    }

    resize();
    //* Egy képkocka MINDIG lemegy, mielőtt a vászon láthatóvá válik — így nem
    //* egy üres fekete téglalap úszik be, hanem a kész mező.
    frame(performance.now());
    host.dataset.lit = "on";

    return () => {
      dead = true;
      stop();
      io.disconnect();
      ro.disconnect();
      canvas.removeEventListener("webglcontextlost", onLost);
      document.removeEventListener("visibilitychange", sync);
      pointerHost.removeEventListener("pointermove", onPointer);
      pointerHost.removeEventListener("pointerleave", onLeave);
      delete host.dataset.lit;
    };
  }, [progressRef]);

  return (
    <div ref={hostRef} className="latest-field" aria-hidden>
      <canvas ref={canvasRef} className="latest-canvas" />
    </div>
  );
}
