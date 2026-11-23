import { describe, expect, it } from "vitest";
import { extractAirbnbCode, parseIcs, toIncomingReservations } from "@/domain/ical";
import { diffReservations, type StoredReservation } from "@/domain/reservations";
import { deriveCleaningPlan, diffSnapshot, toSnapshot } from "@/domain/cleaning";
import { computeCleaningCost, type PriceList } from "@/domain/cost";
import { easterSunday, isHoliday } from "@/domain/holidays";
import { computeStatement, contractParamsSchema } from "@/domain/statement";
import {
  changeMessage,
  newCleaningMessage,
  parseButtonPayload,
  parseCleanerText,
  parseGuestsReply,
} from "@/domain/messages";
import { formatEuro, parseEuro, splitByShares } from "@/lib/money";
import { addDays, periodBounds, romeParts } from "@/lib/dates";

const AIRBNB_ICS = [
  "BEGIN:VCALENDAR",
  "PRODID:-//Airbnb Inc//Hosting Calendar 1.0//EN",
  "BEGIN:VEVENT",
  "DTEND;VALUE=DATE:20261125",
  "DTSTART;VALUE=DATE:20261122",
  "UID:1418fb94e984-aaa@airbnb.com",
  "DESCRIPTION:Reservation URL: https://www.airbnb.com/hosting/reservations/details/HMABC12345\\nPhone",
  "  Number (Last 4 Digits): 5555",
  "SUMMARY:Reserved",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "DTEND;VALUE=DATE:20261201",
  "DTSTART;VALUE=DATE:20261128",
  "UID:1418fb94e984-bbb@airbnb.com",
  "SUMMARY:Airbnb (Not available)",
  "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n");

const BOOKING_ICS = [
  "BEGIN:VCALENDAR",
  "BEGIN:VEVENT",
  "DTSTART;VALUE=DATE:20261125",
  "DTEND;VALUE=DATE:20261127",
  "UID:7bc4a2@booking.com",
  "SUMMARY:CLOSED - Not available",
  "END:VEVENT",
  "END:VCALENDAR",
].join("\n");

describe("iCal", () => {
  it("legge eventi Airbnb, unisce le righe spezzate e ignora i blocchi", () => {
    const events = parseIcs(AIRBNB_ICS);
    expect(events).toHaveLength(2);
    expect(events[0].description).toContain("Phone Number");
    const res = toIncomingReservations("airbnb", events);
    expect(res).toEqual([
      { externalUid: "1418fb94e984-aaa@airbnb.com", externalCode: "HMABC12345", checkin: "2026-11-22", checkout: "2026-11-25" },
    ]);
  });

  it("considera ogni evento Booking una prenotazione", () => {
    const res = toIncomingReservations("booking", parseIcs(BOOKING_ICS));
    expect(res).toEqual([{ externalUid: "7bc4a2@booking.com", externalCode: null, checkin: "2026-11-25", checkout: "2026-11-27" }]);
  });

  it("converte gli orari UTC nel giorno di Roma", () => {
    const ics = "BEGIN:VEVENT\nUID:x\nSUMMARY:Reserved\nDTSTART:20261121T233000Z\nDTEND:20261123T090000Z\nEND:VEVENT";
    const [e] = parseIcs(ics);
    expect(e.start).toBe("2026-11-22");
    expect(e.end).toBe("2026-11-23");
  });

  it("estrae il codice Airbnb anche dal vecchio formato del link", () => {
    expect(extractAirbnbCode("https://www.airbnb.com/reservation/itinerary?code=HMLXEJLGWY")).toBe("HMLXEJLGWY");
  });
});

describe("Confronto prenotazioni", () => {
  const today = "2026-11-21";
  const stored = (over: Partial<StoredReservation>): StoredReservation => ({
    id: "r1",
    externalUid: "u1",
    checkin: "2026-11-25",
    checkout: "2026-11-28",
    status: "confermata",
    ...over,
  });

  it("crea, modifica e cancella", () => {
    const diff = diffReservations(
      [stored({ id: "a", externalUid: "a" }), stored({ id: "b", externalUid: "b" })],
      [
        { externalUid: "a", externalCode: null, checkin: "2026-11-26", checkout: "2026-11-28" },
        { externalUid: "c", externalCode: null, checkin: "2026-12-01", checkout: "2026-12-03" },
      ],
      today,
    );
    expect(diff.toCreate.map((r) => r.externalUid)).toEqual(["c"]);
    expect(diff.toUpdate[0].after.checkin).toBe("2026-11-26");
    expect(diff.toCancel).toEqual(["b"]);
  });

  it("non cancella le prenotazioni passate o in corso che spariscono dal calendario", () => {
    const diff = diffReservations(
      [
        stored({ id: "past", externalUid: "p", checkin: "2026-11-10", checkout: "2026-11-15" }),
        stored({ id: "now", externalUid: "n", checkin: "2026-11-20", checkout: "2026-11-23" }),
        stored({ id: "fut", externalUid: "f" }),
      ],
      [{ externalUid: "f", externalCode: null, checkin: "2026-11-25", checkout: "2026-11-28" }],
      today,
    );
    expect(diff.toConclude).toEqual(["past"]);
    expect(diff.toVerify).toEqual(["now"]);
    expect(diff.toCancel).toEqual([]);
  });

  it("si ferma se il calendario arriva vuoto", () => {
    const diff = diffReservations([stored({})], [], today);
    expect(diff.safetyStop).toBe(true);
    expect(diff.toCancel).toEqual([]);
  });

  it("riattiva una prenotazione cancellata che ricompare", () => {
    const diff = diffReservations(
      [stored({ status: "cancellata" })],
      [{ externalUid: "u1", externalCode: null, checkin: "2026-11-25", checkout: "2026-11-28" }],
      today,
    );
    expect(diff.toUpdate[0].after.status).toBe("confermata");
  });
});

describe("Piano pulizie", () => {
  const apt = { checkinTime: "15:00", checkoutTime: "10:00", defaultLinenSets: 2 };

  it("riconosce il cambio in giornata e usa gli ospiti in arrivo per la biancheria", () => {
    const plan = deriveCleaningPlan(apt, [
      { id: "a", checkin: "2026-11-20", checkout: "2026-11-22", guests: 2, status: "confermata" },
      { id: "b", checkin: "2026-11-22", checkout: "2026-11-25", guests: 4, status: "confermata" },
      { id: "c", checkin: "2026-11-27", checkout: "2026-11-29", guests: null, status: "confermata" },
      { id: "x", checkin: "2026-11-25", checkout: "2026-11-26", guests: 1, status: "cancellata" },
    ]);
    expect(plan).toHaveLength(3);
    const [a, b, c] = plan;
    expect(a).toMatchObject({ date: "2026-11-22", sameDay: true, windowEnd: "15:00", guestsOut: 2, guestsIn: 4, linenSets: 4 });
    expect(b).toMatchObject({ date: "2026-11-25", sameDay: false, windowEnd: null, nextCheckin: "2026-11-27", guestsIn: null, linenSets: 2 });
    expect(c).toMatchObject({ nextReservationId: null, nextCheckin: null });
  });

  it("descrive le modifiche da comunicare", () => {
    const [before] = deriveCleaningPlan(apt, [
      { id: "a", checkin: "2026-11-20", checkout: "2026-11-22", guests: 2, status: "confermata" },
    ]);
    const after = { ...toSnapshot(before), date: "2026-11-23", guestsOut: 3 };
    const changes = diffSnapshot(toSnapshot(before), after);
    expect(changes.map((c) => c.label)).toEqual(["Data", "Ospiti in uscita"]);
    expect(changes[0]).toMatchObject({ before: "dom 22/11", after: "lun 23/11" });
  });
});

describe("Costo pulizie e festivi", () => {
  const pl: PriceList = {
    baseCents: 4500,
    guestThreshold: 2,
    extraGuestCents: 500,
    linenSetCents: 800,
    holidayMode: "percentuale",
    holidayValue: 2000,
    includeSundays: false,
  };
  const input = { guestsOut: 4, guestsIn: 2, linenSets: 2, extraCents: 0, extraNote: null };

  it("calcola base, supplementi e biancheria", () => {
    const r = computeCleaningCost(pl, { ...input, date: "2026-11-24" });
    expect(r.totalCents).toBe(4500 + 1000 + 1600);
  });

  it("applica la maggiorazione nei festivi nazionali", () => {
    const r = computeCleaningCost(pl, { ...input, date: "2026-12-25" });
    expect(r.lines.at(-1)).toEqual({ label: "Maggiorazione festivo", cents: 1100 });
  });

  it("conosce Pasqua, Pasquetta e il 4 ottobre dal 2026", () => {
    expect(easterSunday(2027)).toBe("2027-03-28");
    expect(isHoliday("2027-03-29", { includeSundays: false })).toBe(true);
    expect(isHoliday("2027-10-04", { includeSundays: false })).toBe(true);
    expect(isHoliday("2025-10-04", { includeSundays: false })).toBe(false);
    expect(isHoliday("2026-11-22", { includeSundays: true })).toBe(true);
    expect(isHoliday("2026-12-07", { includeSundays: false, extraHolidays: ["12-07"] })).toBe(true);
  });
});

describe("Rendiconto", () => {
  const reservation = {
    id: "r1",
    label: "Airbnb · 03/11–06/11",
    channel: "airbnb",
    checkin: "2026-11-03",
    checkout: "2026-11-06",
    grossCents: 400_000,
    otaCommissionCents: 50_000,
    guestCleaningFeeCents: 6_000,
    touristTaxCents: 1_200,
  };
  const base = {
    period: "2026-11",
    reservations: [reservation],
    cleanings: [{ id: "c1", date: "2026-11-06", costCents: 45_000 }],
    expenses: [],
    owners: [{ id: "o1", name: "Mario Rossi", shareBps: 10_000 }],
  };

  it("riproduce l'esempio del piano: 3.500 netti, 450 pulizie, 20% + IVA → 2.196 €", () => {
    const r = computeStatement({ ...base, contract: contractParamsSchema.parse({}) });
    expect(r.totals.netCents).toBe(350_000);
    expect(r.totals.commissionCents).toBe(70_000);
    expect(r.totals.vatCents).toBe(15_400);
    expect(r.totals.ownerPayoutCents).toBe(219_600);
    expect(r.totals.managerInvoiceCents).toBe(85_400);
    expect(r.summary.at(-1)).toMatchObject({ kind: "info", cents: 1_200 });
  });

  it("trattiene la quota pulizie degli ospiti quando è un rimborso al gestore", () => {
    const r = computeStatement({
      ...base,
      contract: contractParamsSchema.parse({ guestCleaningFee: "rimborso_gestore", cleaningCostsBorneBy: "gestore" }),
    });
    // base = 3.500 − 60 = 3.440 → commissione 688, IVA 151,36
    expect(r.totals.commissionCents).toBe(68_800);
    expect(r.totals.vatCents).toBe(15_136);
    expect(r.totals.ownerPayoutCents).toBe(350_000 - 6_000 - 68_800 - 15_136);
  });

  it("applica il minimo garantito e il regime forfettario", () => {
    const r = computeStatement({
      ...base,
      contract: contractParamsSchema.parse({
        commissionType: "percentuale_con_minimo",
        commissionRateBps: 1000,
        minimumCents: 50_000,
        vatRateBps: 0,
      }),
    });
    expect(r.totals.commissionCents).toBe(50_000);
    expect(r.totals.vatCents).toBe(0);
  });

  it("ripartisce per notti tra due mesi", () => {
    const r = computeStatement({
      ...base,
      reservations: [{ ...reservation, checkin: "2026-11-29", checkout: "2026-12-03" }],
      contract: contractParamsSchema.parse({ attribution: "notti" }),
    });
    expect(r.reservationLines[0].nightsInPeriod).toBe(2);
    expect(r.totals.grossCents).toBe(200_000);
  });

  it("segnala le prenotazioni senza importi e la ritenuta da validare", () => {
    const r = computeStatement({
      ...base,
      reservations: [{ ...reservation, grossCents: null }],
      contract: contractParamsSchema.parse({ withholding: { enabled: true } }),
    });
    expect(r.reservationLines).toHaveLength(0);
    expect(r.warnings.join(" ")).toContain("importi mancanti");
    expect(r.warnings.join(" ")).toContain("commercialista");
  });

  it("divide tra comproprietari senza perdere centesimi", () => {
    const r = computeStatement({
      ...base,
      owners: [
        { id: "a", name: "A", shareBps: 3333 },
        { id: "b", name: "B", shareBps: 3333 },
        { id: "c", name: "C", shareBps: 3334 },
      ],
      contract: contractParamsSchema.parse({}),
    });
    expect(r.ownerSplit.reduce((s, o) => s + o.amountCents, 0)).toBe(r.totals.ownerPayoutCents);
  });
});

describe("Messaggi", () => {
  it("riconosce pulsanti, risposte scritte e numero di ospiti", () => {
    expect(parseButtonPayload("job:abc-1:confirm")).toEqual({ jobId: "abc-1", action: "confirm" });
    expect(parseCleanerText("Fatto!")).toBe("done");
    expect(parseCleanerText("non posso domani")).toBe("decline");
    expect(parseGuestsReply("4821 3")).toEqual({ ref: "4821", guests: 3 });
    expect(parseGuestsReply("3")).toEqual({ ref: null, guests: 3 });
    expect(parseGuestsReply("ciao")).toBeNull();
  });

  it("non mette a capo nei parametri dei modelli Meta", () => {
    const s = {
      date: "2026-11-22",
      windowStart: "10:00",
      windowEnd: "15:00",
      sameDay: true,
      guestsOut: 2,
      guestsIn: 4,
      linenSets: 4,
      nextCheckin: "2026-11-22",
    };
    const m1 = newCleaningMessage("j1", "Appartamento 1", s, "lasciare la culla montata");
    const m2 = changeMessage("j1", "Appartamento 1", [{ field: "date", label: "Data", before: "a", after: "b" }]);
    for (const m of [m1, m2]) for (const p of m.template.params) expect(p).not.toMatch(/\n/);
    expect(m1.text).toContain("CAMBIO IN GIORNATA");
    expect(m1.text).toContain("Escono 2 ospiti · entrano 4 ospiti · 4 set biancheria");
    const m3 = newCleaningMessage("j1", "Appartamento 1", { ...s, guestsOut: 1, guestsIn: null }, null);
    expect(m3.text).toContain("Esce 1 ospite · entrano: ospiti da confermare");
  });
});

describe("Utilità", () => {
  it("gestisce importi e date", () => {
    expect(parseEuro("2.196,00")).toBe(219_600);
    expect(parseEuro("45.5")).toBe(4_550);
    expect(parseEuro("abc")).toBeNull();
    expect(formatEuro(219_600).replace(/\s/g, " ")).toBe("2.196,00 €");
    expect(splitByShares(1001, [5000, 5000])).toEqual([501, 500]);
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(periodBounds("2026-12")).toEqual({ first: "2026-12-01", last: "2026-12-31", nextFirst: "2027-01-01" });
    expect(romeParts(new Date("2026-07-01T22:30:00Z")).date).toBe("2026-07-02");
  });
});
