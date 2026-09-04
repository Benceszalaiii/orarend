"use client";

import { ArrowLeft, Fingerprint, Loader2, LogIn } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { authClient, signInWithSchool, useSession } from "@/lib/auth-client";

//! ─── A BELÉPŐ ŰRLAP ─────────────────────────────────────────────────────────
//! EZ AZ EGYETLEN HELY AZ EGÉSZ ALKALMAZÁSBAN, AHOL ISKOLAI JELSZÓT BEKÉRÜNK.
//! Nem felugró ablakban, nem beágyazott keretben, nem „erősítsd meg a jelszavad"
//! párbeszédben — egyetlen, saját címen elérhető lapon. Ennek nem esztétikai oka
//! van: ha a jelszókérés több helyen, változó környezetben bukkanna fel, azzal
//! azt tanítanánk a diákoknak, hogy az iskolai jelszó begépelése hétköznapi
//! dolog. Pont ezt a szokást használja ki egy adathalász lap.
//!
//! A JELSZÓ ÉLETE EBBEN A KOMPONENSBEN: egy `useState`-ben él, amíg az űrlap
//! nyitva van, elmegy a `signInWithSchool` hívásban, és a hívás után AZONNAL
//! töröljük. Nem naplózzuk, nem tesszük `localStorage`-ba, és nem kerül bele
//! semmilyen hibaüzenetbe.

export function SignInPanel() {
  const { data: session, isPending } = useSession();
  const params = useSearchParams();
  const router = useRouter();

  const [loginName, setLoginName] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [passkeySupported, setPasskeySupported] = useState(false);
  const [passkeyBusy, setPasskeyBusy] = useState(false);

  //! HOVA MEGYÜNK SIKER UTÁN — ÉS MIÉRT ELLENŐRIZZÜK. A cél a címsorból jön,
  //! tehát a támadó írja. Csak SAJÁT, abszolút útvonalat fogadunk el: a `//`
  //! kezdetű érték a böngészőnek már egy IDEGEN origin („protokoll-relatív"
  //! URL), és ezzel a lap nyílt átirányítóvá válna — pont az a fajta, amit egy
  //! adathalász link szeret felhasználni, mert a mi domainünkkel kezdődik.
  const rawNext = params.get("tovabb");
  const next =
    rawNext?.startsWith("/") && !rawNext.startsWith("//")
      ? rawNext
      : "/orarend";

  useEffect(() => {
    setPasskeySupported(
      typeof window !== "undefined" &&
        typeof window.PublicKeyCredential !== "undefined",
    );
  }, []);

  if (isPending) {
    return <div className="h-56" aria-hidden />;
  }

  //* Már be van jelentkezve — nincs mit tenni ezen a lapon.
  if (session) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted-strong">
          Be vagy jelentkezve mint{" "}
          <span className="font-medium text-foreground">
            {session.user.name}
          </span>
          {session.user.class ? ` — ${session.user.class}` : ""}. A beállításaid
          átjönnek a többi eszközödre.
        </p>
        <Button asChild variant="secondary" className="self-start">
          <Link href="/orarend">
            <ArrowLeft className="size-4" aria-hidden />
            Vissza az órarendhez
          </Link>
        </Button>
      </div>
    );
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);

    const result = await signInWithSchool({ loginName, password });

    //! A JELSZÓ AZONNAL TÖRLŐDIK, sikeres és sikertelen ágon egyaránt. Sikertelen
    //! belépés után a diák jellemzően csak elgépelte — az újragépelés ára jóval
    //! kisebb, mint hogy a jelszó ott maradjon a React állapotában, és vele a
    //! memóriában, egy hibajelentésben vagy egy nyitva felejtett fejlesztői
    //! eszközben.
    setPassword("");
    setBusy(false);

    if (!result.ok) {
      setError(result.message);
      return;
    }

    //* `refresh()` a `push()` mellé: a munkamenet süti most jött létre, és a
    //* szerverkomponenseknek újra kell futniuk, hogy lássák.
    router.push(next);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="loginName"
            className="text-sm font-medium text-foreground"
          >
            Iskolai felhasználónév
          </label>
          <input
            id="loginName"
            name="username"
            type="text"
            required
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            disabled={busy}
            value={loginName}
            onChange={(e) => setLoginName(e.target.value)}
            className="h-10 rounded-md border border-input bg-transparent px-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50 dark:bg-input/30"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="password"
            className="text-sm font-medium text-foreground"
          >
            Iskolai jelszó
          </label>
          {/*//! `type="password"` + `autoComplete="current-password"`: erről
              //! ismeri fel a jelszókezelő az űrlapot. Ez nem kényelmi apróság —
              //! egy jelszókezelőbe mentett bejegyzés a DOMAINHEZ kötődik, és egy
              //! hamis lapon a kezelő egyszerűen nem kínálja fel a jelszót. Sok
              //! diáknál ez az egyetlen jel, ami időben feltűnik. */}
          <input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
            disabled={busy}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="h-10 rounded-md border border-input bg-transparent px-3 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50 dark:bg-input/30"
          />
        </div>

        {error ? (
          //! A HIBAÜZENET A SZERVERÉ, ÉS SZÁNDÉKOSAN NEM RÉSZLETEZ. Nem árulja
          //! el, létezik-e a felhasználónév — különben ez az űrlap egy kényelmes
          //! névfelderítő eszköz lenne bárkinek.
          <p
            role="alert"
            className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-foreground"
          >
            {error}
          </p>
        ) : null}

        <Button type="submit" size="lg" disabled={busy} className="self-start">
          {busy ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <LogIn className="size-4" aria-hidden />
          )}
          {busy ? "Belépés…" : "Belépés"}
        </Button>
      </form>

      {passkeySupported ? (
        <div className="flex flex-col gap-1 border-t border-border pt-5">
          <button
            type="button"
            disabled={passkeyBusy || busy}
            onClick={() => {
              setPasskeyBusy(true);
              setError(null);
              void authClient.signIn
                .passkey()
                .then((result) => {
                  if (result?.error) {
                    //* A megszakítás nem hiba — csak nem történt semmi.
                    if (!isCancelled(result.error)) {
                      setError(
                        "Ezen az eszközön még nincs beállítva gyors belépés.",
                      );
                    }
                    return;
                  }
                  router.push(next);
                  router.refresh();
                })
                .finally(() => setPasskeyBusy(false));
            }}
            className="inline-flex items-center gap-1.5 self-start text-sm text-muted-strong underline underline-offset-4 transition-colors hover:text-foreground disabled:opacity-50 motion-reduce:transition-none"
          >
            {passkeyBusy ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Fingerprint className="size-4" aria-hidden />
            )}
            Belépés ujjlenyomattal
          </button>
          <p className="text-xs text-muted-foreground">
            Ha egyszer már beléptél itt, és beállítottad a gyors belépést, nem
            kell újra begépelned az iskolai jelszavad.
          </p>
        </div>
      ) : null}
    </div>
  );
}

//! A HIBAOBJEKTUM ALAKJA KÉTFÉLE LEHET: a WebAuthn-oldali hibák `code`-ot is
//! hoznak, a hálózatiak csak üzenetet. A `code` létezését ezért ellenőrizni
//! kell, mielőtt olvasnánk — enélkül futásidőben egy hálózati hibát
//! „megszakításnak" néznénk, és némán elnyelnénk.
function isCancelled(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "AUTH_CANCELLED"
  );
}
