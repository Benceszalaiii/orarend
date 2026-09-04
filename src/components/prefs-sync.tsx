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
//!   2. amikor a lap inaktívvá válik, ha előtte beállítás változott,
//!   3. amikor egy beállítás inaktív lap mellett változik.
//!
//! AKI NINCS BEJELENTKEZVE, ANNÁL EGYETLEN SORA SEM FUT LE a hálózat felé —
//! a lap a fiók nélküli látogatónak pontosan annyiba kerül, mint eddig.
//! ═══════════════════════════════════════════════════════════════════════════

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
    let dirty = false;
    let syncing = false;

    const run = () => {
      if (disposed || syncing || !dirty) return;
      dirty = false;
      syncing = true;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      //! A HIBÁT ITT ELNYELJÜK, ÉS EZ SZÁNDÉKOS. A `syncPrefs` minden ismert
      //! bajt (hálózat, lejárt munkamenet, szerverhiba) állapotként ad vissza,
      //! és egyik sem olyan, amiről a diákot értesíteni kellene: a lap tőle
      //! függetlenül működik. Riasztás helyett a következő kör próbálkozik újra.
      void syncPrefs(userId, controller.signal).finally(() => {
        syncing = false;
      });
    };

    const schedule = () => {
      if (syncing) return;
      dirty = true;
      if (document.visibilityState !== "hidden") return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(run, 0);
    };

    //* Az első kör azonnal fut: ez hozza le a másik készüléken beállítottakat.
    dirty = true;
    run();

    const unsubscribe = onPrefsChanged(schedule);

    //! A LAP INAKTÍVVÁ VÁLÁSA A KIMENTÉSI PONT. Amíg a diák nézi az oldalt,
    //! a beállítások csak helyben változnak; amikor háttérbe küldi vagy elhagyja
    //! a lapot, egyetlen kör feltölti az addig történt változásokat. Utána nincs
    //! újabb kérés, amíg valamelyik beállítás ismét meg nem változik.
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden" && dirty) run();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      disposed = true;
      if (timer) clearTimeout(timer);
      unsubscribe();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      abortRef.current?.abort();
      abortRef.current = null;
    };
  }, [userId]);

  return null;
}
