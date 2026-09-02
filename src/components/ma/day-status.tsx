"use client";

import {
  AlertTriangle,
  BellRing,
  Briefcase,
  CalendarClock,
  CalendarDays,
  Check,
  CloudOff,
} from "lucide-react";
import { countdownLabel } from "@/components/timetable/now";
import {
  durationLabel,
  minLabel,
  rangeLabel,
} from "@/components/timetable/shared";
import { DUAL_DAY_END_MIN, DUAL_DAY_START_MIN } from "@/lib/dualis";
import { TIMETABLE_SOURCE } from "@/lib/timetable";
import { ageLabel } from "@/lib/timetable-cache";
import { cn } from "@/lib/utils";
import type { DayModel } from "./day";

//* ---------------------------------------------------------------------------
//* A NAPI ELLENŐRZÉS SORA
//* ---------------------------------------------------------------------------
//! EGY SOR, KÉT HANGNEM. A Jedlikinfo `movedCard` jelölése az EGYETLEN elsődleges
//! forrásból jövő jelzés az áthelyezett órákról, és ritkán van bekapcsolva —
//! vagyis ez a sor a napok túlnyomó részén „nincs semmi" lesz.
//!
//! Ezért NEM üresen álló dobozként épült meg. Ha egy figyelmeztetés csak akkor
//! jelenik meg, amikor baj van, akkor a hiánya nem mond semmit: nem lehet tudni,
//! hogy nincs változás, vagy csak nem néztük meg. A sor ezért MINDIG ott van,
//! azonos helyen, és a hangneme vált — nem a léte.
//*
//* A megfogalmazás szándékosan óvatos: „nincs jelzett változás", nem „semmi nem
//* változott". Amit a suli nem jelöl meg, arról mi sem tudunk.

export function ChangeRow({
  day,
  className,
}: {
  day: DayModel;
  className?: string;
}) {
  if (day.moved.length === 0) {
    return (
      <p
        className={cn(
          "flex items-center gap-2 text-sm text-muted-strong",
          className,
        )}
        title={`A ${TIMETABLE_SOURCE} nem jelölt meg egyetlen mai órát sem áthelyezettként.`}
      >
        <Check className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        Nincs jelzett változás
      </p>
    );
  }

  const first = day.moved[0];
  const rest = day.moved.length - 1;
  return (
    <p
      className={cn(
        "flex items-center gap-2 rounded-xl border border-brand/40 bg-brand/10 px-4 py-3 text-sm text-foreground",
        className,
      )}
      //! A figyelmeztetés megjelenése VALÓDI hír: a képernyőolvasó is kapja meg,
      //! de udvariasan — nem szakítja félbe, amit épp olvas.
      aria-live="polite"
    >
      <AlertTriangle className="size-4 shrink-0 text-brand" aria-hidden />
      <span className="min-w-0 flex-1 text-pretty">
        <span className="font-medium">Áthelyezve:</span>{" "}
        {first.lesson.subject || first.lesson.subjectShort}
        {first.rooms[0] ? ` · ${first.rooms[0]}` : ""} ·{" "}
        <span className="tabular-nums">{minLabel(first.startMin)}</span>
        {rest > 0 && ` · és még ${rest}`}
      </span>
    </p>
  );
}

//* ---------------------------------------------------------------------------
//* A NAP KÖRÜLMÉNYEI — a tanév rendjéből
//* ---------------------------------------------------------------------------
//! EZ NEM AZ ÓRAREND, HANEM AZ, AMI KÖRÜLVESZI. A kártyák nem mondják meg, hogy
//! aznap rövidítettek-e az órák, hogy van-e egyáltalán tanítás, és hogy
//! történik-e valami az iskolában — ezt a tanév rendje tudja
//! (`school-calendar.ts`).
//!
//! ÉS ITT NINCS HELYFENNTARTÁS, a `ChangeRow`-val ellentétben. Ott a hiány
//! kétértelmű lenne („nincs változás" vagy „nem néztük meg"?), mert a sor egy
//! ELLENŐRZÉS eredményét mutatja. Ez a sor viszont nem ellenőriz semmit: ha a
//! naphoz nincs bejegyzés, akkor nincs — ezt nem kell kimondani.
export function DayPlanRow({
  day,
  isToday,
  className,
}: {
  day: DayModel;
  isToday: boolean;
  className?: string;
}) {
  const off = day.teaching === false;
  if (!off && !day.bells && day.notes.length === 0) return null;

  const title = off
    ? isToday
      ? "Ma nincs tanítás"
      : "Ezen a napon nincs tanítás"
    : day.bells
      ? `Eltérő csengetési rend — ${day.bells.name}`
      : "A tanév rendjéből";

  return (
    <div
      className={cn(
        "rounded-xl border px-4 py-3 text-sm",
        day.bells
          ? "border-brand/40 bg-brand/10 text-foreground"
          : "border-border bg-muted/40 text-foreground",
        className,
      )}
    >
      <p className="flex items-center gap-2 font-medium">
        {day.bells ? (
          <BellRing className="size-4 shrink-0 text-brand" aria-hidden />
        ) : (
          <CalendarDays
            className="size-4 shrink-0 text-muted-foreground"
            aria-hidden
          />
        )}
        {title}
      </p>
      {/*//* A bejegyzések a forrás szövegével, sorról sorra — se rövidítve, se
          //* átfogalmazva: az iskola mondatai. */}
      {day.notes.length > 0 && (
        <ul className="mt-1.5 space-y-0.5 text-pretty text-muted-strong">
          {day.notes.map((note, i) => (
            <li key={`${i}-${note}`}>{note}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

//* ---------------------------------------------------------------------------
//* A DUÁLIS NAP — a nap műszerfala
//* ---------------------------------------------------------------------------
//! AMI EZEN A NAPON IGAZ: 8-TÓL 3-IG A MUNKAHELYEN VAGY. Az osztály órarendje
//! nem a te napod, tehát a lap nem tesz úgy, mintha órákra járnál — de a
//! kérdés, amivel a lapot megnyitod, SZÓ SZERINT UGYANAZ, mint iskolai napon:
//! mennyi van még hátra.
//!
//! EZÉRT EZ A NAP HERO BLOKKJA. Iskolai napon a `NowBlock` felel erre, nagy
//! `tabular-nums` órával, karnyújtásnyiról olvashatóan. Duális napon nincs futó
//! óra, amire az kiülhetne — a lap eddig ezért maradt hero NÉLKÜL, a munkanap
//! meg egy 48 képpontos téglalapba szorult a nap listája helyén. Egy hétből két
//! nap kapott így fele akkora választ ugyanarra a kérdésre. Mostantól a duális
//! nap ugyanabban a sávban, ugyanazzal a nagy számmal válaszol; a téglalap
//! helye a lap közepén felszabadul.
//!
//! A SÁV MŰSZER, NEM DÍSZ. Óránként bevésett osztás fut rajta 9-től 14-ig: a
//! kitöltésről így LEOLVASHATÓ, hogy dél elmúlt-e — nem csak annyit mond, hogy
//! „valamennyi". A vezető élét a márkapiros vonalzó zárja: a lapon a piros
//! egyedül az élő „most" szerepe, és a munkanapban ez az.

const DUAL_START_SEC = DUAL_DAY_START_MIN * 60;
const DUAL_END_SEC = DUAL_DAY_END_MIN * 60;
//! AZ UTOLSÓ NEGYED ÓRA. Nem új doboz jelzi, hanem a nagy szám HANGJA vált
//! pirosra — ugyanaz a szerep, amit a lapon a „Most" jelvény visel.
const DUAL_FINAL_STRETCH_SEC = 15 * 60;

//* Az osztás a két végpont KÖZÖTT áll: a 8:00-t és a 15:00-t a feliratok
//* tartják, egy vonal ott csak ismételné őket.
const DUAL_TICK_MINS = Array.from(
  { length: Math.ceil((DUAL_DAY_END_MIN - DUAL_DAY_START_MIN) / 60) - 1 },
  (_, i) => DUAL_DAY_START_MIN + (i + 1) * 60,
).filter((m) => m > DUAL_DAY_START_MIN && m < DUAL_DAY_END_MIN);

//* Rövid alak: a sáv alatt egy sorban áll a két végponttal, ahol a
//* `durationLabel` teljes szavai („3 óra 20 perc") kitolnák a telefon sorát.
function gapLabel(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60);
  return h === 0 ? `${m} p` : `${h} ó ${m % 60} p`;
}

export function DualHero({
  //* Éjfél óta eltelt MÁSODPERC — csak ma; más napra `null`, mert ott nincs
  //* mit visszaszámolni. Másodperc, nem perc: az utolsó tíz percben a
  //* `countdownLabel` m:ss-re vált, ahogy az iskolai nap hero blokkjában is.
  nowSec,
  className,
}: {
  nowSec: number | null;
  className?: string;
}) {
  const span = DUAL_END_SEC - DUAL_START_SEC;
  const phase =
    nowSec === null
      ? "other"
      : nowSec < DUAL_START_SEC
        ? "before"
        : nowSec >= DUAL_END_SEC
          ? "after"
          : "live";
  const elapsedSec =
    nowSec === null ? 0 : Math.min(Math.max(nowSec - DUAL_START_SEC, 0), span);
  const remainingSec = nowSec === null ? span : DUAL_END_SEC - nowSec;
  //* A vonalzó és a kitöltés ugyanarra a hányadra ül: egy szám, két elem.
  const fraction = phase === "other" ? 0 : elapsedSec / span;
  const counting = phase === "live" || phase === "before";
  const countdown = countdownLabel(
    phase === "before" ? DUAL_START_SEC - (nowSec ?? 0) : remainingSec,
  );
  const finalStretch =
    phase === "live" && remainingSec <= DUAL_FINAL_STRETCH_SEC;
  //! „7:20" EGY ÓRAREND-ALKALMAZÁSBAN IDŐPONTNAK OLVASÓDIK. A `countdownLabel`
  //! az utolsó tíz percben m:ss-re vált — a `NowBlock`-ban ez egyértelmű, mert
  //! ott a futó óra ADATAI mellett áll —, itt viszont 36 képpontos számként a
  //! reggeli 7:20-cal téveszthető össze. A másodperc ezért kisebb súlyt kap a
  //! percnél, és a szám mögé kiül a „perc": az alak marad élő, az olvasat nem
  //! csúszik el.
  const [bigValue, bigTail] = countdown.value.includes(":")
    ? [
        countdown.value.slice(0, countdown.value.indexOf(":")),
        countdown.value.slice(countdown.value.indexOf(":")),
      ]
    : [countdown.value, null];
  const bigUnit = bigTail ? "perc" : countdown.unit;
  //* A lezárt nap NEM számol vissza: ott a nagy elem a munkanap két végpontja,
  //* a `countdownLabel` maradéka („0:00") nem lóghat a szám végére.

  //! A FEJLÉC MÁR KIMONDTA, HOGY HOL VAGY („Ma duális nap — a munkahelyen
  //! vagy"), a hero címkéje ezért nem ismételheti meg ugyanazt két sorral
  //! lejjebb. Amit ez a blokk hozzátesz, az a MUNKANAP mint mennyiség: a
  //! címke és a nagy szám együtt egyetlen mondat.
  const lead =
    phase === "live"
      ? "A munkanapodból"
      : phase === "after"
        ? "A munkanapod véget ért"
        : "A munkanapod";

  return (
    <section
      className={cn(
        "relative overflow-hidden rounded-2xl border border-hero-foreground/15 bg-hero-foreground/[0.06] p-5 select-none sm:p-6",
        className,
      )}
      aria-label="Duális nap"
    >
      {/*//! EGY MONDAT A KÉPERNYŐOLVASÓNAK. A nagy szám és a sáv ugyanazt a két
          //! adatot vágja szét látvánnyá; felolvasva ez egy mondat. */}
      <p className="sr-only">
        Duális nap: a munkanapod{" "}
        {rangeLabel(DUAL_DAY_START_MIN, DUAL_DAY_END_MIN)} között tart.
        {phase === "live" &&
          ` Eddig ${durationLabel(Math.round(elapsedSec / 60))} telt el, ${durationLabel(Math.round(remainingSec / 60))} van hátra.`}
        {phase === "before" &&
          ` ${durationLabel(Math.round((DUAL_START_SEC - (nowSec ?? 0)) / 60))} múlva kezdődik.`}
        {phase === "after" && " A munkanapod véget ért."}
      </p>

      <p className="text-sm font-medium text-hero-foreground/70">{lead}</p>

      {/*//! A LEGNAGYOBB ELEM AZ IDŐ — ugyanaz a döntés, mint a `NowBlock`-ban:
          //! aki ide néz, tudja, hol van; azt akarja tudni, MEDDIG. */}
      <p className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span
          className={cn(
            "text-4xl font-bold tracking-tight tabular-nums sm:text-5xl",
            finalStretch && "text-brand",
          )}
        >
          {counting
            ? bigValue
            : rangeLabel(DUAL_DAY_START_MIN, DUAL_DAY_END_MIN)}
          {counting && bigTail && (
            <span className="text-2xl font-semibold opacity-70 sm:text-3xl">
              {bigTail}
            </span>
          )}
        </span>
        {counting && bigUnit && (
          <span className="text-xl font-semibold text-hero-foreground/75 sm:text-2xl">
            {bigUnit}
          </span>
        )}
        <span className="text-sm text-hero-foreground/60">
          {phase === "live"
            ? "van hátra"
            : phase === "before"
              ? "múlva kezdődik"
              : phase === "after"
                ? ""
                : "tart"}
        </span>
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-hero-foreground/70">
        <span className="flex items-center gap-1.5">
          <Briefcase
            className="size-4 shrink-0 text-hero-foreground/45"
            aria-hidden
          />
          Duális képzés
        </span>
        {counting && (
          <span className="flex items-center gap-1.5 tabular-nums">
            <CalendarClock
              className="size-4 shrink-0 text-hero-foreground/45"
              aria-hidden
            />
            {rangeLabel(DUAL_DAY_START_MIN, DUAL_DAY_END_MIN)}
          </span>
        )}
      </div>

      {/*//! A MŰSZER. Nem a hero dísze: ez mondja meg, hogy a hátralévő idő a
          //! nap MELYIK pontján áll — délelőtt van-e még, vagy a délutánban. */}
      <div className="mt-5" aria-hidden>
        <div className="relative">
          <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-hero-foreground/10">
            {phase !== "other" && (
              <span
                className="tt-rail-fill absolute inset-0 rounded-full bg-primary/55"
                style={{ "--tt-f": fraction } as React.CSSProperties}
              />
            )}
            {/*//! A VEZETŐ ÉL MELEGEDIK — DE CSAK ÉLŐ NAPON. Az eltelt idő kékben
                //! áll; a legutolsó perce viszont már a „most"-hoz tartozik,
                //! ezért fut át a kitöltés vége a márkapirosba, és ott
                //! találkozik a vonalzóval. Egy lezárt munkanapon nincs mit
                //! melegíteni: ott a sáv végig hűvös marad. */}
            {phase === "live" && (
              <span
                className="tt-rail-head absolute inset-y-0 left-0 w-full"
                style={
                  { "--tt-p": `${fraction * 100}%` } as React.CSSProperties
                }
              >
                <span className="absolute inset-y-0 right-full w-8 bg-gradient-to-r from-transparent to-brand/60" />
              </span>
            )}
            {/*//! AZ OSZTÁS A KITÖLTÉS FÖLÖTT ÁLL. Alatta a betelt órákat elnyelné
                //! a kék — pont ott, ahol a leolvasás számít: a sáv
                //! MÉRHETŐSÉGE azon múlik, hogy a bevésés a betelt szakaszon is
                //! látszik. */}
            {DUAL_TICK_MINS.map((m) => (
              <span
                key={m}
                className="absolute inset-y-0 w-px bg-background/45"
                style={{
                  left: `${((m - DUAL_DAY_START_MIN) / (DUAL_DAY_END_MIN - DUAL_DAY_START_MIN)) * 100}%`,
                }}
              />
            ))}
          </div>
          {phase === "live" && (
            //* A blokk egyetlen piros eleme: hol tartunk most. A sávon KÍVÜL
            //* ül, mert túllóg rajta — a levágás csak a melegedő élre igaz.
            <span
              className="tt-rail-head absolute inset-y-0 left-0 w-full"
              style={{ "--tt-p": `${fraction * 100}%` } as React.CSSProperties}
            >
              <span className="absolute inset-y-[-4px] left-0 w-0.5 -translate-x-1/2 rounded-full bg-brand" />
            </span>
          )}
        </div>
        <div className="mt-1.5 flex justify-between gap-2 text-[11px] font-medium tabular-nums text-hero-foreground/50">
          <span>{minLabel(DUAL_DAY_START_MIN)}</span>
          {phase === "live" && (
            <span className="min-w-0 truncate font-bold text-hero-foreground/80">
              {gapLabel(elapsedSec / 60)} telt el
            </span>
          )}
          <span>{minLabel(DUAL_DAY_END_MIN)}</span>
        </div>
      </div>
    </section>
  );
}

//! MENNYIRE FRISS AZ ADAT. Csak akkor jelenik meg, ha van mit bevallani: a most
//! lekért órarend nem érdemel külön sort, egy tegnapi viszont igen.
export function StaleNote({
  fetchedAt,
  offline,
  className,
}: {
  fetchedAt: number;
  offline: boolean;
  className?: string;
}) {
  return (
    <p
      className={cn(
        "flex items-center gap-1.5 text-xs text-muted-foreground",
        className,
      )}
    >
      <CloudOff className="size-3.5 shrink-0" aria-hidden />
      {offline ? "Offline · " : ""}
      mentett órarend, {ageLabel(fetchedAt)} frissítve
    </p>
  );
}
