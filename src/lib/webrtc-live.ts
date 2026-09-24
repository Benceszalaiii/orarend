"use client";

import { useEffect, useState } from "react";
import { extrasKey } from "./lesson-extras";
import type { StreamSummary } from "./webrtc-shared";
import { fetchStreams } from "./webrtc-signal";

//! ═══════════════════════════════════════════════════════════════════════════
//! „MOST ÉLŐBEN" — A JELZÉS AZ ÓRARENDEN
//! ═══════════════════════════════════════════════════════════════════════════
//! A `/webrtc` lap felfedező listája arra jó, aki MÁR odament. A diák viszont
//! nem oda megy, hanem az órarendjéhez — a jelzésnek ott kell lennie, az óra
//! mellett, ahol amúgy is nézi, mi következik.
//!
//! ─── EGY KÉRDÉS, SOK KÉRDEZŐ ───────────────────────────────────────────────
//! EZÉRT VAN MODULSZINTŰ, KÖZÖS LEKÉRDEZÉS, ÉS NEM HOROGONKÉNT SAJÁT. Egy
//! megnyitott órarendben több doboz is kérdezhetné ugyanazt („megy-e most
//! valami?"), és mindegyik külön kérést indítana ugyanarra a válaszra. Így
//! ehelyett EGY óra jár, akárhány feliratkozó van, és amikor az utolsó is
//! leszerel, meg is áll.
//!
//! LASSÚ ÜTEM, ÉS EZ SZÁNDÉKOS. Ez nem a jelzőcsatorna: itt senki nem vár
//! másodpercre. Húsz másodperc alatt megjelenni egy órán át tartó megosztásról
//! bőven elég, és ennyi a teljes ára annak, hogy a jelzés egyáltalán ott
//! legyen az órarendben.
//!
//! AZ ELSŐ VÁLASZIG NEM MUTATUNK SEMMIT. Nem „nincs élő megosztás" a kezdő
//! állapot, hanem „még nem tudom" (`null`) — különben minden órarendnyitáskor
//! felvillanna egy hamis „nincs", majd átbillenne. A hívó ezt a különbséget
//! látja, és amíg nem tudjuk, egyszerűen nem ír ki semmit.
//! ═══════════════════════════════════════════════════════════════════════════

const POLL_MS = 20_000;
//* Ennél frissebb választ nem kérünk újra: egy másik doboz csatlakozása nem
//* indít új kört, hanem megkapja a meglévőt.
const FRESH_MS = 5_000;

type Listener = (streams: StreamSummary[]) => void;

const listeners = new Set<Listener>();
let current: StreamSummary[] | null = null;
let fetchedAt = 0;
//* Az utolsó KÍSÉRLET ideje, sikertől függetlenül — ebből ütemezünk.
let triedAt = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
let inFlight = false;

//! REJTETT LAPON NEM KÉRDEZÜNK. Egy háttérben nyitva felejtett órarend
//! (egy telepített alkalmazás akár egész nap) különben húszmásodpercenként
//! kérdezne egy jelzésre, amit senki nem lát. A visszatérés azonnal kérdez,
//! ha a válasz már régebbi egy ütemnél, különben kivárja a maradékot — a
//! jelzés így sosem régebbi, mint eddig, amikor valaki ránéz.
function hidden(): boolean {
  return (
    typeof document !== "undefined" && document.visibilityState === "hidden"
  );
}

function schedule(): void {
  clearTimeout(timer);
  timer = undefined;
  if (listeners.size === 0 || hidden()) return;
  const due = triedAt + POLL_MS - Date.now();
  if (due <= 0) void pull();
  else timer = setTimeout(pull, due);
}

async function pull(): Promise<void> {
  if (inFlight) return;
  //* Egy elrejtés előtt ütemezett kör sem kérdez már. Ha még semmit nem
  //* tudunk (`current === null`), az első választ akkor is elkérjük.
  if (current !== null && hidden()) return;
  inFlight = true;
  const list = await fetchStreams();
  inFlight = false;
  //* A hibát nem tesszük ki a felületre: marad az előző válasz. Egy pillanatnyi
  //* hálózati zökkenő ne tüntesse el az „élő" jelzést egy futó óráról.
  if (list) {
    current = list.streams;
    fetchedAt = Date.now();
    for (const listener of listeners) listener(current);
  }
  //* A hibás kör is kör: a következő egy teljes ütem múlva jön, nem azonnal.
  triedAt = Date.now();
  schedule();
}

function onVisibility(): void {
  schedule();
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  if (current !== null) listener(current);
  if (listeners.size === 1) {
    document.addEventListener("visibilitychange", onVisibility);
    //* Az első feliratkozó indítja az órát. Ha a legutóbbi válasz még friss,
    //* nem kérdezünk azonnal újra, csak a következő körben.
    if (Date.now() - fetchedAt < FRESH_MS) schedule();
    else void pull();
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      document.removeEventListener("visibilitychange", onVisibility);
      clearTimeout(timer);
      timer = undefined;
    }
  };
}

/** `null`: még nincs válasz. Üres tömb: tudjuk, hogy semmi nem megy. */
export function useLiveStreams(): StreamSummary[] | null {
  const [streams, setStreams] = useState<StreamSummary[] | null>(current);
  useEffect(() => subscribe(setStreams), []);
  return streams;
}

//! A TANÁR JELÉT UGYANAZZAL A `extrasKey`-JEL HOZZUK KÖZÖS NEVEZŐRE, AMIVEL A
//! TÖBBI KÖZÖS SOR. A kártyán „Kovács B.", a tanárlistában „KovácsB", a
//! munkamenetben megint más alak állhat; ha itt nyers összehasonlítás lenne, a
//! jelzés némán elmaradna — és pont az a hiba, amit senki nem jelent be, mert
//! „csak nem indított megosztást".
export function liveStreamOfTeacher(
  streams: StreamSummary[] | null,
  teacher: string,
): StreamSummary | null {
  if (!streams) return null;
  const wanted = extrasKey(teacher);
  if (!wanted) return null;
  return (
    streams.find((s) => s.teacher !== null && s.teacher === wanted) ?? null
  );
}
