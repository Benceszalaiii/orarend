"use client";

import { Check, Fingerprint, LogOut, RefreshCw, User } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  SHEET_POPOVER,
  SheetItemBody,
  sheetItem,
} from "@/components/chrome/chrome-sheet";
import { GoogleGlyph } from "@/components/google-glyph";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { GOOGLE_LINK_REASON } from "@/lib/ad-migration";
import {
  authClient,
  hasGoogleLinked,
  linkGoogleAccount,
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

//! KÉT ALAK, EGY VEZÉRLŐ. `icon`: a nyitólap lebegő tábláján, ahol nincs lap
//! és a hely szűk. `row`: a fejléc lapjában, ahol a sor MAGA a gomb — teljes
//! szélességben kattintható, kiírt névvel (lásd `chrome/chrome-sheet.tsx`).
export function AccountMenu({
  className,
  variant = "icon",
}: {
  className?: string;
  variant?: "icon" | "row";
}) {
  const { data: session, isPending } = useSession();
  const pathname = usePathname();
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  //! A BETÖLTÉS ALATT SEM UGRÁL A SÁV. A munkamenet lekérdezése egy hálózati
  //! kör; amíg tart, ugyanakkora helyet foglalunk, mint utána. Enélkül a
  //! mellette álló vezérlők elcsúsznának, amikor a válasz megjön.
  if (isPending) {
    return (
      <div
        className={cn(
          variant === "row" ? "h-11 w-full" : "size-9 shrink-0",
          className,
        )}
        aria-hidden
      />
    );
  }

  return session ? (
    <SignedIn
      className={className}
      variant={variant}
      name={session.user.name}
      image={session.user.image}
      open={open}
      onOpenChange={setOpen}
      busy={busy}
      setBusy={setBusy}
    />
  ) : (
    //! ODA TÉRÜNK VISSZA, AHONNAN ELINDULT. A belépés nem egy külön „állomás",
    //! amin át kell menni — a diák ugyanazt a lapot kapja vissza, amit nézett,
    //! csak már a saját beállításaival.
    <SignedOut
      className={className}
      variant={variant}
      next={pathname || "/orarend"}
    />
  );
}

//! A SÁVBAN LÉVŐ GOMB NEM KÉR JELSZÓT — ÁTVISZ ODA, AHOL KÉRÜNK. Ez tudatos:
//! iskolai jelszót kizárólag a `/belepes` lapon gépel be a diák, egy saját
//! címen, ahol a böngésző címsora és a jelszókezelője is látszik. Egy sávból
//! kinyíló, jelszót kérő buborék pont azt a szokást alakítaná ki, amire az
//! adathalászat épül — és a jelszókezelő sem ismerné fel megbízhatóan.
function SignedOut({
  className,
  variant,
  next,
}: {
  className?: string;
  variant: "icon" | "row";
  next: string;
}) {
  const row = variant === "row";
  return (
    <Button
      asChild
      variant="ghost"
      size={row ? "default" : "sm"}
      className={
        row
          ? sheetItem(className)
          : cn("h-9 shrink-0 touch-target gap-1.5 px-2.5", className)
      }
    >
      <Link
        href={`/belepes?tovabb=${encodeURIComponent(next)}`}
        data-key={row ? "f" : undefined}
        title="Belépés az iskolai fiókkal — a beállításaid átjönnek a többi eszközödre"
      >
        <User
          className={cn("size-4 shrink-0", row && "text-muted-foreground")}
          aria-hidden
        />
        {row ? (
          <SheetItemBody
            label="Belépés"
            hint="A beállításaid átjönnek a többi eszközödre"
          />
        ) : (
          <span className="text-xs font-medium max-sm:sr-only">Belépés</span>
        )}
      </Link>
    </Button>
  );
}

function SignedIn({
  className,
  variant,
  name,
  image,
  open,
  onOpenChange,
  busy,
  setBusy,
}: {
  className?: string;
  variant: "icon" | "row";
  name: string;
  image?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  busy: boolean;
  setBusy: (busy: boolean) => void;
}) {
  //! EGY LEKÉRDEZÉS, KÉT FELHASZNÁLÁSI HELY. Ugyanez az állapot dönti el, hogy
  //! a `GoogleLinkRow` megjelenjen-e a felugróban, ÉS hogy a sor-alakú
  //! (fejléc-lap) trigger `hint`-je a szokásos „A beállításaid szinkronizálva"
  //! helyett a teendőt mondja-e — enélkül két külön hívás menne a szerverre
  //! ugyanazért a válaszért.
  const [linkedGoogle, setLinkedGoogle] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    void hasGoogleLinked().then((result) => {
      if (!cancelled) setLinkedGoogle(result);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-key={variant === "row" ? "f" : undefined}
          className={
            variant === "row"
              ? sheetItem(className)
              : cn(
                  "flex size-9 shrink-0 touch-target items-center justify-center rounded-full border border-input text-xs font-semibold text-muted-strong transition-colors",
                  "hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none",
                  "dark:bg-input/30",
                  className,
                )
          }
          title={
            linkedGoogle === false
              ? `Bejelentkezve: ${name} — a Google-fiók összekötése ajánlott`
              : `Bejelentkezve: ${name}`
          }
        >
          {/*//* Sor-alakban a monogram egy kis korong a sor bal szélén — ugyanaz
              //* a hely, ahol a többi sor ikonja áll. */}
          {/*//! A KÉPET NEM ERŐLTETJÜK. Az iskolai fiókok többségének nincs
              //! profilképe, és egy törött kép rosszabb, mint a monogram. A
              //! `next/image` itt szándékosan nem szerepel: külső, változó
              //! forrásról van szó, amihez tartomány-engedélyezés kellene. */}
          <span
            aria-hidden
            className={cn(
              "flex items-center justify-center overflow-hidden rounded-full text-xs font-semibold",
              variant === "row"
                ? "size-6 shrink-0 border border-input text-muted-strong"
                : "size-full",
            )}
          >
            {image ? (
              // biome-ignore lint/performance/noImgElement: külső, nem optimalizálható profilkép
              <img
                src={image}
                alt=""
                className="size-full rounded-full object-cover"
              />
            ) : (
              initials(name)
            )}
          </span>
          {variant === "row" ? (
            <SheetItemBody
              label={name}
              //! A HATÁRIDŐS TEENDŐ ITT LÁTHATÓ ANÉLKÜL, HOGY A FELUGRÓT MEG
              //! KELLENE NYITNI — a fejléc-lap ezt a sort amúgy is mutatja,
              //! tehát ez nem új felület, csak egy meglévő hely megváltozott
              //! szövege. `null`-nál (még nem tudjuk) a megszokott szöveg
              //! marad, nehogy egy pillanatra téves teendőt mutasson.
              hint={
                linkedGoogle === false
                  ? "Google-fiók összekötése ajánlott"
                  : "A beállításaid szinkronizálva"
              }
            />
          ) : (
            <span className="sr-only">Fiók: {name}</span>
          )}
        </button>
      </PopoverTrigger>

      {/*//! A FIÓK KÉT ALAKBAN ÁLL, ÉS A BUBORÉKNAK IS KÉT HELYE VAN. Sor-
          //! alakban a lap (vagy a sáv) egyik sora nyitja: ott a buborék a sor
          //! alá tartozik, mint minden más soré (`SHEET_POPOVER`). Ikon-alakban
          //! viszont a monogram a fejléc JOBB szélén ül — ott a jobb szélhez
          //! igazítás nem választás, hanem az egyetlen irány, amerre van hely. */}
      <PopoverContent
        {...(variant === "row" ? SHEET_POPOVER : { align: "end" as const })}
        className="w-64 p-0"
      >
        <div className="flex flex-col gap-0.5 border-b border-border px-3 py-2.5">
          <p className="truncate text-sm font-medium text-foreground">{name}</p>
        </div>

        <div className="flex flex-col p-1">
          <GoogleLinkRow busy={busy} setBusy={setBusy} linked={linkedGoogle} />
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

//! ─── GOOGLE-FIÓK ÖSSZEKÖTÉSE ────────────────────────────────────────────────
//! Az iskolai AD-belépés kivezetés alatt áll (lásd `/valtozasok`); aki eddig
//! kizárólag azzal lépett be, annak a fiókja Google nélkül a leállás után
//! ELÉRHETETLENNÉ válik — a beállításai nem jönnek át egy másik eszközre, és
//! ha nincs passkey-je sem, MAGA A FIÓK sem nyitható meg többé. Ez a sor ezt
//! előzi meg: egy kattintás, ami a JELENLEGI (már bejelentkezett) fiókhoz köt
//! egy Google-fiókot — nem új fiókot hoz létre (lásd `auth.ts`,
//! `account.accountLinking`).
//!
//! CSAK AKKOR JELENIK MEG, HA MÉG NINCS Google-fiók kötve. A lekérdezés
//! (`listAccounts`) egyszer fut, a felugró láthatóságától függetlenül — ez a
//! fiókgomb a leggyakoribb hely, ahonnan valaki egyáltalán megnyitja ezt a
//! felugrót, tehát a döntést nem érdemes a nyitásig halasztani.
function GoogleLinkRow({
  busy,
  setBusy,
  linked,
}: {
  busy: boolean;
  setBusy: (busy: boolean) => void;
  //* A `SignedIn` kérdezi le, mert a válasz a fejléc-lap sorának `hint`-jét
  //* IS befolyásolja — egy lekérdezés, két hely. `null` = még nem tudjuk,
  //* addig nem mutatunk semmit, nehogy egy pillanatra tévesen felkínáljuk az
  //* összekötést egy olyan fióknak, aminek már van Google-fiókja.
  linked: boolean | null;
}) {
  const [error, setError] = useState<string | null>(null);

  const link = useCallback(async () => {
    setBusy(true);
    setError(null);
    const result = await linkGoogleAccount(
      typeof window !== "undefined" ? window.location.pathname : "/orarend",
    );
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    //* Sikeres ágon a böngésző elnavigál a Google felé — nincs mit tenni itt.
  }, [setBusy]);

  //* Amíg nem tudjuk, vagy már kötve van, nincs mit mutatni.
  if (linked !== false) return null;

  return (
    <div className="flex flex-col">
      <button
        type="button"
        disabled={busy}
        onClick={() => void link()}
        className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm text-muted-strong transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50 motion-reduce:transition-none"
      >
        {busy ? (
          <RefreshCw className="size-4 shrink-0 animate-spin" aria-hidden />
        ) : (
          <GoogleGlyph className="size-4 shrink-0" />
        )}
        Google-fiók összekötése
      </button>
      {error ? (
        <p className="px-2 pb-1 text-xs text-destructive">{error}</p>
      ) : (
        <p className="px-2 pb-1 text-xs text-muted-foreground">
          {GOOGLE_LINK_REASON}
        </p>
      )}
    </div>
  );
}

//! ─── PASSKEY FELVÉTELE ──────────────────────────────────────────────────────
//! A passkey NEM a bejárat, hanem a rövidebb út: csak bejelentkezett
//! felhasználó veheti fel, tehát az iskolai fiók marad az egyetlen módja annak,
//! hogy valaki egyáltalán bekerüljön. Cserébe legközelebb nem kell begépelnie
//! az iskolai jelszavát — egy ujjlenyomat elég. Ez nem csak kényelem: minden
//! passkey-s belépés EGGYEL KEVESEBB alkalom, amikor az iskolai jelszó
//! egyáltalán előkerül.
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
