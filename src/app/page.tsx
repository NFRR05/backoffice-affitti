import Link from "next/link";
import { and, asc, eq, gte, inArray, isNull, lte } from "drizzle-orm";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { getDb } from "@/db/client";
import { apartments, cleaners, cleaningJobs, icalFeeds, reservations } from "@/db/schema";
import { getTenant } from "@/services/common";
import { addDays, formatLong, formatPeriod, formatShort, nextPeriod, periodBounds, periodOf, previousPeriod, todayRome, weekday } from "@/lib/dates";
import {
  Back,
  CleaningStatusText,
  Empty,
  Flash,
  Metric,
  PageHeader,
  Section,
  cleaningStatusDot,
  CLEANING_STATUS_ORDER,
  cleaningStatusLabel,
  dayLabel,
  param,
  plural,
  type SearchParams,
} from "@/components/ui";
import { syncNowAction } from "@/app/actions";

const CHANNEL: Record<string, string> = { airbnb: "Airbnb", booking: "Booking" };
const WEEKDAYS = ["lun", "mar", "mer", "gio", "ven", "sab", "dom"];

type Attention = { key: string; title: string; detail: string; href: string; action: string; urgent: boolean };

export default async function Dashboard({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const db = await getDb();
  const tenant = await getTenant(db);

  if (!tenant) return <Welcome ok={param(sp, "ok")} errore={param(sp, "errore")} />;

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

  // Cose da sistemare, dalle più urgenti.
  const attention: Attention[] = [
    ...escalations.map(({ job, aptName, cleanerName }) => ({
      key: `e-${job.id}`,
      title: `${aptName}, ${formatShort(job.date)}`,
      detail: `${cleanerName ?? "L'addetta"} non è disponibile o non ha risposto.`,
      href: `/pulizie?dal=${job.date}&al=${job.date}`,
      action: "Riassegna",
      urgent: true,
    })),
    ...unassigned.map(({ job, aptName }) => ({
      key: `u-${job.id}`,
      title: `${aptName}, ${formatShort(job.date)}`,
      detail: "Nessuna addetta assegnata.",
      href: `/pulizie?dal=${job.date}&al=${job.date}`,
      action: "Assegna",
      urgent: true,
    })),
    ...feedProblems.map(({ f, aptName }) => ({
      key: `f-${f.id}`,
      title: `${aptName}, calendario ${CHANNEL[f.channel] ?? f.channel}`,
      detail: f.lastError ?? "Il calendario non si riesce a leggere.",
      href: "/appartamenti",
      action: "Controlla",
      urgent: true,
    })),
    ...toVerify.map(({ r, aptName }) => ({
      key: `v-${r.id}`,
      title: aptName,
      detail: `Il soggiorno dal ${formatShort(r.checkin)} al ${formatShort(r.checkout)} non è più nel calendario del portale.`,
      href: `/prenotazioni?appartamento=${r.apartmentId}`,
      action: "Verifica",
      urgent: false,
    })),
    ...noGuests.slice(0, 6).map(({ r, aptName }) => ({
      key: `g-${r.id}`,
      title: `${aptName}, arrivo ${formatShort(r.checkin)}`,
      detail: `Manca il numero di ospiti (codice ${r.ref}).`,
      href: `/prenotazioni?appartamento=${r.apartmentId}`,
      action: "Inserisci",
      urgent: false,
    })),
  ];
  const hiddenNoGuests = Math.max(0, noGuests.length - 6);

  const upcomingByDay = new Map<string, typeof active>();
  // Le prime 8: la colonna resta alta quanto "Da sistemare"; il resto è nella pagina Pulizie.
  const UPCOMING_SHOWN = 8;
  for (const u of active.slice(0, UPCOMING_SHOWN)) upcomingByDay.set(u.job.date, [...(upcomingByDay.get(u.job.date) ?? []), u]);
  const upcomingHidden = Math.max(0, active.length - UPCOMING_SHOWN);

  // Calendario del mese: settimane da lunedì.
  const lead = (weekday(first) + 6) % 7;
  const days: (string | null)[] = [...Array(lead).fill(null)];
  for (let d = first; d <= last; d = addDays(d, 1)) days.push(d);
  while (days.length % 7 !== 0) days.push(null);
  const byDate = new Map<string, typeof jobs>();
  for (const j of jobs) byDate.set(j.job.date, [...(byDate.get(j.job.date) ?? []), j]);
  const monthDays = days.filter((d): d is string => d !== null && (byDate.get(d)?.length ?? 0) > 0);

  const longToday = formatLong(today);

  return (
    <div>
      <PageHeader
        title={longToday.charAt(0).toUpperCase() + longToday.slice(1)}
        description={`${plural(todayJobs.length, "pulizia", "pulizie")} oggi, ${active.length} nei prossimi 7 giorni.`}
        actions={
          <form action={syncNowAction}>
            <Back to="/" />
            <button className="btn">Sincronizza i calendari</button>
          </form>
        }
      />
      <Flash ok={param(sp, "ok")} errore={param(sp, "errore")} />

      <div className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric label="Pulizie oggi" value={todayJobs.length} href={`/pulizie?dal=${today}&al=${today}`} />
        <Metric
          label="In attesa di risposta"
          value={waiting.length}
          tone={waiting.length ? "warn" : undefined}
          href="/pulizie?stato=inviato"
        />
        <Metric
          label="Da riassegnare"
          value={escalations.length}
          tone={escalations.length ? "bad" : undefined}
          href="/pulizie?stato=escalation"
        />
        <Metric
          label="Prenotazioni senza ospiti"
          value={noGuests.length}
          tone={noGuests.length ? "warn" : undefined}
          href="/prenotazioni"
        />
      </div>

      <div className="mb-8 grid items-start gap-6 lg:grid-cols-5">
        <Section
          title="Da sistemare"
          description={attention.length === 0 ? "Tutto in ordine." : `${plural(attention.length + hiddenNoGuests, "voce", "voci")}, le più urgenti in alto.`}
          flush
          className="lg:col-span-3"
        >
          {attention.length === 0 ? <Empty>Niente da sistemare.</Empty> : null}
          <ul className="divide-y divide-line">
            {attention.map((a) => (
              <li key={a.key} className="flex items-center justify-between gap-4 px-5 py-3.5">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-ink">{a.title}</div>
                  <div className={`mt-0.5 flex items-center gap-2 text-[13px] ${a.urgent ? "text-bad" : "text-muted"}`}>
                    {a.urgent ? <span className="dot bg-bad" aria-hidden /> : null}
                    {a.detail}
                  </div>
                </div>
                <Link className="btn btn-sm shrink-0" href={a.href}>
                  {a.action}
                </Link>
              </li>
            ))}
          </ul>
          {hiddenNoGuests > 0 ? (
            <div className="border-t border-line px-5 py-3.5 text-sm">
              <Link className="link" href="/prenotazioni">
                Altre {plural(hiddenNoGuests, "prenotazione", "prenotazioni")} senza ospiti
              </Link>
            </div>
          ) : null}
        </Section>

        <Section
          title="Prossimi 7 giorni"
          flush
          className="lg:col-span-2"
          actions={
            <Link className="btn btn-sm" href="/pulizie">
              Tutte le pulizie
            </Link>
          }
        >
          {active.length === 0 ? <Empty>Nessuna pulizia in programma.</Empty> : null}
          <div className="pb-2">
            {[...upcomingByDay.entries()].map(([date, items]) => (
              <div key={date} className="pt-4">
                <h3 className="px-5 pb-1 text-[12px] font-medium text-muted">{dayLabel(date, today)}</h3>
                <ul>
                  {items.map(({ job, aptName, cleanerName }) => (
                    <li key={job.id} className="flex items-start justify-between gap-3 px-5 py-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-ink">{aptName}</div>
                        <div className="text-[13px] text-muted">
                          {cleanerName ?? "Senza addetta"}
                          {job.sameDay ? ", cambio in giornata" : ""}
                        </div>
                      </div>
                      <span className="shrink-0 text-right">
                        <CleaningStatusText status={job.status} />
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          {upcomingHidden > 0 ? (
            <div className="border-t border-line px-5 py-3.5 text-sm">
              <Link className="link" href="/pulizie">
                Altre {plural(upcomingHidden, "pulizia", "pulizie")} nei prossimi 7 giorni
              </Link>
            </div>
          ) : null}
        </Section>
      </div>

      <Section
        title={`Calendario di ${formatPeriod(period)}`}
        actions={
          <div className="flex gap-2">
            <Link className="btn btn-sm" href={`/?mese=${previousPeriod(period)}`} aria-label="Mese precedente">
              <ChevronLeft className="size-4" aria-hidden />
            </Link>
            <Link className="btn btn-sm" href="/">
              Questo mese
            </Link>
            <Link className="btn btn-sm" href={`/?mese=${nextPeriod(period)}`} aria-label="Mese successivo">
              <ChevronRight className="size-4" aria-hidden />
            </Link>
          </div>
        }
      >
        <div className="hidden md:block">
          <div className="grid grid-cols-7 pb-2">
            {WEEKDAYS.map((d) => (
              <div key={d} className="px-2 text-[13px] text-muted">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border border-line bg-line">
            {days.map((d, i) => (
              <div key={i} className={`min-h-24 p-1.5 ${!d ? "bg-paper" : "bg-surface"}`}>
                {d ? (
                  <>
                    <div className="mb-1 px-1">
                      <span
                        className={`inline-grid min-w-5 place-items-center rounded-full text-[12px] tabular-nums ${
                          d === today ? "bg-ink px-1.5 font-semibold text-white" : "text-muted"
                        }`}
                      >
                        {Number(d.slice(8))}
                      </span>
                    </div>
                    {(byDate.get(d) ?? []).map(({ job, aptCode, aptName, cleanerName }) => (
                      <Link
                        key={job.id}
                        href={`/pulizie?dal=${d}&al=${d}`}
                        title={`${aptName}, ${cleanerName ?? "senza addetta"}: ${cleaningStatusLabel(job.status).toLowerCase()}`}
                        className={`flex items-center gap-1.5 truncate rounded px-1 font-mono text-[11.5px] leading-5 hover:bg-hover ${
                          job.status === "annullato" ? "text-faint line-through" : "text-ink-soft"
                        }`}
                      >
                        <span className={`dot size-1.5 ${cleaningStatusDot(job.status)}`} aria-hidden />
                        {aptCode}
                      </Link>
                    ))}
                  </>
                ) : null}
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-5 md:hidden">
          {monthDays.length === 0 ? <p className="text-sm text-muted">Nessuna pulizia in questo mese.</p> : null}
          {monthDays.map((d) => (
            <div key={d}>
              <h3 className={`mb-1 text-[13px] font-semibold ${d === today ? "text-ink" : "text-ink-soft"}`}>{dayLabel(d, today)}</h3>
              <ul>
                {(byDate.get(d) ?? []).map(({ job, aptName }) => (
                  <li key={job.id}>
                    <Link href={`/pulizie?dal=${d}&al=${d}`} className="flex items-center justify-between gap-3 py-1.5">
                      <span className="truncate text-sm text-ink">{aptName}</span>
                      <span className="shrink-0">
                        <CleaningStatusText status={job.status} small />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-2" aria-label="Legenda">
          {CLEANING_STATUS_ORDER.map((st) => (
            <li key={st}>
              <CleaningStatusText status={st} small />
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}

function Welcome({ ok, errore }: { ok?: string; errore?: string }) {
  return (
    <div className="max-w-3xl">
      <PageHeader title="Benvenuto" description="Il database è vuoto. Scegli da dove partire." />
      <Flash ok={ok} errore={errore} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Section title="Prova con i dati demo">
          <p className="text-sm leading-6 text-muted">Otto appartamenti inventati, calendari finti e messaggi simulati. Utile per capire come funziona.</p>
          <Link className="btn btn-primary mt-5" href="/impostazioni">
            Carica i dati demo
          </Link>
        </Section>
        <Section title="Usa i tuoi dati">
          <p className="text-sm leading-6 text-muted">
            Copia <code className="text-ink">config/configurazione.example.json</code> in <code className="text-ink">config/configurazione.json</code>,
            compilalo e importalo dalle Impostazioni.
          </p>
          <Link className="btn mt-5" href="/impostazioni">
            Importa la configurazione
          </Link>
        </Section>
      </div>
    </div>
  );
}
