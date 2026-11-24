"use client";

import Link from "next/link";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="max-w-xl py-6">
      <h1 className="text-2xl font-semibold tracking-[-0.03em] text-ink md:text-[2rem]">Qualcosa non ha funzionato</h1>
      <p className="mt-3 text-[15px] leading-6 break-words text-bad">{error.message}</p>
      <p className="mt-3 text-[15px] leading-6 text-muted">
        Riprova. Se il problema continua, dalle Impostazioni puoi caricare la demo o reimportare la configurazione.
      </p>
      <div className="mt-6 flex flex-wrap gap-2">
        <button type="button" className="btn btn-primary" onClick={reset}>
          Riprova
        </button>
        <Link className="btn" href="/impostazioni">
          Vai alle Impostazioni
        </Link>
      </div>
    </div>
  );
}
