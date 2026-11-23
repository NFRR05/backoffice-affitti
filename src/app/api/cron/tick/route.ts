import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { env } from "@/lib/env";
import { runTick } from "@/services/tick";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Attività pianificata: lettura calendari, domande ospiti, invii, escalation, promemoria.
// In locale la chiama "npm run worker"; su Vercel un cron (vedi README).

async function handle(request: Request) {
  const secret = env.cronSecret;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }
  if (!secret && env.databaseUrl) {
    return NextResponse.json({ error: "Imposta CRON_SECRET prima di usare un database remoto." }, { status: 401 });
  }
  try {
    const db = await getDb();
    const force = new URL(request.url).searchParams.get("forza") === "1";
    return NextResponse.json(await runTick(db, new Date(), { forceSync: force }));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
