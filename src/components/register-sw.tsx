"use client";

import { useEffect } from "react";

//! A SERVICE WORKER BEJEGYZÉSE. Egyetlen mellékhatás, saját komponensben: a
//! gyökér-elrendezés így szerver-komponens maradhat.
//*
//* Csendben bukik el, ha nincs rá támogatás vagy a böngésző elutasítja (privát
//* mód, `file:` protokoll, kikapcsolt tárhely) — a lap enélkül is teljes
//* értékű, csak nem indul el hálózat nélkül.
export function RegisterSW() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    //! FEJLESZTÉS ALATT NINCS SERVICE WORKER. A `/_next/static/` alatti fájlokat
    //! a worker „előbb a gyorsítótárból" adja vissza — élesben ez helyes (a
    //! nevek tartalom-hash-eltek, ami egyszer megvan, örökre érvényes),
    //! fejlesztésben viszont ugyanazok az útvonalak MINDIG változnak, és a
    //! worker a régi kódot szolgálná ki. A tünet a legrosszabb fajta: a lap
    //! működik, csak nem az, amit épp megírtál.
    if (process.env.NODE_ENV !== "production") {
      //* A korábban már bejegyzett workert is takarítsuk el, különben egy
      //* éles buildből visszatérve is ő szolgálna ki.
      void navigator.serviceWorker.getRegistrations().then((regs) => {
        for (const reg of regs) void reg.unregister();
      });
      return;
    }
    //* Betöltés UTÁN: a bejegyzés sávszélessége ne a lap első képkockájától
    //* menjen el.
    const register = () => {
      void navigator.serviceWorker
        .register("/sw.js", { scope: "/", updateViaCache: "none" })
        .catch(() => undefined);
    };
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);

  return null;
}
