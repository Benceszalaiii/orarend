//* ---------------------------------------------------------------------------
//* A SERVICE WORKER BEJEGYZÉSE — EGY HELYEN
//* ---------------------------------------------------------------------------
//! KÉT HÍVÓJA VAN, ÉS UGYANAZT A WORKERT KELL KAPNIUK. A lap betöltésekor a
//! `RegisterSW` jegyzi be (a váz és az offline nyitás miatt), az értesítés
//! bekapcsolásakor pedig a `push.ts` kér rá egy MÁSODIK esélyt — ha a diák
//! azonnal a harangra koppint, a betöltéskori bejegyzés még el sem indult.
//! Amíg a cím két helyen volt leírva, egy eltérés két KÜLÖN bejegyzést hozott
//! volna létre ugyanazon a hatókörön; ezért lakik itt, egyetlen sorban.
//*
//* A `?dev=1` a workernek szól: fejlesztésben fusson, de a kéréseket ne
//* gyorsítótárazza (lásd `public/sw.js`). A workerben nincs `process.env`, a
//* saját címe viszont mindig megvan — ezért a címben utazik a jelzés.
const SW_URL =
  process.env.NODE_ENV === "production" ? "/sw.js" : "/sw.js?dev=1";

export function supportsWorker(): boolean {
  return typeof navigator !== "undefined" && "serviceWorker" in navigator;
}

//* Csendben bukik el: a lap worker nélkül is teljes értékű, csak nem indul el
//* hálózat nélkül, és nem tud értesítést fogadni.
export async function registerWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!supportsWorker()) return null;
  try {
    //* Ugyanarra a hatókörre ismételten hívható: a böngésző ilyenkor a MEGLÉVŐ
    //* bejegyzést adja vissza (és frissíti), nem csinál másodikat.
    return await navigator.serviceWorker.register(SW_URL, {
      scope: "/",
      updateViaCache: "none",
    });
  } catch {
    return null;
  }
}
