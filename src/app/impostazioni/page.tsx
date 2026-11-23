import { desc, eq } from "drizzle-orm";
import type { ReactNode } from "react";
import { dbMode, getDb } from "@/db/client";
import { activityLog } from "@/db/schema";
import { getTenant, settingsOf } from "@/services/common";
import { env } from "@/lib/env";
import { Back, Flash, PageHeader, Section, param, type SearchParams } from "@/components/ui";
import { importConfigAction, loadDemoAction, syncNowAction } from "@/app/actions";

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-[13px] font-medium text-ink-soft sm:pt-px">{label}</dt>
      <dd className="mb-4 text-sm text-ink sm:mb-0">{children}</dd>
    </>
  );
}

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
      <PageHeader title="Impostazioni" description="Stato dei servizi, configurazione e dati di prova." />
      <Flash ok={param(sp, "ok")} errore={param(sp, "errore")} />

      <div className="space-y-6">
        <Section
          title="Stato del sistema"
          actions={
            <form action={syncNowAction}>
              <Back to="/impostazioni" />
              <button className="btn btn-sm">Sincronizza i calendari</button>
            </form>
          }
        >
          <dl className="grid gap-x-6 gap-y-1 sm:grid-cols-[9rem_1fr] sm:gap-y-4">
            <Row label="Database">{dbMode() === "locale" ? "Locale, nella cartella data/pglite" : "PostgreSQL (DATABASE_URL)"}</Row>
            <Row label="WhatsApp">{env.whatsapp.enabled ? "Attivo con la Cloud API di Meta" : "Simulato, nessun messaggio parte davvero"}</Row>
            <Row label="Email">{env.smtp.enabled ? `SMTP su ${env.smtp.host}` : "Simulata, il PDF viene comunque archiviato"}</Row>
            {tenant && settings ? (
              <>
                <Row label="Gestore">
                  {tenant.managerName}, +{tenant.managerWhatsapp}
                </Row>
                <Row label="Regole">
                  <ul className="space-y-1">
                    <li>Riassegnazione dopo {settings.escalationHours} ore senza risposta</li>
                    <li>Promemoria alle {settings.reminderTime} del giorno prima</li>
                    <li>Attesa della risposta sugli ospiti: {settings.guestsQuestionTimeoutHours} ore</li>
                    <li>Calendari letti ogni {settings.syncIntervalMinutes} minuti</li>
                  </ul>
                </Row>
              </>
            ) : null}
          </dl>
        </Section>

        <Section title="Configurazione" description="Aggiorna appartamenti, calendari, proprietari, addette, listini e contratti. Prenotazioni e pulizie restano.">
          <p className="text-sm leading-6 text-muted">
            Legge il file <code className="text-ink">config/configurazione.json</code>. Per crearlo parti da{" "}
            <code className="text-ink">configurazione.example.json</code>.
          </p>
          <form action={importConfigAction} className="mt-5">
            <Back to="/impostazioni" />
            <button className="btn btn-primary">Importa la configurazione</button>
          </form>
        </Section>

        <Section title="Dati demo" description="Otto appartamenti inventati, con calendari finti nella cartella data/demo-ical.">
          <p className="text-sm font-medium text-bad">Caricare la demo cancella tutti i dati presenti.</p>
          <form action={loadDemoAction} className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center">
            <Back to="/" />
            <label className="flex items-center gap-2.5 text-sm text-ink">
              <input type="checkbox" name="conferma" value="si" className="size-4 accent-ink" />
              Ho capito, cancella tutto
            </label>
            <button className="btn btn-danger">Carica i dati demo</button>
          </form>
        </Section>

        {log.length > 0 ? (
          <Section title="Attività recenti" description="Le ultime 25 operazioni." flush>
            <ul className="divide-y divide-line">
              {log.map((l) => {
                const action = l.action.replaceAll("_", " ");
                return (
                  <li key={l.id} className="grid gap-0.5 px-5 py-3 text-sm sm:grid-cols-[7.5rem_7rem_1fr] sm:gap-4">
                    <span className="text-muted tabular-nums">
                      {l.createdAt.toLocaleString("it-IT", {
                        timeZone: "Europe/Rome",
                        day: "2-digit",
                        month: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    <span className="text-muted">{l.actor.startsWith("whatsapp:") ? "WhatsApp" : l.actor}</span>
                    <span className="text-ink">{action.charAt(0).toUpperCase() + action.slice(1)}</span>
                  </li>
                );
              })}
            </ul>
          </Section>
        ) : null}
      </div>
    </div>
  );
}
