"use client";

import { ShieldCheck } from "lucide-react";
import { CrestField, PAGE_COLUMNS } from "@/components/chrome/page-field";
import { SITE_BAR_MAX, StandingLine } from "@/components/chrome/standing-line";
import { DayDeck } from "@/components/ma/day-deck";
import { DayStrip } from "@/components/ma/day-strip";
import { SiteFooter } from "@/components/site-footer";
import { dateFromKey, minLabel } from "@/components/timetable/shared";
import { DutyDayList } from "@/components/ugyelet/duty-day-list";
import { DutyNowBlock } from "@/components/ugyelet/duty-now";
import {
  type DutyWeekDay,
  useDutyDay,
} from "@/components/ugyelet/use-duty-day";
import { MorphingInfinity } from "@/components/ui/morphing-infinity";
import { cn } from "@/lib/utils";

//* ---------------------------------------------------------------------------
//* FOLYOSÓÜGYELET — KI ÁLL KINT, MIKOR, HOL
//* ---------------------------------------------------------------------------
//! UGYANAZ A BUROK, MINT A `/ma`-NAK, ÉS EZ NEM UTÁNZAT. A lap ugyanarra a
//! kérdésfajtára válaszol — „mi van MOST, és mi jön ezután" —, csak más
//! alanyról: nem az órákról, hanem az ügyeletekről. Aki a napi nézetet
//! használja, itt egyetlen új vezérlőt sem tanul: ragadó fejléc, napsáv,
//! lapozható napköteg, „most" doboz visszaszámlálóval, alatta a nap listája.
//!
//! AMI VISZONT NEM UGYANAZ: A NAPI NÉZET GÉPEZETE. A `use-day-view.ts` az
//! órarend köré épült (osztály, csoportbontás, duális beosztás, helyi példány,
//! használatjelzés) — ebből itt EGY sem értelmes. Ezért a lap a saját, sokkal
//! kisebb gépezetét hozza (`use-duty-day.ts`), és a burokból csak azt veszi
//! át, ami tényleg közös: a fénymezőt, a rácsot, a napsávot és a köteget.

const DAY_FMT = new Intl.DateTimeFormat("hu-HU", {
  month: "short",
  day: "numeric",
  weekday: "long",
});

export function UgyeletPage() {
  const dv = useDutyDay();
  const {
    days,
    index,
    shownKey,
    today,
    weekLetter,
    now,
    clock,
    epoch,
    pending,
    failed,
    isToday,
    progress,
    pickIndex,
  } = dv;

  //* A napsáv a hét öt napját mutatja; a mai csak akkor van köztük, ha nem
  //* hétvége van (ilyenkor a köteg már a KÖVETKEZŐ hetet lapozza).
  const todayIndex = days.findIndex((d) => d.dateKey === today);

  const line = (
    <StandingLine
      line={{
        subject: "Ügyelet",
        context: shownKey
          ? isToday
            ? "ma"
            : DAY_FMT.format(dateFromKey(shownKey))
          : undefined,
        weekLetter,
        //* A „Ma" gomb csak akkor létezik, ha van hova visszamenni: hétvégén a
        //* mai nap nincs a kötegben, tehát a gomb sem ígérheti.
        offCurrent: todayIndex >= 0 && !isToday,
        onReturn: todayIndex >= 0 ? () => pickIndex(todayIndex) : undefined,
        returnLabel: "Ma",
        returnTitle: "A mai nap ügyelete",
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

      {days.length === 0 ? (
        <div className="flex grow items-center justify-center">
          <MorphingInfinity className="size-24 text-muted-foreground" />
        </div>
      ) : (
        <div
          className={cn(
            "relative z-10 mx-auto w-full max-w-5xl grow px-4 pb-10 sm:px-6",
            "lg:grid lg:grid-cols-[minmax(0,1fr)_19rem] lg:items-start lg:gap-8",
          )}
        >
          {/*//! A NAP MAGA A FOGANTYÚ — ugyanaz a döntés, mint a `/ma`-n: a
              //! cím, a hero és a lista EGY lapon mozdul. Ha a hero állva
              //! maradna és csak a lista lapozna, a lap két különböző napról
              //! beszélne ugyanabban a pillanatban. */}
          <DayDeck
            keys={days.map((d) => d.dateKey)}
            index={index}
            onIndexChange={pickIndex}
            progress={progress}
            className="-mx-4 sm:-mx-6 lg:mx-0"
            renderPanel={(i) => {
              const panelDay = days[i];
              if (!panelDay) return null;
              return (
                <div className="px-4 sm:px-6 lg:px-0">
                  <DutyPanel
                    weekDay={panelDay}
                    //! A BEOSZTÁS MINDEN LAPON A SAJÁTJA, A „MOST" VISZONT CSAK
                    //! AZ AKTÍVÉ. A köteg a szomszéd napokat is kirajzolja (attól
                    //! sima a lapozás), és azoknak is megvan a teljes napjuk —
                    //! egy „nincs beosztás" felirat a lapozás alatt hazudna. A
                    //! „most" ellenben egyetlen naphoz tartozik: a maihoz.
                    active={i === index}
                    now={i === index ? now : null}
                    clock={clock}
                    epoch={epoch}
                    isToday={panelDay.dateKey === today}
                    pending={pending}
                    failed={failed}
                  />
                </div>
              );
            }}
          />

          <div className="mt-14 space-y-8 lg:mt-0">
            <LeaderPanel days={days} today={today} shownKey={shownKey} />
            <SourceNote />
          </div>
        </div>
      )}

      <SiteFooter className="relative z-10" />
    </main>
  );
}

//! EGY NAP, EGY LAP. A cím, a „most" doboz és a nap ügyeletei — pontosan az,
//! ami a `/ma` fő hasábjában áll, csak ügyeletre.
function DutyPanel({
  weekDay,
  active,
  now,
  clock,
  epoch,
  isToday,
  pending,
  failed,
}: {
  weekDay: DutyWeekDay;
  active: boolean;
  now: Parameters<typeof DutyNowBlock>[0]["now"];
  clock: Parameters<typeof DutyNowBlock>[0]["clock"];
  epoch: number;
  isToday: boolean;
  pending: boolean;
  failed: boolean;
}) {
  const day = weekDay.model;
  const notes = weekDay.plan?.notes ?? [];
  const weekLetter = weekDay.plan?.week ?? "";
  //! A TANÍTÁS NÉLKÜLI NAPON A BEOSZTÁS HAZUDNA. Az ügyeleti tábla heti
  //! ciklusú: szünetben, ünnepen is „megvan" benne a szerdai 3. szünet, csak
  //! épp nem áll ki rá senki. Kiírni tehát nem óvatosság, hanem tévedés.
  const restDay = weekDay.teaching === false;

  return (
    <div className="pt-3 pb-8 sm:pt-4">
      <div className="min-w-0">
        <h2 className="text-2xl font-bold tracking-tight first-letter:uppercase sm:text-3xl">
          {DAY_FMT.format(dateFromKey(weekDay.dateKey))}
        </h2>
        <p className="mt-1 text-sm text-hero-foreground/60">
          {isToday && "Ma · "}
          {restDay
            ? "Nincs tanítás — ezen a napon ügyelet sincs."
            : day
              ? `${day.breaks.length} ügyelet${weekLetter ? ` · ${weekLetter} hét` : ""}`
              : pending
                ? "Beosztás betöltése…"
                : failed
                  ? "Az ügyeleti beosztás most nem érhető el."
                  : "Erre a napra nincs beosztás."}
        </p>
        {notes.length > 0 && (
          <ul className="mt-2 flex flex-col gap-1">
            {notes.map((note) => (
              <li key={note} className="text-sm text-pretty text-muted-strong">
                {note}
              </li>
            ))}
          </ul>
        )}
      </div>

      {!restDay && (
        <>
          <div className="mt-6 lg:max-w-2xl">
            {/*//! A HERO CSAK A MAI NAPON MUTAT „MOST"-OT. Egy csütörtöki
                //! beosztás fölött a keddi óra állása semmit nem mond — a
                //! szomszéd lapokon ezért a nap listája az egyetlen tartalom. */}
            {active && isToday ? (
              <DutyNowBlock
                now={now}
                clock={clock}
                epoch={epoch}
                leader={day?.leader ?? weekDay.leader}
              />
            ) : (
              <DayLeadIn day={day} leader={day?.leader ?? weekDay.leader} />
            )}
          </div>

          <section aria-label="A nap ügyeletei" className="mt-8">
            <h3 className="mb-3 text-base font-semibold text-foreground">
              {isToday ? "A mai ügyeletek" : "A nap ügyeletei"}
            </h3>
            {day ? (
              <DutyDayList
                day={day}
                nowMin={active && isToday && clock ? clock.min : null}
              />
            ) : (
              <p className="rounded-xl border border-dashed border-border px-4 py-5 text-sm text-pretty text-muted-strong">
                {pending
                  ? "Töltés…"
                  : failed
                    ? "Az ügyeleti beosztás most nem érhető el. Próbáld újra később."
                    : "Erre a napra nem tudjuk, melyik hét van, ezért a beosztás sem dönthető el."}
              </p>
            )}
          </section>
        </>
      )}
    </div>
  );
}

//! NEM MAI NAPON A NAP ELEJE A KAPASZKODÓ. „Most" nincs, de az első ügyelet
//! időpontja és a vezetői ügyeletes ugyanúgy a nap két legfontosabb adata.
function DayLeadIn({
  day,
  leader,
}: {
  day: Parameters<typeof DutyDayList>[0]["day"] | null;
  leader: string | null;
}) {
  const first = day?.breaks[0] ?? null;
  return (
    <section className="rounded-2xl border border-hero-foreground/15 bg-hero-foreground/[0.06] p-5 sm:p-6">
      <p className="text-sm font-medium text-hero-foreground/70">
        A nap első ügyelete
      </p>
      <p className="mt-2 text-3xl font-bold tracking-tight tabular-nums">
        {first === null
          ? "—"
          : first.startMin === null
            ? first.name
            : minLabel(first.startMin)}
      </p>
      {leader && (
        <p className="mt-3 flex items-center gap-1.5 text-sm text-hero-foreground/70">
          <ShieldCheck className="size-3.5 shrink-0" aria-hidden />
          <span>
            Vezetői ügyelet:{" "}
            <span className="font-medium text-hero-foreground">{leader}</span>
          </span>
        </p>
      )}
    </section>
  );
}

//! ─── A HÉT VEZETŐI ÜGYELETE ────────────────────────────────────────────────
//! EZ AZ EGYETLEN ADAT, AMI NAPONKÉNT EGY SOR, ÉS HETENTE NÉZIK. A napok
//! listájában elveszne (egy sor a harminchat közt); a jobb sávban viszont
//! ötsoros, teljes válasz — pont az a fajta másodlagos kérdés, amire a `/ma`
//! jobb sávja is való.
function LeaderPanel({
  days,
  today,
  shownKey,
}: {
  days: DutyWeekDay[];
  today: string | null;
  shownKey: string | null;
}) {
  if (days.every((d) => !d.leader)) return null;
  return (
    <section aria-labelledby="leader-heading">
      <h2
        id="leader-heading"
        className="mb-3 flex items-center gap-1.5 text-base font-semibold text-foreground"
      >
        <ShieldCheck className="size-4 text-muted-foreground" aria-hidden />
        Vezetői ügyelet
      </h2>
      <ul className="flex flex-col gap-1">
        {days.map((d) => {
          const isToday = d.dateKey === today;
          return (
            <li
              key={d.dateKey}
              className={cn(
                "flex items-baseline gap-3 rounded-lg px-2 py-1.5 text-sm",
                d.dateKey === shownKey && "bg-foreground/[0.06]",
              )}
            >
              <span
                className={cn(
                  "w-16 shrink-0",
                  isToday
                    ? "font-semibold text-foreground"
                    : "text-muted-strong",
                )}
              >
                {d.name}
              </span>
              <span className="min-w-0 flex-1 truncate text-foreground">
                {d.leader ?? "—"}
              </span>
              {isToday && (
                <span
                  className="size-1.5 shrink-0 self-center rounded-full bg-brand"
                  aria-hidden
                />
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

//! HONNAN JÖN AZ IDŐ — MERT A FORRÁS NEM MONDJA. Az ügyeleti tábla csak a
//! szünet NEVÉT ismeri; a lapon látható időpontok az adott nap csengetési
//! rendjéből vannak levezetve (lásd `lib/hall-duty.ts`). Ezt nem hallgatjuk
//! el: rövidített napon a beosztás követi a csengetést, és aki tudja, miből
//! áll a szám, az azt is tudja, mikor gyanakodjon rá.
function SourceNote() {
  return (
    <p className="text-xs leading-relaxed text-pretty text-muted-foreground">
      Az ügyeleti beosztás a Jedlikinfóból jön. A szünetek időpontja a nap
      csengetési rendjéből következik, ezért rövidített napon az ügyeletek is
      elcsúsznak vele.
    </p>
  );
}
