import { describe, expect, test } from "bun:test";
import { describeOAuthError } from "./auth-client";

const SCHOOL_ONLY =
  "Csak iskolai Google-fiókkal (@jedlik.eu vagy @students.jedlik.eu) lehet belépni.";

describe("describeOAuthError", () => {
  test("nincs hibakód: nincs üzenet", () => {
    expect(describeOAuthError(null, "bármi")).toBeNull();
    expect(describeOAuthError("", null)).toBeNull();
  });

  test("a saját kódunk leírása a diáknak szól — azt mutatjuk", () => {
    expect(
      describeOAuthError("NOT_SCHOOL_ACCOUNT", "Ez egy személyes fiók."),
    ).toBe("Ez egy személyes fiók.");
    expect(describeOAuthError("NOT_SCHOOL_ACCOUNT", null)).toBe(SCHOOL_ONLY);
  });

  test("ismert kódok saját szöveggel, kisbetű-függetlenül", () => {
    expect(describeOAuthError("unable_to_get_user_info", null)).toBe(
      SCHOOL_ONLY,
    );
    expect(describeOAuthError("ACCESS_DENIED", null)).toBe(
      "Megszakítottad a Google-bejelentkezést.",
    );
    expect(
      describeOAuthError("account_already_linked_to_different_user", null),
    ).toContain("másik órarend-fiókhoz");
  });

  //! A Better Auth / Google belső szövege soha nem kerül ki nyersen.
  test("ismeretlen kód: általános üzenet, a leírás NEM szivárog ki", () => {
    const message = describeOAuthError(
      "internal_server_error",
      "Prisma P2002 unique constraint on user.email",
    );
    expect(message).toBe(
      "Nem sikerült a Google-bejelentkezés. Próbáld újra pár perc múlva.",
    );
    expect(message).not.toContain("Prisma");
  });
});
