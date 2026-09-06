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
import { SheetItemBody, sheetItem } from "@/components/chrome/chrome-sheet";
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
import {
  LEAD_MINUTES,
  maxSubjects,
  type PushPrefs,
  subjectsOf,
} from "@/lib/push-shared";
import {
  SUBJECT_WORDS,
  type TimetableSubject,
  type TimetableSubjectKind,
} from "@/lib/timetable";
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
//*
//! ─── EGY HARANG, KÉT ALANY ─────────────────────────────────────────────────
//! UGYANAZ A PÁRBESZÉD SZOLGÁLJA KI AZ OSZTÁLYT ÉS A TANÁRT, mert a döntés,
//! amit meghoz, ugyanaz: kiről szóljon a jelzés, és milyen sűrűn. Ami eltér —
//! a lista, a felső korlát, a szavak — az a `mode`-ból következik.
//!
//! A KÉT LISTA EGYÜTT ÉL, DE KÜLÖN SZERKESZTHETŐ. Egy feliratkozás EGY sor a
//! szerveren, benne mindkét lista (`push-shared.ts`); ez a párbeszéd viszont
//! mindig csak a SAJÁT alanyfajtáját írja, a másikat érintetlenül továbbadja.
//! Így az osztályfőnök tanár a diák „Ma"-ján az osztályát, a tanárin magát
//! állítja be, és egyik beállítás sem törli a másikat.
//!
//! A TANÁRI ÁG BELÉPÉSHEZ KÖTÖTT, ÉS EZT NEM ITT DÖNTJÜK EL. A jogosultságot a
//! végpont ellenőrzi az iskolai fiókból (`/api/ertesites`) — a felület csak
//! MEGMUTATJA a válaszát. Ezért a harang a tanári felületen is csak akkor
//! jelenik meg, ha a hívó fél tanárként lépett be (lásd a hívási helyeket);
//! egy „kapcsold be" gomb, ami utána 403-at kap, rosszabb a hiányzó gombnál.

//* Az élettartam-frissítés (`refreshPush`) LAPONKÉNT egyszer fut, nem
//* komponensenként: a harang mindkét nézet sávjában ott van, és két
//* egyforma kérés semmit nem ad hozzá.
let refreshed = false;

export function NotificationMenu({
  mode = "class",
  subjects,
  currentSubject,
  className,
}: {
  /** Kire szól ez a harang — osztályra vagy tanárra. */
  mode?: TimetableSubjectKind;
  subjects: readonly TimetableSubject[];
  /** Az éppen nézett alany — ez a párbeszéd alapértelmezett választása. */
  currentSubject: string;
  className?: string;
}) {
  const words = SUBJECT_WORDS[mode];
  const max = maxSubjects(mode);

  const [open, setOpen] = useState(false);
  const [support, setSupport] = useState<PushSupport | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  //! A MÁSIK LISTA NEM ÁLLAPOT, HANEM ŐRIZET. A párbeszéd nem mutatja és nem
  //! szerkeszti — csak azért tartjuk, hogy a mentés vissza tudja adni a
  //! szervernek. Enélkül a tanári panelen mentett beállítás CSENDBEN törölné a
  //! diák-oldalon felvett osztályokat.
  const [other, setOther] = useState<string[]>([]);
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
    const mine = subjectsOf(prefs, mode);
    setOther(subjectsOf(prefs, mode === "teacher" ? "class" : "teacher"));
    setSelected(
      subscription && mine.length > 0
        ? mine
        : currentSubject
          ? [currentSubject]
          : [],
    );
  }, [currentSubject, mode]);

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

  const toggleSubject = (short: string) => {
    setError(null);
    setSelected((current) =>
      current.includes(short)
        ? current.filter((c) => c !== short)
        : //* A felső korlát nem hibaüzenet, hanem meg nem történő koppintás —
          //* a már kiválasztottak levehetők, az eggyel túli nem tehető hozzá.
          current.length >= max
          ? current
          : [...current, short],
    );
  };

  //* A mentendő állapot: a szerkesztett lista a saját helyére, a másik
  //* változatlanul vissza.
  const prefsToSave = (mine: string[]): PushPrefs => ({
    classes: mode === "teacher" ? other : mine,
    teachers: mode === "teacher" ? mine : other,
    everyLesson,
  });

  const save = async () => {
    if (selected.length === 0) return;
    setBusy(true);
    setError(null);
    //! A KAPCSOLÁS ÉS A MÓDOSÍTÁS NEM UGYANAZ. Bekapcsoláskor a böngésző
    //! engedélye is kell (`enablePush`); a már bekapcsolt feliratkozás
    //! osztálylistáját viszont engedélykérés NÉLKÜL írjuk át — egy második
    //! kérdés ott csak megijesztené a diákot.
    const next = prefsToSave(selected);
    const result = enabled ? await updatePush(next) : await enablePush(next);
    setBusy(false);

    if (result.ok) {
      setEnabled(true);
      setOpen(false);
      return;
    }
    const reason = "reason" in result ? result.reason : "server";
    //! MINDEN OKRA A SAJÁT MONDATA. Eddig a hiányzó service worker és a
    //! hiányzó szerverkulcs IS azt kapta, hogy „ez a böngésző nem tudja
    //! fogadni az értesítéseket" — a diák tehát megadta az engedélyt, és
    //! utána azt olvasta, hogy a böngészője alkalmatlan. Nem volt az: a
    //! háttérszolgáltatás nem indult el, amin egy újratöltés segít.
    setError(
      reason === "denied"
        ? "A böngésző nem engedélyezte az értesítéseket. A lap beállításai közt (a címsor melletti ikon) lehet visszavonni a tiltást."
        : reason === "no-worker"
          ? "Az engedély megvan, de az Órarend háttérszolgáltatása nem indult el — enélkül nincs mire megérkeznie az értesítésnek. Tölts újra a lapot, és próbáld újra."
          : reason === "misconfigured"
            ? "Az értesítések ezen a kiszolgálón nincsenek beállítva. Ez nem a te böngésződön múlik."
            : //! A LEJÁRT BELÉPÉS A LEGVALÓSZÍNŰBB OK, ÉS EZ NEM HIBA, HANEM
              //! ELVÉGZENDŐ LÉPÉS. A tanári feliratkozáshoz iskolai fiók kell
              //! (lásd `/api/ertesites`); a munkamenet 30 nap után lejár, a
              //! feliratkozás viszont tovább él — ilyenkor pontosan ez az
              //! egyetlen teendő.
              reason === "forbidden"
              ? "A tanári értesítéshez iskolai belépés kell. Lépj be az iskolai fiókoddal, aztán próbáld újra."
              : reason === "unsupported"
                ? "Ez a böngésző nem tudja fogadni az értesítéseket."
                : "Az értesítések most nem kapcsolhatók be — próbáld újra később.",
    );
  };

  //! A KIKAPCSOLÁS CSAK ADDIG TART, AMEDDIG EZ A PÁRBESZÉD LÁT. Ha a
  //! készüléken a MÁSIK alanyra is van feliratkozás (osztályfőnök tanár), akkor
  //! ez a gomb nem az egész harangot oltja el, csak a saját listáját üríti — a
  //! diák-oldali beállítást egy tanári panelen nyomott „Kikapcsolás" nem
  //! veheti el, mert arról a felhasználó itt semmit nem lát.
  const turnOff = async () => {
    setBusy(true);
    if (other.length > 0) {
      await updatePush(prefsToSave([]));
    } else {
      await disablePush();
      setEnabled(false);
    }
    setSelected([]);
    setBusy(false);
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
        onClick={openDialog}
        className={sheetItem(className)}
      >
        {enabled && selected.length > 0 ? (
          <BellRing className="size-4 shrink-0 text-primary" aria-hidden />
        ) : (
          <Bell className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        )}
        <SheetItemBody
          label="Értesítés"
          hint={
            //* A „Bekapcsolva" ITT ARRA az alanyra vonatkozik, amit ez a
            //* párbeszéd szerkeszt: egy tanári panelen a diák-oldali
            //* feliratkozás nem tenné igazzá.
            selected.length > 0 && enabled
              ? "Bekapcsolva"
              : "Napi emlékeztető az órarendről"
          }
        />
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
                  {/*//! A TANÁRNAK MÁS A JELZÉS ELSŐ SORA, ÉS EZT ELŐRE
                      //! KIMONDJUK. Nála nem a tantárgy a hír (azt tanítja
                      //! egész nap), hanem az OSZTÁLY és a TEREM — lásd
                      //! `teacherReminderText` a `push-plan.ts`-ben. */}
                  {mode === "teacher" && (
                    <>
                      {" "}
                      Az emlékeztető azzal kezdi, melyik osztályhoz és melyik
                      terembe kell menned.
                    </>
                  )}
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
              {/*//! AZ ALANY NEM MAGÁTÓL ÉRTETŐDIK. A lap egy osztály (vagy egy
                  //! tanár) órarendjét mutatja, de a harang MÁSIKRA is
                  //! beállítható (nyelvi csoport, testvér, duális pár — a
                  //! tanárnál helyettesítés). Ezért kimondjuk, melyik van most
                  //! kiválasztva — és nem csak jelöljük. */}
              <p className="text-sm text-muted-strong">
                {currentSubject ? (
                  <>
                    Most a(z){" "}
                    <span className="font-medium text-foreground">
                      {currentSubject}
                    </span>{" "}
                    órarendjét nézed. Erről szólunk — ha más (is) kell, válaszd
                    ki alább.
                  </>
                ) : (
                  <>Válaszd ki, melyik {words.one} órarendjéről szóljunk.</>
                )}
              </p>

              <div className="max-h-52 overflow-y-auto rounded-lg border border-input p-2">
                <div className="flex flex-wrap gap-1.5">
                  {subjects.map((c) => {
                    const on = selected.includes(c.short);
                    const full = !on && selected.length >= max;
                    return (
                      <button
                        key={c.short}
                        type="button"
                        aria-pressed={on}
                        disabled={full}
                        //* A tanári jel (`KJ`) magában nem azonosít senkit —
                        //* a teljes nevet ezért a gomb címkéje viseli.
                        title={c.name !== c.short ? c.name : undefined}
                        onClick={() => toggleSubject(c.short)}
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
            {/*//! KIKAPCSOLNI CSAK AZT LEHET, AMI BE VAN KAPCSOLVA — ÉS ITT az
                //! „ami" ennek a párbeszédnek az alanyfajtája. Az osztályfőnök
                //! tanár készülékén a feliratkozás él (`enabled`), de ha erre az
                //! alanyra még nincs kiválasztva senki, egy „Kikapcsolás" gomb
                //! olyat ígérne, amit nem tud megtenni. */}
            {enabled && selected.length > 0 ? (
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
