import { and, asc, eq, gte, lte } from "drizzle-orm";
import { CalendarDays } from "lucide-react";
import { getDb } from "@/db/client";
import { apartments, reservations } from "@/db/schema";
import { requireTenant } from "@/services/common";
import { addDays, diffDays, formatShort, periodBounds, periodOf, todayRome } from "@/lib/dates";
import { formatEuro } from "@/lib/money";
import { Back, Card, Empty, Flash, PageHeader, Pill, param, type SearchParams } from "@/components/ui";
import { guestsAction, manualReservationAction, reservationDetailsAction } from "@/app/actions";

const STATUS_TONE = { confermata: "green", conclusa: "slate", cancellata: "red", da_verificare: "amber" } as const;
const CHANNEL = { airbnb: "Airbnb", booking: "Booking", altro: "Diretta" } as Record<string, string>;

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

  return (
    <div>
      <PageHeader title="Prenotazioni" subtitle="Arrivano dai calendari iCal. Qui completi ospiti, importi e note." />
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
            <span className="label">Appartamento</span>
            <select className="input md:min-w-56" name="appartamento" defaultValue={aptFilter}>
              <option value="">Tutti</option>
              {apts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.code} · {a.name}
                </option>
              ))}
            </select>
          </label>
          <div className="col-span-2 md:col-span-1">
            <button className="btn btn-primary w-full md:w-auto">Mostra</button>
          </div>
        </div>
      </form>

      <Card title={`${rows.length} ${rows.length === 1 ? "prenotazione" : "prenotazioni"}`} className="mb-6">
        {rows.length === 0 ? <Empty icon={CalendarDays}>Nessuna prenotazione nel periodo selezionato.</Empty> : null}
        {rows.length > 0 ? (
          <ul className="-mx-5 -my-5 divide-y divide-slate-100">
            {rows.map(({ r, apt }) => (
              <li key={r.id} className={`space-y-3 px-5 py-4 ${r.status === "cancellata" ? "opacity-60" : ""}`}>
                <div className="grid gap-3 md:grid-cols-[minmax(0,1.5fr)_minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,0.9fr)_auto] md:items-center md:gap-5">
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-900">{apt.name}</div>
                    <div className="text-xs text-slate-500">codice {r.ref}</div>
                  </div>

                  <div>
                    <div className="text-sm font-medium tabular-nums text-slate-800">
                      {formatShort(r.checkin)} → {formatShort(r.checkout)}
                    </div>
                    <div className="text-xs text-slate-500">
                      {diffDays(r.checkin, r.checkout)} notti{r.arrivalTime ? ` · arrivo ${r.arrivalTime}` : ""}
                    </div>
                  </div>

                  <div className="text-sm">
                    {CHANNEL[r.channel] ?? r.channel}
                    {r.externalCode ? <div className="text-xs text-slate-500">{r.externalCode}</div> : null}
                  </div>

                  <div className="text-sm">
                    {r.status === "cancellata" ? (
                      <span className="tabular-nums">{r.guests ?? "—"} ospiti</span>
                    ) : (
                      <form action={guestsAction} className="flex items-center gap-1.5">
                        <Back to={here} />
                        <input type="hidden" name="reservationId" value={r.id} />
                        <label className="sr-only" htmlFor={`ospiti-${r.id}`}>
                          Numero di ospiti
                        </label>
                        <input
                          id={`ospiti-${r.id}`}
                          className={`input min-h-9 w-20 py-1 text-sm ${r.guests === null ? "border-amber-400 bg-amber-50" : ""}`}
                          type="number"
                          min={1}
                          max={30}
                          name="guests"
                          placeholder="ospiti"
                          defaultValue={r.guests ?? ""}
                        />
                        <button className="btn btn-sm">OK</button>
                      </form>
                    )}
                  </div>

                  <div>
                    <Pill tone={STATUS_TONE[r.status]}>{r.status.replace("_", " ")}</Pill>
                  </div>
                </div>

                {r.status !== "cancellata" ? (
                  <div className="flex flex-col gap-2 text-sm">
                    <div className="text-xs tabular-nums text-slate-600">
                      {r.grossCents !== null
                        ? `lordo ${formatEuro(r.grossCents)} · commissione ${formatEuro(r.otaCommissionCents ?? 0)}`
                        : "importi da inserire"}
                    </div>
                    <details className="max-w-2xl">
                      <summary className="inline-flex cursor-pointer items-center rounded text-xs font-medium text-brand hover:underline">
                        Modifica importi e note
                      </summary>
                      <form action={reservationDetailsAction} className="mt-3 grid grid-cols-1 gap-3 rounded-lg bg-slate-50 p-4 sm:grid-cols-2">
                        <Back to={here} />
                        <input type="hidden" name="reservationId" value={r.id} />
                        <label className="flex flex-col gap-1">
                          <span className="label">Lordo (€)</span>
                          <input className="input" name="gross" defaultValue={euroInput(r.grossCents)} />
                        </label>
                        <label className="flex flex-col gap-1">
                          <span className="label">Commissione portale (€)</span>
                          <input className="input" name="ota" defaultValue={euroInput(r.otaCommissionCents)} />
                        </label>
                        <label className="flex flex-col gap-1">
                          <span className="label">di cui quota pulizie (€)</span>
                          <input className="input" name="cleaningFee" defaultValue={euroInput(r.guestCleaningFeeCents)} />
                        </label>
                        <label className="flex flex-col gap-1">
                          <span className="label">Tassa di soggiorno (€)</span>
                          <input className="input" name="touristTax" defaultValue={euroInput(r.touristTaxCents)} />
                        </label>
                        <label className="flex flex-col gap-1">
                          <span className="label">Orario di arrivo</span>
                          <input className="input" name="arrivalTime" placeholder="es. 17:30" defaultValue={r.arrivalTime ?? ""} />
                        </label>
                        <label className="flex flex-col gap-1">
                          <span className="label">Note</span>
                          <input className="input" name="notes" defaultValue={r.notes ?? ""} />
                        </label>
                        <div className="sm:col-span-2">
                          <button className="btn btn-sm btn-primary">Salva</button>
                        </div>
                      </form>
                    </details>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
      </Card>

      <Card title="Aggiungi una prenotazione diretta">
        <form action={manualReservationAction} className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:flex md:flex-wrap md:items-end">
          <Back to={here} />
          <label className="flex flex-col gap-1.5 sm:col-span-2 md:col-span-1">
            <span className="label">Appartamento</span>
            <select className="input md:min-w-52" name="apartmentId" defaultValue="" required>
              <option value="" disabled>
                Scegli…
              </option>
              {apts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.code} · {a.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="label">Check-in</span>
            <input className="input" type="date" name="checkin" required />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="label">Check-out</span>
            <input className="input" type="date" name="checkout" required />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="label">Ospiti</span>
            <input className="input md:w-24" type="number" min={1} name="guests" required />
          </label>
          <label className="flex flex-col gap-1.5 sm:col-span-2 md:col-span-1 md:flex-1">
            <span className="label">Note</span>
            <input className="input" name="notes" />
          </label>
          <div className="sm:col-span-2">
            <button className="btn btn-primary w-full md:w-auto">Aggiungi prenotazione</button>
          </div>
        </form>
        <p className="mt-4 text-xs text-slate-500">
          Per prenotazioni fuori dai portali. La pulizia viene creata e inviata all&apos;addetta come le altre.
        </p>
      </Card>
    </div>
  );
}
