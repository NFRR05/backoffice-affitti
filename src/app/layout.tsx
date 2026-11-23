import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { getDb, dbMode } from "@/db/client";
import { getTenant } from "@/services/common";
import { env } from "@/lib/env";

export const metadata: Metadata = {
  title: "Back-office affitti",
  description: "Pulizie e rendiconti per affitti brevi",
};

export const dynamic = "force-dynamic";

const NAV = [
  { href: "/", label: "Dashboard" },
  { href: "/pulizie", label: "Pulizie" },
  { href: "/prenotazioni", label: "Prenotazioni" },
  { href: "/messaggi", label: "Messaggi" },
  { href: "/rendiconti", label: "Rendiconti" },
  { href: "/appartamenti", label: "Appartamenti" },
  { href: "/impostazioni", label: "Impostazioni" },
];

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const db = await getDb();
  const tenant = await getTenant(db);
  const simulated = !env.whatsapp.enabled;

  return (
    <html lang="it">
      <body>
        <div className="min-h-screen md:flex">
          <aside className="border-b border-slate-200 bg-white md:sticky md:top-0 md:h-screen md:w-56 md:shrink-0 md:border-b-0 md:border-r">
            <div className="px-4 py-4">
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">Back-office</div>
              <div className="truncate text-base font-semibold text-brand">{tenant?.name ?? "Affitti brevi"}</div>
            </div>
            <nav className="flex gap-1 overflow-x-auto px-2 pb-3 md:flex-col md:overflow-visible">
              {NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
            <div className="hidden px-4 pt-4 text-xs leading-5 text-slate-500 md:block">
              <div>Database: {dbMode() === "locale" ? "locale (PGlite)" : "PostgreSQL"}</div>
              <div>WhatsApp: {simulated ? "simulato" : "attivo"}</div>
              <div>Email: {env.smtp.enabled ? "SMTP" : "simulate"}</div>
            </div>
          </aside>
          <main className="min-w-0 flex-1 px-4 py-6 md:px-8">{children}</main>
        </div>
      </body>
    </html>
  );
}
