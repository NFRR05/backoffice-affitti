import { desc, eq } from "drizzle-orm";
import { dbMode, getDb } from "@/db/client";
import { activityLog } from "@/db/schema";
import { getTenant, settingsOf } from "@/services/common";
import { env } from "@/lib/env";
import { Back, Card, Flash, PageHeader, param, type SearchParams } from "@/components/ui";
import { importConfigAction, loadDemoAction, syncNowAction } from "@/app/actions";

export default async function ImpostazioniPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const db = await getDb();
  const tenant = await getTenant(db);
  const settings = tenant ? settingsOf(tenant) : null;
  const log = tenant
    ? await db.select().from(activityLog).where(eq(activityLog.tenantId, tenant.id)).orderBy(desc(activityLog.createdAt)).limit(25)
    : [];

  return (
    <div className="max-w-4xl">
      <PageHeader title="Impostazioni" />
      <Flash ok={param(sp, "ok")} errore={param(sp, "errore")} />

      <div className="grid gap-6 md:grid-cols-2">
        <Card title="Stato del sistema">
          <dl className="grid grid-cols-[8rem_1fr] gap-y-2 text-sm">
            <dt className="text-slate-500">Database</dt>
            <dd>{dbMode() === "locale" ? "locale, cartella data/pglite" : "PostgreSQL (DATABASE_URL)"}</dd>
            <dt className="text-slate-500">WhatsApp</dt>
            <dd>{env.whatsapp.enabled ? "Cloud API di Meta attiva" : "simulato (nessun invio reale)"}</dd>
            <dt className="text-slate-500">Email</dt>
            <dd>{env.smtp.enabled ? `SMTP ${env.smtp.host}` : "simulate (il PDF viene comunque archiviato)"}</dd>
            {tenant && settings ? (
              <>
                <dt className="text-slate-500">Gestore</dt>
                <dd>
                  {tenant.managerName} · +{tenant.managerWhatsapp}
                </dd>
                <dt className="text-slate-500">Regole</dt>
                <dd>
                  escalation dopo {settings.escalationHours} h · promemoria alle {settings.reminderTime} · attesa ospiti{" "}
                  {settings.guestsQuestionTimeoutHours} h · calendari ogni {settings.syncIntervalMinutes} min
                </dd>
              </>
            ) : null}
          </dl>
          <form action={syncNowAction} className="mt-4">
            <Back to="/impostazioni" />
            <button className="btn">Sincronizza ora</button>
          </form>
        </Card>

        <Card title="Configurazione">
          <p className="mb-3 text-sm text-slate-600">
            Legge <code>config/configurazione.json</code> (parti da <code>configurazione.example.json</code>) e aggiorna appartamenti,
            calendari, proprietari, addette, listini e contratti. Prenotazioni e pulizie restano.
          </p>
          <form action={importConfigAction}>
            <Back to="/impostazioni" />
            <button className="btn btn-primary">Importa configurazione</button>
          </form>

          <div className="mt-6 border-t border-slate-200 pt-4">
            <p className="mb-2 text-sm text-slate-600">
              <strong>Dati demo:</strong> 8 appartamenti inventati con calendari finti in <code>data/demo-ical</code>.{" "}
              <span className="text-red-700">Cancella tutti i dati presenti.</span>
            </p>
            <form action={loadDemoAction} className="flex flex-wrap items-center gap-3">
              <Back to="/" />
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="conferma" value="si" /> Ho capito, cancella tutto
              </label>
              <button className="btn btn-danger">Carica dati demo</button>
            </form>
          </div>
        </Card>
      </div>

      {log.length > 0 ? (
        <Card title="Attività recenti" className="mt-6">
          <ul className="divide-y divide-slate-100 text-sm">
            {log.map((l) => (
              <li key={l.id} className="flex flex-wrap gap-x-3 py-1.5">
                <span className="w-32 text-slate-500 tabular-nums">
                  {l.createdAt.toLocaleString("it-IT", { timeZone: "Europe/Rome", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                </span>
                <span className="w-24 text-slate-500">{l.actor.startsWith("whatsapp:") ? "WhatsApp" : l.actor}</span>
                <span>{l.action.replaceAll("_", " ")}</span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
