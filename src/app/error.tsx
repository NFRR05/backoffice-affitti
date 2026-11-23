"use client";

import Link from "next/link";
import { TriangleAlert } from "lucide-react";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-lg rounded-xl border border-red-200 bg-white p-6 shadow-xs">
      <div className="flex items-start gap-4">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-red-50 text-red-700">
          <TriangleAlert className="size-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <h1 className="text-base font-semibold text-slate-900">Qualcosa non ha funzionato</h1>
          <p className="mt-1 text-sm break-words text-slate-600">{error.message}</p>
          <p className="mt-2 text-sm text-slate-600">
            Puoi riprovare. Se il problema continua, vai alle Impostazioni per caricare la demo o importare la configurazione.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" className="btn btn-primary" onClick={reset}>
              Riprova
            </button>
            <Link className="btn" href="/impostazioni">
              Impostazioni
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
