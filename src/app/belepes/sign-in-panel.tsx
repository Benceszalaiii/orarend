"use client";

import {
  ArrowLeft,
  Check,
  ChevronDown,
  Fingerprint,
  Loader2,
  LogIn,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";
import { GoogleGlyph } from "@/components/google-glyph";
import { Button } from "@/components/ui/button";
import {
  authClient,
  describeOAuthError,
  hasGoogleLinked,
  linkGoogleAccount,
  signInWithGoogle,
  signInWithSchool,
  useSession,
} from "@/lib/auth-client";
import { cn } from "@/lib/utils";

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
//! Az iskolai AD-belépés megszűnőben van (lásd `/valtozasok`), és a lap ezt a
//! SÚLYOZÁSSAL mondja el, nem tiltással: a Google-gomb áll felül, az AD-űrlap
//! pedig ÖSSZECSUKVA, egy nyitómondat mögött. Így a lap alapértelmezésben
//! egyetlen belépési módot kínál — de az AD-belépés FUNKCIONÁLISAN
//! VÁLTOZATLAN marad, amíg a kivezetés véget nem ér: aki még nem tud vagy nem
//! akar Google-fiókkal belépni, egy koppintással megkapja a régi űrlapot.

export function SignInPanel() {
  const { data: session, isPending } = useSession();
  const params = useSearchParams();
  const router = useRouter();

  const [loginName, setLoginName] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  //* Két külön hibacsatorna, mert a két belépési mód KÜLÖN HELYEN jelenik meg:
  //* a Google/ujjlenyomat hibája felül, mindig látható dobozban; az AD-űrlapé
  //* az űrlap mellett, ami össze van csukva. Egyetlen közös állapottal egy
  //* Google-hiba a becsukott szakaszba esne, és a diák NEM LÁTNÁ, miért nem
  //* történt semmi.
  const [error, setError] = useState<string | null>(null);
  const [schoolError, setSchoolError] = useState<string | null>(null);
  //! AZ AD-ŰRLAP ALAPÉRTELMEZÉSBEN ÖSSZECSUKVA. Ez a kivezetés harmadik
  //* szakasza: aki keresi, egy koppintással megkapja; aki nem, annak a lap
  //* egyetlen belépési módot mutat. Az űrlap a DOM-ban marad (csak rejtve),
  //* hogy a kitöltött mezők ne vesszenek el nyitogatás közben.
  const [schoolOpen, setSchoolOpen] = useState(false);
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
          {session.user.class ? ` — ${session.user.class}` : ""}.
        </p>

        {linkedGoogle === false ? (
          <div className="flex flex-col gap-2 rounded-md border border-border bg-muted/40 p-3">
            <p className="text-sm text-foreground">
              Kösd össze a Google-fiókoddal, hogy a leállás után is elérhető
              maradjon a fiókod.
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
    setSchoolError(null);

    const result = await signInWithSchool({ loginName, password });

    //! A JELSZÓ AZONNAL TÖRLŐDIK, sikeres és sikertelen ágon egyaránt. Sikertelen
    //! belépés után a diák jellemzően csak elgépelte — az újragépelés ára jóval
    //! kisebb, mint hogy a jelszó ott maradjon a React állapotában, és vele a
    //! memóriában, egy hibajelentésben vagy egy nyitva felejtett fejlesztői
    //! eszközben.
    setPassword("");
    setBusy(false);

    if (!result.ok) {
      setSchoolError(result.message);
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
      {error ? <OAuthErrorBanner message={error} /> : null}

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
          @jedlik.eu vagy @students.jedlik.eu
        </p>
      </div>

      {/*//! ─── GYORS BELÉPÉS — NEM AZ AD-HOZ TARTOZIK ──────────────────────
          //! A HELYE SZÁNDÉKOSAN ITT VAN, a Google-gomb alatt és az összecsukott
          //! AD-szakaszon KÍVÜL. Az ujjlenyomatos belépés magához a FIÓKHOZ
          //! tartozik, nem ahhoz, ahogy azt a fiókot először létrehozták: aki
          //! Google-lel lépett be és beállította, annak is ez a leggyorsabb út.
          //! Ha a kivezetés alatt álló AD-szakaszba zárnánk, együtt tűnne el
          //! vele — és pont azoktól, akiknek a legkevesebb dolguk lenne. */}
      {passkeySupported ? (
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
      ) : null}

      {/*//! ─── AZ AD-BELÉPÉS — ÖSSZECSUKVA, EGY MONDAT MÖGÉ REJTVE ──────────
          //! A KIVEZETÉS HARMADIK SZAKASZA. Elsőre a Google-gomb volt felül
          //! (primer/szekunder), másodikra a mögötte futó végpont utasította el
          //! az ÚJ fiókokat — most maga az űrlap kerül egy nyitógomb mögé.
          //!
          //! AMI NEM VÁLTOZIK: az űrlap működése, a jelszókezelés szabályai
          //! (lásd a fájl tetején), és hogy aki már belépett vele, továbbra is
          //! be tud lépni. Egy koppintás, nem egy elvett lehetőség — a rejtés
          //! az ALAPÉRTELMEZÉST tolja a Google felé, nem a választást veszi el.
          //!
          //! A GOMB MONDATA A DÖNTÉST MONDJA KI, NEM A TECHNIKÁT („AD-belépés",
          //! „LDAP") — a diák nem azt tudja magáról, hogy melyik címtárban van
          //! a fiókja, hanem azt, hogy van-e Google-fiókja vagy nincs.
          //!
          //! A SZAKASZ A DOM-BAN MARAD, CSAK REJTVE (`hidden`), hogy a félig
          //! kitöltött mezők túléljék a becsukást — és hogy a böngésző
          //! oldalon-belüli keresése („iskolai jelszó") is megtalálja. */}
      <div className="flex flex-col gap-4 border-t border-border pt-5">
        <button
          type="button"
          aria-expanded={schoolOpen}
          aria-controls="iskolai-belepes"
          onClick={() => setSchoolOpen((open) => !open)}
          className="inline-flex items-center gap-1.5 self-start text-sm text-muted-foreground transition-colors hover:text-foreground motion-reduce:transition-none"
        >
          <ChevronDown
            className={cn(
              "size-4 transition-transform motion-reduce:transition-none",
              schoolOpen && "rotate-180",
            )}
            aria-hidden
          />
          Nincs Google-fiókod? Belépés iskolai jelszóval
        </button>

        <div
          id="iskolai-belepes"
          className={cn("flex-col gap-4", schoolOpen ? "flex" : "hidden")}
        >
          <p className="text-xs text-muted-foreground">
            Az iskolai jelszavas belépés megszűnőben van — csak azzal a fiókkal
            működik, amelyik korábban már belépett itt. Ha most lépnél be
            először, a Google-gombot használd.{" "}
            <Link
              href="/valtozasok"
              className="underline underline-offset-2 hover:text-foreground"
            >
              Mi változik?
            </Link>
          </p>

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

            {schoolError ? (
              //! A HIBAÜZENET A SZERVERÉ, ÉS SZÁNDÉKOSAN NEM RÉSZLETEZ. Nem árulja
              //! el, létezik-e a felhasználónév — különben ez az űrlap egy kényelmes
              //! névfelderítő eszköz lenne bárkinek.
              <p
                role="alert"
                className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-foreground"
              >
                {schoolError}
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
        </div>
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
