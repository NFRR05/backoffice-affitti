// Date in formato ISO "YYYY-MM-DD" (giorni di calendario, senza fuso orario)
// e orari locali di Roma. Le date di check-in/out sono giorni, non istanti.

export type IsoDate = string; // "2026-11-22"
export type Period = string; // "2026-11"

const ROME = "Europe/Rome";

export function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function toUtcDate(iso: IsoDate): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function fromUtcDate(date: Date): IsoDate {
  return date.toISOString().slice(0, 10);
}

export function addDays(iso: IsoDate, days: number): IsoDate {
  const date = toUtcDate(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return fromUtcDate(date);
}

export function diffDays(from: IsoDate, to: IsoDate): number {
  return Math.round((toUtcDate(to).getTime() - toUtcDate(from).getTime()) / 86_400_000);
}

/** 0 = domenica, 6 = sabato */
export function weekday(iso: IsoDate): number {
  return toUtcDate(iso).getUTCDay();
}

/** Parti di data e ora di un istante, nel fuso orario di Roma. */
export function romeParts(instant: Date): { date: IsoDate; time: string; hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: ROME,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  const hour = Number(get("hour"));
  const minute = Number(get("minute"));
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    time: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
    hour,
    minute,
  };
}

export function todayRome(now: Date = new Date()): IsoDate {
  return romeParts(now).date;
}

/** Converte un istante UTC (es. 20240701T140000Z) nel giorno di Roma. */
export function instantToRomeDate(instant: Date): IsoDate {
  return romeParts(instant).date;
}

const WEEKDAYS_IT = ["dom", "lun", "mar", "mer", "gio", "ven", "sab"];
const MONTHS_IT = [
  "gennaio",
  "febbraio",
  "marzo",
  "aprile",
  "maggio",
  "giugno",
  "luglio",
  "agosto",
  "settembre",
  "ottobre",
  "novembre",
  "dicembre",
];

/** "dom 22/11" */
export function formatShort(iso: IsoDate): string {
  const [, m, d] = iso.split("-");
  return `${WEEKDAYS_IT[weekday(iso)]} ${d}/${m}`;
}

/** "22/11/2026" */
export function formatDate(iso: IsoDate): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

/** "novembre 2026" */
export function formatPeriod(period: Period): string {
  const [y, m] = period.split("-").map(Number);
  return `${MONTHS_IT[m - 1]} ${y}`;
}

export function periodOf(iso: IsoDate): Period {
  return iso.slice(0, 7);
}

export function periodBounds(period: Period): { first: IsoDate; last: IsoDate; nextFirst: IsoDate } {
  const [y, m] = period.split("-").map(Number);
  const first = `${period}-01`;
  const nextFirst = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
  return { first, last: addDays(nextFirst, -1), nextFirst };
}

export function previousPeriod(period: Period): Period {
  const [y, m] = period.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

export function nextPeriod(period: Period): Period {
  return periodOf(periodBounds(period).nextFirst);
}

/** Confronta orari "HH:MM". */
export function timeGte(a: string, b: string): boolean {
  return a.localeCompare(b) >= 0;
}

export function hoursBetween(from: Date, to: Date): number {
  return (to.getTime() - from.getTime()) / 3_600_000;
}

const WEEKDAYS_LONG_IT = ["domenica", "lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato"];

/** "lunedì 23 novembre" */
export function formatLong(iso: IsoDate): string {
  const [, m, d] = iso.split("-").map(Number);
  return `${WEEKDAYS_LONG_IT[weekday(iso)]} ${d} ${MONTHS_IT[m - 1]}`;
}
