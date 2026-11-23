import type { ReactNode } from "react";
import { CLEANING_STATUS_LABEL, type CleaningStatus } from "@/domain/cleaning";

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-slate-600">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function Flash({ ok, errore }: { ok?: string; errore?: string }) {
  if (!ok && !errore) return null;
  return (
    <div
      role="status"
      className={`mb-5 rounded-md border px-4 py-3 text-sm ${
        errore ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"
      }`}
    >
      {errore ?? ok}
    </div>
  );
}

export function Card({ title, children, actions, className = "" }: { title?: ReactNode; children: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <section className={`card ${className}`}>
      {title ? (
        <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
          {actions}
        </div>
      ) : null}
      <div className="p-4">{children}</div>
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
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${STATUS_STYLE[status]}`}>
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
  return <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ${tones[tone]}`}>{children}</span>;
}

export function Stat({ label, value, tone }: { label: string; value: ReactNode; tone?: "red" | "amber" }) {
  const color = tone === "red" ? "text-red-700" : tone === "amber" ? "text-amber-700" : "text-slate-900";
  return (
    <div className="card px-4 py-3">
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${color}`}>{value}</div>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-sm text-slate-500">{children}</p>;
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
