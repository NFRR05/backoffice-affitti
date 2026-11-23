import Link from "next/link";
import { asc, desc, eq } from "drizzle-orm";
import type { ReactNode } from "react";
import { getDb } from "@/db/client";
import {
  apartmentCleaners,
  apartmentOwners,
  apartments,
  cleaners,
  contracts,
  icalFeeds,
  owners,
  priceLists,
  statements,
} from "@/db/schema";
import { requireTenant } from "@/services/common";
import { formatPeriod } from "@/lib/dates";
import { formatBps, formatEuro } from "@/lib/money";
import { describeContract } from "@/domain/statement";
import { Flash, PageHeader, Section, param, plural, type SearchParams } from "@/components/ui";

const CHANNEL: Record<string, string> = { airbnb: "Airbnb", booking: "Booking" };

function since(d: Date | null) {
  if (!d) return "mai letto";
  const minutes = Math.round((Date.now() - d.getTime()) / 60_000);
  if (minutes < 1) return "letto adesso";
  if (minutes < 60) return `letto ${minutes} min fa`;
  return `letto il ${d.toLocaleString("it-IT", { timeZone: "Europe/Rome", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}`;
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-[13px] font-medium text-ink-soft sm:pt-px">{label}</dt>
      <dd className="mb-4 text-sm text-ink sm:mb-0">{children}</dd>
    </>
  );
}

export default async function AppartamentiPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const db = await getDb();
  const tenant = await requireTenant(db);
  const apts = await db.select().from(apartments).where(eq(apartments.tenantId, tenant.id)).orderBy(asc(apartments.code));
  const feeds = await db.select().from(icalFeeds).where(eq(icalFeeds.tenantId, tenant.id));
  const shares = await db
    .select({ apartmentId: apartmentOwners.apartmentId, name: owners.name, email: owners.email, shareBps: apartmentOwners.shareBps })
    .from(apartmentOwners)
    .innerJoin(owners, eq(owners.id, apartmentOwners.ownerId));
  const team = await db
    .select({ apartmentId: apartmentCleaners.apartmentId, cleanerId: cleaners.id, name: cleaners.name, role: apartmentCleaners.role })
    .from(apartmentCleaners)
    .innerJoin(cleaners, eq(cleaners.id, apartmentCleaners.cleanerId))
    .orderBy(asc(apartmentCleaners.priority));
  const lists = await db.select().from(priceLists).orderBy(desc(priceLists.validFrom));
  const allContracts = await db.select().from(contracts).orderBy(desc(contracts.validFrom));
  const sent = await db.select().from(statements).where(eq(statements.status, "inviato")).orderBy(desc(statements.period));

  return (
    <div>
      <PageHeader
        title="Appartamenti"
        description="La configurazione arriva dal file config/configurazione.json. Per cambiarla aggiorna il file e reimportalo dalle Impostazioni."
      />
      <Flash ok={param(sp, "ok")} errore={param(sp, "errore")} />

      <div className="grid gap-6 xl:grid-cols-2">
        {apts.map((apt) => {
          const contract = allContracts.find((c) => c.apartmentId === apt.id);
          const contractLines = contract ? describeContract(contract.params).filter((_, i) => i !== 1) : [];
          const archive = sent.filter((s) => s.apartmentId === apt.id);
          const aptShares = shares.filter((s) => s.apartmentId === apt.id);
          return (
            <Section
              key={apt.id}
              title={apt.name}
              description={`Codice ${apt.code}. Check-out alle ${apt.checkoutTime}, check-in alle ${apt.checkinTime}. Fino a ${plural(apt.maxGuests, "ospite", "ospiti")}, ${apt.defaultLinenSets} set di biancheria standard.`}
            >
              <dl className="grid gap-x-6 gap-y-1 sm:grid-cols-[9rem_1fr] sm:gap-y-4">
                <Row label="Calendari">
                  <ul className="space-y-1">
                    {feeds
                      .filter((f) => f.apartmentId === apt.id)
                      .map((f) => {
                        const broken = Boolean(f.lastStatus && f.lastStatus !== "ok");
                        return (
                          <li key={f.id}>
                            {CHANNEL[f.channel] ?? f.channel}
                            <span className={broken ? "text-bad" : "text-muted"}>
                              {broken
                                ? `: non si legge${f.lastError ? ` (${f.lastError})` : ""}`
                                : `: ${since(f.lastSyncAt)}${f.lastEventCount !== null ? `, ${plural(f.lastEventCount, "evento", "eventi")}` : ""}`}
                            </span>
                          </li>
                        );
                      })}
                  </ul>
                </Row>

                <Row label="Proprietari">
                  {aptShares.length === 0 ? (
                    <span className="text-muted">Nessuno</span>
                  ) : (
                    <ul className="space-y-1">
                      {aptShares.map((s) => (
                        <li key={s.name}>
                          {s.name} <span className="text-muted">({formatBps(s.shareBps)})</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </Row>

                <Row label="Addette">
                  <ul className="space-y-2">
                    {team
                      .filter((t) => t.apartmentId === apt.id)
                      .map((t, i) => {
                        const pl = lists.find((l) => l.apartmentId === apt.id && l.cleanerId === t.cleanerId);
                        const holiday =
                          pl?.holidayMode === "percentuale"
                            ? `, festivi più ${formatBps(pl.holidayValue)}`
                            : pl?.holidayMode === "fissa"
                              ? `, festivi più ${formatEuro(pl.holidayValue)}`
                              : "";
                        return (
                          <li key={`${t.cleanerId}-${t.role}-${i}`}>
                            {t.name} <span className="text-muted">({t.role})</span>
                            <div className={`text-[13px] ${pl ? "text-muted" : "text-bad"}`}>
                              {pl
                                ? `Base ${formatEuro(pl.baseCents)}, più ${formatEuro(pl.extraGuestCents)} per ospite oltre ${pl.guestThreshold}, set di biancheria ${formatEuro(pl.linenSetCents)}${holiday}.`
                                : "Senza listino: il costo delle pulizie non si può calcolare."}
                            </div>
                          </li>
                        );
                      })}
                  </ul>
                </Row>

                <Row label="Contratto">
                  {contractLines.length === 0 ? (
                    <span className="text-muted">Nessuno</span>
                  ) : (
                    <ul className="space-y-1 text-ink-soft">
                      {contractLines.map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                  )}
                </Row>

                <Row label="Rendiconti inviati">
                  {archive.length === 0 ? (
                    <span className="text-muted">Nessuno</span>
                  ) : (
                    <div className="flex flex-wrap gap-x-4 gap-y-1">
                      {archive.map((s) => (
                        <Link key={s.id} className="link" href={`/rendiconti/${s.id}`}>
                          {formatPeriod(s.period)}
                          {s.version > 1 ? ` (versione ${s.version})` : ""}
                        </Link>
                      ))}
                    </div>
                  )}
                </Row>
              </dl>
            </Section>
          );
        })}
      </div>
    </div>
  );
}
