import { and, asc, desc, eq, inArray, isNotNull, isNull, lte } from "drizzle-orm";
import type { DB } from "@/db/client";
import { cleaners, cleaningJobs, reservations, whatsappMessages } from "@/db/schema";
import { parseButtonPayload, parseCleanerText, parseGuestsReply } from "@/domain/messages";
import { addDays, todayRome } from "@/lib/dates";
import { applyJobAction } from "@/services/cleaning";
import { normalizePhone, requireTenant } from "@/services/common";
import { setReservationGuests } from "@/services/tick";
import type { IncomingWhatsApp } from "@/services/whatsapp";

/**
 * Gestisce un messaggio in arrivo (dal webhook Meta o dalla simulazione).
 * - dal gestore: risposta sul numero di ospiti ("3" o "4821 3")
 * - dalle addette: pulsanti Confermo / Non posso / Fatto, risposte scritte, foto
 */
export async function handleIncoming(db: DB, msg: IncomingWhatsApp, now: Date = new Date()): Promise<string> {
  const tenant = await requireTenant(db);
  const from = normalizePhone(msg.from);
  const BUTTON_LABEL = { confirm: "Confermo", decline: "Non posso", done: "Fatto" } as const;
  const pressed = msg.type === "button" && msg.payload ? parseButtonPayload(msg.payload) : null;
  const body =
    msg.type === "button"
      ? `[pulsante] ${pressed ? BUTTON_LABEL[pressed.action] : msg.payload}`
      : msg.type === "image"
        ? `[foto] ${msg.mediaId}`
        : (msg.text ?? "[messaggio]");

  let outcome = "Messaggio registrato.";
  let jobId: string | null = null;
  let reservationId: string | null = null;

  if (msg.type === "button" && msg.payload) {
    const parsed = parseButtonPayload(msg.payload);
    if (parsed) {
      jobId = parsed.jobId;
      outcome = (await applyJobAction(db, tenant, parsed.jobId, parsed.action, `whatsapp:${from}`, now)).message;
    }
  } else if (from === normalizePhone(tenant.managerWhatsapp) && msg.type === "text" && msg.text) {
    const reply = parseGuestsReply(msg.text);
    if (reply) {
      const waiting = await db
        .select()
        .from(reservations)
        .where(
          and(
            eq(reservations.tenantId, tenant.id),
            isNull(reservations.guests),
            isNotNull(reservations.guestsAskedAt),
            inArray(reservations.status, ["confermata", "da_verificare"]),
          ),
        )
        .orderBy(desc(reservations.guestsAskedAt));
      const target = reply.ref ? waiting.find((r) => r.ref === reply.ref) : waiting.length === 1 ? waiting[0] : null;
      if (target) {
        reservationId = target.id;
        await setReservationGuests(db, target.id, reply.guests, now);
        outcome = `Ospiti aggiornati: ${reply.guests} (prenotazione ${target.ref}).`;
      } else if (!reply.ref && waiting.length > 1) {
        outcome = `Più prenotazioni in attesa: rispondi indicando il codice, ad esempio "${waiting[0].ref} ${reply.guests}".`;
      } else {
        outcome = "Nessuna prenotazione in attesa con quel codice.";
      }
    }
  } else {
    const [cleaner] = await db.select().from(cleaners).where(eq(cleaners.whatsapp, from));
    if (cleaner) {
      const today = todayRome(now);
      if (msg.type === "text" && msg.text) {
        const action = parseCleanerText(msg.text);
        if (action) {
          const statuses: (typeof cleaningJobs.$inferSelect)["status"][] =
            action === "done" ? ["confermato", "inviato", "escalation"] : ["inviato", "escalation", "confermato"];
          const candidates = await db
            .select()
            .from(cleaningJobs)
            .where(
              and(
                eq(cleaningJobs.cleanerId, cleaner.id),
                inArray(cleaningJobs.status, statuses),
                action === "done" ? lte(cleaningJobs.date, today) : lte(cleaningJobs.date, addDays(today, 60)),
              ),
            )
            .orderBy(action === "done" ? desc(cleaningJobs.date) : asc(cleaningJobs.date));
          const job = candidates[0];
          if (job) {
            jobId = job.id;
            outcome = (await applyJobAction(db, tenant, job.id, action, `whatsapp:${from}`, now)).message;
          } else {
            outcome = "Nessuna pulizia aperta a cui collegare la risposta.";
          }
        }
      } else if (msg.type === "image" && msg.mediaId) {
        const [job] = await db
          .select()
          .from(cleaningJobs)
          .where(and(eq(cleaningJobs.cleanerId, cleaner.id), lte(cleaningJobs.date, today)))
          .orderBy(desc(cleaningJobs.date))
          .limit(1);
        if (job) {
          jobId = job.id;
          await db
            .update(cleaningJobs)
            .set({ photos: [...(job.photos ?? []), msg.mediaId] })
            .where(eq(cleaningJobs.id, job.id));
          outcome = "Foto allegata all'intervento.";
        }
      }
    }
  }

  await db.insert(whatsappMessages).values({
    tenantId: tenant.id,
    direction: "in",
    phone: from,
    contactName: msg.name ?? null,
    kind: "risposta",
    cleaningJobId: jobId,
    reservationId,
    body,
    status: "ricevuto",
    note: outcome,
  });
  return outcome;
}
