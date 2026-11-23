//! ─── SERVICE WORKER ────────────────────────────────────────────────────────
//! EZ A VÁZAT TARTJA MEG, NEM AZ ADATOT. Az órarend `POST`-tal jön, a Cache API
//! pedig nem tárol POST-választ — a legutóbb lekért hét ezért a localStorage-ban
//! ül (`lib/timetable-cache.ts`). Itt a HTML, a JS és a CSS marad meg, hogy a
//! lap térerő nélkül is ELINDULJON, és legyen mi megjelenítse a mentett hetet.
//!
//! Szándékosan kézzel írt és rövid: egy offline gyorsítótár-könyvtár több
//! viselkedést hozna, mint amennyit ez a lap használ.

//* v5: a nézetek a mentett vázból indulnak (lásd `navigate`), és az
//* átirányításból mentett példány jelölést kap — a régi, jelöletlen
//* példányokat ezért ki kell söpörni.
const VERSION = "orarend-v5";
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

//! ÁTIRÁNYÍTOTT VÁLASZT A CACHE API NEM VESZ ÁT. A `Cache.put` `TypeError`-t
//! dob, ha a válasz `redirected` — és a `/` MOST MÁR ÁTIRÁNYÍT annak, aki járt
//! már valamelyik nézetben (lásd `src/proxy.ts`). Enélkül a nyitócím némán
//! kimaradt volna a vázból: hálózat nélkül az „nincs kapcsolat" lap jött volna
//! a saját órarendje helyett.
//*
//* Az átcsomagolás ugyanazt a törzset és fejlécet viszi tovább, csak a
//* „követett átirányítás" jelölés vész el vele — pontosan az, ami zavar.
//*
//! A JELÖLÉS VISZONT NEM VESZHET EL NYOMTALANUL. Az átirányításból mentett
//! példány a `/` kulcsán egy MÁSIK lap tartalmát hordja (pl. a `/ma`-ét). Ezt
//! offline tartaléknak jó, azonnali indításra nem: a cím és a tartalom szétesne.
//! Ezért kap egy saját fejlécet, amiből a `navigate` felismeri.
const REDIRECTED_HEADER = "x-sw-redirected";

function storable(response) {
  if (!response.redirected) return response;
  const headers = new Headers(response.headers);
  headers.set(REDIRECTED_HEADER, "1");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

//! ─── AZONNALI INDÍTÁS ──────────────────────────────────────────────────────
//! A TELEFONON MEGNYITOTT APP EDDIG A HÁLÓZATRA VÁRT, MIELŐTT BÁRMIT RAJZOLT.
//! A HTML kérésenként renderelődik (a gyökér-elrendezés munkamenetet olvas),
//! tehát minden indítás egy teljes kiszolgálói kör volt — hidegindításkor a
//! függvény ébredésével és az adatbázis-kapcsolattal együtt, gyenge iskolai
//! wifin pedig a `fetch` addig lógott, amíg a böngésző fel nem adta. Ez volt
//! az 5–10 másodperc.
//*
//! EZEKEN A CÍMEKEN A MENTETT VÁZ AZONNAL JÖN, A FRISS A HÁTTÉRBEN ÉRKEZIK
//! (stale-while-revalidate). Biztonságosan megtehető, mert ezeknek a lapoknak a
//! HTML-je csak váz: az órarendet a böngésző tölti le, és a lap maga mondja ki,
//! ha a mutatott hét a helyi példányból van (`lib/timetable-cache.ts`). A
//! következő indítás már a háttérben frissült vázat kapja.
//*
//! AMI NINCS A LISTÁN, AZ MARAD „ELŐBB A HÁLÓZAT": a belépés, az `/admin`, a
//! `/statisztika` HTML-je a munkamenettől függ, és egy kijelentkezés után nem
//! mutathatja a mentett, belépett állapotot. A `/valtozasok` a kiszolgálón
//! számol dátumot, ezért az sem.
const FAST_START = new Set([
  "/",
  "/home",
  "/ma",
  "/orarend",
  "/tanari",
  "/terem",
  "/teremkereso",
  "/ugyelet",
  "/tantargyak",
  "/miert",
  "/adatvedelem",
]);

//* A friss HTML hivatkozta, még nem mentett kód- és stíluslapok. Egy új build
//* után így a KÖVETKEZŐ indítás is teljesen helyből fut, és hálózat nélkül sem
//* hiányzik semmi a frissített vázból.
async function warmAssets(html) {
  const runtime = await caches.open(RUNTIME);
  const urls = [...new Set(html.match(ASSET_PATTERN) ?? [])];
  await Promise.all(
    urls.map(async (url) => {
      if (await runtime.match(url)) return;
      await runtime.add(url).catch(() => undefined);
    }),
  );
}

//* A hálózati kör, ami a vázat is frissíti. A navigációs előtöltés (ha a
//* böngésző tudja) a worker ébredésével PÁRHUZAMOSAN indítja a kérést, nem
//* utána — a „nincs mentett példány" ágon ez a worker indulásának idejét spórolja.
function fetchAndStore(event) {
  const request = event.request;
  return Promise.resolve(event.preloadResponse)
    .then((preloaded) => preloaded || fetch(request))
    .then((response) => {
      if (response.ok && response.type === "basic") {
        const copy = storable(response.clone());
        const html = response.clone();
        event.waitUntil(
          caches
            .open(SHELL)
            .then((cache) => cache.put(request, copy))
            .then(() => html.text())
            .then(warmAssets)
            .catch(() => undefined),
        );
      }
      return response;
    });
}

async function navigate(event) {
  const request = event.request;
  const url = new URL(request.url);
  const network = fetchAndStore(event);

  if (FAST_START.has(url.pathname)) {
    const cached = await caches.match(request, { cacheName: SHELL });
    if (cached && !cached.headers.has(REDIRECTED_HEADER)) {
      //! A HÁTTÉRBELI KÖRNEK VÉGIG KELL FUTNIA, különben a böngésző a válasz
      //! után leállíthatja a workert, és a váz soha nem frissülne.
      event.waitUntil(network.catch(() => undefined));
      return cached;
    }
  }

  try {
    return await network;
  } catch {
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
  }
}

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
        await shell.put(url, storable(res));
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
      //* Navigációs előtöltés: a lap kérése a worker ébredésével párhuzamosan
      //* indul. Ahol a böngésző nem tudja, a `fetchAndStore` sima kérésre vált.
      //* Fejlesztésben KI: ott a `fetch` figyelő nem szól bele, és egy el nem
      //* vett előtöltés minden navigációnál figyelmeztetést írna.
      .then(() => {
        const preload = self.registration.navigationPreload;
        if (!preload) return undefined;
        return (DEV ? preload.disable() : preload.enable()).catch(
          () => undefined,
        );
      })
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

  //! A LAP MEGNYITÁSA: a nézeteken a mentett váz azonnal, mindenhol máshol
  //! előbb a hálózat. Hálózat nélkül a mentett váz jön — és a lap ilyenkor
  //! kiírja, milyen régi órarendet mutat. Lásd `navigate`.
  if (request.mode === "navigate") {
    event.respondWith(navigate(event));
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
  title: "Jedlik Info",
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
