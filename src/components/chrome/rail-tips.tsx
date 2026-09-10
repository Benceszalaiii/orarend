"use client";

import { type RefObject, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Kbd } from "@/components/ui/kbd";

//! ═══════════════════════════════════════════════════════════════════════════
//! AZ ESZKÖZTÁR BUBORÉKJA — AMIT A FELIRAT MONDOTT, CSAK GYORSABBAN
//! ═══════════════════════════════════════════════════════════════════════════
//! EZ A BUBORÉK NEM DÍSZ, HANEM A FELIRAT HELYETTESE. A sáv-alakban a pirulák
//! felirata kikerül a szem elől (`.chrome-rail .sheet-item-text`), és ezzel a
//! sor 1351 px-ről ~690-re esik. Ez a csere CSAK akkor jogos, ha a név egy
//! pillanattal később ott van — nem másfél másodperc múlva, ahogy a böngésző
//! `title`-je adná. A `title` ezért NEM elég: a késleltetése alatt az ember már
//! továbbvitte az egeret, és pontosan az a néma ikonsor marad, ami elől ez az
//! egész szerkezet megszületett.
//!
//! EGY BUBORÉK, NEM SORONKÉNT EGY. A sávban nyolc-tíz vezérlő áll, mind más
//! komponensből (összevonás, duális, harang, jelmagyarázat, megjelenés, fiók…).
//! Ha mindegyik a saját buborékját hozná, az nyolc-tíz React-fa és nyolc-tíz
//! felirat-másolat lenne — a felirat pedig MÁR OTT VAN a gombban, csak nem
//! látszik. Ezért ez a réteg a sávra figyel, és a hover alatt álló gombból
//! OLVASSA ki a nevét: aki új sort tesz a sávba, semmit nem kell itt
//! bejegyeznie, a buborékját ingyen kapja.
//!
//! A GYORSBILLENTYŰ IS ITT LAKIK, ÉS EZ NEM VÉLETLEN. Egy gyorsbillentyű, ami
//! sehol nincs kiírva, nem funkció (ugyanaz az érv, mint a jelmagyarázatnál).
//! A buborék az EGYETLEN hely, ahol a név és a billentyű egyszerre látszik —
//! épp abban a pillanatban, amikor az ember a vezérlőre néz.
//! ═══════════════════════════════════════════════════════════════════════════

type Tip = {
  label: string;
  hint: string;
  hotkey: string;
  /** A gomb helye a képernyőn — a buborék ez alá ül. */
  left: number;
  top: number;
};

//* A gomb olvasóneve két részből áll (`SheetItemBody`): a felirat az első
//* blokk, a magyarázat a `sheet-hint`. A buborék ugyanezt a kettőt mutatja.
function readTip(el: HTMLElement): Omit<Tip, "left" | "top"> | null {
  const text = el.querySelector(".sheet-item-text");
  const label = text?.firstElementChild?.textContent?.trim() ?? "";
  if (!label) return null;
  return {
    label,
    hint: text?.querySelector(".sheet-hint")?.textContent?.trim() ?? "",
    hotkey: el.dataset.key?.toUpperCase() ?? "",
  };
}

export function RailTips({
  railRef,
}: {
  railRef: RefObject<HTMLElement | null>;
}) {
  const [tip, setTip] = useState<Tip | null>(null);

  //! ─── A MUTATÁS ────────────────────────────────────────────────────────────
  //! `pointerover`, nem `mouseenter`: az előbbi buborékol, tehát EGY figyelő
  //! elég a sávra — a másikból tízet kellene felrakni, gombonként egyet.
  //*
  //! ÉRINTÉSRE NEM JÖN ELŐ. Ott nincs „fölötte állás": az első koppintás
  //! azonnal meg is nyitná a vezérlőt, a buborék pedig egy villanásra eltakarná
  //! azt, ami kinyílik. A sáv-alak amúgy is egeres-billentyűs méretektől él.
  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;

    const show = (event: Event) => {
      if (event instanceof PointerEvent && event.pointerType === "touch")
        return;
      //! NYITOTT RÉTEG ALATT NINCS BUBORÉK, ÉS EZ HIBAJAVÍTÁS. Mérve: az egér a
      //! „Összevonások" ikonon áll, a diák a billentyűvel megnyitja a
      //! testreszabót — a buborék ott marad, és RÁLÓG a most kinyílt lapra. A
      //! buborék a felirat pótléka; amint van egy réteg, ami magáról beszél, a
      //! pótléknak nincs dolga. Ugyanaz a felsorolás, amiből a lap az
      //! elbocsátását is eldönti (`chrome/standing-line.tsx`).
      if (
        document.querySelector(
          "[role=dialog],[role=alertdialog],[data-slot=popover-content],[data-radix-popper-content-wrapper]",
        )
      ) {
        return;
      }
      const el = (event.target as Element | null)?.closest<HTMLElement>(
        ".sheet-item",
      );
      if (!el || !rail.contains(el)) return;
      const read = readTip(el);
      if (!read) return;
      const rect = el.getBoundingClientRect();
      setTip({ ...read, left: rect.left + rect.width / 2, top: rect.bottom });
    };

    const hide = (event: Event) => {
      //* Csak akkor tűnjön el, ha tényleg elhagytuk a gombot — a gombON BELÜL
      //* mozgó egér (ikonról a szegélyre) ne villogtassa.
      if (event.type === "pointerout") {
        const next = (event as PointerEvent).relatedTarget as Element | null;
        if (next?.closest(".sheet-item")) return;
      }
      setTip(null);
    };

    rail.addEventListener("pointerover", show);
    rail.addEventListener("pointerout", hide);
    rail.addEventListener("focusin", show);
    rail.addEventListener("focusout", hide);
    //! A KOPPINTÁS UTÁN NINCS DOLGA. Amit a gomb nyit (buborék, párbeszéd), az
    //! pont oda kerül, ahol a buborék áll — ha ott maradna, a saját
    //! eredményét takarná el.
    rail.addEventListener("click", hide);
    window.addEventListener("scroll", hide, true);
    return () => {
      rail.removeEventListener("pointerover", show);
      rail.removeEventListener("pointerout", hide);
      rail.removeEventListener("focusin", show);
      rail.removeEventListener("focusout", hide);
      rail.removeEventListener("click", hide);
      window.removeEventListener("scroll", hide, true);
    };
  }, [railRef]);

  //! ─── A GYORSBILLENTYŰ ─────────────────────────────────────────────────────
  //! A KEZELŐ NEM ISMERI A VEZÉRLŐKET, CSAK MEGNYOMJA ŐKET. Minden sáv-gomb a
  //! saját nyitási logikáját hozza (van, amelyik buborék, van, amelyik
  //! párbeszéd, van, amelyik hivatkozás); ha ez a réteg mindegyikbe be akarna
  //! nyúlni, tíz komponens állapotát kellene kívülről vezérelnie. Egy
  //! `click()` ugyanazt az utat járja be, amit az egér — és annyit tud, amennyit
  //! a gomb maga.
  //*
  //! A HATÁROK UGYANAZOK, MINT A RÁCS BILLENTYŰINÉL (lásd `calendar.tsx`):
  //! módosítóval nem, beviteli mezőben nem, nyitott párbeszédben nem. A rács
  //! foglalt billentyűi (←, →, T, 1–5) elé itt semmi nem kerül.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const rail = railRef.current;
      if (!rail) return;
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) {
        return;
      }
      if (event.defaultPrevented || event.key.length !== 1) return;
      const target = event.target as HTMLElement | null;
      if (
        target?.closest(
          "input, textarea, select, [contenteditable='true'], [role='dialog'], [role='listbox']",
        )
      ) {
        return;
      }
      const key = event.key.toLowerCase();
      const hit = rail.querySelector<HTMLElement>(
        `.sheet-item[data-key="${key}"]`,
      );
      if (!hit) return;
      event.preventDefault();
      setTip(null);
      hit.click();
      //* A fókusz a megnyomott vezérlőre kerül: onnan a Tab és az Esc oda megy,
      //* ahova a billentyűvel dolgozó ember várja.
      hit.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [railRef]);

  if (!tip) return null;

  //! A BUBORÉK `body`-BA KERÜL, NEM A SÁVBA. A fejléc `backdrop-filter`-t visel
  //! (`.nav-glass`), az pedig a benne álló `fixed` elemeknek is befoglaló
  //! blokkot csinál — a buborék így a sávhoz lenne vágva, nem a képernyőhöz.
  //* `aria-hidden`: a nevet a gomb maga viseli (a felirat a fában maradt), a
  //* buborék csak a szemnek szól. Enélkül a képernyőolvasó kétszer mondaná.
  return createPortal(
    <div
      aria-hidden
      className="pointer-events-none fixed z-[60] -translate-x-1/2 pt-2"
      style={{
        left: `${Math.min(Math.max(tip.left, 96), window.innerWidth - 96)}px`,
        top: `${tip.top}px`,
      }}
    >
      <div className="max-w-[15rem] rounded-lg bg-popover px-2.5 py-1.5 text-center shadow-lg ring-1 ring-border">
        <p className="flex items-center justify-center gap-1.5 text-[13px] font-semibold text-foreground">
          {tip.label}
          {tip.hotkey && <Kbd>{tip.hotkey}</Kbd>}
        </p>
        {tip.hint && (
          <p className="mt-0.5 text-pretty text-xs text-muted-strong">
            {tip.hint}
          </p>
        )}
      </div>
    </div>,
    document.body,
  );
}
