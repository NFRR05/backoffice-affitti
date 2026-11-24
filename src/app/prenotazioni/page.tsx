import Link from "next/link";
import { and, asc, eq, gt, gte, lt, lte, ne } from "drizzle-orm";
import { ChevronDown } from "lucide-react";
import { getDb } from "@/db/client";
import { apartments, reservations } from "@/db/schema";
import { requireTenant } from "@/services/common";
import { addDays, diffDays, formatShort, periodBounds, periodOf, todayRome, weekday } from "@/lib/dates";
import { formatEuro } from "@/lib/money";
import { Back, Empty, Field, Flash, PageHeader, ReservationStatusText, Section, param, plural, type SearchParams } from "@/components/ui";
import { guestsAction, manualReservationAction, reservationDetailsAction } from "@/app/actions";

const CHANNEL: Record<string, string> = { airbnb: "Airbnb", booking: "Booking", altro: "Diretta" };
const WEEKDAYS = ["dom", "lun", "mar", "mer", "gio", "ven", "sab"];
const TIMELINE_DAYS = 14;

const euroInput = (cents: number | null) => (cents === null ? "" : (cents / 100).toFixed(2).replace(".", ","));

export default async function PrenotazioniPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const db = await getDb();
  const tenant = await requireTenant(db);
  const today = todayRome();
  const from = param(sp, "dal") ?? periodBounds(periodOf(today)).first;
  const to = param(sp, "al") ?? addDays(today, 60);
  const aptFilter = param(sp, "appartamento") ?? "";
  const here = `/prenotazioni?dal=${from}&al=${to}${aptFilter ? `&appartamento=${aptFilter}` : ""}`;

  const apts = await db.select().from(apartments).where(eq(apartments.tenantId, tenant.id)).orderBy(asc(apartments.code));
  const rows = await db
    .select({ r: reservations, apt: apartments })
    .from(reservations)
    .innerJoin(apartments, eq(apartments.id, reservations.apartmentId))
    .where(
      and(
        eq(reservations.tenantId, tenant.id),
        lte(reservations.checkin, to),
        gte(reservations.checkout, from),
        aptFilter ? eq(reservations.apartmentId, aptFilter) : undefined,
      ),
    )
    .orderBy(asc(reservations.checkin), asc(apartments.code));

  // Occupazione: soggiorni che toccano i prossimi 14 giorni, cancellati esclusi.
  const windowEnd = addDays(today, TIMELINE_DAYS);
  const stays = await db
    .select()
    .from(reservations)
    .where(
      and(
        eq(reservations.tenantId, tenant.id),
        lt(reservations.checkin, windowEnd),
        gt(reservations.checkout, today),
        ne(reservations.status, "cancellata"),
      ),
    )
    .orderBy(asc(reservations.checkin));
  const timelineDays = Array.from({ length: TIMELINE_DAYS }, (_, i) => addDays(today, i));
  const columns = `9.5rem repeat(${TIMELINE_DAYS * 2}, minmax(0, 1fr))`;

  return (
    <div>
      <PageHeader title="Prenotazioni" description="Arrivano dai calendari di Airbnb e Booking. Qui completi ospiti, importi e note." />
      <Flash ok={param(sp, "ok")} errore={param(sp, "errore")} />

      <Section
        title="Occupazione dei prossimi 14 giorni"
        description="Ogni barra è un soggiorno, da metà del giorno di arrivo a metà di quello di partenza."
        flush
        className="mb-8"
      >
        <div className="overflow-x-auto">
          <div className="min-w-[56rem] pb-2">
            <div className="grid border-b border-line" style={{ gridTemplateColumns: columns }}>
              <div className="sticky left-0 z-20 bg-surface" />
              {timelineDays.map((d) => (
                <div key={d} className={`col-span-2 px-1 py-2 text-center text-[12px] leading-4 ${d === today ? "bg-paper font-semibold text-ink" : "text-muted"}`}>
                  <div>{WEEKDAYS[weekday(d)]}</div>
                  <div className="tabular-nums">{Number(d.slice(8))}</div>
                </div>
              ))}
            </div>

            {apts.map((apt) => (
              <div key={apt.id} className="grid border-b border-line/70" style={{ gridTemplateColumns: columns }}>
                <div className="sticky left-0 z-20 truncate border-r border-line bg-surface px-5 py-3 text-[13px] font-medium text-ink" style={{ gridRow: 1, gridColumn: 1 }}>
                  {apt.name}
                </div>
                {timelineDays.map((d, i) => (
                  <div
                    key={d}
                    className={`col-span-2 ${i < TIMELINE_DAYS - 1 ? "border-r border-line/50" : ""} ${d === today ? "bg-paper" : ""}`}
                    style={{ gridRow: 1, gridColumn: `${2 + i * 2} / span 2` }}
                  />
                ))}
                {stays
                  .filter((s) => s.apartmentId === apt.id)
                  .map((s) => {
                    const start = Math.max(0, diffDays(today, s.checkin) * 2 + 1);
                    const end = Math.min(TIMELINE_DAYS * 2, diffDays(today, s.checkout) * 2 + 1);
                    if (end <= start) return null;
                    const toVerify = s.status === "da_verificare";
                    const label = s.guests === null ? "Ospiti da inserire" : `${plural(s.guests, "ospite", "ospiti")}, ${CHANNEL[s.channel] ?? s.channel}`;
                    return (
                      <Link
                        key={s.id}
                        href={`/prenotazioni?appartamento=${apt.id}#p-${s.id}`}
                        title={`${apt.name}: dal ${formatShort(s.checkin)} al ${formatShort(s.checkout)}, ${label}`}
                        className={`relative z-10 mx-0.5 my-2 flex min-w-0 items-center rounded-md px-2 text-[12px] font-medium transition-colors ${
                          toVerify
                            ? "bg-warn-soft text-warn hover:bg-stay-hover"
                            : s.guests === null
                              ? "bg-stay text-warn hover:bg-stay-hover"
                              : "bg-stay text-ink hover:bg-stay-hover"
                        }`}
                        style={{ gridRow: 1, gridColumn: `${2 + start} / ${2 + end}` }}
                      >
                        <span className="truncate">{toVerify ? "Da verificare" : label}</span>
                      </Link>
                    );
                  })}
              </div>
            ))}
          </div>
        </div>
      </Section>

      <form method="get" className="mb-4 grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:items-end">
        <Field label="Dal">
          <input className="input" type="date" name="dal" defaultValue={from} />
        </Field>
        <Field label="Al">
          <input className="input" type="date" name="al" defaultValue={to} />
        </Field>
        <Field label="Appartamento" className="col-span-2 sm:col-span-1">
          <select className="input sm:w-60" name="appartamento" defaultValue={aptFilter}>
            <option value="">Tutti gli appartamenti</option>
            {apts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </Field>
        <button className="btn col-span-2 sm:col-span-1">Mostra</button>
      </form>

      <Section
        title={plural(rows.length, "prenotazione", "prenotazioni")}
        description={`Con soggiorno tra ${formatShort(from)} e ${formatShort(to)}.`}
        flush
        className="mb-8"
      >
        {rows.length === 0 ? <Empty>Nessuna prenotazione in questo periodo.</Empty> : null}
        <ul className="divide-y divide-line">
          {rows.map(({ r, apt }) => (
            <li key={r.id} id={`p-${r.id}`} className={`scroll-mt-28 px-5 py-4 ${r.status === "cancellata" ? "opacity-60" : ""}`}>
              <div className="grid gap-3 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1.3fr)_minmax(0,0.9fr)_minmax(0,1fr)_minmax(0,0.8fr)] md:items-start md:gap-6">
                <div className="min-w-0">
                  <div className="text-[15px] font-medium text-ink">{apt.name}</div>
                  <div className="text-[13px] text-muted">Codice <span className="font-mono text-[12px] text-ink-soft">{r.ref}</span></div>
                </div>

                <div>
                  <div className="text-sm text-ink tabular-nums">
                    Dal {formatShort(r.checkin)} al {formatShort(r.checkout)}
                  </div>
                  <div className="text-[13px] text-muted">
                    {plural(diffDays(r.checkin, r.checkout), "notte", "notti")}
                    {r.arrivalTime ? `, arrivo alle ${r.arrivalTime}` : ""}
                  </div>
                </div>

                <div className="min-w-0 text-sm text-ink">
                  {CHANNEL[r.channel] ?? r.channel}
                  {r.externalCode ? <div className="truncate font-mono text-[12px] text-muted">{r.externalCode}</div> : null}
                </div>

                <div>
                  {r.status === "cancellata" ? (
                    <span className="text-sm text-ink tabular-nums">{r.guests === null ? "Ospiti non indicati" : plural(r.guests, "ospite", "ospiti")}</span>
                  ) : (
                    <form action={guestsAction} className="flex items-center gap-2">
                      <Back to={here} />
                      <input type="hidden" name="reservationId" value={r.id} />
                      <label className="sr-only" htmlFor={`ospiti-${r.id}`}>
                        Numero di ospiti
                      </label>
                      <input
                        id={`ospiti-${r.id}`}
                        className={`input h-9 w-20 text-sm md:h-8 ${r.guests === null ? "border-warn bg-warn-soft" : ""}`}
                        type="number"
                        min={1}
                        max={30}
                        name="guests"
                        placeholder="Ospiti"
                        defaultValue={r.guests ?? ""}
                      />
                      <button className="btn btn-sm">Salva</button>
                    </form>
                  )}
                </div>

                <div className="md:text-right">
                  <ReservationStatusText status={r.status} />
                </div>
              </div>

              {r.status !== "cancellata" ? (
                <details className="group mt-3">
                  <summary className="flex cursor-pointer flex-wrap items-center gap-x-4 gap-y-1 text-[13px]">
                    <span className={r.grossCents === null ? "text-warn" : "text-muted tabular-nums"}>
                      {r.grossCents !== null
                        ? `Lordo ${formatEuro(r.grossCents)}, commissione del portale ${formatEuro(r.otaCommissionCents ?? 0)}`
                        : "Importi da inserire"}
                    </span>
                    <span className="inline-flex items-center gap-1 font-medium text-ink-soft transition-colors hover:text-ink">
                      Modifica importi e note
                      <ChevronDown className="size-3.5 transition-transform group-open:rotate-180" aria-hidden />
                    </span>
                  </summary>
                  <form action={reservationDetailsAction} className="mt-4 grid max-w-3xl grid-cols-1 gap-4 rounded-lg bg-paper p-4 sm:grid-cols-2 lg:grid-cols-3">
                    <Back to={here} />
                    <input type="hidden" name="reservationId" value={r.id} />
                    <Field label="Lordo (€)">
                      <input className="input" name="gross" inputMode="decimal" defaultValue={euroInput(r.grossCents)} />
                    </Field>
                    <Field label="Commissione del portale (€)">
                      <input className="input" name="ota" inputMode="decimal" defaultValue={euroInput(r.otaCommissionCents)} />
                    </Field>
                    <Field label="Di cui quota pulizie (€)">
                      <input className="input" name="cleaningFee" inputMode="decimal" defaultValue={euroInput(r.guestCleaningFeeCents)} />
                    </Field>
                    <Field label="Tassa di soggiorno (€)">
                      <input className="input" name="touristTax" inputMode="decimal" defaultValue={euroInput(r.touristTaxCents)} />
                    </Field>
                    <Field label="Orario di arrivo">
                      <input className="input" name="arrivalTime" placeholder="Per esempio 17:30" defaultValue={r.arrivalTime ?? ""} />
                    </Field>
                    <Field label="Note">
                      <input className="input" name="notes" defaultValue={r.notes ?? ""} />
                    </Field>
                    <div className="sm:col-span-2 lg:col-span-3">
                      <button className="btn btn-primary">Salva importi e note</button>
                    </div>
                  </form>
                </details>
              ) : null}
            </li>
          ))}
        </ul>
      </Section>

      <Section
        title="Aggiungi una prenotazione diretta"
        description="Per le prenotazioni fuori dai portali. La pulizia viene creata e inviata all'addetta come le altre."
      >
        <form action={manualReservationAction} className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.4fr)_repeat(2,minmax(0,1fr))_6rem_minmax(0,1.4fr)_auto] lg:items-end">
          <Back to={here} />
          <Field label="Appartamento" className="sm:col-span-2 lg:col-span-1">
            <select className="input" name="apartmentId" defaultValue="" required>
              <option value="" disabled>
                Scegli
              </option>
              {apts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Arrivo">
            <input className="input" type="date" name="checkin" required />
          </Field>
          <Field label="Partenza">
            <input className="input" type="date" name="checkout" required />
          </Field>
          <Field label="Ospiti">
            <input className="input" type="number" min={1} name="guests" required />
          </Field>
          <Field label="Note">
            <input className="input" name="notes" />
          </Field>
          <button className="btn btn-primary">Aggiungi</button>
        </form>
      </Section>
    </div>
  );
}
