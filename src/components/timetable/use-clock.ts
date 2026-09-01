"use client";

import { useEffect, useState } from "react";

//! A PILLANAT A LÁTOGATÓ ÓRÁJÁBÓL JÖN, ezért a szerveren nem létezik. Minden
//! „most"-ot mutató felület ugyanezt a két horgonyt használja, hogy a napi
//! nézet és a heti rács sávja EGY ütemre járjon — és hogy a látható-válás
//! kezelése ne csússzon szét két külön másolatba.

export type Clock = {
  /** Éjfél óta eltelt PERC, tört része a másodperc. */
  min: number;
  /** Éjfél óta eltelt másodperc. */
  sec: number;
};

//* Másodperces ütem: 10 perc alatt a visszaszámláló másodpercet mutat. Csak az
//* ütemre feliratkozó felület rajzolódik újra tőle.
export function useClock(): Clock | null {
  const [clock, setClock] = useState<Clock | null>(null);
  useEffect(() => {
    const tick = () => {
      const d = new Date();
      const sec = d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds();
      setClock({ min: sec / 60, sec });
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return clock;
}

//! Láthatóvá válás = ÚJ HORGONY. A CSS-animáció a saját indulásához méri a
//! fázist, a rejtett lapon viszont EL SEM INDUL (a böngésző nem rajzol). A
//! zsebben töltött óra után tehát elavult ponttól indulna — ez az epoch minden
//! visszatéréskor újjáépítteti a sávot, friss horgonnyal.
export function useVisibilityEpoch(): number {
  const [epoch, setEpoch] = useState(0);
  useEffect(() => {
    const onShow = () => {
      if (document.visibilityState === "visible") setEpoch((e) => e + 1);
    };
    document.addEventListener("visibilitychange", onShow);
    return () => document.removeEventListener("visibilitychange", onShow);
  }, []);
  return epoch;
}
