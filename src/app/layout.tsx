import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import Link from "next/link";
import "./globals.css";
import { getDb, dbMode } from "@/db/client";
import { getTenant } from "@/services/common";
import { env } from "@/lib/env";
import { AppNav } from "@/components/app-nav";
import { ProntaMark } from "@/components/brand";

export const metadata: Metadata = {
  title: { default: "Pronta", template: "%s · Pronta" },
  description: "Pulizie via WhatsApp e rendiconti mensili per gli affitti brevi.",
  applicationName: "Pronta",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#ffffff",
};

export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const db = await getDb();
  const tenant = await getTenant(db);
  const name = tenant?.name ?? "Affitti brevi";

  // Una sola nota sullo stato dei servizi, e solo quando qualcosa è simulato.
  const fakeWhatsapp = !env.whatsapp.enabled;
  const fakeEmail = !env.smtp.enabled;
  const systemNote =
    fakeWhatsapp && fakeEmail
      ? "WhatsApp ed email sono simulati: nessun messaggio parte davvero."
      : fakeWhatsapp
        ? "WhatsApp è simulato: nessun messaggio parte davvero."
        : fakeEmail
          ? "L'email è simulata: i rendiconti non partono davvero."
          : null;
  const storage = dbMode() === "locale" ? "Dati salvati su questo computer." : "Dati su PostgreSQL.";

  return (
    <html lang="it" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="min-h-dvh">
        <a href="#contenuto" className="skip-link">
          Vai al contenuto
        </a>

        <header className="sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-surface/80">
          <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-3 px-4 md:px-6">
            <Link href="/" className="flex shrink-0 items-center gap-1.5 rounded-md" aria-label="Pronta, vai a Oggi">
              <ProntaMark className="size-6 shrink-0" />
              <span className="hidden text-[17px] leading-none font-semibold tracking-[-0.045em] text-ink sm:inline">
                pronta
              </span>
            </Link>
            <svg viewBox="0 0 16 24" className="h-6 w-4 shrink-0 text-line-strong" aria-hidden focusable="false">
              <path d="M11 3 5 21" stroke="currentColor" strokeWidth={1.25} strokeLinecap="round" fill="none" />
            </svg>
            <span className="min-w-0 truncate text-sm font-medium text-ink" title={name}>
              {name}
            </span>

            {systemNote ? (
              <span
                title={`${systemNote} ${storage}`}
                className="ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-[12px] font-medium text-ink-soft"
              >
                <span className="dot bg-warn" aria-hidden />
                Modalità prova
              </span>
            ) : (
              <span className="ml-auto hidden text-[12px] text-muted sm:inline">{storage}</span>
            )}
          </div>
          <div className="mx-auto w-full max-w-6xl px-2 md:px-4">
            <AppNav />
          </div>
        </header>

        <main id="contenuto" className="mx-auto w-full max-w-6xl px-4 pt-8 pb-16 md:px-6 md:pt-10">
          {children}
        </main>

        <footer className="mx-auto w-full max-w-6xl px-4 pb-8 text-[12px] text-faint md:px-6">
          {systemNote ? `${systemNote} ` : ""}
          {storage}
        </footer>
      </body>
    </html>
  );
}
