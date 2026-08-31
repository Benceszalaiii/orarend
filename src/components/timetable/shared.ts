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

export function weekLabel(weekStart: string): string {
  const start = dateFromKey(weekStart);
  const end = dateFromKey(addDaysKey(weekStart, 4));
  return `${fullFmt.format(start)} – ${rangeFmt.format(end)}`;
}

export const DAY_NAMES = ["Hétfő", "Kedd", "Szerda", "Csütörtök", "Péntek"];
export const DAY_SHORT = ["H", "K", "Sze", "Cs", "P"];

export const CELL_RADIUS = "rounded-[7px]";

export const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];
