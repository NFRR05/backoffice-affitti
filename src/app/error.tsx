"use client";

import Link from "next/link";

export default function ErrorPage({ error }: { error: Error & { digest?: string } }) {
  return (
    <div className="max-w-xl rounded-lg border border-red-200 bg-white p-6">
      <h1 className="text-lg font-semibold text-red-800">Qualcosa non ha funzionato</h1>
      <p className="mt-2 text-sm text-slate-700">{error.message}</p>
      <p className="mt-4 text-sm">
        <Link className="text-brand underline" href="/impostazioni">
          Vai alle Impostazioni
        </Link>{" "}
        per caricare la demo o importare la configurazione.
      </p>
    </div>
  );
}
