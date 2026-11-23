import { and, desc, eq, gte, lte } from "drizzle-orm";
import type { DB } from "@/db/client";
import { apartments, cleaners, cleaningJobs, priceLists, reservations } from "@/db/schema";
import { deriveCleaningPlan, diffSnapshot, toSnapshot, type JobSnapshot, type SnapshotChange } from "@/domain/cleaning";
import { computeCleaningCost } from "@/domain/cost";
import { cancelMessage, changeMessage, managerAlertMessage, newCleaningMessage } from "@/domain/messages";
import { addDays, formatShort, todayRome } from "@/lib/dates";
import { logActivity, principalCleanerId, settingsOf, type Tenant } from "@/services/common";
import { sendWhatsApp } from "@/services/whatsapp";

type Job = typeof cleaningJobs.$inferSelect;
type Apartment = typeof apartments.$inferSelect;

const COMMUNICATED: Job["status"][] = ["inviato", "confermato"];

function snapshotOf(job: Job): JobSnapshot {
  return toSnapshot({
    date: job.date,
    windowStart: job.windowStart,
    windowEnd: job.windowEnd,
    sameDay: job.sameDay,
    guestsOut: job.guestsOut,
    guestsIn: job.guestsIn,
    linenSets: job.linenSets,
    nextCheckin: job.nextCheckin,
  });
}

async function cleanerOf(db: DB, cleanerId: string | null) {
  if (!cleanerId) return null;
  const [c] = await db.select().from(cleaners).where(eq(cleaners.id, cleanerId));
  return c ?? null;
}

/**
 * Allinea gli interventi di un appartamento alle prenotazioni attuali.
 * Crea i nuovi interventi, aggiorna quelli esistenti e, se l'addetta aveva già
 * ricevuto i dati, le invia un messaggio MODIFICA con prima e dopo.
 */
export async function reconcileApartment(db: DB, tenant: Tenant, apartmentId: string, now: Date): Promise<void> {
  const today = todayRome(now);
  const [apt] = await db.select().from(apartments).where(eq(apartments.id, apartmentId));
  if (!apt) return;

  const res = await db
    .select()
    .from(reservations)
    .where(and(eq(reservations.apartmentId, apartmentId), gte(reservations.checkout, addDays(today, -60))));
  const plan = deriveCleaningPlan(apt, res);
  const jobs = await db
    .select()
    .from(cleaningJobs)
    .where(and(eq(cleaningJobs.apartmentId, apartmentId), gte(cleaningJobs.date, addDays(today, -60))));
  const jobByReservation = new Map(jobs.map((j) => [j.reservationId, j]));
  const planned = new Set(plan.map((p) => p.reservationId));

  for (const spec of plan) {
    if (spec.date < today) continue;
    const job = jobByReservation.get(spec.reservationId);
    const fields = {
      nextReservationId: spec.nextReservationId,
      date: spec.date,
      windowStart: spec.windowStart,
      windowEnd: spec.windowEnd,
      sameDay: spec.sameDay,
      guestsOut: spec.guestsOut,
      guestsIn: spec.guestsIn,
      linenSets: spec.linenSets,
      nextCheckin: spec.nextCheckin,
      updatedAt: now,
    };

    if (!job) {
      await db.insert(cleaningJobs).values({
        tenantId: tenant.id,
        apartmentId,
        reservationId: spec.reservationId,
        ...fields,
        cleanerId: await principalCleanerId(db, apartmentId),
        status: "creato",
      });
      continue;
    }
    if (job.status === "completato") continue;

    if (job.status === "annullato") {
      await db
        .update(cleaningJobs)
        .set({
          ...fields,
          status: "creato",
          lastSnapshot: null,
          sentAt: null,
          confirmedAt: null,
          reminderSentAt: null,
          escalatedAt: null,
        })
        .where(eq(cleaningJobs.id, job.id));
      continue;
    }

    const changes =
      job.lastSnapshot && COMMUNICATED.includes(job.status) ? diffSnapshot(job.lastSnapshot, toSnapshot(spec)) : [];
    await db.update(cleaningJobs).set(fields).where(eq(cleaningJobs.id, job.id));
    if (changes.length > 0) {
      await notifyChange(db, tenant, { ...job, ...fields }, apt, changes, now);
    }
  }

  for (const job of jobs) {
    if (planned.has(job.reservationId)) continue;
    if (job.status === "annullato" || job.status === "completato" || job.date < today) continue;
    await cancelJob(db, tenant, job, apt, now);
  }
}

async function notifyChange(db: DB, tenant: Tenant, job: Job, apt: Apartment, changes: SnapshotChange[], now: Date) {
  const cleaner = await cleanerOf(db, job.cleanerId);
  if (!cleaner) return;
  await sendWhatsApp(db, {
    tenantId: tenant.id,
    phone: cleaner.whatsapp,
    contactName: cleaner.name,
    message: changeMessage(job.id, apt.name, changes),
    cleaningJobId: job.id,
  });
  await db
    .update(cleaningJobs)
    .set({
      status: "inviato",
      sentAt: now,
      confirmedAt: null,
      reminderSentAt: null,
      escalatedAt: null,
      lastSnapshot: snapshotOf(job),
      updatedAt: now,
    })
    .where(eq(cleaningJobs.id, job.id));
  await logActivity(db, tenant.id, "sistema", "modifica_inviata", "cleaning_job", job.id, { changes });
}

async function cancelJob(db: DB, tenant: Tenant, job: Job, apt: Apartment, now: Date) {
  if (job.lastSnapshot && ["inviato", "confermato", "escalation"].includes(job.status)) {
    const cleaner = await cleanerOf(db, job.cleanerId);
    if (cleaner) {
      await sendWhatsApp(db, {
        tenantId: tenant.id,
        phone: cleaner.whatsapp,
        contactName: cleaner.name,
        message: cancelMessage(apt.name, job.date),
        cleaningJobId: job.id,
      });
    }
  }
  await db.update(cleaningJobs).set({ status: "annullato", updatedAt: now }).where(eq(cleaningJobs.id, job.id));
  await logActivity(db, tenant.id, "sistema", "pulizia_annullata", "cleaning_job", job.id);
}

/** Invia all'addetta assegnata il messaggio "Nuova pulizia". */
export async function sendNewJob(db: DB, tenant: Tenant, jobId: string, now: Date): Promise<boolean> {
  const [job] = await db.select().from(cleaningJobs).where(eq(cleaningJobs.id, jobId));
  if (!job) return false;
  const [apt] = await db.select().from(apartments).where(eq(apartments.id, job.apartmentId));
  const cleaner = await cleanerOf(db, job.cleanerId);
  if (!apt || !cleaner) return false;
  const snapshot = snapshotOf(job);
  await sendWhatsApp(db, {
    tenantId: tenant.id,
    phone: cleaner.whatsapp,
    contactName: cleaner.name,
    message: newCleaningMessage(job.id, apt.name, snapshot, apt.notesForCleaners),
    cleaningJobId: job.id,
  });
  await db
    .update(cleaningJobs)
    .set({
      status: "inviato",
      sentAt: now,
      confirmedAt: null,
      reminderSentAt: null,
      escalatedAt: null,
      lastSnapshot: snapshot,
      updatedAt: now,
    })
    .where(eq(cleaningJobs.id, job.id));
  return true;
}

export async function alertManager(db: DB, tenant: Tenant, apartmentName: string, text: string, jobId?: string) {
  await sendWhatsApp(db, {
    tenantId: tenant.id,
    phone: tenant.managerWhatsapp,
    contactName: tenant.managerName,
    message: managerAlertMessage(apartmentName, text),
    cleaningJobId: jobId ?? null,
  });
}

export type JobAction = "confirm" | "decline" | "done";

/** Applica la risposta dell'addetta (pulsante o testo) o un'azione dal pannello. */
export async function applyJobAction(
  db: DB,
  tenant: Tenant,
  jobId: string,
  action: JobAction,
  actor: string,
  now: Date,
): Promise<{ ok: boolean; message: string }> {
  const [job] = await db.select().from(cleaningJobs).where(eq(cleaningJobs.id, jobId));
  if (!job) return { ok: false, message: "Intervento non trovato." };
  const [apt] = await db.select().from(apartments).where(eq(apartments.id, job.apartmentId));
  const aptName = apt?.name ?? "Appartamento";

  if (action === "confirm") {
    if (!["inviato", "escalation"].includes(job.status)) return { ok: false, message: `Stato attuale: ${job.status}.` };
    await db
      .update(cleaningJobs)
      .set({ status: "confermato", confirmedAt: now, updatedAt: now })
      .where(eq(cleaningJobs.id, job.id));
    await logActivity(db, tenant.id, actor, "pulizia_confermata", "cleaning_job", job.id);
    return { ok: true, message: "Pulizia confermata." };
  }

  if (action === "decline") {
    if (!["inviato", "confermato", "escalation"].includes(job.status)) {
      return { ok: false, message: `Stato attuale: ${job.status}.` };
    }
    await db
      .update(cleaningJobs)
      .set({ status: "escalation", escalatedAt: now, confirmedAt: null, updatedAt: now })
      .where(eq(cleaningJobs.id, job.id));
    const cleaner = await cleanerOf(db, job.cleanerId);
    await alertManager(
      db,
      tenant,
      aptName,
      `${cleaner?.name ?? "L'addetta"} ha risposto Non posso per la pulizia di ${formatShort(job.date)}. Assegna un'altra persona dal pannello.`,
      job.id,
    );
    await logActivity(db, tenant.id, actor, "pulizia_rifiutata", "cleaning_job", job.id);
    return { ok: true, message: "Segnalato al gestore." };
  }

  if (job.status === "completato") return { ok: false, message: "Già completata." };
  if (job.status === "annullato") return { ok: false, message: "Pulizia annullata." };
  await db
    .update(cleaningJobs)
    .set({ status: "completato", completedAt: now, updatedAt: now })
    .where(eq(cleaningJobs.id, job.id));
  const cost = await freezeCost(db, tenant, job.id);
  await logActivity(db, tenant.id, actor, "pulizia_completata", "cleaning_job", job.id, { cost });
  return { ok: true, message: cost === null ? "Completata, ma manca il listino: costo da inserire." : "Completata." };
}

/** Calcola e fissa il costo dell'intervento dal listino valido in quella data. */
export async function freezeCost(db: DB, tenant: Tenant, jobId: string): Promise<number | null> {
  const [job] = await db.select().from(cleaningJobs).where(eq(cleaningJobs.id, jobId));
  if (!job?.cleanerId) return null;
  const [pl] = await db
    .select()
    .from(priceLists)
    .where(
      and(
        eq(priceLists.cleanerId, job.cleanerId),
        eq(priceLists.apartmentId, job.apartmentId),
        lte(priceLists.validFrom, job.date),
      ),
    )
    .orderBy(desc(priceLists.validFrom))
    .limit(1);
  if (!pl) {
    await db.update(cleaningJobs).set({ costCents: null, costBreakdown: null }).where(eq(cleaningJobs.id, job.id));
    return null;
  }
  const result = computeCleaningCost(
    pl,
    {
      date: job.date,
      guestsOut: job.guestsOut,
      guestsIn: job.guestsIn,
      linenSets: job.linenSets,
      extraCents: job.extraCents,
      extraNote: job.extraNote,
    },
    settingsOf(tenant).extraHolidays,
  );
  await db
    .update(cleaningJobs)
    .set({ costCents: result.totalCents, costBreakdown: result })
    .where(eq(cleaningJobs.id, job.id));
  return result.totalCents;
}

/** Passa l'intervento a un'altra addetta: avvisa la precedente e invia subito alla nuova. */
export async function reassignJob(db: DB, tenant: Tenant, jobId: string, cleanerId: string, now: Date) {
  const [job] = await db.select().from(cleaningJobs).where(eq(cleaningJobs.id, jobId));
  if (!job) return;
  const [apt] = await db.select().from(apartments).where(eq(apartments.id, job.apartmentId));
  if (job.cleanerId && job.cleanerId !== cleanerId && job.lastSnapshot && apt) {
    const previous = await cleanerOf(db, job.cleanerId);
    if (previous && ["inviato", "confermato", "escalation"].includes(job.status)) {
      await sendWhatsApp(db, {
        tenantId: tenant.id,
        phone: previous.whatsapp,
        contactName: previous.name,
        message: cancelMessage(apt.name, job.date),
        cleaningJobId: job.id,
      });
    }
  }
  await db
    .update(cleaningJobs)
    .set({ cleanerId, status: "creato", lastSnapshot: null, updatedAt: now })
    .where(eq(cleaningJobs.id, job.id));
  await sendNewJob(db, tenant, job.id, now);
  await logActivity(db, tenant.id, "gestore", "pulizia_riassegnata", "cleaning_job", job.id, { cleanerId });
}

export async function setJobExtra(db: DB, tenant: Tenant, jobId: string, extraCents: number, note: string | null) {
  await db.update(cleaningJobs).set({ extraCents, extraNote: note }).where(eq(cleaningJobs.id, jobId));
  const [job] = await db.select().from(cleaningJobs).where(eq(cleaningJobs.id, jobId));
  if (job?.status === "completato") await freezeCost(db, tenant, jobId);
}
