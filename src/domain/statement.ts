import { z } from "zod";
import { diffDays, periodBounds, type IsoDate, type Period } from "@/lib/dates";
import { formatBps, percentOf, splitByShares, sum, type Cents } from "@/lib/money";

/** Parametri del contratto con il proprietario. Vedi il piano, sezione "Tipi di contratto". */
export const contractParamsSchema = z.object({
  /** Mese a cui si attribuisce una prenotazione. */
  attribution: z.enum(["checkin", "checkout", "notti"]).default("checkin"),
  commissionBase: z.enum(["lordo", "netto_ota", "netto_ota_pulizie"]).default("netto_ota"),
  commissionType: z.enum(["percentuale", "fissa", "percentuale_con_minimo"]).default("percentuale"),
  commissionRateBps: z.number().int().min(0).max(10_000).default(2000),
  fixedMonthlyCents: z.number().int().min(0).default(0),
  minimumCents: z.number().int().min(0).default(0),
  cleaningCostsBorneBy: z.enum(["proprietario", "gestore"]).default("proprietario"),
  guestCleaningFee: z.enum(["ricavo_proprietario", "rimborso_gestore"]).default("ricavo_proprietario"),
  /** 2200 = IVA 22%; 0 = regime forfettario. */
  vatRateBps: z.number().int().min(0).max(10_000).default(2200),
  withholding: z
    .object({
      enabled: z.boolean().default(false),
      rateBps: z.number().int().default(2100),
      base: z.enum(["lordo", "netto_ota"]).default("lordo"),
    })
    .default({ enabled: false, rateBps: 2100, base: "lordo" }),
});

export type ContractParams = z.infer<typeof contractParamsSchema>;

export interface StatementReservation {
  id: string;
  label: string;
  channel: string;
  checkin: IsoDate;
  checkout: IsoDate;
  grossCents: Cents | null;
  otaCommissionCents: Cents | null;
  guestCleaningFeeCents: Cents | null;
  touristTaxCents: Cents | null;
}

export interface StatementCleaning {
  id: string;
  date: IsoDate;
  costCents: Cents;
}

export interface StatementExpense {
  id: string;
  date: IsoDate;
  description: string;
  amountCents: Cents;
}

export interface StatementOwner {
  id: string;
  name: string;
  shareBps: number;
}

export interface StatementInput {
  period: Period;
  contract: ContractParams;
  reservations: StatementReservation[];
  cleanings: StatementCleaning[];
  expenses: StatementExpense[];
  owners: StatementOwner[];
}

export interface ReservationLine {
  id: string;
  label: string;
  channel: string;
  checkin: IsoDate;
  checkout: IsoDate;
  nights: number;
  nightsInPeriod: number;
  grossCents: Cents;
  otaCommissionCents: Cents;
  netCents: Cents;
  guestCleaningFeeCents: Cents;
  touristTaxCents: Cents;
}

export type SummaryKind = "ricavo" | "costo" | "subtotale" | "totale" | "info";

export interface SummaryLine {
  label: string;
  cents: Cents;
  kind: SummaryKind;
}

export interface StatementTotals {
  grossCents: Cents;
  otaCommissionCents: Cents;
  netCents: Cents;
  guestCleaningFeeCents: Cents;
  touristTaxCents: Cents;
  cleaningCostsCents: Cents;
  cleaningCount: number;
  expensesCents: Cents;
  commissionBaseCents: Cents;
  commissionCents: Cents;
  vatCents: Cents;
  withholdingCents: Cents;
  /** Imponibile + IVA della fattura del gestore. */
  managerInvoiceCents: Cents;
  ownerPayoutCents: Cents;
}

export interface StatementResult {
  period: Period;
  reservationLines: ReservationLine[];
  cleanings: StatementCleaning[];
  expenses: StatementExpense[];
  summary: SummaryLine[];
  totals: StatementTotals;
  ownerSplit: { ownerId: string; name: string; shareBps: number; amountCents: Cents }[];
  warnings: string[];
}

/** Notti della prenotazione che cadono nel mese (per l'attribuzione "notti"). */
function nightsInPeriod(checkin: IsoDate, checkout: IsoDate, period: Period): number {
  const { first, nextFirst } = periodBounds(period);
  const start = checkin > first ? checkin : first;
  const end = checkout < nextFirst ? checkout : nextFirst;
  return Math.max(0, diffDays(start, end));
}

function allocate(amount: Cents, part: number, whole: number): Cents {
  if (whole === 0) return 0;
  return Math.round((amount * part) / whole);
}

const BASE_LABEL: Record<ContractParams["commissionBase"], string> = {
  lordo: "sul lordo",
  netto_ota: "sul netto dei portali",
  netto_ota_pulizie: "sul netto dei portali e delle pulizie",
};

export function computeStatement(input: StatementInput): StatementResult {
  const { period, contract: c } = input;
  const { first, last } = periodBounds(period);
  const warnings: string[] = [];

  const lines: ReservationLine[] = [];
  for (const r of input.reservations) {
    const nights = diffDays(r.checkin, r.checkout);
    let inPeriod = 0;
    if (c.attribution === "checkin") inPeriod = r.checkin >= first && r.checkin <= last ? nights : 0;
    else if (c.attribution === "checkout") inPeriod = r.checkout >= first && r.checkout <= last ? nights : 0;
    else inPeriod = nightsInPeriod(r.checkin, r.checkout, period);
    if (inPeriod === 0) continue;

    if (r.grossCents === null) {
      warnings.push(`${r.label}: importi mancanti, prenotazione esclusa dal calcolo.`);
      continue;
    }
    if (r.otaCommissionCents === null) {
      warnings.push(`${r.label}: commissione del portale non indicata, considerata 0.`);
    }
    const gross = allocate(r.grossCents, inPeriod, nights);
    const ota = allocate(r.otaCommissionCents ?? 0, inPeriod, nights);
    const gcf = allocate(r.guestCleaningFeeCents ?? 0, inPeriod, nights);
    const tax = allocate(r.touristTaxCents ?? 0, inPeriod, nights);
    lines.push({
      id: r.id,
      label: r.label,
      channel: r.channel,
      checkin: r.checkin,
      checkout: r.checkout,
      nights,
      nightsInPeriod: inPeriod,
      grossCents: gross,
      otaCommissionCents: ota,
      netCents: gross - ota,
      guestCleaningFeeCents: gcf,
      touristTaxCents: tax,
    });
  }
  lines.sort((a, b) => a.checkin.localeCompare(b.checkin));

  const gross = sum(lines.map((l) => l.grossCents));
  const ota = sum(lines.map((l) => l.otaCommissionCents));
  const net = gross - ota;
  const gcf = sum(lines.map((l) => l.guestCleaningFeeCents));
  const touristTax = sum(lines.map((l) => l.touristTaxCents));
  const cleaningCosts = sum(input.cleanings.map((x) => x.costCents));
  const expenses = sum(input.expenses.map((x) => x.amountCents));
  const gcfToManager = c.guestCleaningFee === "rimborso_gestore" ? gcf : 0;
  const cleaningToOwner = c.cleaningCostsBorneBy === "proprietario" ? cleaningCosts : 0;

  let base = 0;
  if (c.commissionBase === "lordo") base = gross - gcfToManager;
  else if (c.commissionBase === "netto_ota") base = net - gcfToManager;
  else base = net - gcfToManager - cleaningCosts;
  base = Math.max(0, base);

  let commission = 0;
  if (c.commissionType === "percentuale") commission = percentOf(base, c.commissionRateBps);
  else if (c.commissionType === "fissa") commission = c.fixedMonthlyCents;
  else commission = Math.max(percentOf(base, c.commissionRateBps), c.minimumCents);

  const vat = percentOf(commission, c.vatRateBps);

  let withholding = 0;
  if (c.withholding.enabled) {
    const wBase = c.withholding.base === "lordo" ? gross : net;
    withholding = percentOf(wBase, c.withholding.rateBps);
    warnings.push("Ritenuta d'acconto: base e momento di applicazione da validare con il commercialista.");
  }

  const payout = net - gcfToManager - cleaningToOwner - commission - vat - expenses - withholding;

  const summary: SummaryLine[] = [
    { label: `Incassi lordi delle prenotazioni (${lines.length})`, cents: gross, kind: "ricavo" },
    { label: "Commissioni dei portali", cents: -ota, kind: "costo" },
    { label: "Incassi netti", cents: net, kind: "subtotale" },
  ];
  if (gcfToManager > 0) {
    summary.push({ label: "Quota pulizie pagata dagli ospiti (al gestore)", cents: -gcfToManager, kind: "costo" });
  }
  if (cleaningToOwner > 0) {
    summary.push({ label: `Pulizie (${input.cleanings.length} interventi)`, cents: -cleaningToOwner, kind: "costo" });
  }
  if (expenses > 0) summary.push({ label: "Spese aggiuntive", cents: -expenses, kind: "costo" });
  const commissionLabel =
    c.commissionType === "fissa"
      ? "Quota fissa di gestione"
      : `Commissione di gestione ${formatBps(c.commissionRateBps)} ${BASE_LABEL[c.commissionBase]}` +
        (c.commissionType === "percentuale_con_minimo" && commission === c.minimumCents && commission > 0
          ? " (minimo garantito)"
          : "");
  summary.push({ label: commissionLabel, cents: -commission, kind: "costo" });
  if (vat > 0) summary.push({ label: `IVA ${formatBps(c.vatRateBps)} sulla commissione`, cents: -vat, kind: "costo" });
  if (withholding > 0) {
    summary.push({ label: `Ritenuta d'acconto ${formatBps(c.withholding.rateBps)}`, cents: -withholding, kind: "costo" });
  }
  summary.push({ label: "Spettante al proprietario", cents: payout, kind: "totale" });
  if (touristTax > 0) {
    summary.push({
      label: "Tassa di soggiorno (esclusa: incassata per conto del Comune)",
      cents: touristTax,
      kind: "info",
    });
  }

  if (payout < 0) warnings.push("L'importo spettante al proprietario è negativo: controlla costi e spese.");

  const owners = input.owners.length > 0 ? input.owners : [];
  const shareTotal = sum(owners.map((o) => o.shareBps));
  if (owners.length > 0 && shareTotal !== 10_000) {
    warnings.push(`Le quote dei proprietari sommano a ${formatBps(shareTotal)} invece di 100%.`);
  }
  const amounts = splitByShares(payout, owners.map((o) => o.shareBps));
  const ownerSplit = owners.map((o, i) => ({ ownerId: o.id, name: o.name, shareBps: o.shareBps, amountCents: amounts[i] }));

  return {
    period,
    reservationLines: lines,
    cleanings: input.cleanings,
    expenses: input.expenses,
    summary,
    totals: {
      grossCents: gross,
      otaCommissionCents: ota,
      netCents: net,
      guestCleaningFeeCents: gcf,
      touristTaxCents: touristTax,
      cleaningCostsCents: cleaningCosts,
      cleaningCount: input.cleanings.length,
      expensesCents: expenses,
      commissionBaseCents: base,
      commissionCents: commission,
      vatCents: vat,
      withholdingCents: withholding,
      managerInvoiceCents: commission + vat,
      ownerPayoutCents: payout,
    },
    ownerSplit,
    warnings,
  };
}

const BASE_NAME: Record<ContractParams["commissionBase"], string> = {
  lordo: "lordo delle prenotazioni",
  netto_ota: "netto dei portali",
  netto_ota_pulizie: "netto di portali e pulizie",
};

const ATTRIBUTION_NAME: Record<ContractParams["attribution"], string> = {
  checkin: "Prenotazioni nel mese del check-in",
  checkout: "Prenotazioni nel mese del check-out",
  notti: "Prenotazioni divise per notti tra i mesi",
};

/** Il contratto in righe leggibili, per pagine e documenti. */
export function describeContract(c: ContractParams): string[] {
  const commission =
    c.commissionType === "fissa"
      ? `Quota fissa di ${(c.fixedMonthlyCents / 100).toFixed(2).replace(".", ",")} € al mese`
      : `Commissione ${formatBps(c.commissionRateBps)} sul ${BASE_NAME[c.commissionBase]}` +
        (c.commissionType === "percentuale_con_minimo" ? `, minimo ${(c.minimumCents / 100).toFixed(2).replace(".", ",")} €` : "");
  return [
    commission,
    ATTRIBUTION_NAME[c.attribution],
    `Pulizie a carico del ${c.cleaningCostsBorneBy}`,
    c.guestCleaningFee === "rimborso_gestore" ? "Quota pulizie pagata dagli ospiti: al gestore" : "Quota pulizie pagata dagli ospiti: al proprietario",
    c.vatRateBps > 0 ? `IVA ${formatBps(c.vatRateBps)} sulla commissione` : "Commissione senza IVA",
    ...(c.withholding.enabled ? [`Ritenuta ${formatBps(c.withholding.rateBps)} sul ${c.withholding.base === "lordo" ? "lordo" : "netto dei portali"}`] : []),
  ];
}
