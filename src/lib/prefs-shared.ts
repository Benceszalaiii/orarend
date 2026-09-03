import { CLASS_MAX_LENGTH, looksLikeClass } from "./known-class";
import { VIEW_ROUTES, type ViewRoute } from "./last-view";

//! ═══════════════════════════════════════════════════════════════════════════
//! A SZINKRONIZÁLT BEÁLLÍTÁSOK — A KÖZÖS SZERZŐDÉS
//! ═══════════════════════════════════════════════════════════════════════════
//! Ugyanezt a fájlt olvassa a böngésző (mit küldjön fel) és a szerver (mit
//! fogadjon el). Szándékosan EGY példányban: két külön ellenőrzésből
//! előbb-utóbb az egyik lazább lenne, és az lenne a nyitott ajtó.
//!
//! ─── AZ ELLENŐRZÉS ITT NEM KÉNYELMI KÉRDÉS ──────────────────────────────────
//! Ami ide bekerül, az a felhasználó gépéről jön, tehát BÁRMI lehet: nem csak
//! elgépelt osztálynév, hanem szándékosan óriásira hizlalt tömb vagy mélyen
//! egymásba ágyazott objektum is. A `sanitizePrefs` ezért nem „megjavítja" a
//! bemenetet, hanem ÚJRAÉPÍTI: csak az ismert kulcsokat, csak ismert alakban,
//! korlátos méretben másolja át. Amit nem ismer fel, azt eldobja — nem hibázik
//! tőle, mert egy régi verzióból származó mező sem indokolja, hogy a diák
//! összes többi beállítása elvesszen.
//! ═══════════════════════════════════════════════════════════════════════════

/**
 * A készülékek között átvitt beállítások. Ami NINCS benne, az szándékosan
 * marad ki: a heti órarend helyi példánya (offline tartalék), a telepítési
 * tipp jelölője és a napi statisztika-jelölő készülékfüggő — átvinni őket
 * értelmetlen vagy káros lenne.
 */
export type SyncedPrefs = {
  /** A legutóbb választott osztály. */
  class: string | null;
  /** Melyik nézetben járt utoljára (`/orarend` vagy `/ma`). */
  lastView: ViewRoute | null;
  /** Összevont csoportbontások osztályonként (`orarend:merge-prefs:v1`). */
  merge: Record<string, MergePrefEntry[]>;
  /** Duális beosztás osztályonként (`orarend:dual-schedule:v1`). */
  dual: Record<string, DualScheduleEntry>;
};

/**
 * Egy összevonási döntés. A mezők tartalmát SZÁNDÉKOSAN nem értelmezzük itt:
 * a `clusterKey` és a `chosen` a `timetable-merge.ts` belső, elválasztó
 * karakterekkel épített azonosítói. A szerver ezekre nézve átlátszó tároló —
 * csak azt tartatja be, hogy szöveg legyen és ne legyen mértéktelenül hosszú.
 */
export type MergePrefEntry = {
  clusterKey: string;
  chosen: string;
};

/** ISO nap-sorszámok (1 = hétfő … 5 = péntek) A és B hétre. */
export type DualScheduleEntry = {
  A: number[];
  B: number[];
};

export const EMPTY_PREFS: SyncedPrefs = {
  class: null,
  lastView: null,
  merge: {},
  dual: {},
};

//! ─── A KORLÁTOK ─────────────────────────────────────────────────────────────
//! Ezek nem az „ésszerű használat" határai, hanem a TÁMADÁSI FELÜLET határai.
//! Egy bejelentkezett diák tetszőleges JSON-t POST-olhat; enélkül egyetlen
//! kérés meg tudná tölteni az adatbázist. A számok bőven a valós használat
//! fölött vannak: aki tíz osztályt nézeget, észre sem veszi őket.

/** Hány osztályhoz tartozhat mentett beállítás. */
const MAX_CLASSES = 24;
/** Hány összevonási döntés lehet egy osztályon belül. */
const MAX_MERGE_PER_CLASS = 80;
/** Egy azonosító legnagyobb hossza. A valódiak jóval 200 alattiak. */
const MAX_IDENTITY_LENGTH = 512;
/**
 * A teljes JSON legnagyobb mérete bájtban. A `Preference.data` egy sor egy
 * felhasználóhoz — ez a plafon, ami fölött a kérés elutasításra kerül, még
 * mielőtt bármit is elemeznénk belőle.
 */
export const MAX_PREFS_BYTES = 64 * 1024;

const WEEKDAYS = [1, 2, 3, 4, 5];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

//! AZ OSZTÁLYNÉV A KULCSTÉR HATÁRA. Ugyanaz a szabály, amit a használati
//! statisztika és a push-feliratkozás használ (`known-class.ts`) — ha itt
//! lazább lenne, ez lenne az a végpont, amin át szabad szöveget lehet a
//! tárolóba írni. A `looksLikeClass` alakra ellenőriz, hálózat nélkül; a
//! Jedlikinfo listájához mérni itt nem érdemes, mert egy külső kimaradás
//! ilyenkor a diák saját, korábban érvényes beállítását dobná el.
function isClassKey(value: string): boolean {
  return value.length <= CLASS_MAX_LENGTH && looksLikeClass(value);
}

function sanitizeIdentity(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_IDENTITY_LENGTH) return null;
  return trimmed;
}

function sanitizeMergeList(value: unknown): MergePrefEntry[] {
  if (!Array.isArray(value)) return [];
  const out: MergePrefEntry[] = [];
  for (const raw of value) {
    if (out.length >= MAX_MERGE_PER_CLASS) break;
    if (!isRecord(raw)) continue;
    const clusterKey = sanitizeIdentity(raw.clusterKey);
    const chosen = sanitizeIdentity(raw.chosen);
    //* A `chosen` lehet üres sztring is (= mindent elrejtünk ebből a
    //* csoportból), de a `clusterKey` nélkül a bejegyzés értelmezhetetlen.
    if (!clusterKey || chosen === null) continue;
    out.push({ clusterKey, chosen });
  }
  return out;
}

function sanitizeDual(value: unknown): DualScheduleEntry | null {
  if (!isRecord(value)) return null;
  const days = (input: unknown): number[] =>
    Array.isArray(input)
      ? [
          ...new Set(
            input.filter((d): d is number => WEEKDAYS.includes(d as number)),
          ),
        ].sort((a, b) => a - b)
      : [];
  return { A: days(value.A), B: days(value.B) };
}

/**
 * Ismeretlen bemenetből érvényes `SyncedPrefs`-et épít. SOHA nem dob kivételt:
 * ami nem értelmezhető, az kimarad. A hívó így nyugodtan ráengedheti a
 * hálózatról jött törzsre és a `localStorage` tartalmára is.
 */
export function sanitizePrefs(input: unknown): SyncedPrefs {
  if (!isRecord(input)) return { ...EMPTY_PREFS, merge: {}, dual: {} };

  const cls =
    typeof input.class === "string" && isClassKey(input.class)
      ? input.class
      : null;

  const lastView = VIEW_ROUTES.includes(input.lastView as ViewRoute)
    ? (input.lastView as ViewRoute)
    : null;

  const merge: Record<string, MergePrefEntry[]> = {};
  if (isRecord(input.merge)) {
    for (const [key, value] of Object.entries(input.merge)) {
      if (Object.keys(merge).length >= MAX_CLASSES) break;
      if (!isClassKey(key)) continue;
      const list = sanitizeMergeList(value);
      //* Üres listát nem tárolunk: az „nincs beállítás", nem „beállítás, ami
      //* üres" — a különbség a `timetable-merge.ts` oldalán számít.
      if (list.length > 0) merge[key] = list;
    }
  }

  const dual: Record<string, DualScheduleEntry> = {};
  if (isRecord(input.dual)) {
    for (const [key, value] of Object.entries(input.dual)) {
      if (Object.keys(dual).length >= MAX_CLASSES) break;
      if (!isClassKey(key)) continue;
      const schedule = sanitizeDual(value);
      //! AZ ÜRES BEOSZTÁS ÉRVÉNYES ÉRTÉK, és ezért marad meg. „Nincs duális
      //! napom" nem ugyanaz, mint „még nem állítottam be": az elsőnél a rács
      //! nem kérdez rá többet, a másodiknál igen (lásd `dual-schedule.ts`).
      if (schedule) dual[key] = schedule;
    }
  }

  return { class: cls, lastView, merge, dual };
}

/** Van-e egyáltalán mit szinkronizálni. Üres beállítást nem töltünk fel. */
export function hasAnyPrefs(prefs: SyncedPrefs): boolean {
  return (
    prefs.class !== null ||
    prefs.lastView !== null ||
    Object.keys(prefs.merge).length > 0 ||
    Object.keys(prefs.dual).length > 0
  );
}

/**
 * A szerverre feltöltött / onnan letöltött csomag. A `revision` a konfliktus
 * feloldásának egyetlen támpontja — lásd a `Preference` modellt a sémában.
 */
export type PrefsEnvelope = {
  prefs: SyncedPrefs;
  revision: number;
  /** ISO időbélyeg, csak megjelenítésre („legutóbb szinkronizálva"). */
  updatedAt: string | null;
};
