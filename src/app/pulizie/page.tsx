import Link from "next/link";
import { and, asc, eq, gte, lte } from "drizzle-orm";
import { ChevronDown, Clock, Sparkles, UserRound, Users } from "lucide-react";
import { getDb } from "@/db/client";
import { apartmentCleaners, apartments, cleaners, cleaningJobs } from "@/db/schema";
import { requireTenant } from "@/services/common";
import { addDays, formatShort, todayRome } from "@/lib/dates";
import { formatEuro } from "@/lib/money";
import { guestsLabel, windowLabel } from "@/domain/cleaning";
import { Back, Card, Empty, Flash, PageHeader, Pill, StatusBadge, param, type SearchParams } from "@/components/ui";
import { jobAction, jobExtraAction, reassignAction } from "@/app/actions";

const QUICK_LINK = "inline-flex min-h-9 items-center rounded-full border border-slate-200 bg-slate-50 px-3 text-xs font-medium text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-100 md:min-h-8";

export default async function PuliziePage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const db = await getDb();
  const tenant = await requireTenant(db);
  const today = todayRome();
  const from = param(sp, "dal") ?? today;
  const to = param(sp, "al") ?? addDays(from, 14);
  const statusFilter = param(sp, "stato") ?? "";
  const here = `/pulizie?dal=${from}&al=${to}${statusFilter ? `&stato=${statusFilter}` : ""}`;

  const rows = await db
    .select({ job: cleaningJobs, apt: apartments, cleanerName: cleaners.name })
    .from(cleaningJobs)
    .innerJoin(apartments, eq(apartments.id, cleaningJobs.apartmentId))
    .leftJoin(cleaners, eq(cleaners.id, cleaningJobs.cleanerId))
    .where(and(eq(cleaningJobs.tenantId, tenant.id), gte(cleaningJobs.date, from), lte(cleaningJobs.date, to)))
    .orderBy(asc(cleaningJobs.date), asc(apartments.code));
  const filtered = statusFilter ? rows.filter((r) => r.job.status === statusFilter) : rows;

  const assignments = await db
    .select({ apartmentId: apartmentCleaners.apartmentId, cleanerId: cleaners.id, name: cleaners.name, role: apartmentCleaners.role })
    .from(apartmentCleaners)
    .innerJoin(cleaners, eq(cleaners.id, apartmentCleaners.cleanerId))
    .where(eq(apartmentCleaners.tenantId, tenant.id));
  const allCleaners = await db.select().from(cleaners).where(eq(cleaners.tenantId, tenant.id)).orderBy(asc(cleaners.name));

  const byDate = new Map<string, typeof filtered>();
  for (const r of filtered) byDate.set(r.job.date, [...(byDate.get(r.job.date) ?? []), r]);

  return (
    <div>
      <PageHeader
        title="Pulizie"
        subtitle={`Dal ${formatShort(from)} al ${formatShort(to)} · ${filtered.length} ${filtered.length === 1 ? "intervento" : "interventi"}`}
      />
      <Flash ok={param(sp, "ok")} errore={param(sp, "errore")} />

      <form className="card mb-6 p-4" method="get">
        <div className="grid grid-cols-2 gap-3 md:flex md:flex-wrap md:items-end">
          <label className="flex flex-col gap-1.5">
            <span className="label">Dal</span>
            <input className="input" type="date" name="dal" defaultValue={from} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="label">Al</span>
            <input className="input" type="date" name="al" defaultValue={to} />
          </label>
          <label className="col-span-2 flex flex-col gap-1.5 md:col-span-1">
            <span className="label">Stato</span>
            <select className="input md:min-w-44" name="stato" defaultValue={statusFilter}>
              <option value="">Tutti</option>
              <option value="creato">Creato</option>
              <option value="inviato">Inviato</option>
              <option value="confermato">Confermato</option>
              <option value="escalation">Escalation</option>
              <option value="completato">Completato</option>
              <option value="annullato">Annullato</option>
            </select>
          </label>
          <div className="col-span-2 md:col-span-1">
            <button className="btn btn-primary w-full md:w-auto">Mostra</button>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
          <Link className={QUICK_LINK} href={`/pulizie?dal=${today}&al=${today}`}>
            Oggi
          </Link>
          <Link className={QUICK_LINK} href={`/pulizie?dal=${today}&al=${addDays(today, 14)}`}>
            Prossimi 14 giorni
          </Link>
          <Link className={QUICK_LINK} href={`/pulizie?dal=${addDays(today, -30)}&al=${today}&stato=completato`}>
            Completate ultimi 30 giorni
          </Link>
        </div>
      </form>

      {filtered.length === 0 ? (
        <Card>
          <Empty icon={Sparkles}>Nessuna pulizia nel periodo selezionato.</Empty>
        </Card>
      ) : null}

      <div className="space-y-5">
        {[...byDate.entries()].map(([date, items]) => (
          <section key={date} className="card" aria-labelledby={`giorno-${date}`}>
            <header className="flex items-center justify-between gap-3 border-b border-slate-200/80 px-5 py-3.5">
              <h2 id={`giorno-${date}`} className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-900">
                {formatShort(date)}
                {date === today ? <Pill tone="brand">Oggi</Pill> : null}
              </h2>
              <span className="text-xs text-slate-500">
                {items.length} {items.length === 1 ? "intervento" : "interventi"}
              </span>
            </header>

            <ul className="divide-y divide-slate-100">
              {items.map(({ job, apt, cleanerName }) => {
                const options = assignments.filter((a) => a.apartmentId === apt.id);
                const others = allCleaners.filter((c) => !options.some((o) => o.cleanerId === c.id));
                const open = !["completato", "annullato"].includes(job.status);
                return (
                  <li
                    key={job.id}
                    id={job.id}
                    className={`grid scroll-mt-24 gap-4 px-5 py-4 md:grid-cols-[minmax(0,1.25fr)_minmax(0,0.9fr)_minmax(0,1.25fr)_minmax(0,1.4fr)] md:items-start md:gap-6 ${
                      job.status === "annullato" ? "opacity-60" : ""
                    }`}
                  >
                    {/* Appartamento e orario */}
                    <div className="min-w-0 space-y-1.5">
                      <div className="font-semibold text-slate-900">
                        {apt.name} <span className="text-xs font-normal text-slate-500">{apt.code}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-sm text-slate-700">
                        <Clock className="size-3.5 shrink-0 text-slate-400" aria-hidden />
                        {windowLabel(job)}
                      </div>
                      {job.sameDay ? (
                        <Pill tone="brand">Cambio in giornata</Pill>
                      ) : job.nextCheckin ? (
                        <div className="text-xs text-slate-500">prossimo arrivo {formatShort(job.nextCheckin)}</div>
                      ) : null}
                    </div>

                    {/* Ospiti e biancheria */}
                    <div className="space-y-1 text-sm">
                      <div className="flex items-center gap-1.5 text-slate-700 tabular-nums">
                        <Users className="size-3.5 shrink-0 text-slate-400" aria-hidden />
                        {guestsLabel(job.guestsOut)} / {guestsLabel(job.guestsIn)}
                      </div>
                      <div className="text-xs text-slate-500 tabular-nums">{job.linenSets} set di biancheria</div>
                    </div>

                    {/* Addetta */}
                    <div className="min-w-0 space-y-2 text-sm">
                      <div className="flex items-center gap-1.5">
                        <UserRound className="size-3.5 shrink-0 text-slate-400" aria-hidden />
                        {cleanerName ? <span className="truncate">{cleanerName}</span> : <span className="font-medium text-red-700">Non assegnata</span>}
                      </div>
                      {open ? (
                        <form action={reassignAction} className="flex gap-1.5">
                          <Back to={here} />
                          <input type="hidden" name="jobId" value={job.id} />
                          <label className="sr-only" htmlFor={`riassegna-${job.id}`}>
                            Riassegna a
                          </label>
                          <select id={`riassegna-${job.id}`} className="input min-h-9 min-w-0 flex-1 py-1 text-sm" name="cleanerId" defaultValue="">
                            <option value="" disabled>
                              Riassegna a…
                            </option>
                            {options
                              .filter((o) => o.cleanerId !== job.cleanerId)
                              .map((o) => (
                                <option key={o.cleanerId} value={o.cleanerId}>
                                  {o.name} ({o.role})
                                </option>
                              ))}
                            {others.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name}
                              </option>
                            ))}
                          </select>
                          <button className="btn btn-sm">Riassegna</button>
                        </form>
                      ) : null}
                    </div>

                    {/* Stato, costo e azioni */}
                    <div className="space-y-2.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge status={job.status} />
                        <span className="text-sm tabular-nums text-slate-700">
                          {job.costCents !== null ? (
                            <span title={job.costBreakdown?.lines.map((l) => `${l.label}: ${formatEuro(l.cents)}`).join("\n")}>
                              {formatEuro(job.costCents)}
                            </span>
                          ) : job.status === "completato" ? (
                            <span className="text-red-700">manca listino</span>
                          ) : null}
                          {job.extraCents ? <span className="ml-1 text-xs text-slate-500">+ extra {formatEuro(job.extraCents)}</span> : null}
                        </span>
                      </div>

                      {open ? (
                        <div className="flex flex-wrap gap-1.5">
                          {job.status === "creato" && job.cleanerId ? (
                            <ActionButton job={job.id} action="send" label="Invia ora" here={here} primary />
                          ) : null}
                          {["inviato", "escalation"].includes(job.status) ? (
                            <ActionButton job={job.id} action="confirm" label="Segna confermata" here={here} />
                          ) : null}
                          {job.status !== "creato" ? (
                            <ActionButton job={job.id} action="done" label="Segna fatta" here={here} primary />
                          ) : null}
                        </div>
                      ) : null}

                      {job.status !== "annullato" ? (
                        <details className="group">
                          <summary className="inline-flex cursor-pointer items-center gap-1 rounded text-xs font-medium text-slate-500 hover:text-slate-800">
                            Extra e note
                            <ChevronDown className="size-3.5 transition-transform group-open:rotate-180" aria-hidden />
                          </summary>
                          <form action={jobExtraAction} className="mt-2 flex flex-wrap gap-1.5">
                            <Back to={here} />
                            <input type="hidden" name="jobId" value={job.id} />
                            <label className="sr-only" htmlFor={`extra-${job.id}`}>
                              Importo extra in euro
                            </label>
                            <input
                              id={`extra-${job.id}`}
                              className="input min-h-9 w-24 text-sm"
                              name="extra"
                              placeholder="€"
                              defaultValue={job.extraCents ? (job.extraCents / 100).toFixed(2).replace(".", ",") : ""}
                            />
                            <label className="sr-only" htmlFor={`motivo-${job.id}`}>
                              Motivo dell&apos;extra
                            </label>
                            <input
                              id={`motivo-${job.id}`}
                              className="input min-h-9 min-w-0 flex-1 text-sm"
                              name="extraNote"
                              placeholder="motivo"
                              defaultValue={job.extraNote ?? ""}
                            />
                            <button className="btn btn-sm">Salva</button>
                          </form>
                        </details>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}

function ActionButton({ job, action, label, here, primary }: { job: string; action: string; label: string; here: string; primary?: boolean }) {
  return (
    <form action={jobAction}>
      <Back to={here} />
      <input type="hidden" name="jobId" value={job} />
      <input type="hidden" name="action" value={action} />
      <button className={`btn btn-sm ${primary ? "btn-primary" : ""}`}>{label}</button>
    </form>
  );
}
