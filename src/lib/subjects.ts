//* ---------------------------------------------------------------------------
//* TANTÁRGYAK — KI TANÍTJA, KINEK
//* ---------------------------------------------------------------------------
//! ITT NINCS SE HÁLÓZAT, SE GYORSÍTÓTÁR. A lekérést a `subjects-source.ts`
//! végzi; ez a modul csak a teremfoglaltságból (lásd `free-rooms.ts`) rakja
//! össze, melyik tantárgyat melyik tanár tanítja, és melyik osztálynak.
//!
//! ─── MIÉRT A TERMEK SEPRÉSÉBŐL ─────────────────────────────────────────────
//! A kérdés („ki tanít fizikát, és kiknek") se az osztály, se a tanár
//! órarendjéből nem jön ki egy kéréssel: a `timetable/cards` egyszerre egy
//! alanyra szűr. A TEREM nézete viszont az egyetlen, ahol a kártyán MINDHÁROM
//! ott áll — tantárgy, tanár (bal sarok) és osztály (jobb sarok) —, és a
//! teremkereső ezt a 71 kérést amúgy is lefuttatja óránként. Ugyanabból a
//! pillanatképből dolgozunk, tehát a Jedlikinfo felé ez a lap egyetlen újabb
//! kérésbe sem kerül.
//*
//! A szakkörök is itt vannak: osztály nélküli kártyák, amelyek csak a termek és
//! a tanárok órarendjében látszanak — egy osztályonkénti seprés pont ezeket
//! hagyná ki.
//!
//! ─── AMIT EZ A MODUL NEM ÁLLÍT ─────────────────────────────────────────────
//! Egy HÉT képe, nem a tanévé. Az A/B hetes tárgyakért a hívó két egymást
//! követő hetet ad át, és mi az uniójukat vesszük; ami egyik héten sincs
//! (egy elmaradt óra, egy szünet miatt), az itt sem lesz. A terem nélküli órát
//! a terem nézete nem ismeri — ellenőrizve 2026-09-28-án: egy ilyen sincs.

import type { WeekOccupancy } from "./free-rooms";

export type SubjectTeacher = {
  /** A tanár jele (`LM`) — ezzel nyílik a tanári órarend. Üres is lehet. */
  short: string;
  name: string;
  /** Az osztályok, akiknek EZT a tárgyat tanítja, rendezve. */
  classes: string[];
};

export type SubjectClass = {
  short: string;
  /** A tárgy tanárai ennél az osztálynál, a `teachers` kulcsaival. */
  teachers: string[];
};

export type SubjectEntry = {
  /** A tárgy teljes neve — ez az azonosító (lásd `RoomBooking.subjectShort`). */
  name: string;
  /** A leggyakoribb rövid jel a forrás szerint (`mat`); üres is lehet. */
  short: string;
  teachers: SubjectTeacher[];
  classes: SubjectClass[];
};

export type SubjectIndex = {
  /** A hetek hétfői, amelyekből az index összeállt. */
  weeks: string[];
  //! A LEGRÉGEBBI pillanatkép kelte. Két hét közül a régebbi mondja meg,
  //! mennyire hihet az egész a válasznak.
  fetchedAt: number;
  subjects: SubjectEntry[];
  //! A termek, amelyekről legalább egy héten nem jött válasz. Az ő óráik
  //! hiányozhatnak — ezt a lapnak ki kell mondania, nem elhallgatnia.
  unknown: string[];
};

//* A tanár kulcsa a jele; ha a forrás nem adott jelet, a neve.
export function teacherKey(t: { short: string; name: string }): string {
  return t.short || t.name;
}

function byClass(a: string, b: string): number {
  return a.localeCompare(b, "hu", { numeric: true });
}

type Draft = {
  name: string;
  shorts: Map<string, number>;
  teachers: Map<string, { short: string; name: string; classes: Set<string> }>;
  classes: Map<string, Set<string>>;
};

export function buildSubjectIndex(
  occupancies: readonly WeekOccupancy[],
): SubjectIndex {
  const drafts = new Map<string, Draft>();
  const unknown = new Set<string>();

  for (const week of occupancies) {
    for (const room of week.unknown) unknown.add(room);
    for (const room of week.rooms) {
      for (const b of room.bookings) {
        const name = b.subject.trim();
        if (!name) continue;
        const teacher = {
          short: b.teacherShort.trim(),
          name: b.teacher.trim(),
        };
        const tKey = teacherKey(teacher);
        const classShort = b.classShort.trim();
        //* Se tanár, se osztály: egy foglalás, ami senkiről nem mond semmit.
        if (!tKey && !classShort) continue;

        let draft = drafts.get(name);
        if (!draft) {
          draft = {
            name,
            shorts: new Map(),
            teachers: new Map(),
            classes: new Map(),
          };
          drafts.set(name, draft);
        }
        const short = b.subjectShort.trim();
        if (short) draft.shorts.set(short, (draft.shorts.get(short) ?? 0) + 1);

        if (tKey) {
          let t = draft.teachers.get(tKey);
          if (!t) {
            t = { ...teacher, classes: new Set() };
            draft.teachers.set(tKey, t);
          }
          //* Ha egy kártya csak a jelet hozta, egy másik a nevet is, a név
          //* nyer — a lapon nevet olvasnak, nem monogramot.
          if (teacher.name && t.name === t.short) t.name = teacher.name;
          if (classShort) t.classes.add(classShort);
        }
        if (classShort) {
          let c = draft.classes.get(classShort);
          if (!c) {
            c = new Set();
            draft.classes.set(classShort, c);
          }
          if (tKey) c.add(tKey);
        }
      }
    }
  }

  const subjects: SubjectEntry[] = [...drafts.values()].map((d) => {
    const teachers = [...d.teachers.values()]
      .map((t) => ({
        short: t.short,
        name: t.name || t.short,
        classes: [...t.classes].sort(byClass),
      }))
      .sort((a, b) => a.name.localeCompare(b.name, "hu"));
    //* A tanárok sorrendje a lapé, ezért az osztálynál is abban állnak.
    const order = new Map(teachers.map((t, i) => [teacherKey(t), i] as const));
    const classes = [...d.classes.entries()]
      .map(([short, ts]) => ({
        short,
        teachers: [...ts].sort(
          (a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0),
        ),
      }))
      .sort((a, b) => byClass(a.short, b.short));
    const short =
      [...d.shorts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
    return { name: d.name, short, teachers, classes };
  });
  subjects.sort((a, b) => a.name.localeCompare(b.name, "hu"));

  return {
    weeks: occupancies.map((o) => o.weekStart),
    fetchedAt: occupancies.reduce(
      (oldest, o) => Math.min(oldest, o.fetchedAt),
      Number.POSITIVE_INFINITY,
    ),
    subjects,
    unknown: [...unknown].sort(byClass),
  };
}

//! A LAP A NAGY TÁRGYAKKAL KEZD. Ábécérendben a lista eleje a „09. évfolyam
//! … korrepetálás"-ok hosszú sora, egy-egy tanárral — a matek, a fizika, az
//! angol pedig valahol a közepén. Aki nem keres, annak a sok tanárt és sok
//! osztályt érintő tárgyak a legvalószínűbbek. Először a tanárok száma dönt,
//! aztán az osztályoké, végül a név (hogy a sorrend stabil legyen).
//*
//* Az index maga ábécérendben marad: az API-nak az a kiszámítható sorrend.
export function rankSubjects(
  subjects: readonly SubjectEntry[],
): SubjectEntry[] {
  return [...subjects].sort(
    (a, b) =>
      b.teachers.length - a.teachers.length ||
      b.classes.length - a.classes.length ||
      a.name.localeCompare(b.name, "hu"),
  );
}

//! ÉKEZET NÉLKÜL IS TALÁLJON. Telefonon a „tortenelem" gyorsabban jön ki, mint
//! a „történelem" — és aki így gépel, ugyanazt a tárgyat keresi.
export function foldSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase("hu")
    .trim();
}

/** A tárgy neve vagy rövid jele szerint szűr, ékezet- és kisbetű-függetlenül. */
export function filterSubjects(
  subjects: readonly SubjectEntry[],
  query: string,
): SubjectEntry[] {
  const needle = foldSearch(query);
  if (!needle) return [...subjects];
  return subjects.filter(
    (s) =>
      foldSearch(s.name).includes(needle) ||
      foldSearch(s.short).includes(needle),
  );
}

/** Egy tárgy a neve alapján — ugyanúgy megbocsátó, mint a keresés. */
export function findSubject(
  subjects: readonly SubjectEntry[],
  name: string,
): SubjectEntry | null {
  const needle = foldSearch(name);
  if (!needle) return null;
  return subjects.find((s) => foldSearch(s.name) === needle) ?? null;
}
