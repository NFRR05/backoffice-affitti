import type { Metadata, Viewport } from "next";
import { Building2 } from "lucide-react";
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
  themeColor: "#1f4e79",
};

export const dynamic = "force-dynamic";

function StatusLine({ label, value, live }: { label: string; value: string; live: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`size-1.5 shrink-0 rounded-full ${live ? "bg-emerald-500" : "bg-amber-400"}`} aria-hidden />
      <span className="text-slate-400">{label}</span>
      <span className="truncate text-slate-600">{value}</span>
    </div>
  );
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const db = await getDb();
  const tenant = await getTenant(db);
  const simulated = !env.whatsapp.enabled;
  const name = tenant?.name ?? "Affitti brevi";

  return (
    <html lang="it">
      <body className="min-h-dvh">
        <a href="#contenuto" className="skip-link">
          Vai al contenuto
        </a>

        <div className="md:flex md:min-h-dvh">
          {/* Telefono: intestazione fissa con marchio e navigazione a pillole. */}
          <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/85 md:hidden">
            <div className="flex items-center gap-3 px-4 pt-3 pb-2.5">
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-brand text-white">
                <Building2 className="size-4" aria-hidden />
              </span>
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-slate-900">{name}</div>
                <div className="text-[11px] leading-none text-slate-400">Back-office</div>
              </div>
            </div>
            <AppNav variant="top" />
          </header>

          {/* Desktop: colonna laterale fissa con stato dei servizi in fondo. */}
          <aside className="hidden md:sticky md:top-0 md:flex md:h-dvh md:w-64 md:shrink-0 md:flex-col md:border-r md:border-slate-200 md:bg-white">
            <div className="flex items-center gap-3 px-5 pt-6 pb-5">
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand text-white shadow-sm">
                <Building2 className="size-5" aria-hidden />
              </span>
              <div className="min-w-0">
                <div className="text-[11px] font-semibold tracking-[0.12em] text-slate-400 uppercase">Back-office</div>
                <div className="truncate text-sm font-semibold text-slate-900">{name}</div>
              </div>
            </div>

            <AppNav variant="side" />

            <div className="mt-auto space-y-1.5 border-t border-slate-100 px-5 py-4 text-xs">
              <StatusLine
                label="Database"
                value={dbMode() === "locale" ? "locale" : "PostgreSQL"}
                live={dbMode() !== "locale"}
              />
              <StatusLine label="WhatsApp" value={simulated ? "simulato" : "attivo"} live={!simulated} />
              <StatusLine label="Email" value={env.smtp.enabled ? "SMTP" : "simulate"} live={env.smtp.enabled} />
            </div>
          </aside>

          <main id="contenuto" className="min-w-0 flex-1 px-4 pt-5 pb-12 md:px-10 md:py-8">
            <div className="mx-auto w-full max-w-6xl">{children}</div>
          </main>
        </div>
      </body>
    </html>
  );
}
