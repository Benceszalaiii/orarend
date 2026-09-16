import { describe, expect, test } from "bun:test";
import {
  classKeys,
  type SharedExtras,
  sharedScreenFor,
  teacherLinksFor,
} from "./lesson-extras";

const link = (id: string, classes: string[]) => ({
  id,
  teacher: "kj",
  subject: "matek",
  classes,
  url: `https://example.com/${id}`,
  label: null,
  createdAt: "",
});

const shared: SharedExtras = {
  screens: [{ room: "a218", host: "192.168.1.20", port: 7070, updatedAt: "" }],
  links: [
    link("all", []),
    link("only9a", ["09a"]),
    link("9b10c", ["09b", "10c"]),
  ],
};

describe("classKeys", () => {
  test("szétbontja az összevont osztályokat", () => {
    expect(classKeys("09A, 09B")).toEqual(["09a", "09b"]);
    expect(classKeys(["10C", "10c", ""])).toEqual(["10c"]);
    expect(classKeys(null)).toEqual([]);
  });
});

describe("teacherLinksFor", () => {
  test("az osztály nézetéből a saját osztály és a mindenkinek szóló", () => {
    const ids = teacherLinksFor(shared, "KJ", "Matek", ["09A"]).map(
      (l) => l.id,
    );
    expect(ids).toEqual(["all", "only9a"]);
  });

  test("összevont órán bármelyik közös osztály elég", () => {
    const ids = teacherLinksFor(shared, "kj", "matek", ["10C, 11A"]).map(
      (l) => l.id,
    );
    expect(ids).toEqual(["all", "9b10c"]);
  });

  test("osztály nélkül csak a mindenkinek szóló", () => {
    expect(teacherLinksFor(shared, "kj", "matek", []).map((l) => l.id)).toEqual(
      ["all"],
    );
  });

  test("más tanár vagy tárgy nem kapja meg", () => {
    expect(teacherLinksFor(shared, "xy", "matek", ["09a"])).toEqual([]);
    expect(teacherLinksFor(shared, "kj", "fizika", ["09a"])).toEqual([]);
  });
});

describe("sharedScreenFor", () => {
  test("a terem jele kis- és nagybetűtől független", () => {
    expect(sharedScreenFor(shared, " A218 ")?.host).toBe("192.168.1.20");
    expect(sharedScreenFor(shared, "b101")).toBeNull();
  });
});
