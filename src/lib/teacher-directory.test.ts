import { afterEach, describe, expect, test } from "bun:test";
import { json, stubFetch } from "@/test/browser";
import {
  findTeacherForGoogleAccount,
  loadTeacherDirectory,
  lookupTeacherForAccount,
  resolveSchoolIdentity,
} from "./teacher-directory";

let restore = () => {};
afterEach(() => restore());
function serve(handler: Parameters<typeof stubFetch>[0]) {
  const stub = stubFetch(handler);
  restore = stub.restore;
  return stub;
}

const TEACHERS = [
  { short: "LM", name: "Lipták Mária Ivett" },
  { short: "KB", name: "Kovács Béla" },
  { short: "HN", name: "Horváth Norbert (1979.05.16.)" },
];

describe("loadTeacherDirectory", () => {
  test("a hibás sorok kiesnek, a többi marad", async () => {
    serve(() =>
      json([...TEACHERS, { short: "", name: "x" }, { short: "Y" }, null]),
    );
    expect(await loadTeacherDirectory()).toEqual(TEACHERS);
  });

  test("hiba, nem tömb, üres: null", async () => {
    for (const reply of [
      () => new Response("", { status: 500 }),
      () => json({}),
      () => json([{ nope: 1 }]),
      () => {
        throw new Error("offline");
      },
    ]) {
      serve(reply);
      expect(await loadTeacherDirectory()).toBeNull();
      restore();
    }
  });
});

describe("lookupTeacherForAccount", () => {
  test("névtalálat", async () => {
    serve(() => json(TEACHERS));
    expect(
      await lookupTeacherForAccount({
        email: "kovacs.bela@jedlik.eu",
        name: "Kovács Béla",
      }),
    ).toEqual({
      status: "matched",
      teacher: TEACHERS[1],
    });
  });

  test("túl rövid név: lekérés nélkül no-match", async () => {
    const { calls } = serve(() => json(TEACHERS));
    expect(
      await lookupTeacherForAccount({ email: "x@jedlik.eu", name: "Béla" }),
    ).toEqual({ status: "no-match" });
    expect(calls).toHaveLength(0);
  });

  test("a kézi rögzítés a név nélkül is talál", async () => {
    serve(() => json(TEACHERS));
    expect(
      await lookupTeacherForAccount({ email: " Flash@Jedlik.eu ", name: null }),
    ).toEqual({
      status: "matched",
      teacher: TEACHERS[2],
    });
  });

  test("elérhetetlen lista: unavailable, a kényelmi alak null", async () => {
    serve(() => new Response("", { status: 503 }));
    const account = { email: "kovacs.bela@jedlik.eu", name: "Kovács Béla" };
    expect(await lookupTeacherForAccount(account)).toEqual({
      status: "unavailable",
    });
    expect(await findTeacherForGoogleAccount(account)).toBeNull();
  });
});

describe("resolveSchoolIdentity", () => {
  test("nem iskolai cím: ne írjunk semmit", async () => {
    const { calls } = serve(() => json(TEACHERS));
    expect(
      await resolveSchoolIdentity({
        email: "x@gmail.com",
        name: "Kovács Béla",
      }),
    ).toBeNull();
    expect(
      await resolveSchoolIdentity({
        email: "x@jedlik-ad.invalid",
        name: "Kovács Béla",
      }),
    ).toBeNull();
    expect(calls).toHaveLength(0);
  });

  test("diák: hálózat nélkül nem tanár", async () => {
    const { calls } = serve(() => json(TEACHERS));
    expect(
      await resolveSchoolIdentity({
        email: "x@students.jedlik.eu",
        name: "Kovács Béla",
      }),
    ).toEqual({
      isTeacher: false,
      teacherName: null,
    });
    expect(calls).toHaveLength(0);
  });

  test("tanár: a LISTA neve kerül be", async () => {
    serve(() => json(TEACHERS));
    expect(
      await resolveSchoolIdentity({
        email: "lm@jedlik.eu",
        name: "Mária Ivett Lipták",
      }),
    ).toEqual({
      isTeacher: true,
      teacherName: "Lipták Mária Ivett",
    });
  });

  test("tanári domain, nincs találat: nem tanár", async () => {
    serve(() => json(TEACHERS));
    expect(
      await resolveSchoolIdentity({
        email: "iroda@jedlik.eu",
        name: "Titkárság Iroda",
      }),
    ).toEqual({
      isTeacher: false,
      teacherName: null,
    });
  });

  //! Egy Jedlikinfo-leállás nem minősíthet diákká egy tanárt.
  test("tanári domain, elérhetetlen lista: null", async () => {
    serve(() => {
      throw new Error("offline");
    });
    expect(
      await resolveSchoolIdentity({
        email: "kb@jedlik.eu",
        name: "Kovács Béla",
      }),
    ).toBeNull();
  });
});
