import fs from "node:fs/promises";
import path from "node:path";
import { and, eq, gte, lt } from "drizzle-orm";
import { DATA_DIR, type DB } from "@/db/client";
import * as schema from "@/db/schema";
import { addDays, diffDays, periodBounds, periodOf, todayRome } from "@/lib/dates";
import { applyJobAction, freezeCost, reconcileApartment } from "@/services/cleaning";
import { principalCleanerId, requireTenant } from "@/services/common";
import { importConfig, parseConfig, type AppConfig } from "@/services/config";
import { syncAll } from "@/services/sync";
import { runTick } from "@/services/tick";

// Dati inventati per provare l'app senza toccare nulla di reale:
// 8 appartamenti, calendari iCal generati in ./data/demo-ical, messaggi simulati.

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const APARTMENTS = [
  { code: "APP1", name: "Trilocale Centro", nightly: 120, max: 4 },
  { code: "APP2", name: "Bilocale Navigli", nightly: 95, max: 3 },
  { code: "APP3", name: "Loft Porta Romana", nightly: 140, max: 4 },
  { code: "APP4", name: "Monolocale Isola", nightly: 75, max: 2 },
  { code: "APP5", name: "Attico Brera", nightly: 180, max: 5 },
  { code: "APP6", name: "Bilocale Città Studi", nightly: 85, max: 3 },
  { code: "APP7", name: "Trilocale Ticinese", nightly: 110, max: 4 },
  { code: "APP8", name: "Studio Garibaldi", nightly: 90, max: 2 },
];

const MANAGER_PHONE = "393330000000";
const CLEANERS = [
  { nome: "Anna Bianchi", tipo: "persona" as const, whatsapp: "393330000101" },
  { nome: "Lucia Esposito", tipo: "persona" as const, whatsapp: "393330000102" },
  { nome: "Pulizie Splendor srl", tipo: "agenzia" as const, whatsapp: "393330000103", email: "ordini@splendor.example.com" },
];

interface DemoStay {
  channel: "airbnb" | "booking";
  uid: string;
  code: string;
  checkin: string;
  checkout: string;
}

function generateStays(index: number, from: string, to: string): DemoStay[] {
  const random = rng(1000 + index * 7919);
  const stays: DemoStay[] = [];
  let cursor = addDays(from, Math.floor(random() * 3));
  let n = 0;
  while (cursor < to) {
    const nights = 2 + Math.floor(random() * 4);
    const channel = random() < 0.6 ? "airbnb" : "booking";
    const checkout = addDays(cursor, nights);
    const code = `HM${Math.floor(random() * 36 ** 8).toString(36).toUpperCase().padStart(8, "X")}`;
    stays.push({ channel, uid: `demo-${index}-${n}@${channel}.com`, code, checkin: cursor, checkout });
    n++;
    const gap = random() < 0.35 ? 0 : 1 + Math.floor(random() * 3);
    cursor = addDays(checkout, gap);
  }
  return stays;
}

function ics(lines: string[]): string {
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Demo//Backoffice Affitti//IT", ...lines, "END:VCALENDAR", ""].join("\r\n");
}

const compact = (iso: string) => iso.replaceAll("-", "");

function airbnbIcs(stays: DemoStay[]): string {
  const lines: string[] = [];
  for (const s of stays) {
    lines.push("BEGIN:VEVENT", `DTSTART;VALUE=DATE:${compact(s.checkin)}`, `DTEND;VALUE=DATE:${compact(s.checkout)}`, `UID:${s.uid}`);
    if (s.channel === "airbnb") {
      lines.push(
        `DESCRIPTION:Reservation URL: https://www.airbnb.com/hosting/reservations/details/${s.code}\\nPhone Number (Last 4 Digits): 1234`,
        "SUMMARY:Reserved",
      );
    } else {
      // Come Airbnb esporta le date importate da Booking: blocchi da ignorare.
      lines.push("SUMMARY:Airbnb (Not available)");
    }
    lines.push("END:VEVENT");
  }
  return ics(lines);
}

function bookingIcs(stays: DemoStay[]): string {
  const lines: string[] = [];
  for (const s of stays.filter((x) => x.channel === "booking")) {
    lines.push(
      "BEGIN:VEVENT",
      `DTSTART;VALUE=DATE:${compact(s.checkin)}`,
      `DTEND;VALUE=DATE:${compact(s.checkout)}`,
      `UID:${s.uid}`,
      "SUMMARY:CLOSED - Not available",
      "END:VEVENT",
    );
  }
  return ics(lines);
}

export function demoConfig(): AppConfig {
  const owners = [
    { nome: "Mario Rossi", email: "mario.rossi@example.com" },
    { nome: "Giulia Ferri", email: "giulia.ferri@example.com" },
    { nome: "Paolo Conti", email: "paolo.conti@example.com" },
    { nome: "Elena Marchetti", email: "elena.marchetti@example.com" },
    { nome: "Franco Marchetti", email: "franco.marchetti@example.com" },
    { nome: "Sara Galli", email: "sara.galli@example.com" },
  ];
  const ownerOf = (i: number) =>
    i === 4
      ? [
          { email: owners[3].email, quota: 50 },
          { email: owners[4].email, quota: 50 },
        ]
      : [{ email: owners[[0, 0, 1, 2, 3, 5, 1, 2][i]].email, quota: 100 }];

  return parseConfig({
    gestore: {
      nome: "Gestore Demo",
      attivita: "Demo Property Management",
      whatsapp: MANAGER_PHONE,
      email: "gestore@example.com",
      partitaIva: "00000000000",
      indirizzo: "Via Esempio 1, Milano",
      colore: "#1F4E79",
    },
    impostazioni: { festeLocali: ["12-07"] },
    addette: CLEANERS,
    proprietari: owners,
    appartamenti: APARTMENTS.map((a, i) => ({
      codice: a.code,
      nome: a.name,
      indirizzo: `Via Demo ${i + 1}, Milano`,
      setBiancheriaStandard: 2,
      ospitiMax: a.max,
      noteAddette: i === 0 ? "Chiavi nella cassetta, codice 2580" : undefined,
      calendari: [
        { canale: "airbnb", url: `file:data/demo-ical/${a.code}-airbnb.ics` },
        { canale: "booking", url: `file:data/demo-ical/${a.code}-booking.ics` },
      ],
      proprietari: ownerOf(i),
      addette: [
        { whatsapp: CLEANERS[i % 3 === 2 ? 2 : i % 2].whatsapp, ruolo: "principale" },
        { whatsapp: CLEANERS[(i + 1) % 3].whatsapp, ruolo: "riserva" },
      ],
      listini: CLEANERS.map((c, k) => ({
        addetta: c.whatsapp,
        validoDal: "2026-01-01",
        base: 40 + (a.max - 2) * 8 + k * 3,
        ospitiInclusi: 2,
        supplementoOspite: 5,
        setBiancheria: 8,
        festivi: { tipo: "percentuale", valore: 20, domeniche: false },
      })),
      contratti: [
        i === 3
          ? { validoDal: "2026-01-01", tipoCommissione: "percentuale_con_minimo", percentuale: 18, minimo: 150 }
          : i === 6
            ? { validoDal: "2026-01-01", percentuale: 22, quotaPulizieOspite: "rimborso_gestore", pulizieACarico: "gestore" }
            : { validoDal: "2026-01-01", percentuale: 20 },
      ],
    })),
  });
}

async function wipe(db: DB) {
  const tables = [
    schema.activityLog,
    schema.statements,
    schema.expenses,
    schema.whatsappMessages,
    schema.cleaningJobs,
    schema.reservationEvents,
    schema.reservations,
    schema.contracts,
    schema.priceLists,
    schema.apartmentCleaners,
    schema.cleaners,
    schema.apartmentOwners,
    schema.owners,
    schema.icalFeeds,
    schema.apartments,
    schema.tenants,
  ];
  for (const t of tables) await db.delete(t);
}

/** Cancella tutto e carica la demo. Non usarlo sui dati veri. */
export async function loadDemo(db: DB, now: Date = new Date()): Promise<void> {
  await wipe(db);
  const today = todayRome(now);
  const { first } = periodBounds(periodOf(today));
  const until = addDays(today, 50);

  const dir = path.join(DATA_DIR, "demo-ical");
  await fs.mkdir(dir, { recursive: true });
  const staysByApt = new Map<string, DemoStay[]>();
  for (const [i, a] of APARTMENTS.entries()) {
    const stays = generateStays(i, first, until);
    staysByApt.set(a.code, stays);
    await fs.writeFile(path.join(dir, `${a.code}-airbnb.ics`), airbnbIcs(stays));
    await fs.writeFile(path.join(dir, `${a.code}-booking.ics`), bookingIcs(stays));
  }

  await importConfig(db, demoConfig());
  const tenant = await requireTenant(db);
  await syncAll(db, tenant, now, true);

  // Ospiti e importi: come se fossero già stati inseriti. Il 15% delle prenotazioni future
  // resta senza ospiti, così vedi partire la domanda su WhatsApp.
  const random = rng(42);
  const apts = await db.select().from(schema.apartments);
  for (const apt of apts) {
    const meta = APARTMENTS.find((a) => a.code === apt.code)!;
    const res = await db.select().from(schema.reservations).where(eq(schema.reservations.apartmentId, apt.id));
    for (const r of res) {
      const future = r.checkin > today;
      const guests = future && random() < 0.15 ? null : 1 + Math.floor(random() * meta.max);
      const nights = diffDays(r.checkin, r.checkout);
      const cleaningFee = 5000;
      const gross = nights * meta.nightly * 100 + cleaningFee + Math.floor(random() * 20) * 100;
      const rate = r.channel === "airbnb" ? 0.155 : 0.17;
      const amounts =
        r.checkin <= today
          ? {
              grossCents: gross,
              otaCommissionCents: Math.round(gross * rate),
              guestCleaningFeeCents: cleaningFee,
              touristTaxCents: (guests ?? 2) * Math.min(nights, 5) * 300,
            }
          : {};
      await db
        .update(schema.reservations)
        .set({ guests, ...amounts, guestsAskedAt: guests === null ? null : now })
        .where(eq(schema.reservations.id, r.id));
    }

    // Pulizie già fatte nel mese in corso (il riallineamento crea solo quelle future).
    const past = await db
      .select()
      .from(schema.reservations)
      .where(
        and(eq(schema.reservations.apartmentId, apt.id), gte(schema.reservations.checkout, first), lt(schema.reservations.checkout, today)),
      );
    const cleanerId = await principalCleanerId(db, apt.id);
    for (const r of past) {
      const [job] = await db
        .insert(schema.cleaningJobs)
        .values({
          tenantId: tenant.id,
          apartmentId: apt.id,
          reservationId: r.id,
          date: r.checkout,
          windowStart: apt.checkoutTime,
          guestsOut: r.guests,
          guestsIn: 2,
          linenSets: 2,
          cleanerId,
          status: "completato",
          completedAt: now,
        })
        .onConflictDoNothing()
        .returning();
      if (job) await freezeCost(db, tenant, job.id);
    }
    await reconcileApartment(db, tenant, apt.id, now);
  }

  const [app1] = apts.filter((a) => a.code === "APP1");
  if (app1) {
    await db.insert(schema.expenses).values({
      tenantId: tenant.id,
      apartmentId: app1.id,
      date: addDays(today, -3) >= first ? addDays(today, -3) : today,
      description: "Sostituzione lampadine e materiale di consumo",
      amountCents: 1850,
    });
  }

  // Primo giro dell'attività pianificata: domande sugli ospiti, invio delle pulizie.
  await runTick(db, now);

  // Qualche risposta simulata delle addette, per vedere tutti gli stati.
  const sent = await db.select().from(schema.cleaningJobs).where(eq(schema.cleaningJobs.status, "inviato"));
  sent.sort((a, b) => a.date.localeCompare(b.date));
  for (const [i, job] of sent.entries()) {
    if (i === 2) await applyJobAction(db, tenant, job.id, "decline", "demo", now);
    else if (i % 3 !== 1) await applyJobAction(db, tenant, job.id, "confirm", "demo", now);
  }
}
