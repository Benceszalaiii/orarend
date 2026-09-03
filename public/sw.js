//! ─── SERVICE WORKER ────────────────────────────────────────────────────────
//! EZ A VÁZAT TARTJA MEG, NEM AZ ADATOT. Az órarend `POST`-tal jön, a Cache API
//! pedig nem tárol POST-választ — a legutóbb lekért hét ezért a localStorage-ban
//! ül (`lib/timetable-cache.ts`). Itt a HTML, a JS és a CSS marad meg, hogy a
//! lap térerő nélkül is ELINDULJON, és legyen mi megjelenítse a mentett hetet.
//!
//! Szándékosan kézzel írt és rövid: egy offline gyorsítótár-könyvtár több
//! viselkedést hozna, mint amennyit ez a lap használ.

const VERSION = "orarend-v3";
const SHELL = `${VERSION}-shell`;
const RUNTIME = `${VERSION}-runtime`;

//! FEJLESZTÉSBEN A WORKER FUT, DE NEM GYORSÍTÓTÁRAZ. Amíg `next dev` alatt
//! EGYÁLTALÁN nem volt worker, az értesítéseket helyben LEHETETLEN volt
//! kipróbálni: az engedélyt a böngésző megadta, aztán a feliratkozás
//! némán elbukott, mert nincs mire feliratkozni — a lap pedig azt írta ki,
//! hogy „ez a böngésző nem tudja fogadni az értesítéseket". Nem a böngésző
//! volt a hibás, hanem a hiányzó worker.
//*
//* A tiltás oka viszont valós volt, és megmarad: a `/_next/static/` alatti
//* fájlneveket a fejlesztői kiszolgáló ÚJRA MEG ÚJRA kiadja ugyanazon a néven,
//* egy „előbb a gyorsítótárból" szabály tehát a tegnapi kódot szolgálná ki.
//* Ezért fejlesztésben a `fetch` figyelő MEG SEM SZÓLAL — a worker ilyenkor
//* kizárólag a push és a koppintás kedvéért él. A megkülönböztetés a bejegyzés
//* címéből jön (`/sw.js?dev=1`, lásd `lib/sw-register.ts`), mert a workerben
//* nincs `process.env`.
const DEV = new URL(self.location.href).searchParams.get("dev") === "1";

//! MINDEN ELŐRE GENERÁLT ÚTVONAL ELŐRE MENTVE. Korábban csak a `/ma` és az
//! `/orarend` volt itt, a navigációs tartalék pedig ISMERETLEN cím esetén a
//! `/ma`-t adta vissza — vagyis a `/statisztika` hálózat nélkül a MAI NAP
//! tartalmát rajzolta ki, `/statisztika` címmel a sávban. Rossz oldal a jó
//! URL-en: ez rosszabb a hibánál, mert nem látszik rajta, hogy hibás.
//*
//* Ami kimarad: a `/statisztika` (kiszolgálón dől el, belépéshez kötött) és a
//* `/design` (fejlesztői próbalap). Ezek hálózat nélkül az `OFFLINE_URL`-t
//* kapják — egy lapot, ami MEGMONDJA, hogy nincs kapcsolat.
const OFFLINE_URL = "/offline.html";
const PRECACHE = [
  "/",
  "/ma",
  "/orarend",
  "/adatvedelem",
  OFFLINE_URL,
  "/icon-192.png",
  "/icon-512.png",
];

//! A HTML ÖNMAGÁBAN NEM LAP. A `/_next/static/` alatti kód- és stíluslapok
//! neve BUILDENKÉNT változik (tartalom-hash), ezért nem lehet őket listába
//! írni — ki viszont OLVASHATÓK abból a HTML-ből, amit épp elmentettünk.
//*
//* Enélkül a legelső látogatás utáni offline nyitás TELJESEN ÜRES lapot adott:
//* a váz megvolt, a hozzá tartozó JS és CSS nem, mert azokat a böngésző még a
//* worker átvétele ELŐTT töltötte le — a `fetch` figyelő tehát soha nem látta
//* őket, és a futásidejű gyorsítótárba sem kerültek be. A lap csak a MÁSODIK
//* megnyitás után vált offline-képessé, amiről a felhasználó mit sem tudott.
const ASSET_PATTERN = /\/_next\/static\/[A-Za-z0-9._\-/]+/g;

async function precache() {
  const shell = await caches.open(SHELL);
  const assets = new Set();

  //! EGYENKÉNT, NEM `addAll`-LAL. Az `addAll` ATOMI: egyetlen hibás útvonal az
  //! EGÉSZ előre mentést eldobja — a korábbi `.catch()` ezt elnyelte, és a lap
  //! némán offline-képtelen maradt. Külön kérésekkel egy hiányzó cím csak
  //! ÖNMAGÁT viszi el, a többi váz megmarad.
  await Promise.all(
    PRECACHE.map(async (url) => {
      try {
        //! `reload`: telepítéskor a böngésző saját HTTP-gyorsítótárát
        //! KIKERÜLJÜK, különben egy frissítés után a régi HTML kerülne a friss
        //! vázba.
        const res = await fetch(new Request(url, { cache: "reload" }));
        if (!res.ok) return;
        const copy = res.clone();
        await shell.put(url, res);
        if (!(copy.headers.get("content-type") || "").includes("text/html")) {
          return;
        }
        for (const asset of (await copy.text()).match(ASSET_PATTERN) ?? []) {
          assets.add(asset);
        }
      } catch {
        /* ez az egy útvonal marad ki — a többi váz megvan */
      }
    }),
  );

  //* A hash-elt fájlok örökre érvényesek, tehát a böngésző HTTP-gyorsítótárát
  //* itt NEM kerüljük ki: ami már letöltődött, azt ne töltsük le újra.
  const runtime = await caches.open(RUNTIME);
  await Promise.all(
    [...assets].map((url) => runtime.add(url).catch(() => undefined)),
  );
}

self.addEventListener("install", (event) => {
  //* Fejlesztésben nincs mit előre menteni — a váz úgyis percenként változik.
  if (DEV) {
    event.waitUntil(self.skipWaiting());
    return;
  }
  event.waitUntil(
    precache()
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
          //* Fejlesztésben MINDET töröljük: ha a lap egy éles buildből jött
          //* vissza, a régi váz nem lóghat itt tovább.
          keys
            .filter((key) => DEV || !key.startsWith(VERSION))
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  //! A FEJLESZTŐI WORKER NEM SZÓL BELE A KÉRÉSEKBE. Lásd a `DEV` melletti
  //! indoklást: itt a hash-elt fájlnevek nem állandóak, a gyorsítótár tehát a
  //! LEGROSSZABB fajta hibát okozná — a lap működik, csak nem az a kód fut,
  //! amit épp megírtál.
  if (DEV) return;

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
          //* `ignoreSearch`: a mentett példány a tiszta útvonalon ül, a
          //* megnyitás viszont gyakran hoz lekérdezést (`?utm=`, megosztott
          //* link) — enélkül a saját oldalunkat NEM ismernénk fel.
          const cached =
            (await caches.match(request)) ||
            (await caches.match(request, { ignoreSearch: true }));
          if (cached) return cached;
          //! ISMERETLEN ÚTVONALRA NEM ADUNK MÁS OLDALT. Régen a `/ma` jött
          //! ilyenkor: a `/statisztika` hálózat nélkül a mai nap tartalmát
          //! mutatta, a saját címén. Aki nem tudja, hogy offline van, az azt
          //! hiszi, ELROMLOTT a lap. Az `OFFLINE_URL` kimondja, mi történt.
          return (await caches.match(OFFLINE_URL)) || Response.error();
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
