import { describe, expect, test } from "bun:test";
import {
  classRows,
  roomFloor,
  roomGroups,
  roomLabel,
  teacherGroups,
  teacherLetter,
} from "./subject-groups";

const s = (short: string, name = short) => ({ short, name });

describe("classRows", () => {
  test("évfolyam-sorok, a technikumi jel is a saját évfolyamába kerül", () => {
    const rows = classRows(
      ["09A", "09KNY", "13C", "13.KE", "14.LE", "Nagyinet"].map((c) => s(c)),
    );
    expect(rows.map((r) => [r.label, r.items.map((i) => i.label)])).toEqual([
      ["9.", ["A", "KNY"]],
      ["13.", ["C", "KE"]],
      ["14.", ["LE"]],
      ["Egyéb", ["Nagyinet"]],
    ]);
  });
});

describe("teacherLetter", () => {
  test("ékezet nélkül, a vezetéknév betűje", () => {
    expect(teacherLetter("Ábrahám Éva")).toBe("A");
    expect(teacherLetter("Örkényi Pál")).toBe("O");
    expect(teacherLetter("Szabó Anna")).toBe("S");
  });
  test("az osztályjel előtag nem számít", () => {
    expect(teacherLetter("10A Rotter Kristóf Ferdinánd")).toBe("R");
  });
});

describe("teacherGroups", () => {
  test("teljes ábécé, az üres betű is megmarad", () => {
    const groups = teacherGroups([
      s("KB", "Kovács Bence"),
      s("AJ", "Antal Judit"),
    ]);
    expect(groups).toHaveLength(26);
    expect(
      groups.find((g) => g.key === "K")?.items.map((i) => i.label),
    ).toEqual(["Kovács Bence"]);
    expect(groups.find((g) => g.key === "Q")?.items).toEqual([]);
  });
});

describe("roomFloor", () => {
  test("háromjegyű: az első jegy; egy-két jegyű: földszint; T, B, egyéb", () => {
    expect(roomFloor("102")).toBe("1");
    expect(roomFloor("212")).toBe("2");
    expect(roomFloor("002 - Klub 1")).toBe("0");
    expect(roomFloor("119-1 Lakatos műhely 1")).toBe("1");
    expect(roomFloor("29-es kisterem")).toBe("0");
    expect(roomFloor("3 - Tárgyaló")).toBe("0");
    expect(roomFloor("T4")).toBe("T");
    expect(roomFloor("B6")).toBe("B");
    expect(roomFloor("3D Labor")).toBe("X");
    expect(roomFloor("tornacsarnok")).toBe("X");
  });
});

describe("roomGroups", () => {
  test("a csempe a számot, a felirat a nevet viszi", () => {
    const groups = roomGroups([s("118", "118 - Könyvtár"), s("102"), s("T1")]);
    expect(groups.map((g) => g.label)).toEqual(["1. emelet", "Tanműhely"]);
    expect(groups[0].items.map((i) => [i.label, i.hint])).toEqual([
      ["102", undefined],
      ["118", "Könyvtár"],
    ]);
  });
});

describe("roomLabel", () => {
  test("a szám, ha van; különben a név", () => {
    expect(roomLabel("43 - Vegyes forgácsoló")).toBe("43");
    expect(roomLabel("119-1 Lakatos műhely 1")).toBe("119-1");
    expect(roomLabel("tornacsarnok")).toBe("tornacsarnok");
  });
});
