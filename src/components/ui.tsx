import Link from "next/link";
import type { ReactNode } from "react";
import { Check, CircleCheck, TriangleAlert } from "lucide-react";
import type { CleaningStatus } from "@/domain/cleaning";
import { addDays, formatShort } from "@/lib/dates";

/* ------------------------------------------------------------------ */
/* Struttura della pagina                                              */
/* ------------------------------------------------------------------ */

/** Titolo della pagina (serif), una riga di descrizione, azioni a destra. */
export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-8 flex flex-col gap-4 md:mb-10 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        <h1 className="font-serif text-[2.125rem] leading-[1.1] text-ink md:text-[2.5rem]">{title}</h1>
        {description ? <div className="mt-2 max-w-2xl text-[15px] leading-6 text-muted">{description}</div> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

/** Blocco di contenuto: titolo, descrizione facoltativa, azioni. Con `flush` il contenuto gestisce i propri margini (liste). */
export function Section({
  title,
  description,
  actions,
  children,
  flush = false,
  className = "",
  id,
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  flush?: boolean;
  className?: string;
  id?: string;
}) {
  return (
    <section id={id} className={`card ${className}`}>
      {title ? (
        <div className="flex flex-col gap-3 border-b border-line px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-ink">{title}</h2>
            {description ? <p className="mt-0.5 text-sm text-muted">{description}</p> : null}
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}
      <div className={flush ? "" : "p-5"}>{children}</div>
    </section>
  );
}

/** Numero chiave. Se ha `href` è un collegamento alla vista filtrata. */
export function Metric({
  label,
  value,
  hint,
  href,
  tone,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  href?: string;
  tone?: "warn" | "bad";
}) {
  const color = tone === "bad" ? "text-bad" : tone === "warn" ? "text-warn" : "text-ink";
  const body = (
    <>
      <div className="text-[13px] font-medium text-muted">{label}</div>
      <div className={`mt-2 font-serif text-[1.75rem] leading-none break-words sm:text-[2.25rem] ${color}`}>{value}</div>
      {hint ? <div className="mt-2 text-[13px] text-muted">{hint}</div> : null}
    </>
  );
  return href ? (
    <Link href={href} className="card block min-w-0 p-5 transition-colors hover:border-line-strong">
      {body}
    </Link>
  ) : (
    <div className="card min-w-0 p-5">{body}</div>
  );
}

/** Campo di un modulo con etichetta sopra. */
export function Field({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={`flex flex-col gap-1.5 ${className}`}>
      <span className="label">{label}</span>
      {children}
    </label>
  );
}

/** Scelte rapide (periodi, filtri) come controllo a segmenti. */
export function Segmented({ label, items }: { label: string; items: { label: string; href: string; active: boolean }[] }) {
  return (
    <nav aria-label={label} className="scrollbar-none inline-flex max-w-full overflow-x-auto rounded-lg border border-line-strong bg-surface p-0.5">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={item.active ? "true" : undefined}
          className={`inline-flex h-9 shrink-0 items-center rounded-md px-3 text-[13px] font-medium whitespace-nowrap transition-colors md:h-8 ${
            item.active ? "bg-ink text-white" : "text-ink-soft hover:bg-hover hover:text-ink"
          }`}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

export function Empty({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="px-5 py-12 text-center">
      <p className="text-sm text-muted">{children}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function Flash({ ok, errore }: { ok?: string; errore?: string }) {
  if (!ok && !errore) return null;
  const isError = Boolean(errore);
  const Icon = isError ? TriangleAlert : CircleCheck;
  return (
    <div
      role={isError ? "alert" : "status"}
      className={`mb-6 flex items-start gap-3 rounded-lg px-4 py-3 text-sm ${isError ? "bg-bad-soft text-bad" : "bg-ok-soft text-ok"}`}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <p className="font-medium">{errore ?? ok}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Stati: solo testo colorato                                          */
/* ------------------------------------------------------------------ */

const CLEANING_STATUS: Record<CleaningStatus, { label: string; className: string }> = {
  creato: { label: "Da inviare", className: "text-ink-soft" },
  inviato: { label: "In attesa di risposta", className: "text-warn" },
  confermato: { label: "Confermata", className: "text-ink" },
  completato: { label: "Fatta", className: "text-ok" },
  escalation: { label: "Da riassegnare", className: "text-bad" },
  annullato: { label: "Annullata", className: "text-faint line-through" },
};

export const CLEANING_STATUS_ORDER: CleaningStatus[] = ["creato", "inviato", "confermato", "escalation", "completato", "annullato"];

export function cleaningStatusLabel(status: CleaningStatus): string {
  return CLEANING_STATUS[status].label;
}

export function cleaningStatusClass(status: CleaningStatus): string {
  return CLEANING_STATUS[status].className;
}

export function CleaningStatusText({ status, small }: { status: CleaningStatus; small?: boolean }) {
  const s = CLEANING_STATUS[status];
  return <span className={`${small ? "text-[13px]" : "text-sm"} font-medium ${s.className}`}>{s.label}</span>;
}

const RESERVATION_STATUS = {
  confermata: { label: "Confermata", className: "text-ink" },
  conclusa: { label: "Conclusa", className: "text-muted" },
  cancellata: { label: "Cancellata", className: "text-faint line-through" },
  da_verificare: { label: "Da verificare", className: "text-warn" },
} as const;

export function ReservationStatusText({ status, small }: { status: keyof typeof RESERVATION_STATUS; small?: boolean }) {
  const s = RESERVATION_STATUS[status];
  return <span className={`${small ? "text-[13px]" : "text-sm"} font-medium ${s.className}`}>{s.label}</span>;
}

const STATEMENT_STATUS = {
  bozza: { label: "Bozza", className: "text-warn" },
  verificato: { label: "Verificato", className: "text-ink" },
  inviato: { label: "Inviato", className: "text-ok" },
} as const;

export function StatementStatusText({ status, small }: { status: keyof typeof STATEMENT_STATUS; small?: boolean }) {
  const s = STATEMENT_STATUS[status];
  return <span className={`${small ? "text-[13px]" : "text-sm"} font-medium ${s.className}`}>{s.label}</span>;
}

const STATEMENT_STEPS = [
  { key: "bozza", label: "Bozza", hint: "Si può ricalcolare" },
  { key: "verificato", label: "Verificato", hint: "Dati congelati" },
  { key: "inviato", label: "Inviato", hint: "PDF archiviato e spedito" },
] as const;

/** A che punto è il rendiconto: bozza, verificato, inviato. */
export function StatementSteps({ status }: { status: "bozza" | "verificato" | "inviato" }) {
  const current = STATEMENT_STEPS.findIndex((s) => s.key === status);
  return (
    <ol className="mb-8 grid gap-2 sm:grid-cols-3" aria-label="Avanzamento del rendiconto">
      {STATEMENT_STEPS.map((step, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li
            key={step.key}
            aria-current={active ? "step" : undefined}
            className={`flex items-center gap-3 rounded-lg border px-4 py-3 ${
              active ? "border-ink bg-surface" : "border-line bg-transparent"
            }`}
          >
            <span
              className={`grid size-7 shrink-0 place-items-center rounded-full text-[13px] font-semibold ${
                active ? "bg-ink text-white" : done ? "bg-ok-soft text-ok" : "bg-hover text-faint"
              }`}
            >
              {done ? <Check className="size-4" aria-label="Completato" /> : i + 1}
            </span>
            <span className="min-w-0">
              <span className={`block text-sm font-semibold ${active ? "text-ink" : done ? "text-ink-soft" : "text-faint"}`}>{step.label}</span>
              <span className={`block text-[13px] ${active ? "text-muted" : "text-faint"}`}>{step.hint}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/* ------------------------------------------------------------------ */
/* Utilità                                                             */
/* ------------------------------------------------------------------ */

/** "Oggi, lun 23/11", "Domani, mar 24/11", "Mer 25/11" */
export function dayLabel(date: string, today: string): string {
  const short = formatShort(date);
  if (date === today) return `Oggi, ${short}`;
  if (date === addDays(today, 1)) return `Domani, ${short}`;
  return short.charAt(0).toUpperCase() + short.slice(1);
}

export function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Campo nascosto "back": dopo l'azione si torna alla stessa pagina con gli stessi filtri. */
export function Back({ to }: { to: string }) {
  return <input type="hidden" name="back" value={to} />;
}

export type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export function param(sp: Record<string, string | string[] | undefined>, key: string): string | undefined {
  const v = sp[key];
  return Array.isArray(v) ? v[0] : v;
}
