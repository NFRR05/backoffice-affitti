import fs from "node:fs/promises";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { and, eq, isNull } from "drizzle-orm";
import * as schema from "@/db/schema";
import type { DB } from "@/db/client";
import { loadDemo } from "@/services/demo";
import { requireTenant } from "@/services/common";
import { handleIncoming } from "@/services/incoming";
import { runTick } from "@/services/tick";
import { createCorrection, createOrRefreshDraft, sendStatement, verifyStatement } from "@/services/statements";
import { addDays, todayRome } from "@/lib/dates";

// Flusso completo su un database in memoria: demo, sincronizzazione, messaggi,
// risposte, modifiche e cancellazioni dal calendario, rendiconto con PDF.

const NOW = new Date("2026-11-21T18:30:00Z"); // 19:30 a Roma, dopo l'orario dei promemoria
let db: DB;

beforeAll(async () => {
  const client = new PGlite();
  db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  await loadDemo(db, NOW);
}, 60_000);

describe("Flusso completo", () => {
  it("importa prenotazioni dai calendari ignorando i blocchi Airbnb", async () => {
    const res = await db.select().from(schema.reservations);
    expect(res.length).toBeGreaterThan(40);
    const uids = res.map((r) => r.externalUid);
    expect(new Set(uids).size).toBe(uids.length);
    expect(res.filter((r) => r.channel === "airbnb").every((r) => r.externalCode?.startsWith("HM"))).toBe(true);
  });

  it("crea gli interventi, chiede gli ospiti e invia le pulizie", async () => {
    const jobs = await db.select().from(schema.cleaningJobs);
    const statuses = new Set(jobs.map((j) => j.status));
    expect(statuses).toContain("completato");
    expect(statuses).toContain("confermato");
    expect(statuses).toContain("escalation");
    expect(jobs.some((j) => j.sameDay)).toBe(true);
    const msgs = await db.select().from(schema.whatsappMessages);
    const kinds = new Set(msgs.map((m) => m.kind));
    expect(kinds).toContain("nuova");
    expect(kinds).toContain("richiesta_ospiti");
    expect(kinds).toContain("avviso_gestore");
    expect(msgs.every((m) => m.direction === "in" || m.status === "simulato")).toBe(true);
    // Le domande sugli ospiti non contengono dati personali degli ospiti.
    const cleanerMsgs = msgs.filter((m) => m.kind === "nuova");
    expect(cleanerMsgs.some((m) => /(Escono|Esce) .* ospit/.test(m.body))).toBe(true);
  });

  it("gestisce i pulsanti dell'addetta e la risposta del gestore sugli ospiti", async () => {
    const [job] = await db.select().from(schema.cleaningJobs).where(eq(schema.cleaningJobs.status, "inviato")).limit(1);
    const out = await handleIncoming(db, { from: "+39 333 000 0101", type: "button", payload: `job:${job.id}:confirm` }, NOW);
    expect(out).toBe("Pulizia confermata.");

    const waiting = await db
      .select()
      .from(schema.reservations)
      .where(and(isNull(schema.reservations.guests), eq(schema.reservations.status, "confermata")));
    expect(waiting.length).toBeGreaterThan(0);
    const target = waiting[0];
    const reply = await handleIncoming(db, { from: "393330000000", type: "text", text: `${target.ref} 3` }, NOW);
    expect(reply).toContain("Ospiti aggiornati: 3");
    const [updated] = await db.select().from(schema.reservations).where(eq(schema.reservations.id, target.id));
    expect(updated.guests).toBe(3);
  });

  it("invia MODIFICA quando le date cambiano e ANNULLATA quando la prenotazione sparisce", async () => {
    const tenant = await requireTenant(db);
    const today = todayRome(NOW);
    const [apt] = await db.select().from(schema.apartments).where(eq(schema.apartments.code, "APP2"));
    const sentJobs = (
      await db.select().from(schema.cleaningJobs).where(eq(schema.cleaningJobs.apartmentId, apt.id))
    ).filter((j) => ["inviato", "confermato"].includes(j.status) && j.date > addDays(today, 2));
    expect(sentJobs.length).toBeGreaterThanOrEqual(2);
    const [toMove, toCancel] = sentJobs;
    const resMove = (await db.select().from(schema.reservations).where(eq(schema.reservations.id, toMove.reservationId)))[0];
    const resCancel = (await db.select().from(schema.reservations).where(eq(schema.reservations.id, toCancel.reservationId)))[0];

    const feedFile = (channel: string) => path.join(process.cwd(), "data", "demo-ical", `APP2-${channel}.ics`);
    const compact = (d: string) => d.replaceAll("-", "");
    for (const channel of ["airbnb", "booking"]) {
      let text = await fs.readFile(feedFile(channel), "utf8");
      // Sposta di un giorno il check-out della prima, elimina la seconda.
      text = text.replace(
        new RegExp(`DTEND;VALUE=DATE:${compact(resMove.checkout)}\\r\\nUID:${resMove.externalUid}`),
        `DTEND;VALUE=DATE:${compact(addDays(resMove.checkout, 1))}\r\nUID:${resMove.externalUid}`,
      );
      text = text.replace(new RegExp(`BEGIN:VEVENT\\r\\n(?:(?!END:VEVENT)[\\s\\S])*UID:${resCancel.externalUid}[\\s\\S]*?END:VEVENT\\r\\n`), "");
      await fs.writeFile(feedFile(channel), text);
    }

    const later = new Date(NOW.getTime() + 20 * 60_000);
    const summary = await runTick(db, later, { forceSync: true });
    expect(summary.feeds.find((f) => f.apartmentId === apt.id && f.status === "ok")).toBeTruthy();

    const msgs = await db.select().from(schema.whatsappMessages).where(eq(schema.whatsappMessages.tenantId, tenant.id));
    const modifica = msgs.find((m) => m.kind === "modifica" && m.cleaningJobId === toMove.id);
    expect(modifica?.body).toContain("Data:");
    const annullata = msgs.find((m) => m.kind === "annullata" && m.cleaningJobId === toCancel.id);
    expect(annullata).toBeTruthy();
    const [moved] = await db.select().from(schema.cleaningJobs).where(eq(schema.cleaningJobs.id, toMove.id));
    expect(moved.status).toBe("inviato");
    expect(moved.date).toBe(addDays(resMove.checkout, 1));
  });

  it("calcola, verifica, invia e rettifica il rendiconto con PDF", async () => {
    const [apt] = await db.select().from(schema.apartments).where(eq(schema.apartments.code, "APP1"));
    const draft = await createOrRefreshDraft(db, apt.id, "2026-11");
    expect(draft.result.reservationLines.length).toBeGreaterThan(0);
    expect(draft.result.totals.cleaningCount).toBeGreaterThan(0);
    expect(draft.result.totals.expensesCents).toBe(1850);
    const t = draft.result.totals;
    expect(t.ownerPayoutCents).toBe(t.netCents - t.cleaningCostsCents - t.commissionCents - t.vatCents - t.expensesCents);

    await verifyStatement(db, draft.id);
    const sent = await sendStatement(db, draft.id);
    expect(sent.simulated).toBe(true);
    const [row] = await db.select().from(schema.statements).where(eq(schema.statements.id, draft.id));
    expect(row.status).toBe("inviato");
    const pdf = await fs.readFile(path.join(process.cwd(), row.pdfPath!));
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");

    await expect(createOrRefreshDraft(db, apt.id, "2026-11")).rejects.toThrow("rettifica");
    const correction = await createCorrection(db, draft.id, "aggiunta una spesa dimenticata");
    expect(correction.version).toBe(2);
    expect(correction.correctsId).toBe(draft.id);
  });
});
