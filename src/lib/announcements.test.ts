import { describe, expect, test } from "bun:test";
import { isBlockExempt, parsePaths, pathMatches } from "./announcements";

describe("pathMatches", () => {
  test("a * mindenre illik", () => {
    expect(pathMatches("*", "/")).toBe(true);
    expect(pathMatches("*", "/ugyelet")).toBe(true);
  });

  test("a pontos útvonal csak önmagára illik", () => {
    expect(pathMatches("/orarend", "/orarend")).toBe(true);
    expect(pathMatches("/orarend", "/orarend/")).toBe(true);
    expect(pathMatches("/orarend", "/orarendx")).toBe(false);
    expect(pathMatches("/orarend", "/orarend/valami")).toBe(false);
  });

  test("a /* az alapot és az alatta lévőket fogja, a hasonló nevűt nem", () => {
    expect(pathMatches("/tanari/*", "/tanari")).toBe(true);
    expect(pathMatches("/tanari/*", "/tanari/kovacs")).toBe(true);
    expect(pathMatches("/tanari/*", "/tanarix")).toBe(false);
  });
});

describe("parsePaths", () => {
  test("vessző és új sor is elválaszt, a / pótlódik, az ismétlés kiesik", () => {
    expect(parsePaths("orarend, /ugyelet\n*\n/ugyelet")).toEqual([
      "/orarend",
      "/ugyelet",
      "*",
    ]);
  });
});

describe("isBlockExempt", () => {
  test("az admin és a belépés sosem tiltható le", () => {
    expect(isBlockExempt("/admin")).toBe(true);
    expect(isBlockExempt("/belepes")).toBe(true);
    expect(isBlockExempt("/administrator")).toBe(false);
    expect(isBlockExempt("/orarend")).toBe(false);
  });
});
