"use client";

import { useEffect, useRef } from "react";
import { useSession } from "@/lib/auth-client";
import { onPrefsChanged } from "@/lib/prefs-events";
import {
  forgetSyncState,
  isApplyingSyncedPrefs,
  syncPrefs,
} from "@/lib/prefs-sync";

//! ═══════════════════════════════════════════════════════════════════════════
//! A SZINKRON MOTORJA — LÁTHATATLAN KOMPONENS
//! ═══════════════════════════════════════════════════════════════════════════
//! Nem rajzol semmit. Azért komponens, mert a munkamenetet a React-fán keresztül
//! ismeri meg, és mert az életciklusa (be- és kijelentkezés, lapelhagyás) pont
//! az, amikor szinkronizálni kell.
//!
//! MIKOR FUT:
//!   1. amikor kiderül, hogy be vagyunk jelentkezve (belépés vagy oldalnyitás),
//!   2. MINDEN beállítás-változás után, rövid (`PUSH_DELAY_MS`) várakozással —
//!      egy gyors kattintássorozat így egyetlen kör,
//!   3. azonnal, ha a lap inaktívvá válik, és még van fel nem töltött változás,
//!   4. amikor visszajön a hálózat, ha az előző kör elbukott.
//!
//! AKI NINCS BEJELENTKEZVE, ANNÁL EGYETLEN SORA SEM FUT LE a hálózat felé —
//! a lap a fiók nélküli látogatónak pontosan annyiba kerül, mint eddig.
//! ═══════════════════════════════════════════════════════════════════════════

//! A VÁRAKOZÁS NEM TAKARÉKOSKODÁS, HANEM ÖSSZEVONÁS. Egy csoportbontás
//! átállítása vagy egy téma kipróbálása pár tized másodperc alatt több írást
//! is jelent; ennyi idő alatt nem érdemes mindegyikre külön kört indítani.
//! Utána viszont a változás azonnal a fiókba kerül — nem a lap elhagyásakor.
const PUSH_DELAY_MS = 800;

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
    //* Van olyan helyi változás, ami még nincs fent a szerveren.
    let dirty = false;
    let syncing = false;

    const schedule = () => {
      //! A SAJÁT VISSZAÍRÁSUNK NEM ÚJ VÁLTOZÁS. A `syncPrefs` a letöltött
      //! állapotot a helyi tárolóra írja, és a tárolók írói ettől jeleznek —
      //! ha erre új kört indítanánk, a szinkron önmagát etetné a végtelenségig.
      if (disposed || isApplyingSyncedPrefs()) return;
      dirty = true;
      //* Futó kör közben nem indítunk másodikat: a `finish` a végén újra
      //* ránéz, maradt-e változás.
      if (syncing) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(
        run,
        document.visibilityState === "hidden" ? 0 : PUSH_DELAY_MS,
      );
    };

    const run = () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      if (disposed || syncing || !dirty) return;
      dirty = false;
      syncing = true;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      //! A HIBÁT ITT ELNYELJÜK, ÉS EZ SZÁNDÉKOS. A `syncPrefs` minden ismert
      //! bajt (hálózat, lejárt munkamenet, szerverhiba) állapotként ad vissza,
      //! és egyik sem olyan, amiről a diákot értesíteni kellene: a lap tőle
      //! függetlenül működik. Riasztás helyett a változás fent-nem-lévőnek
      //! marad jelölve, és a következő alkalom pótolja.
      void syncPrefs(userId, controller.signal).then(
        (outcome) => finish(outcome.status === "error"),
        () => finish(true),
      );
    };

    const finish = (failed: boolean) => {
      syncing = false;
      if (disposed) return;
      //! A KÖR KÖZBEN ÉRKEZETT VÁLTOZÁS NEM VESZHET EL. A `syncPrefs` a kör
      //! elején szedte össze a helyi állapotot; ami utána változott, abban
      //! nincs benne — ezért egy új kör indul érte.
      const changedMeanwhile = dirty;
      //* Elbukott kör után viszont nem pörgünk: ha nincs net, egy azonnali
      //* újrapróbálás ugyanúgy elbukna. A változás jelölve marad, és a
      //* következő változás, a lap elrejtése vagy a net visszatérése viszi fel.
      if (failed) dirty = true;
      if (changedMeanwhile) schedule();
    };

    //* Az első kör azonnal fut: ez hozza le a másik készüléken beállítottakat.
    dirty = true;
    run();

    const unsubscribe = onPrefsChanged(schedule);

    //! A LAP ELREJTÉSE NEM VÁR A KÉSLELTETÉSRE. Háttérbe küldéskor (vagy
    //! bezáráskor) a böngésző bármikor leállíthatja a lapot; ha van még fel nem
    //! töltött változás, most kell elindítani.
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") run();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("online", run);

    return () => {
      disposed = true;
      if (timer) clearTimeout(timer);
      unsubscribe();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("online", run);
      abortRef.current?.abort();
      abortRef.current = null;
    };
  }, [userId]);

  return null;
}
