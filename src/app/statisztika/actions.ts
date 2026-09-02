"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  createSessionToken,
  passwordMatches,
  SESSION_SECONDS,
  STATS_COOKIE,
  statsAuthConfigured,
} from "@/lib/stats-auth";

export type LoginState = { error?: string };

//! A SERVER ACTION NYILVÁNOS VÉGPONT. Bárki POST-olhat rá, aki ismeri az
//! azonosítóját — tehát itt a jelszó ellenőrzése nem formalitás, hanem AZ
//! egyetlen kapu. Semmit nem feltételezünk arról, honnan jött a hívás.
export async function login(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  if (!statsAuthConfigured()) {
    return { error: "A statisztika nincs beállítva (hiányzik a STATS_KEY)." };
  }

  const password = formData.get("password");
  if (typeof password !== "string" || password.length === 0) {
    return { error: "Add meg a jelszót." };
  }

  if (!(await passwordMatches(password))) {
    //! LASSÍTÁS ROSSZ JELSZÓRA. Nem véd elszánt támadó ellen, de a vak
    //! próbálgatást használhatatlanul lassúvá teszi. A valódi védelem az, hogy
    //! a `STATS_KEY` hosszú és véletlenszerű — ezt a README is kimondja.
    await new Promise((resolve) => setTimeout(resolve, 700));
    return { error: "Hibás jelszó." };
  }

  const token = await createSessionToken();
  if (!token) {
    return { error: "A munkamenet nem hozható létre." };
  }

  const store = await cookies();
  store.set(STATS_COOKIE, token, {
    httpOnly: true,
    //! `secure` élesben KÖTELEZŐ, fejlesztéskor viszont a http://localhost
    //! kiütné a sütit — ezért a környezethez kötjük, nem fixáljuk.
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/statisztika",
    maxAge: SESSION_SECONDS,
  });

  redirect("/statisztika");
}

export async function logout(): Promise<void> {
  const store = await cookies();
  store.delete({ name: STATS_COOKIE, path: "/statisztika" });
  redirect("/statisztika");
}
