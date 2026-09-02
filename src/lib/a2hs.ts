//* ---------------------------------------------------------------------------
//* KEZDŐKÉPERNYŐRE TÉTEL — MIKOR VAN ÉRTELME SZÓLNI
//*
//* Két platform, két OK a szólásra — és emiatt két külön kérdés:
//*
//! iOS-EN A RENDSZERFUNKCIÓ HIÁNYZIK. A Safari SOHA nem ajánlja fel a
//! telepítést: aki nem tudja, hogy a Megosztás menüben ott a „Főképernyőhöz
//! adás", annak a lap örökre böngészőlap marad. Nekünk csak ELMONDANI van
//! módunk, hogyan kell — a lépéseket a felhasználó teszi meg.
//*
//! ANDROIDON A BÖNGÉSZŐ ÁTADJA A SZÓT. A Chrome a `beforeinstallprompt`
//! eseménnyel felajánlja, hogy MI válasszuk meg a telepítés pillanatát és
//! szövegét; ha ezt elfogadjuk (`preventDefault`), a saját, könnyen elnézhető
//! sávját visszavonja. Nem egy második ajánlatot rakunk a böngészőé mellé,
//! hanem ÁTVESSZÜK azt az egyet — ezért nem kérdez itt semmi kétszer.
//*
//! CSAK IPHONE, CSAK SAFARI — az iOS-es ágon. A szöveg egy KONKRÉT gombra
//! mutat; ha nem az van a képernyőn, akkor ártunk vele. A Chrome/Firefox/
//! beágyazott nézetek iOS-en más (vagy semmilyen) megosztás-menüt adnak, az
//! iPad eszköztára pedig máshol áll — inkább senkinek nem szólunk, mint hogy
//! rossz helyre küldjünk valakit. Az androidos ágon nincs mit felismerni: ott
//! MAGA a böngésző szól, hogy telepíthető vagyunk nála.
//*
//* A jelölő KIZÁRÓLAG a böngészőben marad, mint a lap minden más állapota
//* (lásd `/adatvedelem`) — a szerver nem tud róla, hogy szóltunk-e már.
//* ---------------------------------------------------------------------------

const A2HS_STORAGE_KEY = "orarend:a2hs:v1";

//! MÁR TELEPÍTVE = NINCS MIT MONDANI. Ez a legdrágább tévedés a három közül:
//! aki már kitette a lapot a kezdőképernyőre, annak a tipp nem haszontalan,
//! hanem BOSSZANTÓ — azt kéri tőle, amit már megtett. Ezért NEM egy jelzésre
//! hagyatkozunk:
//!
//! * `navigator.standalone` — az iOS saját, szabványon kívüli jelzése (ezért a
//!   típuskényszerítés). Ez a megbízható válasz iPhone-on.
//! * `display-mode` — a szabványos út. Mindhárom „nem böngészőlap" módot
//!   kérdezzük: a manifest ma `standalone`, de egy `fullscreen`/`minimal-ui`
//!   érték (vagy a böngésző saját döntése) ugyanúgy telepített ablakot jelent,
//!   és egy `standalone`-ra szűkített kérdés ezeket hamisan böngészőnek látná.
const INSTALLED_DISPLAY_MODES = ["standalone", "fullscreen", "minimal-ui"];

function isInstalled(): boolean {
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

//* A böngészők, amelyek iOS-en NEM a Safari felületét adják: saját megosztás
//* menü, vagy egyáltalán semmi (beágyazott nézetek — Instagram, Facebook).
const NOT_SAFARI = /CriOS|FxiOS|EdgiOS|OPiOS|Instagram|FBAN|FBAV|GSA/;

function isIphoneSafari(): boolean {
  const ua = navigator.userAgent;
  if (!/iPhone|iPod/.test(ua)) return false;
  //* A beágyazott WKWebView-ek zöméből hiányzik a „Safari" jelölés — az
  //* ellenőrzés így egyszerre szűri a más böngészőket és az alkalmazáson
  //* belüli nézeteket.
  return /Safari/.test(ua) && !NOT_SAFARI.test(ua);
}

export function hasSeenA2HS(): boolean {
  try {
    return window.localStorage.getItem(A2HS_STORAGE_KEY) !== null;
  } catch {
    //! PRIVÁT MÓDBAN INKÁBB HALLGATUNK. Ha nem tudjuk megjegyezni, hogy már
    //! szóltunk, akkor MINDEN megnyitáskor szólnánk — egy egyszeri tipp
    //! ismételve már zaklatás.
    return true;
  }
}

export function markA2HSSeen(): void {
  try {
    window.localStorage.setItem(A2HS_STORAGE_KEY, "1");
  } catch {
    /* nincs tárhely — a `hasSeenA2HS` úgyis hallgatásra vált */
  }
}

//* Egyetlen kérdés, egy helyen: elmondjuk-e a kézi lépéseket ezen az eszközön?
//! A TELEPÍTETTSÉG AZ ELSŐ KÉRDÉS, nem az utolsó. Sorrendben a legerősebb
//! kizáró okot kérdezzük előbb — így egy későbbi módosítás (mondjuk a
//! böngésző-felismerés lazítása) sem tudja véletlenül a telepített ablakba
//! beengedni a tippet.
//*
//* Megjegyzés: iOS-en a kezdőképernyőről indított lap felhasználói
//* azonosítójából KIMARAD a „Safari" jelölés, így az `isIphoneSafari` maga is
//* nemet mondana — a két feltétel egymástól függetlenül is véd.
export function shouldOfferIosA2HS(): boolean {
  return !isInstalled() && isIphoneSafari() && !hasSeenA2HS();
}

//* Ugyanaz a kérdés az androidos ágra — a böngésző-felismerés nélkül.
//! ITT NEM TALÁLGATUNK. A `beforeinstallprompt` esemény MAGA a válasz arra,
//! hogy „telepíthető-e nálam ez a lap": a Chrome csak akkor küldi el, ha a
//! manifest és a service worker rendben van, és a lap még nincs telepítve. Egy
//! saját Android-felismerés ehhez képest csak rontani tudna — kizárná azokat a
//! böngészőket (Edge, Samsung Internet, asztali Chrome), amelyek ugyanezt az
//! eseményt küldik, és amelyeknél a telepítés ugyanúgy nyereség.
//*
//* A telepítettséget mégis külön kérdezzük: az esemény egy korábbi
//* képkockából is a kezünkben maradhat (lásd a komponens `appinstalled`
//* ágát), és a jelölő olvasása sem kerül semmibe.
export function shouldOfferAndroidA2HS(): boolean {
  return !isInstalled() && !hasSeenA2HS();
}
