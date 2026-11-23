import { env } from "@/lib/env";
import type { DB } from "@/db/client";
import { whatsappMessages } from "@/db/schema";
import type { OutgoingMessage } from "@/domain/messages";
import { normalizePhone } from "@/services/common";

export interface SendOptions {
  tenantId: string;
  phone: string;
  contactName?: string | null;
  message: OutgoingMessage;
  cleaningJobId?: string | null;
  reservationId?: string | null;
}

/**
 * Invia un messaggio WhatsApp. Senza credenziali Meta il messaggio viene solo
 * registrato come "simulato": lo vedi nella pagina Messaggi e puoi simulare le risposte.
 * Con le credenziali usa i modelli approvati (obbligatori fuori dalla finestra di 24 ore).
 */
export async function sendWhatsApp(db: DB, opts: SendOptions) {
  const phone = normalizePhone(opts.phone);
  let status: "simulato" | "inviato" | "errore" = "simulato";
  let providerId: string | null = null;
  let error: string | null = null;

  if (env.whatsapp.enabled) {
    try {
      providerId = await sendTemplate(phone, opts.message);
      status = "inviato";
    } catch (e) {
      status = "errore";
      error = e instanceof Error ? e.message : String(e);
    }
  }

  const [row] = await db
    .insert(whatsappMessages)
    .values({
      tenantId: opts.tenantId,
      direction: "out",
      phone,
      contactName: opts.contactName ?? null,
      kind: opts.message.kind,
      cleaningJobId: opts.cleaningJobId ?? null,
      reservationId: opts.reservationId ?? null,
      body: opts.message.text,
      buttons: opts.message.buttons,
      status,
      providerId,
      error,
    })
    .returning();
  return row;
}

async function sendTemplate(phone: string, message: OutgoingMessage): Promise<string> {
  const { token, phoneNumberId, graphVersion, templateLanguage } = env.whatsapp;
  const components: unknown[] = [
    { type: "body", parameters: message.template.params.map((text) => ({ type: "text", text })) },
    ...message.buttons.map((b, index) => ({
      type: "button",
      sub_type: "quick_reply",
      index: String(index),
      parameters: [{ type: "payload", payload: b.id }],
    })),
  ];
  const response = await fetch(`https://graph.facebook.com/${graphVersion}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: phone,
      type: "template",
      template: { name: message.template.name, language: { code: templateLanguage }, components },
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const data = (await response.json().catch(() => ({}))) as { messages?: { id: string }[]; error?: { message?: string } };
  if (!response.ok) throw new Error(data.error?.message ?? `HTTP ${response.status}`);
  return data.messages?.[0]?.id ?? "";
}

/** Verifica la firma X-Hub-Signature-256 dei webhook Meta. */
export async function verifyMetaSignature(rawBody: string, signatureHeader: string | null): Promise<boolean> {
  const secret = env.whatsapp.appSecret;
  if (!secret) return true; // In locale/simulazione non c'è firma da verificare.
  if (!signatureHeader?.startsWith("sha256=")) return false;
  const { createHmac, timingSafeEqual } = await import("node:crypto");
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const received = signatureHeader.slice("sha256=".length);
  if (expected.length !== received.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(received));
}

export interface IncomingWhatsApp {
  from: string;
  name?: string | null;
  type: "button" | "text" | "image" | "altro";
  payload?: string;
  text?: string;
  mediaId?: string;
}

/** Estrae i messaggi in arrivo dal formato dei webhook Meta. */
export function parseMetaWebhook(body: unknown): IncomingWhatsApp[] {
  const result: IncomingWhatsApp[] = [];
  const entries = (body as { entry?: { changes?: { value?: Record<string, unknown> }[] }[] })?.entry ?? [];
  for (const entry of entries) {
    for (const change of entry.changes ?? []) {
      const value = change.value as
        | {
            contacts?: { wa_id: string; profile?: { name?: string } }[];
            messages?: {
              from: string;
              type: string;
              text?: { body: string };
              button?: { payload: string; text: string };
              interactive?: { button_reply?: { id: string } };
              image?: { id: string };
            }[];
          }
        | undefined;
      for (const m of value?.messages ?? []) {
        const name = value?.contacts?.find((c) => c.wa_id === m.from)?.profile?.name ?? null;
        if (m.type === "button" && m.button) result.push({ from: m.from, name, type: "button", payload: m.button.payload });
        else if (m.type === "interactive" && m.interactive?.button_reply)
          result.push({ from: m.from, name, type: "button", payload: m.interactive.button_reply.id });
        else if (m.type === "text" && m.text) result.push({ from: m.from, name, type: "text", text: m.text.body });
        else if (m.type === "image" && m.image) result.push({ from: m.from, name, type: "image", mediaId: m.image.id });
        else result.push({ from: m.from, name, type: "altro" });
      }
    }
  }
  return result;
}
