"use client";

import { passkeyClient } from "@better-auth/passkey/client";
import type { BetterAuthClientPlugin } from "better-auth/client";
import { createAuthClient } from "better-auth/react";
//! CSAK TÍPUSKÉNT importáljuk. Az `auth-jedlik.ts` `server-only`-val van
//! jelölve — egy értékként behúzott import a böngésző-csomagba rántaná a
//! szerveroldali kódot (és vele a `jedlik-ad.ts`-t), amit a Next helyesen
//! hibával utasítana el. A `import type` a fordításkor nyomtalanul eltűnik,
//! tehát a kliens tudja a VÉGPONT ALAKJÁT anélkül, hogy a kódját megkapná.
import type { jedlikAd } from "./auth-jedlik";

//! A BÖNGÉSZŐ OLDALA. A `baseURL` szándékosan hiányzik: a kliens ilyenkor az
//! ÉPPEN betöltött oldal eredetét használja, ami pontosan az, amit akarunk —
//! így ugyanez a kód működik a fejlesztői gépen, a Vercel előnézeti címeken és
//! élesben is, külön env nélkül.

//! ─── A SZERVER-BŐVÍTMÉNY KLIENS PÁRJA ───────────────────────────────────────
//! Ez a néhány sor nem működést ad, hanem TUDÁST: a `$InferServerPlugin`-en
//! keresztül a kliens megkapja a szerver bővítményének típusait. Ettől lesz
//! `authClient.signIn.jedlik(...)` típusos, és ettől ismeri a kliens a
//! bővítmény által a felhasználóhoz adott mezőket is (`class`, `isTeacher`,
//! `username`) — enélkül a `session.user.class` fordítási hiba lenne.
//!
//! Az `atomListeners` azt mondja meg, hogy sikeres belépés után a munkamenetet
//! újra le kell kérni. Enélkül a felület a belépés után is „kijelentkezve"
//! állapotot mutatna, amíg a lap újra nem töltődik.
const jedlikAdClient = () =>
  ({
    id: "jedlik-ad",
    $InferServerPlugin: {} as ReturnType<typeof jedlikAd>,
    atomListeners: [
      {
        matcher: (path: string) => path === "/sign-in/jedlik",
        signal: "$sessionSignal",
      },
    ],
  }) satisfies BetterAuthClientPlugin;

export const authClient = createAuthClient({
  plugins: [jedlikAdClient(), passkeyClient()],
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
    return { ok: false, message: describeSignInError(result.error) };
  }

  return { ok: true };
}

//! ─── A HIBAÜZENET NEM A SZERVER NYERS SZÖVEGE ───────────────────────────────
//! Csak azokat az üzeneteket engedjük a felhasználó elé, amelyeket MI
//! fogalmaztunk (`auth-jedlik.ts`). Minden más — a Better Auth belső hibái, a
//! hálózati hibák, a keretrendszer angol szövegei — általános magyar mondatot
//! kap.
//!
//! MIÉRT: egy nyers belső üzenet („Invalid origin", „Failed to create session")
//! a diáknak semmit nem mond, viszont a rendszer belső működéséről árul el
//! részleteket. Ráadásul angolul jelenne meg egy végig magyar felületen, ami
//! önmagában is gyanút kelt — pont ott, ahol a bizalom a legfontosabb.
function describeSignInError(error: {
  code?: string;
  message?: string;
  status?: number;
}): string {
  //! A TÚL SOK PRÓBÁLKOZÁS SAJÁT ÜZENETET ÉRDEMEL. Ez a leggyakoribb eset,
  //! amikor a diák nem hibázott, csak elfogyott a keret (és mivel az iskola egy
  //! közös NAT-IP mögül jön, ez ártatlanul is előfordulhat). Ha ilyenkor
  //! „hibás jelszót" írnánk ki, a diák a jelszavát kezdené újra és újra
  //! begépelni — pont a legrosszabb reakció.
  if (error.status === 429) {
    return "Túl sok próbálkozás. Várj pár percet, aztán próbáld újra.";
  }

  switch (error.code) {
    case "INVALID_CREDENTIALS":
    case "INVALID_LOGIN_NAME":
    case "SCHOOL_SYSTEM_UNAVAILABLE":
    case "ORPHANED_ACCOUNT":
      //* Ezeket mi írtuk, magyarul, a diáknak szánva.
      return (
        error.message ||
        "Nem sikerült a bejelentkezés. Ellenőrizd a felhasználóneved és a jelszavad."
      );
    default:
      return "Nem sikerült a bejelentkezés. Próbáld újra pár perc múlva.";
  }
}
