import fs from "node:fs/promises";
import path from "node:path";
import { and, eq, inArray, ne } from "drizzle-orm";
import type { DB } from "@/db/client";
import { apartments, icalFeeds, reservationEvents, reservations } from "@/db/schema";
import { parseIcs, toIncomingReservations, type Channel } from "@/domain/ical";
import { diffReservations } from "@/domain/reservations";
import { formatShort, todayRome } from "@/lib/dates";
import { alertManager, reconcileApartment } from "@/services/cleaning";
import { logActivity, settingsOf, type Tenant } from "@/services/common";

type Feed = typeof icalFeeds.$inferSelect;

export interface FeedResult {
  feedId: string;
  apartmentId: string;
  status: "ok" | "errore" | "bloccato" | "saltato";
  created: number;
  updated: number;
  cancelled: number;
  error?: string;
}

/** Legge un calendario: link http(s) dei portali, oppure "file:percorso" (usato dalla demo). */
export async function fetchCalendar(url: string): Promise<string> {
  if (url.startsWith("file:")) {
    const relative = url.slice("file:".length);
    return fs.readFile(path.resolve(/*turbopackIgnore: true*/ process.cwd(), relative), "utf8");
  }
  const response = await fetch(url, {
    headers: { "User-Agent": "Pronta/0.1 (+sincronizzazione calendario)" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const text = await response.text();
  if (!text.includes("BEGIN:VCALENDAR")) throw new Error("La risposta non è un calendario iCal");
  return text;
}

async function newRef(db: DB, tenantId: string): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const ref = String(1000 + Math.floor(Math.random() * 9000));
    const clash = await db
      .select({ id: reservations.id })
      .from(reservations)
      .where(and(eq(reservations.tenantId, tenantId), eq(reservations.ref, ref), ne(reservations.status, "cancellata")))
      .limit(1);
    if (clash.length === 0) return ref;
  }
  return String(Date.now()).slice(-4);
}

export async function syncFeed(db: DB, tenant: Tenant, feed: Feed, now: Date): Promise<FeedResult> {
  const today = todayRome(now);
  const base = { feedId: feed.id, apartmentId: feed.apartmentId, created: 0, updated: 0, cancelled: 0 };
  let text: string;
  try {
    text = await fetchCalendar(feed.url);
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await db
      .update(icalFeeds)
      .set({ lastSyncAt: now, lastStatus: "errore", lastError: error })
      .where(eq(icalFeeds.id, feed.id));
    return { ...base, status: "errore", error };
  }

  const events = parseIcs(text);
  const incoming = toIncomingReservations(feed.channel as Channel, events);
  const stored = await db.select().from(reservations).where(eq(reservations.feedId, feed.id));
  const diff = diffReservations(stored.filter((r) => r.externalUid !== null) as never, incoming, today);

  if (diff.safetyStop) {
    await db
      .update(icalFeeds)
      .set({
        lastSyncAt: now,
        lastStatus: "bloccato",
        lastError: "Calendario vuoto con prenotazioni future in archivio: nessuna cancellazione applicata.",
        lastEventCount: events.length,
      })
      .where(eq(icalFeeds.id, feed.id));
    return { ...base, status: "bloccato" };
  }

  for (const r of diff.toCreate) {
    const [row] = await db
      .insert(reservations)
      .values({
        tenantId: tenant.id,
        apartmentId: feed.apartmentId,
        feedId: feed.id,
        channel: feed.channel,
        ref: await newRef(db, tenant.id),
        externalUid: r.externalUid,
        externalCode: r.externalCode,
        checkin: r.checkin,
        checkout: r.checkout,
        status: r.checkout <= today ? "conclusa" : "confermata",
        source: "ical",
      })
      .returning();
    await db.insert(reservationEvents).values({
      tenantId: tenant.id,
      reservationId: row.id,
      kind: "creata",
      after: { checkin: r.checkin, checkout: r.checkout },
    });
  }

  for (const u of diff.toUpdate) {
    await db
      .update(reservations)
      .set({
        checkin: u.after.checkin,
        checkout: u.after.checkout,
        status: u.after.status,
        externalCode: u.externalCode ?? undefined,
        updatedAt: now,
      })
      .where(eq(reservations.id, u.id));
    await db
      .insert(reservationEvents)
      .values({ tenantId: tenant.id, reservationId: u.id, kind: "modificata", before: u.before, after: u.after });
  }

  if (diff.toCancel.length > 0) {
    await db
      .update(reservations)
      .set({ status: "cancellata", updatedAt: now })
      .where(inArray(reservations.id, diff.toCancel));
    await db
      .insert(reservationEvents)
      .values(diff.toCancel.map((id) => ({ tenantId: tenant.id, reservationId: id, kind: "cancellata" as const })));
  }
  if (diff.toConclude.length > 0) {
    await db.update(reservations).set({ status: "conclusa", updatedAt: now }).where(inArray(reservations.id, diff.toConclude));
  }
  if (diff.toVerify.length > 0) {
    await db
      .update(reservations)
      .set({ status: "da_verificare", updatedAt: now })
      .where(inArray(reservations.id, diff.toVerify));
    const [apt] = await db.select().from(apartments).where(eq(apartments.id, feed.apartmentId));
    for (const id of diff.toVerify) {
      const r = stored.find((s) => s.id === id);
      await db.insert(reservationEvents).values({ tenantId: tenant.id, reservationId: id, kind: "da_verificare" });
      await alertManager(
        db,
        tenant,
        apt?.name ?? "Appartamento",
        `La prenotazione ${r ? `${formatShort(r.checkin)} → ${formatShort(r.checkout)}` : ""} è in corso ma non compare più nel calendario ${feed.channel}: verifica se è stata accorciata o cancellata.`,
      );
    }
  }

  await db
    .update(icalFeeds)
    .set({ lastSyncAt: now, lastStatus: "ok", lastError: null, lastEventCount: events.length })
    .where(eq(icalFeeds.id, feed.id));

  return {
    ...base,
    status: "ok",
    created: diff.toCreate.length,
    updated: diff.toUpdate.length,
    cancelled: diff.toCancel.length,
  };
}

/** Legge i calendari scaduti (o tutti con force) e riallinea le pulizie degli appartamenti coinvolti. */
export async function syncAll(db: DB, tenant: Tenant, now: Date, force = false): Promise<FeedResult[]> {
  const interval = settingsOf(tenant).syncIntervalMinutes * 60_000;
  const feeds = await db.select().from(icalFeeds).where(eq(icalFeeds.tenantId, tenant.id));
  const results: FeedResult[] = [];
  for (const feed of feeds) {
    const due = force || !feed.lastSyncAt || now.getTime() - feed.lastSyncAt.getTime() >= interval;
    if (!due) {
      results.push({ feedId: feed.id, apartmentId: feed.apartmentId, status: "saltato", created: 0, updated: 0, cancelled: 0 });
      continue;
    }
    results.push(await syncFeed(db, tenant, feed, now));
  }
  const touched = new Set(results.filter((r) => r.status === "ok").map((r) => r.apartmentId));
  for (const apartmentId of touched) await reconcileApartment(db, tenant, apartmentId, now);
  const failed = results.filter((r) => r.status === "errore");
  if (failed.length > 0) {
    await logActivity(db, tenant.id, "sistema", "sincronizzazione_errori", "ical_feed", undefined, failed);
  }
  return results;
}
