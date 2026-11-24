import Link from "next/link";
import type { ReactNode } from "react";
import { Check, CircleCheck, TriangleAlert } from "lucide-react";
import type { CleaningStatus } from "@/domain/cleaning";
import { addDays, formatShort } from "@/lib/dates";

/* ------------------------------------------------------------------ */
/* Struttura della pagina                                              */
/* ------------------------------------------------------------------ */

/** Titolo della pagina, una riga di descrizione, azioni a destra. */
export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-[-0.03em] text-ink md:text-[2rem] md:leading-10">{title}</h1>
        {description ? <div className="mt-1.5 max-w-2xl text-sm leading-6 text-muted">{description}</div> : null}
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
        <div className="flex flex-col gap-3 border-b border-line px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold tracking-tight text-ink">{title}</h2>
            {description ? <p className="mt-0.5 text-[13px] text-muted">{description}</p> : null}
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
      <div className="text-[13px] text-muted">{label}</div>
      <div className={`mt-2 text-[1.75rem] leading-none font-semibold tracking-[-0.04em] tabular-nums break-words ${color}`}>{value}</div>
      {hint ? <div className="mt-2 text-[13px] text-muted">{hint}</div> : null}
    </>
  );
  return href ? (
    <Link href={href} className="card block min-w-0 p-4 transition-colors hover:border-line-strong hover:bg-[#fcfcfc] md:p-5">
      {body}
    </Link>
  ) : (
    <div className="card min-w-0 p-4 md:p-5">{body}</div>
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
    <nav aria-label={label} className="scrollbar-none inline-flex max-w-full overflow-x-auto rounded-md border border-line bg-paper p-0.5">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={item.active ? "true" : undefined}
          className={`inline-flex h-9 shrink-0 items-center rounded-[5px] px-3 text-[13px] font-medium whitespace-nowrap transition-colors md:h-7 ${
            item.active ? "bg-surface text-ink shadow-[0_0_0_1px_var(--color-line),0_1px_2px_rgba(0,0,0,0.06)]" : "text-muted hover:text-ink"
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
      className={`mb-6 flex items-start gap-3 rounded-md border px-4 py-3 text-sm ${
        isError ? "border-bad/20 bg-bad-soft text-bad" : "border-ok/20 bg-ok-soft text-ok"
      }`}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <p className="font-medium">{errore ?? ok}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Stati: pallino colorato + etichetta                                 */
/* ------------------------------------------------------------------ */

type StatusStyle = { label: string; dot: string; text: string };

const CLEANING_STATUS: Record<CleaningStatus, StatusStyle> = {
  creato: { label: "Da inviare", dot: "bg-faint", text: "text-ink-soft" },
  inviato: { label: "In attesa di risposta", dot: "bg-warn", text: "text-warn" },
  confermato: { label: "Confermata", dot: "bg-info", text: "text-ink" },
  completato: { label: "Fatta", dot: "bg-ok", text: "text-ok" },
  escalation: { label: "Da riassegnare", dot: "bg-bad", text: "text-bad" },
  annullato: { label: "Annullata", dot: "border border-faint bg-transparent", text: "text-faint line-through" },
};

export const CLEANING_STATUS_ORDER: CleaningStatus[] = ["creato", "inviato", "confermato", "escalation", "completato", "annullato"];

export function cleaningStatusLabel(status: CleaningStatus): string {
  return CLEANING_STATUS[status].label;
}

/** Colore del testo per lo stato (calendari e liste compatte). */
export function cleaningStatusClass(status: CleaningStatus): string {
  return CLEANING_STATUS[status].text;
}

/** Classe del pallino per lo stato. */
export function cleaningStatusDot(status: CleaningStatus): string {
  return CLEANING_STATUS[status].dot;
}

function StatusLabel({ style, small }: { style: StatusStyle; small?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-2 ${small ? "text-[13px]" : "text-sm"} font-medium text-ink-soft`}>
      <span className={`dot ${style.dot}`} aria-hidden />
      <span className={style.text === "text-ink" || style.text === "text-ink-soft" ? "" : style.text}>{style.label}</span>
    </span>
  );
}

export function CleaningStatusText({ status, small }: { status: CleaningStatus; small?: boolean }) {
  return <StatusLabel style={CLEANING_STATUS[status]} small={small} />;
}

const RESERVATION_STATUS = {
  confermata: { label: "Confermata", dot: "bg-ok", text: "text-ink" },
  conclusa: { label: "Conclusa", dot: "bg-faint", text: "text-muted" },
  cancellata: { label: "Cancellata", dot: "border border-faint bg-transparent", text: "text-faint line-through" },
  da_verificare: { label: "Da verificare", dot: "bg-warn", text: "text-warn" },
} as const satisfies Record<string, StatusStyle>;

export function ReservationStatusText({ status, small }: { status: keyof typeof RESERVATION_STATUS; small?: boolean }) {
  return <StatusLabel style={RESERVATION_STATUS[status]} small={small} />;
}

const STATEMENT_STATUS = {
  bozza: { label: "Bozza", dot: "bg-warn", text: "text-ink" },
  verificato: { label: "Verificato", dot: "bg-info", text: "text-ink" },
  inviato: { label: "Inviato", dot: "bg-ok", text: "text-ink" },
} as const satisfies Record<string, StatusStyle>;

export function StatementStatusText({ status, small }: { status: keyof typeof STATEMENT_STATUS; small?: boolean }) {
  return <StatusLabel style={STATEMENT_STATUS[status]} small={small} />;
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
            className={`flex items-center gap-3 rounded-md border px-4 py-3 ${
              active ? "border-ink bg-surface shadow-[0_1px_2px_rgba(0,0,0,0.05)]" : "border-line bg-transparent"
            }`}
          >
            <span
              className={`grid size-6 shrink-0 place-items-center rounded-full text-[12px] font-semibold tabular-nums ${
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
