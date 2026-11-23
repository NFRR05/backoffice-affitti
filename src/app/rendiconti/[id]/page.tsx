import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, desc, eq, gte, lte } from "drizzle-orm";
import { ArrowLeft, Download } from "lucide-react";
import { getDb } from "@/db/client";
import { apartments, expenses, statements } from "@/db/schema";
import { formatDate, formatPeriod, periodBounds } from "@/lib/dates";
import { formatBps, formatEuro } from "@/lib/money";
import { describeContract } from "@/domain/statement";
import { Back, Empty, Field, Flash, PageHeader, Section, StatementSteps, param, plural, type SearchParams } from "@/components/ui";
import { deleteExpenseAction, draftAction, expenseAction, statementAction } from "@/app/actions";

const STATUS_WORD = { bozza: "bozza", verificato: "verificato", inviato: "inviato" } as const;

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
  const isDraft = st.status === "bozza";

  return (
    <div>
      <Link
        className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-muted transition-colors hover:text-ink"
        href={`/rendiconti?mese=${st.period}`}
      >
        <ArrowLeft className="size-4" aria-hidden />
        Rendiconti di {formatPeriod(st.period)}
      </Link>

      <PageHeader
        title={apt.name}
        description={
          <>
            Rendiconto di {formatPeriod(st.period)}
            {st.version > 1 ? `, versione ${st.version} (rettifica)` : ""}.{st.sentAt ? ` Inviato a ${st.sentTo}.` : ""}
          </>
        }
        actions={
          <a className="btn" href={`/rendiconti/${st.id}/pdf`} target="_blank" rel="noreferrer">
            <Download className="size-4" aria-hidden />
            {st.status === "inviato" ? "Scarica il PDF" : "Anteprima del PDF"}
          </a>
        }
      />
      <Flash ok={param(sp, "ok")} errore={param(sp, "errore")} />

      <StatementSteps status={st.status} />

      {st.correctionNote ? (
        <div className="mb-6 rounded-lg bg-hover px-4 py-3 text-sm text-ink-soft">Motivo della rettifica: {st.correctionNote}</div>
      ) : null}

      {r.warnings.length > 0 ? (
        <div className="mb-6 rounded-lg bg-warn-soft px-4 py-3 text-sm text-warn">
          <div className="font-semibold">{isDraft ? "Da controllare prima della verifica" : "Avvisi emersi nel calcolo"}</div>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {r.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-5">
        <Section title="Riepilogo" className="lg:col-span-3">
          <table className="w-full text-sm">
            <tbody>
              {r.summary.map((line, i) => {
                const rule = line.kind === "totale" ? "border-t border-ink pt-3" : line.kind === "subtotale" ? "border-t border-line pt-2.5" : "";
                const tone =
                  line.kind === "totale"
                    ? "text-base font-semibold text-ink"
                    : line.kind === "subtotale"
                      ? "font-medium text-ink"
                      : line.kind === "info"
                        ? "text-muted"
                        : "text-ink-soft";
                return (
                  <tr key={i} className={tone}>
                    <td className={`py-2 pr-4 ${rule}`}>{line.label}</td>
                    <td className={`py-2 text-right whitespace-nowrap tabular-nums ${rule}`}>{formatEuro(line.cents)}</td>
                  </tr>
                );
              })}
              {r.ownerSplit.length > 1
                ? r.ownerSplit.map((o) => (
                    <tr key={o.ownerId} className="text-muted">
                      <td className="py-1.5 pr-4 pl-4">
                        Di cui a {o.name} ({formatBps(o.shareBps)})
                      </td>
                      <td className="py-1.5 text-right whitespace-nowrap tabular-nums">{formatEuro(o.amountCents)}</td>
                    </tr>
                  ))
                : null}
            </tbody>
          </table>
          <p className="mt-5 text-[13px] leading-5 text-muted">
            Da fatturare: imponibile {formatEuro(r.totals.commissionCents)}
            {p.vatRateBps > 0 ? ` più IVA ${formatEuro(r.totals.vatCents)}` : ", senza IVA"}, totale {formatEuro(r.totals.managerInvoiceCents)}.
          </p>
        </Section>

        <Section title="Azioni" description={`Stato attuale: ${STATUS_WORD[st.status]}.`} className="lg:col-span-2">
          <div className="space-y-2">
            {isDraft ? (
              <>
                <StatementButton id={st.id} action="verify" label="Verifica e congela i dati" primary here={here} />
                <form action={draftAction}>
                  <Back to={here} />
                  <input type="hidden" name="apartmentId" value={apt.id} />
                  <input type="hidden" name="period" value={st.period} />
                  <button className="btn w-full">Ricalcola con i dati attuali</button>
                </form>
              </>
            ) : null}
            {st.status === "verificato" ? (
              <>
                <StatementButton id={st.id} action="send" label="Genera il PDF e invia ai proprietari" primary here={here} />
                <StatementButton id={st.id} action="reopen" label="Riporta in bozza" here={here} />
              </>
            ) : null}
            {st.status === "inviato" && versions[0]?.id === st.id ? (
              <form action={statementAction} className="space-y-3">
                <Back to={here} />
                <input type="hidden" name="statementId" value={st.id} />
                <input type="hidden" name="action" value="correct" />
                <Field label="Motivo della rettifica">
                  <input className="input w-full" name="note" placeholder="Per esempio: aggiunta spesa idraulico" />
                </Field>
                <button className="btn w-full">Crea una rettifica</button>
              </form>
            ) : null}
            {st.status === "inviato" && versions[0]?.id !== st.id ? (
              <p className="text-sm text-muted">Questa versione è stata sostituita da una rettifica.</p>
            ) : null}
          </div>

          <div className="mt-8">
            <h3 className="text-sm font-semibold text-ink">Contratto applicato</h3>
            <ul className="mt-2 space-y-1 text-[13px] leading-5 text-muted">
              {describeContract(p).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>

          {versions.length > 1 ? (
            <div className="mt-8">
              <h3 className="text-sm font-semibold text-ink">Versioni</h3>
              <ul className="mt-2 space-y-1 text-sm">
                {versions.map((v) => (
                  <li key={v.id}>
                    {v.id === st.id ? (
                      <span className="font-medium text-ink">
                        Versione {v.version}, {STATUS_WORD[v.status]} (questa)
                      </span>
                    ) : (
                      <Link className="link" href={`/rendiconti/${v.id}`}>
                        Versione {v.version}, {STATUS_WORD[v.status]}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </Section>
      </div>

      <Section title="Prenotazioni del mese" description={plural(r.reservationLines.length, "prenotazione", "prenotazioni")} flush className="mt-6">
        {r.reservationLines.length === 0 ? (
          <Empty>Nessuna prenotazione nel mese.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="table min-w-[40rem]">
              <thead>
                <tr>
                  <th className="pl-5">Prenotazione</th>
                  <th className="text-right">Notti</th>
                  <th className="text-right">Lordo</th>
                  <th className="text-right">Commissione portale</th>
                  <th className="text-right">Netto</th>
                  <th className="pr-5 text-right">Quota pulizie</th>
                </tr>
              </thead>
              <tbody>
                {r.reservationLines.map((l) => (
                  <tr key={l.id}>
                    <td className="pl-5 text-ink">{l.label}</td>
                    <td className="text-right tabular-nums">{l.nightsInPeriod === l.nights ? l.nights : `${l.nightsInPeriod} di ${l.nights}`}</td>
                    <td className="text-right tabular-nums">{formatEuro(l.grossCents)}</td>
                    <td className="text-right tabular-nums">{formatEuro(-l.otaCommissionCents)}</td>
                    <td className="text-right tabular-nums">{formatEuro(l.netCents)}</td>
                    <td className="pr-5 text-right tabular-nums">{formatEuro(l.guestCleaningFeeCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Section title="Pulizie" description={plural(r.cleanings.length, "intervento", "interventi")} flush>
          {r.cleanings.length === 0 ? (
            <Empty>Nessuna pulizia nel mese.</Empty>
          ) : (
            <table className="table">
              <tbody>
                {r.cleanings.map((c) => (
                  <tr key={c.id}>
                    <td className="pl-5 text-ink tabular-nums">{formatDate(c.date)}</td>
                    <td className="pr-5 text-right tabular-nums">{formatEuro(c.costCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>

        <Section
          title="Spese aggiuntive"
          description={isDraft ? "Si possono aggiungere o togliere finché il rendiconto è in bozza." : "Si modificano solo in bozza."}
          flush
        >
          {monthExpenses.length === 0 ? (
            <Empty>Nessuna spesa aggiuntiva.</Empty>
          ) : (
            <table className="table">
              <tbody>
                {monthExpenses.map((e) => (
                  <tr key={e.id}>
                    <td className="pl-5 whitespace-nowrap text-muted tabular-nums">{formatDate(e.date)}</td>
                    <td className="text-ink">{e.description}</td>
                    <td className="text-right whitespace-nowrap tabular-nums">{formatEuro(e.amountCents)}</td>
                    <td className="pr-5 text-right">
                      {isDraft ? (
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
          )}
          {isDraft ? (
            <form action={expenseAction} className="grid grid-cols-2 gap-3 border-t border-line p-5">
              <Back to={here} />
              <input type="hidden" name="apartmentId" value={apt.id} />
              <input type="hidden" name="statementId" value={st.id} />
              <Field label="Data">
                <input className="input w-full" type="date" name="date" defaultValue={first} min={first} max={last} required />
              </Field>
              <Field label="Importo (€)">
                <input className="input w-full" name="amount" inputMode="decimal" required />
              </Field>
              <Field label="Descrizione" className="col-span-2">
                <input className="input w-full" name="description" required />
              </Field>
              <div className="col-span-2">
                <button className="btn">Aggiungi la spesa</button>
              </div>
            </form>
          ) : null}
        </Section>
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
