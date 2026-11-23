import Link from "next/link";
import { and, asc, desc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { apartments, statements } from "@/db/schema";
import { requireTenant } from "@/services/common";
import { formatPeriod, nextPeriod, periodOf, previousPeriod, todayRome } from "@/lib/dates";
import { formatEuro } from "@/lib/money";
import { Back, Card, Flash, PageHeader, Pill, param, type SearchParams } from "@/components/ui";
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

  return (
    <div>
      <PageHeader
        title="Rendiconti"
        subtitle={formatPeriod(period)}
        actions={
          <>
            <Link className="btn btn-sm" href={`/rendiconti?mese=${previousPeriod(period)}`}>
              Mese prima
            </Link>
            <Link className="btn btn-sm" href={`/rendiconti?mese=${nextPeriod(period)}`}>
              Mese dopo
            </Link>
          </>
        }
      />
      <Flash ok={param(sp, "ok")} errore={param(sp, "errore")} />

      <Card title={`Appartamenti · ${latest.size} di ${apts.length} con rendiconto`}>
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Appartamento</th>
                <th>Stato</th>
                <th className="text-right">Incassi netti</th>
                <th className="text-right">Pulizie</th>
                <th className="text-right">Tua commissione</th>
                <th className="text-right">Al proprietario</th>
                <th>Azioni</th>
              </tr>
            </thead>
            <tbody>
              {apts.map((apt) => {
                const st = latest.get(apt.id);
                return (
                  <tr key={apt.id}>
                    <td>
                      <div className="font-medium">{apt.name}</div>
                      <div className="text-xs text-slate-500">{apt.code}</div>
                    </td>
                    <td>
                      {st ? (
                        <div className="flex items-center gap-1">
                          <Pill tone={STATUS_TONE[st.status]}>{st.status}</Pill>
                          {st.version > 1 ? <Pill>v{st.version}</Pill> : null}
                          {st.result.warnings.length > 0 ? <Pill tone="amber">{st.result.warnings.length} avvisi</Pill> : null}
                        </div>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="text-right tabular-nums">{st ? formatEuro(st.result.totals.netCents) : ""}</td>
                    <td className="text-right tabular-nums">{st ? formatEuro(st.result.totals.cleaningCostsCents) : ""}</td>
                    <td className="text-right tabular-nums">{st ? formatEuro(st.result.totals.commissionCents) : ""}</td>
                    <td className="text-right font-semibold tabular-nums">{st ? formatEuro(st.result.totals.ownerPayoutCents) : ""}</td>
                    <td>
                      <div className="flex flex-wrap gap-1">
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
                            <button className="btn btn-sm btn-primary">{st ? "Ricalcola" : "Genera bozza"}</button>
                          </form>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {latest.size > 0 ? (
              <tfoot>
                <tr>
                  <td className="px-3 py-2 font-semibold" colSpan={4}>
                    Totale del mese
                  </td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums">{formatEuro(totalCommission)}</td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums">{formatEuro(totalPayout)}</td>
                  <td />
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
      </Card>
      <p className="mt-3 text-xs text-slate-500">
        Flusso: bozza (ricalcolabile) → verificato (dati congelati) → inviato (PDF archiviato e spedito). Un rendiconto inviato si corregge
        solo con una rettifica, che crea una nuova versione.
      </p>
    </div>
  );
}
