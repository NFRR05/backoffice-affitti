"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

const ITEMS: { href: string; label: string }[] = [
  { href: "/", label: "Oggi" },
  { href: "/pulizie", label: "Pulizie" },
  { href: "/prenotazioni", label: "Prenotazioni" },
  { href: "/messaggi", label: "Messaggi" },
  { href: "/rendiconti", label: "Rendiconti" },
  { href: "/appartamenti", label: "Appartamenti" },
  { href: "/impostazioni", label: "Impostazioni" },
];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

/** Schede orizzontali sotto l'intestazione: scorrevoli su telefono, pagina corrente sottolineata. */
export function AppNav() {
  const pathname = usePathname();
  const navRef = useRef<HTMLElement>(null);

  // Su telefono porta in vista la scheda corrente.
  useEffect(() => {
    const nav = navRef.current;
    if (!nav || nav.scrollWidth <= nav.clientWidth) return;
    const active = nav.querySelector<HTMLElement>('[aria-current="page"]');
    if (active) nav.scrollLeft = active.offsetLeft - nav.clientWidth / 2 + active.offsetWidth / 2;
  }, [pathname]);

  return (
    <nav ref={navRef} aria-label="Principale" className="scrollbar-none -mb-px flex overflow-x-auto">
      {ITEMS.map(({ href, label }) => {
        const active = isActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`group relative shrink-0 px-1 pb-3 pt-2 text-sm whitespace-nowrap transition-colors ${
              active ? "text-ink" : "text-muted hover:text-ink"
            }`}
          >
            <span className="block rounded-md px-2 py-1 transition-colors group-hover:bg-hover">{label}</span>
            <span
              aria-hidden
              className={`absolute inset-x-1 bottom-0 h-0.5 rounded-full transition-colors ${active ? "bg-ink" : "bg-transparent"}`}
            />
          </Link>
        );
      })}
    </nav>
  );
}
