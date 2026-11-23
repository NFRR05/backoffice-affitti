"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { apartments, expenses, reservations } from "@/db/schema";
import { isIsoDate, todayRome } from "@/lib/dates";
import { parseEuro } from "@/lib/money";
import { applyJobAction, reassignJob, reconcileApartment, sendNewJob, setJobExtra } from "@/services/cleaning";
import { requireTenant } from "@/services/common";
import { importConfig, readConfigFile } from "@/services/config";
import { loadDemo } from "@/services/demo";
import { handleIncoming } from "@/services/incoming";
import {
  createCorrection,
  createOrRefreshDraft,
  reopenStatement,
  sendStatement,
  verifyStatement,
} from "@/services/statements";
import { runTick, setReservationGuests } from "@/services/tick";

// Azioni dei moduli: ogni azione torna alla pagina con un messaggio (?ok=… / ?errore=…).

function str(form: FormData, key: string): string {
  const v = form.get(key);
  return typeof v === "string" ? v.trim() : "";
}

function back(form: FormData, fallback: string): string {
  const to = str(form, "back");
  return to.startsWith("/") ? to : fallback;
}

function withMessage(url: string, key: "ok" | "errore", message: string): string {
  const [base, query = ""] = url.split("?");
  const params = new URLSearchParams(query);
  params.delete("ok");
  params.delete("errore");
  params.set(key, message);
  return `${base}?${params.toString()}`;
}

/** Un'azione restituisce il messaggio da mostrare, oppure la pagina su cui andare. */
type Outcome = string | { to: string; message: string };

async function run(form: FormData, fallback: string, fn: () => Promise<Outcome>): Promise<never> {
  const target = back(form, fallback);
  let url: string;
  try {
    const outcome = await fn();
    url = typeof outcome === "string" ? withMessage(target, "ok", outcome) : withMessage(outcome.to, "ok", outcome.message);
  } catch (e) {
    url = withMessage(target, "errore", e instanceof Error ? e.message : String(e));
  }
  revalidatePath("/", "layout");
  redirect(url);
}

// --- Sistema ---

export async function syncNowAction(form: FormData) {
  return run(form, "/", async () => {
    const db = await getDb();
    const s = await runTick(db, new Date(), { forceSync: true });
    const errors = s.feeds.filter((f) => f.status === "errore").length;
    return `Calendari letti: ${s.feeds.length}${errors ? ` (${errors} con errori)` : ""}. Domande ospiti: ${s.guestQuestions}, pulizie inviate: ${s.jobsSent}, escalation: ${s.escalations}, promemoria: ${s.reminders}.`;
  });
}

export async function loadDemoAction(form: FormData) {
  return run(form, "/impostazioni", async () => {
    if (str(form, "conferma") !== "si") throw new Error("Spunta la conferma: la demo cancella tutti i dati.");
    await loadDemo(await getDb());
    return "Dati demo caricati.";
  });
}

export async function importConfigAction(form: FormData) {
  return run(form, "/impostazioni", async () => {
    const db = await getDb();
    const config = await readConfigFile();
    const r = await importConfig(db, config);
    const s = await runTick(db, new Date(), { forceSync: true });
    return `Configurazione importata: ${r.apartments} appartamenti. Calendari letti: ${s.feeds.length}.`;
  });
}

// --- Pulizie ---

export async function jobAction(form: FormData) {
  return run(form, "/pulizie", async () => {
    const db = await getDb();
    const tenant = await requireTenant(db);
    const jobId = str(form, "jobId");
    const action = str(form, "action");
    if (action === "send") {
      return (await sendNewJob(db, tenant, jobId, new Date())) ? "Messaggio inviato." : "Manca l'addetta assegnata.";
    }
    if (action === "confirm" || action === "decline" || action === "done") {
      return (await applyJobAction(db, tenant, jobId, action, "gestore", new Date())).message;
    }
    throw new Error("Azione sconosciuta.");
  });
}

export async function reassignAction(form: FormData) {
  return run(form, "/pulizie", async () => {
    const db = await getDb();
    const tenant = await requireTenant(db);
    const cleanerId = str(form, "cleanerId");
    if (!cleanerId) throw new Error("Scegli un'addetta.");
    await reassignJob(db, tenant, str(form, "jobId"), cleanerId, new Date());
    return "Pulizia riassegnata e messaggio inviato.";
  });
}

export async function jobExtraAction(form: FormData) {
  return run(form, "/pulizie", async () => {
    const db = await getDb();
    const tenant = await requireTenant(db);
    const amount = str(form, "extra") === "" ? 0 : parseEuro(str(form, "extra"));
    if (amount === null) throw new Error("Importo extra non valido.");
    await setJobExtra(db, tenant, str(form, "jobId"), amount, str(form, "extraNote") || null);
    return "Extra salvato.";
  });
}

// --- Prenotazioni ---

export async function guestsAction(form: FormData) {
  return run(form, "/prenotazioni", async () => {
    const guests = Number(str(form, "guests"));
    if (!Number.isInteger(guests) || guests < 1 || guests > 30) throw new Error("Numero di ospiti non valido.");
    await setReservationGuests(await getDb(), str(form, "reservationId"), guests);
    return "Ospiti aggiornati.";
  });
}

export async function reservationDetailsAction(form: FormData) {
  return run(form, "/prenotazioni", async () => {
    const db = await getDb();
    const amount = (key: string) => {
      const raw = str(form, key);
      if (raw === "") return null;
      const v = parseEuro(raw);
      if (v === null) throw new Error(`Importo non valido: ${raw}`);
      return v;
    };
    const id = str(form, "reservationId");
    await db
      .update(reservations)
      .set({
        grossCents: amount("gross"),
        otaCommissionCents: amount("ota"),
        guestCleaningFeeCents: amount("cleaningFee"),
        touristTaxCents: amount("touristTax"),
        arrivalTime: str(form, "arrivalTime") || null,
        notes: str(form, "notes") || null,
        updatedAt: new Date(),
      })
      .where(eq(reservations.id, id));
    return "Prenotazione aggiornata.";
  });
}

export async function manualReservationAction(form: FormData) {
  return run(form, "/prenotazioni", async () => {
    const db = await getDb();
    const tenant = await requireTenant(db);
    const apartmentId = str(form, "apartmentId");
    const checkin = str(form, "checkin");
    const checkout = str(form, "checkout");
    const guests = Number(str(form, "guests"));
    if (!apartmentId) throw new Error("Scegli l'appartamento.");
    if (!isIsoDate(checkin) || !isIsoDate(checkout) || checkout <= checkin) throw new Error("Date non valide.");
    if (!Number.isInteger(guests) || guests < 1) throw new Error("Numero di ospiti non valido.");
    const [apt] = await db.select().from(apartments).where(eq(apartments.id, apartmentId));
    if (!apt) throw new Error("Appartamento non trovato.");
    await db.insert(reservations).values({
      tenantId: tenant.id,
      apartmentId,
      channel: "altro",
      ref: String(1000 + Math.floor(Math.random() * 9000)),
      checkin,
      checkout,
      guests,
      status: checkout <= todayRome() ? "conclusa" : "confermata",
      source: "manuale",
      notes: str(form, "notes") || null,
    });
    await reconcileApartment(db, tenant, apartmentId, new Date());
    return "Prenotazione diretta aggiunta.";
  });
}

// --- Messaggi (simulazione) ---

export async function simulateIncomingAction(form: FormData) {
  return run(form, "/messaggi", async () => {
    const db = await getDb();
    const payload = str(form, "payload");
    const text = str(form, "text");
    const phone = str(form, "phone");
    if (!phone) throw new Error("Manca il numero.");
    const outcome = payload
      ? await handleIncoming(db, { from: phone, type: "button", payload })
      : await handleIncoming(db, { from: phone, type: "text", text });
    return `Risposta simulata. ${outcome}`;
  });
}

// --- Rendiconti ---

export async function draftAction(form: FormData) {
  return run(form, "/rendiconti", async () => {
    const st = await createOrRefreshDraft(await getDb(), str(form, "apartmentId"), str(form, "period"));
    if (str(form, "open") === "1") return { to: `/rendiconti/${st.id}`, message: "Bozza aggiornata." };
    return "Bozza aggiornata.";
  });
}

export async function statementAction(form: FormData) {
  return run(form, "/rendiconti", async () => {
    const db = await getDb();
    const id = str(form, "statementId");
    const action = str(form, "action");
    if (action === "verify") {
      await verifyStatement(db, id);
      return "Rendiconto verificato: dati congelati.";
    }
    if (action === "reopen") {
      await reopenStatement(db, id);
      return "Rendiconto riportato in bozza.";
    }
    if (action === "send") {
      const r = await sendStatement(db, id);
      return `${r.simulated ? "Email simulata" : "Email inviata"} a ${r.to.join(", ")}. PDF archiviato.`;
    }
    if (action === "correct") {
      const note = str(form, "note");
      if (!note) throw new Error("Scrivi il motivo della rettifica.");
      const st = await createCorrection(db, id, note);
      return { to: `/rendiconti/${st.id}`, message: "Rettifica creata come nuova bozza." };
    }
    throw new Error("Azione sconosciuta.");
  });
}

export async function expenseAction(form: FormData) {
  return run(form, "/rendiconti", async () => {
    const db = await getDb();
    const tenant = await requireTenant(db);
    const amount = parseEuro(str(form, "amount"));
    const date = str(form, "date");
    const description = str(form, "description");
    if (amount === null || amount <= 0) throw new Error("Importo non valido.");
    if (!isIsoDate(date)) throw new Error("Data non valida.");
    if (!description) throw new Error("Manca la descrizione.");
    await db.insert(expenses).values({ tenantId: tenant.id, apartmentId: str(form, "apartmentId"), date, description, amountCents: amount });
    const statementId = str(form, "statementId");
    if (statementId) {
      await createOrRefreshDraft(db, str(form, "apartmentId"), date.slice(0, 7));
    }
    return "Spesa aggiunta e bozza ricalcolata.";
  });
}

export async function deleteExpenseAction(form: FormData) {
  return run(form, "/rendiconti", async () => {
    const db = await getDb();
    const id = str(form, "expenseId");
    const [e] = await db.select().from(expenses).where(eq(expenses.id, id));
    if (!e) throw new Error("Spesa non trovata.");
    await db.delete(expenses).where(eq(expenses.id, id));
    await createOrRefreshDraft(db, e.apartmentId, e.date.slice(0, 7));
    return "Spesa eliminata e bozza ricalcolata.";
  });
}
