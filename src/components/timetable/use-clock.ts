"use client";

import { useSyncExternalStore } from "react";
import {
  type Clock,
  type ClockSnapshot,
  createClockStore,
} from "./clock-store";

export type { Clock } from "./clock-store";

//! A PILLANAT A LÁTOGATÓ ÓRÁJÁBÓL JÖN, ezért a szerveren nem létezik. Minden
//! „most"-ot mutató felület ugyanebből az EGY tárból olvas (`clock-store.ts`),
//! hogy a napi nézet, a heti rács piros vonala és a sávok EGY ütemre járjanak
//! — és hogy az ébredés kezelése ne csússzon szét több külön másolatba.

const store = createClockStore({
  now: () => new Date(),
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimeout: (id) =>
    globalThis.clearTimeout(id as ReturnType<typeof setTimeout>),
  doc: typeof document === "undefined" ? undefined : document,
  win: typeof window === "undefined" ? undefined : window,
});

//* A szerveren (és a hidratáláskor) nincs óra (`server`): az első
//* kliensoldali rajzolás után érkezik — így a kimenet hidratálás-biztos.
function useSnapshot<T>(select: (s: ClockSnapshot | null) => T, server: T): T {
  return useSyncExternalStore(
    store.subscribe,
    () => select(store.getSnapshot()),
    () => server,
  );
}

const selectClock = (s: ClockSnapshot | null): Clock | null => s?.clock ?? null;

//* Másodperces ütem: 10 perc alatt a visszaszámláló másodpercet mutat. Csak az
//* ütemre feliratkozó felület rajzolódik újra tőle.
export function useClock(): Clock | null {
  return useSnapshot(selectClock, null);
}

//* Egész perc éjfél óta. A nagy rács ERRE iratkozik fel, nem a másodpercre:
//* a pillanatkép primitív, tehát csak percváltáskor (vagy ébredéskor, ha
//* közben perc telt el) rajzol újra.
export function useClockMinute(): number | null {
  return useSnapshot((s) => (s ? Math.floor(s.clock.min) : null), null);
}

//* A mai nap kulcsa (`YYYY-MM-DD`) — éjfélkor magától lép.
export function useClockDay(): string | null {
  return useSnapshot((s) => s?.clock.day ?? null, null);
}

//! Láthatóvá válás / ébredés = ÚJ HORGONY. A CSS-animáció a saját indulásához
//! méri a fázist, a rejtett lapon viszont EL SEM INDUL (a böngésző nem rajzol),
//! az alvó gépen pedig az animáció órája is áll. Visszatéréskor tehát elavult
//! ponttól indulna — ez az epoch minden ilyenkor újjáépítteti a sávot, friss
//! horgonnyal.
export function useVisibilityEpoch(): number {
  return useSnapshot((s) => s?.epoch ?? 0, 0);
}
