import { DEFAULT_PREFS, MAX_CLASSES, type PushPrefs } from "./push-shared";

//* ---------------------------------------------------------------------------
//* ÉRTESÍTÉSEK — A BÖNGÉSZŐ OLDALA
//* ---------------------------------------------------------------------------
//! AZ ENGEDÉLYT CSAK KATTINTÁS UTÁN KÉRJÜK, SOHA BETÖLTÉSKOR. Ez nem udvariassági
//! kérdés, hanem az egyetlen működő sorrend: a böngésző kérdését EGYSZER lehet
//! feltenni, és a kapásból elutasított engedélyt a JavaScript soha többé nem
//! kérheti újra — a felhasználónak a böngésző beállításaiban kellene
//! visszavonnia, amit gyakorlatilag senki nem tesz meg. Egy oldalbetöltéskor
//! felugró kérdés tehát nem „korai", hanem VÉGLEGES: elégeti a lehetőséget.
//*
//* Ezért két lépcső van, és a sorrendjük kötött:
//*   1. SAJÁT kérdés (a harang → párbeszéd): itt derül ki, mit ajánlunk és
//*      miért; aki itt nemet mond, annál a böngésző meg sem szólal.
//*   2. BÖNGÉSZŐ kérdése: kizárólag a párbeszéd „Bekapcsolom" gombjából.
//*
//! Ugyanez a felépítés áll a jedlik-szakkor Phase H tervében is (entitásonkénti,
//! diák-kezdeményezésű opt-in) — ott szakkörre, itt osztályra szól.

const PREFS_KEY = "orarend:push:v1";

//* A helyi példány a párbeszéd ÁLLAPOTA, nem az igazság forrása: az igazságot
//* a böngésző feliratkozása (`pushManager.getSubscription()`) és a szerver
//* sora együtt adja. Azért tartjuk mégis, hogy a párbeszéd kinyitáskor
//* AZONNAL a diák saját beállításait mutassa, ne egy üres űrlapot.
export function loadPrefs(): PushPrefs {
  try {
    const raw = window.localStorage.getItem(PREFS_KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw) as Partial<PushPrefs> | null;
    return {
      classes: Array.isArray(parsed?.classes)
        ? parsed.classes.filter((c): c is string => typeof c === "string")
        : [],
      everyLesson: parsed?.everyLesson === true,
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

function savePrefs(prefs: PushPrefs): void {
  try {
    window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* privát módban nincs tárhely — a párbeszéd ilyenkor üresen nyílik */
  }
}

function clearPrefs(): void {
  try {
    window.localStorage.removeItem(PREFS_KEY);
  } catch {
    /* nincs mit takarítani */
  }
}

//* ---------------------------------------------------------------------------
//* MIT TUD EZ AZ ESZKÖZ
//* ---------------------------------------------------------------------------
//! iOS-EN CSAK TELEPÍTVE VAN PUSH. A Safari 16.4 óta támogatja a web pusht, de
//! KIZÁRÓLAG a kezdőképernyőre kitett (standalone) lapnál — böngészőlapként a
//! `PushManager` egyszerűen nincs is az ablakban. Ezt nem hibaüzenetként kell
//! közölni, hanem elvégzendő lépésként: aki kitette az ikont, annál működni fog.
//* A `blocked` a böngésző korábbi elutasítása. Onnan JS-sel nincs visszaút —
//* a párbeszéd ilyenkor csak elmondja, hol lehet visszavonni.
export type PushSupport = "ready" | "needs-install" | "blocked" | "unsupported";

const INSTALLED_DISPLAY_MODES = ["standalone", "fullscreen", "minimal-ui"];

function isStandalone(): boolean {
  const legacy = (navigator as Navigator & { standalone?: boolean }).standalone;
  if (legacy === true) return true;
  try {
    return INSTALLED_DISPLAY_MODES.some(
      (mode) => window.matchMedia(`(display-mode: ${mode})`).matches,
    );
  } catch {
    return false;
  }
}

function isIos(): boolean {
  //* Az iPadOS „asztali" felhasználói azonosítót küld, de érintőpontja van —
  //* a `maxTouchPoints` a megbízható jel a Mac és az iPad között.
  const ua = navigator.userAgent;
  if (/iPhone|iPod|iPad/.test(ua)) return true;
  return /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
}

export function pushSupport(): PushSupport {
  if (typeof window === "undefined") return "unsupported";
  if (!("serviceWorker" in navigator) || !("Notification" in window)) {
    return "unsupported";
  }
  if (!("PushManager" in window)) {
    //* iOS-en a hiány oka ismert és orvosolható: ki kell tenni a
    //* kezdőképernyőre. Máshol viszont tényleg nincs támogatás.
    return isIos() && !isStandalone() ? "needs-install" : "unsupported";
  }
  if (Notification.permission === "denied") return "blocked";
  return "ready";
}

//* A VAPID nyilvános kulcs base64url-ből bájttömbbé. A `subscribe` csak ezt az
//* alakot fogadja el.
function decodeKey(base64: string): Uint8Array {
  const padded = base64.padEnd(
    base64.length + ((4 - (base64.length % 4)) % 4),
    "=",
  );
  const raw = window.atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

function serverKey(): Uint8Array | null {
  const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!key) return null;
  try {
    return decodeKey(key);
  } catch {
    return null;
  }
}

//! A `serviceWorker.ready` SOHA NEM UTASÍT EL — ez a csapda benne. Ha nincs
//! (és nem is lesz) bejegyzett worker, a `Promise` egyszerűen nem dől el: nem
//! hibázik, csak vár. A rá váró gomb ilyenkor ÖRÖKRE pörögne, és a diák azt
//! látná, hogy a bekapcsolás „elakadt". Ez nem elméleti eset: fejlesztői módban
//! SZÁNDÉKOSAN nincs worker (lásd `components/register-sw.tsx`), és élesben is
//! előfordul, ha a bejegyzés elbukott (privát mód, kikapcsolt tárhely).
//*
//* Ezért a várakozásnak határa van. A `sw.js` bejegyzését a `RegisterSW` a lap
//* betöltése után indítja, tehát pár másodperc bőven elég; ami ennyi alatt nem
//* jött össze, az nem is fog.
const WORKER_WAIT_MS = 5_000;

async function readyWorker(): Promise<ServiceWorkerRegistration | null> {
  try {
    return await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<null>((resolve) =>
        window.setTimeout(() => resolve(null), WORKER_WAIT_MS),
      ),
    ]);
  } catch {
    return null;
  }
}

export type SubscribeResult =
  | { ok: true }
  | { ok: false; reason: "denied" | "unsupported" | "server" };

//! EZ A FÜGGVÉNY CSAK GOMBNYOMÁSBÓL HÍVHATÓ. A `Notification.requestPermission()`
//! felhasználói mozdulathoz kötött — effektből vagy időzítőből egyes böngészők
//! el sem indítják. A hívási helyet ezért nem szabad „kényelmesebbre" mozgatni.
export async function enablePush(prefs: PushPrefs): Promise<SubscribeResult> {
  const classes = prefs.classes.slice(0, MAX_CLASSES);
  if (classes.length === 0) return { ok: false, reason: "unsupported" };

  //! A SORREND KÖTÖTT: ELŐBB AZ ENGEDÉLY, AZTÁN MINDEN MÁS `await`. A Safari a
  //! `requestPermission()`-t csak ÉLŐ felhasználói aktivációval engedi — egy
  //! előtte lefutó `await` (a service worker megvárása) felemészti azt, és a
  //! kérdés meg sem jelenik. A kulcs ellenőrzése maradhat itt, mert az
  //! szinkron; a workerre várni viszont csak utána szabad.
  const key = serverKey();
  if (!key) return { ok: false, reason: "unsupported" };

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return { ok: false, reason: "denied" };

  const registration = await readyWorker();
  if (!registration) return { ok: false, reason: "unsupported" };

  let subscription: PushSubscription;
  try {
    //! `userVisibleOnly: true` KÖTELEZŐ. A böngészők nem engednek néma pusht —
    //! és nekünk sem kell: minden jelzésünkből látható értesítés lesz.
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: key as BufferSource,
    });
  } catch {
    return { ok: false, reason: "unsupported" };
  }

  const next: PushPrefs = { classes, everyLesson: prefs.everyLesson };
  const sent = await postSubscription(subscription, next);
  if (!sent) {
    //! HA A SZERVER NEM VETTE ÁT, NE MARADJON FÉLKÉSZ ÁLLAPOT. A böngészőben
    //! élő, de a szerver által nem ismert feliratkozás a legrosszabb végállapot:
    //! a harang bekapcsolva látszana, és soha nem jönne semmi.
    await subscription.unsubscribe().catch(() => undefined);
    return { ok: false, reason: "server" };
  }

  savePrefs(next);
  return { ok: true };
}

async function postSubscription(
  subscription: PushSubscription,
  prefs: PushPrefs,
  replaces?: string,
): Promise<boolean> {
  const json = subscription.toJSON();
  try {
    const res = await fetch("/api/ertesites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        endpoint: subscription.endpoint,
        keys: { p256dh: json.keys?.p256dh, auth: json.keys?.auth },
        classes: prefs.classes,
        everyLesson: prefs.everyLesson,
        replaces,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

//* A meglévő feliratkozás — ez mondja meg, hogy a harang be van-e kapcsolva.
export async function currentSubscription(): Promise<PushSubscription | null> {
  if (pushSupport() !== "ready") return null;
  const registration = await readyWorker();
  if (!registration) return null;
  try {
    return await registration.pushManager.getSubscription();
  } catch {
    return null;
  }
}

//* Beállítás módosítása bekapcsolt állapotban: nincs új engedélykérés, csak a
//* meglévő sor frissül.
export async function updatePush(prefs: PushPrefs): Promise<boolean> {
  const subscription = await currentSubscription();
  if (!subscription) return false;
  const next: PushPrefs = {
    classes: prefs.classes.slice(0, MAX_CLASSES),
    everyLesson: prefs.everyLesson,
  };
  if (next.classes.length === 0) return false;
  const ok = await postSubscription(subscription, next);
  if (ok) savePrefs(next);
  return ok;
}

export async function disablePush(): Promise<void> {
  const subscription = await currentSubscription();
  clearPrefs();
  if (!subscription) return;
  //! ELŐBB A SZERVER, AZTÁN A BÖNGÉSZŐ. Fordítva a végpont már érvénytelen
  //! lenne, mire a törlést elküldjük — a sor pedig ott ragadna a tárolóban a
  //! saját élettartama végéig, és minden percben egy sikertelen kiküldést
  //! generálna.
  await fetch("/api/ertesites", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint: subscription.endpoint }),
    keepalive: true,
  }).catch(() => undefined);
  await subscription.unsubscribe().catch(() => undefined);
}

//! A FELIRATKOZÁS LEJÁR, HA NEM NYÚLNAK HOZZÁ. A szerveren minden sornak van
//! élettartama (hogy az elhagyott készülékek ne maradjanak ott örökre) — ezt a
//! lap megnyitása húzza újra. Egyben ez javítja azt is, ha a böngésző közben
//! lecserélte a végpontot, de a `pushsubscriptionchange` nem ért célba.
//* Csendben fut, és semmit nem kér a felhasználótól: engedélyt már nem kell.
export async function refreshPush(): Promise<void> {
  const prefs = loadPrefs();
  if (prefs.classes.length === 0) return;
  const subscription = await currentSubscription();
  if (!subscription) return;
  await postSubscription(subscription, prefs);
}
