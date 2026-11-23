import { addDays, weekday, type IsoDate } from "@/lib/dates";

/** Domenica di Pasqua (algoritmo gregoriano anonimo). */
export function easterSunday(year: number): IsoDate {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Festività nazionali italiane. Il 4 ottobre (San Francesco) è festa nazionale
 * dal 2026 (legge 151/2025). Le feste patronali locali si aggiungono da configurazione.
 */
export function italianHolidays(year: number): Set<IsoDate> {
  const fixed = ["01-01", "01-06", "04-25", "05-01", "06-02", "08-15", "11-01", "12-08", "12-25", "12-26"];
  if (year >= 2026) fixed.push("10-04");
  const easter = easterSunday(year);
  return new Set([...fixed.map((md) => `${year}-${md}`), easter, addDays(easter, 1)]);
}

export function isHoliday(date: IsoDate, options: { includeSundays: boolean; extraHolidays?: string[] }): boolean {
  if (options.includeSundays && weekday(date) === 0) return true;
  const year = Number(date.slice(0, 4));
  if (italianHolidays(year).has(date)) return true;
  // Feste locali in formato "MM-DD" (ogni anno) oppure "YYYY-MM-DD".
  return (options.extraHolidays ?? []).some((h) => h === date || h === date.slice(5));
}
