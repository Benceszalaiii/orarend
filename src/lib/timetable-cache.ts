import type {
  TimetableDay,
  TimetableErrorKind,
  TimetableSubject,
  TimetableView,
} from "./timetable";

//! ─── HELYI PÉLDÁNY AZ UTOLSÓ LEKÉRT HÉTRŐL ────────────────────────────────
//! A lap telepíthető (PWA), és a folyosón rendszeresen nincs térerő. A service
//! worker a lap VÁZÁT tartja meg — a HTML-t, a JS-t, a CSS-t —, adatot viszont
//! nem tud: az órarend `POST /timetable/cards`-ból jön, és a Cache API nem tárol
//! POST-választ. Az adat ezért ide kerül.
//!
//! Ez NEM offline mód: a mentett hét egy PILLANATKÉP, nem az igazság. A nézet
//! ezért mindig kiírja, mikor kelt — a lejárt adatot elhallgatni rosszabb, mint
//! nem mutatni semmit.

const CACHE_KEY = "orarend:week-cache:v1";
//* Ennyi hét marad meg. A napi használat egy-két hetet érint; a régebbi
//* bejegyzések csak a tárhelyet ennék.
const MAX_ENTRIES = 4;

export type CachedWeek = {
  view: TimetableView;
  /** Epoch ms — a lekérés pillanata. */
  fetchedAt: number;
};

type Store = Record<string, CachedWeek>;

//! A KULCS AZ ALANY TÁROLÓKULCSA, NEM AZ OSZTÁLY NEVE. A tanári hetek
//! `tanar:` előtaggal ülnek ugyanebben a tárolóban (lásd `subjectStoreKey`) —
//! a hívó adja át már névterezve, ez a modul csak azonosítóként kezeli.
function entryKey(storeKey: string, weekStart: string): string {
  return `${storeKey}|${weekStart}`;
}

function readStore(): Store {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as Store;
  } catch {
    return {};
  }
}

//! A MENTETT HÉT RÉGEBBI VERZIÓBÓL IS JÖHET, ÉS NEM DOBJUK EL. A `TimetableDay`
//! időközben megkapta a tanév rendjéből származó mezőket (`teaching`, `notes`,
//! `bells`); egy korábbi verzió mentette példányban ezek nincsenek ott. A
//! tároló kulcsának felemelése ilyenkor a legkényelmesebb lépés lenne — csakhogy
//! azzal pont az OFFLINE TARTALÉKOT vennénk el attól, aki épp hálózat nélkül
//! nyitja meg a lapot, és a hiányzó mezők nem is rontanak el semmit az
//! órarendből. Ezért kiegészítjük: ami hiányzik, az „nem tudjuk" — a nézet
//! ilyenkor ugyanaz, mint a bővítés előtt volt.
function withDayDefaults(view: TimetableView): TimetableView {
  //! A MEZŐ NEVE MEGVÁLTOZOTT, A MENTETT HÉT NEM. A tanári rács bevezetésekor
  //! a `resolvedClass` `subject` lett (mert tanárt is jelölhet) — a
  //! készüléken viszont ott áll a RÉGI alakú pillanatkép, és az a példány
  //! pontosan akkor kellene, amikor nincs hálózat. Egy kulcs-emeléssel ezt a
  //! tartalékot vennénk el; a régi név átvétele viszont senkitől nem vesz el
  //! semmit.
  const legacy = (view as { resolvedClass?: TimetableSubject | null })
    .resolvedClass;
  return {
    ...view,
    kind: view.kind ?? "class",
    subject: view.subject ?? legacy ?? null,
    days: view.days.map((day) => {
      const stored = day as Partial<TimetableDay>;
      return {
        ...day,
        teaching: stored.teaching ?? null,
        notes: stored.notes ?? [],
        bells: stored.bells ?? null,
      };
    }),
  };
}

export function loadCachedWeek(
  classShort: string,
  weekStart: string,
): CachedWeek | null {
  if (!classShort) return null;
  const entry = readStore()[entryKey(classShort, weekStart)];
  //* Csak sikeres lekérést mentünk, de a tárolt alak régebbi verzióból is
  //* jöhet — a `days` megléte a legolcsóbb épség-ellenőrzés.
  if (!entry || !Array.isArray(entry.view?.days)) return null;
  return { ...entry, view: withDayDefaults(entry.view) };
}

export function saveCachedWeek(
  classShort: string,
  weekStart: string,
  view: TimetableView,
): void {
  if (typeof window === "undefined" || !classShort || !view.ok) return;
  try {
    const store = readStore();
    store[entryKey(classShort, weekStart)] = { view, fetchedAt: Date.now() };

    //* Túlcsordulás esetén a LEGRÉGEBBEN lekért bejegyzés esik ki.
    const entries = Object.entries(store).sort(
      (a, b) => b[1].fetchedAt - a[1].fetchedAt,
    );
    const trimmed = Object.fromEntries(entries.slice(0, MAX_ENTRIES));
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(trimmed));
  } catch {
    /* tele van a tárhely vagy privát mód — a mentés kimarad, a lap működik */
  }
}

//! MENNYIRE RÉGI? Percben mérünk, mert a válasz mindig egy MONDAT lesz, nem egy
//! időbélyeg: „az imént" pontosabb és olvashatóbb, mint egy 14:32.
export function ageLabel(fetchedAt: number, now: number = Date.now()): string {
  const min = Math.max(0, Math.floor((now - fetchedAt) / 60000));
  if (min < 2) return "az imént";
  if (min < 60) return `${min} perce`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours} órája`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "tegnap" : `${days} napja`;
}

//! ─── HÁLÓZAT ELŐSZÖR, UTÁNA A MENTETT PÉLDÁNY ─────────────────────────────
//! A `/ma` maga kezelte ezt a lépést, a HETI RÁCS viszont nem: hálózat nélkül
//! az `/orarend` a „A Jedlikinfo API nem érhető el" lapot mutatta — MIKÖZBEN
//! ugyanannak a hétnek a mentett példánya ott volt a készüléken, és a `/ma`
//! éppen abból rajzolt. Ugyanaz az adat, két különböző válasz: ezért került a
//! szabály ide, egyetlen helyre.
//*
//* A hívó adja a lekérést (`fetchFresh`), mert a rács a saját paramétereivel
//* dolgozik; a döntés — mikor ér valamit a mentett hét — itt lakik.

export type WeekLoad = {
  view: TimetableView;
  /** Nem `null`, ha a nézet a MENTETT példányból jön — a lapnak ki kell írnia. */
  cached: CachedWeek | null;
};

//! CSAK ELÉRHETETLENSÉGRE ESÜNK VISSZA. A „nincs ilyen osztály" vagy a
//! értelmezhetetlen válasz VÁLASZ, nem hiány: ott a mentett hét ELTAKARNÁ az
//! igazi okot, és a diák egy nem létező osztály régi órarendjét nézné.
const UNREACHABLE: ReadonlySet<TimetableErrorKind> = new Set([
  "offline",
  "network",
  "timeout",
  "server",
]);

export async function loadWeekOrCached(
  classShort: string,
  weekStart: string,
  fetchFresh: () => Promise<TimetableView>,
): Promise<WeekLoad> {
  let fresh: TimetableView;
  try {
    fresh = await fetchFresh();
  } catch (err) {
    //* Váratlan kivétel: a mentett hét itt is jobb a semminél, de ha nincs,
    //* a hibát TOVÁBBDOBJUK — a hívó nevesíti (`describeTimetableFailure`).
    const local = loadCachedWeek(classShort, weekStart);
    if (local) return { view: local.view, cached: local };
    throw err;
  }

  if (fresh.ok) {
    saveCachedWeek(classShort, weekStart, fresh);
    return { view: fresh, cached: null };
  }

  if (fresh.error && UNREACHABLE.has(fresh.error.kind)) {
    const local = loadCachedWeek(classShort, weekStart);
    if (local) return { view: local.view, cached: local };
  }

  return { view: fresh, cached: null };
}
