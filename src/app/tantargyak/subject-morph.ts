"use client";

import { flushSync } from "react-dom";
import { supportsViewTransition } from "@/components/timetable/view-transition";

//* ---------------------------------------------------------------------------
//* A TANTÁRGY ÁTÚSZÁSA — LISTASORBÓL CÍM, CÍMBŐL LISTASOR
//* ---------------------------------------------------------------------------
//! A NEVEKET MI RAKJUK FEL, ÉS CSAK AZ ÁTMENET IDEJÉRE. Egy `view-transition-
//! name` egyszerre csak egy elemen állhat, különben az egész átmenet elhal.
//! Széles kijelzőn a lista és az előző tárgy részlete EGYSZERRE látszik:
//! ha a cím állandóan viselné a nevet, a régi cím és a koppintott sor
//! ütközne. Ezért a forrás (a régi DOM-on) és a cél (az új DOM-on) csak a
//! visszahívás két oldalán kapja meg, és a végén mindkettőről lekerül.
//*
//! A React NEM tud róla. Ha a nevet `style` propként adnánk, a React a
//! következő renderben nem írná vissza (a prop nem változott), és a kézzel
//! levett név némán eltűnne — ezért itt minden kézi, a DOM-on.

const PARTS = ["dot", "name"] as const;

type Transition = {
  finished: Promise<void>;
  ready?: Promise<void>;
  updateCallbackDone?: Promise<void>;
};
type DocumentWithVT = Document & {
  startViewTransition?: (callback: () => void) => Transition;
};

const noop = () => undefined;

//* Ami `display: none` alatt van (telefonon a rejtett oszlop), az nem forrás
//* és nem cél — nincs doboza, amiből vagy amibe úszni lehetne.
function shown(el: Element | null): HTMLElement | null {
  return el instanceof HTMLElement && el.getClientRects().length > 0
    ? el
    : null;
}

function rowOf(name: string): HTMLElement | null {
  return shown(
    document.querySelector(`[data-subject-row="${CSS.escape(name)}"]`),
  );
}

function detail(): HTMLElement | null {
  return shown(document.querySelector("[data-subject-detail]"));
}

function label(scope: HTMLElement): void {
  for (const part of PARTS) {
    const el = scope.querySelector<HTMLElement>(`[data-morph="${part}"]`);
    if (el) el.style.viewTransitionName = `subj-${part}`;
  }
}

function clear(): void {
  for (const el of document.querySelectorAll<HTMLElement>("[data-morph]")) {
    el.style.viewTransitionName = "";
  }
}

export function subjectMorph(options: {
  from: string | null;
  to: string | null;
  commit: () => void;
  //! A DOM IGAZÍTÁSA (görgetés) a pillanatkép ELŐTT — ugyanaz az ok, mint a
  //! heti rácsnál (`weekTransition`): utólag a nézet a régi helyén jelenne
  //! meg, aztán odébb rándulna.
  after?: () => void;
}): void {
  const { from, to, commit, after } = options;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const doc = document as DocumentWithVT;
  if (reduce || from === to || !supportsViewTransition()) {
    flushSync(commit);
    after?.();
    return;
  }

  //* Nyitáskor a koppintott sor a forrás, csukáskor a részlet címe.
  const source = to ? rowOf(to) : detail();
  if (source) label(source);

  const transition = doc.startViewTransition?.(() => {
    flushSync(commit);
    after?.();
    clear();
    //* Cél csak akkor kell, ha volt forrás — különben a név a semmiből
    //* nőne ki, ami rosszabb, mint a sima áttűnés.
    const target = to ? detail() : from ? rowOf(from) : null;
    if (source && target) label(target);
  });
  if (!transition) {
    clear();
    return;
  }
  //* A félbeszakítás nem hiba: gyors koppintásnál a következő átmenet elvágja
  //* a futót (lásd a `view-transition.ts` hármas ígéretét).
  transition.ready?.catch(noop);
  transition.updateCallbackDone?.catch(noop);
  transition.finished.catch(noop).finally(clear);
}
