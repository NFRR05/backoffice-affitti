import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { cleaningJobs, whatsappMessages } from "@/db/schema";
import { requireTenant } from "@/services/common";
import { env } from "@/lib/env";
import { Back, CleaningStatusText, Empty, Field, Flash, PageHeader, Section, param, type SearchParams } from "@/components/ui";
import { simulateIncomingAction } from "@/app/actions";

const KIND_LABEL: Record<string, string> = {
  nuova: "Nuova pulizia",
  modifica: "Modifica",
  annullata: "Annullata",
  promemoria: "Promemoria",
  richiesta_ospiti: "Domanda sugli ospiti",
  avviso_gestore: "Avviso",
  risposta: "Risposta",
};

function timeLabel(d: Date) {
  return d.toLocaleString("it-IT", { timeZone: "Europe/Rome", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default async function MessaggiPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const db = await getDb();
  const tenant = await requireTenant(db);
  const rows = await db
    .select({ m: whatsappMessages, jobStatus: cleaningJobs.status })
    .from(whatsappMessages)
    .leftJoin(cleaningJobs, eq(cleaningJobs.id, whatsappMessages.cleaningJobId))
    .where(eq(whatsappMessages.tenantId, tenant.id))
    .orderBy(desc(whatsappMessages.createdAt))
    .limit(150);
  const simulated = !env.whatsapp.enabled;

  return (
    <div>
      <PageHeader
        title="Messaggi"
        description={
          simulated
            ? "WhatsApp è in modalità prova: nessun messaggio parte davvero. Usa i pulsanti sotto ogni messaggio per simulare la risposta."
            : "Messaggi inviati e ricevuti con WhatsApp."
        }
      />
      <Flash ok={param(sp, "ok")} errore={param(sp, "errore")} />

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <section aria-label="Conversazioni" className="order-2 lg:order-1">
          {rows.length === 0 ? (
            <div className="card">
              <Empty>Nessun messaggio ancora.</Empty>
            </div>
          ) : null}

          <ul className="space-y-3">
            {rows.map(({ m, jobStatus }) => {
              const incoming = m.direction === "in";
              const askGuests = m.kind === "richiesta_ospiti" && simulated;
              const ref = m.body.match(/"(\d{4}) \d+"/)?.[1] ?? "";
              return (
                <li key={m.id} className={`flex ${incoming ? "justify-start" : "justify-end"}`}>
                  <article className={`w-full max-w-xl rounded-xl px-4 py-3.5 ${incoming ? "border border-line bg-surface" : "bg-ok-soft"}`}>
                    <header className="flex flex-wrap items-baseline justify-between gap-x-4">
                      <h3 className="text-sm font-medium text-ink">
                        {incoming ? "Da" : "A"} {m.contactName ?? `+${m.phone}`}
                      </h3>
                      <time className="text-[12px] text-muted tabular-nums">{timeLabel(m.createdAt)}</time>
                    </header>
                    <div className="text-[13px] text-muted">{KIND_LABEL[m.kind] ?? m.kind}</div>

                    <p className="mt-2 text-sm leading-6 whitespace-pre-line text-ink-soft">{m.body}</p>

                    {m.status === "errore" ? <p className="mt-2 text-[13px] font-medium text-bad">Non inviato: {m.error}</p> : null}
                    {incoming && m.note ? <p className="mt-2 text-[13px] text-muted">Esito: {m.note}</p> : null}

                    {!incoming && m.buttons.length > 0 ? (
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        {simulated ? (
                          m.buttons.map((b) => (
                            <form key={b.id} action={simulateIncomingAction}>
                              <Back to="/messaggi" />
                              <input type="hidden" name="phone" value={m.phone} />
                              <input type="hidden" name="payload" value={b.id} />
                              <button className="btn btn-sm" title="Simula la risposta con questo pulsante">
                                {b.label}
                              </button>
                            </form>
                          ))
                        ) : (
                          <span className="text-[13px] text-muted">Pulsanti: {m.buttons.map((b) => b.label).join(", ")}</span>
                        )}
                        {jobStatus ? (
                          <span className="ml-auto text-[13px] text-muted">
                            Ora: <CleaningStatusText status={jobStatus} small />
                          </span>
                        ) : null}
                      </div>
                    ) : null}

                    {askGuests ? (
                      <form action={simulateIncomingAction} className="mt-3 flex gap-2">
                        <Back to="/messaggi" />
                        <input type="hidden" name="phone" value={m.phone} />
                        <label className="sr-only" htmlFor={`risposta-${m.id}`}>
                          Risposta con codice e numero di ospiti
                        </label>
                        <input
                          id={`risposta-${m.id}`}
                          className="input h-9 w-36 text-sm md:h-8"
                          name="text"
                          defaultValue={ref ? `${ref} ` : ""}
                          placeholder={`${ref || "4821"} 3`}
                        />
                        <button className="btn btn-sm">Rispondi</button>
                      </form>
                    ) : null}
                  </article>
                </li>
              );
            })}
          </ul>
        </section>

        <aside className="order-1 lg:sticky lg:top-10 lg:order-2">
          <Section title="Simula un messaggio in arrivo">
            <form action={simulateIncomingAction} className="space-y-4">
              <Back to="/messaggi" />
              <Field label="Numero del mittente">
                <input className="input w-full" name="phone" inputMode="tel" defaultValue={tenant.managerWhatsapp} />
              </Field>
              <Field label="Testo">
                <input className="input w-full" name="text" placeholder='Per esempio "4821 3" o "fatto"' />
              </Field>
              <button className="btn w-full">Simula</button>
            </form>
            <p className="mt-4 text-[13px] leading-5 text-muted">
              Dal numero del gestore si risponde sugli ospiti, per esempio &quot;4821 3&quot;. Dal numero di un&apos;addetta: &quot;confermo&quot;,
              &quot;non posso&quot; o &quot;fatto&quot;.
            </p>
          </Section>
        </aside>
      </div>
    </div>
  );
}
