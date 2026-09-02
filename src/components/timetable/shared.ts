export function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

export function mondayKey(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d));
  const isoDow = ((utc.getUTCDay() + 6) % 7) + 1;
  utc.setUTCDate(utc.getUTCDate() - (isoDow - 1));
  return utc.toISOString().slice(0, 10);
}

export function addDaysKey(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d));
  utc.setUTCDate(utc.getUTCDate() + days);
  return utc.toISOString().slice(0, 10);
}

export function dateToKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayKey(): string {
  return dateToKey(new Date());
}

export function dateFromKey(dateKey: string): Date {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(y, m - 1, d, 12);
}

export function minLabel(min: number): string {
  return `${pad(Math.floor(min / 60))}:${pad(Math.round(min % 60))}`;
}

export function rangeLabel(startMin: number, endMin: number): string {
  return `${minLabel(startMin)}–${minLabel(endMin)}`;
}

export function durationLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} perc`;
  if (m === 0) return `${h} óra`;
  return `${h} óra ${m} perc`;
}

const rangeFmt = new Intl.DateTimeFormat("hu-HU", {
  month: "short",
  day: "numeric",
});
const fullFmt = new Intl.DateTimeFormat("hu-HU", {
  year: "numeric",
  month: "short",
  day: "numeric",
});

//! A HÉT CÍMKÉJE KÉT HOSSZBAN. Az évszám a sor legkevésbé hasznos adata —
//! majdnem mindig az idei év —, viszont ~70 px-et kér. Pont annyit, amennyitől
//! a telefonos eszköztár HARMADIK sorba törik, és a harmadik sor egy 100dvh-s
//! lapon nem a fejlécből megy el, hanem a rácsból. Szűk eszköztáron ezért az
//! évszám nélküli alak megy ki; a teljes alak marad ott, ahol elfér.
//*
//! A HÓNAP SEM KELL KÉTSZER. A tanítási hetek nagy része egyetlen hónapon
//! belül van („szept. 8. – szept. 12."), és ott a második hónapnév ~40 px-nyi
//! ismétlés. A rövid alak ezért csak a napot mondja el másodszor — ennyin
//! múlik, hogy a hónapfordulós heteken se törjön sorba a sáv. A hosszabb,
//! hónapfordulós alak marad ott, ahol tényleg két hónapról van szó.
export function weekLabel(weekStart: string, compact = false): string {
  const start = dateFromKey(weekStart);
  const end = dateFromKey(addDaysKey(weekStart, 4));
  if (compact && start.getMonth() === end.getMonth()) {
    return `${rangeFmt.format(start)} – ${end.getDate()}.`;
  }
  const from = compact ? rangeFmt.format(start) : fullFmt.format(start);
  return `${from} – ${rangeFmt.format(end)}`;
}

export const DAY_NAMES = ["Hétfő", "Kedd", "Szerda", "Csütörtök", "Péntek"];
export const DAY_SHORT = ["H", "K", "Sze", "Cs", "P"];

export const CELL_RADIUS = "rounded-[7px]";

export const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];
