"use client";

import { ArrowLeft, Check, Fingerprint, Loader2, LogIn } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";
import { GoogleGlyph } from "@/components/google-glyph";
import { Button } from "@/components/ui/button";
import { GOOGLE_LINK_REASON } from "@/lib/ad-migration";
import {
  authClient,
  describeOAuthError,
  hasGoogleLinked,
  linkGoogleAccount,
  signInWithGoogle,
  signInWithSchool,
  useSession,
} from "@/lib/auth-client";

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
//!
//! ─── A GOOGLE-BELÉPÉS PRIMER, AZ AD-BELÉPÉS KIVEZETÉS ALATT ────────────────
//! Az iskolai AD-belépés megszűnőben van (lásd `/valtozasok`) — a Google-gomb
//! ezért áll FELÜL, az AD-űrlap pedig LEJJEBB, kisebb címmel. Az AD-belépés
//! FUNKCIONÁLISAN VÁLTOZATLAN marad, amíg a kivezetés véget nem ér: aki még
//! nem tud vagy nem akar Google-fiókkal belépni, azt a lap nem hagyja
//! ki ellátatlanul.

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
  const [googleBusy, setGoogleBusy] = useState(false);

  //* `null` = még nem tudjuk (a lekérdezés fut) — a link-gomb addig nem
  //* jelenik meg, nehogy egy pillanatra tévesen „nincs kötve" állapotot
  //* mutasson egy diáknak, akinek valójában már van Google-fiókja.
  const [linkedGoogle, setLinkedGoogle] = useState<boolean | null>(null);
  const [linkBusy, setLinkBusy] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);

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

  //! EGY GOOGLE-BELÉPÉSI/ÖSSZEKÖTÉSI HIBA NEM EZ A HÍVÁS ADJA VISSZA — A
  //! GOOGLE VISSZATÉRÉSE UTÁN, EGY MÁSIK KÉRÉSBEN DERÜL KI, ÉS EZ AZ URL-EN
  //! JELENIK MEG (lásd `auth-client.ts`, `describeOAuthError`). Ezért olvassuk
  //! a `useSearchParams`-ból, nem egy hívás visszatérési értékéből.
  const oauthError = describeOAuthError(
    params.get("error"),
    params.get("error_description"),
  );

  useEffect(() => {
    setPasskeySupported(
      typeof window !== "undefined" &&
        typeof window.PublicKeyCredential !== "undefined",
    );
  }, []);

  //* Csak bejelentkezve van értelme megkérdezni — kijelentkezve nincs mihez
  //* kötni a Google-fiókot.
  useEffect(() => {
    if (!session) {
      setLinkedGoogle(null);
      return;
    }
    let cancelled = false;
    void hasGoogleLinked().then((linked) => {
      if (!cancelled) setLinkedGoogle(linked);
    });
    return () => {
      cancelled = true;
    };
  }, [session]);

  if (isPending) {
    return <div className="h-56" aria-hidden />;
  }

  async function onLinkGoogle() {
    if (linkBusy) return;
    setLinkBusy(true);
    setLinkError(null);
    const result = await linkGoogleAccount(next);
    //* Sikeres ágon a böngésző elnavigál a Google felé — nincs mit tenni itt.
    if (!result.ok) {
      setLinkError(result.message);
      setLinkBusy(false);
    }
  }

  //* Már be van jelentkezve — nincs mit tenni ezen a lapon, azon túl, hogy
  //* felajánljuk a Google-fiók összekötését, ha még nincs meg.
  if (session) {
    return (
      <div className="flex flex-col gap-4">
        {oauthError ? <OAuthErrorBanner message={oauthError} /> : null}

        <p className="text-sm text-muted-strong">
          Be vagy jelentkezve mint{" "}
          <span className="font-medium text-foreground">
            {session.user.name}
          </span>
          {session.user.class ? ` — ${session.user.class}` : ""}. A beállításaid
          átjönnek a többi eszközödre.
        </p>

        {linkedGoogle === false ? (
          <div className="flex flex-col gap-2 rounded-md border border-border bg-muted/40 p-3">
            <p className="text-sm text-foreground">
              Kösd össze a Google-fiókoddal, hogy a leállás után is elérhető
              maradjon a fiókod.
            </p>
            <p className="text-xs text-muted-foreground">
              {GOOGLE_LINK_REASON}
            </p>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={linkBusy}
              onClick={() => void onLinkGoogle()}
              className="self-start"
            >
              {linkBusy ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <GoogleGlyph className="size-4" />
              )}
              Google-fiók összekötése
            </Button>
            {linkError ? (
              <p role="alert" className="text-xs text-destructive">
                {linkError}
              </p>
            ) : null}
          </div>
        ) : linkedGoogle === true ? (
          <p className="flex items-center gap-1.5 text-sm text-muted-strong">
            <Check className="size-4 shrink-0 text-primary" aria-hidden /> A
            Google-fiókod össze van kötve.
          </p>
        ) : null}

        <Button asChild variant="secondary" className="self-start">
          <Link href="/orarend">
            <ArrowLeft className="size-4" aria-hidden />
            Vissza az órarendhez
          </Link>
        </Button>
      </div>
    );
  }

  async function onGoogleSignIn() {
    if (googleBusy) return;
    setGoogleBusy(true);
    const result = await signInWithGoogle(next);
    //* Sikeres ágon a böngésző elnavigál a Google felé — nincs mit tenni itt.
    //* Csak az AZONNALI hiba (pl. hálózat) kerül ide; a domain-elutasítás a
    //* Google visszatérése után, az URL-en jön (lásd `oauthError` fent).
    if (!result.ok) {
      setError(result.message);
      setGoogleBusy(false);
    }
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
      {oauthError ? <OAuthErrorBanner message={oauthError} /> : null}

      {/*//! ─── A GOOGLE-BELÉPÉS ─────────────────────────────────────────────
          //! ELSŐDLEGES GOMB, MERT EZ A CÉL ÁLLAPOT. A gomb Google saját
          //! márkairányelve szerinti (fehér alap, színes „G", szürke keret) —
          //! ez NEM ízlés kérdése, hanem az, hogy a diák a Google saját
          //! bejelentkezési felületét ismerje fel benne, ne egy tetszőleges
          //! gombot, ami épp a Google-höz visz. */}
      <div className="flex flex-col gap-2">
        <Button
          type="button"
          size="lg"
          variant="outline"
          disabled={googleBusy}
          onClick={() => void onGoogleSignIn()}
          className="justify-center gap-2.5 bg-background"
        >
          {googleBusy ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <GoogleGlyph className="size-4" />
          )}
          Belépés Google-fiókkal
        </Button>
        <p className="text-xs text-muted-foreground">
          Az iskolai Google-fiókoddal (@jedlik.eu vagy @students.jedlik.eu) —
          ugyanazzal, amivel a leveleidbe is belépsz.
        </p>
      </div>

      <div className="flex items-center gap-3" aria-hidden>
        <span className="h-px flex-1 bg-border" />
        <span className="text-xs text-muted-foreground">vagy</span>
        <span className="h-px flex-1 bg-border" />
      </div>

      {/*//! ─── AZ AD-BELÉPÉS — DEMOTÁLVA, DE VÁLTOZATLANUL MŰKÖDIK ──────────
          //! A kisebb cím és a figyelmeztető sor jelzi, hogy ez az út
          //! kivezetés alatt áll — DE az űrlap maga, a mögötte futó
          //! `/sign-in/jedlik` végpont és a jelszókezelés szabályai
          //! (lásd a fájl tetején) egy karakterrel sem változtak. */}
      <div className="flex flex-col gap-3">
        <div>
          <h2 className="text-sm font-medium text-muted-strong">
            Iskolai fiókkal
          </h2>
          <p className="text-xs text-muted-foreground">
            Ez a belépési mód hamarosan megszűnik — érdemes inkább a fenti
            Google-gombot használni.
          </p>
        </div>

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

          <Button
            type="submit"
            variant="secondary"
            disabled={busy}
            className="self-start"
          >
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
    </div>
  );
}

//* Egy hely a Google-belépés/összekötés hibájának megjelenítésére — mindkét
//* ág (bejelentkezve/kijelentkezve) ugyanazt a dobozt használja.
function OAuthErrorBanner({ message }: { message: string }) {
  return (
    <p
      role="alert"
      className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-foreground"
    >
      {message}
    </p>
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
