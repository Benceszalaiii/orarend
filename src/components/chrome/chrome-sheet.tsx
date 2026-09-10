"use client";

import { CalendarDays, ChevronDown } from "lucide-react";
import { useId, useState } from "react";
import { cn } from "@/lib/utils";

//! ═══════════════════════════════════════════════════════════════════════════
//! A LAP — EGY HELY, GYAKORISÁG SZERINT SORBA RAKVA
//! ═══════════════════════════════════════════════════════════════════════════
//! AMI KIKERÜLT A SÁVBÓL, AZ NEM TŰNT EL — NEVET KAPOTT. A régi eszköztárban
//! nyolc csupasz ikon állt (ⓘ, összevonás, aktatáska, harang, nyitólap…),
//! kizárólag `aria-label`-lel: a diák látta az ikonokat, és nem tudta, melyik
//! mit nyit. Itt mind ki van írva.
//!
//! A SORREND NEM ÍZLÉS, HANEM GYAKORISÁG. Fentről lefelé: amit MINDEN
//! megnyitáskor kérdez az ember (kit nézek, melyik hetet), aztán amit egyszer
//! állít be egy félévre (összevonás, duális, értesítés), végül a hivatkozás
//! jellegű dolgok (jelmagyarázat, nyitólap, fiók). Egy „beállítások" cím alá dobott,
//! rendezetlen lista pontosan azt a bajt hozná vissza, ami elől idejöttünk.
//!
//! AMI VISZONT NINCS ITT: A DIÁK/TANÁR VÁLTÓ. Az a sávban áll, a nézetekhez
//! fűzve (`ViewMatrix`, lásd `chrome/standing-line.tsx`) — mert az alany és a
//! nézet ugyanannak a címnek a két fele, nem két külön helyen lakó beállítás.
//! A „Kit nézel" szakasz ezért itt már csak az ALANY NEVÉT kérdezi: melyik
//! osztályt, melyik tanárt. A tengely fent van, az érték itt.
//! ═══════════════════════════════════════════════════════════════════════════

export function SheetSection({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("px-1.5 pt-2 pb-1 first:pt-1", className)}>
      {/*//! A CÍM NEM DÍSZ, HANEM A CSOPORT NEVE. Kicsi, halvány, de nem
          //! kisbetűs-ritkított „eyebrow": egy szakaszcím, ami megmondja, mire
          //! való a alatta álló két-három sor. */}
      <h2 className="px-1.5 pb-1 text-[11px] font-semibold text-muted-foreground">
        {title}
      </h2>
      <div className="flex flex-col gap-0.5">{children}</div>
    </section>
  );
}

//! ─── A NAGY TARTALOM ÖSSZECSUKVA ÉRKEZIK ──────────────────────────────────
//! MÉRVE: a naptár 300 px-t kért egy 544 px-es lapban, és ezzel a
//! „Beállítások" szakaszt — a lap LÉTÉNEK az oka — a látható rész alá tolta.
//! A lap gyakoriság szerint van sorba rakva, de a sorrend semmit nem ér, ha a
//! harmadik szakaszhoz görgetni kell: a diák a beállításokért nyitja ki, és
//! egy naptárat kap.
//*
//! EZÉRT AMI NAGY, AZ ÖSSZECSUKVA JÖN. Csukott állapotban ez a szakasz egy
//! sor: kimondja, hol állunk, és ad egy „Mai hét" gombot — vagyis a hét
//! leggyakoribb két művelete NYITÁS NÉLKÜL elérhető. A naptár csak akkor
//! terjeszkedik, ha valaki tényleg ugrani akar. Így mind a három szakasz
//! egyszerre látszik egy 375 px-es telefonon.
//*
//* Ez nyitható doboz, nem réteg: a saját fájában marad, tehát a lap
//* elbocsátás-logikáját (lásd `standing-line.tsx`) nem zavarja meg.
export function SheetDisclosure({
  summary,
  action,
  children,
}: {
  /** Amit csukva mond — rendszerint az aktuális állapot. */
  summary: React.ReactNode;
  /** A csukott soron is elérhető gyorsművelet. */
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();

  return (
    //* `relative`: sáv-alakban a kinyíló naptár buborékként ül a gomb alatt
    //* (lásd `.chrome-rail .sheet-disclosure-panel` a `globals.css`-ben) —
    //* vízszintes sávban egy helyben terjeszkedő naptár szétnyomná a sort.
    <div className="sheet-disclosure relative flex flex-col">
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen((v) => !v)}
          className={cn(
            "flex min-h-9 min-w-0 flex-1 touch-target items-center gap-2.5 rounded-lg px-1.5 py-1 text-left transition-colors",
            "hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none",
            open && "bg-muted",
          )}
        >
          <CalendarDays
            aria-hidden
            className="size-4 shrink-0 text-muted-foreground"
          />
          {/*//* Sáv-alakban a dátum a SORBAN áll, a léptetőkkel együtt — itt
              //* megismételni pusztán helypazarlás, ezért elmarad. Marad a
              //* naptárikon: az „ugorj egy dátumra" gomb. */}
          <span className="sheet-disclosure-summary min-w-0 flex-1 truncate text-sm font-medium tabular-nums text-foreground">
            {summary}
          </span>
          <ChevronDown
            aria-hidden
            className={cn(
              "size-4 shrink-0 text-muted-foreground transition-transform duration-200 motion-reduce:transition-none",
              open && "rotate-180",
            )}
          />
        </button>
        {/*//* A „Mai hét" sáv-alakban elmarad: a sorban álló „Ma" ugyanezt
            //* teszi, és csak akkor, amikor van dolga. */}
        {action && <span className="sheet-disclosure-action">{action}</span>}
      </div>
      {open && (
        <div id={id} className="sheet-disclosure-panel px-0.5 pb-1">
          {children}
        </div>
      )}
    </div>
  );
}

export function SheetDivider() {
  return <hr className="mx-1.5 my-1 border-0 border-t border-border" />;
}

//! ─── A SOR MAGA A GOMB ────────────────────────────────────────────────────
//! AZ ELSŐ VÁLTOZAT ITT ELROMLOTT, ÉS ÉRDEMES KIMONDANI, HOGYAN. A `SheetRow`
//! egy díszikont tett a sor BAL szélére, a valódi vezérlő pedig a JOBB szélen
//! maradt, a saját kis kerek gombjában. Ennek két következménye volt:
//!
//!   1. MINDEN SORBAN KÉTSZER állt ugyanaz az ikon — balra `aria-hidden`
//!      díszként, jobbra a gombon. Aktatáska és aktatáska, harang és harang.
//!   2. A sor 340 px széles volt, de ebből 36 px volt kattintható. A felirat,
//!      a magyarázat és a köztük lévő üres hely NEM csinált semmit. Egy lista,
//!      ami soroknak látszik, de valójában sorruhába öltöztetett apró gombokból
//!      áll — pont az az „ikonmező", ami elől a lapot megcsináltuk.
//!
//! A JAVÍTÁS: A VEZÉRLŐ MAGA LESZ A SOR. Nem a sor kap gombot, hanem a gomb
//! veszi fel a sor alakját — teljes szélesség, balra zárt ikon, felirat és
//! magyarázat a gombON BELÜL. Így egy sor = egy találati felület = egy név, és
//! az ikon pontosan egyszer szerepel.
//*
//* Ez a projekt saját, már bevált mintája: a törölt `.tt-more-item` szabály
//* ugyanezt csinálta a régi telefonos panelben. Ott médialekérdezés kellett
//* hozzá, mert a gombok a sávban IS megjelentek; ma ezek a vezérlők KIZÁRÓLAG
//* a lapban élnek, tehát a sor-alak feltétel nélkül érvényes.
export const sheetItem = (extra?: string) =>
  cn(
    //* `sheet-item`: nem stílus, hanem FOGÓDZÓ. A sáv-alak (`.chrome-rail`,
    //* lásd `globals.css`) erről ismeri fel a sorokat, hogy pirulává alakítsa
    //* őket. Enélkül minden sáv-szabály néma marad.
    "sheet-item",
    "flex h-auto w-full min-h-11 items-center justify-start gap-2.5 rounded-lg",
    "border-0 bg-transparent px-1.5 py-1.5 text-left shadow-none",
    "hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
    "motion-reduce:transition-none",
    extra,
  );

//! ─── AMI A SORBÓL NYÍLIK, AZ A SOR ALATT NYÍLJON ──────────────────────────
//! EZ A LAP KÉT ALAKBAN FUT, ÉS EGY RÖGZÍTETT IGAZÍTÁS CSAK AZ EGYIKBEN JÓ. A
//! lap-alakban a sor 340 px széles, a buborék 350 — a kettő gyakorlatilag
//! fedi egymást, tehát mindegy, melyik széléhez igazítunk. A sáv-alakban
//! (`.chrome-rail`) viszont ugyanaz a sor egy 32 px-es ikonná zsugorodik, és
//! ott az `align="end"` azt jelenti, hogy a 350 px-es buborék JOBB széle ül az
//! ikon jobb szélére: a tartalom teljes egészében az ikontól BALRA nyílik ki,
//! a legbaloldalibb ikonnál pedig a képernyő széléig csúszik vissza. MÉRVE
//! 1280 px-es ablakban: az „Összevonások" ikonja a 270–302 px sávban áll, a
//! buboréka a 0–352-ben — a gomb a buborék jobb szélénél, 270 px-re a
//! tartalom elejétől. A diák nem ott keresi, ahova kattintott.
//!
//! A KÖZÉPRE IGAZÍTÁS MINDKÉT ALAKBAN AZT MONDJA, AMIT KELL: a buborék a
//! MEGNYOMOTT dolog alatt van. Széles sornál ez pár képpont eltérés a
//! korábbihoz képest, ikonnál viszont ez a különbség aközött, hogy a buborék a
//! gombhoz tartozik-e vagy csak úgy megjelent valahol.
//*
//* A ráhagyás (`sideOffset`) itt egy hajszállal nagyobb az alapértéknél: a
//* buborék a sáv alsó éle alól nyílik, és nem szabad egybefolynia vele.
export const SHEET_POPOVER = {
  align: "center",
  sideOffset: 6,
} as const;

//! A GOMB BELSEJE. Felirat és magyarázat egy blokkban, hogy a gomb
//! olvasónevébe MINDKETTŐ beleessen: a képernyőolvasó így „Duális beosztás,
//! mely napokon vagy a munkahelyen" néven hallja, nem csak egy ikont.
export function SheetItemBody({
  label,
  hint,
  trailing,
}: {
  label: string;
  hint?: React.ReactNode;
  trailing?: React.ReactNode;
}) {
  return (
    <>
      {/*//! `sheet-item-text`: A SÁV-ALAKBAN EZ A BLOKK NÉMÁVÁ VÁLIK, DE NEM
          //! TŰNIK EL. Az eszköztár-alak (`.chrome-rail`, lásd `globals.css`)
          //! a feliratot képernyőolvasó-láthatóra állítja: a szem ikont lát, a
          //! képernyőolvasó és a gomb olvasóneve viszont TOVÁBBRA IS „Duális
          //! beosztás, mely napokon vagy a munkahelyen". `display: none` ezt
          //! elvágná — egy néma ikonsor pont az lenne, amit ez a lap egyszer
          //! már lecserélt. Amit a szem elveszít, azt a buborék adja vissza
          //! (`chrome/rail-tips.tsx`). */}
      <span className="sheet-item-text min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-foreground">
          {label}
        </span>
        {hint && (
          //* `sheet-hint`: a sávban álló, tömör alakban a magyarázat elmarad —
          //* ott a felirat mellett nincs rá hely, és a `title` úgyis viszi.
          <span className="sheet-hint block truncate text-xs font-normal text-muted-foreground">
            {hint}
          </span>
        )}
      </span>
      {trailing && <span className="shrink-0">{trailing}</span>}
    </>
  );
}

//! A NEM KATTINTHATÓ SOR. Csak ott van helye, ahol a sor ÁLLÍT valamit, nem
//! csinál (pl. „Ma: duális nap"). Ahol vezérlő van, ott a vezérlő a sor —
//! lásd `sheetItem` fentebb.
export function SheetRow({
  icon,
  label,
  hint,
  children,
  className,
}: {
  icon?: React.ReactNode;
  label: string;
  hint?: React.ReactNode;
  /** A sor jobb szélén álló, saját rétegét nyitó vezérlő. */
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-h-9 items-center gap-2.5 rounded-lg px-1.5 py-1",
        className,
      )}
    >
      {icon && (
        <span aria-hidden className="shrink-0 text-muted-foreground">
          {icon}
        </span>
      )}
      <span className="sheet-row-text min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-foreground">
          {label}
        </span>
        {hint && (
          <span className="block truncate text-xs text-muted-foreground">
            {hint}
          </span>
        )}
      </span>
      {children && <span className="shrink-0">{children}</span>}
    </div>
  );
}
