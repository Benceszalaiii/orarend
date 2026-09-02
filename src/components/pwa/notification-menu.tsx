"use client";

import {
  Bell,
  BellRing,
  Check,
  Loader2,
  Share,
  SquarePlus,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  currentSubscription,
  disablePush,
  enablePush,
  loadPrefs,
  type PushSupport,
  pushSupport,
  refreshPush,
  updatePush,
} from "@/lib/push";
import { LEAD_MINUTES, MAX_CLASSES } from "@/lib/push-shared";
import type { TimetableClass } from "@/lib/timetable";
import { cn } from "@/lib/utils";

//* ---------------------------------------------------------------------------
//* A HARANG — AZ ÉRTESÍTÉSEK EGYETLEN BEJÁRATA
//* ---------------------------------------------------------------------------
//! A BÖNGÉSZŐ SOHA NEM KÉRDEZ ELŐBB, MINT MI. A `Notification.requestPermission()`
//! kizárólag ennek a párbeszédnek a „Bekapcsolom" gombjából fut le — sem
//! oldalbetöltéskor, sem a harang megnyomásakor, sem időzítőből. Ennek nem
//! udvariassági oka van: a böngésző kérdését EGYSZER lehet feltenni, és a
//! reflexből elutasított engedélyt JS-ből soha többé nem lehet újrakérni. Aki
//! nem tudja, mire mond igent, az nemet mond — és azzal a lehetőség végleg
//! elveszett.
//*
//* Ezért a sorrend: harang → SAJÁT párbeszéd (mit ajánlunk, melyik osztályra) →
//* csak az igenlő gomb után a böngésző kérdése. Ugyanez a felépítés áll a
//* jedlik-szakkor Phase H tervében is; ott szakkörre, itt osztályra szól az
//* entitásonkénti feliratkozás.
//*
//! A HARANG NEM ÍGÉR TÖBBET, MINT AMENNYIT TARTANI TUD. Két dolog van, amit
//! meg tudunk mondani: mi kezdődik hamarosan, és mi változott az órarendben.
//! A párbeszéd pontosan ezt a kettőt mondja ki — nem „értesítéseket" ajánl
//! általánosságban, mert abból a diák nem tudja eldönteni, kell-e neki.

//* Az élettartam-frissítés (`refreshPush`) LAPONKÉNT egyszer fut, nem
//* komponensenként: a harang mindkét nézet sávjában ott van, és két
//* egyforma kérés semmit nem ad hozzá.
let refreshed = false;

export function NotificationMenu({
  classes,
  currentClass,
  className,
}: {
  classes: readonly TimetableClass[];
  /** Az éppen nézett osztály — ez a párbeszéd alapértelmezett választása. */
  currentClass: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [support, setSupport] = useState<PushSupport | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [everyLesson, setEveryLesson] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  //! AZ ÁLLAPOTOT A BÖNGÉSZŐTŐL KÉRDEZZÜK, NEM A SAJÁT JELÖLŐNKTŐL. A
  //! feliratkozás a lap tudta nélkül is megszűnhet (törölt tárhely, visszavont
  //! engedély, másik eszközön ugyanaz a fiók) — egy „be van kapcsolva" harang
  //! ilyenkor hazudna.
  const sync = useCallback(async () => {
    const state = pushSupport();
    setSupport(state);
    const subscription = state === "ready" ? await currentSubscription() : null;
    setEnabled(subscription !== null);
    const prefs = loadPrefs();
    setEveryLesson(prefs.everyLesson);
    setSelected(
      subscription && prefs.classes.length > 0
        ? prefs.classes
        : currentClass
          ? [currentClass]
          : [],
    );
  }, [currentClass]);

  useEffect(() => {
    void sync();
    if (refreshed) return;
    refreshed = true;
    void refreshPush();
  }, [sync]);

  //* A párbeszéd nyitásakor újra megkérdezzük az állapotot: a beállításokban
  //* közben visszavonhatták az engedélyt, és a rossz űrlap rosszabb a semminél.
  const openDialog = () => {
    void sync();
    setError(null);
    setOpen(true);
  };

  const toggleClass = (short: string) => {
    setError(null);
    setSelected((current) =>
      current.includes(short)
        ? current.filter((c) => c !== short)
        : //* A felső korlát nem hibaüzenet, hanem meg nem történő koppintás —
          //* a már kiválasztottak levehetők, a hatodik nem tehető hozzá.
          current.length >= MAX_CLASSES
          ? current
          : [...current, short],
    );
  };

  const save = async () => {
    if (selected.length === 0) return;
    setBusy(true);
    setError(null);
    //! A KAPCSOLÁS ÉS A MÓDOSÍTÁS NEM UGYANAZ. Bekapcsoláskor a böngésző
    //! engedélye is kell (`enablePush`); a már bekapcsolt feliratkozás
    //! osztálylistáját viszont engedélykérés NÉLKÜL írjuk át — egy második
    //! kérdés ott csak megijesztené a diákot.
    const result = enabled
      ? { ok: await updatePush({ classes: selected, everyLesson }) }
      : await enablePush({ classes: selected, everyLesson });
    setBusy(false);

    if (result.ok) {
      setEnabled(true);
      setOpen(false);
      return;
    }
    const reason = "reason" in result ? result.reason : "server";
    setError(
      reason === "denied"
        ? "A böngésző nem engedélyezte az értesítéseket. A lap beállításai közt (a címsor melletti ikon) lehet visszavonni a tiltást."
        : reason === "unsupported"
          ? "Ez a böngésző nem tudja fogadni az értesítéseket."
          : "Az értesítések most nem kapcsolhatók be — próbáld újra később.",
    );
  };

  const turnOff = async () => {
    setBusy(true);
    await disablePush();
    setBusy(false);
    setEnabled(false);
    setOpen(false);
  };

  //! AMIT NEM TUDUNK NYÚJTANI, AZT NEM IS KÍNÁLJUK FEL. Ha a böngésző
  //! egyáltalán nem ismeri a pusht (asztali Safari régi verzió, beágyazott
  //! nézet), a harang meg sem jelenik: egy gomb, ami csak elmagyarázni tudja,
  //! miért nem működik, csak helyet foglal a szűk sávban. Az iOS-es „előbb
  //! tedd ki a kezdőképernyőre" ág viszont MEGMARAD — az nem hiány, hanem egy
  //! elvégezhető lépés.
  if (support === "unsupported") return null;

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        onClick={openDialog}
        className={cn(
          "size-9 rounded-full touch-target",
          enabled
            ? "text-primary hover:text-primary"
            : "text-muted-foreground hover:text-foreground",
          className,
        )}
        aria-label={
          enabled ? "Értesítések beállításai" : "Értesítések bekapcsolása"
        }
        title="Értesítések"
      >
        {enabled ? (
          <BellRing className="size-4" />
        ) : (
          <Bell className="size-4" />
        )}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {enabled ? "Értesítések" : "Szóljunk, ha kezdődik az óra?"}
            </DialogTitle>
            <DialogDescription className="text-pretty">
              {support === "needs-install" ? (
                //! iOS-EN A TELEPÍTÉS NEM AJÁNLÁS, HANEM FELTÉTEL. A Safari
                //! csak a kezdőképernyőre kitett lapnak ad push-jogot — böngésző-
                //! lapként a gomb megnyomása után SEMMI nem történne, és a diák
                //! azt hinné, elromlott.
                <>
                  Az iPhone csak a kezdőképernyőre kitett Órarendnek küld
                  értesítést. Tedd ki előbb — utána itt bekapcsolható.
                </>
              ) : support === "blocked" ? (
                <>
                  Ebben a böngészőben korábban letiltottad az Órarend
                  értesítéseit. Ezt csak te tudod visszavonni: a címsor melletti
                  ikonra koppintva, a lap engedélyeinél.
                </>
              ) : (
                <>
                  Két dologról szólunk, semmi másról:{" "}
                  <span className="font-medium text-foreground">
                    {LEAD_MINUTES} perccel az óra kezdése előtt
                  </span>
                  , és ha{" "}
                  <span className="font-medium text-foreground">
                    megváltozik az órarend
                  </span>{" "}
                  (elmarad egy óra, teremcsere, áthelyezés).
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          {support === "needs-install" ? (
            //* Ugyanaz a két lépés, mint a telepítési tippben — a menüpontot a
            //* felhasználó a Safari saját ikonjairól ismeri fel, nem a szövegből.
            <ol className="flex flex-col gap-2 text-sm text-muted-strong">
              <li className="flex items-center gap-2.5">
                <Share className="size-4 shrink-0 text-primary" aria-hidden />
                <span>
                  Koppints a{" "}
                  <strong className="font-medium text-foreground">
                    Megosztás
                  </strong>{" "}
                  gombra a Safari eszköztárán.
                </span>
              </li>
              <li className="flex items-center gap-2.5">
                <SquarePlus
                  className="size-4 shrink-0 text-primary"
                  aria-hidden
                />
                <span>
                  Válaszd a{" "}
                  <strong className="font-medium text-foreground">
                    Főképernyőhöz adás
                  </strong>{" "}
                  pontot.
                </span>
              </li>
            </ol>
          ) : support === "blocked" ? null : (
            <div className="flex flex-col gap-3">
              {/*//! AZ OSZTÁLY NEM MAGÁTÓL ÉRTETŐDIK. A lap egy osztály
                  //! órarendjét mutatja, de a harang MÁSIKRA is beállítható
                  //! (nyelvi csoport, testvér, duális pár). Ezért kimondjuk,
                  //! melyik van most kiválasztva — és nem csak jelöljük. */}
              <p className="text-sm text-muted-strong">
                {currentClass ? (
                  <>
                    Most a(z){" "}
                    <span className="font-medium text-foreground">
                      {currentClass}
                    </span>{" "}
                    órarendjét nézed. Erről szólunk — ha más (is) kell, válaszd
                    ki alább.
                  </>
                ) : (
                  <>Válaszd ki, melyik osztály órarendjéről szóljunk.</>
                )}
              </p>

              <div className="max-h-52 overflow-y-auto rounded-lg border border-input p-2">
                <div className="flex flex-wrap gap-1.5">
                  {classes.map((c) => {
                    const on = selected.includes(c.short);
                    const full = !on && selected.length >= MAX_CLASSES;
                    return (
                      <button
                        key={c.short}
                        type="button"
                        aria-pressed={on}
                        disabled={full}
                        onClick={() => toggleClass(c.short)}
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none",
                          on
                            ? "border-primary bg-primary/15 text-primary"
                            : "border-input text-muted-strong hover:bg-muted hover:text-foreground",
                          full && "cursor-not-allowed opacity-40",
                        )}
                      >
                        {on && <Check className="size-3" aria-hidden />}
                        {c.short}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/*//! A SŰRŰSÉG A DIÁKÉ, DE AZ ALAPÉRTELMEZÉS A MIÉNK. Alapból csak
                  //! a nap első órája előtt szólunk, és minden olyan óra előtt,
                  //! ami szünet vagy lyukasóra után jön — nyolc rezgés naponta
                  //! nem emlékeztető, hanem az, amitől kikapcsolják az egészet.
                  //! Aki mégis mindet kéri (sok teremcsere), az itt bekapcsolja. */}
              <label className="flex cursor-pointer items-start gap-2.5 text-sm">
                <input
                  type="checkbox"
                  checked={everyLesson}
                  onChange={(e) => setEveryLesson(e.target.checked)}
                  className="mt-0.5 size-4 shrink-0 accent-primary"
                />
                <span className="text-muted-strong">
                  Minden óra előtt szólj
                  <span className="block text-xs text-muted-foreground">
                    Alapból csak a nap első órája előtt, és szünet vagy
                    lyukasóra után.
                  </span>
                </span>
              </label>

              {error && (
                <p className="text-pretty text-sm text-destructive">{error}</p>
              )}
            </div>
          )}

          <DialogFooter className="sm:justify-between">
            {enabled ? (
              <Button
                variant="ghost"
                size="sm"
                className="touch-target text-muted-foreground"
                disabled={busy}
                onClick={turnOff}
              >
                Kikapcsolás
              </Button>
            ) : (
              <span className="hidden sm:block" />
            )}
            {support === "ready" && (
              <Button
                size="sm"
                className="touch-target"
                disabled={busy || selected.length === 0}
                onClick={save}
              >
                {busy && (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                )}
                {enabled ? "Mentés" : "Bekapcsolom"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
