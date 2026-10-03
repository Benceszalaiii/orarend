import "server-only";

import type { WeekOccupancy } from "./free-rooms";
import { loadWeekOccupancy } from "./free-rooms-source";
import { budapestNow } from "./push-plan";
import { buildSubjectIndex, type SubjectIndex } from "./subjects";
import { addDays, mondayOf } from "./timetable";

//! ─── KÉT HÉT, MERT KÉT HÉT A CIKLUS ───────────────────────────────────────
//! Egy hét képe csak a fél igazság: a B hetes tárgy az A héten nincs ott, és
//! fordítva. A mai és a következő hét együtt az egész A/B ciklust lefedi.
//*
//! A SEPRÉST NEM MI INDÍTJUK ÚJRA. Mindkét hét a teremkereső gyorsítótárából
//! jön (`loadWeekOccupancy`): az órás frissítés, a sorbanállás és a 4-es
//! egyidejűség ugyanúgy véd, és ha a teremkereső épp lekérte a hetet, nekünk
//! már nem kerül egyetlen kérésbe sem. Mindkét hét a teremkereső ablakán belül
//! van, tehát a terhelés felső korlátja sem nő.
function indexWeeks(now = new Date()): string[] {
  const monday = mondayOf(budapestNow(now).dayKey);
  return [monday, addDays(monday, 7)];
}

//* Ugyanabból a két pillanatképből ugyanaz az index jön ki — nem építjük
//* újra minden kérésre, csak ha valamelyik hét frissült.
let built: { key: string; index: SubjectIndex } | null = null;

/**
 * A tantárgyak indexe a mai és a következő hétből.
 *
 * `null`, ha egyik hetet sem sikerült soha lekérni. Ha csak az egyik jött meg,
 * abból épül — csonkább, de igaz.
 */
export async function loadSubjectIndex(): Promise<SubjectIndex | null> {
  //* Egymás után, nem egyszerre: a seprések úgyis sorba állnak, és így a
  //* második hét nem foglal sort, amíg az első nincs meg.
  const weeks: WeekOccupancy[] = [];
  for (const week of indexWeeks()) {
    const occupancy = await loadWeekOccupancy(week);
    if (occupancy) weeks.push(occupancy);
  }
  if (weeks.length === 0) return null;

  const key = weeks.map((w) => `${w.weekStart}@${w.fetchedAt}`).join("|");
  if (built?.key === key) return built.index;
  const index = buildSubjectIndex(weeks);
  built = { key, index };
  return index;
}
