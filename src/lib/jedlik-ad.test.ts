import { afterEach, describe, expect, test } from "bun:test";
import { json, stubFetch } from "@/test/browser";
import {
  AdLoginError,
  adLogin,
  LOGIN_NAME_MAX_LENGTH,
  normalizeLoginName,
  syntheticEmail,
} from "./jedlik-ad";

let restore = () => {};
afterEach(() => restore());
function serve(handler: Parameters<typeof stubFetch>[0]) {
  const stub = stubFetch(handler);
  restore = stub.restore;
  return stub;
}

async function failure(run: () => Promise<unknown>): Promise<AdLoginError> {
  try {
    await run();
  } catch (err) {
    if (err instanceof AdLoginError) return err;
    throw err;
  }
  throw new Error("nem dobott");
}

describe("normalizeLoginName / syntheticEmail", () => {
  test("levágva, kisbetűsen, hosszra vágva", () => {
    expect(normalizeLoginName("  Kiss.Péter ")).toBe("kiss.péter");
    expect(normalizeLoginName("A".repeat(100))).toHaveLength(
      LOGIN_NAME_MAX_LENGTH,
    );
    expect(syntheticEmail("kiss.péter")).toBe("kiss.péter@jedlik-ad.invalid");
  });
});

describe("adLogin", () => {
  test("sikeres válasz: a mezők több lehetséges névről", async () => {
    const { calls } = serve(() =>
      json({
        osztály: { short: "13C" },
        tanar: "false",
        fullName: " Kiss Péter ",
      }),
    );
    expect(await adLogin(" kiss.peter ", "titok")).toEqual({
      displayName: "kiss.peter",
      class: "13C",
      isTeacher: false,
      fullName: "Kiss Péter",
    });
    expect(JSON.parse(calls[0].init?.body as string)).toEqual({
      loginName: " kiss.peter ",
      password: "titok",
      error: "",
    });
  });

  test("beágyazott `user` objektumból is olvas", async () => {
    serve(() =>
      json({
        token: "x",
        user: { className: "12A", isTeacher: true, name: "Tanár Úr" },
      }),
    );
    expect(await adLogin("t", "p")).toEqual({
      displayName: "t",
      class: "12A",
      isTeacher: true,
      fullName: "Tanár Úr",
    });
  });

  test("hiányzó adat: null mezők", async () => {
    serve(() => json({ ok: true }));
    expect(await adLogin("x", "y")).toEqual({
      displayName: "x",
      class: null,
      isTeacher: null,
      fullName: null,
    });
  });

  test("401: hibás jelszó", async () => {
    serve(() => new Response("", { status: 401 }));
    const err = await failure(() => adLogin("x", "y"));
    expect(err.invalidCredentials).toBe(true);
    expect(err.message).toBe("Hibás felhasználónév vagy jelszó.");
  });

  test("500: rendszerhiba, nem jelszóhiba", async () => {
    serve(() => new Response("", { status: 500 }));
    expect((await failure(() => adLogin("x", "y"))).invalidCredentials).toBe(
      false,
    );
  });

  test("a válasz `error` mezője a felületre kerül", async () => {
    serve(() => json({ error: "Zárolt fiók" }));
    const err = await failure(() => adLogin("x", "y"));
    expect(err.message).toBe("Zárolt fiók");
    expect(err.invalidCredentials).toBe(true);
  });

  test("értelmezhetetlen válasz és elérhetetlen rendszer", async () => {
    serve(() => new Response("<html>"));
    expect((await failure(() => adLogin("x", "y"))).message).toContain(
      "értelmezhető",
    );
    restore();
    serve(() => {
      throw new Error("offline");
    });
    const err = await failure(() => adLogin("x", "titok123"));
    expect(err.message).toContain("Nem sikerült elérni");
    //! A jelszó soha nem kerülhet a hibaüzenetbe.
    expect(err.message).not.toContain("titok123");
  });
});
