//! ─── A GÉPTERMEK LISTÁJA KÉZZEL ÁLL, MERT A FORRÁS NEM TUDJA ──────────────
//! A Jedlikinfo a termekről csak a jelüket és a nevüket mondja meg — azt nem,
//! hogy van-e bennük gép. Ez a halmaz tehát ISKOLAI TUDÁS, nem levezetés: ha
//! egy terem gépet kap vagy elveszíti, ITT kell átírni, más nem fogja észrevenni.
//! A teremkereső „Csak géptermek" szűrője és a szakkör-tervező ugyanezt olvassa.
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

export function isComputerRoom(short: string): boolean {
  return COMPUTER_ROOMS.has(short.trim().toLocaleLowerCase("hu"));
}
