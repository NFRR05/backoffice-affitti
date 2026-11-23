import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { cleaningJobs, whatsappMessages } from "@/db/schema";
import { requireTenant } from "@/services/common";
import { env } from "@/lib/env";
import { Back, Card, Empty, Flash, PageHeader, Pill, StatusBadge, param, type SearchParams } from "@/components/ui";
import { simulateIncomingAction } from "@/app/actions";

const KIND_LABEL: Record<string, string> = {
  nuova: "Nuova pulizia",
  modifica: "Modifica",
  annullata: "Annullata",
  promemoria: "Promemoria",
  richiesta_ospiti: "Domanda ospiti",
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
        title="Messaggi WhatsApp"
        subtitle={
          simulated
            ? "Modalità simulata: nessun messaggio parte davvero. Tocca i pulsanti per simulare le risposte."
            : "Messaggi inviati con la WhatsApp Cloud API di Meta."
        }
      />
      <Flash ok={param(sp, "ok")} errore={param(sp, "errore")} />

      <Card title="Simula un messaggio in arrivo" className="mb-6">
        <form action={simulateIncomingAction} className="flex flex-wrap items-end gap-3">
          <Back to="/messaggi" />
          <label className="flex flex-col gap-1">
            <span className="label">Da (numero)</span>
            <input className="input" name="phone" defaultValue={tenant.managerWhatsapp} />
          </label>
          <label className="flex min-w-64 flex-1 flex-col gap-1">
            <span className="label">Testo</span>
            <input className="input" name="text" placeholder='es. "4821 3", "fatto", "non posso"' />
          </label>
          <button className="btn">Simula</button>
        </form>
        <p className="mt-2 text-xs text-slate-500">
          Dal numero del gestore: risposta sugli ospiti. Dal numero di un&apos;addetta: &quot;confermo&quot;, &quot;non posso&quot;, &quot;fatto&quot;.
        </p>
      </Card>

      {rows.length === 0 ? (
        <Card>
          <Empty>Nessun messaggio ancora.</Empty>
        </Card>
      ) : null}

      <ul className="space-y-3">
        {rows.map(({ m, jobStatus }) => {
          const incoming = m.direction === "in";
          const askGuests = m.kind === "richiesta_ospiti" && simulated;
          const ref = m.body.match(/"(\d{4}) \d+"/)?.[1] ?? "";
          return (
            <li key={m.id} className={`flex ${incoming ? "justify-start" : "justify-end"}`}>
              <div
                className={`w-full max-w-xl rounded-lg border px-4 py-3 text-sm shadow-xs ${
                  incoming ? "border-slate-200 bg-white" : "border-emerald-200 bg-emerald-50"
                }`}
              >
                <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span>{incoming ? "Da" : "A"}</span>
                  <span className="font-medium text-slate-700">{m.contactName ?? `+${m.phone}`}</span>
                  <Pill>{KIND_LABEL[m.kind] ?? m.kind}</Pill>
                  {m.status === "errore" ? <Pill tone="red">errore: {m.error}</Pill> : null}
                  {m.status === "simulato" ? <Pill tone="amber">simulato</Pill> : null}
                  <span className="ml-auto">{timeLabel(m.createdAt)}</span>
                </div>
                <p className="whitespace-pre-line text-slate-800">{m.body}</p>
                {incoming && m.note ? <p className="mt-1 text-xs text-slate-500">Esito: {m.note}</p> : null}
                {!incoming && m.buttons.length > 0 ? (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {m.buttons.map((b) =>
                      simulated ? (
                        <form key={b.id} action={simulateIncomingAction}>
                          <Back to="/messaggi" />
                          <input type="hidden" name="phone" value={m.phone} />
                          <input type="hidden" name="payload" value={b.id} />
                          <button className="btn btn-sm" title="Simula la risposta con questo pulsante">
                            {b.label}
                          </button>
                        </form>
                      ) : (
                        <span key={b.id} className="btn btn-sm pointer-events-none">
                          {b.label}
                        </span>
                      ),
                    )}
                    {jobStatus ? (
                      <span className="ml-auto flex items-center gap-1 text-xs text-slate-500">
                        stato attuale <StatusBadge status={jobStatus} />
                      </span>
                    ) : null}
                  </div>
                ) : null}
                {askGuests ? (
                  <form action={simulateIncomingAction} className="mt-2 flex gap-2">
                    <Back to="/messaggi" />
                    <input type="hidden" name="phone" value={m.phone} />
                    <input className="input w-36 py-0.5" name="text" defaultValue={ref ? `${ref} ` : ""} placeholder={`${ref || "4821"} 3`} />
                    <button className="btn btn-sm">Rispondi</button>
                  </form>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
