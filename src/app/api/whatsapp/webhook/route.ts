import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { env } from "@/lib/env";
import { handleIncoming } from "@/services/incoming";
import { parseMetaWebhook, verifyMetaSignature } from "@/services/whatsapp";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Verifica dell'URL del webhook da parte di Meta (una tantum, in configurazione). */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  if (
    params.get("hub.mode") === "subscribe" &&
    env.whatsapp.verifyToken &&
    params.get("hub.verify_token") === env.whatsapp.verifyToken
  ) {
    return new Response(params.get("hub.challenge") ?? "", { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

/** Risposte delle addette e del gestore: pulsanti, testo, foto. */
export async function POST(request: Request) {
  const raw = await request.text();
  if (!(await verifyMetaSignature(raw, request.headers.get("x-hub-signature-256")))) {
    return new Response("Firma non valida", { status: 401 });
  }
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return new Response("JSON non valido", { status: 400 });
  }
  const db = await getDb();
  for (const message of parseMetaWebhook(body)) {
    try {
      await handleIncoming(db, message);
    } catch (e) {
      console.error("Errore nel messaggio in arrivo", e);
    }
  }
  // Meta richiede sempre una risposta 200 rapida, anche per gli aggiornamenti di stato.
  return NextResponse.json({ ok: true });
}
