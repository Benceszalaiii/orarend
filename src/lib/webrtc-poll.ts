"use client";

//! ═══════════════════════════════════════════════════════════════════════════
//! A SZIVATTYÚ — EGY LEKÉRDEZŐ HUROK, AMIBŐL MINDIG PONTOSAN EGY FUT
//! ═══════════════════════════════════════════════════════════════════════════
//! EZ A MODUL EGY KONKRÉT HIBÁBÓL SZÜLETETT, ÉS ÉRDEMES LEÍRNI, MELYIKBŐL.
//!
//! A jelzés lekérdezése eredetileg így nézett ki:
//!
//!     async function poll() {
//!       const messages = await drainSignals(...);   // ← ITT VÁR
//!       ...
//!       timer = setTimeout(poll, INTERVAL);
//!     }
//!     // máshol, amikor újra kellett indítani:
//!     clearTimeout(timer);
//!     void poll();
//!
//! A `clearTimeout` EGY VÁRAKOZÓ IDŐZÍTŐT TÖRÖL, DE EGY FUTÓ HÍVÁST NEM ÁLLÍT
//! MEG. Ha a hurok épp a válaszra várt, a törlésnek nem volt mit törölnie — a
//! régi hurok a válasz megérkezésekor vidáman ütemezte magát tovább, MIKÖZBEN
//! a `void poll()` már elindított egy másodikat. Onnantól ketten futottak,
//! ugyanabba az EGY `timer` változóba írva: a következő `clearTimeout` így már
//! csak az egyiküket érte el, a másik örökre elszabadult.
//!
//! És mivel ez minden lapváltásnál (`visibilitychange`) és minden
//! kapcsolat-megingásnál megismétlődött, a hurkok SZAPORODTAK. Másodpercenként
//! öt kérés a szerver felé — nem egy rossz időzítőérték miatt, hanem mert
//! tucatnyi hurok futott egymásról nem tudva.
//!
//! ─── A MEGOLDÁS: NEMZEDÉKSZÁM ──────────────────────────────────────────────
//! Minden újraindítás növel egy számlálót, és minden futó kör megjegyzi, ő
//! melyik nemzedékhez tartozik. A kör MINDEN várakozás után megnézi, ő-e még az
//! aktuális — ha nem, csendben kilép, és nem ütemez semmit.
//!
//! Ettől lesz igaz az az egy mondat, amit egy lekérdező huroktól elvárunk:
//! EGYSZERRE LEGFELJEBB EGY KÖR ÉLHET, akárhányszor és akárhonnan indítják
//! újra.
//! ═══════════════════════════════════════════════════════════════════════════

/**
 * A kör törzse. A visszatérési érték a KÖVETKEZŐ kör késleltetése
 * ezredmásodpercben — `null` esetén a szivattyú magától megáll.
 */
export type Tick = () => Promise<number | null>;

export class Pump {
  //! A NEMZEDÉK AZ EGYETLEN IGAZSÁG arról, melyik kör él. Nem logikai jelző,
  //! mert abból nem derülne ki, hogy egy ÚJABB újraindítás közben történt-e.
  private generation = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private stopped = false;

  constructor(private readonly tick: Tick) {}

  /**
   * Azonnali kör, a korábbi elvetésével. Nyugodtan hívható olyankor is, amikor
   * épp fut egy kör (lapváltás, visszatérő kapcsolat) — a régi nem ütemez
   * tovább.
   */
  restart(): void {
    if (this.stopped) return;
    clearTimeout(this.timer);
    const mine = ++this.generation;
    void this.cycle(mine);
  }

  /** Újraindítás CSAK akkor, ha épp semmi nem fut és nincs is ütemezve. */
  ensure(): void {
    if (this.stopped || this.generation > 0) return;
    this.restart();
  }

  private async cycle(mine: number): Promise<void> {
    if (this.stopped || mine !== this.generation) return;
    const next = await this.tick();
    //! A VÁRAKOZÁS UTÁN ÚJRA MEGKÉRDEZZÜK. Ez a sor a hibajavítás lényege: a
    //! `tick()` alatt eltelhetett egy újraindítás vagy egy leállítás, és
    //! ilyenkor ennek a körnek NINCS TÖBB DOLGA.
    if (this.stopped || mine !== this.generation || next === null) return;
    this.timer = setTimeout(() => void this.cycle(mine), next);
  }

  /** Végleges. Egy leállított szivattyú nem indítható újra. */
  stop(): void {
    this.stopped = true;
    //* A nemzedék léptetése a MÁR FUTÓ kört is elvágja: a `tick()` után nem
    //* fog egyezni, tehát nem ütemez.
    this.generation += 1;
    clearTimeout(this.timer);
    this.timer = undefined;
  }
}

//! ─── LASSULÁS HIBA UTÁN ───────────────────────────────────────────────────
//! EGY ELBUKOTT KÉRÉST NEM SZABAD UGYANAZZAL AZ ÜTEMMEL ISMÉTELNI. Amikor a
//! tároló egyszer elérhetetlen volt, minden hívás a DNS időkorlátjáig (4,3 mp)
//! várt, majd elszállt — a kliensek pedig változatlan ütemben próbálkoztak
//! tovább. A szerver így pont akkor kapta a legtöbb kérést, amikor a
//! legkevésbé bírta.
//!
//! Ezért a hiba KÉTSZEREZI a várakozást, egy felső határig. Egy múló zökkenő
//! után a következő sikeres kör azonnal visszaállítja a rendes ütemet — a
//! számlálót a hívó nullázza.
const MAX_RETRY_MS = 60_000;

export function afterFailure(failures: number, base: number): number {
  return Math.min(MAX_RETRY_MS, base * 2 ** Math.min(failures, 6));
}

//! ─── LASSULÁS ÜRESJÁRATBAN ─────────────────────────────────────────────────
//! A megosztónak azért kell folyamatosan kérdeznie, hogy elkapja az új
//! nézőket. Egy becsatlakozás viszont ritka esemény: egy 45 perces órán
//! néhányszor fordul elő, a maradék 44 percben a láda üres.
//!
//! Ezért a hurok LASSUL, ha nincs mit hozni, és AZONNAL visszagyorsul, amint
//! érkezik valami. A lassulás felső határa szándékosan kisebb, mint a néző
//! ismételt jelentkezésének üteme (`REJOIN_MS`, 3 mp) plusz egy kör — így egy
//! várakozó diák sosem áll tovább pár másodpercnél.
export function backoff(
  idleRounds: number,
  fast: number,
  slow: number,
): number {
  //* Tíz üres kör (kb. 15 másodperc) után váltunk lassúra. Ennél hamarabb
  //* lassítani annyi lenne, mint a kézfogás közepén elengedni a kezet.
  return idleRounds < 10 ? fast : slow;
}
