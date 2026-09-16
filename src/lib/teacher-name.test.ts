import { describe, expect, test } from "bun:test";
import {
  findTeacherByName,
  nameTokens,
  normalizeName,
  type TeacherRecord,
} from "./teacher-name";

//! ═══════════════════════════════════════════════════════════════════════════
//! REGRESSZIÓS TESZT — EZ A FÜGGVÉNY AD TANÁRI JOGOT
//! ═══════════════════════════════════════════════════════════════════════════
//! A lista a valódi Jedlikinfo-tanárlista egy részlete, a buktatókkal együtt:
//! két azonos nevű tanár (zárójeles dátummal), háromtagú nevek, kötőjeles
//! vezetéknév, azonos vezetéknevek.
//! ═══════════════════════════════════════════════════════════════════════════

const TEACHERS: TeacherRecord[] = [
  { short: "BA", name: "Balogh Anna" },
  { short: "BB", name: "Balogh Bence" },
  { short: "GÉ", name: "Garami Éva Katalin" },
  { short: "HF", name: "Horváth Norbert (1979.04.09.)" },
  { short: "HN", name: "Horváth Norbert (1979.05.16.)" },
  { short: "KB", name: "Kiss Barnabás" },
  { short: "KG", name: "Kiss Gábor" },
  { short: "KZ", name: "Kovács Zoltán Jenő" },
  { short: "NVG", name: "Németh-Veres Gabriella Erzsébet" },
  { short: "OSB", name: "Őszéné Samu Bernadett Kornélia" },
  { short: "KJ", name: "Kovács János" },
];

describe("normalizeName", () => {
  test("ékezet, kis/nagybetű, szóközök — a sorrend megmarad", () => {
    expect(normalizeName("Kovács János")).toBe("kovacs janos");
    expect(normalizeName("Janos Kovacs")).toBe("janos kovacs");
    expect(normalizeName("  KOVÁCS   JÁNOS ")).toBe("kovacs janos");
    expect(normalizeName("Őszéné Űrös")).toBe("oszene uros");
  });

  test("a zárójeles toldalék és az írásjelek leesnek", () => {
    expect(normalizeName("Horváth Norbert (1979.04.09.)")).toBe(
      "horvath norbert",
    );
    expect(normalizeName("Németh-Veres Gabriella")).toBe(
      "nemeth veres gabriella",
    );
  });

  test("hiányzó bemenet nem dob", () => {
    expect(normalizeName(null)).toBe("");
    expect(normalizeName(undefined)).toBe("");
    expect(normalizeName("   ")).toBe("");
    expect(nameTokens(null)).toEqual([]);
  });
});

describe("findTeacherByName", () => {
  const short = (name: string | null | undefined) =>
    findTeacherByName(name, TEACHERS)?.short ?? null;

  test("felcserélt sorrend és ékezet nélküli név is talál", () => {
    expect(short("Janos Kovacs")).toBe("KJ");
    expect(short("KOVÁCS JÁNOS")).toBe("KJ");
    expect(short("kovacs  janos")).toBe("KJ");
  });

  test("a kanonikus LISTA-nevet adja vissza, nem a bemenetet", () => {
    expect(findTeacherByName("Janos Kovacs", TEACHERS)?.name).toBe(
      "Kovács János",
    );
  });

  test("hiányzó középső név: egyértelmű tartalmazás talál", () => {
    expect(short("Zoltán Kovács")).toBe("KZ");
    expect(short("Eva Garami")).toBe("GÉ");
    expect(short("Gabriella Németh-Veres")).toBe("NVG");
  });

  test("azonos nevű tanárok: nincs találat, nem az első", () => {
    expect(short("Norbert Horváth")).toBeNull();
    expect(short("Horváth Norbert")).toBeNull();
  });

  test("több tanárra illő bővebb név: nincs találat", () => {
    expect(short("Kiss Gábor Barnabás")).toBeNull();
  });

  test("egy szó soha nem azonosít", () => {
    expect(short("Kovács")).toBeNull();
    expect(short("Garami")).toBeNull();
  });

  test("hasonló, de más név nem talál (nincs elmosódott egyezés)", () => {
    expect(short("Balogh Annа")).toBeNull(); // cirill „а"
    expect(short("Balog Anna")).toBeNull();
    expect(short("Kovács Jánosné")).toBeNull();
    expect(short("Kiss Gabriella")).toBeNull();
  });

  test("üres név és hibás lista nem dob", () => {
    expect(short(null)).toBeNull();
    expect(short("")).toBeNull();
    expect(findTeacherByName("Kovács János", [])).toBeNull();
    expect(
      findTeacherByName("Kovács János", null as unknown as TeacherRecord[]),
    ).toBeNull();
  });
});
