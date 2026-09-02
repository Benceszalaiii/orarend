"use client";

import { flushSync } from "react-dom";

type ViewTransition = { finished: Promise<void> };
type DocumentWithVT = Document & {
  startViewTransition?: (
    callback: () => void | Promise<void>,
  ) => ViewTransition;
};

export function supportsViewTransition(): boolean {
  if (typeof document === "undefined") return false;
  return typeof (document as DocumentWithVT).startViewTransition === "function";
}

function start(callback: () => void): ViewTransition | null {
  const doc = document as DocumentWithVT;
  if (!doc.startViewTransition) return null;
  return doc.startViewTransition(callback);
}

export function weekTransition(
  commit: () => void,
  options: {
    enabled: boolean;
    dir: "next" | "prev" | null;
    //! IGAZÍTÁS A PILLANATKÉP ELŐTT. A view transition az „új" képet a
    //! visszahívás UTÁNI állapotról készíti — ami tehát a friss DOM-on állít
    //! (görgetés-pozíció), annak MÉG ITT kell lefutnia. Egy képkockával
    //! később állítva a nézet előbb a régi helyén jelenne meg, majd
    //! odébb rándulna: pont az az ugrás, amit az átmenet el akar tüntetni.
    after?: () => void;
  },
): void {
  if (!options.enabled || !supportsViewTransition()) {
    //* Átmenet nélkül is szinkronban kell a commit, ha van mit igazítani
    //* utána — különben az igazítás még a RÉGI DOM-ot mérné.
    if (options.after) {
      flushSync(commit);
      options.after();
    } else {
      commit();
    }
    return;
  }
  const root = document.documentElement;
  if (options.dir) root.dataset.ttDir = options.dir;
  const transition = start(() => {
    flushSync(commit);
    options.after?.();
  });
  if (!transition) {
    delete root.dataset.ttDir;
    return;
  }
  transition.finished
    .catch(() => undefined)
    .finally(() => {
      delete root.dataset.ttDir;
    });
}

const MORPH_NAME = "tt-focus";

export function focusMorph(options: {
  enabled: boolean;
  card: HTMLElement | null;
  direction: "open" | "close";
  commit: () => void;
}): void {
  const { enabled, card, direction, commit } = options;
  if (!enabled || !card || !supportsViewTransition()) {
    commit();
    return;
  }

  const release = () => {
    card.style.viewTransitionName = "";
  };

  if (direction === "open") {
    card.style.viewTransitionName = MORPH_NAME;
  }

  const transition = start(() => {
    flushSync(commit);
    if (direction === "open") {
      release();
    } else {
      card.style.viewTransitionName = MORPH_NAME;
    }
  });

  if (!transition) {
    release();
    return;
  }
  transition.finished.catch(() => undefined).finally(release);
}
