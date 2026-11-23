import { and, asc, eq } from "drizzle-orm";
import type { DB } from "@/db/client";
import { activityLog, apartmentCleaners, cleaners, DEFAULT_SETTINGS, tenants, type TenantSettings } from "@/db/schema";

export type Tenant = typeof tenants.$inferSelect;

/** La versione 1 ha un solo tenant: la tua attività. */
export async function getTenant(db: DB): Promise<Tenant | null> {
  const [tenant] = await db.select().from(tenants).limit(1);
  return tenant ?? null;
}

export async function requireTenant(db: DB): Promise<Tenant> {
  const tenant = await getTenant(db);
  if (!tenant) throw new Error("Nessuna configurazione: carica i dati demo o importa config/configurazione.json.");
  return tenant;
}

export function settingsOf(tenant: Tenant): TenantSettings {
  return { ...DEFAULT_SETTINGS, ...(tenant.settings ?? {}) };
}

export async function logActivity(
  db: DB,
  tenantId: string,
  actor: string,
  action: string,
  entity?: string,
  entityId?: string,
  details?: unknown,
): Promise<void> {
  await db.insert(activityLog).values({ tenantId, actor, action, entity, entityId, details: details ?? null });
}

/** Numero WhatsApp in formato internazionale senza "+" (es. 393331234567). */
export function normalizePhone(input: string): string {
  let digits = input.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length === 10 && digits.startsWith("3")) digits = `39${digits}`;
  return digits;
}

/** Addetta principale dell'appartamento (la prima per priorità), se c'è. */
export async function principalCleanerId(db: DB, apartmentId: string): Promise<string | null> {
  const rows = await db
    .select({ cleanerId: apartmentCleaners.cleanerId, role: apartmentCleaners.role })
    .from(apartmentCleaners)
    .innerJoin(cleaners, eq(cleaners.id, apartmentCleaners.cleanerId))
    .where(and(eq(apartmentCleaners.apartmentId, apartmentId), eq(cleaners.active, true)))
    .orderBy(asc(apartmentCleaners.priority));
  const principal = rows.find((r) => r.role === "principale") ?? rows[0];
  return principal?.cleanerId ?? null;
}
