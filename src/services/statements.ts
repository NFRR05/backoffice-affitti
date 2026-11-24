import fs from "node:fs/promises";
import path from "node:path";
import { and, asc, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { DATA_DIR, type DB } from "@/db/client";
import {
  apartmentOwners,
  apartments,
  cleaningJobs,
  contracts,
  expenses,
  owners,
  reservations,
  statements,
} from "@/db/schema";
import { computeStatement, contractParamsSchema, type StatementResult } from "@/domain/statement";
import { addDays, formatDate, formatPeriod, periodBounds, type Period } from "@/lib/dates";
import { formatEuro } from "@/lib/money";
import { logActivity, requireTenant } from "@/services/common";
import { sendEmail } from "@/services/email";
import { renderStatementPdf } from "@/services/pdf";

export type Statement = typeof statements.$inferSelect;

const CHANNEL_LABEL: Record<string, string> = { airbnb: "Airbnb", booking: "Booking", altro: "Diretta" };

/** Raccoglie i dati del mese e calcola il rendiconto (senza salvarlo). */
export async function buildStatement(db: DB, apartmentId: string, period: Period) {
  const { first, last } = periodBounds(period);

  const [contract] = await db
    .select()
    .from(contracts)
    .where(and(eq(contracts.apartmentId, apartmentId), lte(contracts.validFrom, last)))
    .orderBy(desc(contracts.validFrom))
    .limit(1);
  if (!contract) throw new Error("Nessun contratto valido per questo appartamento nel periodo scelto.");
  const params = contractParamsSchema.parse(contract.params);

  const res = await db
    .select()
    .from(reservations)
    .where(
      and(
        eq(reservations.apartmentId, apartmentId),
        inArray(reservations.status, ["confermata", "conclusa", "da_verificare"]),
        lte(reservations.checkin, addDays(last, 1)),
        gte(reservations.checkout, first),
      ),
    )
    .orderBy(asc(reservations.checkin));

  const jobs = await db
    .select()
    .from(cleaningJobs)
    .where(
      and(
        eq(cleaningJobs.apartmentId, apartmentId),
        eq(cleaningJobs.status, "completato"),
        gte(cleaningJobs.date, first),
        lte(cleaningJobs.date, last),
      ),
    )
    .orderBy(asc(cleaningJobs.date));

  const exp = await db
    .select()
    .from(expenses)
    .where(and(eq(expenses.apartmentId, apartmentId), gte(expenses.date, first), lte(expenses.date, last)))
    .orderBy(asc(expenses.date));

  const ownerRows = await db
    .select({ id: owners.id, name: owners.name, email: owners.email, shareBps: apartmentOwners.shareBps })
    .from(apartmentOwners)
    .innerJoin(owners, eq(owners.id, apartmentOwners.ownerId))
    .where(eq(apartmentOwners.apartmentId, apartmentId));

  const result = computeStatement({
    period,
    contract: params,
    reservations: res.map((r) => ({
      id: r.id,
      label: `${CHANNEL_LABEL[r.channel] ?? r.channel} ${r.externalCode ?? `#${r.ref}`} · ${formatDate(r.checkin).slice(0, 5)}–${formatDate(r.checkout).slice(0, 5)}`,
      channel: r.channel,
      checkin: r.checkin,
      checkout: r.checkout,
      grossCents: r.grossCents,
      otaCommissionCents: r.otaCommissionCents,
      guestCleaningFeeCents: r.guestCleaningFeeCents,
      touristTaxCents: r.touristTaxCents,
    })),
    cleanings: jobs
      .filter((j) => j.costCents !== null)
      .map((j) => ({ id: j.id, date: j.date, costCents: j.costCents as number })),
    expenses: exp.map((e) => ({ id: e.id, date: e.date, description: e.description, amountCents: e.amountCents })),
    owners: ownerRows.map((o) => ({ id: o.id, name: o.name, shareBps: o.shareBps })),
  });

  const missingCost = jobs.filter((j) => j.costCents === null).length;
  if (missingCost > 0) {
    result.warnings.unshift(`${missingCost} pulizie completate senza costo (manca il listino): escluse dal calcolo.`);
  }
  return { result, params, ownerRows };
}

async function latestFor(db: DB, apartmentId: string, period: Period): Promise<Statement | null> {
  const [row] = await db
    .select()
    .from(statements)
    .where(and(eq(statements.apartmentId, apartmentId), eq(statements.period, period)))
    .orderBy(desc(statements.version))
    .limit(1);
  return row ?? null;
}

/** Crea o ricalcola la bozza del mese. Un rendiconto verificato o inviato non viene toccato. */
export async function createOrRefreshDraft(db: DB, apartmentId: string, period: Period): Promise<Statement> {
  const tenant = await requireTenant(db);
  const latest = await latestFor(db, apartmentId, period);
  if (latest && latest.status !== "bozza") {
    throw new Error(
      latest.status === "inviato"
        ? "Il rendiconto di questo mese è già stato inviato: per correggerlo crea una rettifica."
        : "Il rendiconto è verificato: riportalo in bozza per ricalcolarlo.",
    );
  }
  const { result, params } = await buildStatement(db, apartmentId, period);
  if (latest) {
    const [row] = await db
      .update(statements)
      .set({ result, contractParams: params, updatedAt: new Date() })
      .where(eq(statements.id, latest.id))
      .returning();
    return row;
  }
  const [row] = await db
    .insert(statements)
    .values({ tenantId: tenant.id, apartmentId, period, version: 1, status: "bozza", result, contractParams: params })
    .returning();
  await logActivity(db, tenant.id, "gestore", "rendiconto_bozza", "statement", row.id, { period });
  return row;
}

/** Ricalcola un'ultima volta e congela dati e risultato. */
export async function verifyStatement(db: DB, statementId: string): Promise<void> {
  const tenant = await requireTenant(db);
  const [st] = await db.select().from(statements).where(eq(statements.id, statementId));
  if (!st || st.status !== "bozza") throw new Error("Si può verificare solo una bozza.");
  const { result, params } = await buildStatement(db, st.apartmentId, st.period);
  await db
    .update(statements)
    .set({ result, contractParams: params, status: "verificato", verifiedAt: new Date(), updatedAt: new Date() })
    .where(eq(statements.id, st.id));
  await logActivity(db, tenant.id, "gestore", "rendiconto_verificato", "statement", st.id);
}

export async function reopenStatement(db: DB, statementId: string): Promise<void> {
  const [st] = await db.select().from(statements).where(eq(statements.id, statementId));
  if (!st || st.status !== "verificato") throw new Error("Si può riaprire solo un rendiconto verificato e non inviato.");
  await db.update(statements).set({ status: "bozza", verifiedAt: null, updatedAt: new Date() }).where(eq(statements.id, st.id));
}

export function pdfFileName(apartmentCode: string, period: Period, version: number): string {
  return `rendiconto-${apartmentCode}-${period}${version > 1 ? `-v${version}` : ""}.pdf`;
}

/** Genera il PDF, lo invia ai proprietari, archivia e blocca il rendiconto. */
export async function sendStatement(db: DB, statementId: string): Promise<{ simulated: boolean; to: string[] }> {
  const tenant = await requireTenant(db);
  const [st] = await db.select().from(statements).where(eq(statements.id, statementId));
  if (!st || st.status !== "verificato") throw new Error("Prima di inviare il rendiconto va verificato.");
  const [apt] = await db.select().from(apartments).where(eq(apartments.id, st.apartmentId));
  const ownerRows = await db
    .select({ name: owners.name, email: owners.email })
    .from(apartmentOwners)
    .innerJoin(owners, eq(owners.id, apartmentOwners.ownerId))
    .where(eq(apartmentOwners.apartmentId, st.apartmentId));
  if (ownerRows.length === 0) throw new Error("L'appartamento non ha proprietari con email.");

  let correctionOf: Statement | null = null;
  if (st.correctsId) {
    [correctionOf] = await db.select().from(statements).where(eq(statements.id, st.correctsId));
  }

  const pdf = await renderStatementPdf({
    tenant,
    apartment: apt,
    ownerNames: ownerRows.map((o) => o.name),
    statement: st,
    correctionOf,
  });
  const dir = path.join(DATA_DIR, "rendiconti", apt.code);
  await fs.mkdir(dir, { recursive: true });
  const fileName = pdfFileName(apt.code, st.period, st.version);
  const pdfPath = path.join(dir, fileName);
  await fs.writeFile(pdfPath, pdf);

  const to = ownerRows.map((o) => o.email);
  const total = formatEuro((st.result as StatementResult).totals.ownerPayoutCents);
  const subject = `${st.correctsId ? "Rettifica rendiconto" : "Rendiconto"} ${formatPeriod(st.period)} — ${apt.name}`;
  const text = [
    `Gentile ${ownerRows.map((o) => o.name).join(", ")},`,
    "",
    `in allegato il rendiconto di ${formatPeriod(st.period)} per ${apt.name}.`,
    `Importo spettante: ${total}.`,
    st.correctsId && st.correctionNote ? `\nQuesta è una rettifica del rendiconto inviato in precedenza: ${st.correctionNote}` : "",
    "",
    "Per qualsiasi domanda può rispondere direttamente a questa email.",
    "",
    tenant.managerName,
    tenant.name,
  ].join("\n");
  const mail = await sendEmail({ to, subject, text, attachments: [{ filename: fileName, content: pdf }] });

  await db
    .update(statements)
    .set({ status: "inviato", pdfPath: path.relative(process.cwd(), pdfPath), sentAt: new Date(), sentTo: to.join(", "), updatedAt: new Date() })
    .where(eq(statements.id, st.id));
  await logActivity(db, tenant.id, "gestore", "rendiconto_inviato", "statement", st.id, { to, simulated: mail.simulated });
  return { simulated: mail.simulated, to };
}

/** Rettifica di un rendiconto già inviato: nuova versione collegata, l'originale resta in archivio. */
export async function createCorrection(db: DB, statementId: string, note: string): Promise<Statement> {
  const tenant = await requireTenant(db);
  const [st] = await db.select().from(statements).where(eq(statements.id, statementId));
  if (!st || st.status !== "inviato") throw new Error("Si può rettificare solo un rendiconto inviato.");
  const latest = await latestFor(db, st.apartmentId, st.period);
  if (latest && latest.id !== st.id) throw new Error("Esiste già una versione più recente di questo rendiconto.");
  const { result, params } = await buildStatement(db, st.apartmentId, st.period);
  const [row] = await db
    .insert(statements)
    .values({
      tenantId: tenant.id,
      apartmentId: st.apartmentId,
      period: st.period,
      version: st.version + 1,
      status: "bozza",
      correctsId: st.id,
      correctionNote: note,
      result,
      contractParams: params,
    })
    .returning();
  await logActivity(db, tenant.id, "gestore", "rendiconto_rettifica", "statement", row.id, { corrects: st.id, note });
  return row;
}
