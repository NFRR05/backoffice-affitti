import Link from "next/link";
import { and, asc, desc, eq } from "drizzle-orm";
import { ChevronLeft, ChevronRight, Euro, Handshake, Receipt } from "lucide-react";
import { getDb } from "@/db/client";
import { apartments, statements } from "@/db/schema";
import { requireTenant } from "@/services/common";
import { formatPeriod, nextPeriod, periodOf, previousPeriod, todayRome } from "@/lib/dates";
import { formatEuro } from "@/lib/money";
import { Back, Card, Empty, Flash, PageHeader, Pill, Stat, param, type SearchParams } from "@/components/ui";
import { draftAction } from "@/app/actions";

const STATUS_TONE = { bozza: "amber", verificato: "brand", inviato: "green" } as const;

export default async function RendicontiPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const db = await getDb();
  const tenant = await requireTenant(db);
  const today = todayRome();
  // Nei primi 10 giorni del mese si lavora di solito sul mese precedente.
  const defaultPeriod = Number(today.slice(8)) <= 10 ? previousPeriod(periodOf(today)) : periodOf(today);
  const period = param(sp, "mese") ?? defaultPeriod;
  const here = `/rendiconti?mese=${period}`;

  const apts = await db.select().from(apartments).where(eq(apartments.tenantId, tenant.id)).orderBy(asc(apartments.code));
  const rows = await db
    .select()
    .from(statements)
    .where(and(eq(statements.tenantId, tenant.id), eq(statements.period, period)))
    .orderBy(desc(statements.version));
  const latest = new Map<string, (typeof rows)[number]>();
  for (const r of rows) if (!latest.has(r.apartmentId)) latest.set(r.apartmentId, r);

  const totalPayout = [...latest.values()].reduce((s, r) => s + r.result.totals.ownerPayoutCents, 0);
  const totalCommission = [...latest.values()].reduce((s, r) => s + r.result.totals.commissionCents, 0);
  const sentCount = [...latest.values()].filter((r) => r.status === "inviato").length;

  return (
    <div>
      <PageHeader
        title="Rendiconti"
        subtitle={formatPeriod(period)}
        actions={
          <>
            <Link className="btn btn-sm" href={`/rendiconti?mese=${previousPeriod(period)}`}>
              <ChevronLeft className="size-4" aria-hidden />
              Mese prima
            </Link>
            <Link className="btn btn-sm" href={`/rendiconti?mese=${nextPeriod(period)}`}>
              Mese dopo
              <ChevronRight className="size-4" aria-hidden />
            </Link>
          </>
        }
      />
      <Flash ok={param(sp, "ok")} errore={param(sp, "errore")} />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Con rendiconto" value={`${latest.size} / ${apts.length}`} icon={Receipt} />
        <Stat label="Inviati ai proprietari" value={`${sentCount} / ${apts.length}`} icon={Handshake} />
        <Stat label="Tua commissione" value={formatEuro(totalCommission)} icon={Euro} />
        <Stat label="Totale ai proprietari" value={formatEuro(totalPayout)} icon={Euro} />
      </div>

      <Card title="Appartamenti" className="mb-3">
        {apts.length === 0 ? <Empty icon={Receipt}>Nessun appartamento configurato.</Empty> : null}
        {apts.length > 0 ? (
          <ul className="-mx-5 -my-5 divide-y divide-slate-100">
            {apts.map((apt) => {
              const st = latest.get(apt.id);
              return (
                <li key={apt.id} className="grid gap-4 px-5 py-4 md:grid-cols-[minmax(0,1.2fr)_minmax(0,2fr)_auto] md:items-center md:gap-6">
                  <div className="min-w-0 space-y-1.5">
                    <div className="font-semibold text-slate-900">{apt.name}</div>
                    <div className="text-xs text-slate-500">{apt.code}</div>
                    {st ? (
                      <div className="flex flex-wrap items-center gap-1">
                        <Pill tone={STATUS_TONE[st.status]}>{st.status}</Pill>
                        {st.version > 1 ? <Pill>v{st.version}</Pill> : null}
                        {st.result.warnings.length > 0 ? <Pill tone="amber">{st.result.warnings.length} avvisi</Pill> : null}
                      </div>
                    ) : (
                      <span className="text-xs text-slate-400">rendiconto non generato</span>
                    )}
                  </div>

                  <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm sm:grid-cols-4">
                    <div>
                      <dt className="text-xs text-slate-500">Incassi netti</dt>
                      <dd className="tabular-nums">{st ? formatEuro(st.result.totals.netCents) : "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-500">Pulizie</dt>
                      <dd className="tabular-nums">{st ? formatEuro(st.result.totals.cleaningCostsCents) : "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-500">Tua commissione</dt>
                      <dd className="tabular-nums">{st ? formatEuro(st.result.totals.commissionCents) : "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium text-slate-700">Al proprietario</dt>
                      <dd className="font-semibold tabular-nums">{st ? formatEuro(st.result.totals.ownerPayoutCents) : "—"}</dd>
                    </div>
                  </dl>

                  <div className="flex flex-wrap gap-1.5 md:justify-end">
                    {st ? (
                      <Link className="btn btn-sm" href={`/rendiconti/${st.id}`}>
                        Apri
                      </Link>
                    ) : null}
                    {!st || st.status === "bozza" ? (
                      <form action={draftAction}>
                        <Back to={here} />
                        <input type="hidden" name="apartmentId" value={apt.id} />
                        <input type="hidden" name="period" value={period} />
                        <input type="hidden" name="open" value="1" />
                        <button className={`btn btn-sm ${st ? "" : "btn-primary"}`}>{st ? "Ricalcola" : "Genera bozza"}</button>
                      </form>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : null}
      </Card>
      <p className="mt-3 px-1 text-xs leading-5 text-slate-500">
        Flusso: bozza (ricalcolabile) → verificato (dati congelati) → inviato (PDF archiviato e spedito). Un rendiconto inviato si corregge solo
        con una rettifica, che crea una nuova versione.
      </p>
    </div>
  );
}
