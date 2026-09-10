"use client";

import { useEffect } from "react";
import { refreshStoredFeeds } from "@/lib/calendar-local";
import { onPrefsChanged } from "@/lib/prefs-events";

//! ═══════════════════════════════════════════════════════════════════════════
//! A NAPTÁR-LINK FRISSEN TARTÁSA — LÁTHATATLAN KOMPONENS
//! ═══════════════════════════════════════════════════════════════════════════
//! Nem rajzol semmit, és AKI NEM KÉRT NAPTÁR-LINKET, ANNÁL EGYETLEN KÉRÉST SEM
//! INDÍT: a `refreshStoredFeeds` első dolga egy `localStorage`-olvasás, és üres
//! tárolónál azonnal visszatér.
//!
//! MIÉRT A GYÖKÉRBEN, ÉS NEM A NAPTÁR-MENÜBEN: mert a csoportbontás-döntés nem
//! csak abban a menüben változik. A rácson ülő összevonás-gomb, a kártya „nem
//! járok rá" pontja és a `/ma` paneljei mind írnak — a menü közben csukva van,
//! sőt gyakran nincs is kirajzolva. Ha a frissítés a menühöz tartozna, a
//! naptárban pont a leggyakoribb esetben maradna ott egy elavult órarend.
//!
//! UGYANAZ A JELZÉS, AMIT A BEÁLLÍTÁS-SZINKRON IS FIGYEL (`prefs-events.ts`).
//! A kettő nem zavarja egymást: a szinkron a fiókba ír, ez a szerveren álló
//! pillanatképbe — és mindkettő maga dönti el, van-e egyáltalán mit küldeni.
//! ═══════════════════════════════════════════════════════════════════════════

export function CalendarSync() {
  useEffect(() => {
    let disposed = false;
    let running = false;
    let pending = false;

    const run = () => {
      if (disposed) return;
      //* Egyszerre egy kör. Ha közben újabb változás jött, a futó kör VÉGÉN
      //* indul a következő — különben két párhuzamos feltöltés versenyezne
      //* ugyanarra a sorra.
      if (running) {
        pending = true;
        return;
      }
      running = true;
      //! A HIBÁT ELNYELJÜK, ÉS EZ SZÁNDÉKOS. Egy elmaradt frissítéstől a lap
      //! működik, a már felvett naptár-feliratkozás működik, és a következő
      //! megnyitás újrapróbálja. Riasztani róla azt sugallná, hogy a diáknak
      //! tennie kell valamit — nem kell.
      void refreshStoredFeeds().finally(() => {
        running = false;
        if (pending && !disposed) {
          pending = false;
          run();
        }
      });
    };

    //* Az első kör az oldalnyitáskor fut: ez zárja be azt a rést, amikor a
    //* döntés egy MÁSIK nézetben (vagy másik fülön) változott meg.
    run();
    const unsubscribe = onPrefsChanged(run);

    return () => {
      disposed = true;
      unsubscribe();
    };
  }, []);

  return null;
}
