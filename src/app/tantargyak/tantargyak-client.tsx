"use client";

import {
  ArrowLeft,
  RotateCw,
  Search,
  Star,
  TriangleAlert,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CrestField, PAGE_CHROME } from "@/components/chrome/page-field";
import { SITE_BAR_MAX, StandingLine } from "@/components/chrome/standing-line";
import { SiteFooter } from "@/components/site-footer";
import { addDaysKey, dateFromKey } from "@/components/timetable/shared";
import { useVisibilityEpoch } from "@/components/timetable/use-clock";
import { MorphingInfinity } from "@/components/ui/morphing-infinity";
import { accentStyle } from "@/lib/accent";
import {
  filterSubjects,
  findSubject,
  rankSubjects,
  type SubjectEntry,
  type SubjectIndex,
  teacherKey,
} from "@/lib/subjects";
import { loadCachedSubject } from "@/lib/timetable";
import { cn } from "@/lib/utils";
import { subjectMorph } from "./subject-morph";

//* ---------------------------------------------------------------------------
//* TANTÁRGYAK — KI TANÍTJA, KINEK
//* ---------------------------------------------------------------------------
//! UGYANAZ A BUROK, MINT A TEREMKERESŐÉ: fénymező, ragadó fejléc, alatta a
//! válasz. Csak itt nincs napsáv — a kérdés nem „mi van most", hanem „ki
//! tanítja". Egy tárgy tanárai nem változnak óráról órára.
//*
//! A KERESŐ AZ ELSŐ. 160-nál több tárgy van; végiggörgetni senki nem fogja.
//! Aki ide jön, egy konkrét tárgyat keres („ki tanít fizikát"), ezért a lista
//! felett a szűrőmező áll, és a lista csak annyit mutat, amennyi ráillik.
//*
//! A VÁLASZ LINKEKBŐL ÁLL. A tanár neve a tanári órarendre, az osztály jele az
//! osztályéra visz — a lap nem zsákutca, hanem a következő kérdés kapuja
//! („és mikor van órája?").
//*
//! A SEPRÉST NEM MI VÉGEZZÜK — ugyanabból a pillanatképből dolgozunk, mint a
//! teremkereső (lásd `lib/subjects.ts`). A lap egyetlen kérést küld.

type Answer = SubjectIndex & { ageMinutes: number };

//! A HIBÁNAK GAZDÁJA VAN (PRODUCT.md, 1. elv). Ha a diák telefonja offline, az
//! nem a Jedlikinfo hibája, és fordítva — a lap mindig azt mondja ki, ami
//! tényleg történt, és hogy érdemes-e várni.
type Failure = "offline" | "network" | "source" | "server";

const FAILURE_MESSAGE: Record<Failure, string> = {
  offline:
    "Nincs internetkapcsolat, ezért a tantárgyak nem töltődtek be. Amint visszajön a net, a lap magától újrapróbálja.",
  network:
    "Nem értük el a szervert — valószínűleg akadozik a net. Próbáld újra pár másodperc múlva.",
  source:
    "A Jedlikinfo most nem adja ki az órarendeket, ezért a tantárgyak sem érhetők el. Nem nálad van a hiba; néhány perc múlva próbáld újra.",
  server:
    "A tantárgyak összeállítása a mi szerverünkön akadt el. Nem nálad van a hiba; néhány perc múlva próbáld újra.",
};

//* Ugyanez röviden, zárójelben — amikor a régebbi lista a helyén marad.
const FAILURE_SHORT: Record<Failure, string> = {
  offline: "nincs net",
  network: "a szerver nem válaszolt",
  source: "a Jedlikinfo nem válaszolt",
  server: "szerverhiba",
};

//! A KIVÁLASZTOTT TÁRGY A CÍMBEN ÁLL (`?tantargy=Fizika`), hogy a link
//! megosztható legyen — és előzmény-bejegyzéssel, hogy telefonon a „vissza"
//! a listára vigyen, ne le a lapról.
const URL_PARAM = "tantargy";

function readUrlSubject(): string | null {
  try {
    return (
      new URLSearchParams(window.location.search).get(URL_PARAM)?.trim() || null
    );
  } catch {
    return null;
  }
}

function writeUrlSubject(name: string | null): void {
  try {
    const url = new URL(window.location.href);
    if ((url.searchParams.get(URL_PARAM) ?? null) === name) return;
    if (name) url.searchParams.set(URL_PARAM, name);
    else url.searchParams.delete(URL_PARAM);
    window.history.pushState(null, "", url);
  } catch {
    /* a lap a cím nélkül is működik */
  }
}

//! A NÉZET IS A CÍMBEN ÁLL (`?nezet=tanar`), nem a készüléken. Így a megosztott
//! link ugyanazt a nézetet nyitja, a „vissza" visszavonja a váltást, és nem
//! kerül új kulcs a localStorage-ba (az adatvedelem lap változatlan marad).
//! Az alapérték, az osztályonkénti nézet, nem kerül a címbe.
const VIEW_PARAM = "nezet";
type View = "osztaly" | "tanar";

function readUrlView(): View {
  try {
    return new URLSearchParams(window.location.search).get(VIEW_PARAM) ===
      "tanar"
      ? "tanar"
      : "osztaly";
  } catch {
    return "osztaly";
  }
}

function writeUrlView(view: View): void {
  try {
    const url = new URL(window.location.href);
    const next = view === "tanar" ? "tanar" : null;
    if ((url.searchParams.get(VIEW_PARAM) ?? null) === next) return;
    if (next) url.searchParams.set(VIEW_PARAM, next);
    else url.searchParams.delete(VIEW_PARAM);
    window.history.pushState(null, "", url);
  } catch {
    /* a nézet a cím nélkül is vált */
  }
}

//! A SAJÁT OSZTÁLY KÉT ÍRÁSMÓDJA. Az órarend a kiválasztott osztályt a
//! Jedlikinfo jelével menti, a tárgyak a termek kártyáiról jönnek — ha az egyik
//! „9A", a másik „09A", az ugyanaz az osztály. Ezért a vezető nullát, a
//! szóközt, a pontot és a kis-nagybetűt nem nézzük.
function classMatchKey(short: string): string {
  return short
    .toLocaleUpperCase("hu")
    .replace(/[\s.]/g, "")
    .replace(/^0+(?=\d)/, "");
}

const WEEK_FMT = new Intl.DateTimeFormat("hu-HU", {
  month: "short",
  day: "numeric",
});

export function TantargyakPage() {
  const epoch = useVisibilityEpoch();
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<string | null>(null);
  const [view, setView] = useState<View>("osztaly");
  //* Csak olvassuk: az /orarend menti, itt semmi nem íródik vissza.
  const [ownClass, setOwnClass] = useState<string | null>(null);

  //* Az ÉPPEN LÁTHATÓ tárgy pontos neve — az átúszás innen tudja, melyik
  //* sorba kell visszaúsznia. (A `picked` a címből jön, kisbetűsen is lehet.)
  const shownRef = useRef<string | null>(null);

  //! MINDEN VÁLTÁS EGY ÚTON MEGY — a koppintás, a „vissza" gomb és a böngésző
  //! előzménye is átúszik, nem csak az egyik.
  const go = useCallback((name: string | null, push: boolean) => {
    const narrow = !window.matchMedia("(min-width: 64rem)").matches;
    const from = shownRef.current;
    subjectMorph({
      from,
      to: name,
      commit: () => {
        setPicked(name);
        if (push) writeUrlSubject(name);
      },
      after: () => {
        if (!narrow) return;
        //* Telefonon a részlet a lista HELYÉRE jön — a lap tetejéről indul;
        //* visszafelé a lista ott nyílik ki, ahonnan a diák elindult.
        if (name) window.scrollTo({ top: 0 });
        else if (from) {
          document
            .querySelector(`[data-subject-row="${CSS.escape(from)}"]`)
            ?.scrollIntoView({ block: "center" });
        }
      },
    });
  }, []);

  useEffect(() => {
    setPicked(readUrlSubject());
    setView(readUrlView());
    setOwnClass(loadCachedSubject("class"));
    const sync = () => {
      setView(readUrlView());
      go(readUrlSubject(), false);
    };
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, [go]);

  //* Ha a net visszajön, nem várjuk meg, hogy a diák keresse a gombot — ezt
  //* az offline üzenet meg is ígéri.
  useEffect(() => {
    const onOnline = () => setAttempt((a) => a + 1);
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, []);

  //! Az `epoch` és az `attempt` ÓRAJEL, nem adat: visszatéréskor, illetve az
  //! „Újrapróbálás" után újrakérdez. Ugyanaz a minta, mint a teremkeresőnél —
  //! és ugyanúgy nem vesszük el a kint lévő listát egy elbukott frissítés miatt.
  // biome-ignore lint/correctness/useExhaustiveDependencies: az `epoch` és az `attempt` szándékos újrafuttató jel, nem olvasott érték
  useEffect(() => {
    let alive = true;
    void fetch("/api/tantargyak")
      .then(async (res): Promise<Answer | Failure> => {
        //* Az 503-at a route csak akkor adja, ha a Jedlikinfóból semmi nem jött.
        if (!res.ok) return res.status === 503 ? "source" : "server";
        return (await res.json()) as Answer;
      })
      .then((result) => {
        if (!alive) return;
        if (typeof result === "string") {
          setFailure(result);
        } else {
          setAnswer(result);
          setFailure(null);
        }
      })
      .catch(() => {
        if (alive) setFailure(navigator.onLine ? "network" : "offline");
      });
    return () => {
      alive = false;
    };
  }, [epoch, attempt]);

  const retry = useCallback(() => {
    setFailure(null);
    setAttempt((a) => a + 1);
  }, []);

  //* A lista a nagy tárgyakkal kezd (lásd `rankSubjects`); a keresés ezt a
  //* sorrendet szűri, tehát a találatok között is a nagyobb tárgy áll elöl.
  const subjects = useMemo(
    () => rankSubjects(answer?.subjects ?? []),
    [answer],
  );
  const shown = useMemo(
    () => filterSubjects(subjects, query),
    [subjects, query],
  );
  const selected = useMemo(
    () => (picked ? findSubject(subjects, picked) : null),
    [subjects, picked],
  );
  //! EGY MEGOSZTOTT LINK TÁRGYA ELTŰNHET (a következő héten nincs órája, vagy
  //! átnevezték). Eddig ilyenkor némán a listára esett a lap; most kimondja.
  const missing = answer && picked && !selected ? picked : null;
  useEffect(() => {
    shownRef.current = selected?.name ?? null;
  });

  const pick = useCallback((name: string | null) => go(name, true), [go]);
  const changeView = useCallback((next: View) => {
    setView(next);
    writeUrlView(next);
  }, []);

  //! A RAGADÓ FEJLÉC MAGASSÁGA NEM ÁLLANDÓ (a menüsor szélességtől függően
  //! megjelenik vagy eltűnik, és a biztonsági sáv is beleszámít). A lista
  //! hasábja ehhez igazodik, ezért mérjük, nem becsüljük — és React-renderelés
  //! nélkül, egyetlen CSS-változóként írjuk ki.
  const mainRef = useRef<HTMLElement>(null);
  const chromeRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const chrome = chromeRef.current;
    const main = mainRef.current;
    if (!chrome || !main) return;
    const sync = () =>
      main.style.setProperty("--chrome-h", `${chrome.offsetHeight}px`);
    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(chrome);
    return () => observer.disconnect();
  }, []);

  const line = (
    <StandingLine
      line={{
        subject: "Tantárgyak",
        context: selected?.name,
      }}
    />
  );

  return (
    //* `overflow-x-clip`: a tárgy fénye túlnyúlik a hasábon, de vízszintes
    //* görgetést nem nyithat. A `clip` nem görgető doboz, a ragadó fejléc marad.
    <main
      ref={mainRef}
      className="relative flex min-h-[100dvh] flex-col overflow-x-clip bg-background tt-safe"
    >
      <CrestField />

      <div ref={chromeRef} className={PAGE_CHROME}>
        <div className={cn("mx-auto w-full", SITE_BAR_MAX)}>{line}</div>
      </div>

      <div
        className={cn(
          "relative z-10 mx-auto w-full max-w-5xl grow px-4 pt-4 pb-10 sm:px-6",
          "lg:grid lg:grid-cols-[20rem_minmax(0,1fr)] lg:items-start lg:gap-10",
        )}
      >
        {/*//! TELEFONON VAGY A LISTA, VAGY A TÁRGY. Egymás alatt a részlet a
            //! 160 soros lista alá kerülne, és a koppintás után semmi nem
            //! változna a képernyőn. Széles kijelzőn a kettő egymás mellett
            //! áll, mint egy levelezőben. */}
        {/*//! SZÉLES KIJELZŐN A LISTA SAJÁT ABLAKBAN GÖRGET. 180 sor a lapon azt
            //! jelentené, hogy a részlet a lista aljáig együtt görget vele, a
            //! keresőmező pedig kicsúszik felül. Így a fejléc, a kereső és a
            //! részlet a helyén marad, és csak a sorok mozognak — mint egy
            //! levelező bal hasábja. Telefonon NEM: ott a lista maga a lap, és
            //! egy beágyazott görgető a hüvelykujj alatt rosszabb volna. */}
        <div
          className={cn(
            "min-w-0",
            "lg:sticky lg:top-[calc(var(--chrome-h,4rem)+1rem)] lg:flex lg:h-[calc(100dvh-var(--chrome-h,4rem)-2rem)] lg:flex-col",
            selected && "max-lg:hidden",
          )}
        >
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Tantárgyak
          </h2>
          <p className="mt-1 text-sm text-pretty text-muted-strong">
            Ki tanítja, és melyik osztálynak.
          </p>

          {missing && (
            <MissingSubject
              name={missing}
              onSearch={() => {
                setQuery(missing);
                pick(null);
              }}
            />
          )}

          <SubjectList
            answer={answer}
            failure={failure}
            onRetry={retry}
            shown={shown}
            query={query}
            onQuery={setQuery}
            selected={selected?.name ?? null}
            onPick={pick}
          />
        </div>

        <div className={cn("min-w-0", !selected && "max-lg:hidden")}>
          {selected ? (
            <SubjectDetail
              key={selected.name}
              subject={selected}
              view={view}
              onView={changeView}
              ownClass={ownClass}
              onBack={() => pick(null)}
            />
          ) : (
            answer && (
              <p className="mt-14 rounded-xl border border-dashed border-border px-4 py-5 text-sm text-pretty text-muted-strong">
                Válassz egy tárgyat a bal oldali listából: itt látod, ki
                tanítja, és melyik osztályoknak.
              </p>
            )
          )}
          <SourceNote answer={answer} failure={failure} />
        </div>
      </div>

      <SiteFooter className="relative z-10" />
    </main>
  );
}

//* ---------------------------------------------------------------------------

function SubjectList({
  answer,
  failure,
  onRetry,
  shown,
  query,
  onQuery,
  selected,
  onPick,
}: {
  answer: Answer | null;
  failure: Failure | null;
  onRetry: () => void;
  shown: SubjectEntry[];
  query: string;
  onQuery: (value: string) => void;
  selected: string | null;
  onPick: (name: string) => void;
}) {
  const listRef = useRef<HTMLUListElement>(null);

  //! MEGOSZTOTT LINKNÉL A KIJELÖLT SOR A HASÁBBAN LEGYEN, ne a 120. sor
  //! mögött, láthatatlanul. Csak egyszer, az első betöltéskor: koppintásnál a
  //! sor amúgy is látszik, és egy ugró lista csak összezavarna. Telefonon a
  //! lista nem görgető doboz, ott ez semmit nem tesz.
  const revealed = useRef(false);
  useEffect(() => {
    const list = listRef.current;
    if (revealed.current || !selected || !list) return;
    const row = list.querySelector<HTMLElement>('[aria-current="true"]');
    if (!row) return;
    revealed.current = true;
    if (list.scrollHeight <= list.clientHeight) return;
    list.scrollTop = Math.max(0, row.offsetTop - list.clientHeight / 3);
  }, [selected]);

  //* Új keresésnél a találatok elejéről indulunk, nem a régi görgetésből.
  // biome-ignore lint/correctness/useExhaustiveDependencies: a `query` szándékos újrafuttató jel
  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = 0;
  }, [query]);

  if (!answer) {
    return failure ? (
      <div
        role="alert"
        className="mt-8 rounded-xl border border-dashed border-border px-4 py-5 text-sm text-pretty text-muted-strong"
      >
        <p>{FAILURE_MESSAGE[failure]}</p>
        <button
          type="button"
          onClick={onRetry}
          className="-ml-2 mt-3 flex items-center gap-1.5 rounded-lg px-2 py-1.5 font-medium text-foreground hover:bg-foreground/[0.06]"
        >
          <RotateCw className="size-4" aria-hidden />
          Újrapróbálás
        </button>
      </div>
    ) : (
      <Loading />
    );
  }

  const filtering = query.trim().length > 0;

  return (
    <section
      aria-label="Tantárgyak listája"
      className="mt-6 lg:flex lg:min-h-0 lg:flex-1 lg:flex-col"
    >
      <div className="mb-3 flex items-center gap-2">
        <label className="relative flex min-w-0 grow items-center">
          <Search
            className="pointer-events-none absolute left-3 size-4 text-muted-foreground"
            aria-hidden
          />
          <span className="sr-only">
            Tantárgy keresése név vagy rövid jel szerint
          </span>
          <input
            type="search"
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder="pl. fizika, mat, prog…"
            className="w-full rounded-xl border border-border bg-background/60 py-2 pr-3 pl-9 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-foreground/30"
          />
        </label>
        {/*//* A puszta szám („12") nem mondja meg, minek a száma. Gépelés
            //* közben felolvasó is hallja, mennyi maradt. */}
        <p
          aria-live="polite"
          className="shrink-0 text-sm tabular-nums text-muted-foreground"
        >
          {filtering
            ? `${shown.length} találat`
            : `${answer.subjects.length} tárgy`}
        </p>
      </div>

      {shown.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border px-4 py-5 text-sm text-pretty text-muted-strong">
          <p>
            <span className="font-medium text-foreground">
              „{query.trim()}”
            </span>{" "}
            egyik tárgy nevében és jelében sincs benne.
          </p>
          <p className="mt-2">
            Próbáld rövidebben vagy a tárgy jelével (pl. „mat”, „prog”); ékezet
            nélkül is megtalálja. Csak az e heti és a jövő heti órarendben
            szereplő tárgyak vannak itt.
          </p>
          <button
            type="button"
            onClick={() => onQuery("")}
            className="-ml-2 mt-3 rounded-lg px-2 py-1.5 font-medium text-foreground hover:bg-foreground/[0.06]"
          >
            Keresés törlése
          </button>
        </div>
      ) : (
        <ul
          ref={listRef}
          className="tt-list-scroll relative flex flex-col gap-0.5 lg:-mx-1.5 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:overscroll-contain lg:px-1.5 lg:pt-1"
        >
          {shown.map((subject) => {
            const active = selected === subject.name;
            return (
              <li key={subject.name} style={accentStyle(subjectSeed(subject))}>
                <button
                  type="button"
                  data-subject-row={subject.name}
                  onClick={() => onPick(subject.name)}
                  aria-current={active ? "true" : undefined}
                  className="relative flex w-full items-start gap-3 rounded-lg px-2.5 py-2 text-left text-sm transition-colors hover:bg-foreground/[0.06] aria-[current=true]:hover:bg-transparent"
                >
                  {/*//! A KIJELÖLÉS CSÍKJA EGY ELEM, NEM EGY HÁTTÉRSZÍN: tárgyváltáskor
                      //! átcsúszik az új sorra, és útközben átszíneződik. Mindig csak
                      //! egy sor viseli, ezért a neve állandó lehet. */}
                  {active && (
                    <span
                      aria-hidden
                      className="acc-tint absolute inset-0 rounded-lg border"
                      style={{ viewTransitionName: "subj-select" }}
                    />
                  )}
                  <span
                    aria-hidden
                    data-morph="dot"
                    className="acc-dot relative mt-1.5 size-2 shrink-0 rounded-full"
                  />
                  <span className="relative min-w-0 flex-1">
                    <span
                      data-morph="name"
                      className="inline-block max-w-full truncate align-top font-medium text-foreground"
                    >
                      {subject.name}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {countLabel(subject)}
                    </span>
                  </span>
                  {subject.short && subject.short !== subject.name && (
                    <span
                      className={cn(
                        "relative mt-0.5 shrink-0 font-mono text-xs",
                        active ? "acc-text" : "text-muted-foreground",
                      )}
                    >
                      {subject.short}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

//* Lassú első betöltésnél a pörgő jel önmagában úgy néz ki, mint egy lefagyott
//* lap. Öt másodperc után megmondjuk, mi tart ennyi ideig — csak azt, amit
//* tudunk: hideg gyorsítótárnál a szerver most seper végig minden termet.
const SLOW_AFTER_MS = 5_000;

function Loading() {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setSlow(true), SLOW_AFTER_MS);
    return () => window.clearTimeout(timer);
  }, []);
  return (
    <div className="mt-16 flex flex-col items-center gap-5">
      <MorphingInfinity
        className="size-20 text-muted-foreground"
        aria-label="Tantárgyak betöltése"
      />
      {slow && (
        <p className="max-w-xs text-center text-sm text-pretty text-muted-strong">
          Még töltődik. Ha egy ideje senki nem nézte a tantárgyakat, a szerver
          most kéri le az összes terem két heti órarendjét a Jedlikinfóból — ez
          tovább tart, mint máskor.
        </p>
      )}
    </div>
  );
}

function MissingSubject({
  name,
  onSearch,
}: {
  name: string;
  onSearch: () => void;
}) {
  return (
    <div className="mt-6 flex gap-2 rounded-xl border border-border px-3 py-2.5 text-sm text-pretty text-muted-strong">
      <TriangleAlert
        className="mt-0.5 size-4 shrink-0 text-muted-foreground"
        aria-hidden
      />
      <div className="min-w-0">
        <p>
          <span className="font-medium text-foreground">„{name}”</span> nincs az
          e heti és a jövő heti órarendben. Lehet, hogy régi a link, vagy a
          tárgynak ezen a két héten nincs órája.
        </p>
        <button
          type="button"
          onClick={onSearch}
          className="-ml-2 mt-1.5 rounded-lg px-2 py-1 font-medium text-foreground hover:bg-foreground/[0.06]"
        >
          Hasonló nevű tárgyak keresése
        </button>
      </div>
    </div>
  );
}

//! UGYANAZ A MAG, MINT A RÁCSON (`subjectShort || subject`, lásd `day-list.tsx`):
//! a fizika itt is azzal a színnel áll, amivel a diák órarendjében.
function subjectSeed(subject: SubjectEntry): string {
  return subject.short || subject.name;
}

function countLabel(subject: SubjectEntry): string {
  const parts = [`${subject.teachers.length} tanár`];
  //* A szakkörnek nincs osztálya — a „0 osztály" csak zaj volna.
  if (subject.classes.length > 0) {
    parts.push(`${subject.classes.length} osztály`);
  }
  return parts.join(" · ");
}

//* ---------------------------------------------------------------------------

function SubjectDetail({
  subject,
  view,
  onView,
  ownClass,
  onBack,
}: {
  subject: SubjectEntry;
  view: View;
  onView: (view: View) => void;
  ownClass: string | null;
  onBack: () => void;
}) {
  const names = new Map(
    subject.teachers.map((t) => [teacherKey(t), t] as const),
  );

  //* A szakkörnek nincs osztálya: ott nincs mit váltani, a tanárok látszanak.
  const hasClasses = subject.classes.length > 0;
  const shownView: View = hasClasses ? view : "tanar";

  const own = ownClass ? classMatchKey(ownClass) : null;
  const isOwn = (short: string) => own !== null && classMatchKey(short) === own;
  //! A SAJÁT OSZTÁLY ELŐRE. A diák kérdése „ki tanítja NEKEM?" — ha ez a tárgy
  //! az ő osztályának is megy, a válasz az első kártya, keresgélés nélkül.
  //! A többi osztály a megszokott 09A … 13C sorrendben marad.
  const classes = own
    ? [...subject.classes].sort(
        (a, b) => Number(isOwn(b.short)) - Number(isOwn(a.short)),
      )
    : subject.classes;

  //! AZ ÉRKEZÉS EGYSZER JÁR. A kártyák lépcsőzetes beúszása a TÁRGY
  //! megnyitásához tartozik; nézetváltáskor csak egy rövid áttűnés van, nem
  //! egy újabb hullám. (A komponens tárgyanként újraindul — `key`.)
  const firstView = useRef(shownView);
  const switched = useRef(false);
  if (shownView !== firstView.current) switched.current = true;
  const entering = !switched.current;

  let order = 0;
  const rise = (): React.CSSProperties | undefined =>
    entering ? ({ "--i": order++ } as React.CSSProperties) : undefined;
  const riseClass = entering ? "subj-rise" : undefined;

  const panel =
    shownView === "osztaly" ? (
      //! A DIÁK OLDALA: osztályonként, ki tanítja nekik. Ugyanaz az adat,
      //! mint a tanáronkénti nézetben, csak a másik oldaláról.
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {classes.map((c) => {
          const mine = isOwn(c.short);
          return (
            <li key={c.short} style={rise()} className={riseClass}>
              <Link
                href={`/orarend?class=${encodeURIComponent(c.short)}`}
                className={cn(
                  "block h-full rounded-xl border px-3 py-2.5 transition-colors",
                  mine
                    ? "acc-tint"
                    : "border-border bg-foreground/[0.03] hover:bg-foreground/[0.07]",
                )}
                title={`A ${c.short} órarendje`}
              >
                <span className="flex items-baseline justify-between gap-2">
                  <span className="acc-text font-semibold tabular-nums">
                    {c.short}
                  </span>
                  {mine && (
                    <span className="acc-text text-[0.6875rem] font-medium">
                      a te osztályod
                    </span>
                  )}
                </span>
                <span
                  className={cn(
                    "mt-0.5 block truncate text-xs",
                    mine ? "text-foreground" : "text-muted-strong",
                  )}
                >
                  {c.teachers
                    .map((key) => names.get(key)?.name ?? key)
                    .join(", ") || "Tanár nincs megadva"}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    ) : (
      <ul className="flex flex-col gap-2">
        {subject.teachers.map((t) => (
          <li
            key={teacherKey(t)}
            style={rise()}
            className={cn(
              riseClass,
              "rounded-xl border border-border bg-foreground/[0.03] px-3 py-2.5",
            )}
          >
            <div className="flex items-baseline justify-between gap-3">
              {t.short ? (
                <Link
                  href={`/tanari?teacher=${encodeURIComponent(t.short)}`}
                  className="min-w-0 truncate font-semibold text-foreground underline-offset-4 hover:underline"
                  title={`${t.name} órarendje`}
                >
                  {t.name}
                </Link>
              ) : (
                <span className="min-w-0 truncate font-semibold text-foreground">
                  {t.name}
                </span>
              )}
              {t.short && t.short !== t.name && (
                <span className="shrink-0 font-mono text-xs text-muted-foreground">
                  {t.short}
                </span>
              )}
            </div>
            {t.classes.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {t.classes.map((c) => (
                  <ClassChip key={c} short={c} mine={isOwn(c)} />
                ))}
              </div>
            ) : (
              //* Osztály nélküli kártya — szakkör, korrepetálás, foglalkozás.
              <p className="mt-1 text-xs text-muted-foreground">
                Osztály nélkül (szakkör vagy foglalkozás)
              </p>
            )}
          </li>
        ))}
      </ul>
    );

  return (
    <article
      data-subject-detail
      aria-labelledby="subject-heading"
      style={accentStyle(subjectSeed(subject))}
    >
      <button
        type="button"
        onClick={onBack}
        className="-ml-2 mb-3 flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-muted-strong hover:bg-foreground/[0.06] lg:hidden"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Összes tantárgy
      </button>

      <header className="relative isolate">
        {/*//! A FÉNY A PÖTTYBŐL NYÍLIK. A középpontja a pötty közepén ül, és a
            //! listából átúszó pötty érkezésekor kezd kinyílni — a tárgy színe
            //! így a cím mögé terül, nem egy dobozba. */}
        <div
          aria-hidden
          className="acc-glow subj-bloom pointer-events-none absolute top-[1.1rem] left-[0.4375rem] -z-10 size-[34rem] -translate-x-1/2 -translate-y-1/2 sm:top-[1.4rem]"
        />
        <div className="flex items-start gap-3.5">
          <span
            aria-hidden
            data-morph="dot"
            className="acc-dot mt-[0.8rem] size-3.5 shrink-0 rounded-full sm:mt-[1.05rem]"
          />
          <div className="min-w-0">
            <h2
              id="subject-heading"
              className="text-3xl font-bold tracking-tight text-balance sm:text-4xl"
            >
              <span data-morph="name" className="inline-block max-w-full">
                {subject.name}
              </span>
            </h2>
            <p className="subj-rise mt-2 text-sm text-muted-strong">
              {subject.short && subject.short !== subject.name && (
                <>
                  <span className="acc-text font-mono">{subject.short}</span>
                  {" · "}
                </>
              )}
              {countLabel(subject)}
            </p>
          </div>
        </div>
      </header>

      {hasClasses ? (
        <ViewSwitch
          view={shownView}
          onView={onView}
          classCount={subject.classes.length}
          teacherCount={subject.teachers.length}
        />
      ) : (
        <h3 className="subj-rise mt-8 mb-3 flex items-center gap-1.5 text-base font-semibold text-foreground">
          <Users className="size-4 text-muted-foreground" aria-hidden />
          Tanárok
        </h3>
      )}

      {hasClasses ? (
        <div
          key={shownView}
          id={`view-panel-${shownView}`}
          role="tabpanel"
          aria-labelledby={`view-tab-${shownView}`}
          className={cn(switched.current && "subj-swap")}
        >
          {panel}
        </div>
      ) : (
        panel
      )}
    </article>
  );
}

//! KÉT FÜL, EGY PANEL — valódi fülsor (`tablist`), nem két gomb: a felolvasó
//! bemondja, melyik nézet aktív és hány van, a nyilak pedig váltanak, ahogy
//! egy fülsortól várni lehet. A kijelölés csúszó pirula a tárgy színében.
const VIEWS: { id: View; label: string }[] = [
  { id: "osztaly", label: "Osztályonként" },
  { id: "tanar", label: "Tanáronként" },
];

function ViewSwitch({
  view,
  onView,
  classCount,
  teacherCount,
}: {
  view: View;
  onView: (view: View) => void;
  classCount: number;
  teacherCount: number;
}) {
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const index = VIEWS.findIndex((v) => v.id === view);

  const onKeyDown = (e: React.KeyboardEvent) => {
    const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : null;
    const jump =
      e.key === "Home" ? 0 : e.key === "End" ? VIEWS.length - 1 : null;
    if (step === null && jump === null) return;
    e.preventDefault();
    const next = jump ?? (index + (step ?? 0) + VIEWS.length) % VIEWS.length;
    onView(VIEWS[next].id);
    tabs.current[next]?.focus();
  };

  return (
    <div
      role="tablist"
      aria-label="Nézet"
      onKeyDown={onKeyDown}
      className="subj-rise relative mt-7 mb-4 grid w-full grid-cols-2 rounded-full border border-border bg-foreground/[0.04] p-1 sm:w-auto sm:max-w-sm"
    >
      <span
        aria-hidden
        className="acc-tint absolute inset-y-1 left-1 w-[calc(50%-0.25rem)] rounded-full border transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none"
        style={{ transform: `translateX(${index * 100}%)` }}
      />
      {VIEWS.map((v, i) => {
        const active = v.id === view;
        const count = v.id === "osztaly" ? classCount : teacherCount;
        return (
          <button
            key={v.id}
            ref={(el) => {
              tabs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`view-tab-${v.id}`}
            aria-selected={active}
            aria-controls={`view-panel-${v.id}`}
            tabIndex={active ? 0 : -1}
            onClick={() => onView(v.id)}
            className={cn(
              "relative flex items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
              active
                ? "text-foreground"
                : "text-muted-strong hover:text-foreground",
            )}
          >
            {v.label}
            <span
              className={cn(
                "text-xs tabular-nums",
                active ? "acc-text" : "text-muted-foreground",
              )}
            >
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function ClassChip({ short, mine }: { short: string; mine: boolean }) {
  //* A saját osztály csipje teltebb, és a neve is kimondja — a szín egymagában
  //* nem hordozhat jelentést.
  const label = `A ${short} órarendje${mine ? " — a te osztályod" : ""}`;
  return (
    <Link
      href={`/orarend?class=${encodeURIComponent(short)}`}
      title={label}
      aria-label={label}
      className={cn(
        "rounded-full border px-2.5 py-1 text-xs font-medium tabular-nums text-foreground transition-[filter] hover:brightness-125",
        mine ? "acc-tint-strong font-semibold" : "acc-tint",
      )}
    >
      <span className="flex items-center gap-1">
        {mine && <Star className="size-3 fill-current" aria-hidden />}
        {short}
      </span>
    </Link>
  );
}

//* ---------------------------------------------------------------------------

//! AMIT NEM TUDUNK, AZT KI KELL MONDANI — ugyanaz az ígéret, mint a
//! teremkeresőé. Itt egy hiányzó terem nem hamis „szabad", hanem egy hiányzó
//! tanár vagy osztály: kisebb baj, de elhallgatni ugyanúgy nem szabad.
function SourceNote({
  answer,
  failure,
}: {
  answer: Answer | null;
  failure: Failure | null;
}) {
  if (!answer) return null;
  //* Az első hétfőtől az utolsó péntekig — a „szept. 28. – okt. 9." alak nem
  //* kér névelőt, ami a hónaptól függően „a" vagy „az" lenne.
  const first = answer.weeks[0];
  const last = answer.weeks[answer.weeks.length - 1];
  const range =
    first && last
      ? `${WEEK_FMT.format(dateFromKey(first))} – ${WEEK_FMT.format(dateFromKey(addDaysKey(last, 4)))}`
      : "";
  return (
    <div className="mt-10 space-y-3">
      {failure && (
        <p className="text-xs leading-relaxed text-pretty text-muted-strong">
          A legutóbbi frissítés nem sikerült ({FAILURE_SHORT[failure]}), ezért a
          lista a korábbi lekérésből van.
        </p>
      )}
      {answer.unknown.length > 0 && (
        <p className="flex gap-2 rounded-xl border border-border px-3 py-2.5 text-xs leading-relaxed text-pretty text-muted-strong">
          <TriangleAlert
            className="mt-px size-3.5 shrink-0 text-muted-foreground"
            aria-hidden
          />
          <span>
            Ezekről a termekről most nem jött adat:{" "}
            <span className="font-medium text-foreground">
              {answer.unknown.join(", ")}
            </span>
            . Az ott tartott órák tanárai és osztályai hiányozhatnak a listából.
          </span>
        </p>
      )}
      <p className="text-xs leading-relaxed text-pretty text-muted-foreground">
        {answer.weeks.length > 1
          ? `Két hét órarendjéből (${range}), így az A és a B hét órái is benne vannak.`
          : `Csak egy hét órarendje jött meg (${range}), ezért a csak a másik héten tartott órák hiányozhatnak.`}
        {answer.ageMinutes > 0
          ? ` Ez a válasz ${ageLabel(answer.ageMinutes)} kelt.`
          : ""}{" "}
        Óránként frissül.
      </p>
    </div>
  );
}

//* A „130 perce" helyett „2 órája" — egy lejárt példány kora órákban olvasható.
function ageLabel(minutes: number): string {
  return minutes < 60
    ? `${minutes} perce`
    : `${Math.floor(minutes / 60)} órája`;
}
