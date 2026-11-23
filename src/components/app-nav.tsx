"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { Building2, CalendarDays, House, MessageCircle, Receipt, Settings, Sparkles, type LucideIcon } from "lucide-react";

const ITEMS: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/", label: "Oggi", icon: House },
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

/** Desktop: colonna con icone. Telefono: schede di solo testo scorrevoli, con la pagina corrente sottolineata. */
export function AppNav({ variant }: { variant: "side" | "top" }) {
  const pathname = usePathname();
  const navRef = useRef<HTMLElement>(null);
  const side = variant === "side";

  // Sulle schede scorrevoli porta in vista la pagina corrente.
  useEffect(() => {
    const nav = navRef.current;
    if (side || !nav) return;
    const active = nav.querySelector<HTMLElement>('[aria-current="page"]');
    if (active) nav.scrollLeft = active.offsetLeft - nav.clientWidth / 2 + active.offsetWidth / 2;
  }, [pathname, side]);

  if (side) {
    return (
      <nav aria-label="Principale" className="flex flex-col gap-0.5 px-3">
        {ITEMS.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`flex h-9 items-center gap-3 rounded-lg border px-3 text-sm transition-colors ${
                active
                  ? "border-line bg-surface font-medium text-ink"
                  : "border-transparent text-ink-soft hover:bg-hover hover:text-ink"
              }`}
            >
              <Icon className={`size-[18px] shrink-0 ${active ? "text-ink" : "text-muted"}`} strokeWidth={1.75} aria-hidden />
              {label}
            </Link>
          );
        })}
      </nav>
    );
  }

  return (
    <nav ref={navRef} aria-label="Principale" className="scrollbar-none relative flex gap-5 overflow-x-auto px-4">
      {ITEMS.map(({ href, label }) => {
        const active = isActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`shrink-0 border-b-2 pt-1 pb-2.5 text-sm whitespace-nowrap transition-colors ${
              active ? "border-ink font-medium text-ink" : "border-transparent text-muted hover:text-ink"
            }`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
