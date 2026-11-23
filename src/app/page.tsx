import Link from "next/link";
import { and, asc, eq, gte, inArray, isNull, lte } from "drizzle-orm";
import { CalendarDays, ChevronLeft, ChevronRight, CircleCheck, Clock, Sparkles, UserRound, Users } from "lucide-react";
import { getDb } from "@/db/client";
import { apartments, cleaners, cleaningJobs, icalFeeds, reservations } from "@/db/schema";
import { getTenant } from "@/services/common";
import { addDays, formatPeriod, formatShort, nextPeriod, periodBounds, periodOf, previousPeriod, todayRome, weekday } from "@/lib/dates";
import { Back, Card, Empty, Flash, PageHeader, Pill, Stat, StatusBadge, param, type SearchParams } from "@/components/ui";
import { syncNowAction } from "@/app/actions";
import type { CleaningStatus } from "@/domain/cleaning";

const CHIP: Record<CleaningStatus, string> = {
  creato: "bg-slate-100 text-slate-700 border-slate-300",
  inviato: "bg-amber-50 text-amber-900 border-amber-300",
  confermato: "bg-sky-50 text-sky-900 border-sky-300",
  completato: "bg-emerald-50 text-emerald-900 border-emerald-300",
  escalation: "bg-red-50 text-red-900 border-red-400",
  annullato: "bg-white text-slate-400 border-slate-200 line-through",
};

export default async function Dashboard({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const db = await getDb();
  const tenant = await getTenant(db);

  if (!tenant) {
    return (
      <div className="max-w-2xl">
        <PageHeader title="Benvenuto" subtitle="Il database è vuoto. Scegli da dove partire." />
        <Flash ok={param(sp, "ok")} errore={param(sp, "errore")} />
        <Card title="Per iniziare">
          <ol className="list-decimal space-y-2 pl-5 text-sm text-slate-700">
            <li>
              <strong>Prova con i dati demo:</strong> 8 appartamenti inventati, calendari finti e messaggi simulati. Vai in{" "}
              <Link className="text-brand underline" href="/impostazioni">
                Impostazioni
              </Link>{" "}
              e usa &quot;Carica dati demo&quot;.
            </li>
            <li>
              <strong>Oppure i tuoi dati:</strong> copia <code>config/configurazione.example.json</code> in{" "}
              <code>config/configurazione.json</code>, inserisci appartamenti, link iCal, proprietari, addette, listini e contratti,
              poi usa &quot;Importa configurazione&quot;.
            </li>
          </ol>
        </Card>
      </div>
    );
  }

  const today = todayRome();
  const period = param(sp, "mese") ?? periodOf(today);
  const { first, last } = periodBounds(period);

  const jobs = await db
    .select({ job: cleaningJobs, aptCode: apartments.code, aptName: apartments.name, cleanerName: cleaners.name })
    .from(cleaningJobs)
    .innerJoin(apartments, eq(apartments.id, cleaningJobs.apartmentId))
    .leftJoin(cleaners, eq(cleaners.id, cleaningJobs.cleanerId))
    .where(and(eq(cleaningJobs.tenantId, tenant.id), gte(cleaningJobs.date, addDays(first, -7)), lte(cleaningJobs.date, addDays(last, 7))))
    .orderBy(asc(cleaningJobs.date), asc(apartments.code));

  const upcoming = await db
    .select({ job: cleaningJobs, aptName: apartments.name, aptCode: apartments.code, cleanerName: cleaners.name })
    .from(cleaningJobs)
    .innerJoin(apartments, eq(apartments.id, cleaningJobs.apartmentId))
    .leftJoin(cleaners, eq(cleaners.id, cleaningJobs.cleanerId))
    .where(and(eq(cleaningJobs.tenantId, tenant.id), gte(cleaningJobs.date, today), lte(cleaningJobs.date, addDays(today, 7))))
    .orderBy(asc(cleaningJobs.date));
  const active = upcoming.filter((u) => u.job.status !== "annullato");

  const noGuests = await db
    .select({ r: reservations, aptName: apartments.name })
    .from(reservations)
    .innerJoin(apartments, eq(apartments.id, reservations.apartmentId))
    .where(and(eq(reservations.tenantId, tenant.id), eq(reservations.status, "confermata"), isNull(reservations.guests), gte(reservations.checkout, today)))
    .orderBy(asc(reservations.checkin));
  const toVerify = await db
    .select({ r: reservations, aptName: apartments.name })
    .from(reservations)
    .innerJoin(apartments, eq(apartments.id, reservations.apartmentId))
    .where(and(eq(reservations.tenantId, tenant.id), eq(reservations.status, "da_verificare")));
  const feedProblems = await db
    .select({ f: icalFeeds, aptName: apartments.name })
    .from(icalFeeds)
    .innerJoin(apartments, eq(apartments.id, icalFeeds.apartmentId))
    .where(and(eq(icalFeeds.tenantId, tenant.id), inArray(icalFeeds.lastStatus, ["errore", "bloccato"])));

  const escalations = active.filter((u) => u.job.status === "escalation");
  const waiting = active.filter((u) => u.job.status === "inviato");
  const unassigned = active.filter((u) => !u.job.cleanerId);
  const todayJobs = active.filter((u) => u.job.date === today);

  // Calendario: settimane da lunedì.
  const lead = (weekday(first) + 6) % 7;
  const days: (string | null)[] = [...Array(lead).fill(null)];
  for (let d = first; d <= last; d = addDays(d, 1)) days.push(d);
  while (days.length % 7 !== 0) days.push(null);
  const byDate = new Map<string, typeof jobs>();
  for (const j of jobs) byDate.set(j.job.date, [...(byDate.get(j.job.date) ?? []), j]);

  const alerts = escalations.length + feedProblems.length + toVerify.length + unassigned.length;

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle={`Oggi ${formatShort(today)}`}
        actions={
          <form action={syncNowAction}>
            <Back to="/" />
            <button className="btn btn-primary">Sincronizza ora</button>
          </form>
        }
      />
      <Flash ok={param(sp, "ok")} errore={param(sp, "errore")} />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Pulizie oggi" value={todayJobs.length} icon={Sparkles} />
        <Stat label="Prossimi 7 giorni" value={active.length} icon={CalendarDays} />
        <Stat label="In attesa di risposta" value={waiting.length} tone={waiting.length ? "amber" : undefined} icon={Clock} />
        <Stat label="Da riassegnare" value={escalations.length} tone={escalations.length ? "red" : undefined} icon={UserRound} />
        <Stat label="Prenotazioni senza ospiti" value={noGuests.length} tone={noGuests.length ? "amber" : undefined} icon={Users} />
      </div>

      <div className="mb-6 grid gap-6 xl:grid-cols-3">
        <Card title={`Da guardare (${alerts + noGuests.length})`} className="xl:col-span-1">
          {alerts + noGuests.length === 0 ? <Empty icon={CircleCheck}>Tutto in ordine.</Empty> : null}
          <ul className="space-y-3 text-sm">
            {escalations.map(({ job, aptName, cleanerName }) => (
              <li key={job.id} className="flex items-start gap-2">
                <Pill tone="red">Escalation</Pill>
                <span>
                  {aptName}, {formatShort(job.date)}: {cleanerName ?? "addetta"} non disponibile o senza risposta.{" "}
                  <Link className="text-brand underline" href={`/pulizie?dal=${job.date}&al=${job.date}`}>
                    Riassegna
                  </Link>
                </span>
              </li>
            ))}
            {unassigned.map(({ job, aptName }) => (
              <li key={job.id} className="flex items-start gap-2">
                <Pill tone="red">Senza addetta</Pill>
                <span>
                  {aptName}, {formatShort(job.date)}
                </span>
              </li>
            ))}
            {feedProblems.map(({ f, aptName }) => (
              <li key={f.id} className="flex items-start gap-2">
                <Pill tone="red">Calendario</Pill>
                <span>
                  {aptName} ({f.channel}): {f.lastError}
                </span>
              </li>
            ))}
            {toVerify.map(({ r, aptName }) => (
              <li key={r.id} className="flex items-start gap-2">
                <Pill tone="amber">Verifica</Pill>
                <span>
                  {aptName}: soggiorno {formatShort(r.checkin)} → {formatShort(r.checkout)} non più nel calendario.
                </span>
              </li>
            ))}
            {noGuests.slice(0, 8).map(({ r, aptName }) => (
              <li key={r.id} className="flex items-start gap-2">
                <Pill tone="amber">Ospiti?</Pill>
                <span>
                  {aptName}, {formatShort(r.checkin)} → {formatShort(r.checkout)} (codice {r.ref}).{" "}
                  <Link className="text-brand underline" href="/prenotazioni">
                    Inserisci
                  </Link>
                </span>
              </li>
            ))}
          </ul>
        </Card>

        <Card title="Prossime pulizie" className="xl:col-span-2">
          {active.length === 0 ? <Empty>Nessuna pulizia nei prossimi 7 giorni.</Empty> : null}
          <ul className="divide-y divide-slate-100 text-sm">
            {active.slice(0, 12).map(({ job, aptName, cleanerName }) => (
              <li key={job.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                <span className="w-20 font-medium tabular-nums">{formatShort(job.date)}</span>
                <span className="min-w-40 flex-1">{aptName}</span>
                {job.sameDay ? <Pill tone="brand">Cambio in giornata</Pill> : null}
                <span className="text-slate-600">{cleanerName ?? "—"}</span>
                <StatusBadge status={job.status} />
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card
        title={`Calendario pulizie · ${formatPeriod(period)}`}
        actions={
          <div className="flex gap-1">
            <Link className="btn btn-sm" href={`/?mese=${previousPeriod(period)}`}>
              <ChevronLeft className="size-4" aria-hidden />
              Mese prima
            </Link>
            <Link className="btn btn-sm" href="/">
              Oggi
            </Link>
            <Link className="btn btn-sm" href={`/?mese=${nextPeriod(period)}`}>
              Mese dopo
              <ChevronRight className="size-4" aria-hidden />
            </Link>
          </div>
        }
      >
        <div className="hidden overflow-hidden rounded-lg border border-slate-200 bg-slate-200 text-xs md:grid md:grid-cols-7 md:gap-px">
          {["lun", "mar", "mer", "gio", "ven", "sab", "dom"].map((d) => (
            <div key={d} className="bg-slate-50 px-2 py-1 font-semibold uppercase text-slate-500">
              {d}
            </div>
          ))}
          {days.map((d, i) => (
            <div key={i} className={`min-h-24 bg-white p-1.5 ${d === today ? "ring-2 ring-inset ring-brand" : ""} ${d ? "" : "bg-slate-50"}`}>
              {d ? (
                <>
                  <div className={`mb-1 text-right font-medium ${d === today ? "text-brand" : "text-slate-500"}`}>{Number(d.slice(8))}</div>
                  <div className="space-y-1">
                    {(byDate.get(d) ?? []).map(({ job, aptCode, cleanerName }) => (
                      <Link
                        key={job.id}
                        href={`/pulizie?dal=${d}&al=${d}`}
                        title={`${aptCode} · ${cleanerName ?? "senza addetta"}`}
                        className={`block truncate rounded border px-1 py-0.5 font-medium ${CHIP[job.status]}`}
                      >
                        {aptCode}
                        {job.sameDay ? " · CG" : ""}
                      </Link>
                    ))}
                  </div>
                </>
              ) : null}
            </div>
          ))}
        </div>
        <div className="space-y-4 md:hidden">
          {days.some((d) => d && (byDate.get(d)?.length ?? 0) > 0) ? null : <Empty icon={CalendarDays}>Nessuna pulizia in questo mese.</Empty>}
          {days
            .filter((d): d is string => d !== null && (byDate.get(d)?.length ?? 0) > 0)
            .map((d) => (
              <div key={d}>
                <div className={`mb-1.5 text-sm font-semibold ${d === today ? "text-brand" : "text-slate-700"}`}>
                  {formatShort(d)}
                  {d === today ? " · oggi" : ""}
                </div>
                <ul className="space-y-1.5">
                  {(byDate.get(d) ?? []).map(({ job, aptName, cleanerName }) => (
                    <li key={job.id}>
                      <Link
                        href={`/pulizie?dal=${d}&al=${d}`}
                        className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-sm font-medium ${CHIP[job.status]}`}
                      >
                        <span className="min-w-0 truncate">
                          {aptName}
                          {job.sameDay ? " · CG" : ""}
                        </span>
                        <span className="shrink-0 text-xs font-normal opacity-80">{cleanerName ?? "senza addetta"}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
        </div>
        <p className="mt-3 text-xs text-slate-500">
          CG = cambio in giornata. Colori: grigio creato, giallo inviato, azzurro confermato, verde completato, rosso escalation.
        </p>
      </Card>
    </div>
  );
}
