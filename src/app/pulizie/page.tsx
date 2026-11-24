import Link from "next/link";
import { and, asc, eq, gte, lte } from "drizzle-orm";
import { ChevronDown } from "lucide-react";
import { getDb } from "@/db/client";
import { apartmentCleaners, apartments, cleaners, cleaningJobs } from "@/db/schema";
import { requireTenant } from "@/services/common";
import { addDays, formatShort, todayRome } from "@/lib/dates";
import { formatEuro } from "@/lib/money";
import { guestsLabel, windowLabel } from "@/domain/cleaning";
import {
  Back,
  CLEANING_STATUS_ORDER,
  CleaningStatusText,
  Empty,
  Field,
  Flash,
  PageHeader,
  Segmented,
  cleaningStatusLabel,
  dayLabel,
  param,
  plural,
  type SearchParams,
} from "@/components/ui";
import { jobAction, jobExtraAction, reassignAction } from "@/app/actions";

export default async function PuliziePage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const db = await getDb();
  const tenant = await requireTenant(db);
  const today = todayRome();
  const from = param(sp, "dal") ?? today;
  const to = param(sp, "al") ?? addDays(from, 14);
  const statusFilter = param(sp, "stato") ?? "";
  const knownStatus = CLEANING_STATUS_ORDER.find((s) => s === statusFilter);
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

  const presets = [
    { label: "Oggi", dal: today, al: today, stato: "" },
    { label: "Prossimi 14 giorni", dal: today, al: addDays(today, 14), stato: "" },
    { label: "Fatte (30 giorni)", dal: addDays(today, -30), al: today, stato: "completato" },
  ];

  return (
    <div>
      <PageHeader
        title="Pulizie"
        description={`Dal ${formatShort(from)} al ${formatShort(to)}: ${plural(filtered.length, "intervento", "interventi")}${
          knownStatus ? `, solo "${cleaningStatusLabel(knownStatus).toLowerCase()}"` : ""
        }.`}
      />
      <Flash ok={param(sp, "ok")} errore={param(sp, "errore")} />

      <div className="mb-8 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <Segmented
          label="Periodo"
          items={presets.map((p) => ({
            label: p.label,
            href: `/pulizie?dal=${p.dal}&al=${p.al}${p.stato ? `&stato=${p.stato}` : ""}`,
            active: from === p.dal && to === p.al && statusFilter === p.stato,
          }))}
        />
        <form method="get" className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:items-end">
          <Field label="Dal">
            <input className="input" type="date" name="dal" defaultValue={from} />
          </Field>
          <Field label="Al">
            <input className="input" type="date" name="al" defaultValue={to} />
          </Field>
          <Field label="Stato" className="col-span-2 sm:col-span-1">
            <select className="input sm:w-56" name="stato" defaultValue={statusFilter}>
              <option value="">Tutti gli stati</option>
              {CLEANING_STATUS_ORDER.map((s) => (
                <option key={s} value={s}>
                  {cleaningStatusLabel(s)}
                </option>
              ))}
            </select>
          </Field>
          <button className="btn col-span-2 sm:col-span-1">Mostra</button>
        </form>
      </div>

      {filtered.length === 0 ? (
        <div className="card">
          <Empty
            action={
              <Link className="btn" href="/pulizie">
                Vedi i prossimi 14 giorni
              </Link>
            }
          >
            Nessuna pulizia in questo periodo.
          </Empty>
        </div>
      ) : null}

      <div className="space-y-10">
        {[...byDate.entries()].map(([date, items]) => (
          <section key={date} aria-labelledby={`giorno-${date}`}>
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <h2 id={`giorno-${date}`} className="text-base font-semibold text-ink">
                {dayLabel(date, today)}
              </h2>
              <span className="text-[13px] text-muted">{plural(items.length, "intervento", "interventi")}</span>
            </div>

            <ul className="card divide-y divide-line">
              {items.map(({ job, apt, cleanerName }) => {
                const options = assignments.filter((a) => a.apartmentId === apt.id);
                const others = allCleaners.filter((c) => !options.some((o) => o.cleanerId === c.id));
                const open = !["completato", "annullato"].includes(job.status);
                const breakdown = job.costBreakdown?.lines.map((l) => `${l.label}: ${formatEuro(l.cents)}`).join("\n");
                return (
                  <li
                    key={job.id}
                    id={job.id}
                    className={`grid scroll-mt-28 gap-4 px-5 py-5 md:grid-cols-[minmax(0,1.3fr)_minmax(0,0.9fr)_minmax(0,1.2fr)_minmax(0,1.3fr)] md:gap-6 ${
                      job.status === "annullato" ? "opacity-60" : ""
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="text-[15px] font-medium text-ink">
                        {apt.name}
                        <span className="ml-2 rounded border border-line bg-paper px-1.5 py-px font-mono text-[11px] font-normal text-muted">{apt.code}</span>
                      </div>
                      <div className="mt-1 text-sm text-ink-soft tabular-nums">{windowLabel(job)}</div>
                      {job.sameDay ? (
                        <div className="mt-0.5 text-[13px] font-medium text-ink">Cambio in giornata</div>
                      ) : job.nextCheckin ? (
                        <div className="mt-0.5 text-[13px] text-muted">Prossimo arrivo {formatShort(job.nextCheckin)}</div>
                      ) : null}
                    </div>

                    <dl className="grid grid-cols-[auto_1fr] content-start gap-x-3 gap-y-1 text-[13px]">
                      <dt className="text-muted">Ospiti in uscita</dt>
                      <dd className="text-ink tabular-nums">{guestsLabel(job.guestsOut)}</dd>
                      <dt className="text-muted">Ospiti in arrivo</dt>
                      <dd className="text-ink tabular-nums">{guestsLabel(job.guestsIn)}</dd>
                      <dt className="text-muted">Biancheria</dt>
                      <dd className="text-ink tabular-nums">{job.linenSets} set</dd>
                    </dl>

                    <div className="min-w-0 space-y-2">
                      <div className="text-sm">
                        {cleanerName ? <span className="text-ink">{cleanerName}</span> : <span className="font-medium text-bad">Nessuna addetta</span>}
                      </div>
                      {open ? (
                        <form action={reassignAction} className="flex gap-2">
                          <Back to={here} />
                          <input type="hidden" name="jobId" value={job.id} />
                          <label className="sr-only" htmlFor={`riassegna-${job.id}`}>
                            Riassegna a
                          </label>
                          <select id={`riassegna-${job.id}`} className="input h-9 min-w-0 flex-1 text-sm md:h-8" name="cleanerId" defaultValue="">
                            <option value="" disabled>
                              Scegli un&apos;addetta
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

                    <div className="space-y-3">
                      <div>
                        <CleaningStatusText status={job.status} />
                        <div className="mt-0.5 text-[13px] text-muted tabular-nums">
                          {job.costCents !== null ? (
                            <span title={breakdown}>
                              Costo {formatEuro(job.costCents)}
                              {job.extraCents ? `, extra ${formatEuro(job.extraCents)}` : ""}
                            </span>
                          ) : job.status === "completato" ? (
                            <span className="text-bad">Manca il listino dell&apos;addetta</span>
                          ) : job.extraCents ? (
                            `Extra ${formatEuro(job.extraCents)}`
                          ) : null}
                        </div>
                      </div>

                      {open ? (
                        <div className="flex flex-wrap gap-2">
                          {job.status === "creato" && job.cleanerId ? (
                            <ActionButton job={job.id} action="send" label="Invia ora" here={here} primary />
                          ) : null}
                          {["inviato", "escalation"].includes(job.status) ? (
                            <ActionButton job={job.id} action="confirm" label="Segna confermata" here={here} />
                          ) : null}
                          {job.status !== "creato" ? <ActionButton job={job.id} action="done" label="Segna fatta" here={here} primary /> : null}
                        </div>
                      ) : null}

                      {job.status !== "annullato" ? (
                        <details className="group">
                          <summary className="inline-flex cursor-pointer items-center gap-1 text-[13px] font-medium text-ink-soft transition-colors hover:text-ink">
                            {job.extraCents ? "Modifica extra" : "Aggiungi un extra"}
                            <ChevronDown className="size-3.5 transition-transform group-open:rotate-180" aria-hidden />
                          </summary>
                          <form action={jobExtraAction} className="mt-2 flex flex-wrap gap-2">
                            <Back to={here} />
                            <input type="hidden" name="jobId" value={job.id} />
                            <label className="sr-only" htmlFor={`extra-${job.id}`}>
                              Importo extra in euro
                            </label>
                            <input
                              id={`extra-${job.id}`}
                              className="input h-9 w-24 text-sm md:h-8"
                              name="extra"
                              inputMode="decimal"
                              placeholder="€"
                              defaultValue={job.extraCents ? (job.extraCents / 100).toFixed(2).replace(".", ",") : ""}
                            />
                            <label className="sr-only" htmlFor={`motivo-${job.id}`}>
                              Motivo dell&apos;extra
                            </label>
                            <input
                              id={`motivo-${job.id}`}
                              className="input h-9 min-w-0 flex-1 text-sm md:h-8"
                              name="extraNote"
                              placeholder="Motivo"
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
