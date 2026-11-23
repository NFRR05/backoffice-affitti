import { and, asc, eq, gte, lte } from "drizzle-orm";
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
      <PageHeader
        title="Prenotazioni"
        subtitle="Arrivano dai calendari iCal. Qui completi ospiti, importi e note."
      />
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
          <span className="label">Appartamento</span>
          <select className="input" name="appartamento" defaultValue={aptFilter}>
            <option value="">Tutti</option>
            {apts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.code} · {a.name}
              </option>
            ))}
          </select>
        </label>
        <button className="btn">Filtra</button>
      </form>

      <Card title={`${rows.length} prenotazioni`} className="mb-6">
        {rows.length === 0 ? <Empty>Nessuna prenotazione nel periodo.</Empty> : null}
        {rows.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Appartamento</th>
                  <th>Soggiorno</th>
                  <th>Canale</th>
                  <th>Ospiti</th>
                  <th>Importi</th>
                  <th>Stato</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ r, apt }) => (
                  <tr key={r.id} className={r.status === "cancellata" ? "opacity-60" : ""}>
                    <td>
                      <div className="font-medium">{apt.name}</div>
                      <div className="text-xs text-slate-500">codice {r.ref}</div>
                    </td>
                    <td className="whitespace-nowrap">
                      {formatShort(r.checkin)} → {formatShort(r.checkout)}
                      <div className="text-xs text-slate-500">
                        {diffDays(r.checkin, r.checkout)} notti{r.arrivalTime ? ` · arrivo ${r.arrivalTime}` : ""}
                      </div>
                    </td>
                    <td>
                      {CHANNEL[r.channel] ?? r.channel}
                      {r.externalCode ? <div className="text-xs text-slate-500">{r.externalCode}</div> : null}
                    </td>
                    <td>
                      {r.status === "cancellata" ? (
                        r.guests ?? "—"
                      ) : (
                        <form action={guestsAction} className="flex items-center gap-1">
                          <Back to={here} />
                          <input type="hidden" name="reservationId" value={r.id} />
                          <input
                            className={`input w-16 py-0.5 ${r.guests === null ? "border-amber-400 bg-amber-50" : ""}`}
                            type="number"
                            min={1}
                            max={30}
                            name="guests"
                            defaultValue={r.guests ?? ""}
                            aria-label="Numero di ospiti"
                          />
                          <button className="btn btn-sm">OK</button>
                        </form>
                      )}
                    </td>
                    <td className="min-w-56">
                      <div className="text-xs tabular-nums text-slate-600">
                        {r.grossCents !== null
                          ? `lordo ${formatEuro(r.grossCents)} · comm. ${formatEuro(r.otaCommissionCents ?? 0)}`
                          : r.status !== "cancellata"
                            ? "importi da inserire"
                            : "—"}
                      </div>
                      {r.status !== "cancellata" ? (
                        <details>
                          <summary className="cursor-pointer text-xs text-brand">Modifica importi e note</summary>
                          <form action={reservationDetailsAction} className="mt-2 grid grid-cols-2 gap-2">
                            <Back to={here} />
                            <input type="hidden" name="reservationId" value={r.id} />
                            <label className="flex flex-col gap-0.5">
                              <span className="label">Lordo (€)</span>
                              <input className="input py-0.5" name="gross" defaultValue={euroInput(r.grossCents)} />
                            </label>
                            <label className="flex flex-col gap-0.5">
                              <span className="label">Commissione portale (€)</span>
                              <input className="input py-0.5" name="ota" defaultValue={euroInput(r.otaCommissionCents)} />
                            </label>
                            <label className="flex flex-col gap-0.5">
                              <span className="label">di cui quota pulizie (€)</span>
                              <input className="input py-0.5" name="cleaningFee" defaultValue={euroInput(r.guestCleaningFeeCents)} />
                            </label>
                            <label className="flex flex-col gap-0.5">
                              <span className="label">Tassa di soggiorno (€)</span>
                              <input className="input py-0.5" name="touristTax" defaultValue={euroInput(r.touristTaxCents)} />
                            </label>
                            <label className="flex flex-col gap-0.5">
                              <span className="label">Orario di arrivo</span>
                              <input className="input py-0.5" name="arrivalTime" placeholder="es. 17:30" defaultValue={r.arrivalTime ?? ""} />
                            </label>
                            <label className="col-span-2 flex flex-col gap-0.5">
                              <span className="label">Note</span>
                              <input className="input py-0.5" name="notes" defaultValue={r.notes ?? ""} />
                            </label>
                            <div className="col-span-2">
                              <button className="btn btn-sm btn-primary">Salva</button>
                            </div>
                          </form>
                        </details>
                      ) : null}
                    </td>
                    <td>
                      <Pill tone={STATUS_TONE[r.status]}>{r.status.replace("_", " ")}</Pill>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </Card>

      <Card title="Aggiungi una prenotazione diretta">
        <form action={manualReservationAction} className="flex flex-wrap items-end gap-3">
          <Back to={here} />
          <label className="flex flex-col gap-1">
            <span className="label">Appartamento</span>
            <select className="input" name="apartmentId" defaultValue="" required>
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
          <label className="flex flex-col gap-1">
            <span className="label">Check-in</span>
            <input className="input" type="date" name="checkin" required />
          </label>
          <label className="flex flex-col gap-1">
            <span className="label">Check-out</span>
            <input className="input" type="date" name="checkout" required />
          </label>
          <label className="flex flex-col gap-1">
            <span className="label">Ospiti</span>
            <input className="input w-20" type="number" min={1} name="guests" required />
          </label>
          <label className="flex flex-col gap-1">
            <span className="label">Note</span>
            <input className="input" name="notes" />
          </label>
          <button className="btn btn-primary">Aggiungi</button>
        </form>
        <p className="mt-3 text-xs text-slate-500">
          Per prenotazioni fuori dai portali. La pulizia viene creata e inviata all&apos;addetta come le altre.
        </p>
      </Card>
    </div>
  );
}
