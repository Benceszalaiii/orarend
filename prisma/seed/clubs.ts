import type { ClubInput, ClubSlotInput } from "../../src/lib/clubs";

//! ═══════════════════════════════════════════════════════════════════════════
//! A KEZDŐ SZAKKÖRLISTA — 2026/27-ES TANÉV
//! ═══════════════════════════════════════════════════════════════════════════
//! FORRÁS: az iskola szakkörlistája (47 sor), ÖSSZEVETVE a Jedlikinfóval —
//! mind a 71 terem órarendje a 2026-09-21-i héten, az osztály nélküli kártyák.
//!
//! AHOL A KETTŐ ELTÉR, A JEDLIKINFO NYER (döntés, 2026-09-24). Az eltérések:
//!   • 09. évf. fizika korrepetálás — a lista 108-at írt, a Jedlikinfo 112-t.
//!     (A 108-ban ugyanakkor a 10A kompetenciafejlesztés van.)
//!   • 10C kompetenciafejlesztés — a lista két időpontot vont össze. A keddi
//!     104-es a 10E-é, ezért az KÜLÖN szakkör lett (a listán nem szerepelt).
//!   • Tehetséggondozó (DÖK) — a lista „111 (Dök Tanya)"-t írt, ilyen terem a
//!     Jedlikinfóban nincs; ott 112, 14:30–18:10.
//!   • Forgácsolás — a lista „8–9. órát" írt, a Jedlikinfo 15:15–16:40-et.
//!   • Az Ágoston Anett-féle jel a listán `ÁÁ`, a Jedlikinfóban `AA`.
//!
//! AMIRŐL A JEDLIKINFO HALLGAT, OTT A LISTA MARAD, `ORGANIZER` forrással:
//!   • Social média szakkör, Rendszergazda szakkör — időpontjuk van a listán,
//!     kártyájuk nincs. A lap ki is mondja: „csak a tanár szerint".
//!   • A hat „egyeztetés alatt" szakkör időpont nélkül kerül be.
//!
//! AMI SZÁNDÉKOSAN KIMARADT: Bólya Gábor keddi 14:30–17:25-ös
//! „Tehetséggondozó szakköre" a 202-ben. A listán nincs, és nem tudjuk, melyik
//! szakkör — a tanár az 1. fázis „ez melyik szakköröd?" folyamatában nevezi el.
//!
//! A LEÍRÁSOK ÜRESEK. Nem találunk ki szöveget egy tanár szakköréről; azt ő
//! írja meg.
//! ═══════════════════════════════════════════════════════════════════════════

//* A Jedlikinfo csengetési rendje (percben éjféltől). A 8–9. óra a két óra
//* együtt, a köztes szünettel.
const P0 = { startMinute: 7 * 60 + 10, endMinute: 7 * 60 + 55 };
const P7 = { startMinute: 13 * 60 + 35, endMinute: 14 * 60 + 20 };
const P8 = { startMinute: 14 * 60 + 30, endMinute: 15 * 60 + 15 };
const P8_9 = { startMinute: 14 * 60 + 30, endMinute: 15 * 60 + 55 };

const H = 1;
const K = 2;
const SZE = 3;
const CS = 4;
const P = 5;

function at(
  weekday: number,
  time: { startMinute: number; endMinute: number },
  room: string | null,
  teachers: string[],
  source: ClubSlotInput["source"] = "TIMETABLE",
): ClubSlotInput {
  return { weekday, ...time, room, teachers, source };
}

type SeedClub = Omit<ClubInput, "description" | "audienceNote"> & {
  audienceNote?: string;
};

function club(c: SeedClub): ClubInput {
  return { description: null, audienceNote: null, ...c };
}

const everyone = { grades: [], classes: [] };
const grade = (g: number) => ({ grades: [g], classes: [] });
const cls = (...classes: string[]) => ({ grades: [], classes });

function competency(className: string, teacher: string, slot: ClubSlotInput) {
  return club({
    name: `${className} matematikai kompetenciafejlesztés`,
    kind: "COMPETENCY",
    ...cls(className),
    organizers: [teacher],
    slots: [slot],
  });
}

export const SEED_CLUBS: readonly ClubInput[] = [
  //* ─── Érettségi felkészítők ────────────────────────────────────────────
  club({
    name: "Történelem emelt szintű felkészítő",
    kind: "EXAM_PREP",
    ...everyone,
    organizers: ["SO"],
    slots: [at(H, P8_9, "207", ["SO"])],
  }),
  club({
    name: "13. évf. fizika emelt szintű felkészítő",
    kind: "EXAM_PREP",
    ...grade(13),
    organizers: ["BNM"],
    slots: [at(K, P8_9, "104", ["BNM"])],
  }),
  club({
    name: "12. évf. fizika emelt szintű felkészítő",
    kind: "EXAM_PREP",
    ...grade(12),
    organizers: ["KNV"],
    slots: [
      at(
        CS,
        { startMinute: P7.startMinute, endMinute: P8_9.endMinute },
        "106",
        ["KNV"],
      ),
    ],
  }),
  club({
    name: "Matematika emelt szintű felkészítő",
    kind: "EXAM_PREP",
    ...everyone,
    organizers: ["KE"],
    slots: [at(SZE, P0, "112", ["KE"])],
  }),

  //* ─── Korrepetálás, felzárkóztatás ─────────────────────────────────────
  club({
    name: "Angol nyelv felzárkóztató",
    kind: "CATCH_UP",
    ...everyone,
    organizers: ["KIE"],
    slots: [at(K, P8, "209", ["KIE"])],
  }),
  club({
    name: "09. évf. fizika korrepetálás",
    kind: "TUTORING",
    ...grade(9),
    organizers: ["AA"],
    slots: [at(CS, P0, "112", ["AA"])],
  }),
  club({
    name: "10. évf. fizika korrepetálás",
    kind: "TUTORING",
    ...grade(10),
    organizers: ["BKE"],
    slots: [at(SZE, P0, "108", ["BKE"])],
  }),
  club({
    name: "11. évf. fizika korrepetálás",
    kind: "TUTORING",
    ...grade(11),
    organizers: ["BNM"],
    slots: [at(K, P0, "207", ["BNM"])],
  }),
  club({
    name: "10. évf. Python korrepetálás",
    kind: "TUTORING",
    ...grade(10),
    organizers: ["BB"],
    slots: [],
  }),

  //* ─── Matematika ───────────────────────────────────────────────────────
  club({
    name: "09. évf. matematika szakkör",
    kind: "CLUB",
    ...grade(9),
    organizers: ["BNM"],
    slots: [at(H, P0, "207", ["BNM"])],
  }),
  club({
    name: "10. évf. matematika szakkör",
    kind: "CLUB",
    ...grade(10),
    organizers: ["CSG"],
    slots: [at(P, P0, "104", ["CSG"])],
  }),
  club({
    name: "11. évf. matematika szakkör",
    kind: "CLUB",
    ...grade(11),
    organizers: ["INA"],
    slots: [at(CS, P0, "106", ["INA"])],
  }),
  club({
    name: "12. évf. matematika versenyfelkészítő",
    kind: "COMPETITION_PREP",
    ...grade(12),
    organizers: ["CSG"],
    slots: [at(H, P0, "104", ["CSG"])],
  }),
  competency("09A", "BNM", at(SZE, P0, "15", ["BNM"])),
  competency("09B", "AA", at(H, P0, "106", ["AA"])),
  competency("09C", "KE", at(P, P0, "112", ["KE"])),
  competency("09D", "KNV", at(H, P0, "108", ["KNV"])),
  competency("09E", "KZS", at(SZE, P0, "212", ["KZS"])),
  competency("10A", "CSG", at(CS, P0, "108", ["CSG"])),
  competency("10B", "BNM", at(CS, P0, "15", ["BNM"])),
  competency("10C", "FM", at(P, P0, "106", ["FM"])),
  competency("10D", "FM", at(CS, P0, "104", ["FM"])),
  competency("10E", "FM", at(K, P0, "104", ["FM"])),

  //* ─── Humán, nyelv, közösség ───────────────────────────────────────────
  club({
    name: "Humán versenyfelkészítés szakkör",
    kind: "COMPETITION_PREP",
    ...everyone,
    organizers: ["TZ"],
    slots: [at(K, P7, "112", ["TZ"]), at(SZE, P7, "208", ["TZ"])],
  }),
  club({
    name: "Francia szakkör",
    kind: "CLUB",
    ...everyone,
    organizers: ["BH"],
    slots: [
      at(CS, { startMinute: P8.startMinute, endMinute: 16 * 60 + 40 }, "T3", [
        "BH",
      ]),
    ],
  }),
  club({
    name: "Tehetséggondozó szakkör (DÖK)",
    kind: "CLUB",
    ...everyone,
    organizers: ["NTF"],
    slots: [
      at(CS, { startMinute: P8.startMinute, endMinute: 18 * 60 + 10 }, "112", [
        "NTF",
      ]),
    ],
  }),
  club({
    name: "Média szakkör",
    kind: "CLUB",
    ...everyone,
    organizers: ["HZ", "MT"],
    slots: [at(SZE, P8_9, "Stúdió", ["HZ", "MT"])],
  }),
  club({
    name: "Social média szakkör",
    kind: "CLUB",
    ...everyone,
    organizers: ["PZS"],
    slots: [at(H, P8_9, "15", ["PZS"], "ORGANIZER")],
  }),

  //* ─── Informatika ──────────────────────────────────────────────────────
  club({
    name: "Alkalmazói szakkör",
    kind: "CLUB",
    ...everyone,
    organizers: ["LM"],
    slots: [at(H, P8_9, "203", ["LM"])],
  }),
  club({
    name: "09. évf. informatika szakkör",
    kind: "CLUB",
    ...grade(9),
    organizers: ["SBA"],
    slots: [at(SZE, P0, "117", ["SBA"])],
  }),
  club({
    name: "10. évf. informatika szakkör",
    kind: "CLUB",
    ...grade(10),
    organizers: ["BB"],
    slots: [],
  }),
  club({
    name: "11. évf. szoftverfejlesztés szakkör",
    kind: "CLUB",
    ...grade(11),
    organizers: ["SL"],
    slots: [],
  }),
  club({
    name: "12. évf. szoftverfejlesztés szakkör",
    kind: "CLUB",
    ...grade(12),
    organizers: ["BG"],
    slots: [at(K, P0, "202", ["BG"])],
  }),
  club({
    name: "13. évf. szoftverfejlesztés szakkör",
    kind: "CLUB",
    ...grade(13),
    organizers: ["BP"],
    slots: [],
  }),
  club({
    name: "11. évf. hálózati technológiák szakkör",
    kind: "CLUB",
    ...grade(11),
    organizers: ["CSI"],
    slots: [at(H, P8, "117", ["CSI"])],
  }),
  club({
    name: "12. évf. hálózati technológiák szakkör",
    kind: "CLUB",
    ...grade(12),
    organizers: ["HN"],
    slots: [at(CS, P8, "203", ["HN"])],
  }),
  club({
    name: "13. évf. hálózati technológiák szakkör",
    kind: "CLUB",
    ...grade(13),
    organizers: ["VA"],
    slots: [at(K, P8, "B5", ["VA"])],
  }),
  club({
    name: "Rendszergazda szakkör",
    kind: "CLUB",
    ...everyone,
    organizers: ["HF"],
    slots: [at(H, P8_9, null, ["HF"], "ORGANIZER")],
  }),
  club({
    name: "Digitális technológiák szakkör",
    kind: "CLUB",
    ...everyone,
    organizers: ["SZG"],
    slots: [at(CS, P8_9, "B7", ["SZG"])],
  }),
  club({
    name: "Drón szakkör",
    kind: "CLUB",
    ...everyone,
    organizers: ["SK"],
    slots: [at(K, P8_9, "204", ["SK"])],
  }),
  club({
    name: "Lego szakkör",
    kind: "CLUB",
    ...everyone,
    organizers: ["BP", "SBA"],
    slots: [at(H, P8_9, "402", ["BP"]), at(K, P8_9, "402", ["SBA"])],
  }),

  //* ─── Versenyfelkészítés ───────────────────────────────────────────────
  club({
    name: "OSZTV elméleti felkészítés",
    kind: "COMPETITION_PREP",
    ...cls("13D", "13E"),
    audienceNote: "13D páros, 13E páratlan héten",
    organizers: ["TGY"],
    slots: [
      at(K, P0, "205", ["TGY"]),
      at(SZE, P0, "205", ["TGY"]),
      at(CS, P0, "205", ["TGY"]),
    ],
  }),
  club({
    name: "OSZTV gyakorlati felkészítés",
    kind: "COMPETITION_PREP",
    ...everyone,
    organizers: ["NA"],
    slots: [],
  }),
  club({
    name: "Skills versenyek felkészítés",
    kind: "COMPETITION_PREP",
    ...everyone,
    organizers: ["VA"],
    slots: [at(SZE, P8_9, "B5", ["VA"])],
  }),

  //* ─── Gépészet ─────────────────────────────────────────────────────────
  club({
    name: "Forgácsolás szakkör",
    kind: "CLUB",
    ...everyone,
    organizers: ["GA"],
    slots: [
      at(K, { startMinute: P8.endMinute, endMinute: 16 * 60 + 40 }, "CNC", [
        "GA",
      ]),
    ],
  }),
  club({
    name: "CAD rajzolás és 3D nyomtatás szakkör",
    kind: "CLUB",
    ...everyone,
    organizers: ["MM"],
    slots: [at(H, P0, "114", ["MM"]), at(P, P0, "114", ["MM"])],
  }),
  club({
    name: "Műszaki rajz szakkör",
    kind: "CLUB",
    ...everyone,
    organizers: ["PN"],
    slots: [at(CS, P0, "207", ["PN"])],
  }),
  club({
    name: "Hegesztés szakkör",
    kind: "CLUB",
    ...everyone,
    organizers: ["KZ"],
    slots: [],
  }),
];
