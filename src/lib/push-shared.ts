//* ---------------------------------------------------------------------------
//* ÉRTESÍTÉSEK — A KÖZÖS SZERZŐDÉS
//* ---------------------------------------------------------------------------
//! HÁROM FÉL OLVASSA UGYANEZT: a lap (feliratkozás), a szerver (kiküldés) és a
//! service worker (megjelenítés). A `sw.js` nem tud importálni — ott a
//! `PushPayload` mezőnevei KÉZZEL vannak leírva. Ha itt mező nevet vált, a
//! `public/sw.js`-t is át kell írni; ezért van minden, amit a worker olvas,
//! ebben az EGY típusban, és semmi más.

import {
  type DualScheduleEntry,
  type MergePrefEntry,
  sanitizeDual,
  sanitizeMergeList,
} from "./prefs-shared";

//! TÍZ PERC. Nem paraméter, hanem a funkció maga: ennyi idő alatt lehet
//! átérni a suli egyik szárnyából a másikba, és ennyivel előbb még van értelme
//! szólni. Kevesebb már késő, több pedig olyankor jönne, amikor a diák épp az
//! ELŐZŐ órán ül — ott egy rezgés nem segítség, hanem büntetés.
export const LEAD_MINUTES = 10;

//! MENNYI CSÚSZÁST NYELÜNK EL. Az ütemező nem percpontos (a sorban állás, a
//! hidegindítás és a push-szolgáltató is késhet), és nem is fut percenként:
//! a napi üzenetkeret miatt 5 percenként hívjuk (lásd a READMÉ-t). EZ AZ
//! ABLAK TEHÁT A TICK SŰRŰSÉGÉNEK A FELSŐ KORLÁTJA IS: ha az ütemezés ennél
//! ritkább lesz, az emlékeztetők egy része némán elmarad. Ha egy tick
//! kimarad, az emlékeztető NE vesszen el — ezért nem
//! egy pillanatot, hanem egy ablakot nézünk. Cserébe egy kimaradás után a
//! jelzés pár perccel később ér oda; ezt vállaljuk, mert a néma elmaradás
//! rosszabb: a diák megbízna benne, és nem kapna semmit.
export const LEAD_WINDOW_MINUTES = 6;

//! HÁNY OSZTÁLYRA LEHET FELIRATKOZNI. Az órarendjét egy diák egy osztályban
//! tölti, de nyelvi csoport, duális pár vagy testvér miatt kettő-három is
//! értelmes. A korlát nem kényelmi kérdés: minden feliratkozott osztály egy
//! újabb lekérés a suli szerverétől ÉS egy újabb csatorna, amin a készülék
//! rezeghet. Öt fölött már nem értesítés, hanem hírfolyam.
export const MAX_CLASSES = 5;

//! HÁNY TANÁRRA — ÉS MIÉRT KEVESEBBRE. A diák több osztályhoz is tartozhat
//! (nyelvi csoport, testvér, duális pár), a tanár viszont EGY: a sajátjára
//! iratkozik fel. A második hely a helyettesítésé — aki egy kolléga óráit
//! átveszi egy hétre, annak érdemes tudnia a változásairól. A harmadik már nem
//! a saját napjáról szólna, hanem mások órarendjének figyeléséről; erre a lap
//! nem való, és a suli szerverén is minden feliratkozott tanár egy újabb heti
//! lekérés percenként.
export const MAX_TEACHERS = 2;

//* Egy feliratkozás beállításai. Ennyit tud rólunk a szerver, plusz a lenti
//* személyes olvasatot — és ennél többet nem is akarunk, hogy tudjon (lásd
//* `/adatvedelem`).
export type PushPrefs = {
  /** Mely osztályok órarendjéről jöjjön jelzés. Legfeljebb `MAX_CLASSES`. */
  classes: string[];
  //! A TANÁRI LISTA NEM „MÉG EGY OSZTÁLY". Külön mező, mert (1) más a
  //! névtere és az alakja (`AA`, `BNM` — lásd `known-class.ts`), (2) más
  //! szöveget kap ugyanaz az esemény (a diáknak a TANTÁRGY a hír, a tanárnak
  //! az OSZTÁLY és a TEREM), és (3) EZ AZ EGYETLEN mező, amit nem tölthet ki
  //! akárki: csak iskolai belépéssel, tanárként igazolt fiók (lásd
  //! `/api/ertesites`). Egy közös listában a jogosultság kérdése némán
  //! elveszne.
  /** Mely tanárok órarendjéről jöjjön jelzés. Legfeljebb `MAX_TEACHERS`. */
  teachers: string[];
  //! KÉT SŰRŰSÉG, EGY KAPCSOLÓ. Alapból csak a nap ELSŐ órája előtt szólunk, és
  //! minden olyan óra előtt, ami szünet vagy lyukasóra UTÁN kezdődik — vagyis
  //! amikor a diák nincs is az iskolában, vagy nem ott van, ahol lennie kell.
  //! Egy sima 10 perces szünet előtt-után nem szólunk: nyolc rezgés naponta
  //! nem emlékeztető, hanem az, amitől az értesítéseket kikapcsolják.
  //* Aki mégis mindent kér (pl. sok teremcsere), az `everyLesson`-nel kapja.
  everyLesson: boolean;
};

//! ─── A SZEMÉLYES OLVASAT ───────────────────────────────────────────────────
//! AZ OSZTÁLY ÓRARENDJE NEM A DIÁK NAPJA. A duális napon a munkahelyen van, a
//! csoportbontásból pedig csak az egyik ág az övé — a rács mindkettőt a
//! készüléken tárolt döntésből rajzolja ki. Amíg a szerver ezt nem látta, az
//! értesítés a munkanapon is „matek 10 perc múlva"-t mondott, és a másik csoport
//! teremcseréjéről is szólt. Ezért a feliratkozás a döntéseket is felviszi —
//! UGYANAZT a két listát, amit a naptár-feed (`calendar-shared.ts`), és
//! ugyanazzal az ellenőrzéssel (`prefs-shared.ts`).
//*
//* Csak a feliratkozott osztályokéit: a többi osztályhoz mentett döntésnek itt
//* nincs keresnivalója. A tanári órarendre ez nem vonatkozik (duális napja nincs,
//* és a saját óráit nem rejti el) — ott a teljes órarend marad az olvasat.
export type PushPersonalization = {
  /** Duális beosztás osztályonként — csak ahol legalább egy nap be van jelölve. */
  dual: Record<string, DualScheduleEntry>;
  /** Csoportbontás-döntések osztályonként — csak ahol van döntés. */
  merge: Record<string, MergePrefEntry[]>;
};

//! A TÖRZS PLAFONJA. Öt osztály döntései a valóságban néhány kilobájt; a
//! korlát nem ezt méri, hanem azt, hogy egy percenként olvasott sor ne
//! hízhasson meg — a háttérfeladat minden tickben minden feliratkozót beolvas.
export const MAX_SUBSCRIBE_BYTES = 32 * 1024;

/**
 * A böngészőből jövő döntések szűrése. Csak a `classes` listában szereplő
 * osztály kulcsa maradhat meg; a listák ellenőrzése SZÓ SZERINT a
 * beállítás-szinkroné.
 */
export function sanitizePushPersonalization(
  value: unknown,
  classes: readonly string[],
): PushPersonalization {
  const out: PushPersonalization = { dual: {}, merge: {} };
  if (!value || typeof value !== "object" || Array.isArray(value)) return out;
  const raw = value as { dual?: unknown; merge?: unknown };
  const dual = isRecord(raw.dual) ? raw.dual : {};
  const merge = isRecord(raw.merge) ? raw.merge : {};

  for (const short of new Set(classes)) {
    const schedule = sanitizeDual(dual[short]);
    //* Az üres beosztás a feed szempontjából „nincs duális nap" — itt sincs
    //* értelme tárolni, a hiánya ugyanezt jelenti.
    if (schedule && (schedule.A.length > 0 || schedule.B.length > 0)) {
      out.dual[short] = schedule;
    }
    const prefs = sanitizeMergeList(merge[short]);
    if (prefs.length > 0) out.merge[short] = prefs;
  }
  return out;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export const DEFAULT_PREFS: PushPrefs = {
  classes: [],
  teachers: [],
  everyLesson: false,
};

//! A KETTŐ EGYÜTT A FELIRATKOZÁS. Egy feliratkozás akkor él, ha LEGALÁBB
//! egyik listája nem üres — az osztályfőnök tanár mindkettőre iratkozhat, és a
//! két lista két KÜLÖN felületen szerkeszthető (a diák „Ma"-ján az egyik, a
//! tanárin a másik). Ezért nem szabad sehol azt kérdezni, hogy „üres-e a
//! `classes`": attól a másik lista még tarthatja életben a sort.
export function prefsEmpty(prefs: PushPrefs): boolean {
  return prefs.classes.length === 0 && prefs.teachers.length === 0;
}

//* A két lista ugyanazon a néven, alanyfajta szerint — így a lap, a végpont és
//* a háttérfeladat is egyetlen ágon tudja kezelni mindkettőt.
export function subjectsOf(
  prefs: PushPrefs,
  kind: "class" | "teacher",
): string[] {
  const list = kind === "teacher" ? prefs.teachers : prefs.classes;
  //! A RÉGI SOROKBAN NINCS `teachers`. A tárolóban élő feliratkozások a tanári
  //! ág előtt keletkeztek, és a lejáratukig (több mint egy év) ott is
  //! maradnak — a hiányzó mező tehát NEM elméleti eset. Üres listát adunk rá,
  //! mert az igaz: arra a sorra nincs tanári feliratkozás.
  return Array.isArray(list) ? list : [];
}

export function maxSubjects(kind: "class" | "teacher"): number {
  return kind === "teacher" ? MAX_TEACHERS : MAX_CLASSES;
}

//! AMIT A SERVICE WORKER MEGKAP. Szándékosan KÉSZ szöveg: a worker nem számol
//! és nem formáz, csak megjelenít. Ha a fogalmazás a workerben élne, minden
//! szövegjavításhoz meg kellene VÁRNI, amíg a régi worker mindenkinél lecserélődik
//! — az napokig tarthat.
export type PushPayload = {
  /** `lesson` = óra előtti emlékeztető, `change` = megváltozott az órarend. */
  kind: "lesson" | "change";
  title: string;
  body: string;
  /** Melyik lapot nyissa meg a koppintás. */
  url: string;
  //! A `tag` ÖSSZEVONÁS, NEM AZONOSÍTÓ. Azonos címkéjű értesítésből egyszerre
  //! csak egy áll a rendszersávban: az újabb LECSERÉLI a régit. Így egy
  //! késleltetett újraküldés nem rak ki két egyforma sort, és a tegnapi
  //! emlékeztető sem marad ott a mai mellett.
  tag: string;
};
