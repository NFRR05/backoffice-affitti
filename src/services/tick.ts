import { and, eq, gte, inArray, isNull, lte } from "drizzle-orm";
import type { DB } from "@/db/client";
import { apartments, cleaners, cleaningJobs, reservations } from "@/db/schema";
import { toSnapshot } from "@/domain/cleaning";
import { guestsQuestionMessage, reminderMessage } from "@/domain/messages";
import { addDays, formatShort, hoursBetween, romeParts, timeGte, todayRome } from "@/lib/dates";
import { alertManager, reconcileApartment, sendNewJob } from "@/services/cleaning";
import { requireTenant, settingsOf } from "@/services/common";
import { syncAll, type FeedResult } from "@/services/sync";
import { sendWhatsApp } from "@/services/whatsapp";

export interface TickSummary {
  at: string;
  feeds: FeedResult[];
  guestQuestions: number;
  jobsSent: number;
  escalations: number;
  reminders: number;
}

const CHANNEL_LABEL: Record<string, string> = { airbnb: "Airbnb", booking: "Booking", altro: "diretta" };

/**
 * L'attività pianificata. Va chiamata ogni 5–10 minuti (in locale: "npm run worker";
 * su Vercel: cron su /api/cron/tick). Ogni passo è idempotente: rilanciarla non duplica nulla.
 */
export async function runTick(db: DB, now: Date = new Date(), options: { forceSync?: boolean } = {}): Promise<TickSummary> {
  const tenant = await requireTenant(db);
  const settings = settingsOf(tenant);
  const today = todayRome(now);
  const summary: TickSummary = { at: now.toISOString(), feeds: [], guestQuestions: 0, jobsSent: 0, escalations: 0, reminders: 0 };

  // 1. Calendari dei portali → prenotazioni → interventi.
  summary.feeds = await syncAll(db, tenant, now, options.forceSync ?? false);

  // 2. Domanda sul numero di ospiti per le nuove prenotazioni.
  const toAsk = await db
    .select({ r: reservations, aptName: apartments.name })
    .from(reservations)
    .innerJoin(apartments, eq(apartments.id, reservations.apartmentId))
    .where(
      and(
        eq(reservations.tenantId, tenant.id),
        eq(reservations.status, "confermata"),
        isNull(reservations.guests),
        isNull(reservations.guestsAskedAt),
        gte(reservations.checkout, today),
      ),
    );
  for (const { r, aptName } of toAsk) {
    await sendWhatsApp(db, {
      tenantId: tenant.id,
      phone: tenant.managerWhatsapp,
      contactName: tenant.managerName,
      message: guestsQuestionMessage(aptName, CHANNEL_LABEL[r.channel] ?? r.channel, r.checkin, r.checkout, r.ref),
      reservationId: r.id,
    });
    await db.update(reservations).set({ guestsAskedAt: now }).where(eq(reservations.id, r.id));
    summary.guestQuestions++;
  }

  // 3. Invio delle nuove pulizie: quando gli ospiti sono noti, oppure scaduta l'attesa, oppure a ridosso della data.
  const pending = await db
    .select({ job: cleaningJobs, r: reservations })
    .from(cleaningJobs)
    .innerJoin(reservations, eq(reservations.id, cleaningJobs.reservationId))
    .where(and(eq(cleaningJobs.tenantId, tenant.id), eq(cleaningJobs.status, "creato"), gte(cleaningJobs.date, today)));
  for (const { job, r } of pending) {
    if (!job.cleanerId) continue;
    const guestsKnown = r.guests !== null || r.source === "manuale";
    const waitedEnough =
      r.guestsAskedAt !== null && hoursBetween(r.guestsAskedAt, now) >= settings.guestsQuestionTimeoutHours;
    const soon = job.date <= addDays(today, 1);
    if (guestsKnown || waitedEnough || soon) {
      if (await sendNewJob(db, tenant, job.id, now)) summary.jobsSent++;
    }
  }

  // 4. Escalation: nessuna risposta entro il tempo stabilito.
  const unanswered = await db
    .select({ job: cleaningJobs, aptName: apartments.name, cleanerName: cleaners.name })
    .from(cleaningJobs)
    .innerJoin(apartments, eq(apartments.id, cleaningJobs.apartmentId))
    .innerJoin(cleaners, eq(cleaners.id, cleaningJobs.cleanerId))
    .where(and(eq(cleaningJobs.tenantId, tenant.id), eq(cleaningJobs.status, "inviato"), gte(cleaningJobs.date, today)));
  for (const { job, aptName, cleanerName } of unanswered) {
    if (!job.sentAt || hoursBetween(job.sentAt, now) < settings.escalationHours) continue;
    await db
      .update(cleaningJobs)
      .set({ status: "escalation", escalatedAt: now, updatedAt: now })
      .where(eq(cleaningJobs.id, job.id));
    await alertManager(
      db,
      tenant,
      aptName,
      `${cleanerName} non ha risposto entro ${settings.escalationHours} ore per la pulizia di ${formatShort(job.date)}. Assegna un'altra persona dal pannello.`,
      job.id,
    );
    summary.escalations++;
  }

  // 5. Promemoria la sera prima.
  const { time } = romeParts(now);
  if (timeGte(time, settings.reminderTime)) {
    const tomorrow = addDays(today, 1);
    const toRemind = await db
      .select({ job: cleaningJobs, aptName: apartments.name, cleaner: cleaners })
      .from(cleaningJobs)
      .innerJoin(apartments, eq(apartments.id, cleaningJobs.apartmentId))
      .innerJoin(cleaners, eq(cleaners.id, cleaningJobs.cleanerId))
      .where(
        and(
          eq(cleaningJobs.tenantId, tenant.id),
          eq(cleaningJobs.status, "confermato"),
          eq(cleaningJobs.date, tomorrow),
          isNull(cleaningJobs.reminderSentAt),
        ),
      );
    for (const { job, aptName, cleaner } of toRemind) {
      await sendWhatsApp(db, {
        tenantId: tenant.id,
        phone: cleaner.whatsapp,
        contactName: cleaner.name,
        message: reminderMessage(job.id, aptName, toSnapshot(job)),
        cleaningJobId: job.id,
      });
      await db.update(cleaningJobs).set({ reminderSentAt: now }).where(eq(cleaningJobs.id, job.id));
      summary.reminders++;
    }
  }

  return summary;
}

/** Aggiorna gli ospiti di una prenotazione e riallinea le pulizie (gli effetti partono subito). */
export async function setReservationGuests(db: DB, reservationId: string, guests: number, now: Date = new Date()) {
  const tenant = await requireTenant(db);
  const [r] = await db.select().from(reservations).where(eq(reservations.id, reservationId));
  if (!r) return;
  await db.update(reservations).set({ guests, updatedAt: now }).where(eq(reservations.id, reservationId));
  await reconcileApartment(db, tenant, r.apartmentId, now);
}

/** Prenotazioni in attesa del numero di ospiti (dopo la domanda su WhatsApp). */
export async function pendingGuestQuestions(db: DB, tenantId: string) {
  return db
    .select()
    .from(reservations)
    .where(
      and(
        eq(reservations.tenantId, tenantId),
        isNull(reservations.guests),
        inArray(reservations.status, ["confermata", "da_verificare"]),
        lte(reservations.guestsAskedAt, new Date()),
      ),
    );
}
