import { afterEach, describe, expect, test } from "bun:test";
import { json, stubFetch } from "@/test/browser";
import {
  filterKnownClasses,
  filterKnownTeachers,
  isKnownClass,
  isKnownTeacher,
  loadClassList,
  looksLikeClass,
  looksLikeTeacher,
} from "./known-class";

let restore = () => {};
afterEach(() => restore());

function serve(handler: Parameters<typeof stubFetch>[0]) {
  const stub = stubFetch(handler);
  restore = stub.restore;
  return stub;
}

describe("looksLikeClass", () => {
  test.each([
    ["9A", false],
    ["09A", true],
    ["12A", true],
    ["10NY", true],
    ["13ÉK", true],
    ["12a", false],
    ["12ABCDE", false],
    ["A12", false],
    ["", false],
  ])("%s → %p", (value, expected) => {
    expect(looksLikeClass(value)).toBe(expected);
  });

  test("nem szöveg", () => {
    expect(looksLikeClass(12)).toBe(false);
    expect(looksLikeClass(null)).toBe(false);
  });
});

describe("looksLikeTeacher", () => {
  test.each([
    ["LM", true],
    ["ŐÉ", true],
    ["ABCDEF", true],
    ["ABCDEFG", false],
    ["lm", false],
    ["L1", false],
    ["", false],
  ])("%s → %p", (value, expected) => {
    expect(looksLikeTeacher(value)).toBe(expected);
  });
});

describe("loadClassList", () => {
  test("csak az osztály-alakú, egyedi, magyar ábécé szerint rendezett rövid nevek", async () => {
    serve(() =>
      json([
        { short: "12B" },
        { short: "10A" },
        { short: "12B" },
        { short: "tanári" },
        { nope: 1 },
        null,
      ]),
    );
    expect(await loadClassList()).toEqual(["10A", "12B"]);
  });

  test("hiba, nem tömb vagy üres eredmény: null", async () => {
    serve(() => new Response("", { status: 500 }));
    expect(await loadClassList()).toBeNull();
    restore();
    serve(() => json({ list: [] }));
    expect(await loadClassList()).toBeNull();
    restore();
    serve(() => json([{ short: "x" }]));
    expect(await loadClassList()).toBeNull();
    restore();
    serve(() => {
      throw new Error("offline");
    });
    expect(await loadClassList()).toBeNull();
  });
});

describe("isKnownClass", () => {
  test("a lista a döntő, ha van", async () => {
    serve(() => json([{ short: "12A" }]));
    expect(await isKnownClass("12A")).toBe(true);
    expect(await isKnownClass("12B")).toBe(false);
  });

  test("túl hosszú: hálózat nélkül elutasít", async () => {
    const { calls } = serve(() => json([]));
    expect(await isKnownClass("123456789")).toBe(false);
    expect(calls).toHaveLength(0);
  });

  test("elérhetetlen forrás: az alak dönt", async () => {
    serve(() => new Response("", { status: 503 }));
    expect(await isKnownClass("12A")).toBe(true);
    expect(await isKnownClass("xx")).toBe(false);
    restore();
    serve(() => json([]));
    expect(await isKnownClass("12A")).toBe(true);
    restore();
    serve(() => {
      throw new Error("offline");
    });
    expect(await isKnownClass("12A")).toBe(true);
  });

  test("filterKnownClasses a sorrendet tartja", async () => {
    serve(() => json([{ short: "12A" }, { short: "10C" }]));
    expect(await filterKnownClasses(["10C", "99Z", "12A"])).toEqual([
      "10C",
      "12A",
    ]);
  });
});

describe("isKnownTeacher", () => {
  test("a lista a döntő, ha van", async () => {
    const { calls } = serve(() => json([{ short: "LM" }]));
    expect(await isKnownTeacher("LM")).toBe(true);
    expect(await isKnownTeacher("KB")).toBe(false);
    expect(calls[0].url).toContain("/timetable/teachers");
  });

  test("elérhetetlen forrás: az alak dönt", async () => {
    serve(() => {
      throw new Error("offline");
    });
    expect(await isKnownTeacher("KB")).toBe(true);
    expect(await isKnownTeacher("kb")).toBe(false);
    expect(await isKnownTeacher("ABCDEFG")).toBe(false);
  });

  test("filterKnownTeachers", async () => {
    serve(() => json([{ short: "LM" }]));
    expect(await filterKnownTeachers(["LM", "KB"])).toEqual(["LM"]);
  });
});
