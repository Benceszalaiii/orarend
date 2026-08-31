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
  options: { enabled: boolean; dir: "next" | "prev" | null },
): void {
  if (!options.enabled || !supportsViewTransition()) {
    commit();
    return;
  }
  const root = document.documentElement;
  if (options.dir) root.dataset.ttDir = options.dir;
  const transition = start(() => {
    flushSync(commit);
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
