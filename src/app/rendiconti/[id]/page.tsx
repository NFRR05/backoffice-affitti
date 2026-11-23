import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, desc, eq, gte, lte } from "drizzle-orm";
import { getDb } from "@/db/client";
import { apartments, expenses, statements } from "@/db/schema";
import { formatDate, formatPeriod, periodBounds } from "@/lib/dates";
import { formatBps, formatEuro } from "@/lib/money";
import { describeContract } from "@/domain/statement";
import { Back, Card, Flash, PageHeader, Pill, param, type SearchParams } from "@/components/ui";
import { deleteExpenseAction, draftAction, expenseAction, statementAction } from "@/app/actions";

const STATUS_TONE = { bozza: "amber", verificato: "brand", inviato: "green" } as const;

export default async function RendicontoPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SearchParams }) {
  const { id } = await params;
  const sp = await searchParams;
  const db = await getDb();
  const [st] = await db.select().from(statements).where(eq(statements.id, id));
  if (!st) notFound();
  const [apt] = await db.select().from(apartments).where(eq(apartments.id, st.apartmentId));
  const r = st.result;
  const here = `/rendiconti/${st.id}`;
  const { first, last } = periodBounds(st.period);
  const monthExpenses = await db
    .select()
    .from(expenses)
    .where(and(eq(expenses.apartmentId, apt.id), gte(expenses.date, first), lte(expenses.date, last)))
    .orderBy(asc(expenses.date));
  const versions = await db
    .select()
    .from(statements)
    .where(and(eq(statements.apartmentId, apt.id), eq(statements.period, st.period)))
    .orderBy(desc(statements.version));
  const p = st.contractParams;

  return (
    <div className="max-w-5xl">
      <PageHeader
        title={`${apt.name} · ${formatPeriod(st.period)}`}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <Pill tone={STATUS_TONE[st.status]}>{st.status}</Pill>
            {st.version > 1 ? <Pill>versione {st.version} (rettifica)</Pill> : null}
            {st.sentAt ? <span>inviato a {st.sentTo}</span> : null}
          </span>
        }
        actions={
          <>
            <Link className="btn" href={`/rendiconti?mese=${st.period}`}>
              Tutti i rendiconti
            </Link>
            <a className="btn" href={`/rendiconti/${st.id}/pdf`} target="_blank" rel="noreferrer">
              {st.status === "inviato" ? "Scarica PDF" : "Anteprima PDF"}
            </a>
          </>
        }
      />
      <Flash ok={param(sp, "ok")} errore={param(sp, "errore")} />

      {st.correctionNote ? (
        <div className="mb-5 rounded-md border border-slate-200 bg-white px-4 py-3 text-sm">Motivo della rettifica: {st.correctionNote}</div>
      ) : null}

      {r.warnings.length > 0 ? (
        <div className="mb-5 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <div className="mb-1 font-semibold">Da controllare</div>
          <ul className="list-disc space-y-0.5 pl-5">
            {r.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-5">
        <Card title="Riepilogo" className="lg:col-span-3">
          <table className="w-full text-sm">
            <tbody>
              {r.summary.map((line, i) => (
                <tr
                  key={i}
                  className={
                    line.kind === "totale"
                      ? "border-t-2 border-brand bg-brand-soft font-semibold"
                      : line.kind === "subtotale"
                        ? "border-t border-slate-300 font-semibold"
                        : line.kind === "info"
                          ? "text-slate-500"
                          : ""
                  }
                >
                  <td className="px-2 py-1.5">{line.label}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{formatEuro(line.cents)}</td>
                </tr>
              ))}
              {r.ownerSplit.length > 1
                ? r.ownerSplit.map((o) => (
                    <tr key={o.ownerId} className="text-slate-600">
                      <td className="px-2 py-1 pl-6">
                        di cui a {o.name} ({formatBps(o.shareBps)})
                      </td>
                      <td className="px-2 py-1 text-right tabular-nums">{formatEuro(o.amountCents)}</td>
                    </tr>
                  ))
                : null}
            </tbody>
          </table>
          <p className="mt-3 text-xs text-slate-500">
            Da fatturare: imponibile {formatEuro(r.totals.commissionCents)}
            {p.vatRateBps > 0 ? ` + IVA ${formatEuro(r.totals.vatCents)}` : " (senza IVA)"} = {formatEuro(r.totals.managerInvoiceCents)}.
          </p>
        </Card>

        <Card title="Azioni" className="lg:col-span-2">
          <div className="space-y-3 text-sm">
            {st.status === "bozza" ? (
              <>
                <form action={draftAction}>
                  <Back to={here} />
                  <input type="hidden" name="apartmentId" value={apt.id} />
                  <input type="hidden" name="period" value={st.period} />
                  <button className="btn w-full">Ricalcola con i dati attuali</button>
                </form>
                <StatementButton id={st.id} action="verify" label="Verifica e congela i dati" primary here={here} />
              </>
            ) : null}
            {st.status === "verificato" ? (
              <>
                <StatementButton id={st.id} action="send" label="Genera e invia ai proprietari" primary here={here} />
                <StatementButton id={st.id} action="reopen" label="Riporta in bozza" here={here} />
              </>
            ) : null}
            {st.status === "inviato" && versions[0]?.id === st.id ? (
              <form action={statementAction} className="space-y-2">
                <Back to={here} />
                <input type="hidden" name="statementId" value={st.id} />
                <input type="hidden" name="action" value="correct" />
                <label className="flex flex-col gap-1">
                  <span className="label">Motivo della rettifica</span>
                  <input className="input" name="note" placeholder="es. aggiunta spesa idraulico" />
                </label>
                <button className="btn w-full">Crea rettifica</button>
              </form>
            ) : null}
            <div className="border-t border-slate-200 pt-3 text-xs leading-5 text-slate-600">
              <div className="mb-1 font-semibold text-slate-700">Contratto applicato</div>
              {describeContract(p).map((line) => (
                <div key={line}>{line}</div>
              ))}
            </div>
            {versions.length > 1 ? (
              <div className="border-t border-slate-200 pt-3 text-xs">
                <div className="mb-1 font-semibold text-slate-700">Versioni</div>
                {versions.map((v) => (
                  <div key={v.id}>
                    <Link className={v.id === st.id ? "font-semibold" : "text-brand underline"} href={`/rendiconti/${v.id}`}>
                      v{v.version} · {v.status}
                    </Link>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </Card>
      </div>

      <Card title={`Prenotazioni (${r.reservationLines.length})`} className="mt-6">
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Prenotazione</th>
                <th className="text-right">Notti</th>
                <th className="text-right">Lordo</th>
                <th className="text-right">Comm. portale</th>
                <th className="text-right">Netto</th>
                <th className="text-right">Quota pulizie</th>
              </tr>
            </thead>
            <tbody>
              {r.reservationLines.map((l) => (
                <tr key={l.id}>
                  <td>{l.label}</td>
                  <td className="text-right tabular-nums">{l.nightsInPeriod === l.nights ? l.nights : `${l.nightsInPeriod}/${l.nights}`}</td>
                  <td className="text-right tabular-nums">{formatEuro(l.grossCents)}</td>
                  <td className="text-right tabular-nums">{formatEuro(-l.otaCommissionCents)}</td>
                  <td className="text-right tabular-nums">{formatEuro(l.netCents)}</td>
                  <td className="text-right tabular-nums">{formatEuro(l.guestCleaningFeeCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card title={`Pulizie (${r.cleanings.length})`}>
          <table className="table">
            <tbody>
              {r.cleanings.map((c) => (
                <tr key={c.id}>
                  <td>{formatDate(c.date)}</td>
                  <td className="text-right tabular-nums">{formatEuro(c.costCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card title="Spese aggiuntive">
          <table className="table">
            <tbody>
              {monthExpenses.map((e) => (
                <tr key={e.id}>
                  <td>{formatDate(e.date)}</td>
                  <td>{e.description}</td>
                  <td className="text-right tabular-nums">{formatEuro(e.amountCents)}</td>
                  <td className="text-right">
                    {st.status === "bozza" ? (
                      <form action={deleteExpenseAction}>
                        <Back to={here} />
                        <input type="hidden" name="expenseId" value={e.id} />
                        <button className="btn btn-sm btn-danger">Elimina</button>
                      </form>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {st.status === "bozza" ? (
            <form action={expenseAction} className="mt-3 grid grid-cols-2 gap-2">
              <Back to={here} />
              <input type="hidden" name="apartmentId" value={apt.id} />
              <input type="hidden" name="statementId" value={st.id} />
              <input className="input" type="date" name="date" defaultValue={first} min={first} max={last} required />
              <input className="input" name="amount" placeholder="Importo €" required />
              <input className="input col-span-2" name="description" placeholder="Descrizione" required />
              <button className="btn btn-sm col-span-2">Aggiungi spesa</button>
            </form>
          ) : (
            <p className="mt-2 text-xs text-slate-500">Le spese si modificano solo in bozza.</p>
          )}
        </Card>
      </div>
    </div>
  );
}

function StatementButton({ id, action, label, primary, here }: { id: string; action: string; label: string; primary?: boolean; here: string }) {
  return (
    <form action={statementAction}>
      <Back to={here} />
      <input type="hidden" name="statementId" value={id} />
      <input type="hidden" name="action" value={action} />
      <button className={`btn w-full ${primary ? "btn-primary" : ""}`}>{label}</button>
    </form>
  );
}
