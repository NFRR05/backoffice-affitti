import Link from "next/link";
import { asc, desc, eq } from "drizzle-orm";
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
import { Card, Flash, PageHeader, Pill, param, type SearchParams } from "@/components/ui";

function since(d: Date | null) {
  if (!d) return "mai";
  const minutes = Math.round((Date.now() - d.getTime()) / 60_000);
  if (minutes < 1) return "adesso";
  if (minutes < 60) return `${minutes} min fa`;
  return d.toLocaleString("it-IT", { timeZone: "Europe/Rome", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
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
        subtitle="Configurazione caricata da config/configurazione.json. Per modificarla aggiorna il file e reimportalo dalle Impostazioni."
      />
      <Flash ok={param(sp, "ok")} errore={param(sp, "errore")} />
      <div className="grid gap-5 xl:grid-cols-2">
        {apts.map((apt) => {
          const contract = allContracts.find((c) => c.apartmentId === apt.id);
          const archive = sent.filter((s) => s.apartmentId === apt.id);
          return (
            <Card
              key={apt.id}
              title={
                <span>
                  {apt.name} <span className="font-normal text-slate-500">· {apt.code}</span>
                </span>
              }
            >
              <dl className="grid grid-cols-[9rem_1fr] gap-x-3 gap-y-2 text-sm">
                <dt className="text-slate-500">Orari</dt>
                <dd>
                  check-out {apt.checkoutTime} · check-in {apt.checkinTime} · {apt.defaultLinenSets} set standard · max {apt.maxGuests} ospiti
                </dd>
                <dt className="text-slate-500">Calendari</dt>
                <dd className="space-y-1">
                  {feeds
                    .filter((f) => f.apartmentId === apt.id)
                    .map((f) => (
                      <div key={f.id} className="flex flex-wrap items-center gap-2">
                        <Pill tone={f.lastStatus === "ok" ? "green" : f.lastStatus ? "red" : "slate"}>{f.channel}</Pill>
                        <span className="text-xs text-slate-500">
                          letto {since(f.lastSyncAt)}
                          {f.lastEventCount !== null ? ` · ${f.lastEventCount} eventi` : ""}
                        </span>
                        {f.lastError ? <span className="text-xs text-red-700">{f.lastError}</span> : null}
                      </div>
                    ))}
                </dd>
                <dt className="text-slate-500">Proprietari</dt>
                <dd>
                  {shares
                    .filter((s) => s.apartmentId === apt.id)
                    .map((s) => `${s.name} (${formatBps(s.shareBps)})`)
                    .join(", ")}
                </dd>
                <dt className="text-slate-500">Addette</dt>
                <dd>
                  {team
                    .filter((t) => t.apartmentId === apt.id)
                    .map((t) => {
                      const pl = lists.find((l) => l.apartmentId === apt.id && l.cleanerId === t.cleanerId);
                      return (
                        <div key={t.cleanerId}>
                          {t.name} <span className="text-xs text-slate-500">({t.role})</span>
                          {pl ? (
                            <span className="text-xs text-slate-500">
                              {" "}
                              · base {formatEuro(pl.baseCents)}, +{formatEuro(pl.extraGuestCents)} oltre {pl.guestThreshold} ospiti, set{" "}
                              {formatEuro(pl.linenSetCents)}
                              {pl.holidayMode === "percentuale"
                                ? `, festivi +${formatBps(pl.holidayValue)}`
                                : pl.holidayMode === "fissa"
                                  ? `, festivi +${formatEuro(pl.holidayValue)}`
                                  : ""}
                            </span>
                          ) : (
                            <span className="text-xs text-red-700"> · senza listino</span>
                          )}
                        </div>
                      );
                    })}
                </dd>
                <dt className="text-slate-500">Contratto</dt>
                <dd>
                  {contract ? describeContract(contract.params).slice(0, 1).concat(describeContract(contract.params).slice(2)).join(" · ") : "nessuno"}
                </dd>
                <dt className="text-slate-500">Rendiconti inviati</dt>
                <dd className="flex flex-wrap gap-2">
                  {archive.length === 0 ? <span className="text-slate-400">nessuno</span> : null}
                  {archive.map((s) => (
                    <Link key={s.id} className="text-brand underline" href={`/rendiconti/${s.id}`}>
                      {formatPeriod(s.period)}
                      {s.version > 1 ? ` v${s.version}` : ""}
                    </Link>
                  ))}
                </dd>
              </dl>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
