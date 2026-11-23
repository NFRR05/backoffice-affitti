import type { Metadata, Viewport } from "next";
import "@fontsource-variable/instrument-sans";
import "@fontsource/instrument-serif";
import "./globals.css";
import { getDb, dbMode } from "@/db/client";
import { getTenant } from "@/services/common";
import { env } from "@/lib/env";
import { AppNav } from "@/components/app-nav";

export const metadata: Metadata = {
  title: "Back-office affitti",
  description: "Pulizie e rendiconti per affitti brevi",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f6f5f1",
};

export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const db = await getDb();
  const tenant = await getTenant(db);
  const name = tenant?.name ?? "Affitti brevi";

  // Una sola frase sullo stato dei servizi, e solo quando qualcosa è simulato.
  const fakeWhatsapp = !env.whatsapp.enabled;
  const fakeEmail = !env.smtp.enabled;
  const systemNote =
    fakeWhatsapp && fakeEmail
      ? "Modalità prova: WhatsApp ed email sono simulati, nessun messaggio parte davvero."
      : fakeWhatsapp
        ? "Modalità prova: WhatsApp è simulato, nessun messaggio parte davvero."
        : fakeEmail
          ? "Modalità prova: l'email è simulata, i rendiconti non partono davvero."
          : null;

  return (
    <html lang="it">
      <body className="min-h-dvh">
        <a href="#contenuto" className="skip-link">
          Vai al contenuto
        </a>

        <div className="md:flex md:min-h-dvh">
          <header className="sticky top-0 z-30 border-b border-line bg-paper/95 backdrop-blur md:hidden">
            <div className="px-4 pt-4 pb-2">
              <div className="truncate font-serif text-xl leading-tight text-ink">{name}</div>
            </div>
            <AppNav variant="top" />
          </header>

          <aside className="hidden md:sticky md:top-0 md:flex md:h-dvh md:w-60 md:shrink-0 md:flex-col md:border-r md:border-line">
            <div className="px-6 pt-7 pb-6">
              <div className="font-serif text-[1.375rem] leading-tight text-ink">{name}</div>
              <div className="mt-1 text-[13px] text-muted">Pulizie e rendiconti</div>
            </div>

            <AppNav variant="side" />

            <div className="mt-auto space-y-2 px-6 py-6 text-[12px] leading-5 text-muted">
              {systemNote ? <p>{systemNote}</p> : null}
              <p>{dbMode() === "locale" ? "Dati salvati su questo computer." : "Dati su PostgreSQL."}</p>
            </div>
          </aside>

          <main id="contenuto" className="min-w-0 flex-1 px-4 pt-6 pb-16 md:px-10 md:pt-10">
            <div className="mx-auto w-full max-w-6xl">{children}</div>
          </main>
        </div>
      </body>
    </html>
  );
}
