import {
  BookOpen,
  CalendarDays,
  Cast,
  DoorOpen,
  House,
  type LucideIcon,
  ShieldCheck,
  Trophy,
  Users,
} from "lucide-react";
import { clubsLaunched } from "@/lib/club-access";
import type { MenuItemId } from "@/lib/menu-items";

//! ═══════════════════════════════════════════════════════════════════════════
//! A HELYEK — AMI NEM NÉZET, DE MINDENHONNAN ELÉRHETŐ
//! ═══════════════════════════════════════════════════════════════════════════
//! Az ügyelet, a teremkereső, a kivetítés és a nyitólap NEM ugyanarra az adatra
//! néző nézet (az a `PillNav` Hét/Ma tengelye), hanem az iskoláról és a lapról
//! szóló lapok. Ezért EGY cellán osztoznak a váltóban, egy buborék mögött — és
//! ugyanez a lista adja a sáv gyorsgombjait is, hogy a kettő sose térjen el.
//*
//! AZ AZONOSÍTÓ UGYANAZ, MINT A TESTRESZABÓ JELE (`MenuItemId`). A sáv ezzel
//! kérdezi meg, látszik-e a gyorsgomb; a buborékban viszont MINDIG mind ott
//! van — a testreszabás a sávot rövidíti, nem az utat.
//! ═══════════════════════════════════════════════════════════════════════════

export type PlaceId = Extract<
  MenuItemId,
  "duty" | "rooms" | "clubs" | "contests" | "subjects" | "screens" | "home"
>;

//* A buborék sorainak jele: a helyek, és a szakkörök tengelyén a visszaút az
//* órarendhez (lásd `timetablePlace`).
export type PanelId = PlaceId | "timetable";

export type Place = {
  id: PanelId;
  href: string;
  label: string;
  hint: string;
  Icon: LucideIcon;
  /** A sáv gyorsbillentyűje (lásd `chrome/rail-tips.tsx`). */
  hotkey: string;
};

//* A sorrend a buborék sorrendje: előbb az iskola lapjai, a nyitólap utoljára,
//* elválasztva — ahhoz nyúlnak a legritkábban.
export const PLACES: readonly (Place & { id: PlaceId })[] = [
  {
    id: "duty",
    href: "/ugyelet",
    label: "Ügyelet",
    hint: "Ki ügyel most, és hol",
    Icon: ShieldCheck,
    hotkey: "u",
  },
  {
    id: "rooms",
    href: "/teremkereso",
    label: "Teremkereső",
    hint: "Melyik terem üres most",
    Icon: DoorOpen,
    hotkey: "k",
  },
  //* Kinek látszik, azt a `placesFor` dönti el — a lista maga mindig teljes,
  //* hogy az útvonal felől (`placeOf`) a bevezetés előtt is ismert legyen.
  {
    id: "clubs",
    href: "/szakkorok",
    label: "Szakkörök",
    hint: "Mikor, hol, kinek",
    Icon: Users,
    hotkey: "z",
  },
  {
    id: "contests",
    href: "/versenyek",
    label: "Versenyek",
    hint: "Meddig lehet nevezni",
    Icon: Trophy,
    hotkey: "y",
  },
  {
    id: "subjects",
    href: "/tantargyak",
    label: "Tantárgyak",
    hint: "Ki tanítja, és kiknek",
    Icon: BookOpen,
    hotkey: "t",
  },
  {
    id: "screens",
    href: "/kivetites",
    label: "Kivetítés",
    hint: "A termek kivetítői",
    Icon: Cast,
    hotkey: "v",
  },
  {
    id: "home",
    href: "/home",
    label: "Nyitólap",
    hint: "Mit tud ez az órarend",
    Icon: House,
    hotkey: "n",
  },
];

const CLUB_PLACES: ReadonlySet<PanelId> = new Set(["clubs", "contests"]);

//! A SZAKKÖRÖK A BEVEZETÉS ELŐTT IS OTT VANNAK — ANNAK, AKI MEG IS NYITHATJA.
//! A lapok a `canBrowseClubs` szerint a tanárnak és az adminnak a kapcsoló
//! (`clubsLaunched`) előtt is nyílnak, mert ők töltik fel őket. A buborék
//! ugyanezt a szabályt követi: a diák addig nem lát zsákutcát, a tanár viszont
//! nem címsorból gépeli be az utat.
export function placesFor(clubs: boolean): readonly Place[] {
  if (clubs || clubsLaunched()) return PLACES;
  return PLACES.filter((p) => !CLUB_PLACES.has(p.id));
}

export function placeOf(pathname: string): Place | null {
  return PLACES.find((p) => p.href === pathname) ?? null;
}

//! A VISSZAÚT AZ ÓRARENDHEZ. A szakkörök tengelyén a váltó két cellája
//! „Szakkör" és „Verseny" (lásd `pill-nav.tsx`) — a „Hét" és a „Ma" onnan a
//! buborékból érhető el, a legutóbb nézett alakjában.
export function timetablePlace(href: string, week: boolean): Place {
  return {
    id: "timetable",
    href,
    label: "Órarend",
    hint: week ? "Vissza a heti rácshoz" : "Vissza a mai naphoz",
    Icon: CalendarDays,
    hotkey: "o",
  };
}

//! ─── A REPÜLŐ IKON ────────────────────────────────────────────────────────
//! A buborék sorára koppintva a lap VÁLT, tehát a váltó leszerelődik, és az új
//! lapon egy friss példány áll fel (ugyanaz a helyzet, mint a folyadék
//! átadásánál, lásd `pill-nav.tsx`). A sor ikonja ezért egy modulszintű
//! jegyzetben hagyja hátra, HOL állt a képernyőn; az új váltó onnan repíti a
//! saját cellájába. Rövid ideig érvényes: egy késve betöltő lapon a repülés már
//! nem a koppintás folytatása, hanem egy váratlan mozgás.
type Flight = {
  id: PanelId;
  x: number;
  y: number;
  size: number;
  at: number;
};
let flight: Flight | null = null;
const FLIGHT_TTL = 1400;

export function launchFlight(id: PanelId, el: Element | null) {
  if (!el) return;
  const r = el.getBoundingClientRect();
  flight = {
    id,
    x: r.left + r.width / 2,
    y: r.top + r.height / 2,
    size: r.width,
    at: performance.now(),
  };
}

export function readFlight(id: PanelId | undefined): Flight | null {
  if (typeof window === "undefined" || !flight || flight.id !== id) return null;
  return performance.now() - flight.at < FLIGHT_TTL ? flight : null;
}
