"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { Building2, CalendarDays, LayoutDashboard, MessageCircle, Receipt, Settings, Sparkles, type LucideIcon } from "lucide-react";

const ITEMS: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/pulizie", label: "Pulizie", icon: Sparkles },
  { href: "/prenotazioni", label: "Prenotazioni", icon: CalendarDays },
  { href: "/messaggi", label: "Messaggi", icon: MessageCircle },
  { href: "/rendiconti", label: "Rendiconti", icon: Receipt },
  { href: "/appartamenti", label: "Appartamenti", icon: Building2 },
  { href: "/impostazioni", label: "Impostazioni", icon: Settings },
];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

/** Navigazione: verticale in colonna laterale (desktop), a pillole scorrevoli in alto (telefono). */
export function AppNav({ variant }: { variant: "side" | "top" }) {
  const pathname = usePathname();
  const navRef = useRef<HTMLElement>(null);
  const side = variant === "side";

  // Sulla barra scorrevole porta la pagina attiva al centro, così si vede sempre dove sei.
  useEffect(() => {
    const nav = navRef.current;
    if (side || !nav) return;
    const active = nav.querySelector<HTMLElement>('[aria-current="page"]');
    if (!active) return;
    nav.scrollLeft = active.offsetLeft - nav.clientWidth / 2 + active.offsetWidth / 2;
  }, [pathname, side]);

  return (
    <nav
      ref={navRef}
      aria-label="Principale"
      className={side ? "flex flex-col gap-0.5 px-3" : "scrollbar-none relative flex gap-1.5 overflow-x-auto px-4 pb-3"}
    >
      {ITEMS.map(({ href, label, icon: Icon }) => {
        const active = isActive(pathname, href);
        const className = side
          ? `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              active ? "bg-brand-soft text-brand" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            }`
          : `inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-medium whitespace-nowrap transition-colors ${
              active ? "bg-brand text-white shadow-sm" : "bg-white text-slate-700 ring-1 ring-inset ring-slate-200 hover:bg-slate-50"
            }`;
        return (
          <Link key={href} href={href} aria-current={active ? "page" : undefined} className={className}>
            <Icon className="size-4 shrink-0" aria-hidden />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
