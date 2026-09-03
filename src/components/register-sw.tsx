"use client";

import { useEffect } from "react";
import { registerWorker, supportsWorker } from "@/lib/sw-register";

//! A SERVICE WORKER BEJEGYZÉSE. Egyetlen mellékhatás, saját komponensben: a
//! gyökér-elrendezés így szerver-komponens maradhat.
//*
//* Csendben bukik el, ha nincs rá támogatás vagy a böngésző elutasítja (privát
//* mód, `file:` protokoll, kikapcsolt tárhely) — a lap enélkül is teljes
//* értékű, csak nem indul el hálózat nélkül.
export function RegisterSW() {
  useEffect(() => {
    if (!supportsWorker()) return;
    //! FEJLESZTÉSBEN IS BEJEGYEZZÜK, DE NEM UGYANAZT. Amíg dev alatt EGYÁLTALÁN
    //! nem volt worker, az értesítéseket helyben nem lehetett kipróbálni: az
    //! engedélyt a böngésző megadta, a feliratkozás viszont némán elbukott,
    //! mert nem volt mire feliratkozni. A gyorsítótárazás elleni kifogás
    //! ugyanakkor VÁLTOZATLANUL igaz — a dev kiszolgáló ugyanazon a néven adja
    //! ki a folyton változó `/_next/static/` fájlokat —, ezért a dev worker a
    //! `fetch`-be bele sem szól (lásd `public/sw.js` és `lib/sw-register.ts`).
    //*
    //* Betöltés UTÁN: a bejegyzés sávszélessége ne a lap első képkockájától
    //* menjen el.
    const register = () => void registerWorker();
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);

  return null;
}
