"use client";

import {
  CalendarCheck,
  CalendarPlus,
  Check,
  Copy,
  ExternalLink,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { useEffect, useState } from "react";
import { SheetItemBody, sheetItem } from "@/components/chrome/chrome-sheet";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import {
  loadStoredFeed,
  requestFeed,
  revokeFeed,
  type StoredFeed,
} from "@/lib/calendar-local";
import { subjectStoreKey, type TimetableSubjectKind } from "@/lib/timetable";

//! ═══════════════════════════════════════════════════════════════════════════
//! A NAPTÁR-FELIRATKOZÁS FELÜLETE
//! ═══════════════════════════════════════════════════════════════════════════
//! HÁROM DOLGOT KELL KIMONDANIA, ÉS MINDHÁRMAT A GOMB MEGNYOMÁSA ELŐTT:
//!
//!  1. MI KERÜL BELE. „A saját órarended" — vagyis amit a rácson lát, a
//!     csoportbontás-döntéseivel együtt. Ez a funkció lényege, és ez az, amiért
//!     a diák egyáltalán akarja.
//!  2. MENNYIRE FRISS. Nálunk óránként; hogy a NAPTÁRA milyen sűrűn kérdez, az
//!     nem a mi döntésünk — a Google Naptár például jóval ritkábban olvas újra.
//!     Ezt kiírjuk, mert különben az első elmaradt teremcserénél a diák azt
//!     hinné, elromlott.
//!  3. HOGY A LINK MAGÁNÜGY. Aki ismeri, látja ezt az órarendet. Ez nem
//!     apróbetű: ez a link természete, és a visszavonás gombja mellett áll.
//!
//! A LINK LÉTREHOZÁSA AZ A PILLANAT, AMIKOR A DÖNTÉSEK A SZERVERRE KERÜLNEK
//! (lásd `calendar-shared.ts`). Ezért van itt „Link készítése" gomb, és ezért
//! nem elég egy csendben megjelenő cím a lap alján.
//! ═══════════════════════════════════════════════════════════════════════════

type Status =
  | { kind: "idle" }
  | { kind: "working" }
  | { kind: "teacher-session" }
  | { kind: "unavailable" }
  | { kind: "error" };

export function CalendarFeedMenu({
  mode,
  subjectShort,
  hasDecisions,
}: {
  mode: TimetableSubjectKind;
  subjectShort: string;
  //! VAN-E MÁR CSOPORTBONTÁS-DÖNTÉS. Aki még egyet sem hozott, annak a
  //! naptárába az osztály MINDEN párhuzamos csoportja bekerül — két angol, két
  //! német, mind egymáson. Ez nem hiba, hanem a szűrés hiánya, de a diák
  //! elromlásnak látná; ezért a link elkészítése ELŐTT mondjuk ki.
  hasDecisions: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [feed, setFeed] = useState<StoredFeed | null>(null);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [copied, setCopied] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState(false);

  const storeKey = subjectStoreKey(mode, subjectShort);

  //* A tároló a böngészőé: csak a hidratálás után olvasható. Alanyváltáskor
  //* újra — egy másik osztály linkjét itt megjeleníteni félrevezető lenne.
  useEffect(() => {
    setFeed(storeKey ? loadStoredFeed(storeKey) : null);
    setStatus({ kind: "idle" });
    setConfirmRevoke(false);
    setCopied(false);
  }, [storeKey]);

  const create = async () => {
    setStatus({ kind: "working" });
    const result = await requestFeed({ kind: mode, short: subjectShort });
    if (result.status === "ok") {
      setFeed(result.feed);
      setStatus({ kind: "idle" });
      return;
    }
    setStatus({
      kind:
        result.status === "teacher-session-required"
          ? "teacher-session"
          : result.status === "unavailable"
            ? "unavailable"
            : "error",
    });
  };

  const revoke = async () => {
    if (!feed) return;
    setStatus({ kind: "working" });
    const done = await revokeFeed(feed);
    if (done) {
      setFeed(null);
      setStatus({ kind: "idle" });
      setConfirmRevoke(false);
      return;
    }
    setStatus({ kind: "error" });
  };

  const copy = async () => {
    if (!feed) return;
    try {
      await navigator.clipboard.writeText(feed.https);
      setCopied(true);
      //* A visszajelzés időzítve halványul el: egy állandó „Másolva" felirat a
      //* következő megnyitáskor már hazudna.
      setTimeout(() => setCopied(false), 2500);
    } catch {
      //! A VÁGÓLAP MEGTAGADHATÓ (engedély, régi böngésző, nem HTTPS). Ilyenkor
      //! nem hibázunk: a cím ott áll olvashatóan a gomb alatt, kijelölhetően.
      setCopied(false);
    }
  };

  return (
    <>
      <Button
        variant="ghost"
        className={sheetItem()}
        onClick={() => setOpen(true)}
      >
        {feed ? (
          <CalendarCheck className="size-4 shrink-0 text-primary" aria-hidden />
        ) : (
          <CalendarPlus
            className="size-4 shrink-0 text-muted-foreground"
            aria-hidden
          />
        )}
        <SheetItemBody
          label="Naptár"
          hint={
            feed ? "Feliratkozás aktív" : "Felveheted a telefonod naptárába"
          }
        />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {feed ? "A naptár-linked" : "Órarend a naptáradban"}
            </DialogTitle>
            <DialogDescription className="text-pretty">
              {feed ? (
                <>
                  A{" "}
                  <span className="font-medium text-foreground">
                    {feed.short}
                  </span>{" "}
                  órarendje megjelenik a naptáradban — pontosan azokkal az
                  órákkal, amiket a rácson is látsz.
                </>
              ) : (
                <>
                  Felveheted az órarendedet a telefonod naptárába.{" "}
                  <span className="font-medium text-foreground">
                    Csak azok az órák kerülnek bele, amiket a rácson is látsz
                  </span>{" "}
                  — az elrejtett csoportok órái nem.
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          {feed ? (
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-2">
                {/*//! A `webcal://` NEM SZÉPÍTÉS, HANEM A FUNKCIÓ. Egy `https`
                    //! címre koppintva a telefon LETÖLT egy fájlt: az órák
                    //! egyszer bekerülnek a naptárba, és soha nem frissülnek
                    //! többé. A `webcal://` ugyanazt a címet FELIRATKOZÁSKÉNT
                    //! adja át. */}
                <Button asChild className="w-full justify-center gap-2">
                  <a href={feed.webcal}>
                    <CalendarPlus className="size-4" aria-hidden />
                    Hozzáadás a naptárhoz
                  </a>
                </Button>
                <div className="flex gap-2">
                  <Button
                    asChild
                    variant="outline"
                    className="flex-1 justify-center gap-2"
                  >
                    <a
                      href={feed.google}
                      target="_blank"
                      rel="noreferrer noopener"
                    >
                      <ExternalLink className="size-4" aria-hidden />
                      Google Naptár
                    </a>
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1 justify-center gap-2"
                    onClick={copy}
                  >
                    {copied ? (
                      <Check className="size-4" aria-hidden />
                    ) : (
                      <Copy className="size-4" aria-hidden />
                    )}
                    {copied ? "Másolva" : "Link másolása"}
                  </Button>
                </div>
              </div>

              {/*//* A cím kiírva is ott van: a vágólap megtagadható, és van, aki
                  //* egyszerűen a gépén akarja beírni. */}
              <p className="break-all rounded-md bg-muted px-2.5 py-2 text-[11px] text-muted-strong">
                {feed.https}
              </p>

              <ul className="flex flex-col gap-1.5 text-xs text-muted-strong">
                <li>Az órarend adata óránként frissül a forrásból.</li>
                {/*//! EZT ELŐRE MEGMONDJUK, KÜLÖNBEN HIBÁNAK TŰNIK. Az Apple
                    //! Naptár és az Outlook figyeli, milyen sűrűn érdemes
                    //! újraolvasni; a Google Naptár a maga ütemében, jellemzően
                    //! jóval ritkábban kérdez — ezen mi nem tudunk segíteni. A
                    //! változásokról ezért továbbra is az értesítés szól
                    //! időben. */}
                <li>
                  A naptáralkalmazás a saját ütemében olvas újra — a Google
                  Naptár ritkábban. Ha időben akarsz tudni egy teremcseréről,
                  kapcsold be az értesítést is.
                </li>
                <li>
                  {feed.bound
                    ? "A feed a fiókodhoz mentett csoportválasztásokat követi, bármelyik készülékről állítod át."
                    : "Ez a link ehhez a készülékhez tartozik: a csoportválasztásaid innen frissülnek."}
                </li>
              </ul>

              {/*//! A LINK TERMÉSZETE, NEM APRÓBETŰ. Nincs benne jelszó — nem is
                  //! lehet: egy naptáralkalmazásnak nincs hova beírnia. Aki a
                  //! címet megkapja, látja ezt az órarendet, amíg vissza nem
                  //! vonod. */}
              <p className="flex items-start gap-2 rounded-md border border-border bg-muted/40 px-2.5 py-2 text-xs text-muted-strong">
                <TriangleAlert
                  className="mt-0.5 size-3.5 shrink-0 text-foreground/70"
                  aria-hidden
                />
                <span className="text-pretty">
                  A linket ismerő bárki látja ezt az órarendet. Ne tedd közzé —
                  ha mégis kikerült, vond vissza, és kérj újat.
                </span>
              </p>

              <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
                {confirmRevoke ? (
                  <>
                    <span className="text-xs text-muted-strong">
                      A link azonnal érvénytelen lesz.
                    </span>
                    <span className="flex shrink-0 gap-1.5">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setConfirmRevoke(false)}
                      >
                        Mégse
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        disabled={status.kind === "working"}
                        onClick={revoke}
                      >
                        Visszavonás
                      </Button>
                    </span>
                  </>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1.5 text-muted-strong hover:text-foreground"
                    onClick={() => setConfirmRevoke(true)}
                  >
                    <Trash2 className="size-3.5" aria-hidden />
                    Link visszavonása
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {/*//! AMI A GOMB MEGNYOMÁSÁVAL TÖRTÉNIK, AZT ELŐRE KIMONDJUK. A
                  //! csoportbontás-döntés eddig KIZÁRÓLAG a böngészőben élt
                  //! (lásd `/adatvedelem`); egy naptár-feedhez viszont a
                  //! szervernek kell tudnia, mit szűrjön — a naptárad süti nélkül
                  //! kérdez. Ezt nem lehet elhallgatni, és nem is akarjuk. */}
              {!hasDecisions && (
                //! A FIGYELMEZTETÉS ITT NEM A FUNKCIÓRÓL SZÓL, HANEM AZ
                //! ÓRARENDRŐL. A rácson a párhuzamos csoportok egymásra
                //! csúszott kártyákként LÁTSZANAK — a naptárban viszont
                //! egyszerűen két esemény lesz ugyanabban a percben, és nem
                //! derül ki, hogy az egyik nem a tieid közül való.
                <p className="flex items-start gap-2 rounded-md border border-border bg-muted/40 px-2.5 py-2 text-xs text-muted-strong">
                  <TriangleAlert
                    className="mt-0.5 size-3.5 shrink-0 text-foreground/70"
                    aria-hidden
                  />
                  <span className="text-pretty">
                    Még nem szűrted ennek az osztálynak az óráit, ezért a
                    párhuzamos csoportok órái is bekerülnek a naptárba. Érdemes
                    előbb az összevonásokat beállítani.
                  </span>
                </p>
              )}
              <p className="text-pretty text-xs text-muted-strong">
                A link elkészítéséhez a csoportválasztásaid a szerverünkre
                kerülnek — enélkül a naptárad nem tudná, melyik órák a tieid. A
                linket bármikor visszavonhatod, és ezzel az adat is törlődik.
              </p>
              <Button
                className="w-full justify-center gap-2"
                disabled={status.kind === "working" || !subjectShort}
                onClick={create}
              >
                {status.kind === "working" ? (
                  <Spinner className="size-4" />
                ) : (
                  <CalendarPlus className="size-4" aria-hidden />
                )}
                Link készítése
              </Button>
            </div>
          )}

          {status.kind === "teacher-session" && (
            //! A TANÁRI FEED BELÉPÉSHEZ KÖTÖTT, ÉS EZ NEM ÓVATOSSÁG. Egy link,
            //! ami folyamatosan mutatja, hol van egy konkrét tanár, akkor is
            //! követés, ha minden adata nyilvános — lásd `/api/naptar`.
            <p className="text-pretty text-xs text-muted-strong">
              Tanári órarendhez iskolai belépés kell, tanári fiókkal. Lépj be,
              és próbáld újra.
            </p>
          )}
          {status.kind === "unavailable" && (
            <p className="text-pretty text-xs text-muted-strong">
              A naptár-feed most nem érhető el. Próbáld meg később.
            </p>
          )}
          {status.kind === "error" && (
            <p className="text-pretty text-xs text-muted-strong">
              Nem sikerült. Ellenőrizd a hálózatot, és próbáld újra.
            </p>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
