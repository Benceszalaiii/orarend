"use client";

import { ArrowLeft, Fingerprint, LogIn } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { authClient, signInWithSchool, useSession } from "@/lib/auth-client";

//! ─── A BELÉPŐ LAP ───────────────────────────────────────────────────────────
//! Ez a lap NEM a bejáratunk. A diákok többsége soha nem jut el ide: a sávban
//! ülő gombról egyenesen a Microsofthoz megy, és onnan vissza az órarendhez.
//! Ez a lap két dologra kell:
//!   1. ide esik ki a hibás belépés (`errorCallbackURL`), hogy a diák ne egy
//!      nyers hibaoldalon kössön ki,
//!   2. itt fér el a magyarázat: mit ad a belépés, és mit NEM kérünk el.
//!
//! AMIT KI KELL MONDANI, MERT KÜLÖNBEN JOGGAL GYANAKSZANAK: az oldal nem az
//! iskoláé. Ha egy nem hivatalos lap iskolai belépést kínál, a helyes reakció a
//! gyanakvás — ezért írjuk le, hogy a jelszó a Microsoft oldalán marad, és hogy
//! mit látunk belőle utána.

export function SignInPanel() {
  const { data: session, isPending } = useSession();
  const params = useSearchParams();
  const [busy, setBusy] = useState(false);
  const [passkeyBusy, setPasskeyBusy] = useState(false);
  const [passkeyError, setPasskeyError] = useState<string | null>(null);
  const [passkeySupported, setPasskeySupported] = useState(false);

  const failed = params.get("hiba") === "1";

  useEffect(() => {
    setPasskeySupported(
      typeof window !== "undefined" &&
        typeof window.PublicKeyCredential !== "undefined",
    );
  }, []);

  if (isPending) {
    return <div className="h-40" aria-hidden />;
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
          . A beállításaid mostantól átjönnek a többi eszközödre.
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


  return (
    <div className="flex flex-col gap-5">
      {failed ? (
        //! A HIBAÜZENET NEM TALÁLGAT. Nem tudjuk, MIÉRT bukott el a belépés (a
        //! Microsoft nem mondja meg részletesen, és jól teszi) — a leggyakoribb
        //! ok viszont az, hogy nem iskolai fiókkal próbálkoztak. Ezt mondjuk ki,
        //! egyetlen mondatban, anélkül hogy hibásnak állítanánk be a diákot.
        <p
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-foreground"
        >
          A bejelentkezés nem sikerült. Ellenőrizd, hogy az{" "}
          <span className="font-medium">iskolai</span> fiókodat használod-e —
          más Microsoft-fiókkal nem lehet belépni.
        </p>
      ) : null}

      <Button
        type="button"
        size="lg"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          void signInWithSchool("/orarend").finally(() => setBusy(false));
        }}
        className="self-start"
      >
        <LogIn className="size-4" aria-hidden />
        Belépés az iskolai fiókkal
      </Button>

      {passkeySupported ? (
        <div className="flex flex-col gap-1">
          <button
            type="button"
            disabled={passkeyBusy}
            onClick={() => {
              setPasskeyBusy(true);
              setPasskeyError(null);
              void authClient.signIn
                .passkey()
                .then((result) => {
                  if (result?.error) {
                    //* A megszakítás nem hiba — csak nem történt semmi.
                    if (!isCancelled(result.error)) {
                      setPasskeyError(
                        "Ezen az eszközön még nincs beállítva gyors belépés.",
                      );
                    }
                    return;
                  }
                  window.location.href = "/orarend";
                })
                .finally(() => setPasskeyBusy(false));
            }}
            className="inline-flex items-center gap-1.5 self-start text-sm text-muted-strong underline underline-offset-4 transition-colors hover:text-foreground disabled:opacity-50 motion-reduce:transition-none"
          >
            <Fingerprint className="size-4" aria-hidden />
            Belépés ujjlenyomattal
          </button>
          {passkeyError ? (
            <p className="text-xs text-muted-foreground">{passkeyError}</p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Csak akkor működik, ha egyszer már bejelentkeztél itt az iskolai
              fiókoddal, és beállítottad.
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}

//! A HIBAOBJEKTUM ALAKJA KÉTFÉLE LEHET: a WebAuthn-oldali hibák `code`-ot is
//! hoznak, a hálózatiak csak üzenetet. A `code` létezését ezért ellenőrizni
//! kell, mielőtt olvasnánk — enélkül a fordító joggal tiltakozik, és futásidőben
//! egy hálózati hibát „megszakításnak" néznénk.
function isCancelled(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "AUTH_CANCELLED"
  );
}
