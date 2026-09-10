"use client";

import { useCallback, useEffect, useState } from "react";
import { loadHiddenMenu, type MenuItemId, saveHiddenMenu } from "./menu-items";
import { onPrefsChanged } from "./prefs-events";

//! ═══════════════════════════════════════════════════════════════════════════
//! AZ ELREJTETT SOROK, OTT, AHOL A SOROK ÁLLNAK
//! ═══════════════════════════════════════════════════════════════════════════
//! A lapot NÉGY hely rakja össze — a fejléc (`chrome/standing-line.tsx`), a
//! heti rács (`timetable/calendar.tsx`) és a `/ma` két alanya —, és mindegyik
//! a maga sorait ismeri. Ezért nem egy központi „menümotor" szűr, hanem
//! mindegyik összerakó ugyanezt a horgot kérdezi meg: a sor ott marad ki, ahol
//! egyébként is megszületne. Így nincs olyan lista, ami külön karbantartást
//! kérne attól, aki egy új sort tesz a lapra: ha nem kérdezi meg, a sora
//! egyszerűen nem rejthető el — nem törik el semmi.
//*
//! KISZOLGÁLÓN ÉS AZ ELSŐ KÉPKOCKÁN MINDEN LÁTSZIK, és ez nem kompromisszum,
//! hanem a helyes alapértelmezés. A hidratálás így nem talál eltérést (ugyanaz
//! a minta, mint a `useStoredIdentity`-nél), villanás pedig nincs: telefonon a
//! lap csukva születik, a sáv-alak (`useWideChrome`) pedig szintén csak a
//! csatolás után jelenik meg — mire bármelyik sor kirajzolódik, ez a horog már
//! a tárolt listán áll.
//! ═══════════════════════════════════════════════════════════════════════════

export type HiddenMenu = {
  /** Igaz, ha ez a sor a lapon van a helyén. */
  shows: (id: MenuItemId) => boolean;
  /** A jelenleg elrejtett sorok — a testreszabó ebből rajzolja a kapcsolókat. */
  hidden: ReadonlySet<MenuItemId>;
  toggle: (id: MenuItemId) => void;
  /** Vissza a teljes laphoz: minden sor előjön. */
  reset: () => void;
};

export function useHiddenMenu(): HiddenMenu {
  const [hidden, setHidden] = useState<ReadonlySet<MenuItemId>>(
    () => new Set(),
  );

  useEffect(() => {
    const sync = () => setHidden(new Set(loadHiddenMenu() ?? []));
    sync();
    //* A testreszabó `saveHiddenMenu`-vel ír, az pedig `notifyPrefsChanged`-et
    //* jelez: a lap ugyanabban a képkockában veszi ki a sort, ahogy a kapcsoló
    //* átbillen — akkor is, ha a kapcsoló egy MÁSIK komponensben ül.
    return onPrefsChanged(sync);
  }, []);

  const shows = useCallback((id: MenuItemId) => !hidden.has(id), [hidden]);

  const toggle = useCallback((id: MenuItemId) => {
    //! A TÁROLÓBÓL OLVASUNK VISSZA, NEM AZ ÁLLAPOTBÓL. Ez a horog egyszerre
    //! több komponensben él (fejléc, rács, testreszabó), és mindegyik példány
    //! a saját másolatát tartja. Ha a következő listát a SAJÁT állapotából
    //! számolná, egy épp elavult példány (ami még nem kapta meg az
    //! eseményt) a másik írását törölné felül.
    const next = new Set(loadHiddenMenu() ?? []);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    saveHiddenMenu([...next]);
  }, []);

  const reset = useCallback(() => saveHiddenMenu(["duty"]), []);

  return { shows, hidden, toggle, reset };
}
