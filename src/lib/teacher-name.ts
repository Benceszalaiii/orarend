//! ═══════════════════════════════════════════════════════════════════════════
//! MELYIK TANÁR EZ — A NÉV ÖSSZEVETÉSE A TANTESTÜLETI LISTÁVAL
//! ═══════════════════════════════════════════════════════════════════════════
//! A Google-belépés egy NEVET ad (`Janos Kovacs`), a Jedlikinfo tanárlistája
//! egy MÁSIKAT ugyanarról az emberről (`Kovács János`). A kettő négyféleképp
//! térhet el, és mind a négy előfordul:
//!
//!   • ÉKEZET — a Google-fiókok neve gyakran ékezet nélkül van felvéve;
//!   • KIS/NAGYBETŰ — `KOVÁCS JÁNOS` kontra `Kovács János`;
//!   • SZÓKÖZ — vezető, záró és dupla szóközök;
//!   • SORREND — a magyar `vezetéknév keresztnév` kontra a Google `keresztnév
//!     vezetéknév`; és hogy melyik oldalon melyik áll, az fiókonként változik.
//!
//! EZ A MODUL DÖNTI EL, KI KAP TANÁRI JOGOT — tehát a hibája nem kozmetikai.
//! Ezért két dolgot NEM csinál:
//!
//!   1. NEM HASONLÍT ELMOSÓDOTTAN. Nincs Levenshtein-távolság, nincs
//!      előtag-egyezés, nincs „elég közeli". A szótagokat NORMALIZÁLJUK, de
//!      utána PONTOSAN egyeznek, vagy nincs találat. Egy elmosódott egyezés
//!      itt azt jelentené, hogy valaki más órarendjéhez és naptár-feedjéhez
//!      kap hozzáférést.
//!   2. NEM TIPPEL TÖBBÉRTELMŰ NÉVNÉL. A tantestületben JELENLEG IS van két
//!      azonos nevű tanár (`Horváth Norbert`, csak születési dátumban
//!      különböznek — a lista zárójeles toldalékkal jelöli őket). Ha egy név
//!      többre illik, a válasz NINCS TALÁLAT, nem az első.
//!
//! MIÉRT KÜLÖN FÁJL, ÉS MIÉRT NINCS BENNE `server-only`: hogy tesztelhető
//! legyen. Tiszta függvények, se hálózat, se adatbázis — ugyanaz az indok,
//! mint a `school-domain.ts` és az `auth-blocked-paths.ts` mögött. A hálózatot
//! (a lista lekérését) és a jogosultsági döntést a `teacher-directory.ts`
//! intézi, ami viszont `server-only`.
//! ═══════════════════════════════════════════════════════════════════════════

/**
 * Egy sor a Jedlikinfo tanárlistájából (`timetable/teachers`). Alakra azonos a
 * `timetable.ts` `TimetableSubject`-jével — szándékosan külön áll, hogy ez a
 * modul ne húzza be az egész órarend-elemzőt egy két mezős típusért.
 */
export type TeacherRecord = { short: string; name: string };

//! EGY SZÓ SOHA NEM AZONOSÍT. `Kovács` önmagában a tantestület több tagjára is
//! illhet, és a vezetéknév a leggyakrabban megosztott elem (a listában négy
//! `Kiss`, két `Balogh`, két `Hatos`, két `Németh…` van). A kéttokenes alsó
//! határ tehát nem kényelmi korlát: enélkül egyetlen elgépelt vagy csonka
//! Google-név is tanári jogot adhatna.
export const MIN_NAME_TOKENS = 2;

/**
 * A név összehasonlítható alakja: ékezet nélkül, kisbetűsen, egyetlen
 * szóközzel elválasztva. A SORRENDET MEGTARTJA — a sorrendfüggetlenséget nem
 * itt, hanem a `findTeacherByName` tokenhalmaza adja.
 *
 * ```
 * normalizeName("Kovács János") === "kovacs janos"
 * normalizeName("Janos Kovacs") === "janos kovacs"
 * ```
 */
export function normalizeName(raw: string | null | undefined): string {
  if (typeof raw !== "string") return "";
  return (
    raw
      //! A ZÁRÓJELES TOLDALÉK LE. A Jedlikinfo listája az azonos nevű
      //! tanárokat születési dátummal különbözteti meg
      //! (`Horváth Norbert (1979.04.09.)`) — ez nem a név része, és a Google
      //! oldalán soha nem szerepel. Bent hagyva SOHA nem lenne találat rájuk;
      //! kivéve viszont a két sor azonos alakúvá válik, és a többértelműség
      //! elleni védelem (lásd lent) tisztán el is utasítja mindkettőt.
      .replace(/\([^)]*\)/g, " ")
      //! ELŐBB SZÉTBONTÁS, UTÁNA AZ ÉKEZET ELDOBÁSA. Az NFD az `á`-t `a` + egy
      //! KOMBINÁLÓ ékezetjelre bontja; a jelek tartománya (U+0300–U+036F) így
      //! egyetlen cserével eltávolítható. Fordított sorrendben (előbb a csere)
      //! nem történne semmi, mert az `á` egyetlen karakter.
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      //! MINDEN, AMI NEM BETŰ VAGY SZÁMJEGY, ELVÁLASZTÓ. Ez viszi el a pontot
      //! (`dr.`), a vesszőt és a KÖTŐJELET is: a `Németh-Veres Gabriella`
      //! mindkét oldalon ugyanúgy három tokenre esik, tehát a kötőjel megléte
      //! vagy hiánya nem dönthet el egy jogosultságot.
      //*
      //* Szándékosan csak az ASCII betűket tartjuk meg: ide a normalizálás
      //* után minden magyar betű ASCII-ként érkezik. Egy más írásrendszerű
      //* név tokenek nélkül marad, tehát nem talál — ez a biztonságos irány.
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
  );
}

/** A normalizált név szavai. Üres név = üres tömb, nem dobás. */
export function nameTokens(raw: string | null | undefined): string[] {
  const normalized = normalizeName(raw);
  return normalized ? normalized.split(" ") : [];
}

//! A SORRENDFÜGGETLENSÉG EGYETLEN TRÜKKJE. A tokeneket ábécébe rendezve
//! fűzzük össze: `Kovács János` és `Janos Kovacs` ugyanazt a kulcsot adja,
//! `Kovács János` és `Kovács Jánosné` viszont nem. Ez tehát nem közelítés,
//! hanem a szóhalmazok PONTOS egyenlősége.
function tokenKey(tokens: readonly string[]): string {
  return [...tokens].sort().join(" ");
}

//! TARTALMAZÁS MULTIHALMAZKÉNT: minden keresett token megvan-e a nagyobb
//! halmazban, a DARABSZÁMOT is beleértve. A `Set` itt hibás lenne — egy
//! kétszer szereplő keresztnév egyszeri előfordulásra is illene.
function containsAll(
  bigger: readonly string[],
  smaller: readonly string[],
): boolean {
  const pool = [...bigger];
  for (const token of smaller) {
    const at = pool.indexOf(token);
    if (at < 0) return false;
    pool.splice(at, 1);
  }
  return true;
}

/**
 * Megkeresi a névhez tartozó tanárt a listában, vagy `null`-t ad, ha nincs
 * EGYÉRTELMŰ találat.
 *
 * Két lépcső, mindkettő pontos tokenegyezésen áll:
 *
 *  1. TELJES EGYEZÉS — a két név tokenhalmaza (sorrendtől függetlenül)
 *     azonos. Ez az eset fedi le az ékezetet, a kis/nagybetűt, a szóközöket
 *     és a felcserélt vezeték-/keresztnevet.
 *  2. TARTALMAZÁS — az egyik név tokenjei hiánytalanul megvannak a másikban.
 *     Erre azért van szükség, mert a tantestületi listában sok név HÁROM
 *     tagú (`Kovács Zoltán Jenő`, `Garami Éva Katalin`), a Google-fiókok
 *     viszont jellemzően csak vezeték- és keresztnevet tárolnak. Ez NEM
 *     elmosódott egyezés: minden szónak szó szerint egyeznie kell, csak a
 *     középső név hiányát engedi el.
 *
 * MINDKÉT LÉPCSŐ EGYETLEN TALÁLATOT KÖVETEL. Ha a név többre illik — két
 * azonos nevű tanár, vagy egy `Kiss Gábor Barnabás`, ami a `Kiss Gábor`-ra és
 * a `Kiss Barnabás`-ra is ráillene —, a válasz `null`. Rossz tanárnak adni a
 * jogot sokkal rosszabb, mint senkinek.
 */
export function findTeacherByName<T extends TeacherRecord>(
  name: string | null | undefined,
  teachers: readonly T[],
): T | null {
  const wanted = nameTokens(name);
  if (wanted.length < MIN_NAME_TOKENS) return null;
  if (!Array.isArray(teachers)) return null;

  const wantedKey = tokenKey(wanted);
  const candidates = teachers.map((teacher) => ({
    teacher,
    tokens: nameTokens(teacher.name),
  }));

  const exact = candidates.filter(
    (c) =>
      c.tokens.length >= MIN_NAME_TOKENS && tokenKey(c.tokens) === wantedKey,
  );
  if (exact.length > 0) return exact.length === 1 ? exact[0].teacher : null;

  const contained = candidates.filter((c) => {
    if (c.tokens.length < MIN_NAME_TOKENS) return false;
    return c.tokens.length > wanted.length
      ? containsAll(c.tokens, wanted)
      : containsAll(wanted, c.tokens);
  });
  return contained.length === 1 ? contained[0].teacher : null;
}

/**
 * Egy fiók tanára: a `pins` (e-mail → lista-név) kézi kivételeivel, különben
 * a `findTeacherByName` névillesztésével.
 *
 * - RÖGZÍTETT CÍM: a lista PONTOSAN ilyen nevű egyetlen sora, a Google-névtől
 *   függetlenül. Ha nincs ilyen sor (elírás, a tanár kikerült a listából),
 *   `null` — nem esik vissza a névre.
 * - MINDEN MÁS CÍM: névillesztés a listán, a MÁS címekhez rögzített tanárok
 *   nélkül. Így egy azonos nevű pár egyik tagjának rögzítése a másikat
 *   egyértelművé teszi (lásd `teacher-pins.ts`).
 */
export function findTeacherForAccount<T extends TeacherRecord>(
  account: {
    email: string | null | undefined;
    name: string | null | undefined;
  },
  teachers: readonly T[],
  pins: ReadonlyMap<string, string>,
): T | null {
  if (!Array.isArray(teachers)) return null;
  const email = account.email?.trim().toLowerCase() ?? "";
  const pinned = email ? pins.get(email) : undefined;
  if (pinned !== undefined) {
    const hits = teachers.filter((t) => t.name === pinned);
    return hits.length === 1 ? hits[0] : null;
  }
  const claimed = new Set(pins.values());
  return findTeacherByName(
    account.name,
    teachers.filter((t) => !claimed.has(t.name)),
  );
}
