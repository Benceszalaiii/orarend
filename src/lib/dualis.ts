//! ─── DUÁLIS KÉPZÉS ─────────────────────────────────────────────────────────
//! A duális blokk kéthetente ismétlődik, és NEM naptári hétre esik: szerdán
//! kezdődik és a következő kedden ér véget. A Jedlikinfo A/B jelölésével
//! kifejezve ez pontosan: B hét szerda–péntek + A hét hétfő–kedd.
//!
//! A ciklus fázisát ezért NEM mi számoljuk egy rögzített kezdődátumból: az A/B
//! váltás szünet vagy tanévkezdés miatt eltolódhat, és azt a suli rendszere
//! úgyis tudja. Mi csak lefordítjuk a már meglévő hét-jelölést arra, hogy az
//! adott nap munkahelyen vagy iskolában telik-e.

export type DualStatus =
  | "dual" //* duális képzés — a munkahelyen
  | "school" //* iskolai nap — a rács órái érvényesek
  | "unknown"; //* a hét nincs A/B-vel jelölve (szünet, tanévkezdés)

export const DUAL_LABEL: Record<DualStatus, string> = {
  dual: "Duális",
  school: "Iskola",
  unknown: "?",
};

/**
 * Egy tanítási nap duális állapota a hét A/B jelöléséből.
 *
 * @param dayOfWeek ISO nap (1 = hétfő … 5 = péntek)
 * @param weekLetter a HÉT jelölése (`"A"` / `"B"`), nem a napé — a Jedlikinfo
 *   egyes napokra üres jelölést ad (pl. tanítás nélküli hétfő), a hét egésze
 *   viszont mindig egyértelmű.
 */
export function dualStatusOf(
  dayOfWeek: number,
  weekLetter: string,
): DualStatus {
  if (weekLetter !== "A" && weekLetter !== "B") return "unknown";
  if (weekLetter === "B") return dayOfWeek >= 3 ? "dual" : "school";
  return dayOfWeek <= 2 ? "dual" : "school";
}
