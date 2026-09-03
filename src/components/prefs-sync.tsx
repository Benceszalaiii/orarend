"use client";

import { useEffect, useRef } from "react";
import { useSession } from "@/lib/auth-client";
import { onPrefsChanged } from "@/lib/prefs-events";
import { forgetSyncState, syncPrefs } from "@/lib/prefs-sync";

//! ═══════════════════════════════════════════════════════════════════════════
//! A SZINKRON MOTORJA — LÁTHATATLAN KOMPONENS
//! ═══════════════════════════════════════════════════════════════════════════
//! Nem rajzol semmit. Azért komponens, mert a munkamenetet a React-fán keresztül
//! ismeri meg, és mert az életciklusa (be- és kijelentkezés, lapelhagyás) pont
//! az, amikor szinkronizálni kell.
//!
//! MIKOR FUT:
//!   1. amikor kiderül, hogy be vagyunk jelentkezve (belépés vagy oldalnyitás),
//!   2. amikor egy beállítás megváltozik ezen a lapon vagy egy másik fülön,
//!   3. amikor a lap újra láthatóvá válik (közben másik készüléken állíthattak).
//!
//! AKI NINCS BEJELENTKEZVE, ANNÁL EGYETLEN SORA SEM FUT LE a hálózat felé —
//! a lap a fiók nélküli látogatónak pontosan annyiba kerül, mint eddig.
//! ═══════════════════════════════════════════════════════════════════════════

//! KÉT MÁSODPERC KÉSLELTETÉS. Az osztályválasztó, a csoportbontás-menü és a
//! duális rács gyors egymásutánban több változást is ír (egy-egy koppintás
//! mindegyik) — ezekből egyetlen feltöltés legyen, ne öt. Ennél hosszabb
//! késleltetéssel viszont a „beállítom és becsukom a telefont" eset már
//! kicsúszna, ezért nem húzzuk tovább.
const DEBOUNCE_MS = 2000;

export function PrefsSync() {
  const { data: session } = useSession();
  const userId = session?.user.id ?? null;

  //! A FUTÓ KÖR MEGSZAKÍTHATÓ. Ha közben kijelentkezés vagy fiókváltás történik,
  //! a régi kör válasza már egy MÁSIK felhasználó beállítását írná a
  //! készülékre. Az `AbortController` ezt vágja el.
  const abortRef = useRef<AbortController | null>(null);
  //* Hogy egy kijelentkezést csak egyszer takarítsunk le.
  const lastUserRef = useRef<string | null>(null);

  useEffect(() => {
    if (!userId) {
      //* Kijelentkezés (vagy soha nem is volt fiók): a helyi jelölő nem
      //* érvényes többé. A BEÁLLÍTÁSOK maradnak — lásd `forgetSyncState`.
      if (lastUserRef.current) {
        forgetSyncState();
        lastUserRef.current = null;
      }
      abortRef.current?.abort();
      abortRef.current = null;
      return;
    }

    lastUserRef.current = userId;

    let timer: ReturnType<typeof setTimeout> | null = null;
    let disposed = false;

    const run = () => {
      if (disposed) return;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      //! A HIBÁT ITT ELNYELJÜK, ÉS EZ SZÁNDÉKOS. A `syncPrefs` minden ismert
      //! bajt (hálózat, lejárt munkamenet, szerverhiba) állapotként ad vissza,
      //! és egyik sem olyan, amiről a diákot értesíteni kellene: a lap tőle
      //! függetlenül működik. Riasztás helyett a következő kör próbálkozik újra.
      void syncPrefs(userId, controller.signal);
    };

    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(run, DEBOUNCE_MS);
    };

    //* Az első kör azonnal fut: ez hozza le a másik készüléken beállítottakat.
    run();

    const unsubscribe = onPrefsChanged(schedule);

    //! A LAP ÚJRANYITÁSA IS SZINKRONPONT. A telefonon a PWA napokig a háttérben
    //! áll; visszatéréskor a legvalószínűbb, hogy közben a gépen állítottak
    //! valamit. Csak a láthatóvá VÁLÁST figyeljük, az elrejtést nem — kimenet
    //! nélküli körökkel nem terheljük az akkumulátort.
    const onVisible = () => {
      if (document.visibilityState === "visible") schedule();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      disposed = true;
      if (timer) clearTimeout(timer);
      unsubscribe();
      document.removeEventListener("visibilitychange", onVisible);
      abortRef.current?.abort();
      abortRef.current = null;
    };
  }, [userId]);

  return null;
}
