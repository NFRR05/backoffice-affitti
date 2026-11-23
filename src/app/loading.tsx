export default function Loading() {
  return (
    <div className="animate-pulse space-y-6" role="status" aria-live="polite">
      <span className="sr-only">Caricamento in corso…</span>
      <div className="space-y-2">
        <div className="h-7 w-48 rounded-md bg-slate-200" />
        <div className="h-4 w-72 max-w-full rounded bg-slate-200" />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="h-20 rounded-xl border border-slate-200/80 bg-white" />
        ))}
      </div>
      <div className="h-72 rounded-xl border border-slate-200/80 bg-white" />
    </div>
  );
}
