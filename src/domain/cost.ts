import { isHoliday } from "@/domain/holidays";
import { percentOf, type Cents } from "@/lib/money";
import type { IsoDate } from "@/lib/dates";

export type HolidayMode = "nessuna" | "fissa" | "percentuale";

export interface PriceList {
  baseCents: Cents;
  /** Ospiti inclusi nel prezzo base. */
  guestThreshold: number;
  extraGuestCents: Cents;
  linenSetCents: Cents;
  holidayMode: HolidayMode;
  /** Centesimi se "fissa", punti base se "percentuale". */
  holidayValue: number;
  includeSundays: boolean;
}

export interface CostInput {
  date: IsoDate;
  guestsOut: number | null;
  guestsIn: number | null;
  linenSets: number;
  extraCents: Cents;
  extraNote: string | null;
}

export interface CostResult {
  totalCents: Cents;
  lines: { label: string; cents: Cents }[];
}

export function computeCleaningCost(pl: PriceList, input: CostInput, extraHolidays: string[] = []): CostResult {
  const lines: { label: string; cents: Cents }[] = [{ label: "Base", cents: pl.baseCents }];

  const guests = input.guestsOut ?? input.guestsIn ?? 0;
  const extraGuests = Math.max(0, guests - pl.guestThreshold);
  const guestSupplement = extraGuests * pl.extraGuestCents;
  if (guestSupplement > 0) {
    lines.push({ label: `Supplemento ospiti (${extraGuests} oltre ${pl.guestThreshold})`, cents: guestSupplement });
  }

  const linen = input.linenSets * pl.linenSetCents;
  if (linen > 0) lines.push({ label: `Biancheria (${input.linenSets} set)`, cents: linen });

  if (pl.holidayMode !== "nessuna" && isHoliday(input.date, { includeSundays: pl.includeSundays, extraHolidays })) {
    const surcharge =
      pl.holidayMode === "fissa" ? pl.holidayValue : percentOf(pl.baseCents + guestSupplement, pl.holidayValue);
    if (surcharge > 0) lines.push({ label: "Maggiorazione festivo", cents: surcharge });
  }

  if (input.extraCents !== 0) {
    lines.push({ label: input.extraNote?.trim() || "Extra", cents: input.extraCents });
  }

  return { totalCents: lines.reduce((acc, l) => acc + l.cents, 0), lines };
}
