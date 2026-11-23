import { instantToRomeDate, type IsoDate } from "@/lib/dates";

export type Channel = "airbnb" | "booking" | "altro";

export interface IcsEvent {
  uid: string;
  summary: string;
  description: string;
  start: IsoDate;
  end: IsoDate;
}

/** Prenotazione letta da un calendario iCal, pronta da confrontare con quelle salvate. */
export interface IncomingReservation {
  externalUid: string;
  externalCode: string | null;
  checkin: IsoDate;
  checkout: IsoDate;
}

/** Riunisce le righe spezzate (RFC 5545: una riga che inizia con spazio o tab continua la precedente). */
function unfold(text: string): string[] {
  const raw = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const lines: string[] = [];
  for (const line of raw) {
    if ((line.startsWith(" ") || line.startsWith("\t")) && lines.length > 0) {
      lines[lines.length - 1] += line.slice(1);
    } else if (line.trim() !== "") {
      lines.push(line);
    }
  }
  return lines;
}

function unescapeText(value: string): string {
  return value.replace(/\\n/gi, "\n").replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\\\/g, "\\");
}

/** "20240701" oppure "20240701T140000Z" / "20240701T140000" → giorno. */
function parseIcsDate(value: string): IsoDate | null {
  const m = value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/);
  if (!m) return null;
  const [, y, mo, d, hh, mi, ss, z] = m;
  if (hh && z) {
    return instantToRomeDate(new Date(Date.UTC(+y, +mo - 1, +d, +hh, +mi, +ss)));
  }
  return `${y}-${mo}-${d}`;
}

export function parseIcs(text: string): IcsEvent[] {
  const events: IcsEvent[] = [];
  let current: Partial<IcsEvent> | null = null;

  for (const line of unfold(text)) {
    const colon = line.indexOf(":");
    if (colon === -1) continue;
    const left = line.slice(0, colon);
    const value = line.slice(colon + 1);
    const name = left.split(";")[0].toUpperCase();

    if (name === "BEGIN" && value.trim().toUpperCase() === "VEVENT") {
      current = { summary: "", description: "" };
      continue;
    }
    if (name === "END" && value.trim().toUpperCase() === "VEVENT") {
      if (current?.uid && current.start && current.end) {
        events.push(current as IcsEvent);
      }
      current = null;
      continue;
    }
    if (!current) continue;

    switch (name) {
      case "UID":
        current.uid = value.trim();
        break;
      case "SUMMARY":
        current.summary = unescapeText(value).trim();
        break;
      case "DESCRIPTION":
        current.description = unescapeText(value);
        break;
      case "DTSTART":
        current.start = parseIcsDate(value.trim()) ?? undefined;
        break;
      case "DTEND":
        current.end = parseIcsDate(value.trim()) ?? undefined;
        break;
    }
  }
  return events;
}

/**
 * Distingue prenotazioni e blocchi.
 * Airbnb: "Reserved" = prenotazione; "Not available" / "Airbnb (Not available)" = blocco
 * (date chiuse a mano o importate da altri calendari).
 * Booking: ogni evento è una prenotazione ("CLOSED - Not available").
 */
export function isReservationEvent(channel: Channel, event: IcsEvent): boolean {
  if (event.end <= event.start) return false;
  if (channel === "airbnb") return /reserved/i.test(event.summary);
  return true;
}

/** Codice della prenotazione Airbnb dal link nella descrizione (es. HMABC12345). */
export function extractAirbnbCode(description: string): string | null {
  const m = description.match(/(?:details\/|code=)([A-Z0-9]{6,})/i);
  return m ? m[1].toUpperCase() : null;
}

export function toIncomingReservations(channel: Channel, events: IcsEvent[]): IncomingReservation[] {
  return events
    .filter((e) => isReservationEvent(channel, e))
    .map((e) => ({
      externalUid: e.uid,
      externalCode: channel === "airbnb" ? extractAirbnbCode(e.description) : null,
      checkin: e.start,
      checkout: e.end,
    }));
}
