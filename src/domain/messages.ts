import { diffDays, formatShort, type IsoDate } from "@/lib/dates";
import { windowLabel, type JobSnapshot, type SnapshotChange } from "@/domain/cleaning";

export type MessageKind =
  | "nuova"
  | "modifica"
  | "annullata"
  | "promemoria"
  | "richiesta_ospiti"
  | "avviso_gestore"
  | "risposta";

export interface MessageButton {
  /** Payload restituito da WhatsApp quando la persona tocca il pulsante. */
  id: string;
  label: string;
}

/**
 * Un messaggio ha due forme: il testo leggibile (usato in simulazione e nell'archivio)
 * e il modello approvato da Meta con i suoi parametri (usato con l'API reale).
 * I parametri dei modelli non possono contenere a capo.
 */
export interface OutgoingMessage {
  kind: MessageKind;
  text: string;
  template: { name: string; params: string[] };
  buttons: MessageButton[];
}

export const TEMPLATE_NAMES = {
  nuova: "pulizia_nuova",
  modifica: "pulizia_modifica",
  annullata: "pulizia_annullata",
  promemoria: "pulizia_promemoria",
  richiesta_ospiti: "gestore_richiesta_ospiti",
  avviso_gestore: "gestore_avviso",
} as const;

export function jobButtons(jobId: string, kind: "conferma" | "fatto"): MessageButton[] {
  if (kind === "fatto") return [{ id: `job:${jobId}:done`, label: "Fatto" }];
  return [
    { id: `job:${jobId}:confirm`, label: "Confermo" },
    { id: `job:${jobId}:decline`, label: "Non posso" },
  ];
}

export function parseButtonPayload(payload: string): { jobId: string; action: "confirm" | "decline" | "done" } | null {
  const m = payload.match(/^job:([\w-]+):(confirm|decline|done)$/);
  return m ? { jobId: m[1], action: m[2] as "confirm" | "decline" | "done" } : null;
}

function guestsPart(n: number | null, plural: string, singular: string): string {
  if (n === null) return `${plural}: ospiti da confermare`;
  return n === 1 ? `${singular} 1 ospite` : `${plural} ${n} ospiti`;
}

function guestsLine(s: JobSnapshot): string {
  return `${guestsPart(s.guestsOut, "Escono", "Esce")} · ${guestsPart(s.guestsIn, "entrano", "entra")} · ${s.linenSets} set biancheria`;
}

function dateLine(s: JobSnapshot): string {
  return `${formatShort(s.date)}, ${windowLabel(s)}${s.sameDay ? " — CAMBIO IN GIORNATA" : ""}`;
}

function nextArrivalLine(s: JobSnapshot): string | null {
  if (s.sameDay) return null;
  return s.nextCheckin ? `Prossimo arrivo: ${formatShort(s.nextCheckin)}` : "Nessun arrivo successivo per ora";
}

export function newCleaningMessage(jobId: string, apartment: string, s: JobSnapshot, notes: string | null): OutgoingMessage {
  const lines = [`Nuova pulizia — ${apartment}`, dateLine(s), guestsLine(s)];
  const next = nextArrivalLine(s);
  if (next) lines.push(next);
  if (notes) lines.push(`Note: ${notes}`);
  return {
    kind: "nuova",
    text: lines.join("\n"),
    template: {
      name: TEMPLATE_NAMES.nuova,
      params: [apartment, dateLine(s), guestsLine(s), [next, notes ? `Note: ${notes}` : null].filter(Boolean).join(" · ") || "-"],
    },
    buttons: jobButtons(jobId, "conferma"),
  };
}

export function changeMessage(jobId: string, apartment: string, changes: SnapshotChange[]): OutgoingMessage {
  const changeLines = changes.map((c) => `${c.label}: ${c.before} → ${c.after}`);
  return {
    kind: "modifica",
    text: [`MODIFICA — ${apartment}`, ...changeLines, "Ti chiediamo di riconfermare."].join("\n"),
    template: { name: TEMPLATE_NAMES.modifica, params: [apartment, changeLines.join(" · ")] },
    buttons: jobButtons(jobId, "conferma"),
  };
}

export function cancelMessage(apartment: string, date: IsoDate): OutgoingMessage {
  return {
    kind: "annullata",
    text: `ANNULLATA — ${apartment}\nLa pulizia di ${formatShort(date)} non è più necessaria.`,
    template: { name: TEMPLATE_NAMES.annullata, params: [apartment, formatShort(date)] },
    buttons: [],
  };
}

export function reminderMessage(jobId: string, apartment: string, s: JobSnapshot): OutgoingMessage {
  return {
    kind: "promemoria",
    text: [
      `Promemoria — ${apartment}`,
      `Domani ${dateLine(s)}`,
      guestsLine(s),
      "Quando hai finito tocca Fatto (puoi allegare le foto).",
    ].join("\n"),
    template: { name: TEMPLATE_NAMES.promemoria, params: [apartment, dateLine(s), guestsLine(s)] },
    buttons: jobButtons(jobId, "fatto"),
  };
}

export function guestsQuestionMessage(
  apartment: string,
  channel: string,
  checkin: IsoDate,
  checkout: IsoDate,
  ref: string,
): OutgoingMessage {
  const nights = diffDays(checkin, checkout);
  const dates = `${formatShort(checkin)} → ${formatShort(checkout)} (${nights} ${nights === 1 ? "notte" : "notti"})`;
  return {
    kind: "richiesta_ospiti",
    text: [
      `Nuova prenotazione ${channel} — ${apartment}`,
      dates,
      `Quanti ospiti? Rispondi con il numero, ad esempio "${ref} 3".`,
    ].join("\n"),
    template: { name: TEMPLATE_NAMES.richiesta_ospiti, params: [apartment, channel, dates, ref] },
    buttons: [],
  };
}

export function managerAlertMessage(apartment: string, text: string): OutgoingMessage {
  return {
    kind: "avviso_gestore",
    text: `Attenzione — ${apartment}\n${text}`,
    template: { name: TEMPLATE_NAMES.avviso_gestore, params: [apartment, text] },
    buttons: [],
  };
}

/** Risposta del gestore alla domanda sugli ospiti: "3" oppure "4821 3". */
export function parseGuestsReply(text: string): { ref: string | null; guests: number } | null {
  const m = text.trim().match(/^#?(\d{4})?\s*[:\-]?\s*(\d{1,2})$/);
  if (!m) return null;
  const guests = Number(m[2]);
  if (guests < 1 || guests > 30) return null;
  return { ref: m[1] ?? null, guests };
}

/** Risposte scritte a mano dalle addette, in alternativa ai pulsanti. */
export function parseCleanerText(text: string): "confirm" | "decline" | "done" | null {
  const t = text.trim().toLowerCase();
  if (/^(non posso|no|impossibile|non riesco)\b/.test(t)) return "decline";
  if (/^(fatto|finito|completat[oa]|terminat[oa])\b/.test(t)) return "done";
  if (/^(confermo|ok|okay|va bene|si|sì|certo)\b/.test(t)) return "confirm";
  return null;
}
