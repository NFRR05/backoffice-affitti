import Link from "next/link";
import { and, asc, desc, eq } from "drizzle-orm";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { getDb } from "@/db/client";
import { apartments, statements } from "@/db/schema";
import { requireTenant } from "@/services/common";
import { formatPeriod, nextPeriod, periodOf, previousPeriod, todayRome } from "@/lib/dates";
import { formatEuro } from "@/lib/money";
import { Back, Empty, Flash, Metric, PageHeader, Section, StatementStatusText, param, plural, type SearchParams } from "@/components/ui";
import { draftAction } from "@/app/actions";

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
  const title = formatPeriod(period);

  return (
    <div>
      <PageHeader
        title={`Rendiconti di ${title}`}
        description="Uno per appartamento. Si genera la bozza, si verifica, poi si invia ai proprietari con il PDF."
        actions={
          <>
            <Link className="btn btn-sm" href={`/rendiconti?mese=${previousPeriod(period)}`}>
              <ChevronLeft className="size-4" aria-hidden />
              Mese precedente
            </Link>
            <Link className="btn btn-sm" href={`/rendiconti?mese=${nextPeriod(period)}`}>
              Mese successivo
              <ChevronRight className="size-4" aria-hidden />
            </Link>
          </>
        }
      />
      <Flash ok={param(sp, "ok")} errore={param(sp, "errore")} />

      <div className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric label="Generati" value={`${latest.size} di ${apts.length}`} />
        <Metric label="Inviati ai proprietari" value={`${sentCount} di ${apts.length}`} />
        <Metric label="Tua commissione" value={formatEuro(totalCommission)} />
        <Metric label="Totale ai proprietari" value={formatEuro(totalPayout)} />
      </div>

      <Section title="Appartamenti" flush>
        {apts.length === 0 ? <Empty>Nessun appartamento configurato.</Empty> : null}
        <ul className="divide-y divide-line">
          {apts.map((apt) => {
            const st = latest.get(apt.id);
            return (
              <li key={apt.id} className="grid gap-4 px-5 py-4 md:grid-cols-[minmax(0,1.2fr)_minmax(0,2fr)_auto] md:items-center md:gap-8">
                <div className="min-w-0">
                  <div className="text-[15px] font-medium text-ink">{apt.name}</div>
                  <div className="mt-0.5 text-[13px] text-muted">
                    {st ? (
                      <>
                        <StatementStatusText status={st.status} small />
                        {st.version > 1 ? `, versione ${st.version}` : ""}
                        {st.result.warnings.length > 0 ? (
                          <span className="text-warn">, {plural(st.result.warnings.length, "avviso", "avvisi")} da controllare</span>
                        ) : null}
                      </>
                    ) : (
                      "Non ancora generato"
                    )}
                  </div>
                </div>

                {st ? (
                  <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
                    <Amount label="Incassi netti" cents={st.result.totals.netCents} />
                    <Amount label="Pulizie" cents={st.result.totals.cleaningCostsCents} />
                    <Amount label="Tua commissione" cents={st.result.totals.commissionCents} />
                    <Amount label="Al proprietario" cents={st.result.totals.ownerPayoutCents} strong />
                  </dl>
                ) : (
                  <div className="hidden md:block" />
                )}

                <div className="flex flex-wrap gap-2 md:justify-end">
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
                      <button className={`btn btn-sm ${st ? "" : "btn-primary"}`}>{st ? "Ricalcola" : "Genera la bozza"}</button>
                    </form>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      </Section>

      <p className="mt-4 max-w-2xl text-[13px] leading-5 text-muted">
        La bozza si può ricalcolare quando vuoi. Una volta verificato i dati sono congelati. Un rendiconto inviato si corregge solo con una
        rettifica, che crea una nuova versione.
      </p>
    </div>
  );
}

function Amount({ label, cents, strong }: { label: string; cents: number; strong?: boolean }) {
  return (
    <div>
      <dt className="text-[13px] text-muted">{label}</dt>
      <dd className={`text-sm tabular-nums ${strong ? "font-semibold text-ink" : "text-ink-soft"}`}>{formatEuro(cents)}</dd>
    </div>
  );
}
