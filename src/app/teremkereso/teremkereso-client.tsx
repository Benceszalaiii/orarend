"use client";

import { DoorOpen, Monitor, Search, TriangleAlert } from "lucide-react";
import { animate, useMotionValue } from "motion/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CrestField, PAGE_COLUMNS } from "@/components/chrome/page-field";
import { SITE_BAR_MAX, StandingLine } from "@/components/chrome/standing-line";
import { DayStrip } from "@/components/ma/day-strip";
import { SiteFooter } from "@/components/site-footer";
import {
  addDaysKey,
  DAY_NAMES,
  dateFromKey,
  focusMondayKey,
  minLabel,
  todayKey,
} from "@/components/timetable/shared";
import { useClock, useVisibilityEpoch } from "@/components/timetable/use-clock";
import { MorphingInfinity } from "@/components/ui/morphing-infinity";
import type { FreeRoomsAnswer, RoomStatus } from "@/lib/free-rooms";
import { cn } from "@/lib/utils";

//* ---------------------------------------------------------------------------
//* TEREMKERESŐ — MELYIK TEREM ÜRES
//* ---------------------------------------------------------------------------
//! UGYANAZ A BUROK, MINT A `/ma`-NAK ÉS A `/ugyelet`-NEK. A lap ugyanarra a
//! kérdésfajtára válaszol — „mi van MOST" —, csak megint más alanyról: nem az
//! órákról és nem az ügyeletekről, hanem a termekről. Aki a napi nézetet
//! ismeri, itt egyetlen új vezérlőt sem tanul: fénymező, ragadó fejléc,
//! napsáv, alatta a válasz.
//!
//! AMI VISZONT ÚJ: AZ IDŐ IS VÁLASZTHATÓ. A `/ma` és a `/ugyelet` egy NAPOT
//! lapoz, és azon belül a „most" adott. Itt a nap magában nem kérdés — „üres-e
//! a 102-es" csak egy IDŐPONTRA válaszolható meg. Ezért a napsáv alatt ott az
//! óra-választó is, és az alapállás a „most".
//*
//! A SEPRÉST NEM MI VÉGEZZÜK. Egy hét teremfoglaltsága 71 kérés a Jedlikinfo
//! felé; ezt a szerver csinálja meg óránként egyszer, mindenki helyett (lásd
//! `lib/free-rooms-source.ts`). A lap egyetlen kérést küld: `/api/termek`.

type Answer = FreeRoomsAnswer & { ageMinutes: number };

//! ÖT PERCENKÉNT ELÉG. A válasz csak óra HATÁRokon változik, nem percenként —
//! egy nyitva felejtett lap ne küldjön percenként kérést. A lap ezen felül
//! akkor is frissít, amikor a felhasználó visszatér rá (`useVisibilityEpoch`),
//! és az a gyakoribb eset: a telefont zsebre teszik, nem nézik.
const REFRESH_BUCKET_MINUTES = 5;

const DAY_FMT = new Intl.DateTimeFormat("hu-HU", {
  month: "short",
  day: "numeric",
  weekday: "long",
});

export function TeremkeresoPage() {
  const clock = useClock();
  const epoch = useVisibilityEpoch();
  const progress = useMotionValue(0);

  const [today, setToday] = useState<string | null>(null);
  const [weekStart, setWeekStart] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  //! A „MOST" NEM EGY PERC, HANEM EGY ÁLLAPOT. Ha a mostani percet tennénk el
  //! számként, a lap fél óra múlva is arra a percre válaszolna, és semmi nem
  //! árulná el, hogy megállt az idő. A `null` azt jelenti: kérdezd meg a
  //! szervert, hány óra van — a budapesti időt úgyis ő tudja pontosan.
  const [pickedMin, setPickedMin] = useState<number | null>(null);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState("");
  const [onlyComputers, setOnlyComputers] = useState(false);

  //* A hétvége a KÖVETKEZŐ hetet kérdezi — ugyanaz a döntés, mint az órarendé
  //* és az ügyeleté, ugyanabból a függvényből, hogy a három lap ne mondjon
  //* három különböző „mostani hetet".
  useEffect(() => {
    const key = todayKey();
    const monday = focusMondayKey(key);
    setToday(key);
    setWeekStart(monday);
    const offset = Math.round(
      (Date.parse(`${key}T00:00:00`) - Date.parse(`${monday}T00:00:00`)) /
        86_400_000,
    );
    setIndex(offset >= 0 && offset <= 4 ? offset : 0);
  }, []);

  const shownKey = weekStart ? addDaysKey(weekStart, index) : null;
  const isToday = today !== null && shownKey === today;
  //! A „MOST" GOMB CSAK A MAI NAPON VAN OTT — egy keddi lapon a „most" nem
  //! jelent semmit. Az IDŐPONT viszont átjön a napváltáson: aki 16:25-kor néz
  //! át keddre, arra kíváncsi, mi van kedden UGYANEKKOR. A cím ilyenkor ki is
  //! írja („16:25-kor szabad"), tehát a szám nem magyarázat nélküli.
  const liveNow = pickedMin === null && isToday;
  const bucket =
    liveNow && clock
      ? Math.floor(clock.min / REFRESH_BUCKET_MINUTES)
      : pickedMin;

  //! A `bucket` ÉS AZ `epoch` NEM ADAT, HANEM ÓRAJEL. Egyiket sem OLVASSA a
  //! hatás — az a dolguk, hogy ÚJRA lefuttassák: a `bucket` ötpercenként, az
  //! `epoch` akkor, amikor a felhasználó visszatér a laphoz. Kihagyva a lap
  //! némán megállna azon a percen, amelyiken megnyitották, és egy rég véget ért
  //! órát mutatna folyamatban lévőnek.
  // biome-ignore lint/correctness/useExhaustiveDependencies: a `bucket` és az `epoch` szándékos újrafuttató jel, nem olvasott érték
  useEffect(() => {
    if (!shownKey) return;
    let alive = true;
    const params = new URLSearchParams({ nap: shownKey });
    if (pickedMin !== null) params.set("ido", minLabel(pickedMin));

    //! EGY ELBUKOTT FRISSÍTÉS NE VEGYE EL AZT, AMI MÁR KINT VAN. Az ötperces
    //! frissítés a folyosón, gyenge térerőn is lefut; ha ilyenkor kiürítenénk a
    //! lapot, a diák pont akkor veszítené el a listát, amikor odaért vele a
    //! terem elé. A régi válasz marad — a kelte a lap alján áll —, és a hiba
    //! csak akkor válik látható üzenetté, ha nincs mit helyette mutatni.
    void fetch(`/api/termek?${params}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: Answer | null) => {
        if (!alive) return;
        if (data) setAnswer(data);
        setFailed(data === null);
      })
      .catch(() => {
        if (alive) setFailed(true);
      });

    return () => {
      alive = false;
    };
  }, [shownKey, pickedMin, bucket, epoch]);

  //! ─── A NAPSÁV JELÖLŐJÉT A `progress` MOZGATJA, NEM AZ `index` ────────────
  //! A `DayStrip` nem a kiválasztott napot rajzolja alá, hanem oda csúsztatja a
  //! jelölőt, ahol a `progress` (törtindexű nap) éppen áll — a `/ma`-n és a
  //! `/ugyelet`-en ezt a lapozható napköteg (`DayDeck`) hajtja, ujjal húzás
  //! közben is folyamatosan. EZEN a lapon nincs köteg: a tartalom nem lapoz,
  //! csak cserélődik. Amíg tehát senki nem írta a `progress`-t, az nullán
  //! maradt, és a sáv makacsul a HÉTFŐT jelölte akkor is, amikor alatta
  //! csütörtök állt. Itt ezért mi mozgatjuk — ugyanazzal a rugóval, amivel a
  //! köteg tenné, hogy a jelölő ne ugorjon, hanem átcsússzon.
  useEffect(() => {
    const run = animate(progress, index, {
      type: "spring",
      bounce: 0,
      duration: 0.4,
    });
    return () => run.stop();
  }, [index, progress]);

  const days = useMemo(
    () =>
      weekStart
        ? [0, 1, 2, 3, 4].map((i) => ({
            dateKey: addDaysKey(weekStart, i),
            name: DAY_NAMES[i] ?? "",
          }))
        : [],
    [weekStart],
  );

  const pickIndex = useCallback((next: number) => {
    setIndex(Math.min(Math.max(next, 0), 4));
    //* Napot váltva a „most" újra alapállás — a tegnapi 10:15 a holnapi lapon
    //* nem kérdés, csak egy ottfelejtett szám.
    setPickedMin(null);
  }, []);

  const todayIndex = days.findIndex((d) => d.dateKey === today);

  const line = (
    <StandingLine
      line={{
        subject: "Teremkereső",
        context: shownKey
          ? isToday
            ? "ma"
            : DAY_FMT.format(dateFromKey(shownKey))
          : undefined,
        weekLetter: answer?.day?.week ?? "",
        offCurrent: todayIndex >= 0 && !isToday,
        onReturn: todayIndex >= 0 ? () => pickIndex(todayIndex) : undefined,
        returnLabel: "Ma",
        returnTitle: "A mai nap termei",
      }}
    />
  );

  return (
    <main className="relative flex min-h-[100dvh] flex-col bg-background tt-safe">
      <CrestField />

      <div className="ma-chrome sticky top-0 z-30 text-hero-foreground">
        <div className={cn("mx-auto w-full", SITE_BAR_MAX)}>{line}</div>
        {days.length > 0 && (
          <div className={cn(PAGE_COLUMNS, "pb-1.5")}>
            <div className="min-w-0">
              <DayStrip
                days={days}
                index={index}
                progress={progress}
                todayDateKey={today ?? ""}
                onPick={pickIndex}
              />
            </div>
          </div>
        )}
      </div>

      <div
        className={cn(
          "relative z-10 mx-auto w-full max-w-5xl grow px-4 pt-4 pb-10 sm:px-6",
          "lg:grid lg:grid-cols-[minmax(0,1fr)_19rem] lg:items-start lg:gap-8",
        )}
      >
        <div className="min-w-0">
          <h2 className="text-2xl font-bold tracking-tight first-letter:uppercase sm:text-3xl">
            {shownKey ? DAY_FMT.format(dateFromKey(shownKey)) : " "}
          </h2>

          <SlotPicker
            periods={answer?.periods ?? []}
            pickedMin={pickedMin}
            shownMin={answer?.minute ?? null}
            canPickNow={isToday}
            onPick={setPickedMin}
          />

          <Result
            answer={answer}
            failed={failed}
            live={liveNow}
            query={query}
            onQuery={setQuery}
            onlyComputers={onlyComputers}
            onOnlyComputers={setOnlyComputers}
          />
        </div>

        <div className="mt-14 space-y-8 lg:mt-0">
          <BusyPanel
            answer={answer}
            query={query}
            onlyComputers={onlyComputers}
          />
          <SourceNote answer={answer} failed={failed} />
        </div>
      </div>

      <SiteFooter className="relative z-10" />
    </main>
  );
}

//! ─── AZ IDŐ ÓRÁKBAN, NEM PERCEKBEN ─────────────────────────────────────────
//! Egy diák nem 10:07-re kérdez rá, hanem a HARMADIK ÓRÁRA. Egy szabad
//! szöveges időmező pont azt kérné tőle, amit nem tud fejből (mikor kezdődik a
//! hatodik), és pont azt engedné elrontani, ami itt a kérdés lényege. A
//! csengetési rend a válaszból jön, tehát rövidített napon ezek a gombok is
//! elcsúsznak vele — pontosan úgy, ahogy kell.
function SlotPicker({
  periods,
  pickedMin,
  shownMin,
  canPickNow,
  onPick,
}: {
  periods: FreeRoomsAnswer["periods"];
  pickedMin: number | null;
  shownMin: number | null;
  canPickNow: boolean;
  onPick: (min: number | null) => void;
}) {
  return (
    <div className="mt-4 flex flex-wrap items-center gap-1.5">
      {canPickNow && (
        <SlotChip
          active={pickedMin === null}
          onClick={() => onPick(null)}
          label={
            pickedMin === null && shownMin !== null
              ? `Most · ${minLabel(shownMin)}`
              : "Most"
          }
        />
      )}
      {periods.map((p) => (
        <SlotChip
          key={p.number}
          active={pickedMin !== null && pickedMin === p.startMin}
          onClick={() => onPick(p.startMin)}
          label={`${p.number}.`}
          title={`${p.number}. óra · ${minLabel(p.startMin)}–${minLabel(p.endMin)}`}
        />
      ))}
    </div>
  );
}

function SlotChip({
  active,
  onClick,
  label,
  title,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={active}
      className={cn(
        "rounded-full px-3 py-1.5 text-sm font-medium tabular-nums transition-colors",
        active
          ? "bg-foreground text-background"
          : "bg-foreground/[0.06] text-muted-strong hover:bg-foreground/10",
      )}
    >
      {label}
    </button>
  );
}

//* ---------------------------------------------------------------------------

function Result({
  answer,
  failed,
  live,
  query,
  onQuery,
  onlyComputers,
  onOnlyComputers,
}: {
  answer: Answer | null;
  failed: boolean;
  live: boolean;
  query: string;
  onQuery: (value: string) => void;
  onlyComputers: boolean;
  onOnlyComputers: (value: boolean) => void;
}) {
  //! A HIBA CSAK AKKOR ÜZENET, HA NINCS HELYETTE ADAT. Amíg a korábbi válasz
  //! kint van, azt mutatjuk tovább (a hibáról a lap alja szól) — egy üres lap
  //! többet venne el, mint amennyit egy figyelmeztetés ad.
  if (!answer) {
    return failed ? (
      <p className="mt-8 rounded-xl border border-dashed border-border px-4 py-5 text-sm text-pretty text-muted-strong">
        A teremfoglaltság most nem érhető el. A Jedlikinfo API-ból jön, és a
        hiba is onnan — próbáld újra néhány perc múlva.
      </p>
    ) : (
      <div className="mt-16 flex justify-center">
        <MorphingInfinity className="size-20 text-muted-foreground" />
      </div>
    );
  }

  //! A TANÍTÁS NÉLKÜLI NAPON A „71 SZABAD TEREM" IGAZ, ÉS HASZONTALAN. Aki ezt
  //! a lapot megnyitja, nem arra kíváncsi, hogy szünetben üres az iskola —
  //! kimondjuk hát, hogy ezen a napon nincs mit keresni.
  if (answer.day?.teaching === false) {
    return (
      <p className="mt-8 rounded-xl border border-dashed border-border px-4 py-5 text-sm text-pretty text-muted-strong">
        Ezen a napon nincs tanítás, ezért minden terem üres.
      </p>
    );
  }

  const free = filterRooms(answer.free, query, onlyComputers);
  const filtering = onlyComputers || query.trim().length > 0;

  return (
    <section aria-label="Szabad termek" className="mt-8">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="flex items-center gap-1.5 text-base font-semibold text-foreground">
          <DoorOpen className="size-4 text-muted-foreground" aria-hidden />
          {live ? "Most szabad" : `${minLabel(answer.minute)}-kor szabad`}
        </h3>
        {/*//* Szűrés közben a MUTATOTT darabszám a válasz — a teljes 70 mellé
            //* írva csak azt kellene fejben kivonni, hány maradt. */}
        <p className="text-sm tabular-nums text-muted-foreground">
          {filtering
            ? `${free.length} / ${answer.free.length} terem`
            : `${answer.free.length} terem`}
        </p>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <label className="relative flex min-w-[11rem] grow items-center">
          <Search
            className="pointer-events-none absolute left-3 size-4 text-muted-foreground"
            aria-hidden
          />
          <span className="sr-only">Terem keresése</span>
          <input
            type="search"
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder="Terem szűrése (102, labor, tor…)"
            className="w-full rounded-xl border border-border bg-background/60 py-2 pr-3 pl-9 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-foreground/30"
          />
        </label>
        <button
          type="button"
          onClick={() => onOnlyComputers(!onlyComputers)}
          aria-pressed={onlyComputers}
          className={cn(
            "flex shrink-0 items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-medium transition-colors",
            onlyComputers
              ? "border-foreground bg-foreground text-background"
              : "border-border text-muted-strong hover:bg-foreground/[0.06]",
          )}
        >
          <Monitor className="size-4" aria-hidden />
          Csak géptermek
        </button>
      </div>

      {free.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-5 text-sm text-pretty text-muted-strong">
          {answer.free.length === 0
            ? "Ebben a percben egyetlen terem sem szabad."
            : onlyComputers && !query.trim()
              ? "Ebben a percben egyetlen gépterem sem szabad."
              : "Erre a szűrésre nincs szabad terem."}
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {free.map((room) => (
            <li
              key={room.short}
              className="rounded-xl border border-border bg-foreground/[0.03] px-3 py-2.5"
            >
              <p className="truncate font-semibold text-foreground">
                {room.short}
              </p>
              {room.name !== room.short && (
                <p className="truncate text-xs text-muted-foreground">
                  {room.name}
                </p>
              )}
              {/*//! MEDDIG SZABAD — MERT KÜLÖNBEN A FELIRAT FÉLREVEZET. Egy két
                  //! perc múlva kezdődő óra alatt a terem technikailag üres,
                  //! csak épp nincs értelme bemenni. */}
              <p className="mt-1 text-xs tabular-nums text-muted-strong">
                {room.freeUntil === null
                  ? "a nap végéig"
                  : `${minLabel(room.freeUntil)}-ig`}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

//! ─── A FORDÍTOTT KÉRDÉS ────────────────────────────────────────────────────
//! „Melyik terem szabad" mellett van egy másik, majdnem ilyen gyakori kérdés:
//! „és a 102-esben mi van?" Ugyanaz az adat, csak a másik oldaláról — ezért nem
//! egy másik lap, hanem a jobb sáv. A szűrőmező mindkét listára hat, tehát egy
//! konkrét terem beírásával megkapható a válasz akkor is, ha épp foglalt.
function BusyPanel({
  answer,
  query,
  onlyComputers,
}: {
  answer: Answer | null;
  query: string;
  onlyComputers: boolean;
}) {
  if (!answer || answer.day?.teaching === false) return null;
  const busy = filterRooms(answer.busy, query, onlyComputers);
  if (answer.busy.length === 0) return null;

  return (
    <section aria-labelledby="busy-heading">
      <h2
        id="busy-heading"
        className="mb-3 text-base font-semibold text-foreground"
      >
        Foglalt termek
        <span className="ml-2 text-sm font-normal tabular-nums text-muted-foreground">
          {busy.length === answer.busy.length
            ? answer.busy.length
            : `${busy.length} / ${answer.busy.length}`}
        </span>
      </h2>
      {busy.length === 0 ? (
        <p className="text-sm text-muted-strong">
          Erre a szűrésre nincs foglalt terem.
        </p>
      ) : (
        <ul className="flex flex-col gap-1">
          {busy.map((room) => (
            <li
              key={room.short}
              className="flex items-baseline gap-3 rounded-lg px-2 py-1.5 text-sm"
            >
              <span className="w-14 shrink-0 truncate font-medium text-foreground">
                {room.short}
              </span>
              <span className="min-w-0 flex-1 truncate text-muted-strong">
                {room.booking?.subject}
                {room.booking?.classShort
                  ? ` · ${room.booking.classShort}`
                  : ""}
              </span>
              {room.booking && (
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  {minLabel(room.booking.endMin)}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

//! AMIRŐL NEM TUDUNK, AZT KI KELL MONDANI. A 71 teremből egy-egy lekérése
//! elbukhat; az ilyen terem NEM kerül a szabadok közé (lásd `lib/free-rooms.ts`),
//! de elhallgatni sem szabad — aki épp azt keresi, annak tudnia kell, hogy
//! erről a lap nem tud nyilatkozni.
function SourceNote({
  answer,
  failed,
}: {
  answer: Answer | null;
  failed: boolean;
}) {
  return (
    <div className="space-y-3">
      {/*//* Ha a lista a helyén maradt egy elbukott frissítés után, azt itt
          //* mondjuk ki — a fenti lap ilyenkor szándékosan nem változik. */}
      {failed && answer && (
        <p className="text-xs leading-relaxed text-pretty text-muted-strong">
          A legutóbbi frissítés nem sikerült, ezért a lista a korábbi lekérésből
          van.
        </p>
      )}
      {answer && answer.unknown.length > 0 && (
        <p className="flex gap-2 rounded-xl border border-border px-3 py-2.5 text-xs leading-relaxed text-pretty text-muted-strong">
          <TriangleAlert
            className="mt-px size-3.5 shrink-0 text-muted-foreground"
            aria-hidden
          />
          <span>
            Ezekről a termekről most nem tudunk semmit:{" "}
            <span className="font-medium text-foreground">
              {answer.unknown.join(", ")}
            </span>
            . Lehet, hogy szabadok, de nem állítjuk.
          </span>
        </p>
      )}
      <p className="text-xs leading-relaxed text-pretty text-muted-foreground">
        {answer && answer.ageMinutes > 0
          ? ` Ez a válasz ${answer.ageMinutes} perce kelt`
          : ""}. Óránként frissül.
      </p>
    </div>
  );
}

//! ─── A SORREND A TEREM JELÉT KÖVETI, NEM A SZABADSÁG HOSSZÁT ──────────────
//! A lista addig hasznos, amíg RÁ LEHET NÉZNI: aki a 203-at keresi, az a
//! kettessel kezdődők közt húzza végig a szemét. A „meddig szabad" szerinti
//! rendezés ezt lehetetlenné tette — ugyanaz a terem óránként máshova
//! került —, ezért a rendezés most a jel szerint megy, három csoportban:
//!
//!   1. csak számozott termek (`102`, `022`, `41`, és a `119-1` is: betű nincs
//!      benne)
//!   2. épületjelöléssel számozottak: `T1`…`T6`, `B1`…`B8`, `Klub1`, `Klub2`
//!   3. a többi, néven nevezett helyiség (`Könyvtár`, `Heg`, `tor`, `Étkező`)
//!
//! A 2. csoport szabálya BETŰ + SZÁM, nem pusztán kezdőbetű — különben a `tor`,
//! a `tor2` és a `tár` is a T-terembe keveredne, pedig azok nem a T-sor tagjai.
//! A „meddig szabad" nem vész el: ott áll minden kártyán.
function roomGroup(short: string): number {
  if (!/\p{L}/u.test(short)) return 0;
  if (/^(t|b|klub)\d/i.test(short)) return 1;
  return 2;
}

function byRoomOrder(a: RoomStatus, b: RoomStatus): number {
  return (
    roomGroup(a.short) - roomGroup(b.short) ||
    //* Számérzékeny összehasonlítás, hogy a `22` a `102` ELÉ kerüljön.
    a.short.localeCompare(b.short, "hu", { numeric: true })
  );
}

//! ─── A GÉPTERMEK LISTÁJA KÉZZEL ÁLL, MERT A FORRÁS NEM TUDJA ──────────────
//! A Jedlikinfo a termekről csak a jelüket és a nevüket mondja meg — azt nem,
//! hogy van-e bennük gép. Ez a halmaz tehát ISKOLAI TUDÁS, nem levezetés: ha
//! egy terem gépet kap vagy elveszíti, ITT kell átírni, más nem fogja észrevenni.
const COMPUTER_ROOMS: ReadonlySet<string> = new Set(
  [
    "102",
    "103",
    "202",
    "203",
    "302",
    "303",
    "B1",
    "B2",
    "B3",
    "B4",
    "B5",
    "B6",
    "B7",
    "B8",
    "115",
    "116",
    "117",
    "118",
    "25",
    "plc",
    "41",
  ].map((short) => short.toLocaleLowerCase("hu")),
);

function isComputerRoom(short: string): boolean {
  return COMPUTER_ROOMS.has(short.trim().toLocaleLowerCase("hu"));
}

//* Jelre és névre egyaránt szűrünk: a „labor" ugyanúgy találjon, mint a „102".
function filterRooms(
  rooms: RoomStatus[],
  query: string,
  onlyComputers: boolean,
): RoomStatus[] {
  const needle = query.trim().toLocaleLowerCase("hu");
  return rooms
    .filter((room) => {
      if (onlyComputers && !isComputerRoom(room.short)) return false;
      if (!needle) return true;
      return (
        room.short.toLocaleLowerCase("hu").includes(needle) ||
        room.name.toLocaleLowerCase("hu").includes(needle)
      );
    })
    .sort(byRoomOrder);
}
