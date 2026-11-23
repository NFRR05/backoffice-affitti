import Link from "next/link";
import { and, asc, eq, gte, lte } from "drizzle-orm";
import { getDb } from "@/db/client";
import { apartmentCleaners, apartments, cleaners, cleaningJobs } from "@/db/schema";
import { requireTenant } from "@/services/common";
import { addDays, formatShort, todayRome } from "@/lib/dates";
import { formatEuro } from "@/lib/money";
import { guestsLabel, windowLabel } from "@/domain/cleaning";
import { Back, Card, Empty, Flash, PageHeader, Pill, StatusBadge, param, type SearchParams } from "@/components/ui";
import { jobAction, jobExtraAction, reassignAction } from "@/app/actions";

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
      <PageHeader title="Pulizie" subtitle={`Dal ${formatShort(from)} al ${formatShort(to)}`} />
      <Flash ok={param(sp, "ok")} errore={param(sp, "errore")} />

      <form className="mb-5 flex flex-wrap items-end gap-3" method="get">
        <label className="flex flex-col gap-1">
          <span className="label">Dal</span>
          <input className="input" type="date" name="dal" defaultValue={from} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="label">Al</span>
          <input className="input" type="date" name="al" defaultValue={to} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="label">Stato</span>
          <select className="input" name="stato" defaultValue={statusFilter}>
            <option value="">Tutti</option>
            <option value="creato">Creato</option>
            <option value="inviato">Inviato</option>
            <option value="confermato">Confermato</option>
            <option value="escalation">Escalation</option>
            <option value="completato">Completato</option>
            <option value="annullato">Annullato</option>
          </select>
        </label>
        <button className="btn">Filtra</button>
        <Link className="btn" href={`/pulizie?dal=${addDays(today, -30)}&al=${today}&stato=completato`}>
          Completate ultimi 30 giorni
        </Link>
      </form>

      {filtered.length === 0 ? (
        <Card>
          <Empty>Nessuna pulizia nel periodo.</Empty>
        </Card>
      ) : null}

      <div className="space-y-5">
        {[...byDate.entries()].map(([date, items]) => (
          <Card key={date} title={`${formatShort(date)}${date === today ? " · oggi" : ""}`}>
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>Appartamento</th>
                    <th>Orario</th>
                    <th>Ospiti esc./entr.</th>
                    <th>Biancheria</th>
                    <th>Addetta</th>
                    <th>Stato</th>
                    <th>Costo</th>
                    <th>Azioni</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map(({ job, apt, cleanerName }) => {
                    const options = assignments.filter((a) => a.apartmentId === apt.id);
                    const others = allCleaners.filter((c) => !options.some((o) => o.cleanerId === c.id));
                    const open = !["completato", "annullato"].includes(job.status);
                    return (
                      <tr key={job.id} id={job.id} className={job.status === "annullato" ? "opacity-60" : ""}>
                        <td>
                          <div className="font-medium">{apt.name}</div>
                          <div className="text-xs text-slate-500">{apt.code}</div>
                        </td>
                        <td className="whitespace-nowrap">
                          {windowLabel(job)}
                          {job.sameDay ? (
                            <div className="mt-1">
                              <Pill tone="brand">Cambio in giornata</Pill>
                            </div>
                          ) : job.nextCheckin ? (
                            <div className="text-xs text-slate-500">prossimo arrivo {formatShort(job.nextCheckin)}</div>
                          ) : null}
                        </td>
                        <td className="tabular-nums">
                          {guestsLabel(job.guestsOut)} / {guestsLabel(job.guestsIn)}
                        </td>
                        <td className="tabular-nums">{job.linenSets} set</td>
                        <td>
                          <div>{cleanerName ?? <span className="text-red-700">non assegnata</span>}</div>
                          {open ? (
                            <form action={reassignAction} className="mt-1 flex gap-1">
                              <Back to={here} />
                              <input type="hidden" name="jobId" value={job.id} />
                              <select className="input py-0.5 text-xs" name="cleanerId" defaultValue="">
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
                        </td>
                        <td>
                          <StatusBadge status={job.status} />
                        </td>
                        <td className="whitespace-nowrap tabular-nums">
                          {job.costCents !== null ? (
                            <span title={job.costBreakdown?.lines.map((l) => `${l.label}: ${formatEuro(l.cents)}`).join("\n")}>
                              {formatEuro(job.costCents)}
                            </span>
                          ) : job.status === "completato" ? (
                            <span className="text-red-700">manca listino</span>
                          ) : (
                            "—"
                          )}
                          {job.extraCents ? <div className="text-xs text-slate-500">extra {formatEuro(job.extraCents)}</div> : null}
                        </td>
                        <td>
                          <div className="flex flex-wrap gap-1">
                            {job.status === "creato" && job.cleanerId ? <ActionButton job={job.id} action="send" label="Invia ora" here={here} /> : null}
                            {["inviato", "escalation"].includes(job.status) ? (
                              <ActionButton job={job.id} action="confirm" label="Segna confermata" here={here} />
                            ) : null}
                            {open && job.status !== "creato" ? <ActionButton job={job.id} action="done" label="Segna fatta" here={here} /> : null}
                          </div>
                          {job.status !== "annullato" ? (
                            <details className="mt-1">
                              <summary className="cursor-pointer text-xs text-slate-500">Extra</summary>
                              <form action={jobExtraAction} className="mt-1 flex flex-wrap gap-1">
                                <Back to={here} />
                                <input type="hidden" name="jobId" value={job.id} />
                                <input className="input w-20 py-0.5 text-xs" name="extra" placeholder="€" defaultValue={job.extraCents ? (job.extraCents / 100).toFixed(2).replace(".", ",") : ""} />
                                <input className="input w-36 py-0.5 text-xs" name="extraNote" placeholder="motivo" defaultValue={job.extraNote ?? ""} />
                                <button className="btn btn-sm">Salva</button>
                              </form>
                            </details>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function ActionButton({ job, action, label, here }: { job: string; action: string; label: string; here: string }) {
  return (
    <form action={jobAction}>
      <Back to={here} />
      <input type="hidden" name="jobId" value={job} />
      <input type="hidden" name="action" value={action} />
      <button className="btn btn-sm">{label}</button>
    </form>
  );
}
