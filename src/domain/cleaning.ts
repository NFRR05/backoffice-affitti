import { formatShort, type IsoDate } from "@/lib/dates";
import type { ReservationStatus } from "@/domain/reservations";

export type CleaningStatus = "creato" | "inviato" | "confermato" | "completato" | "escalation" | "annullato";

export const CLEANING_STATUS_LABEL: Record<CleaningStatus, string> = {
  creato: "Creato",
  inviato: "Inviato",
  confermato: "Confermato",
  completato: "Completato",
  escalation: "Escalation",
  annullato: "Annullato",
};

export interface PlanApartment {
  checkinTime: string; // "15:00"
  checkoutTime: string; // "10:00"
  defaultLinenSets: number;
}

export interface PlanReservation {
  id: string;
  checkin: IsoDate;
  checkout: IsoDate;
  guests: number | null;
  status: ReservationStatus;
}

/** Ciò che viene comunicato all'addetta: se cambia, parte un messaggio MODIFICA. */
export interface JobSnapshot {
  date: IsoDate;
  windowStart: string;
  windowEnd: string | null;
  sameDay: boolean;
  guestsOut: number | null;
  guestsIn: number | null;
  linenSets: number;
  nextCheckin: IsoDate | null;
}

export interface JobSpec extends JobSnapshot {
  reservationId: string;
  nextReservationId: string | null;
}

const ACTIVE: ReservationStatus[] = ["confermata", "da_verificare", "conclusa"];

/**
 * Un intervento per ogni prenotazione, il giorno del check-out.
 * "Cambio in giornata" quando il prossimo ospite arriva lo stesso giorno:
 * la finestra va dall'orario di check-out a quello di check-in.
 * I set di biancheria seguono gli ospiti in arrivo (se non noti, il valore standard).
 */
export function deriveCleaningPlan(apartment: PlanApartment, reservations: PlanReservation[]): JobSpec[] {
  const active = reservations
    .filter((r) => ACTIVE.includes(r.status))
    .sort((a, b) => a.checkin.localeCompare(b.checkin) || a.checkout.localeCompare(b.checkout));

  return active.map((r) => {
    const next =
      active
        .filter((s) => s.id !== r.id && s.checkin >= r.checkout)
        .sort((a, b) => a.checkin.localeCompare(b.checkin))[0] ?? null;
    const sameDay = next !== null && next.checkin === r.checkout;
    const guestsIn = next?.guests ?? null;
    return {
      reservationId: r.id,
      nextReservationId: next?.id ?? null,
      date: r.checkout,
      windowStart: apartment.checkoutTime,
      windowEnd: sameDay ? apartment.checkinTime : null,
      sameDay,
      guestsOut: r.guests,
      guestsIn,
      linenSets: guestsIn ?? apartment.defaultLinenSets,
      nextCheckin: next?.checkin ?? null,
    };
  });
}

export function toSnapshot(spec: JobSnapshot): JobSnapshot {
  return {
    date: spec.date,
    windowStart: spec.windowStart,
    windowEnd: spec.windowEnd,
    sameDay: spec.sameDay,
    guestsOut: spec.guestsOut,
    guestsIn: spec.guestsIn,
    linenSets: spec.linenSets,
    nextCheckin: spec.nextCheckin,
  };
}

export function windowLabel(s: Pick<JobSnapshot, "windowStart" | "windowEnd">): string {
  return s.windowEnd ? `${s.windowStart}–${s.windowEnd}` : `dalle ${s.windowStart}`;
}

export function guestsLabel(n: number | null): string {
  return n === null ? "da confermare" : String(n);
}

export interface SnapshotChange {
  field: keyof JobSnapshot;
  label: string;
  before: string;
  after: string;
}

/** Differenze leggibili tra ciò che l'addetta sa e la situazione attuale. */
export function diffSnapshot(before: JobSnapshot, after: JobSnapshot): SnapshotChange[] {
  const changes: SnapshotChange[] = [];
  const push = (field: keyof JobSnapshot, label: string, b: string, a: string) => {
    if (b !== a) changes.push({ field, label, before: b, after: a });
  };
  push("date", "Data", formatShort(before.date), formatShort(after.date));
  push("windowStart", "Orario", windowLabel(before), windowLabel(after));
  push("sameDay", "Cambio in giornata", before.sameDay ? "sì" : "no", after.sameDay ? "sì" : "no");
  push("guestsOut", "Ospiti in uscita", guestsLabel(before.guestsOut), guestsLabel(after.guestsOut));
  push("guestsIn", "Ospiti in entrata", guestsLabel(before.guestsIn), guestsLabel(after.guestsIn));
  push("linenSets", "Set biancheria", String(before.linenSets), String(after.linenSets));
  push(
    "nextCheckin",
    "Prossimo arrivo",
    before.nextCheckin ? formatShort(before.nextCheckin) : "nessuno",
    after.nextCheckin ? formatShort(after.nextCheckin) : "nessuno",
  );
  return changes;
}
