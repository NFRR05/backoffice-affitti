// Tutti gli importi sono in centesimi interi. Le percentuali in punti base
// (10000 = 100%, 2200 = 22%). Nessun numero decimale nei calcoli.

export type Cents = number;
export type Bps = number;

/** Percentuale di un importo, arrotondata al centesimo (metà per eccesso, simmetrica). */
export function percentOf(amount: Cents, rate: Bps): Cents {
  const raw = (amount * rate) / 10_000;
  return Math.sign(raw) * Math.round(Math.abs(raw));
}

export function sum(values: Cents[]): Cents {
  return values.reduce((acc, v) => acc + v, 0);
}

/** Ripartisce un importo secondo quote in punti base; l'ultima quota assorbe gli arrotondamenti. */
export function splitByShares(amount: Cents, shares: Bps[]): Cents[] {
  if (shares.length === 0) return [];
  const parts = shares.map((s) => percentOf(amount, s));
  const diff = amount - sum(parts);
  parts[parts.length - 1] += diff;
  return parts;
}

const formatter = new Intl.NumberFormat("it-IT", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  // In italiano Intl non raggruppa le migliaia sotto 10.000 ("2196"): forziamo "2.196".
  useGrouping: "always",
});

/** 219600 → "2.196,00 €" */
export function formatEuro(cents: Cents): string {
  return formatter.format(cents / 100);
}

/** "2.196,00" / "2196.5" / "2196" → centesimi. Restituisce null se non valido. */
export function parseEuro(input: string): Cents | null {
  const cleaned = input.trim().replace(/€/g, "").replace(/\s/g, "");
  if (cleaned === "") return null;
  let normalized = cleaned;
  if (cleaned.includes(",")) {
    normalized = cleaned.replace(/\./g, "").replace(",", ".");
  }
  if (!/^-?\d+(\.\d{1,2})?$/.test(normalized)) return null;
  return Math.round(Number(normalized) * 100);
}

export function formatBps(rate: Bps): string {
  const pct = rate / 100;
  return `${Number.isInteger(pct) ? pct : pct.toFixed(2).replace(".", ",")}%`;
}
