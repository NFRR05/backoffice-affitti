import { env } from "@/lib/env";

export interface EmailMessage {
  to: string[];
  subject: string;
  text: string;
  attachments?: { filename: string; content: Buffer }[];
}

/** Invia un'email via SMTP. Senza SMTP configurato l'invio è simulato (il PDF resta comunque in archivio). */
export async function sendEmail(message: EmailMessage): Promise<{ simulated: boolean }> {
  if (!env.smtp.enabled) {
    console.info(`[email simulata] a ${message.to.join(", ")} — ${message.subject}`);
    return { simulated: true };
  }
  const nodemailer = await import("nodemailer");
  const transport = nodemailer.createTransport({
    host: env.smtp.host,
    port: env.smtp.port,
    secure: env.smtp.port === 465,
    auth: env.smtp.user ? { user: env.smtp.user, pass: env.smtp.password } : undefined,
  });
  await transport.sendMail({
    from: env.smtp.from,
    to: message.to.join(", "),
    subject: message.subject,
    text: message.text,
    attachments: message.attachments,
  });
  return { simulated: false };
}
