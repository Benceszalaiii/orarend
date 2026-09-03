"use client";

import {
  animate,
  type MotionValue,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
} from "motion/react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { cn } from "@/lib/utils";

//* ---------------------------------------------------------------------------
//* A NAPKÖTEG — a hét öt napja egymás mellett, ujjal lapozva
//* ---------------------------------------------------------------------------
//! MIÉRT NEM GOMB. A `/ma` a napot eddig egyetlen módon engedte átállítani: a
//! „A hét" panel sorára koppintva. Telefonon (375×812) az a panel a lap
//! tetejétől 1250 képpontra kezdődik — másfél képernyővel a hajtás alatt.
//! „Mi van holnap" tehát így hangzott: görgess másfelet, koppints, görgess
//! vissza. A NAP a lap fő tengelye; a fő tengelyen való mozgás nem lehet
//! egy elrejtett listaelem.
//*
//* A panel MEGMARAD — ott a nap terhelése is látszik, és billentyűvel is
//* elérhető. Ami itt megjelenik, az nem a helyettesítője, hanem a közvetlen út:
//* a nap tartalma maga a fogantyú.
//!
//! AMIT EZ A KÖTEG BETART:
//! - 1:1 KÖVETÉS. A lap az ujj alatt marad, a megfogás pontjától mérve
//!   (`base + dx`) — nem ugrik a középre, és nem „gyorsul rá".
//! - MEGSZAKÍTHATÓSÁG. A futó rugót a `pointerdown` megállítja, és a húzás a
//!   LÁTHATÓ értékről (`x.get()`) indul, nem onnan, ahova az animáció tartott.
//!   Egy félúton lévő lapozás visszahúzható anélkül, hogy meg kéne várni.
//! - SEBESSÉG-ÁTADÁS. Az elengedés pillanatában mért ujjsebesség a rugó
//!   KEZDŐSEBESSÉGE lesz — így a húzás és az animáció közt nincs varrat.
//! - LENDÜLET-VETÍTÉS. A pöccintés nem a legközelebbi naphoz ugrik, hanem oda,
//!   ahova a mozdulat TARTOTT (`project`), és onnan keresi a legközelebbit.
//! - GUMISZALAG a hét két végén: hétfő előtt és péntek után a lap egyre
//!   nehezebben követ, de KÖVET. A kemény ütközés „lefagyottnak" olvasódik.

//* Az iOS görgetés-lassulási együtthatója. A `project` ebből az exponenciális
//* lecsengésből számol végpontot — nem a tankönyvi v²/2a-ból, mert az érezhetően
//* rövidebbet vet, és a pöccintés „nem dob".
const DECELERATION = 0.998;
//* Ennyi képpont után dől el, hogy lapozás vagy görgetés — előtte egyik sem
//* kap kizárólagosságot.
const DRAG_THRESHOLD = 10;
const RUBBERBAND_CONSTANT = 0.55;
//* Az elengedési sebességet ekkora ablakból mérjük vissza: egyetlen
//* `pointermove` különbsége zajos, a teljes húzás átlaga viszont már nem az,
//* amit az ujj az UTOLSÓ pillanatban csinált.
const VELOCITY_WINDOW_MS = 100;

function project(velocity: number): number {
  return ((velocity / 1000) * DECELERATION) / (1 - DECELERATION);
}

function rubberband(overshoot: number, dimension: number): number {
  return (
    (overshoot * dimension * RUBBERBAND_CONSTANT) /
    (dimension + RUBBERBAND_CONSTANT * Math.abs(overshoot))
  );
}

type DragSession = {
  pointerId: number;
  startX: number;
  startY: number;
  //* A `x` értéke a megfogás pillanatában — a megfogás HELYE ebből és a
  //* `startX`-ből együtt adódik ki, ezért nem kell külön eltolás.
  base: number;
  active: boolean;
  abandoned: boolean;
  samples: { x: number; t: number }[];
};

export function DayDeck({
  //! A LAPOK AZONOSSÁGA A NAP DÁTUMA, NEM A SORSZÁMA. Osztályváltásnál vagy
  //! héthatáron ugyanaz a sorszám MÁS napot jelent; kulcs nélkül React
  //! újrahasznosítaná az előző nap DOM-ját, és egy pillanatra a régi órák
  //! állnának az új nap címe alatt.
  keys,
  index,
  onIndexChange,
  //! A FOLYAMATOS ÁLLÁS, KÍVÜLRE. A napsáv jelölője nem a KIVÁLASZTOTT napon
  //! ugrik át, hanem az ujjal együtt csúszik — ehhez a köteg tört indexét
  //! (0…count-1) meg kell osztania. Motion-érték, nem React-állapot: a jelölő
  //! így képkockánként mozoghat anélkül, hogy a lap újrarajzolódna.
  progress,
  renderPanel,
  className,
}: {
  keys: string[];
  index: number;
  onIndexChange: (next: number) => void;
  progress?: MotionValue<number>;
  renderPanel: (i: number) => React.ReactNode;
  className?: string;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const panelsRef = useRef<(HTMLDivElement | null)[]>([]);
  const widthRef = useRef(0);
  const heightsRef = useRef<number[]>([]);
  const dragRef = useRef<DragSession | null>(null);
  const runningRef = useRef<ReturnType<typeof animate> | null>(null);
  //* A rugó befejezését figyelő visszahívások innen érik el a friss mérést,
  //* anélkül hogy a `settle` a mérőfüggvénytől függene (és minden méréssel
  //* újraépülne).
  const remeasureRef = useRef<() => void>(() => {});
  //* A köteg SAJÁT igazsága arról, melyik napon áll. A `index` prop ugyanezt
  //* mondja, de egy képkockával később — a rugó indítása nem várhat rá.
  const committedRef = useRef(index);
  const [dragging, setDragging] = useState(false);

  const x = useMotionValue(0);
  const height = useMotionValue(0);
  const reduced = useReducedMotion();
  const count = keys.length;

  //! A MAGASSÁG IS KÖVETI AZ UJJAT. A napok nem egyforma hosszúak; ha a köteg
  //! magassága csak a lapozás VÉGÉN váltana, a lap alja a mozdulat közben egy
  //! helyben állna, majd rándulna egyet. Két szomszédos nap közt ezért
  //! interpolálunk — ugyanabból a tört indexből, amiből a jelölő is dolgozik.
  const sync = useCallback(() => {
    const width = widthRef.current;
    const heights = heightsRef.current;
    if (width <= 0 || heights.length === 0) return;
    const raw = Math.min(Math.max(-x.get() / width, 0), heights.length - 1);
    //! NYUGALOMBAN PONTOS, NEM KÖZELÍTŐLEG. A lapok `absolute`-ok, tehát a
    //! köteg magasságát NEM a tartalom adja: amit ide írunk, az a vágás helye.
    //! Egy interpolált magasság ezért nem esztétikai kérdés — fél képpontnyi
    //! elcsúszás a tört indexben már két nap magassága KÖZÉ esik, és ha a
    //! szomszéd nap rövidebb, a mai nap utolsó órája belelóg a levágásba.
    //! Amíg tehát nem az ujj mozgatja a köteget, a magasság pontosan az AKTÍV
    //! lapé; a keverés csak a mozdulat idejére kapcsol be.
    const settled = !dragRef.current?.active && !runningRef.current;
    const pos = settled ? committedRef.current : raw;
    const lower = Math.floor(pos);
    const t = pos - lower;
    const a = heights[lower] ?? 0;
    const b = heights[Math.min(lower + 1, heights.length - 1)] ?? a;
    height.set(a + (b - a) * t);
    progress?.set(pos);
  }, [x, height, progress]);

  useMotionValueEvent(x, "change", sync);

  //! ÚJRAMÉRÉS AZOKBAN A PILLANATOKBAN, AMIKOR SZÁMÍT. A lapok `absolute`-ok,
  //! tehát a köteg magassága MÉRT adat, nem a tartalomból következő — és egy
  //! elavult mérés itt nem pontatlanság, hanem levágott utolsó óra. Mérni
  //! viszont nem lehet képkockánként (elrendezés-olvasás), ezért pontosan
  //! három alkalom van rá: az első kirajzolás, minden méretváltozás, és a
  //! lapozás VÉGE. Az utolsó a legfontosabb: amíg a rugó fut, a magasság két
  //! nap közt keveredik, és ha az érkezés után semmi nem számolna újra, a
  //! köteg örökre a keverék magasságán állna.
  const remeasure = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    widthRef.current = viewport.clientWidth;
    heightsRef.current = panelsRef.current.map((p) => p?.offsetHeight ?? 0);
    sync();
  }, [sync]);
  remeasureRef.current = remeasure;

  //! A LAP TARTALMA MAGÁTÓL IS MAGASABB LESZ. A hero a kliens órájára vár: amíg
  //! nincs `clock`, a `NowBlock` egy 176 képpontos üres helyet tart, és csak az
  //! első óraütés után rajzolja meg a valódi blokkot — mérve 28 képpont
  //! különbség. Aki csak a csatoláskor mér, az a HELYFENNTARTÓ magasságát írja
  //! be a kötegnek, és onnantól 28 képpontnyi holt sáv áll a nap alatt (vagy —
  //! ha a különbség fordítva esik — levágja az utolsó órát).
  //!
  //! A `ResizeObserver` ezt elkapná, de az a böngésző rajzolási ciklusához
  //! kötött; ez a mérés viszont a React-commit UTÁN fut le, tehát pontosan
  //! akkor, amikor a magasság megváltozhatott. Öt `offsetHeight`-olvasás
  //! rajzolásonként — a köteg cserébe nem tud elavult magassággal megállni.
  useLayoutEffect(remeasure);

  //* A méret a lap sajátja, nem a diáké: ha változik (forgatás, ablakméret,
  //* kinyíló panel), a köteg ÁTMENET NÉLKÜL áll a helyére.
  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const onResize = () => {
      widthRef.current = viewport.clientWidth;
      if (!dragRef.current?.active && !runningRef.current) {
        x.jump(-committedRef.current * widthRef.current);
      }
      remeasure();
    };
    onResize();
    const observer = new ResizeObserver(onResize);
    observer.observe(viewport);
    for (const panel of panelsRef.current) if (panel) observer.observe(panel);
    return () => observer.disconnect();
  }, [x, remeasure]);

  const settle = useCallback(
    (next: number, velocity: number, fromGesture: boolean) => {
      const width = widthRef.current;
      committedRef.current = next;
      onIndexChange(next);
      runningRef.current?.stop();
      if (width <= 0) {
        runningRef.current = null;
        return;
      }
      runningRef.current = animate(
        x,
        -next * width,
        reduced
          ? //! CSÖKKENTETT MOZGÁS: túllövés nélkül, rövidebben. A megállást
            //! magát nem lehet kivágni — az ujj a mozdulat közepén engedte el,
            //! egy odavágás onnan rándulás lenne, nem nyugalom.
            { type: "spring", bounce: 0, duration: 0.2, velocity }
          : fromGesture
            ? //! PÖCCINTÉS UTÁN EGY KIS TÚLLÖVÉS — mert a mozdulat FIZIKAI volt.
              //! A rugó átveszi az ujj sebességét, így nincs varrat a húzás és
              //! az animáció között.
              { type: "spring", bounce: 0.2, duration: 0.4, velocity }
            : //! KOPPINTÁSRA NINCS TÚLLÖVÉS. A napsávból vagy a heti panelből
              //! indított váltás mögött nincs lendület; egy visszaugrás ott
              //! nem fizika, csak modor.
              { type: "spring", bounce: 0, duration: 0.4 },
      );
      runningRef.current.then(() => {
        runningRef.current = null;
        remeasureRef.current();
      });
    },
    [x, onIndexChange, reduced],
  );

  //* Kívülről érkező napváltás (napsáv, „A hét" panel, „Ma" gomb).
  useEffect(() => {
    if (index === committedRef.current) return;
    committedRef.current = index;
    runningRef.current?.stop();
    const width = widthRef.current;
    if (width <= 0) return;
    if (reduced) {
      x.jump(-index * width);
      runningRef.current = null;
      remeasureRef.current();
      return;
    }
    runningRef.current = animate(x, -index * width, {
      type: "spring",
      bounce: 0,
      duration: 0.4,
    });
    runningRef.current.then(() => {
      runningRef.current = null;
      remeasureRef.current();
    });
  }, [index, x, reduced]);

  const bounded = useCallback(
    (raw: number) => {
      const width = widthRef.current || 1;
      const min = -(count - 1) * width;
      if (raw > 0) return rubberband(raw, width);
      if (raw < min) return min + rubberband(raw - min, width);
      return raw;
    },
    [count],
  );

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    //! MEGFOGHATÓ MENET KÖZBEN. Ez a sor a lényeg: a futó rugó itt áll meg, és
    //! a húzás onnan folytatódik, AHOL A LAP ÉPP VAN.
    runningRef.current?.stop();
    runningRef.current = null;
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      base: x.get(),
      active: false,
      abandoned: false,
      samples: [{ x: event.clientX, t: performance.now() }],
    };
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId || drag.abandoned) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;

    if (!drag.active) {
      //! MINDKÉT MOZDULATOT EGYSZERRE FIGYELJÜK, aztán a vesztest visszavonjuk.
      //! A görgetés és a lapozás ugyanabból az indulásból jön; ha előre
      //! eldöntenénk, az egyik mindig félresikerülne. A függőleges ág nem is
      //! nálunk fut le: a `touch-action: pan-y` a böngészőre hagyja, mi csak
      //! kiszállunk belőle.
      if (Math.abs(dy) > DRAG_THRESHOLD && Math.abs(dy) >= Math.abs(dx)) {
        drag.abandoned = true;
        return;
      }
      if (Math.abs(dx) < DRAG_THRESHOLD || Math.abs(dx) <= Math.abs(dy)) return;
      drag.active = true;
      setDragging(true);
      //* A követés akkor sem szakad meg, ha az ujj kifut a köteg fölül.
      event.currentTarget.setPointerCapture(event.pointerId);
    }

    const now = performance.now();
    drag.samples.push({ x: event.clientX, t: now });
    while (
      drag.samples.length > 2 &&
      now - drag.samples[0].t > VELOCITY_WINDOW_MS
    ) {
      drag.samples.shift();
    }
    x.set(bounded(drag.base + dx));
  };

  const onPointerFinish = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    //* Nem húzás volt, hanem koppintás: a kártya saját gombja intézi el.
    if (!drag.active) return;
    setDragging(false);

    const width = widthRef.current || 1;
    const first = drag.samples[0];
    const last = drag.samples[drag.samples.length - 1];
    const elapsed = last.t - first.t;
    const velocity = elapsed > 0 ? ((last.x - first.x) / elapsed) * 1000 : 0;
    //! ODA LAPOZUNK, AHOVA A MOZDULAT TARTOTT — nem oda, ahol elengedték. Ez
    //! az a különbség, amitől a pöccintés DOB egyet a lapon, ahelyett hogy a
    //! legközelebbi szomszédhoz csúszna.
    const projected = x.get() + project(velocity);
    const next = Math.min(
      Math.max(Math.round(-projected / width), 0),
      count - 1,
    );
    settle(next, velocity, true);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    //* A natív vezérlők saját nyilai maradnak az övék.
    const target = event.target as HTMLElement;
    if (target.closest("input, select, textarea, [contenteditable]")) return;
    const next = Math.min(
      Math.max(index + (event.key === "ArrowRight" ? 1 : -1), 0),
      count - 1,
    );
    if (next === index) return;
    event.preventDefault();
    settle(next, 0, false);
  };

  return (
    <motion.div
      ref={viewportRef}
      style={{ height, touchAction: "pan-y" }}
      className={cn("relative overflow-hidden", className)}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerFinish}
      onPointerCancel={onPointerFinish}
      onKeyDown={onKeyDown}
    >
      <motion.div className="absolute inset-x-0 top-0" style={{ x }}>
        {keys.map((key, i) => (
          <div
            key={key}
            ref={(el) => {
              panelsRef.current[i] = el;
            }}
            role="tabpanel"
            id={`day-panel-${i}`}
            aria-labelledby={`day-tab-${i}`}
            //! A HÁTTÉRBEN ÁLLÓ NAPOK NEM LÉTEZNEK — se a tabulátornak, se a
            //! képernyőolvasónak. Az `inert` mindkettőt egyszerre intézi el;
            //! `aria-hidden` egyedül csak az olvasót zárná ki, a fókusz
            //! továbbra is beleszaladna egy láthatatlan nap gombjaiba.
            inert={i !== index}
            className={cn(
              "absolute top-0 w-full",
              //* Húzás közben a szövegkijelölés a mozdulat ellen dolgozik —
              //* nyugalomban viszont a diáké a terem száma, ki lehessen másolni.
              dragging && "select-none",
            )}
            style={{ left: `${i * 100}%` }}
          >
            {renderPanel(i)}
          </div>
        ))}
      </motion.div>
    </motion.div>
  );
}
