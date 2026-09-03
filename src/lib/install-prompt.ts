"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { isAppInstalled, isIphoneSafari } from "@/lib/a2hs";

//* ---------------------------------------------------------------------------
//* A TELEPÍTÉS AJÁNLATA — EGY PÉLDÁNY, TÖBB HELYRŐL ELÉRHETŐEN
//* ---------------------------------------------------------------------------
//! A `beforeinstallprompt` ESEMÉNY EGYSZER JÖN, ÉS CSAK EGYSZER LEHET
//! FELHASZNÁLNI. Amíg a telepítést egyetlen felület kínálta (a `/ma` alján
//! felbukkanó kártya), az esemény ott is maradhatott egy `useRef`-ben. Most két
//! helyről kérhetik: a kártyáról, ami EGYSZER szól magától, és a lábléc
//! gombjáról, ami MINDIG ott van. Két komponens nem foghatja ugyanazt az egy
//! eseményt — ezért került modulszintre.
//*
//! AZ ELKAPÁS MÁR NEM A KÁRTYA DÖNTÉSÉHEZ KÖTŐDIK. Eddig csak akkor
//! `preventDefault`-oltunk, ha a kártyát meg akartuk mutatni; aki egyszer
//! elküldte a kártyát, annál a böngésző saját sávja jött vissza. Most mindig
//! átvesszük az ajánlatot, mert VAN hova tenni: a lábléc gombja az állandó
//! helye. Cserébe kötelesség is: ha az eseményt elkapjuk és nem adunk rá
//! felületet, a telepítés a böngésző menüjébe szorul vissza.
//*
//* A modulszintű figyelőket szándékosan nem bontjuk le: az esemény a LAPHOZ
//* tartozik, nem ahhoz a komponenshez, amelyik épp ki van rajzolva.

//* A Chrome telepítési ajánlata. A típus nincs benne a szabványos DOM
//* leírásokban (a Safari és a Firefox nem küldi), ezért írjuk le mi.
export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferred: BeforeInstallPromptEvent | null = null;
let listening = false;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

export function startInstallCapture(): void {
  if (listening || typeof window === "undefined") return;
  listening = true;

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferred = event as BeforeInstallPromptEvent;
    emit();
  });

  //! HA KÖZBEN TELEPÍTETTÉK, ELTŰNIK AZ AJÁNLAT. A telepítés a böngésző saját
  //! menüjéből is elindítható, és a `display-mode` a MÁR FUTÓ lapon nem vált
  //! át — a gomb ott maradna, és olyat kínálna, ami épp megtörtént.
  window.addEventListener("appinstalled", () => {
    deferred = null;
    emit();
  });
}

export function subscribeInstallPrompt(listener: () => void): () => void {
  startInstallCapture();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function hasInstallPrompt(): boolean {
  return deferred !== null;
}

//* A kiszolgálón nincs esemény, és nem is lesz — a `useSyncExternalStore`
//* ezt kéri külön, hogy a szerveren rajzolt kimenet ne ígérjen gombot.
function getServerSnapshot(): boolean {
  return false;
}

export function consumeInstallPrompt(): BeforeInstallPromptEvent | null {
  const event = deferred;
  deferred = null;
  if (event) emit();
  return event;
}

//* A telepítés HÁROM állapota, egyetlen kérdésben:
//*
//* * `"prompt"` — a böngésző a kezünkbe adta az ajánlatot: egy gomb elvégzi.
//* * `"ios"`    — nincs API, csak lépések, amiket a felhasználó tesz meg.
//* * `null`     — nincs mit kínálni (telepítve van, vagy a böngésző nem tud
//*                róla), és ilyenkor a hívó NE rajzoljon semmit.
export type InstallOffer = "prompt" | "ios" | null;

export function useInstallOffer(): InstallOffer {
  const hasPrompt = useSyncExternalStore(
    subscribeInstallPrompt,
    hasInstallPrompt,
    getServerSnapshot,
  );

  //! A LÉPÉSEKET CSAK HIDRATÁLÁS UTÁN KÉRDEZZÜK MEG. Az `isIphoneSafari` a
  //! felhasználói azonosítót olvassa, ami a kiszolgálón nincs meg: ha a
  //! rendereléskor döntenénk, a szerver és a böngésző más fát rajzolna.
  const ios = useSyncExternalStore(
    subscribeNever,
    iosSnapshot,
    getServerSnapshot,
  );

  if (hasPrompt) return "prompt";
  return ios ? "ios" : null;
}

//* Az iOS-es ág nem változik a lap élete során: a felhasználói azonosító
//* ugyanaz marad, és a telepítettség új ablakot nyit, nem ezt frissíti. A
//* `useSyncExternalStore` mégis jó eszköz rá, mert pontosan azt adja, ami itt
//* kell: a szerveren `false`, a böngészőben a valódi válasz — hidratálási
//* eltérés nélkül.
function subscribeNever(): () => void {
  return () => {};
}

let iosCache: boolean | null = null;
function iosSnapshot(): boolean {
  if (iosCache === null) {
    iosCache = !isAppInstalled() && isIphoneSafari();
  }
  return iosCache;
}

//* A gomb megnyomásának egyetlen, közös lefutása: az eseményt elhasználjuk (a
//* böngésző másodszor nem fogadná el), majd átadjuk a szót a rendszernek.
export function useInstall(): () => void {
  useEffect(startInstallCapture, []);
  return useCallback(() => {
    const event = consumeInstallPrompt();
    void event?.prompt();
  }, []);
}
