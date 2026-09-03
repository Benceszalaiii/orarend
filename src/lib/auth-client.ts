"use client";

import { passkeyClient } from "@better-auth/passkey/client";
import { createAuthClient } from "better-auth/react";
import type { auth } from "./auth";

//! A BÖNGÉSZŐ OLDALA. A `baseURL` szándékosan hiányzik: a kliens ilyenkor az
//! ÉPPEN betöltött oldal eredetét használja, ami pontosan az, amit akarunk —
//! így ugyanez a kód működik a fejlesztői gépen, a Vercel előnézeti címeken és
//! élesben is, külön env nélkül.
//!
//! Az `inferAdditionalFields` helyett a szerver típusát vesszük át (`typeof
//! auth`): így a `session.user.class` és a `session.user.isTeacher` a
//! kliensben is típusos, és egy sémaváltozás fordítási hibaként jön elő, nem
//! futásidejű `undefined`-ként.
export const authClient = createAuthClient<typeof auth>({
  plugins: [passkeyClient()],
});

export const { signOut, useSession } = authClient;

export type SignInResult =
  | { ok: true }
  //* A felületnek megmutatható, magyar üzenet. A szerver fogalmazza meg, mert
  //* csak ő tudja, az iskolai rendszer mit mondott (lásd `jedlik-ad.ts`).
  | { ok: false; message: string };

//! ─── A BELÉPÉS HÍVÁSA ───────────────────────────────────────────────────────
//! Egyetlen helyen, hogy a jelszó útja a kliensben is végigkövethető legyen: a
//! `password` az űrlapból jön, ebbe a hívásba megy, és sehol máshol nem
//! szerepel — nincs állapotba mentve, nincs naplózva, és a hívás után a
//! komponens is eldobja.
export async function signInWithSchool(input: {
  loginName: string;
  password: string;
  rememberMe?: boolean;
}): Promise<SignInResult> {
  const result = await authClient.signIn.jedlik({
    loginName: input.loginName,
    password: input.password,
    rememberMe: input.rememberMe ?? true,
  });

  if (result.error) {
    return {
      ok: false,
      //! HA NINCS ÜZENET, ÁLTALÁNOSAT MONDUNK — de sosem találgatunk arról,
      //! hogy létezik-e a felhasználó. A szerver is szándékosan ugyanazt
      //! válaszolja ismeretlen névre és rossz jelszóra.
      message:
        result.error.message ||
        "Nem sikerült a bejelentkezés. Ellenőrizd a felhasználóneved és a jelszavad.",
    };
  }

  return { ok: true };
}
