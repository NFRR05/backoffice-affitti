import fs from "node:fs/promises";
import path from "node:path";
import { and, eq, notInArray } from "drizzle-orm";
import { z } from "zod";
import type { DB } from "@/db/client";
import {
  apartmentCleaners,
  apartmentOwners,
  apartments,
  cleaners,
  contracts,
  icalFeeds,
  owners,
  priceLists,
  tenants,
  DEFAULT_SETTINGS,
} from "@/db/schema";
import { contractParamsSchema, type ContractParams } from "@/domain/statement";
import { getTenant, logActivity, normalizePhone } from "@/services/common";

// Il file di configurazione usa euro e percentuali "umani" (45, 20, 22):
// qui vengono convertiti in centesimi e punti base.

const euro = z.number().min(0);
const percent = z.number().min(0).max(100);
const time = z.string().regex(/^\d{2}:\d{2}$/, "Orario nel formato HH:MM");
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data nel formato AAAA-MM-GG");

const contractSchema = z.object({
  validoDal: isoDate,
  attribuzione: z.enum(["checkin", "checkout", "notti"]).default("checkin"),
  baseCommissione: z.enum(["lordo", "netto_ota", "netto_ota_pulizie"]).default("netto_ota"),
  tipoCommissione: z.enum(["percentuale", "fissa", "percentuale_con_minimo"]).default("percentuale"),
  percentuale: percent.default(20),
  quotaFissa: euro.default(0),
  minimo: euro.default(0),
  pulizieACarico: z.enum(["proprietario", "gestore"]).default("proprietario"),
  quotaPulizieOspite: z.enum(["ricavo_proprietario", "rimborso_gestore"]).default("ricavo_proprietario"),
  iva: percent.default(22),
  ritenuta: z
    .object({ attiva: z.boolean().default(false), percentuale: percent.default(21), base: z.enum(["lordo", "netto_ota"]).default("lordo") })
    .default({ attiva: false, percentuale: 21, base: "lordo" }),
});

export const configSchema = z.object({
  gestore: z.object({
    nome: z.string().min(1),
    attivita: z.string().min(1),
    whatsapp: z.string().min(6),
    email: z.string().email(),
    partitaIva: z.string().optional(),
    indirizzo: z.string().optional(),
    colore: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#1F4E79"),
  }),
  impostazioni: z
    .object({
      oreEscalation: z.number().int().min(1).default(DEFAULT_SETTINGS.escalationHours),
      orarioPromemoria: time.default(DEFAULT_SETTINGS.reminderTime),
      oreAttesaOspiti: z.number().int().min(0).default(DEFAULT_SETTINGS.guestsQuestionTimeoutHours),
      minutiSincronizzazione: z.number().int().min(5).default(DEFAULT_SETTINGS.syncIntervalMinutes),
      festeLocali: z.array(z.string()).default([]),
    })
    .default({
      oreEscalation: DEFAULT_SETTINGS.escalationHours,
      orarioPromemoria: DEFAULT_SETTINGS.reminderTime,
      oreAttesaOspiti: DEFAULT_SETTINGS.guestsQuestionTimeoutHours,
      minutiSincronizzazione: DEFAULT_SETTINGS.syncIntervalMinutes,
      festeLocali: [],
    }),
  addette: z.array(
    z.object({
      nome: z.string().min(1),
      tipo: z.enum(["persona", "agenzia"]).default("persona"),
      whatsapp: z.string().min(6),
      email: z.string().email().optional(),
    }),
  ),
  proprietari: z.array(
    z.object({
      nome: z.string().min(1),
      email: z.string().email(),
      codiceFiscale: z.string().optional(),
      telefono: z.string().optional(),
    }),
  ),
  appartamenti: z.array(
    z.object({
      codice: z.string().min(1),
      nome: z.string().min(1),
      indirizzo: z.string().optional(),
      checkIn: time.default("15:00"),
      checkOut: time.default("10:00"),
      setBiancheriaStandard: z.number().int().min(0).default(2),
      ospitiMax: z.number().int().min(1).default(4),
      noteAddette: z.string().optional(),
      calendari: z.array(z.object({ canale: z.enum(["airbnb", "booking", "altro"]), url: z.string().min(5) })).default([]),
      proprietari: z.array(z.object({ email: z.string().email(), quota: percent.default(100) })).min(1),
      addette: z
        .array(z.object({ whatsapp: z.string(), ruolo: z.enum(["principale", "riserva"]).default("principale") }))
        .default([]),
      listini: z
        .array(
          z.object({
            addetta: z.string(),
            validoDal: isoDate,
            base: euro,
            ospitiInclusi: z.number().int().min(0).default(2),
            supplementoOspite: euro.default(0),
            setBiancheria: euro.default(0),
            festivi: z
              .object({
                tipo: z.enum(["nessuna", "fissa", "percentuale"]).default("nessuna"),
                valore: z.number().min(0).default(0),
                domeniche: z.boolean().default(false),
              })
              .default({ tipo: "nessuna", valore: 0, domeniche: false }),
          }),
        )
        .default([]),
      contratti: z.array(contractSchema).min(1),
    }),
  ),
});

export type AppConfig = z.infer<typeof configSchema>;

const cents = (v: number) => Math.round(v * 100);
const bps = (v: number) => Math.round(v * 100);

function toContractParams(c: z.infer<typeof contractSchema>): ContractParams {
  return contractParamsSchema.parse({
    attribution: c.attribuzione,
    commissionBase: c.baseCommissione,
    commissionType: c.tipoCommissione,
    commissionRateBps: bps(c.percentuale),
    fixedMonthlyCents: cents(c.quotaFissa),
    minimumCents: cents(c.minimo),
    cleaningCostsBorneBy: c.pulizieACarico,
    guestCleaningFee: c.quotaPulizieOspite,
    vatRateBps: bps(c.iva),
    withholding: { enabled: c.ritenuta.attiva, rateBps: bps(c.ritenuta.percentuale), base: c.ritenuta.base },
  });
}

export const CONFIG_PATH = path.join(/*turbopackIgnore: true*/ process.cwd(), "config", "configurazione.json");

export async function readConfigFile(file = CONFIG_PATH): Promise<AppConfig> {
  const raw = await fs.readFile(file, "utf8");
  return parseConfig(JSON.parse(raw));
}

export function parseConfig(data: unknown): AppConfig {
  const parsed = configSchema.safeParse(data);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Configurazione non valida — ${issues}`);
  }
  return parsed.data;
}

/**
 * Importa (o aggiorna) la configurazione. Chiavi: codice appartamento, email proprietario,
 * numero WhatsApp addetta, link del calendario. Prenotazioni e pulizie esistenti restano.
 */
export async function importConfig(db: DB, config: AppConfig): Promise<{ apartments: number }> {
  const settings = {
    escalationHours: config.impostazioni.oreEscalation,
    reminderTime: config.impostazioni.orarioPromemoria,
    guestsQuestionTimeoutHours: config.impostazioni.oreAttesaOspiti,
    syncIntervalMinutes: config.impostazioni.minutiSincronizzazione,
    extraHolidays: config.impostazioni.festeLocali,
  };
  const tenantValues = {
    name: config.gestore.attivita,
    managerName: config.gestore.nome,
    managerWhatsapp: normalizePhone(config.gestore.whatsapp),
    managerEmail: config.gestore.email,
    vatNumber: config.gestore.partitaIva ?? null,
    address: config.gestore.indirizzo ?? null,
    brandColor: config.gestore.colore,
    settings,
  };
  let tenant = await getTenant(db);
  if (tenant) {
    [tenant] = await db.update(tenants).set(tenantValues).where(eq(tenants.id, tenant.id)).returning();
  } else {
    [tenant] = await db.insert(tenants).values(tenantValues).returning();
  }
  const tenantId = tenant.id;

  const cleanerIds = new Map<string, string>();
  for (const c of config.addette) {
    const phone = normalizePhone(c.whatsapp);
    const values = { tenantId, name: c.nome, kind: c.tipo, whatsapp: phone, email: c.email ?? null, active: true };
    const [existing] = await db.select().from(cleaners).where(and(eq(cleaners.tenantId, tenantId), eq(cleaners.whatsapp, phone)));
    const [row] = existing
      ? await db.update(cleaners).set(values).where(eq(cleaners.id, existing.id)).returning()
      : await db.insert(cleaners).values(values).returning();
    cleanerIds.set(phone, row.id);
  }

  const ownerIds = new Map<string, string>();
  for (const o of config.proprietari) {
    const email = o.email.toLowerCase();
    const values = { tenantId, name: o.nome, email, fiscalCode: o.codiceFiscale ?? null, phone: o.telefono ?? null };
    const [existing] = await db.select().from(owners).where(and(eq(owners.tenantId, tenantId), eq(owners.email, email)));
    const [row] = existing
      ? await db.update(owners).set(values).where(eq(owners.id, existing.id)).returning()
      : await db.insert(owners).values(values).returning();
    ownerIds.set(email, row.id);
  }

  for (const a of config.appartamenti) {
    const values = {
      tenantId,
      code: a.codice,
      name: a.nome,
      address: a.indirizzo ?? null,
      checkinTime: a.checkIn,
      checkoutTime: a.checkOut,
      defaultLinenSets: a.setBiancheriaStandard,
      maxGuests: a.ospitiMax,
      notesForCleaners: a.noteAddette ?? null,
      active: true,
    };
    const [existing] = await db.select().from(apartments).where(and(eq(apartments.tenantId, tenantId), eq(apartments.code, a.codice)));
    const [apt] = existing
      ? await db.update(apartments).set(values).where(eq(apartments.id, existing.id)).returning()
      : await db.insert(apartments).values(values).returning();

    // Calendari: si conservano quelli già presenti (le prenotazioni sono legate al calendario).
    const urls = a.calendari.map((c) => c.url);
    for (const cal of a.calendari) {
      const [feed] = await db.select().from(icalFeeds).where(and(eq(icalFeeds.apartmentId, apt.id), eq(icalFeeds.url, cal.url)));
      if (feed) await db.update(icalFeeds).set({ channel: cal.canale }).where(eq(icalFeeds.id, feed.id));
      else await db.insert(icalFeeds).values({ tenantId, apartmentId: apt.id, channel: cal.canale, url: cal.url });
    }
    if (urls.length > 0) {
      await db.delete(icalFeeds).where(and(eq(icalFeeds.apartmentId, apt.id), notInArray(icalFeeds.url, urls)));
    } else {
      await db.delete(icalFeeds).where(eq(icalFeeds.apartmentId, apt.id));
    }

    await db.delete(apartmentOwners).where(eq(apartmentOwners.apartmentId, apt.id));
    for (const share of a.proprietari) {
      const ownerId = ownerIds.get(share.email.toLowerCase());
      if (!ownerId) throw new Error(`${a.codice}: proprietario ${share.email} non presente nell'elenco proprietari.`);
      await db.insert(apartmentOwners).values({ tenantId, apartmentId: apt.id, ownerId, shareBps: bps(share.quota) });
    }

    await db.delete(apartmentCleaners).where(eq(apartmentCleaners.apartmentId, apt.id));
    let priority = 1;
    for (const assignment of a.addette) {
      const cleanerId = cleanerIds.get(normalizePhone(assignment.whatsapp));
      if (!cleanerId) throw new Error(`${a.codice}: addetta ${assignment.whatsapp} non presente nell'elenco addette.`);
      await db.insert(apartmentCleaners).values({ tenantId, apartmentId: apt.id, cleanerId, role: assignment.ruolo, priority: priority++ });
    }

    await db.delete(priceLists).where(eq(priceLists.apartmentId, apt.id));
    for (const pl of a.listini) {
      const cleanerId = cleanerIds.get(normalizePhone(pl.addetta));
      if (!cleanerId) throw new Error(`${a.codice}: listino per un'addetta non presente (${pl.addetta}).`);
      await db.insert(priceLists).values({
        tenantId,
        cleanerId,
        apartmentId: apt.id,
        validFrom: pl.validoDal,
        baseCents: cents(pl.base),
        guestThreshold: pl.ospitiInclusi,
        extraGuestCents: cents(pl.supplementoOspite),
        linenSetCents: cents(pl.setBiancheria),
        holidayMode: pl.festivi.tipo,
        holidayValue: pl.festivi.tipo === "fissa" ? cents(pl.festivi.valore) : bps(pl.festivi.valore),
        includeSundays: pl.festivi.domeniche,
      });
    }

    await db.delete(contracts).where(eq(contracts.apartmentId, apt.id));
    for (const c of a.contratti) {
      await db.insert(contracts).values({ tenantId, apartmentId: apt.id, validFrom: c.validoDal, params: toContractParams(c) });
    }
  }

  await logActivity(db, tenantId, "gestore", "configurazione_importata", undefined, undefined, {
    apartments: config.appartamenti.length,
  });
  return { apartments: config.appartamenti.length };
}
