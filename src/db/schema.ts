import { boolean, date, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import type { ContractParams, StatementResult } from "@/domain/statement";
import type { JobSnapshot } from "@/domain/cleaning";
import type { CostResult } from "@/domain/cost";

// Ogni tabella ha tenant_id: oggi c'è un solo tenant (la tua attività),
// ma il database è già pronto per più property manager e per la Row Level Security.

const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());
const tenantId = () => text("tenant_id").notNull();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

export interface TenantSettings {
  /** Ore di attesa della conferma prima dell'escalation. */
  escalationHours: number;
  /** Ora del promemoria la sera prima (HH:MM, ora di Roma). */
  reminderTime: string;
  /** Ore di attesa della risposta sugli ospiti prima di inviare comunque la pulizia. */
  guestsQuestionTimeoutHours: number;
  /** Minuti tra due letture dei calendari iCal. */
  syncIntervalMinutes: number;
  /** Feste patronali e locali, "MM-DD" o "YYYY-MM-DD". */
  extraHolidays: string[];
}

export const DEFAULT_SETTINGS: TenantSettings = {
  escalationHours: 12,
  reminderTime: "18:00",
  guestsQuestionTimeoutHours: 24,
  syncIntervalMinutes: 15,
  extraHolidays: [],
};

export const tenants = pgTable("tenants", {
  id: id(),
  name: text("name").notNull(),
  managerName: text("manager_name").notNull(),
  managerWhatsapp: text("manager_whatsapp").notNull(),
  managerEmail: text("manager_email").notNull(),
  vatNumber: text("vat_number"),
  address: text("address"),
  brandColor: text("brand_color").notNull().default("#1F4E79"),
  settings: jsonb("settings").$type<TenantSettings>().notNull(),
  createdAt: createdAt(),
});

export const apartments = pgTable("apartments", {
  id: id(),
  tenantId: tenantId(),
  code: text("code").notNull(),
  name: text("name").notNull(),
  address: text("address"),
  checkinTime: text("checkin_time").notNull().default("15:00"),
  checkoutTime: text("checkout_time").notNull().default("10:00"),
  defaultLinenSets: integer("default_linen_sets").notNull().default(2),
  maxGuests: integer("max_guests").notNull().default(4),
  notesForCleaners: text("notes_for_cleaners"),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
});

export const icalFeeds = pgTable("ical_feeds", {
  id: id(),
  tenantId: tenantId(),
  apartmentId: text("apartment_id").notNull(),
  channel: text("channel").$type<"airbnb" | "booking" | "altro">().notNull(),
  url: text("url").notNull(),
  lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
  lastStatus: text("last_status").$type<"ok" | "errore" | "bloccato">(),
  lastError: text("last_error"),
  lastEventCount: integer("last_event_count"),
  createdAt: createdAt(),
});

export const owners = pgTable("owners", {
  id: id(),
  tenantId: tenantId(),
  name: text("name").notNull(),
  fiscalCode: text("fiscal_code"),
  email: text("email").notNull(),
  phone: text("phone"),
  createdAt: createdAt(),
});

export const apartmentOwners = pgTable("apartment_owners", {
  id: id(),
  tenantId: tenantId(),
  apartmentId: text("apartment_id").notNull(),
  ownerId: text("owner_id").notNull(),
  shareBps: integer("share_bps").notNull().default(10_000),
});

export const contracts = pgTable("contracts", {
  id: id(),
  tenantId: tenantId(),
  apartmentId: text("apartment_id").notNull(),
  validFrom: date("valid_from", { mode: "string" }).notNull(),
  params: jsonb("params").$type<ContractParams>().notNull(),
  createdAt: createdAt(),
});

export const cleaners = pgTable("cleaners", {
  id: id(),
  tenantId: tenantId(),
  name: text("name").notNull(),
  kind: text("kind").$type<"persona" | "agenzia">().notNull().default("persona"),
  whatsapp: text("whatsapp").notNull(),
  email: text("email"),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
});

export const apartmentCleaners = pgTable("apartment_cleaners", {
  id: id(),
  tenantId: tenantId(),
  apartmentId: text("apartment_id").notNull(),
  cleanerId: text("cleaner_id").notNull(),
  role: text("role").$type<"principale" | "riserva">().notNull().default("principale"),
  priority: integer("priority").notNull().default(1),
});

export const priceLists = pgTable("price_lists", {
  id: id(),
  tenantId: tenantId(),
  cleanerId: text("cleaner_id").notNull(),
  apartmentId: text("apartment_id").notNull(),
  validFrom: date("valid_from", { mode: "string" }).notNull(),
  baseCents: integer("base_cents").notNull(),
  guestThreshold: integer("guest_threshold").notNull().default(2),
  extraGuestCents: integer("extra_guest_cents").notNull().default(0),
  linenSetCents: integer("linen_set_cents").notNull().default(0),
  holidayMode: text("holiday_mode").$type<"nessuna" | "fissa" | "percentuale">().notNull().default("nessuna"),
  holidayValue: integer("holiday_value").notNull().default(0),
  includeSundays: boolean("include_sundays").notNull().default(false),
  createdAt: createdAt(),
});

export const reservations = pgTable(
  "reservations",
  {
    id: id(),
    tenantId: tenantId(),
    apartmentId: text("apartment_id").notNull(),
    feedId: text("feed_id"),
    channel: text("channel").notNull(),
    /** Codice breve a 4 cifre usato nelle risposte WhatsApp ("4821 3"). */
    ref: text("ref").notNull(),
    externalUid: text("external_uid"),
    externalCode: text("external_code"),
    checkin: date("checkin", { mode: "string" }).notNull(),
    checkout: date("checkout", { mode: "string" }).notNull(),
    status: text("status").$type<"confermata" | "cancellata" | "conclusa" | "da_verificare">().notNull(),
    guests: integer("guests"),
    guestsAskedAt: timestamp("guests_asked_at", { withTimezone: true }),
    arrivalTime: text("arrival_time"),
    notes: text("notes"),
    grossCents: integer("gross_cents"),
    otaCommissionCents: integer("ota_commission_cents"),
    guestCleaningFeeCents: integer("guest_cleaning_fee_cents"),
    touristTaxCents: integer("tourist_tax_cents"),
    source: text("source").$type<"ical" | "manuale">().notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("reservations_feed_uid").on(t.feedId, t.externalUid),
    index("reservations_apartment_dates").on(t.apartmentId, t.checkin),
  ],
);

export const reservationEvents = pgTable("reservation_events", {
  id: id(),
  tenantId: tenantId(),
  reservationId: text("reservation_id").notNull(),
  kind: text("kind").$type<"creata" | "modificata" | "cancellata" | "conclusa" | "da_verificare" | "ospiti">().notNull(),
  before: jsonb("before"),
  after: jsonb("after"),
  createdAt: createdAt(),
});

export const cleaningJobs = pgTable(
  "cleaning_jobs",
  {
    id: id(),
    tenantId: tenantId(),
    apartmentId: text("apartment_id").notNull(),
    reservationId: text("reservation_id").notNull(),
    nextReservationId: text("next_reservation_id"),
    date: date("date", { mode: "string" }).notNull(),
    windowStart: text("window_start").notNull(),
    windowEnd: text("window_end"),
    sameDay: boolean("same_day").notNull().default(false),
    guestsOut: integer("guests_out"),
    guestsIn: integer("guests_in"),
    linenSets: integer("linen_sets").notNull(),
    nextCheckin: date("next_checkin", { mode: "string" }),
    cleanerId: text("cleaner_id"),
    status: text("status")
      .$type<"creato" | "inviato" | "confermato" | "completato" | "escalation" | "annullato">()
      .notNull()
      .default("creato"),
    /** Ciò che l'addetta ha ricevuto nell'ultimo messaggio. */
    lastSnapshot: jsonb("last_snapshot").$type<JobSnapshot>(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    reminderSentAt: timestamp("reminder_sent_at", { withTimezone: true }),
    escalatedAt: timestamp("escalated_at", { withTimezone: true }),
    extraCents: integer("extra_cents").notNull().default(0),
    extraNote: text("extra_note"),
    costCents: integer("cost_cents"),
    costBreakdown: jsonb("cost_breakdown").$type<CostResult>(),
    photos: jsonb("photos").$type<string[]>().notNull().default([]),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("cleaning_jobs_reservation").on(t.reservationId), index("cleaning_jobs_date").on(t.date)],
);

export const whatsappMessages = pgTable("whatsapp_messages", {
  id: id(),
  tenantId: tenantId(),
  direction: text("direction").$type<"out" | "in">().notNull(),
  phone: text("phone").notNull(),
  contactName: text("contact_name"),
  kind: text("kind").notNull(),
  cleaningJobId: text("cleaning_job_id"),
  reservationId: text("reservation_id"),
  body: text("body").notNull(),
  buttons: jsonb("buttons").$type<{ id: string; label: string }[]>().notNull().default([]),
  status: text("status").$type<"simulato" | "inviato" | "errore" | "ricevuto">().notNull(),
  providerId: text("provider_id"),
  error: text("error"),
  /** Esito dell'elaborazione di un messaggio in arrivo. */
  note: text("note"),
  createdAt: createdAt(),
});

export const expenses = pgTable("expenses", {
  id: id(),
  tenantId: tenantId(),
  apartmentId: text("apartment_id").notNull(),
  date: date("date", { mode: "string" }).notNull(),
  description: text("description").notNull(),
  amountCents: integer("amount_cents").notNull(),
  createdAt: createdAt(),
});

export const statements = pgTable("statements", {
  id: id(),
  tenantId: tenantId(),
  apartmentId: text("apartment_id").notNull(),
  period: text("period").notNull(),
  version: integer("version").notNull().default(1),
  status: text("status").$type<"bozza" | "verificato" | "inviato">().notNull().default("bozza"),
  correctsId: text("corrects_id"),
  correctionNote: text("correction_note"),
  /** Fotografia di dati e risultato: dopo la verifica non cambia più. */
  result: jsonb("result").$type<StatementResult>().notNull(),
  contractParams: jsonb("contract_params").$type<ContractParams>().notNull(),
  pdfPath: text("pdf_path"),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  sentTo: text("sent_to"),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const activityLog = pgTable("activity_log", {
  id: id(),
  tenantId: tenantId(),
  actor: text("actor").notNull(),
  action: text("action").notNull(),
  entity: text("entity"),
  entityId: text("entity_id"),
  details: jsonb("details"),
  createdAt: createdAt(),
});
