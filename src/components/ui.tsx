import type { ReactNode } from "react";
import { Check, CircleCheck, Inbox, ListChecks, Pencil, Send, TriangleAlert, type LucideIcon } from "lucide-react";
import { CLEANING_STATUS_LABEL, type CleaningStatus } from "@/domain/cleaning";

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
        {subtitle ? <div className="mt-1 text-sm text-slate-500">{subtitle}</div> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
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
      className={`mb-5 flex items-start gap-3 rounded-lg border px-4 py-3 text-sm ${
        isError ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-900"
      }`}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <p>{errore ?? ok}</p>
    </div>
  );
}

export function Card({
  title,
  children,
  actions,
  className = "",
}: {
  title?: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <section className={`card ${className}`}>
      {title ? (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/80 px-5 py-3.5">
          <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
          {actions}
        </header>
      ) : null}
      <div className="p-5">{children}</div>
    </section>
  );
}

const STATUS_STYLE: Record<CleaningStatus, string> = {
  creato: "bg-slate-100 text-slate-700 ring-slate-300",
  inviato: "bg-amber-50 text-amber-800 ring-amber-300",
  confermato: "bg-sky-50 text-sky-800 ring-sky-300",
  completato: "bg-emerald-50 text-emerald-800 ring-emerald-300",
  escalation: "bg-red-50 text-red-800 ring-red-300",
  annullato: "bg-slate-50 text-slate-400 ring-slate-200 line-through",
};

export function StatusBadge({ status }: { status: CleaningStatus }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset ${STATUS_STYLE[status]}`}
    >
      <span className="size-1.5 rounded-full bg-current opacity-70" aria-hidden />
      {CLEANING_STATUS_LABEL[status]}
    </span>
  );
}

export function Pill({ children, tone = "slate" }: { children: ReactNode; tone?: "slate" | "brand" | "red" | "amber" | "green" }) {
  const tones = {
    slate: "bg-slate-100 text-slate-700",
    brand: "bg-brand-soft text-brand",
    red: "bg-red-100 text-red-800",
    amber: "bg-amber-100 text-amber-900",
    green: "bg-emerald-100 text-emerald-800",
  };
  return (
    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap ${tones[tone]}`}>{children}</span>
  );
}

const STAT_TONE = {
  neutral: { box: "bg-slate-100 text-slate-600", value: "text-slate-900" },
  amber: { box: "bg-amber-100 text-amber-700", value: "text-amber-700" },
  red: { box: "bg-red-100 text-red-700", value: "text-red-700" },
} as const;

export function Stat({ label, value, tone, icon: Icon }: { label: string; value: ReactNode; tone?: "red" | "amber"; icon?: LucideIcon }) {
  const t = tone ? STAT_TONE[tone] : STAT_TONE.neutral;
  return (
    <div className="card flex min-w-0 items-start gap-3 p-4">
      {Icon ? (
        <span className={`grid size-9 shrink-0 place-items-center rounded-lg ${t.box}`}>
          <Icon className="size-4" aria-hidden />
        </span>
      ) : null}
      <div className="min-w-0">
        <div className="text-xs font-medium text-slate-500">{label}</div>
        <div className={`mt-0.5 text-xl font-semibold break-words tabular-nums md:text-2xl ${t.value}`}>{value}</div>
      </div>
    </div>
  );
}

export function Empty({ children, icon: Icon = Inbox }: { children: ReactNode; icon?: LucideIcon }) {
  return (
    <div className="flex flex-col items-center gap-2 py-8 text-center">
      <span className="grid size-10 place-items-center rounded-full bg-slate-100 text-slate-400">
        <Icon className="size-5" aria-hidden />
      </span>
      <p className="text-sm text-slate-500">{children}</p>
    </div>
  );
}

const STATEMENT_STEPS = [
  { key: "bozza", label: "Bozza", hint: "Ricalcolabile", icon: Pencil },
  { key: "verificato", label: "Verificato", hint: "Dati congelati", icon: ListChecks },
  { key: "inviato", label: "Inviato", hint: "PDF archiviato e spedito", icon: Send },
] as const;

/** Mostra a che punto è il rendiconto: bozza → verificato → inviato. */
export function StatementSteps({ status }: { status: "bozza" | "verificato" | "inviato" }) {
  const current = STATEMENT_STEPS.findIndex((s) => s.key === status);
  return (
    <ol className="mb-5 grid gap-2 sm:grid-cols-3" aria-label="Avanzamento del rendiconto">
      {STATEMENT_STEPS.map((step, i) => {
        const done = i < current;
        const active = i === current;
        const StepIcon = step.icon;
        return (
          <li
            key={step.key}
            aria-current={active ? "step" : undefined}
            className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 ${
              active ? "border-brand bg-brand-soft" : done ? "border-emerald-200 bg-emerald-50/60" : "border-slate-200 bg-white"
            }`}
          >
            <span
              className={`grid size-8 shrink-0 place-items-center rounded-full ${
                active ? "bg-brand text-white" : done ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-400"
              }`}
            >
              {done ? <Check className="size-4" aria-hidden /> : <StepIcon className="size-4" aria-hidden />}
            </span>
            <span className="min-w-0">
              <span className={`block text-sm font-semibold ${active ? "text-brand" : done ? "text-emerald-800" : "text-slate-500"}`}>
                {step.label}
              </span>
              <span className="block text-xs text-slate-500">{step.hint}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
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
