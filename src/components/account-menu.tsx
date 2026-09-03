"use client";

import { Check, Fingerprint, LogOut, RefreshCw, User } from "lucide-react";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  authClient,
  signInWithSchool,
  signOut,
  useSession,
} from "@/lib/auth-client";
import { forgetSyncState } from "@/lib/prefs-sync";
import { cn } from "@/lib/utils";

//! ═══════════════════════════════════════════════════════════════════════════
//! A FIÓK — EGY GOMB A SÁVBAN
//! ═══════════════════════════════════════════════════════════════════════════
//! EZ A LEGKISEBB VEZÉRLŐ A LAPON, ÉS EZ SZÁNDÉKOS. Az oldal nem fiókos
//! szolgáltatás: az órarendhez semmi köze a belépésnek. Aki nem akar
//! bejelentkezni, annak ez a gomb legyen könnyen figyelmen kívül hagyható —
//! ezért nincs se felugró ablak, se „hozz létre fiókot" felhívás, se piros
//! pötty. Egy ikon, ami elmondja, mit ad, ha megnyomják.
//!
//! MIT MOND A GOMB: nem azt, hogy „Bejelentkezés" (arra a kérdésre, hogy
//! „minek?", nem válaszol), hanem azt, hogy a beállítások átjönnek a másik
//! készülékre. A belépés itt eszköz, nem cél.
//! ═══════════════════════════════════════════════════════════════════════════

export function AccountMenu({ className }: { className?: string }) {
  const { data: session, isPending } = useSession();
  const pathname = usePathname();
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  //! A BETÖLTÉS ALATT SEM UGRÁL A SÁV. A munkamenet lekérdezése egy hálózati
  //! kör; amíg tart, ugyanakkora helyet foglalunk, mint utána. Enélkül a
  //! mellette álló vezérlők elcsúsznának, amikor a válasz megjön.
  if (isPending) {
    return <div className={cn("size-9 shrink-0", className)} aria-hidden />;
  }

  return session ? (
    <SignedIn
      className={className}
      name={session.user.name}
      email={session.user.email}
      image={session.user.image}
      open={open}
      onOpenChange={setOpen}
      busy={busy}
      setBusy={setBusy}
    />
  ) : (
    <SignedOut
      className={className}
      busy={busy}
      onSignIn={() => {
        setBusy(true);
        //! ODA TÉRÜNK VISSZA, AHONNAN ELINDULT. A belépés nem egy külön
        //! „állomás", amin át kell menni — a diák ugyanazt a lapot kapja
        //! vissza, amit nézett, csak már a saját beállításaival.
        void signInWithSchool(pathname || "/orarend").finally(() =>
          setBusy(false),
        );
      }}
    />
  );
}

function SignedOut({
  className,
  busy,
  onSignIn,
}: {
  className?: string;
  busy: boolean;
  onSignIn: () => void;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      disabled={busy}
      onClick={onSignIn}
      className={cn("h-9 shrink-0 touch-target gap-1.5 px-2.5", className)}
      title="Belépés az iskolai fiókkal — a beállításaid átjönnek a többi eszközödre"
    >
      <User className="size-4" aria-hidden />
      <span className="text-xs font-medium max-sm:sr-only">Belépés</span>
    </Button>
  );
}

function SignedIn({
  className,
  name,
  email,
  image,
  open,
  onOpenChange,
  busy,
  setBusy,
}: {
  className?: string;
  name: string;
  email: string;
  image?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  busy: boolean;
  setBusy: (busy: boolean) => void;
}) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex size-9 shrink-0 touch-target items-center justify-center rounded-full border border-input text-xs font-semibold text-muted-strong transition-colors",
            "hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none",
            "dark:bg-input/30",
            className,
          )}
          title={`Bejelentkezve: ${name}`}
        >
          {/*//! A KÉPET NEM ERŐLTETJÜK. Az iskolai fiókok többségének nincs
              //! profilképe, és egy törött kép rosszabb, mint a monogram. A
              //! `next/image` itt szándékosan nem szerepel: külső, változó
              //! forrásról van szó, amihez tartomány-engedélyezés kellene. */}
          {image ? (
            // biome-ignore lint/performance/noImgElement: külső, nem optimalizálható profilkép
            <img
              src={image}
              alt=""
              className="size-full rounded-full object-cover"
            />
          ) : (
            <span aria-hidden>{initials(name)}</span>
          )}
          <span className="sr-only">Fiók: {name}</span>
        </button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-64 p-0">
        <div className="flex flex-col gap-0.5 border-b border-border px-3 py-2.5">
          <p className="truncate text-sm font-medium text-foreground">{name}</p>
          <p className="truncate text-xs text-muted-foreground">{email}</p>
        </div>

        <div className="flex flex-col p-1">
          <PasskeyRow busy={busy} setBusy={setBusy} />

          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void signOut().finally(() => {
                //! A KIJELENTKEZÉS NEM TÖRLI A BEÁLLÍTÁSOKAT. Csak azt a
                //! jelölőt dobjuk el, ami a szerver verziójára mutat — a diák
                //! osztálya és csoportbontásai maradnak ezen a gépen, pont
                //! ahogy egy soha be nem jelentkezett látogatónál.
                forgetSyncState();
                setBusy(false);
                onOpenChange(false);
              });
            }}
            className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm text-muted-strong transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50 motion-reduce:transition-none"
          >
            <LogOut className="size-4 shrink-0" aria-hidden />
            Kijelentkezés
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

//! ─── PASSKEY FELVÉTELE ──────────────────────────────────────────────────────
//! A passkey NEM a bejárat, hanem a rövidebb út: csak bejelentkezett
//! felhasználó veheti fel, tehát az iskolai fiók marad az egyetlen módja annak,
//! hogy valaki egyáltalán bekerüljön. Cserébe legközelebb nem kell végigmennie
//! a Microsoft-átirányításon — egy ujjlenyomat elég.
function PasskeyRow({
  busy,
  setBusy,
}: {
  busy: boolean;
  setBusy: (busy: boolean) => void;
}) {
  const [supported, setSupported] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  //! A TÁMOGATÁST FUTÁSIDŐBEN KÉRDEZZÜK, NEM FELTÉTELEZZÜK. A WebAuthn API a
  //! szerveren nem létezik, régi böngészőkben és nem biztonságos eredeten
  //! (http, localhoston kívül) sem — egy nem működő gombot pedig ne kínáljunk.
  useEffect(() => {
    setSupported(
      typeof window !== "undefined" &&
        typeof window.PublicKeyCredential !== "undefined",
    );
  }, []);

  const add = useCallback(async () => {
    setBusy(true);
    setError(null);
    const result = await authClient.passkey.addPasskey({
      //* A név a listában segít megkülönböztetni az eszközöket, ha egyszer
      //* lesz passkey-kezelő felület. Amíg nincs, is jobb, mint az üres.
      name: deviceLabel(),
    });
    setBusy(false);
    //! A MEGSZAKÍTÁS NEM HIBA. Ha a diák elüti a rendszer párbeszédét, azt nem
    //! kell pirosan visszajelezni — csak nem történt semmi.
    if (result?.error) {
      //! A HIBAOBJEKTUM ALAKJA KÉTFÉLE LEHET: a WebAuthn-oldali hibák `code`-ot
      //! is hoznak, a hálózatiak csak üzenetet — a `code` létezését ezért
      //! ellenőrizni kell, mielőtt olvasnánk.
      const code = "code" in result.error ? result.error.code : undefined;
      if (code === "AUTH_CANCELLED") return;
      setError("Nem sikerült felvenni. Próbáld újra.");
      return;
    }
    setDone(true);
  }, [setBusy]);

  if (!supported) return null;

  return (
    <div className="flex flex-col">
      <button
        type="button"
        disabled={busy || done}
        onClick={() => void add()}
        className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm text-muted-strong transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50 motion-reduce:transition-none"
      >
        {done ? (
          <Check className="size-4 shrink-0 text-primary" aria-hidden />
        ) : busy ? (
          <RefreshCw className="size-4 shrink-0 animate-spin" aria-hidden />
        ) : (
          <Fingerprint className="size-4 shrink-0" aria-hidden />
        )}
        {done ? "Passkey hozzáadva" : "Gyors belépés beállítása"}
      </button>
      {error ? (
        <p className="px-2 pb-1 text-xs text-destructive">{error}</p>
      ) : (
        <p className="px-2 pb-1 text-xs text-muted-foreground">
          Legközelebb ujjlenyomattal is beléphetsz.
        </p>
      )}
    </div>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  //* Magyar névsorrend: a vezetéknév az első. Két betűnél többet nem írunk ki —
  //* a kör átmérője 36 px, ennél több nem fér el olvashatóan.
  const first = parts[0]?.[0] ?? "";
  const second = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + second).toLocaleUpperCase("hu");
}

//* Egy emberi címke az eszközről, hogy a passkey-k listája később
//* megkülönböztethető legyen. Szándékosan durva: a pontos eszközazonosítás
//* ujjlenyomatozás lenne, és nincs rá szükségünk.
function deviceLabel(): string {
  if (typeof navigator === "undefined") return "Ismeretlen eszköz";
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua)) return "iPhone / iPad";
  if (/Android/.test(ua)) return "Android";
  if (/Mac OS X/.test(ua)) return "Mac";
  if (/Windows/.test(ua)) return "Windows";
  return "Ez az eszköz";
}
