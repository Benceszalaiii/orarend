import { notifyPrefsChanged } from "./prefs-events";

//! ═══════════════════════════════════════════════════════════════════════════
//! A LAP LELTÁRA — MI AZ, AMIT EL LEHET REJTENI BELŐLE
//! ═══════════════════════════════════════════════════════════════════════════
//! A fejléc lapja (`chrome/standing-line.tsx`) szándékosan TELJES: minden
//! képesség ki van benne írva, névvel, gyakoriság szerint sorba rakva. Ez
//! addig helyes, amíg a lap MINDEN sora szól valakinek — csakhogy nem szól.
//! A duális beosztás a duális osztályoké; a Jedlik osztályainak többsége soha
//! nem jár munkahelyre, és nekik a „Duális beosztás" sor nem lehetőség, hanem
//! egy örökre halott sor a három közül, amit tényleg használnak.
//!
//! EZ NEM A RÉGI ESZKÖZTÁR BAJA, ÉS NEM IS AZZAL A GYÓGYSZERREL KEZELJÜK. Az
//! eszköztár attól csordult túl, hogy a KÉSZÍTŐ döntötte el, mi fér ki, és
//! ikonok mögé rejtett dolgokat, amiket senki nem talált meg. Itt fordítva
//! van: a lap alapból mindent MUTAT, és a DIÁK mondhatja ki egyetlen helyen,
//! hogy neki melyik sor nem kell. Ami rejtve van, arról ő tud — ő tette oda.
//!
//! AMI NEM REJTHETŐ EL, AZ NEM FELEDÉKENYSÉG. Az alany („Kit nézel"), a hét
//! („Melyik hetet") és a fiók kimarad ebből a listából: az első kettő MAGA a
//! nézet — nélkülük a lap nem tud választ adni arra, amiért megnyitották —, a
//! fiók pedig az egyetlen út a másik készüléken beállítottakhoz. És kimarad a
//! testreszabó sor is: egy kapcsoló, ami magát is kikapcsolhatja, zsákutca.
//! ═══════════════════════════════════════════════════════════════════════════

export const MENU_HIDDEN_STORAGE_KEY = "orarend:menu-hidden:v1";

/**
 * Egy elrejthető sor azonosítója.
 *
 * @remarks Ezek a jelek a TÁROLÓBA és a szerverre is bekerülnek, tehát
 * SZERZŐDÉSEK: egy átnevezés a diákok mentett választását dobná el. Ha egy sor
 * megszűnik, a jele maradjon kihasználatlanul, ne kapja meg egy másik.
 */
export type MenuItemId =
  | "appearance"
  | "home"
  | "duty"
  | "rooms"
  | "merge"
  | "dual"
  | "glance"
  | "notify"
  | "calendar"
  | "legend";

/** Melyik szakaszban áll a sor a lapon — a testreszabó ugyanígy csoportosít. */
export type MenuItemGroup = "settings" | "site";

export type MenuItemMeta = {
  id: MenuItemId;
  /** Ugyanaz a felirat, ami a lapon áll — a testreszabó nem talál ki újat. */
  label: string;
  hint: string;
  group: MenuItemGroup;
};

//! A SORREND ITT IS A LAPÉ, nem ábécé. A testreszabó ugyanabban a sorrendben
//! sorolja fel a sorokat, ahogy a lapon állnak — így a diák a listában
//! ugyanazt a képet látja, amit becsukja, és nem kell keresnie, melyik
//! kapcsoló melyik sort oltja el.
export const MENU_ITEMS: readonly MenuItemMeta[] = [
  {
    id: "merge",
    label: "Összevonások",
    hint: "A csoportbontás szűrései",
    group: "settings",
  },
  {
    id: "dual",
    label: "Duális beosztás",
    hint: "Mely napokon vagy a munkahelyen",
    group: "settings",
  },
  {
    id: "glance",
    label: "Teljes órarend",
    hint: "Minden óra, a beállításaid nélkül",
    group: "settings",
  },
  {
    id: "notify",
    label: "Értesítés",
    hint: "Szóljon a következő óráról",
    group: "settings",
  },
  {
    id: "calendar",
    label: "Naptár",
    hint: "Az órarend a telefonod naptárában",
    group: "settings",
  },
  {
    id: "legend",
    label: "Jelmagyarázat",
    hint: "Mit jelentenek a jelölések",
    group: "settings",
  },
  {
    id: "appearance",
    label: "Megjelenés",
    hint: "Világos vagy sötét, tantárgyszínek",
    group: "site",
  },
  {
    id: "home",
    label: "Nyitólap",
    hint: "Mit tud ez az órarend",
    group: "site",
  },
  {
    id: "duty",
    label: "Ügyelet",
    hint: "Ki ügyel most, és hol",
    group: "site",
  },
  {
    id: "rooms",
    label: "Teremkereső",
    hint: "Melyik terem üres most",
    group: "site",
  },
];

export const MENU_GROUP_TITLE: Record<MenuItemGroup, string> = {
  settings: "Beállítások",
  site: "Az oldal",
};

//! AZ „ÜGYELET" ALAPBÓL REJTVE VAN, amíg a diák meg nem nyitja a
//! testreszabóban. Nem azért, mert kevesebbet ér a többi sornál, hanem mert a
//! többségnek (lásd a fenti leltár-megjegyzést a duális beosztásról) sosem
//! kell — csak azoknak, akiket ez ügyeltet. Ez az EGYETLEN kivétel a „minden
//! sor alapból látszik" szabály alól, ezért él itt, nem a `MENU_ITEMS`
//! listában: az mutatja, MI van a lapon, ez pedig azt, mi a jó alapértelmezés
//! annak, aki még nem nyúlt hozzá.
export const DEFAULT_HIDDEN_MENU: readonly MenuItemId[] = ["duty"];

export function isMenuItemId(value: unknown): value is MenuItemId {
  return MENU_ITEMS.some((item) => item.id === value);
}

/**
 * Ismeretlen bemenetből érvényes listát épít: csak ismert jelek, duplikátum
 * nélkül, a `MENU_ITEMS` sorrendjében.
 *
 * @remarks Ugyanaz a szabály, mint mindenhol a szinkronban (lásd
 * `prefs-shared.ts`): amit nem ismerünk fel, azt eldobjuk. A rögzített
 * sorrend nem kozmetika — enélkül két készülék ugyanazt a halmazt más
 * sorrendben küldené fel, és a szinkron minden körben „változást" látna.
 */
export function sanitizeHiddenMenu(value: unknown): MenuItemId[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set(value.filter(isMenuItemId));
  return MENU_ITEMS.filter((item) => seen.has(item.id)).map((item) => item.id);
}

//! A `null` NEM UGYANAZ, MINT AZ ÜRES LISTA. „Még sosem nyúlt hozzá" és
//! „megnézte, és mindent meghagyott" a lap felől ugyanaz — a SZINKRON felől
//! viszont nem: az elsőt felül lehet írni a másik készülék listájával, a
//! másodikat nem (lásd `mergePrefs`).
export function loadHiddenMenu(): MenuItemId[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(MENU_HIDDEN_STORAGE_KEY);
    if (raw === null) return null;
    return sanitizeHiddenMenu(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function saveHiddenMenu(ids: readonly MenuItemId[]): void {
  if (typeof window === "undefined") return;
  try {
    const next = JSON.stringify(sanitizeHiddenMenu([...ids]));
    //* Fölösleges írás nélkül: a `notifyPrefsChanged` a lap MINDEN
    //* beállítás-figyelőjét felébreszti (ugyanaz az érv, mint a
    //* `saveIdentity`-nél).
    if (window.localStorage.getItem(MENU_HIDDEN_STORAGE_KEY) === next) return;
    window.localStorage.setItem(MENU_HIDDEN_STORAGE_KEY, next);
    notifyPrefsChanged();
  } catch {
    /* privát módban nincs tárhely — ilyenkor a lap mindent mutat, ami a
       helyes alapértelmezés: inkább legyen ott egy fölösleges sor, mint
       hiányozzon egy kellő */
  }
}
