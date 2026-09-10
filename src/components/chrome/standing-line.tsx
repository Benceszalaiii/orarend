"use client";

import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  DoorOpen,
  GraduationCap,
  House,
  type LucideIcon,
  ShieldCheck,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { AccountMenu } from "@/components/account-menu";
import { AppearanceMenu } from "@/components/appearance/appearance-menu";
import {
  SheetDivider,
  SheetItemBody,
  SheetSection,
  sheetItem,
} from "@/components/chrome/chrome-sheet";
import {
  DEFAULT_IDENTITY,
  type Identity,
  loadIdentity,
  saveIdentity,
  weekRouteFor,
} from "@/lib/identity";
import { isViewRoute, saveLastView } from "@/lib/last-view";
import { onPrefsChanged } from "@/lib/prefs-events";
import { cn } from "@/lib/utils";

//! ═══════════════════════════════════════════════════════════════════════════
//! AZ ÁLLÓ SOR — A FEJLÉC EGYETLEN SORA, MINDEN LAPON
//! ═══════════════════════════════════════════════════════════════════════════
//! MIÉRT NEM ESZKÖZTÁR. A régi sáv laponként nőtt: minden új képesség kapott
//! benne egy gombot, és a sáv addig tördelt, amíg el nem fogyott a lap. Mérve,
//! 2026-09-04-én, éles fejlesztői kiszolgálón:
//!
//!   `/ma`, 375 px-es kijelző → a DOKUMENTUM 445 px széles. A jobb oldali
//!   csoport (harang + osztály + nyitólap + három pirula + fiók) 434 px egy
//!   351 px-es belméretben, és MINDEN gyereke `shrink-0`. A „Tanári" pirula
//!   levágva, a fiókgomb teljesen a képernyőn kívül.
//!
//!   `/orarend`, 375 px → 171 px eszköztár + 133 px ragadó blokk = 304 px a
//!   812-ből. A képernyő 37%-a elmegy, mielőtt EGY óra látszana. A 171 px
//!   ugyanaz a szám, amit a `toolbar-more.tsx` a saját bevezetésével akart
//!   megszüntetni — vagyis a „rejtsünk el négy gombot" válasz nem elég.
//!
//! A BAJ NEM A GOMBOK SZÁMA VOLT, HANEM A SZERKEZET. A váltó két, egymásra
//! merőleges kérdést mosott össze egyetlen pirulasorba: KIÉ az órarend
//! (osztály vagy tanár) és MELYIK nézet (hét vagy ma). Az `/orarend` és a
//! `/tanari` ugyanaz a komponens, csak más `mode`-dal — a negyedik cellának
//! (tanári „Ma") viszont nem maradt hely, csak egy NEGYEDIK pirula egy már
//! túlcsorduló sávban.
//!
//! EZÉRT A FEJLÉC EGY SOR, ÉS A SOR EGY MONDAT: „13C · aug. 31 – szept. 4."
//! Megmondja, kinek és melyik hetét nézed, és ő maga a kapu MINDENHEZ — rá
//! koppintva egy lap nyílik, amiben az alany, a hét és a ritkán nyúlt
//! beállítások gyakoriság szerint vannak sorba rakva.
//!
//! MIÉRT NEM TUD ÚJRA TÚLCSORDULNI. A sor csonkul (`min-w-0` + `truncate`), a
//! jobb oldali csoport pedig FIX: a négycellás váltó (~151 px, lásd
//! `ViewMatrix`) és — ahol nincs lap — a fiók (44 px). 375 px-en a sornak
//! marad ~192 px, fiókkal együtt is ~148. Rajta kívül semmi nem `shrink-0`,
//! tehát a fejléc szélessége a lapok számától független marad.
//! ═══════════════════════════════════════════════════════════════════════════

//! A SÁV MÉRTANA EGY HELYEN ÁLL, ÉS MINDEN LAP INNEN VESZI. Ez a régi
//! `site-nav.tsx` legfontosabb tanulsága, és változatlanul érvényes: a váltó az
//! egyetlen vezérlő, amit egymás után kétszer nyomnak meg (egyszer, hogy
//! elmenj, egyszer, hogy visszagyere). Ha a két lapon máshol van, a második
//! koppintás a semmibe megy. Mérve a régi javítás előtt: 99 px függőleges és
//! 141 px vízszintes ugrás a két lap között.
export const SITE_BAR_MAX = "max-w-[120rem]";
export const SITE_BAR_METRICS = "gap-x-2 px-3 sm:gap-x-3 sm:px-4";

//! ─── A VÁLTÓ — KIÉ ÉS MELYIK, EGY TÁRGYBAN ────────────────────────────────
//! A KÉT KÉRDÉS MERŐLEGES, DE NEM FÜGGETLEN — EZ AZ, AMIT AZ ELŐZŐ VÁLTOZAT
//! ELVÉTETT. Ott az alany a LAPBA került („Kit nézel"), a nézetek a SÁVBAN
//! maradtak, abból az érvből, hogy a diák az alanyhoz soha nem nyúl. Az érv
//! igaz, a következtetés nem: attól, hogy ritkán állítod, még ugyanannak a
//! címnek a másik fele. „13C hete" és „Kovács B. hete" ugyanaz a mondat két
//! alannyal. Ha a mondat egyik fele a sávban áll, a másik meg egy koppintás
//! mögött, akkor a diák nem CÍMET lát, hanem két különálló vezérlőt — és a
//! „Hét" pirulán nem látszik, hogy két különböző lapra visz.
//!
//! EZÉRT EGY TOK, KÉT SZAKASZ. Hajszálvonaltól balra: KIÉ (Diák / Tanár).
//! Jobbra: MELYIK (Hét / Ma). Négy cella, két tengely, egy tárgy — az a
//! mátrix, amit a felület eddig két helyen tárolt, most kimondva látszik.
//!
//! A SÚLY A TOKON BELÜL KÜLÖNBÖZIK, ÉS EZ SZÁNDÉKOS. Az alany félévente
//! változik, a nézet naponta többször: telefonon ezért az alany IKON, a nézet
//! SZÓ. Egy tokba zárva sem lesznek egyenrangúak — csak összetartozók. `sm`-től
//! az ikon mellé a szó is kifér, és akkor négy nevesített cella áll ott.
//!
//! MIÉRT NEM CSORDUL TÚL EZZEL SEM. 375 px-en a tok ~151 px (két 30 px-es
//! ikoncella + 9 px válaszfal + „Hét" 42 + „Ma" 38 + belső margó), a sornak
//! marad ~192 px — a régi 92 px-es nézetváltóhoz képest 59 px az ára. A tok
//! `shrink-0`, a sor csonkul: a szerkezeti biztosíték változatlan, és a sor
//! ebből még mindig kimondja az alanyt és a hét felét („13C · aug. 31 – s…").
//!
//! A NEGYEDIK CELLA MOST MÁR VAN, ÉS NEM ÚJ ÚTVONALON. Az alany tárolt
//! beállítás (`lib/identity.ts`), nem útvonalrész; a `/ma` abból dolgozik.
//! A mátrix ezért jelentésben nőtt teljessé, nem címtérben.
type ViewId = "week" | "today";

const VIEWS: readonly { id: ViewId; label: string; title: string }[] = [
  { id: "week", label: "Hét", title: "A teljes heti órarend" },
  { id: "today", label: "Ma", title: "A mai nap egy képernyőn" },
];

//* A tanári rács ugyanaz a NÉZET, más alannyal — ezért ő is a „Hét"-et
//* világítja meg. Ami nincs a táblázatban (nyitólap, designlap), ott egyik
//* cella sem aktív: ott nem nézed egyik nézetet sem, csak elérheted őket.
const VIEW_OF: Record<string, ViewId> = {
  "/orarend": "week",
  "/tanari": "week",
  "/ma": "today",
};

const IDENTITIES: readonly {
  id: Identity;
  label: string;
  title: string;
  icon: LucideIcon;
}[] = [
  {
    id: "class",
    label: "Diák",
    title: "Osztály órarendje",
    icon: Users,
  },
  {
    id: "teacher",
    label: "Tanár",
    title: "Tanár órarendje",
    icon: GraduationCap,
  },
];

//* Az útvonal, ahol az alanyra maga a cím válaszol. A `/ma` szándékosan nincs
//* benne: az EGY útvonal mindkét alanynak (lásd `lib/identity.ts`).
const IDENTITY_OF: Record<string, Identity> = {
  "/orarend": "class",
  "/tanari": "teacher",
};

//! ─── A LAP CSAK OTT VAN, AHOL KELL ────────────────────────────────────────
//! A LAPOT EGY 375 PX-ES MÉRÉS SZÜLTE, ÉS ELŐSZÖR MINDEN MÉRETRE ÉRVÉNYES
//! VOLT — ez hiba volt. 1280 px-en a sáv közepén ~700 px üresen állt, miközben
//! az osztályválasztó, a naptár és a négy beállítás EGY koppintás mögé volt
//! rejtve. Progresszív feltárás ott, ahol nincs miért: a kattintás ára megvan,
//! a haszna nincs.
//*
//! ÉS A MAGASSÁG NEM AZ ELLENSÉG — EZT ELŐSZÖR ELRONTOTTAM. Az eredeti 304 px
//! nem attól volt rossz, hogy HÁROM sor volt, hanem attól, hogy tizenkét
//! vezérlő állt benne azonos súllyal, csoport és felirat nélkül. Egy sorba
//! zsúfolni mindent ugyanaz a hiba másik irányból: 1440 px-en a teljes
//! vízszintes sáv (1033 px) a SORT nyomta össze „2026. aug…"-ra, vagyis épp azt
//! a dátumot, amit ki kellene mondania.
//*
//! ASZTALON EZÉRT KÉT SOR VAN, RANGSORRAL. A felső sor AZT MONDJA MEG, HOL
//! VAGY: alany, dátum, léptetők, nézetváltó — címsúlyú betű. Az alsó sor AZT,
//! MIT TEHETSZ: identitás, osztály, naptár, majd a nevesített műveletek —
//! halkabb, kisebb, saját csoportokban. A kettőt hajszálvonal választja el. 40
//! px egy 900 px-es asztali képernyőn 4%: a rangsor ennyit bőven megér, és
//! semmi nem tűnik el egy kattintás mögé.
//*
//! TELEFONON VISZONT MARAD AZ EGY SOR + LAP. Ott a második sor abból a 812
//! px-ből menne el, amiből az órarendnek kell élnie — ez volt az eredeti baj.
//! A küszöb mért: a műveletsor 1033 px, oldalmargóval 1065 — 80rem-től fér ki — ugyanaz a React-elem, két alak,
//! egyetlen példányban (ezért kell a médialekérdezés JS-ben: két párhuzamos
//! példány két állapotot és két azonos `id`-t jelentene).
//*
//* Mobil-első alapérték: kiszolgálón és az első képkockán a keskeny alak fut,
//* és csak utána vált — így a hidratálás nem talál eltérést.
function useWideChrome(): boolean {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 80rem)");
    const sync = () => setWide(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return wide;
}

export type LineContent = {
  /** Az alany, ahogy a sor elején áll: „13C" vagy „Kovács B." */
  subject: string;
  /** A hely az adatban: „aug. 31 – szept. 4." vagy „P 09.04". */
  context?: string;
  /** Az A/B hét betűje, ha a nézett héten értelmezhető. */
  weekLetter?: string;
  /** Hány összevonás SZŰR ki órát a nézetből (lásd lentebb). */
  filtered?: number;
  /** Igaz, ha nem a mai héten/napon állunk — ilyenkor jön elő a „Ma". */
  offCurrent?: boolean;
  onReturn?: () => void;
  //! A GOMB AZT MONDJA, AHOVA VISZ. Hétvégén a visszatérés nem a mai hétre
  //! megy, hanem a következőre (lásd `focusMondayKey`) — ott a „Ma" hazudna.
  //* Elhagyva marad a „Ma"; a takaró (láthatatlan) doboz UGYANEZT a szöveget
  //* kapja, hogy a léptető nyilak helye a felirattól se csússzon el.
  returnLabel?: string;
  returnTitle?: string;
  /** Asztali `‹ ›`. Elhagyva nincs léptető. */
  onStep?: (direction: -1 | 1) => void;
  disabled?: boolean;
};

export function StandingLine({
  line,
  sheet,
  surface = "bar",
  className,
}: {
  line?: LineContent;
  /** Amit a sorra koppintva kinyíló lap tartalmaz. Enélkül a sor nem gomb. */
  sheet?: React.ReactNode;
  surface?: "bar" | "floating";
  className?: string;
}) {
  const pathname = usePathname();
  const floating = surface === "floating";
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const sheetId = useId();
  const wide = useWideChrome();
  //* Sáv-alakban nincs mit kinyitni: a tartalom kint van.
  const collapsible = Boolean(sheet) && !wide;

  //! A FIÓK MINDKÉT ALAKBAN UGYANONNAN JÖN. Amíg csak a buborékba volt
  //! beágyazva, sáv-alakban NYOMTALANUL eltűnt — a belépés elérhetetlenné vált
  //! asztali gépen. A törzs ezért egy helyen áll össze, és a két tároló
  //! (buborék vagy sáv) ugyanazt kapja.
  const sheetBody = sheet ? (
    <>
      {sheet}
      <SheetDivider />
      {/*//! A NYITÓLAP NEM KAP IKONT A SÁVBAN, ÉS EZ NEM FELEDÉKENYSÉG. A régi
          //! sávban egy `House` ikon állt a váltó mellett, felirat nélkül — az
          //! egyik a nyolc néma ikonból, ami a 375 px-es túlcsordulást
          //! okozta (lásd fentebb a mérést). A visszaút viszont KELL: a `/home`
          //! ma az egyetlen lap, ahonnan semmi nem vezet vissza, mert a
          //! lábléc is csak a `/valtozasok`-ra és az `/adatvedelem`-re mutat.
          //*
          //! EZÉRT ITT VAN, NÉVVEL KIÍRVA — pontosan az a csere, amit a jobb
          //! oldali csoport megjegyzése ígér. A helye a lap alján van, a fiók
          //! mellett: a nyitólap nem NÉZET ugyanarra az adatra (az a váltó
          //! dolga), hanem a lapról szóló hivatkozás, amihez félévente egyszer
          //! nyúlnak. Sáv-alakban ugyanez egy pirula lesz a műveletsor végén
          //! (`.chrome-rail .sheet-item`, lásd `globals.css`). */}
      <SheetSection title="Az oldal">
        {/*//! A MEGJELENÉS AZ „AZ OLDAL" SZAKASZBA TARTOZIK, NEM A NÉZETEK
            //! MELLÉ. A világos/sötét és a tantárgyszínek nem arról szólnak,
            //! KIT vagy MELYIK HETET nézed — a lapról magáról szólnak, ahogy a
            //! nyitólapra vezető hivatkozás is. A szakasz sorrendje pedig itt
            //! is gyakoriság szerinti: a témát váltogatják, a nyitólapra
            //! félévente mennek vissza. */}
        <AppearanceMenu />
        <Link
          href="/home"
          title="Nyitólap — mit tud ez az órarend"
          className={sheetItem()}
        >
          <House
            aria-hidden
            className="size-4 shrink-0 text-muted-foreground"
          />
          <SheetItemBody label="Nyitólap" hint="Mit tud ez az órarend" />
        </Link>
        {/*//! A KÉT MELLÉKLAP A NYITÓLAP ALÁ KERÜL, NEM A VÁLTÓBA. Az ügyelet
            //! és a teremkereső NEM ugyanarra az adatra néző NÉZET — nem az a
            //! kérdés, kinek és melyik hetét mutatják, hanem az iskoláról
            //! mondanak valamit, amit az órarend rácsa nem tud. A `ViewMatrix`
            //! négy cellája pont attól olvasható tengelynek, hogy CSAK az
            //! alany és a nézet van benne; egy ötödik-hatodik cella
            //! visszahozná a régi, rendezetlen pirulasort.
            //*
            //! ITT VISZONT KELL EGY ÚT HOZZÁJUK: eddig egyik lapról sem
            //! vezetett rájuk hivatkozás — csak a beírt cím. Ugyanaz az érv,
            //! amiért a nyitólap is ide került, egy sorral feljebb.
            //*
            //! `sheet-item-aside`: A SÁV-ALAKBÓL VISZONT KIMARADNAK. A két
            //! pirula 240 px, amitől az `/orarend` műveletsora 1280 px-en
            //! 1212-ről 1452-re nőne — 172 px a képernyőn kívül. A lap
            //! (80rem alatt) mindkettőt viszi; a szabály és az ára a
            //! `globals.css`-ben, a `.chrome-rail .sheet-item-aside`-nál. */}
        <Link
          href="/ugyelet"
          title="Ügyelet — ki ügyel most, és melyik folyosón"
          className={sheetItem("sheet-item-aside")}
        >
          <ShieldCheck
            aria-hidden
            className="size-4 shrink-0 text-muted-foreground"
          />
          <SheetItemBody label="Ügyelet" hint="Ki ügyel most, és hol" />
        </Link>
        <Link
          href="/teremkereso"
          title="Teremkereső — melyik terem üres most"
          className={sheetItem("sheet-item-aside")}
        >
          <DoorOpen
            aria-hidden
            className="size-4 shrink-0 text-muted-foreground"
          />
          <SheetItemBody label="Teremkereső" hint="Melyik terem üres most" />
        </Link>
      </SheetSection>
      <SheetDivider />
      {/*//! A FIÓK IS EGY SOR, NEM SORBA TETT GOMB: a gomb veszi fel a sor
          //! alakját, a felirat a gombON BELÜL van. A sor a belépés OKÁT
          //! mondja ki, nem a műveletet — a diáknak nem „fiókra" van
          //! szüksége, hanem arra, hogy a telefonján beállított összevonások a
          //! gépén is meglegyenek. */}
      <SheetSection title="Fiók">
        <AccountMenu variant="row" />
      </SheetSection>
    </>
  ) : null;

  //! A VÁLTÓ AZ EGYETLEN HELY, AHOL MINDEN NÉZET ÁTMEGY — ezért itt jegyezzük
  //! meg, melyiket nézte utoljára a diák, hogy a `/` oda vigye vissza.
  //*
  //! EZ EGYBEN A NYITÓLAP KAPCSOLÓJA IS. Az első ilyen mentés írja meg azt a
  //! sütit, amiből a `proxy.ts` megtudja, hogy ez a böngésző már TÚL VAN a
  //! bemutatkozáson — onnantól a `/` nem a nyitólapot mutatja neki, hanem a
  //! saját nézetét (lásd `lib/last-view.ts`).
  useEffect(() => {
    if (isViewRoute(pathname)) saveLastView(pathname);
  }, [pathname]);

  //* A lap becsukása kívülről. A logika a `toolbar-more.tsx`-ből jön, és
  //* szándékosan ugyanaz: a lapban álló vezérlők MIND saját buborékot vagy
  //* párbeszédet nyitnak, azok portálba kerülnek, és a rájuk eső koppintás a
  //* lap HASZNÁLATA, nem az elhagyása.
  useEffect(() => {
    if (!open) return;
    const layered =
      "[role=dialog],[role=alertdialog],[data-slot=popover-content],[data-radix-popper-content-wrapper]";
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      //! AZ ESC A LEGFELSŐ RÉTEGET CSUKJA BE, NEM MINDET.
      if (document.querySelector(layered)) return;
      setOpen(false);
    };
    const onDown = (event: PointerEvent) => {
      const target = event.target as Element | null;
      if (!target) return;
      if (boxRef.current?.contains(target)) return;
      if (target.closest(layered)) return;
      setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown, true);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown, true);
    };
  }, [open]);

  //* Lapváltáskor a lap magától becsukódik: ami benne állt, a másik nézetről
  //* szólt.
  // biome-ignore lint/correctness/useExhaustiveDependencies: az útvonal a jel
  useEffect(() => setOpen(false), [pathname]);

  return (
    <div
      ref={boxRef}
      className={cn(
        "relative w-full",
        !floating && "flex flex-col",
        floating && "flex items-center",
        floating && SITE_BAR_METRICS,
        floating &&
          //! A LEBEGŐ ALAK SAJÁT, ZÁRT SZÍNVILÁGOT KAP (`.nav-glass`). A lap
          //! alatta papírról kobaltra válthat; a vezérlők kódja egy sorral sem
          //! változik tőle.
          "nav-glass h-auto w-auto gap-1 rounded-full border border-white/14 bg-[oklch(0.17_0.014_250/0.82)] px-1 py-1 shadow-[0_10px_30px_-14px_oklch(0_0_0/0.8)] backdrop-blur-xl",
        className,
      )}
    >
      {/*//! ELSŐ SOR — HOL VAGY. */}
      <div
        className={cn(
          "flex h-11 w-full items-center",
          !floating && SITE_BAR_METRICS,
        )}
      >
        {line ? (
          //! A LÉPTETŐK A DÁTUMOT FOGJÁK KÖZRE, NEM A SÁVOT. Amíg a `‹` és a
          //! `›` a sor KÜLSŐ két oldalán állt, a nyúló sor széthúzta őket:
          //! 1440 px-en ~1200 px választotta el a két nyilat egymástól —
          //! egy összetartozó páros a képernyő két végén. Egy csoportban
          //! maradnak ezért, a sorral együtt.
          //*
          //! A CSOPORT NYÚLIK, NEM A TARTALMÁHOZ IGAZODIK — ÉS EZ HIBAJAVÍTÁS.
          //! Amíg `xl`-től `flex-none` volt, a csoport szélessége a benne álló
          //! SZÖVEGÉ lett, a szöveg pedig hetente más hosszú: mérve 1440 px-en
          //! a „›" 317.9 px-ről 330.8-ra ugrott egyetlen lapozástól. Vagyis a
          //! lapozó nyíl a lapozás hatására csúszott ki az ujj alól. Nyúló
          //! csoportban a szélesség a sávtól függ, nem a dátumtól; a felső
          //! korlát (`34rem`) pedig gondoskodik arról, hogy széles kijelzőn se
          //! szakadjon el egymástól a két nyíl. A csonkulást a dátum viseli —
          //! abból egy fél is olvasható (lásd `LineButton`).
          <div className="flex min-w-0 flex-1 items-center gap-1.5 xl:max-w-[34rem]">
            {/*//! ASZTALON A LÉPTETŐ A SOR MELLETT MARAD. A hetelés tervezés
              //! közben másodpercenkénti művelet; egy lap mögé tenni ott
              //! büntetés. Telefonon nincs: ott a rács húzása lapoz, és a 44
              //! px-es célpontokra nincs hely a sor mellett. */}
            {line.onStep && (
              <button
                type="button"
                aria-label="Előző hét"
                title="Előző hét (←)"
                disabled={line.disabled}
                onClick={() => line.onStep?.(-1)}
                className={cn(STEP, "max-sm:hidden")}
              >
                <ChevronLeft className="size-4" aria-hidden />
              </button>
            )}

            <div className="flex min-w-0 flex-1 items-center gap-1.5">
              <LineButton
                line={line}
                open={open}
                sheetId={sheetId}
                interactive={collapsible}
                onToggle={() => setOpen((v) => !v)}
              />
            </div>

            {line.onStep && (
              <button
                type="button"
                aria-label="Következő hét"
                title="Következő hét (→)"
                disabled={line.disabled}
                onClick={() => line.onStep?.(1)}
                className={cn(STEP, "max-sm:hidden")}
              >
                <ChevronRight className="size-4" aria-hidden />
              </button>
            )}

            {/*//! A „MA" A LÉPTETŐK UTÁN ÁLL, ÉS EZ NEM ELRENDEZÉSI ÍZLÉS,
              //! HANEM HIBAJAVÍTÁS. A gomb CSAK akkor létezik, ha elnavigáltunk
              //! — vagyis lapozás közben jelenik meg és tűnik el. Ha bárhol a
              //! nyilak ELŐTT állna, a megjelenése odébb tolná a „következő
              //! hét" nyilat: a mai hétről egyet előrelapozva a nyíl kicsúszna
              //! az ujj alól, és a második koppintás már nem lapozna, hanem a
              //! „Ma"-t találná el — visszaugrás oda, ahonnan indultunk.
              //*
              //! A SOR MINDEN VÁLTOZÓ SZÉLESSÉGŰ RÉSZE A NYILAKON KÍVÜLRE
              //! KERÜL ÍGY: a csonkuló dátum a `flex-1` dobozba balra, a „Ma"
              //! a sor végére. A két léptető minden héten ugyanannál az x-nél
              //! marad, akkor is, amikor a „Ma" villan be melléjük. */}
            {line.onReturn &&
              (line.offCurrent ? (
                <button
                  type="button"
                  title={line.returnTitle ?? "Mai hét (T)"}
                  disabled={line.disabled}
                  onClick={line.onReturn}
                  className={cn(
                    RETURN_PILL,
                    "bg-brand/15 text-brand transition-colors hover:bg-brand/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none",
                  )}
                >
                  {line.returnLabel ?? "Ma"}
                </button>
              ) : (
                //! AHOL LÉPTETŐ VAN, OTT A HELYE AKKOR IS MEGVAN, AMIKOR Ő
                //! NINCS. A sor alatta `flex-1`: ha a „Ma" csak megjelenne, a
                //! sor annyival keskenyebb lenne, és a `›` BALRA csúszna — épp
                //! lapozás közben, az ujj alól. Egy ugyanakkora, láthatatlan
                //! dobozzal a nyíl minden héten ugyanannál az x-nél marad.
                //*
                //* Telefonon nincs léptető, tehát nincs mit a helyén tartani:
                //* ott a hely eltűnik a gombbal együtt (`max-sm:hidden`), és
                //* nem eszik a sávból.
                <span
                  aria-hidden
                  className={cn(RETURN_PILL, "invisible max-sm:hidden")}
                >
                  {line.returnLabel ?? "Ma"}
                </span>
              ))}
          </div>
        ) : (
          //* Sor nélkül (nyitólap, designlap) a csoport jobbra tapad — a lebegő
          //* táblán viszont nincs mit kitölteni: ott a tábla maga akkora, mint a
          //* benne álló vezérlők.
          !floating && <span className="min-w-0 flex-1" />
        )}

        {/*//* A sor csoportja `xl`-től a tartalmához igazodik — ez tolja a
            //* nézetváltót a sáv jobb végére. */}
        {line && <span aria-hidden className="hidden flex-1 xl:block" />}

        {/*//! A JOBB OLDALI CSOPORT FIX SZÉLESSÉGŰ, ÉS EZ A TÚLCSORDULÁS ELLENI
          //! BIZTOSÍTÉK. Két pirula és a fiók — se harang, se osztályválasztó,
          //! se nyitólap-ikon. Ami kimaradt, az a lapban van, névvel kiírva. */}
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <ViewMatrix floating={floating} />
          {/*//! A FIÓK NEM NÉZET, ÉS NEM IS A NÉZETEK TESTVÉRE. A belépésnek
            //! ebben az alkalmazásban EGYETLEN haszna van: átviszi a
            //! beállításokat a másik készülékre (lásd `account-menu.tsx` —
            //! „a belépés itt eszköz, nem cél"). Egy szinkron-kapcsoló viszont
            //! nem érdemel állandó helyet a sávban a „Hét" és a „Ma" mellett:
            //! ott azt ígéri, hogy a lap harmadik fő funkciója.
            //*
            //! EZÉRT A LAPBA KÖLTÖZIK, A SAJÁT NEVE ALÁ — és cserébe 44 px
            //! szabadul fel a sornak minden képernyőn. Ahol NINCS lap (a
            //! nyitólap lebegő táblája), ott marad a helyén: ott a lap az
            //! egyetlen hely, ahol egyáltalán elérhető lenne. */}
          {!sheet && <AccountMenu />}
        </div>
      </div>

      {/*//! MÁSODIK SOR — MIT TEHETSZ. Ugyanaz a `sheetBody`, csak nem
          //! buborékban: a `.chrome-rail` vízszintes, tömör alakra állítja a
          //! szakaszokat (szakaszcím és magyarázat elmarad, a sorokból pirula
          //! lesz) — lásd `globals.css`. A csoportosítás megmarad: a szakaszok
          //! külön csoportként állnak egymás MELLETT.
          //*
          //! A RANGSOR A KÉT SOR KÖZÖTT VAN, NEM A SORON BELÜL: fent a
          //! címsúlyú állítás, itt a halkabb műveletek, közöttük hajszálvonal.
          //! Ettől olvasható a sáv anélkül, hogy bármit el kellene rejteni. */}
      {sheet && wide && (
        <div
          className={cn(
            "chrome-rail h-10 w-full border-t border-border/60",
            SITE_BAR_METRICS,
          )}
        >
          {sheetBody}
        </div>
      )}

      {/*//! A LAP NEM PORTÁLOZOTT RÉTEG, ÉS EZ SZÁNDÉKOS — ugyanaz az érv, amit
          //! a `toolbar-more.tsx` egyszer már megfizetett: a benne álló
          //! vezérlők MIND saját buborékot nyitnak, és ha a lap maga is
          //! elbocsátható réteg lenne, a belőle nyíló buborék kívülre esne, a
          //! lap becsukódna, és vele a még meg sem nyílt tartalom szerelne le a
          //! fáról. Egy sima, a saját fájában maradó doboz ezt a versenyt meg
          //! sem rendezi. */}
      {/*//! A BETÖLTÉS NEM VEHET EL HELYET. A régi sávban egy pörgő korong állt
          //! a hét címkéje mellett: megjelenéskor odébb tolta a mellette álló
          //! vezérlőket, vagyis pont abban a pillanatban mozdult el minden,
          //! amikor a diák épp a lapozó nyilat nyomkodta. Ez a csík a sáv ALSÓ
          //! ÉLÉN fut, kívül a folyamon: nulla képpontot kér, és pontosan azt a
          //! szélességet takarja, ami tölt. */}
      {line?.disabled && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 overflow-hidden"
        >
          <span className="site-bar-progress block h-full w-1/3 rounded-full bg-brand" />
        </span>
      )}

      {collapsible && open && (
        <div
          id={sheetId}
          className={cn(
            "absolute top-full right-0 z-50 mt-1 w-full max-w-[22rem] overflow-hidden rounded-2xl bg-popover text-popover-foreground shadow-[0_24px_48px_-20px_oklch(0_0_0/0.85)] ring-1 ring-border",
            "max-sm:right-1 max-sm:left-1 max-sm:w-auto max-sm:max-w-none",
          )}
        >
          <div className="max-h-[min(78dvh,40rem)] overflow-y-auto overscroll-contain p-1.5">
            {sheetBody}
          </div>
        </div>
      )}
    </div>
  );
}

const STEP =
  "flex size-8 shrink-0 touch-target items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-40 motion-reduce:transition-none";

//! A „MA" ALAKJA AZÉRT ÁLL KÜLÖN, MERT KÉTSZER KELL: egyszer a gombnak,
//! egyszer az ÜRES HELYNEK, amit a gomb távollétében is fenn kell tartani
//! (lásd a sávban a hívás helyét). Két osztálylista ugyanarra a dobozra
//! előbb-utóbb elcsúszna — és pont a szélessége a lényeg.
const RETURN_PILL =
  "shrink-0 touch-target rounded-full px-2.5 py-1 text-xs font-semibold";

//! ─── A NÉGY CELLA ─────────────────────────────────────────────────────────
//! MIND A NÉGY UGYANAZT A CELLÁT VISELI, ÉS EZ TARTJA ÖSSZE A TOKOT. Ha az
//! alany más alakot kapna, mint a nézet, a hajszálvonal két IDEGEN vezérlőt
//! választana el, nem egy tárgy két felét. Egy alak, egy aktív állapot: a
//! különbséget a tartalom hordozza (ikon kontra szó), nem a stílus.
//! `py-2`, NEM `py-1` — ÉS EZ MÉRT HIBAJAVÍTÁS. A régi nézetpirula 22 px
//! magas volt, vagyis a WCAG 2.5.8 24 px-es alsó határa ALATT: két pirulánál
//! ez épp csak megúszható volt, négynél már nem az. A sor 44 px, a tok
//! `p-0.5` — a magasabb cella ingyen van, a sáv egy képponttal sem nő tőle.
const CELL =
  "flex items-center gap-1.5 rounded-full py-2 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none";
const CELL_ON = "bg-foreground text-background";
const CELL_OFF = "text-muted-strong hover:bg-muted hover:text-foreground";

//! AZ ALANYRA ELŐSZÖR AZ ÚTVONAL VÁLASZOL, ÉS CSAK UTÁNA A TÁROLÓ. Az
//! `/orarend` és a `/tanari` MAGA a válasz — ott a tárolót megkérdezni annyi
//! lenne, mint nyitott ajtón kopogni, és egy lassú `localStorage`-olvasás
//! villanásnyi rossz cellát is villantana. A `/ma` viszont EGY útvonal
//! mindkét alanynak: ott a tárolt érték az egyetlen forrás.
function useIdentity(pathname: string): Identity {
  const routed = IDENTITY_OF[pathname] ?? null;
  const [stored, setStored] = useState<Identity>(DEFAULT_IDENTITY);

  //* Kiszolgálón és az első képkockán az alapértelmezés fut — így a
  //* hidratálás nem talál eltérést (ugyanaz a minta, mint `useWideChrome`).
  useEffect(() => {
    const sync = () => setStored(loadIdentity() ?? DEFAULT_IDENTITY);
    sync();
    return onPrefsChanged(sync);
  }, []);

  //! AZ ÚTVONAL VISSZA IS ÍR. Aki könyvjelzőről érkezik a `/tanari`-ra, attól
  //! még tanár: enélkül a „Ma"-ra lépve a saját napja helyett egy osztályét
  //! kapná. A `saveIdentity` változatlan értéknél nem ír és nem is jelez,
  //! ezért ez az írás akkor sem duplázódik, ha a lap maga is beállítja.
  useEffect(() => {
    if (routed) saveIdentity(routed);
  }, [routed]);

  return routed ?? stored;
}

//! ─── A VÁLTÓ ──────────────────────────────────────────────────────────────
//! EGY TOK, KÉT NEVESÍTETT CSOPORT. Vizuálisan egy tárgy; a
//! képernyőolvasónak két csoport, mert két KÉRDÉS — „Kit nézel" és „Nézetek".
//! Egyetlen közös néven a négy cella egyetlen listának hallatszana, és
//! visszajönne pontosan az az összemosás, ami elől a mátrix megszületett.
function ViewMatrix({ floating }: { floating: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const identity = useIdentity(pathname);
  const activeView = VIEW_OF[pathname] ?? null;

  //! A „HÉT" KÉT KÜLÖNBÖZŐ LAP, ÉS EZ A LEKÉPEZÉS EGY HELYEN ÁLL
  //! (`weekRouteFor`). Enélkül minden hívó a maga módján találgatna, hogy a
  //! tanári hét a `/tanari` — és a nyitólap váltója már ma is tévedne.
  const weekHref = weekRouteFor(identity);

  const pickIdentity = (next: Identity) => {
    if (next === identity) return;
    saveIdentity(next);
    //! CSAK A HETES RÁCS UGRIK ÁT. A „Hét" két útvonal a két alanynak, ezért
    //! ott az alanyváltás egyben lapváltás. A „Ma" EGY útvonal mindkettőnek:
    //! oda navigálni azt jelentené, hogy a nézet is változott — pedig épp az
    //! maradt. A lap a `notifyPrefsChanged` jelére épül újra a helyén.
    if (activeView === "week") router.push(weekRouteFor(next));
  };

  return (
    <div
      className={cn(
        "flex shrink-0 items-center rounded-full",
        floating ? "p-0" : "border border-input p-0.5 dark:bg-input/30",
      )}
    >
      {/*//! AZ ALANY IKONNAL ÁLL A TELEFONON, ÉS EZ NEM SPÓROLÁS. A felirat
          //! `sm` alatt `sr-only`: a gomb OLVASÓNEVE végig „Diák", illetve
          //! „Tanár" marad, csak a szem nem kapja meg. A szemnek nem is kell:
          //! az alany NEVE közvetlenül mellette áll a sorban („13C" vagy
          //! „Kovács B."), tehát az ikonpár nem egyedül viszi a jelentést.
          //*
          //! A CSOPORT NEVE NEM „KIT NÉZEL", PEDIG KÍNÁLTA MAGÁT. Az a lap
          //! egyik szakaszának a CÍME — és ott most már az ALANY NEVÉT kérdezi
          //! (melyik osztályt, melyik tanárt). Két azonos nevű csoport egy
          //! képernyőn, más tartalommal: a képernyőolvasón ez ugyanaz a
          //! kérdés kétszer, két külön válasszal. Itt a TENGELY áll, ott az
          //! ÉRTÉK — a két név ezért különbözik. */}
      {/*//! NEM `<fieldset>`, ÉS A LINTER ITT TÉVED. A `fieldset` űrlapmezőket
          //! fog össze; ez a kettő nem mező, hanem két kapcsológomb
          //! (`aria-pressed`), és semmilyen űrlap nem küldi el őket. Ráadásul
          //! a `fieldset` alapértelmezett `min-inline-size: min-content`-je a
          //! flexben pont azt a zsugorodást akadályozná meg, amire a tok
          //! túlcsordulás-biztosítéka épül. A `role="group"` + `aria-label` a
          //! pontos leírás: egy nevesített csoport, nem egy űrlaprészlet. */}
      {/* biome-ignore lint/a11y/useSemanticElements: kapcsológombok csoportja, nem űrlapmezőké */}
      <div
        role="group"
        aria-label="Kié az órarend"
        className="flex items-center"
      >
        {IDENTITIES.map((option) => {
          const active = identity === option.id;
          const Icon = option.icon;
          return (
            <button
              key={option.id}
              type="button"
              aria-pressed={active}
              title={option.title}
              onClick={() => pickIdentity(option.id)}
              className={cn(
                CELL,
                "px-2 sm:px-2.5",
                active ? CELL_ON : CELL_OFF,
              )}
            >
              <Icon aria-hidden className="size-3.5 shrink-0" />
              <span className="max-sm:sr-only">{option.label}</span>
            </button>
          );
        })}
      </div>

      {/*//! A VÁLASZFAL EGY TENGELYT VÁLASZT EL, NEM KÉT GOMBOT. Ugyanaz a
          //! gondolat, mint a `.chrome-rail hr`-jénél: a csoporthatár LÁTSZIK
          //! is, különben a négy cella egyetlen szalaggá olvad, és a diák azt
          //! hiszi, hogy egyszerre csak egy lehet aktív közülük — holott
          //! MINDIG kettő az, tengelyenként egy.
          //*
          //! CSOPORTON BELÜL VISZONT NINCS HÉZAG, ÉS EZ NEM SPÓROLÁS. A
          //! kitöltött cella maga a határ (ugyanaz a szegmensvezérlő-nyelv,
          //! amit a `DayStrip` is beszél): ahol a hézag ELVÁLASZTANA, ott a
          //! válaszfal van, ahol pedig összetartozást kell mutatni, ott a
          //! cellák érnek egymáshoz. Mellékesen 8 px-et ad vissza a sornak,
          //! ami 375 px-en épp a dátum második fele („– szept. 4."). */}
      <span
        aria-hidden
        className={cn(
          "mx-0.5 h-4 w-px shrink-0",
          floating ? "bg-white/20" : "bg-border",
        )}
      />

      <nav aria-label="Nézetek" className="flex items-center">
        {VIEWS.map((view) => (
          <Link
            key={view.id}
            href={view.id === "today" ? "/ma" : weekHref}
            title={view.title}
            aria-current={activeView === view.id ? "page" : undefined}
            className={cn(
              CELL,
              "px-2.5",
              activeView === view.id ? CELL_ON : CELL_OFF,
            )}
          >
            {view.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

//! ─── A SOR MAGA ───────────────────────────────────────────────────────────
//! EZ EGYSZERRE CÍM, ÁLLAPOT ÉS KAPU. Az alany a lap CÍME (ezért `h1`-súlyú
//! betű), a mellette álló szöveg pedig megmondja, hol állsz az adatban. A
//! kettő EGY gomb: az a szöveg nyitja a választót, amelyik magát az állapotot
//! kimondja — nem egy külön ikon mellette.
function LineButton({
  line,
  open,
  sheetId,
  interactive,
  onToggle,
}: {
  line: LineContent;
  open: boolean;
  sheetId: string;
  interactive: boolean;
  onToggle: () => void;
}) {
  const body = (
    <>
      {/*//! AZ ALANY SOHA NEM CSONKUL A HELY ELŐTT. Mérve 375 px-en: amíg
          //! mindkét szöveg egyformán zsugorodhatott, a flex a HOSSZABBNAK
          //! hagyta a helyet, és a sor „1… · aug. 31. – szept…." lett — az
          //! osztály neve, a sor legfontosabb szava, három pontra fogyott,
          //! miközben a dátum majdnem teljes maradt. A sorrend fordítva
          //! helyes: a dátum csonkuljon, mert abból egy fél is olvasható
          //! („aug. 31. – szept…"), az alanyból viszont nem.
          //*
          //* A felső korlát a tanári névé: a „13C" 28 px, a „Baranyainé Beck
          //* Gabriella" 190 — enélkül egy hosszú név kiszorítaná az egész
          //* dátumot. 9rem-nél a név is csonkul, de csak azután, hogy a dátum
          //* már elfogyott. */}
      <span className="max-w-[9rem] shrink-0 truncate font-bold tracking-tight text-foreground">
        {line.subject}
      </span>
      {line.context && (
        <>
          <span aria-hidden className="shrink-0 text-muted-foreground">
            ·
          </span>
          {/*//! IDŐ MINDIG `tabular-nums`. A sor a hetelés közben minden
              //! lépésnél átíródik; arányos számjegyekkel a mellette álló
              //! vezérlők néhány képpontot ugranának hetenként. */}
          <span className="min-w-0 flex-1 truncate font-medium tabular-nums text-muted-strong">
            {line.context}
          </span>
        </>
      )}
      {line.weekLetter && (
        <span className="shrink-0 rounded-full bg-primary/10 px-1.5 py-0.5 text-[11px] font-semibold text-primary">
          <span className="sr-only">{line.weekLetter} hét</span>
          <span aria-hidden>{line.weekLetter}</span>
        </span>
      )}
      {/*//! A SZŰRÉS SZÁMA A SORON MARAD, MERT A SOR AZ EGYETLEN FEJLÉC. Az
          //! összevonás órákat TÜNTET EL a nézetből; ha ennek az egyetlen
          //! nyoma egy becsukott lapban van, a diák egy hiányos órarendet lát,
          //! és nincs miből rájönnie, hogy ő maga szűrte. Ez a `toolbar-more`
          //! badge-ének az érve, és a sor eltűnésével nem szűnt meg. */}
      {Boolean(line.filtered) && (
        <span className="shrink-0 rounded-full bg-brand/15 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-brand">
          <span className="sr-only">
            {line.filtered} összevonás szűr a nézetben
          </span>
          <span aria-hidden>{line.filtered} szűrés</span>
        </span>
      )}
    </>
  );

  const shape =
    "flex min-w-0 flex-1 touch-target items-center gap-1.5 rounded-full py-1 text-[15px] leading-tight";

  if (!interactive) {
    return <span className={cn(shape, "px-1")}>{body}</span>;
  }

  return (
    //! A SOR NEM CÍM, HANEM VEZÉRLŐ, ÉS EZT LÁTNI KELL RAJTA. Az első
    //! változatban a sor csupasz szöveg volt: `title` és egy hover-háttér volt
    //! az egyetlen jele annak, hogy meg lehet nyomni — érintőképernyőn
    //! MINDKETTŐ láthatatlan, tehát a lapnak nulla jelzése volt. Egy fejléc,
    //! aminek nem látszik, hogy kapu, nem kapu.
    //*
    //* A megoldás a lap SAJÁT vezérlő-nyelve, nem egy új jel: az
    //* osztályválasztó és minden más lenyíló ebben az alkalmazásban
    //* `rounded-full border border-input` + `ChevronDown`. A sor ugyanezt
    //* viseli — így nem kell megtanulni, hogy vezérlő: már ismerős.
    <button
      type="button"
      aria-expanded={open}
      aria-controls={sheetId}
      //! NINCS `aria-haspopup="dialog"`, ÉS A LAPNAK NINCS `role`-JA. A lap nem
      //! párbeszéd: nem modális, nem fog fókuszt, és a mögötte lévő rács végig
      //! használható marad. Az `aria-expanded` + `aria-controls` páros már
      //! pontosan megmondja, mit nyit ez a gomb; egy ráadás szerep csak egy
      //! üres réteget tenne a képernyőolvasó útjába, és párbeszédet ígérne ott,
      //! ahol nincs.
      title="Osztály, hét és beállítások"
      onClick={onToggle}
      className={cn(
        shape,
        "border border-input px-2.5 text-left transition-colors dark:bg-input/30",
        "hover:bg-muted focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none motion-reduce:transition-none",
        open && "border-ring bg-muted",
      )}
    >
      {body}
      <ChevronDown
        aria-hidden
        className={cn(
          "ml-auto size-4 shrink-0 text-muted-foreground transition-transform duration-200 motion-reduce:transition-none",
          open && "rotate-180",
        )}
      />
    </button>
  );
}
