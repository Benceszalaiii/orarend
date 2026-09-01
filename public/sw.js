//! ─── SERVICE WORKER ────────────────────────────────────────────────────────
//! EZ A VÁZAT TARTJA MEG, NEM AZ ADATOT. Az órarend `POST`-tal jön, a Cache API
//! pedig nem tárol POST-választ — a legutóbb lekért hét ezért a localStorage-ban
//! ül (`lib/timetable-cache.ts`). Itt a HTML, a JS és a CSS marad meg, hogy a
//! lap térerő nélkül is ELINDULJON, és legyen mi megjelenítse a mentett hetet.
//!
//! Szándékosan kézzel írt és rövid: egy offline gyorsítótár-könyvtár több
//! viselkedést hozna, mint amennyit ez a lap használ.

const VERSION = "orarend-v1";
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
        cache.addAll(PRECACHE.map((url) => new Request(url, { cache: "reload" }))),
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
