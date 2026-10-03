"use client";

import { useEffect } from "react";
import { onPrefsChanged } from "@/lib/prefs-events";
import { syncPushPersonalization } from "@/lib/push";

//! ═══════════════════════════════════════════════════════════════════════════
//! AZ ÉRTESÍTÉS SZEMÉLYES OLVASATÁNAK FRISSEN TARTÁSA — LÁTHATATLAN KOMPONENS
//! ═══════════════════════════════════════════════════════════════════════════
//! Ugyanaz a feladat, mint a `CalendarSync`-é, csak a push-feliratkozásra: ha
//! a diák átállít egy csoportbontást vagy bejelöl egy duális napot, a szerver
//! csak akkor mondja ugyanazt, mint a rács, ha tud róla.
//!
//! MIÉRT A GYÖKÉRBEN, ÉS NEM A HARANGBAN: a döntés nem a harang mellett
//! változik, hanem a rácson, a kártyán, a `/ma` paneljén — vagy egy másik
//! készülékről, a beállítás-szinkronon át. A harang ráadásul nézetenként külön
//! példány; ha ő figyelne, egy döntés annyi feltöltést indítana, ahány harang
//! épp ki van rajzolva.
//!
//! NEM FUT OLDALNYITÁSKOR. Azt a kört a harang már lefuttatja (`refreshPush`
//! — a feliratkozás élettartamáért), és az is a pillanatnyi döntéseket viszi
//! fel. Ez a komponens csak a VÁLTOZÁSRA figyel; és aki nem kapcsolta be az
//! értesítéseket, annál egy `localStorage`-olvasásnál több nem történik.
//! ═══════════════════════════════════════════════════════════════════════════

export function PushSync() {
  useEffect(() => {
    let disposed = false;
    let running = false;
    let pending = false;

    const run = () => {
      if (disposed) return;
      //* Egyszerre egy kör — ugyanaz a sorba állítás, mint a naptárnál: két
      //* párhuzamos feltöltés ugyanarra a sorra csak versenyezne.
      if (running) {
        pending = true;
        return;
      }
      running = true;
      //* A hibát elnyeljük: az elmaradt feltöltést a következő döntés vagy a
      //* következő oldalnyitás pótolja, a diáknak nincs vele teendője.
      void syncPushPersonalization()
        .catch(() => undefined)
        .finally(() => {
          running = false;
          if (pending && !disposed) {
            pending = false;
            run();
          }
        });
    };

    const unsubscribe = onPrefsChanged(run);
    return () => {
      disposed = true;
      unsubscribe();
    };
  }, []);

  return null;
}
