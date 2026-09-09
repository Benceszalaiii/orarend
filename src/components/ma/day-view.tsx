"use client";

import type { ReactNode } from "react";
import { CrestField, PAGE_COLUMNS } from "@/components/chrome/page-field";
import { SITE_BAR_MAX, StandingLine } from "@/components/chrome/standing-line";
import { SiteFooter } from "@/components/site-footer";
import { dateFromKey } from "@/components/timetable/shared";
import { MorphingInfinity } from "@/components/ui/morphing-infinity";
import { describeRestDay } from "@/lib/rest-day";
import { cn } from "@/lib/utils";
import { DayDeck } from "./day-deck";
import { DayStrip } from "./day-strip";
import { NowBar } from "./now-bar";
import { RestHero } from "./rest-hero";
import type { DayViewState, RestEntry } from "./use-day-view";

//* ---------------------------------------------------------------------------
//* A NAPI NÉZET BURKA — a lap, amibe az alany beleül
//* ---------------------------------------------------------------------------
//! MINDEN, AMI A `/ma`-BÓL NEM TUDJA, KIÉ AZ ÓRAREND. A fénymező, a lebegő
//! fejléc, a napsáv, az összecsukott „most" sor, a lapozható napköteg, a jobb
//! oldali sáv helye és a lábléc — a szerkezet, ami a diák napját és a tanárét
//! egyformán hordozza.
//!
//! AMIT A HÍVÓ AD: az álló sor felirata, a lap tartalma, egy nap kirajzolása
//! és a jobb sáv. Semmi mást nem kell tudnia a burokról, és a burok sem tud
//! semmit az alanyról — ezért nem lesz belőle harmadszor is egy `if (tanár)`
//! ággal átszőtt ezersoros fájl.

const dayFmt = new Intl.DateTimeFormat("hu-HU", {
  month: "short",
  day: "numeric",
  weekday: "long",
});

export function dayTitle(dateKey: string): string {
  return dayFmt.format(dateFromKey(dateKey));
}

/** Egy nap kirajzolásához minden, amit a burok tud, a hívó viszont nem. */
export type DayRenderContext = {
  panel: DayViewState["panels"][number];
  isActive: boolean;
  isToday: boolean;
  /** Csak az aktív napon: ide kerül a hero alsó őrszeme. */
  onSentinel: ((el: HTMLDivElement | null) => void) | null;
  /** Igaz a fókusz lapján hétvégén — a dátum alatti „a következő tanítási nap". */
  weekendNote: boolean;
  rest: RestEntry | null;
  restSpan: { fromMs: number; toMs: number } | null;
};

//* A fénymező és a hasábrács a `chrome/page-field.tsx`-ben áll: a `/ugyelet`
//* ugyanezt a burkot viseli, és egy lemásolt rács a két lapon külön csúszna el.
const COLUMNS = PAGE_COLUMNS;

export function DayView({
  dv,
  lineSubject,
  sheet,
  rail,
  renderDay,
  emptyFallback,
  standalone,
}: {
  dv: DayViewState;
  /** Az álló sor bal oldala: az alany rövid jele, vagy a helyette álló szó. */
  lineSubject: string;
  sheet: ReactNode;
  rail: (week: NonNullable<DayViewState["week"]>) => ReactNode;
  renderDay: (ctx: DayRenderContext) => ReactNode;
  //* Üres héten, ha a tanév rendje NEM mondja, hogy szünet van: ide kerül a
  //* nevesített hiba a hívó saját szótárával, vagy a töltés jelzése.
  emptyFallback: ReactNode;
  //! EGY LAP A KÖTEG HELYETT. Amíg nincs kiválasztott alany, nincs mit
  //! lapozni: a köteg, a napsáv és a „most" sor mind egy olyan hétre
  //! hivatkoznának, ami le sem lett kérve. Ilyenkor a burok a fejlécet és a
  //! láblécet adja, közte pedig azt, amit a hívó a helyére tesz.
  standalone?: ReactNode;
}) {
  const {
    week,
    panels,
    index,
    shownKey,
    today,
    focusKey,
    isToday,
    isWeekend,
    state,
    clock,
    epoch,
    active,
    progress,
    rests,
    weekendSpan,
    weekEmpty,
    emptyPlan,
    heroGone,
    watchHero,
    pickIndex,
  } = dv;

  const chrome = (
    <div className="ma-chrome sticky top-0 z-30 text-hero-foreground">
      <div className={cn("mx-auto w-full", SITE_BAR_MAX)}>
        <StandingLine
          line={{
            subject: lineSubject,
            context: isToday ? "ma" : (active?.day?.dayName ?? undefined),
          }}
          sheet={sheet}
        />
      </div>

      {!standalone && week && panels.length > 0 && (
        <>
          {/*//! A NAPSÁV A KÖTEG FÖLÖTT ÁLL, NEM AZ ABLAK FÖLÖTT. A fejléc FELSŐ
              //! sora szándékosan az ablaké (`SITE_BAR_MAX`): a nézetváltónak a
              //! lap két szélén kell ülnie, hogy a `/orarend` ugyanoda tegye. A
              //! napsáv viszont nem a lapról szól, hanem a KÖTEGRŐL — egy
              //! vezérlő a dolog mellett álljon, amit mozgat. Ezért UGYANAZT a
              //! hasábot és UGYANAZT a rácsot kapja, mint a tartalom. */}
          <div className={cn(COLUMNS, "pb-1.5")}>
            <div className="min-w-0">
              <DayStrip
                days={week.days}
                index={index}
                progress={progress}
                todayDateKey={today ?? ""}
                onPick={pickIndex}
              />
            </div>
          </div>

          {/*//! A „MOST" SOR A FEJLÉC ALÁ LÓG, NEM BELE. Amíg a sor a fejléc
              //! TARTALMA volt, a megjelenése megnövelte a fejléc magasságát —
              //! a fejléc pedig a lap folyamának a tetején áll, tehát alatta
              //! MINDEN lejjebb csúszott a sor magasságával. Ezzel a hero alja
              //! is: az őrszem, ami a sort egyáltalán előhívta. A sor lelökte
              //! magáról az őrszemet a küszöb túloldalára, az visszakapcsolta a
              //! herót, a sor eltűnt, az őrszem visszaugrott — és a lap
              //! másodpercenként többször rándult.
              //!
              //! EZÉRT A SOR KIKERÜL A FOLYAMBÓL. `absolute`-ként a fejléc alsó
              //! élére akasztva pontosan ott jelenik meg, ahol eddig — de nem
              //! mozdít el semmit. */}
          <div className="ma-chrome-tail absolute inset-x-0 top-full">
            <div className={COLUMNS}>
              <div className="min-w-0">
                <NowBar
                  className="ma-now-bar"
                  visible={heroGone}
                  state={state}
                  clock={clock}
                  epoch={epoch}
                  day={active?.day ?? null}
                  isToday={isToday}
                  dayName={active?.day?.dayName ?? ""}
                  onReturn={() =>
                    window.scrollTo({
                      top: 0,
                      behavior: window.matchMedia(
                        "(prefers-reduced-motion: reduce)",
                      ).matches
                        ? "auto"
                        : "smooth",
                    })
                  }
                />
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );

  //! A LÁBLÉC A GÖRGETÉS VÉGÉN VÁR, NEM A NAP ELŐTT. A `/ma` a napi menetről
  //! szól: ami nem az — a készítő neve, a változásnapló, az adatvédelem, a
  //! telepítés — csak akkor kerül elő, amikor a nap és a hét is elfogyott. A
  //! `z-10` a lap tetején ülő fénymező FÖLÉ emeli; a fénymező
  //! `pointer-events-none`, de a rétegsorrend nélkül a lábléc hivatkozásai alá
  //! kerülnének.
  const frame = (children: ReactNode) => (
    //! OSZLOP, HOGY A LÁBLÉC NE LÓGJON A SEMMIBE. Rövid tartalomnál — a
    //! tanárválasztó lapja két bekezdés és egy legördülő — a lábléc a lap
    //! harmadánál ért véget, alatta fél képernyőnyi fekete. A `grow` a
    //! tartalomé: a lábléc így az ablak aljára kerül, hosszú lapon pedig
    //! változatlanul a görgetés végén marad.
    <main className="relative flex min-h-[100dvh] flex-col bg-background tt-safe">
      <CrestField />
      {chrome}
      {children}
      <SiteFooter className="relative z-10" />
    </main>
  );

  //! NINCS ALANY: A LAP NEM PÖRÖG, HANEM MEGKÉRDEZI. Ez a tanári oldal
  //! ÉRKEZÉSI állapota mindenkinek, aki nincs belépve — nem hibaállapot.
  if (standalone) {
    return frame(
      <div className="relative z-10 mx-auto w-full max-w-5xl grow px-4 pt-3 pb-10 sm:px-6 sm:pt-4">
        {standalone}
      </div>,
    );
  }

  //! ÜRES HÉT: A LAP NEM PÖRÖG TOVÁBB, HANEM VÁLASZOL. A napköteg itt nem
  //! épülhet fel — nincs miből —, de a kérdés, amivel a lapot megnyitották,
  //! ettől még kap választ: vagy a szünetét, vagy a hibáét (a hibapanelt a
  //! hívó teszi be, mert a szótár a lapé).
  if (weekEmpty && shownKey && emptyPlan !== undefined) {
    const rest =
      emptyPlan && !emptyPlan.teaching
        ? describeRestDay({
            dateKey: shownKey,
            weekend: false,
            teaching: false,
            notes: emptyPlan.notes,
            isToday: shownKey === today,
          })
        : null;
    return frame(
      <div className="relative z-10 mx-auto w-full max-w-5xl px-4 pt-3 pb-10 sm:px-6 sm:pt-4">
        <h2 className="text-2xl font-bold tracking-tight first-letter:uppercase sm:text-3xl">
          {dayTitle(shownKey)}
        </h2>
        <p className="mt-1 text-sm text-hero-foreground/60">
          {rest ? rest.label : "Erre a hétre nem érkezett órarend"}
        </p>
        <div className="mt-6 lg:max-w-2xl">
          {rest ? (
            <RestHero rest={rest} next={null} span={null} nowMs={null} />
          ) : (
            emptyFallback
          )}
        </div>
      </div>,
    );
  }

  if (!shownKey || !week || panels.length === 0) {
    return (
      <main className="flex min-h-[100dvh] items-center justify-center bg-background">
        <MorphingInfinity className="size-24 text-muted-foreground" />
      </main>
    );
  }

  return frame(
    <div
      className={cn(
        "relative z-10 mx-auto w-full max-w-5xl px-4 pb-10 sm:px-6",
        "lg:grid lg:grid-cols-[minmax(0,1fr)_19rem] lg:items-start lg:gap-8",
      )}
    >
      {/*//! A NAP MAGA A FOGANTYÚ. A dátumtól a nap listájáig minden EGY lap:
          //! oldalra húzva a cím, a hero és az órák együtt mozdulnak. Ha a
          //! hero állva maradna és csak a lista lapozna, a lap két különböző
          //! napról beszélne ugyanabban a pillanatban. */}
      <DayDeck
        keys={panels.map((p) => p.dateKey)}
        index={index}
        onIndexChange={pickIndex}
        progress={progress}
        //! A TELJES SZÉLESSÉGŰ FOGANTYÚ CSAK EGY HASÁBOS ELRENDEZÉSBEN AZ.
        //! Telefonon a köteg kilép a hasáb margójából, hogy a húzás a képernyő
        //! széléig érjen — a hüvelykujj onnan indul. `lg`-től viszont a köteg
        //! egy RÁCSCELLA: ugyanez a negatív margó 24 képponttal benyúlt a
        //! sávok közé, és a köteg vágóéle a szomszéd hasáb alá lógott.
        className="-mx-4 sm:-mx-6 lg:mx-0"
        renderPanel={(i) => {
          const panel = panels[i];
          if (!panel) return null;
          return (
            <div className="px-4 sm:px-6 lg:px-0">
              {renderDay({
                panel,
                isActive: i === index,
                isToday: panel.dateKey === today,
                onSentinel: i === index ? watchHero : null,
                //! A HÉTVÉGE-JELÖLÉS A FÓKUSZ LAPJÁÉ, NEM MINDEN NEM-MAI NAPÉ.
                //! A korábbi feltétel („nem ma") a hét MIND A NÉGY másik
                //! lapjára kiírta a „Hétvége" előtagot.
                weekendNote: isWeekend && panel.dateKey === focusKey,
                rest: rests.get(panel.dateKey) ?? null,
                restSpan: panel.dateKey === focusKey ? weekendSpan : null,
              })}
            </div>
          );
        }}
      />

      {/*//* Másodlagos sáv: a hét — amire a rácsból csak végigolvasva lenne
          //* válasz. A napváltás innen is megy, csak most nem ez az EGYETLEN
          //* útja: ami itt marad, az a nap TERHELÉSE, nem a helyzete. */}
      {/*//! A RITMUS MONDJA MEG, HOL VÁLT A TÉMA. A nagy hézag a RÉGIÓ határán
          //! van („a napom" → „a hetem"), a panelek közti pedig szűkebb: a
          //! tagolás így olvasható anélkül, hogy keretet kéne köré rakni. */}
      <div className="mt-14 space-y-8 lg:mt-0">{rail(week)}</div>
    </div>,
  );
}
