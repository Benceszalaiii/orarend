"use client";

import { dashClient } from "@better-auth/infra/client";
import { passkeyClient } from "@better-auth/passkey/client";
import type { BetterAuthClientPlugin } from "better-auth/client";
import { inferAdditionalFields } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
//! CSAK TÍPUSKÉNT importáljuk. Az `auth.ts` és az `auth-jedlik.ts` is
//! `server-only`-val van jelölve — egy értékként behúzott import a
//! böngésző-csomagba rántaná a szerveroldali kódot (adatbázis-kliens, iskolai
//! jelszó-továbbítás), amit a Next helyesen hibával utasítana el. A
//! `import type` a fordításkor nyomtalanul eltűnik, tehát a kliens tudja a
//! VÉGPONT/MEZŐ ALAKJÁT anélkül, hogy a kódját megkapná.
import type { auth } from "./auth";
import type { jedlikAd } from "./auth-jedlik";

//! A BÖNGÉSZŐ OLDALA. A `baseURL` szándékosan hiányzik: a kliens ilyenkor az
//! ÉPPEN betöltött oldal eredetét használja, ami pontosan az, amit akarunk —
//! így ugyanez a kód működik a fejlesztői gépen, a Vercel előnézeti címeken és
//! élesben is, külön env nélkül.

//! ─── A SZERVER-BŐVÍTMÉNY KLIENS PÁRJA ───────────────────────────────────────
//! Ez a néhány sor nem működést ad, hanem TUDÁST: a `$InferServerPlugin`-en
//! keresztül a kliens megkapja a szerver bővítményének típusait. Ettől lesz
//! `authClient.signIn.jedlik(...)` típusos.
//!
//! A FELHASZNÁLÓ EXTRA MEZŐIT (`class`, `isTeacher`, `username`, …) EZ MÁR
//! NEM ADJA — azok mostantól a KÖZÖS `user.additionalFields`-ben élnek
//! (`auth.ts`), mert a Google-belépés is írja őket, nem csak ez a bővítmény.
//! Ezeket lentebb az `inferAdditionalFields<typeof auth>()` szerzi meg;
//! enélkül a `session.user.class` fordítási hiba lenne.
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

//! ─── A DASH KLIENS CSAK OLVAS, ÉS CSAK A SAJÁT NAPLÓT ───────────────────────
//! Két műveletet ad (`authClient.dash.getAuditLogs` és `getAllAuditLogs`),
//! mindkettő a munkamenettel megy, és a szerver a hívó SAJÁT sorait adja
//! vissza: idegen `userId` kérése `FORBIDDEN`. A `/dash/*` üzemeltetői
//! végpontokhoz (fiók létrehozása, jelszóállítás, megszemélyesítés) ez a
//! bővítmény nem ad hozzáférést — azok az infra által aláírt JWT-t követelnek,
//! ami böngészőben nincs (lásd `auth.ts`).
//!
//! AMIT SZÁNDÉKOSAN NEM HÚZUNK BE: ugyanennek a csomagnak van egy `sentinel`
//! kliense is, ami böngésző-ujjlenyomatot vesz (canvas-hash, hardver- és
//! betűkészlet-adatok). Egy iskolai órarendhez nincs rá szükség, és pont az
//! ellenkezője annak, amit ez az app a diákok adatairól vállal — ezért csak a
//! `dashClient` szerepel itt.
export const authClient = createAuthClient({
  plugins: [
    jedlikAdClient(),
    passkeyClient(),
    dashClient(),
    inferAdditionalFields<typeof auth>(),
  ],
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
    //* Az iskolai jelszóval már nem indítható új fiók (lásd
    //* `auth-jedlik.ts`) — a szerver üzenete elmondja, mit tegyen: meglévő
    //* fióknál a felhasználónevét ellenőrizze, egyébként a Google-gombot
    //* használja.
    case "AD_SIGNUP_DISABLED":
      //* Ezeket mi írtuk, magyarul, a diáknak szánva.
      return (
        error.message ||
        "Nem sikerült a bejelentkezés. Ellenőrizd a felhasználóneved és a jelszavad."
      );
    default:
      return "Nem sikerült a bejelentkezés. Próbáld újra pár perc múlva.";
  }
}

//! ═══════════════════════════════════════════════════════════════════════════
//! A GOOGLE-BELÉPÉS — KÉT KÜLÖNBÖZŐ HIBAÚT
//! ═══════════════════════════════════════════════════════════════════════════
//! Az OAuth-belépésnek KÉT olyan pontja van, ahol elromolhat, és ezek NEM egy
//! hívás két ága, hanem két KÜLÖN kérés-válasz, a kettő között egy teljes
//! kiugrással a Google oldalára:
//!
//!   1. AZ ÁTIRÁNYÍTÁS INDÍTÁSA (`signIn.social`, lent). Ha ez elhasal —
//!      tipikusan hálózati hiba —, a hívás egyáltalán nem navigál el, és a
//!      hibát a visszatérési értéke hordozza. Ez a `describeSignInError`
//!      ugyanazon ágát használja, mint az AD-belépés.
//!
//!   2. A GOOGLE VISSZATÉRÉSE UTÁNI ELLENŐRZÉS (`validateUserInfo`, `auth.ts`).
//!      Ez a szerveren, egy MÁSIK kérésben (`/api/auth/callback/google`) fut
//!      le, jóval azután, hogy ez a hívás már visszatért — az eredménye ezért
//!      nem itt, hanem a `/belepes` URL-jén jelenik meg
//!      (`?error=…&error_description=…`, lásd `auth.ts`, `onAPIError`). Ezt
//!      a `describeOAuthError` olvassa ki, a `SignInPanel` a `useSearchParams`
//!      hívásában.
//! ═══════════════════════════════════════════════════════════════════════════

//* Ugyanaz az üzenet két helyen kellhet (a domain-ellenőrzés saját kódja ÉS a
//* Google „nincs Workspace-domain" válasza), ezért egy konstans.
const SCHOOL_ACCOUNT_REQUIRED_MESSAGE =
  "Csak iskolai Google-fiókkal (@jedlik.eu vagy @students.jedlik.eu) lehet belépni.";

//! A HIBA VISSZAADÁSÁRA UGYANAZ AZ ALAK, MINT AZ AD-BELÉPÉSNÉL (`SignInResult`)
//! — a `SignInPanel`-nek nem kell tudnia, melyik szolgáltatóval próbálkozott.
export async function signInWithGoogle(next: string): Promise<SignInResult> {
  const result = await authClient.signIn.social({
    provider: "google",
    callbackURL: next,
    //! MINDIG `/belepes`, FÜGGETLENÜL A `next`-TŐL. A hiba (rossz domain,
    //! megszakított beleegyezés) pont azon az egy lapon magyarázható el,
    //! amelyik egyáltalán tud a Google-belépésről — lásd `auth.ts`,
    //! `onAPIError`. Sikeres ágon a `next` külön úton, a `callbackURL`-lel jut
    //! érvényre.
    errorCallbackURL: "/belepes",
  });

  if (result.error) {
    return { ok: false, message: describeSignInError(result.error) };
  }

  return { ok: true };
}

//! A `code` és a hozzá tartozó `description` a `/belepes` URL-jéből jön
//! (`?error=…&error_description=…`) — lásd a fenti blokk 2. pontját.
export function describeOAuthError(
  code: string | null,
  description: string | null,
): string | null {
  if (!code) return null;

  //! A `NOT_SCHOOL_ACCOUNT` A MI SAJÁT KÓDUNK (`auth.ts`, `validateUserInfo`)
  //! — az odaírt `description` már magyarul, a diáknak szánva érkezik, azt
  //! mutatjuk. MINDEN MÁS kód a Better Auth vagy a Google belső szövegét
  //! hordozná; azt — ugyanazon elv szerint, mint fent a `describeSignInError`
  //! — NEM írjuk ki nyersen, helyette egy általunk fogalmazott üzenet jön.
  if (code === "NOT_SCHOOL_ACCOUNT") {
    return description || SCHOOL_ACCOUNT_REQUIRED_MESSAGE;
  }

  switch (code.toLowerCase()) {
    case "unable_to_get_user_info":
      //* Ez akkor jön, ha a Google-fiók semmilyen Workspace-domainhez nem
      //* tartozik (a `hd` igazolt mező hiányzik a válaszból) — tipikusan egy
      //* személyes @gmail.com cím. Lásd `auth.ts`, `socialProviders.google`,
      //* `hd: "*"`.
      return SCHOOL_ACCOUNT_REQUIRED_MESSAGE;
    case "access_denied":
      return "Megszakítottad a Google-bejelentkezést.";
    case "account_already_linked_to_different_user":
      return "Ez a Google-fiók már egy másik órarend-fiókhoz van kötve.";
    default:
      return "Nem sikerült a Google-bejelentkezés. Próbáld újra pár perc múlva.";
  }
}

//! ═══════════════════════════════════════════════════════════════════════════
//! GOOGLE-FIÓK ÖSSZEKÖTÉSE EGY MÁR BEJELENTKEZETT FIÓKHOZ
//! ═══════════════════════════════════════════════════════════════════════════
//! EZ NEM BELÉPÉS. A `linkSocial` a JELENLEGI munkamenet felhasználójához köt
//! egy Google-fiókot — jellemzően egy AD-fiókról indul, hogy a diák a leállás
//! után se veszítse el a fiókját. Lásd `auth.ts`, `account.accountLinking`.
//! ═══════════════════════════════════════════════════════════════════════════

export async function linkGoogleAccount(
  returnTo: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const result = await authClient.linkSocial({
    provider: "google",
    callbackURL: returnTo,
    //* Lásd `signInWithGoogle` fenti megjegyzését: a hiba a `/belepes`
    //* URL-jén jelenik meg, a `next`-től függetlenül.
    errorCallbackURL: "/belepes",
  });

  if (result.error) {
    return {
      ok: false,
      message: "Nem sikerült az összekötés. Próbáld újra pár perc múlva.",
    };
  }

  return { ok: true };
}

//! `null` = még nem tudjuk (a lekérdezés folyamatban van, vagy elhasalt) — a
//! hívó ilyenkor nem dönt, amíg nincs válasz, nehogy hamisan „nincs kötve"
//! állapotot mutasson egy diáknak, akinek valójában már van Google-fiókja.
export async function hasGoogleLinked(): Promise<boolean | null> {
  const result = await authClient.listAccounts();
  if (result.error || !result.data) return null;
  return result.data.some((account) => account.providerId === "google");
}
