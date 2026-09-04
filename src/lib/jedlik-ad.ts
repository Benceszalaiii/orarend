import "server-only";

//! ═══════════════════════════════════════════════════════════════════════════
//! ISKOLAI BEJELENTKEZÉS — A JELSZÓ EGYETLEN ÚTVONALA
//! ═══════════════════════════════════════════════════════════════════════════
//! EZ AZ EGYETLEN FÁJL AZ EGÉSZ PROJEKTBEN, AMI ISKOLAI JELSZÓT LÁT. Ami itt
//! történik vele, az a teljes életciklusa: megérkezik a kérés törzsében,
//! továbbmegy egy HTTPS-hívásban az iskola szerverére, és a függvény
//! visszatérésekor megszűnik. Nem tároljuk, nem kivonatoljuk, nem naplózzuk, és
//! nem adjuk tovább semmi másnak.
//!
//! ─── AMIÉRT EZ ÉRI MEG (ÉS AMIÉRT CSERÉBE SZIGORÚNAK KELL LENNI) ────────────
//! Az iskolai API a sikeres belépésre megmondja, hogy a diák MELYIK OSZTÁLYBA
//! JÁR, és hogy tanár-e. Ezt az adatot semmilyen külső azonosító (Google,
//! Microsoft) nem adja meg — pedig pont ez az, amiért egy órarend-alkalmazásnak
//! egyáltalán érdemes bejelentkezést kínálnia: belépés után azonnal a helyes
//! órarend jön, találgatás nélkül.
//!
//! ─── A KOCKÁZAT, KIMONDVA ──────────────────────────────────────────────────
//! Cserébe a diák az iskolai jelszavát egy NEM HIVATALOS oldalra gépeli be.
//! Ebből két kötelezettség következik, és mindkettő ebben a fájlban (illetve a
//! hívójában) van betartva:
//!   1. A jelszó semmilyen formában nem maradhat hátra — lásd a `catch`-eket:
//!      SOHA nem naplózzuk a kivételt egészben, mert a `fetch` hibaobjektuma
//!      elvben tartalmazhatja a kérés törzsét, abban pedig ott a jelszó.
//!   2. Minden hívás egy VALÓDI jelszó-ellenőrzést visz be az iskola
//!      rendszerébe, a MI szerverünk IP-címéről. Korlátozás nélkül ez egy
//!      kényelmes jelszótörő előtét volna, ráadásul olyan, aminek a forgalmáért
//!      minket tiltana ki az iskola. A sebességkorlát ezért nem opcionális —
//!      a hívó felelőssége, lásd `auth-jedlik.ts`.
//! ═══════════════════════════════════════════════════════════════════════════

const AD_LOGIN_URL = "https://jedlikinfo.jedlik.eu/api/api/login";

//! A távoli rendszer néha lassú — időtúllépés nélkül egy akadó hívás egy
//! szerver-szálat tartana fogva, és a belépő diák csak nézné a pörgő ikont.
const FETCH_TIMEOUT_MS = 15_000;

export type AdIdentity = {
  /** A felhasználónév úgy, ahogy a diák beírta — csak megjelenítésre. */
  displayName: string;
  /** Az iskolai rendszer szerinti osztály ("13C"); tanárnál/hiányzó adatnál `null`. */
  class: string | null;
  //! `null` = a válaszban NEM SZEREPELT a mező. Ez SZÁNDÉKOSAN nem `false`: ha
  //! egy átnevezés vagy egy eltérő tanári válasz-alak miatt nem találjuk meg, a
  //! `false` visszaminősítené a tanárt diákká. Hiányzó adatból nem írunk.
  isTeacher: boolean | null;
  /** Az iskolai válaszból kiolvasott név, ha adott ilyet. */
  fullName: string | null;
};

/** A felületnek megmutatható, magyar üzenetű hiba. */
export class AdLoginError extends Error {
  /** `true`, ha a hitelesítés bukott el (nem a rendszer). */
  readonly invalidCredentials: boolean;

  constructor(message: string, invalidCredentials = false) {
    super(message);
    this.name = "AdLoginError";
    this.invalidCredentials = invalidCredentials;
  }
}

//! A VÁLASZ ALAKJA NEM DOKUMENTÁLT, és a mezők több néven is érkezhetnek.
//! Ugyanaz a védekező kiolvasás, mint a jedlik-szakkor oldalán: egy átnevezés
//! ne törje el a belépést, csak annyit veszítsünk vele, amennyit muszáj.
function pickString(
  obj: Record<string, unknown> | null | undefined,
  keys: string[],
): string | null {
  if (!obj) return null;
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
    //! A MEZŐ NEM BIZTOS, HOGY SZÖVEG. Az osztálylista végpontja
    //! (`known-class.ts`) `{ short: "13C" }` alakú objektumokat ad vissza, és
    //! semmi nem garantálja, hogy a bejelentkezés válaszában az osztály ne
    //! ugyanilyen objektumként érkezzen. Ha csak szövegre néznénk, egy ilyen
    //! válaszból NÉMÁN `null` osztály kerülne az adatbázisba — a belépés
    //! sikeres lenne, csak épp pont az az adat veszne el, amiért az egész
    //! iskolai belépés létezik.
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const inner = pickString(value as Record<string, unknown>, [
        "short",
        "name",
        "value",
      ]);
      if (inner) return inner;
    }
  }
  return null;
}

function pickBoolean(
  obj: Record<string, unknown> | null | undefined,
  keys: string[],
): boolean | null {
  if (!obj) return null;
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "boolean") return value;
    if (value === "true" || value === "false") return value === "true";
  }
  return null;
}

/**
 * Bejelentkezik az iskolai rendszerbe, és visszaadja, amit az a fiókról állít.
 *
 * @throws {AdLoginError} Hibás jelszónál vagy elérhetetlen rendszernél, magyar
 *   üzenettel. A kivétel SOHA nem tartalmazza a jelszót.
 * @remarks A hívó felelőssége a sebességkorlátozás — minden hívás valódi
 *   jelszó-ellenőrzést visz be az iskola rendszerébe.
 */
export async function adLogin(
  loginName: string,
  password: string,
): Promise<AdIdentity> {
  let res: Response;
  try {
    res = await fetch(AD_LOGIN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ loginName, password, error: "" }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      cache: "no-store",
    });
  } catch {
    //! SZÁNDÉKOSAN ÜRES `catch`: a kivételt nem vesszük át és nem naplózzuk.
    //! A `fetch` hibaobjektuma implementációfüggően hordozhatja a kérés
    //! részleteit — abban pedig ott a jelszó. Amit tudni akarunk (nem sikerült
    //! elérni a rendszert), azt a hibaüzenet elmondja anélkül is.
    throw new AdLoginError(
      "Nem sikerült elérni az iskolai rendszert. Próbáld újra pár perc múlva.",
    );
  }

  //! Hibás hitelesítésnél az iskolai API 401-et ad SIMA SZÖVEGGEL (nem
  //! JSON-nal) — egy feltétel nélküli `res.json()` itt kivételt dobna, és a
  //! diák egy 500-as hibát látna a „hibás jelszó" helyett.
  if (!res.ok) {
    throw new AdLoginError(
      res.status === 401
        ? "Hibás felhasználónév vagy jelszó."
        : "Az iskolai rendszer hibát adott. Próbáld újra később.",
      res.status === 401,
    );
  }

  const json = (await res.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  if (!json || json.error) {
    throw new AdLoginError(
      typeof json?.error === "string" && json.error
        ? json.error
        : "Az iskolai rendszer nem adott értelmezhető választ.",
      //* A rendszer által megfogalmazott hiba jellemzően hitelesítési hiba.
      Boolean(json?.error),
    );
  }

  //* A hasznos mezők néha egy beágyazott objektumban ülnek (`user` / `data`).
  const nested =
    (json.user as Record<string, unknown> | undefined) ??
    (json.data as Record<string, unknown> | undefined);

  //! ─── FEJLESZTŐI DIAGNOSZTIKA — CSAK KULCSNEVEK, SOHA ÉRTÉKEK ──────────────
  //! Enélkül az alábbi kulcslista örökre találgatás marad: ha egyik név sem
  //! talál, a belépés attól még sikeres, és semmi nem árulja el, hogy az
  //! osztály némán elveszett. Egyetlen valódi belépés fejlesztői módban
  //! megmutatja a válasz tényleges alakját, és a listát utána tényre lehet
  //! cserélni.
  //!
  //! CSAK A KULCSOK NEVE MEGY NAPLÓBA, AZ ÉRTÉKEK SOHA. A válasz a diák
  //! személyes adatait hordozza (név, osztály, esetleg azonosító); ezek
  //! naplóba írása fejlesztői módban is fölösleges kitettség. A jelszó a KÉRÉS
  //! törzsében utazik, ide be sem kerül.
  if (process.env.NODE_ENV === "development") {
    console.info(
      "[jedlik-ad] A válasz mezői:",
      Object.keys(json).join(", "),
      nested ? `| beágyazva: ${Object.keys(nested).join(", ")}` : "",
    );
  }

  //! A KULCSNEVEK LISTÁJA, ÉS AMIÉRT TÖBB VAN BELŐLÜK. A válasz alakja nem
  //! dokumentált, tehát nem tudjuk BIZTOSAN, melyik néven jön az osztály. Egy
  //! rossz találgatás itt nem törést okoz, hanem CSENDES ADATVESZTÉST: a
  //! belépés sikerül, csak `null` osztály kerül az adatbázisba. Ezért nézünk
  //! meg több szokásos alakot (angol és magyar kulcsnév egyaránt) — ez nem
  //! kerül semmibe, viszont egy átnevezés nem viszi el némán az egyetlen
  //! adatot, amiért az iskolai belépés egyáltalán megéri.
  const CLASS_KEYS = ["class", "className", "class_name", "osztaly", "osztály"];
  const TEACHER_KEYS = ["isTeacher", "teacher", "is_teacher", "tanar", "tanár"];
  const NAME_KEYS = ["name", "fullName", "displayName"];

  return {
    displayName: loginName.trim(),
    class: pickString(json, CLASS_KEYS) ?? pickString(nested, CLASS_KEYS),
    isTeacher:
      pickBoolean(json, TEACHER_KEYS) ?? pickBoolean(nested, TEACHER_KEYS),
    fullName: pickString(json, NAME_KEYS) ?? pickString(nested, NAME_KEYS),
  };
}

//! ─── A FELHASZNÁLÓNÉV NORMALIZÁLÁSA ─────────────────────────────────────────
//! A fiók kulcsa a kisbetűs alak. Enélkül a `Kiss.Bence` és a `kiss.bence`
//! KÉT KÜLÖN helyi fiókot kapna ugyanahhoz az iskolai fiókhoz — és a diák nem
//! értené, miért tűntek el a beállításai attól, hogy nagybetűvel gépelt.
//! A hosszkorlát a kulcstér védelme: egy megabájtos „felhasználónévvel" ne
//! lehessen se az adatbázist, se a korlátozó vödreit hizlalni.
export const LOGIN_NAME_MAX_LENGTH = 64;

export function normalizeLoginName(value: string): string {
  return value.trim().toLocaleLowerCase("hu").slice(0, LOGIN_NAME_MAX_LENGTH);
}

//! AZ E-MAIL SZINTETIKUS. A `.invalid` az RFC 2606 szerint garantáltan nem
//! létező tartomány: erre a címre levelet küldeni technikailag lehetetlen.
//! Így a Better Auth egyediségi elvárása teljesül anélkül, hogy valódi iskolai
//! e-mail-címet tárolnánk, vagy hogy bármikor véletlenül levelet küldhetnénk.
export function syntheticEmail(normalizedLoginName: string): string {
  return `${normalizedLoginName}@jedlik-ad.invalid`;
}
