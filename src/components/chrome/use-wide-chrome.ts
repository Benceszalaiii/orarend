"use client";

import { useSyncExternalStore } from "react";

//! ═══════════════════════════════════════════════════════════════════════════
//! A SÁV-ALAK KÜSZÖBE — EGY HELYEN, MERT KÉT KOMPONENS KÉRDEZI
//! ═══════════════════════════════════════════════════════════════════════════
//! Az álló sor (`standing-line.tsx`) ettől a szélességtől rak ki egy második
//! sort, a folyékony váltó (`pill-nav.tsx`) pedig ugyanettől bontja ki a helyek
//! buborékját saját cellákra. Ha a kettő más küszöböt nézne, egy sávban a
//! helyek kétszer vagy egyszer sem látszanának.
//*
//! `useSyncExternalStore`, NEM `useEffect` + állapot. Hidratáláskor a
//! kiszolgálói pillanatkép (keskeny) fut, így nincs eltérés; lapváltás után
//! viszont az új példány AZONNAL a valódi alakkal renderel. Effekttel minden
//! lapváltás első képkockája a keskeny alakot rajzolná, és a váltó folyadéka a
//! helyek cellájáról a saját cellájára ugrana.
//! ═══════════════════════════════════════════════════════════════════════════

const QUERY = "(min-width: 80rem)";

function subscribe(onChange: () => void) {
  const mq = window.matchMedia(QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

export function useWideChrome(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false,
  );
}
