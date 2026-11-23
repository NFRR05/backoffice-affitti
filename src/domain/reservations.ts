import { addDays, type IsoDate } from "@/lib/dates";
import type { IncomingReservation } from "@/domain/ical";

export type ReservationStatus = "confermata" | "cancellata" | "conclusa" | "da_verificare";

export interface StoredReservation {
  id: string;
  externalUid: string;
  checkin: IsoDate;
  checkout: IsoDate;
  status: ReservationStatus;
}

export interface ReservationDiff {
  toCreate: IncomingReservation[];
  toUpdate: {
    id: string;
    before: { checkin: IsoDate; checkout: IsoDate; status: ReservationStatus };
    after: { checkin: IsoDate; checkout: IsoDate; status: ReservationStatus };
    externalCode: string | null;
  }[];
  toCancel: string[];
  toConclude: string[];
  toVerify: string[];
  /** Calendario vuoto mentre ci sono prenotazioni future: nessuna cancellazione applicata. */
  safetyStop: boolean;
}

/** Quanto indietro nel tempo importare le prenotazioni alla prima lettura. */
export const IMPORT_LOOKBACK_DAYS = 45;

/**
 * Confronta le prenotazioni salvate per un calendario con quelle appena lette.
 * Regole di sicurezza:
 * - una prenotazione sparita con check-out passato è "conclusa", non cancellata
 *   (Airbnb esporta solo le date future);
 * - una prenotazione sparita mentre è in corso va "da verificare";
 * - un calendario vuoto non cancella nulla se c'erano prenotazioni future.
 */
export function diffReservations(
  existing: StoredReservation[],
  incoming: IncomingReservation[],
  today: IsoDate,
): ReservationDiff {
  const result: ReservationDiff = {
    toCreate: [],
    toUpdate: [],
    toCancel: [],
    toConclude: [],
    toVerify: [],
    safetyStop: false,
  };

  const incomingByUid = new Map<string, IncomingReservation>();
  for (const r of incoming) {
    if (!incomingByUid.has(r.externalUid)) incomingByUid.set(r.externalUid, r);
  }
  const existingByUid = new Map(existing.map((r) => [r.externalUid, r]));

  const hasFutureActive = existing.some(
    (r) => (r.status === "confermata" || r.status === "da_verificare") && r.checkin > today,
  );
  if (incomingByUid.size === 0 && hasFutureActive) {
    result.safetyStop = true;
    return result;
  }

  const oldestToImport = addDays(today, -IMPORT_LOOKBACK_DAYS);
  for (const [uid, inc] of incomingByUid) {
    const stored = existingByUid.get(uid);
    if (!stored) {
      if (inc.checkout >= oldestToImport) result.toCreate.push(inc);
      continue;
    }
    const datesChanged = stored.checkin !== inc.checkin || stored.checkout !== inc.checkout;
    const reactivate = stored.status === "cancellata" || stored.status === "da_verificare";
    if (datesChanged || reactivate) {
      result.toUpdate.push({
        id: stored.id,
        before: { checkin: stored.checkin, checkout: stored.checkout, status: stored.status },
        after: { checkin: inc.checkin, checkout: inc.checkout, status: "confermata" },
        externalCode: inc.externalCode,
      });
    }
  }

  for (const stored of existing) {
    if (incomingByUid.has(stored.externalUid)) continue;
    if (stored.status === "cancellata" || stored.status === "conclusa") continue;
    if (stored.checkout <= today) {
      result.toConclude.push(stored.id);
    } else if (stored.checkin > today) {
      result.toCancel.push(stored.id);
    } else if (stored.status !== "da_verificare") {
      result.toVerify.push(stored.id);
    }
  }

  return result;
}
