//! ─── SERVICE WORKER ────────────────────────────────────────────────────────
//! EZ A VÁZAT TARTJA MEG, NEM AZ ADATOT. Az órarend `POST`-tal jön, a Cache API
//! pedig nem tárol POST-választ — a legutóbb lekért hét ezért a localStorage-ban
//! ül (`lib/timetable-cache.ts`). Itt a HTML, a JS és a CSS marad meg, hogy a
//! lap térerő nélkül is ELINDULJON, és legyen mi megjelenítse a mentett hetet.
//!
//! Szándékosan kézzel írt és rövid: egy offline gyorsítótár-könyvtár több
//! viselkedést hozna, mint amennyit ez a lap használ.

const VERSION = "orarend-v2";
const SHELL = `${VERSION}-shell`;
const RUNTIME = `${VERSION}-runtime`;

//* A két nézet, amit érdemes hidegen is megnyitni. Nem az összes útvonal: a
//* `/adatvedelem`-et senki nem olvassa offline.
const PRECACHE = ["/ma", "/orarend", "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      //! `reload`: telepítéskor a böngésző saját HTTP-gyorsítótárát KIKERÜLJÜK,
      //! különben egy frissítés után a régi HTML kerülne a friss vázba.
      .then((cache) =>
        cache.addAll(
          PRECACHE.map((url) => new Request(url, { cache: "reload" })),
        ),
      )
      //* Egy hiányzó útvonal nem buktathatja meg a telepítést: a lap enélkül is
      //* működik, csak online.
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => !key.startsWith(VERSION))
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  //! AZ ÓRAREND KÉRÉSEIHEZ NEM NYÚLUNK. A `/api/jedlik/*` a Jedlikinfo felé
  //! megy; egy elavult válasz itt rosszabb a hibánál, mert nem látszana rajta,
  //! hogy régi. Az adat frissessége a lap dolga, nem a gyorsítótáré.
  if (url.pathname.startsWith("/api/")) return;

  //* Az RSC-válaszok kérésenként eltérnek; eltárolva rossz oldalt adnának vissza.
  if (url.searchParams.has("_rsc")) return;

  //! A LAP MEGNYITÁSA: előbb a hálózat, mert a friss HTML a helyes. Ha nincs
  //! hálózat, a mentett váz jön — és a lap ilyenkor kiírja, milyen régi
  //! órarendet mutat.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(SHELL).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          //* Ismeretlen útvonal offline: a napi nézet a legjobb tipp — az az,
          //* amiért az ikont kitették.
          return cached || (await caches.match("/ma")) || Response.error();
        }),
    );
    return;
  }

  //* A build kimenete tartalom-hash-elt: ami egyszer megvan, örökre érvényes.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            const copy = response.clone();
            caches.open(RUNTIME).then((cache) => cache.put(request, copy));
            return response;
          }),
      ),
    );
    return;
  }

  //* Minden más saját erőforrás (ikonok, betűk): a mentett példány azonnal, a
  //* friss a háttérben.
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(RUNTIME).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});

//! ─── ÉRTESÍTÉSEK ───────────────────────────────────────────────────────────
//! A PUSH AZÉRT ITT LAKIK, MERT A LAP NEM MINDIG FUT. Egy értesítésnek akkor
//! kell megérkeznie, amikor a diák épp NEM az órarendet nézi — zárt képernyőn,
//! másik appból. A service worker az egyetlen kód, amit a rendszer ilyenkor is
//! elindít.
//*
//* A worker NEM fogalmaz és NEM számol: a kész címet és törzset a szerver
//* küldi (lásd `lib/push-shared.ts` — `PushPayload`). Ennek oka gyakorlati: a
//* worker cseréje napokig tarthat, egy szövegjavítás pedig nem várhat annyit.

//* Ha a hasznos teher hiányzik vagy értelmezhetetlen (a szolgáltató teszt-
//* üzenete, elrontott kiküldés), akkor is MEG KELL jelennie valaminek: a
//* böngészők a `userVisibleOnly` feliratkozásnál elvárják, hogy minden push
//* látható értesítést hozzon — enélkül idővel visszavonják a jogot.
const FALLBACK = {
  kind: "change",
  title: "Órarend",
  body: "Változott valami az órarendedben.",
  url: "/ma",
  tag: "orarend-fallback",
};

self.addEventListener("push", (event) => {
  let payload = FALLBACK;
  try {
    const data = event.data ? event.data.json() : null;
    if (data && typeof data.title === "string") {
      payload = { ...FALLBACK, ...data };
    }
  } catch {
    /* nem JSON — marad a tartalék */
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      //* A maszkolható ikon a rendszersáv kerek/lekerekített kereteibe is
      //* belefér; a `badge` az Android egyszínű, kicsi jele.
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: payload.tag,
      //! ÚJRAREZEGTETÜNK, HA A CÍMKE ÜTKÖZIK. Alapból az azonos címkéjű
      //! értesítés NÉMÁN cserélné le a korábbit — egy frissült változás-jelzés
      //! így észrevétlen maradna. Az emlékeztetőknél a címke amúgy is egyedi,
      //! tehát ez csak a változásokat érinti, azokat pedig észre kell venni.
      renotify: true,
      //* Az óra előtti jelzés akkor ér valamit, ha a diák felnéz rá: az
      //* órarend-értesítés nem háttérzaj.
      requireInteraction: false,
      data: { url: payload.url },
    }),
  );
});

//! A KOPPINTÁS NE NYISSON ÚJ LAPOT, HA MÁR VAN EGY. Telepített appként a
//! második ablak külön példány lenne — a diák a régiben hagyott állapotot
//! keresné a másikban. Ezért előbb a MEGLÉVŐ ablakot keressük meg, odavisszük
//! a kért nézetre, és azt hozzuk előre.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = event.notification.data?.url || "/ma";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        for (const client of clients) {
          if (new URL(client.url).origin !== self.location.origin) continue;
          return client.navigate(target).then((c) => (c || client).focus());
        }
        return self.clients.openWindow(target);
      })
      .catch(() => self.clients.openWindow(target)),
  );
});

//! A VÉGPONT MAGÁTÓL IS LECSERÉLŐDHET. A böngésző időnként új push-címet ad
//! (kulcsforgatás, a szolgáltató kérése) — ilyenkor a régi cím némán
//! érvénytelenné válik, és a diák semmit nem venne észre, csak azt, hogy nem
//! jön több értesítés. Ezt a worker tudja egyedül elkapni.
//*
//* Az osztálylistát nem ismerjük itt (a `localStorage` a workerből nem
//* olvasható) — a szerver a `replaces` alapján viszi át a régi sor beállításait.
self.addEventListener("pushsubscriptionchange", (event) => {
  const old = event.oldSubscription;
  const key = old?.options?.applicationServerKey;
  if (!key) return;

  event.waitUntil(
    self.registration.pushManager
      .subscribe({ userVisibleOnly: true, applicationServerKey: key })
      .then((fresh) => {
        const json = fresh.toJSON();
        return fetch("/api/ertesites", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            endpoint: fresh.endpoint,
            keys: json.keys,
            replaces: old.endpoint,
          }),
        });
      })
      .catch(() => undefined),
  );
});
