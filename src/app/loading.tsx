export default function Loading() {
  return (
    <div className="animate-pulse" role="status" aria-live="polite">
      <span className="sr-only">Caricamento in corso</span>
      <div className="mb-10 space-y-3">
        <div className="h-9 w-64 max-w-full rounded-lg bg-hover" />
        <div className="h-4 w-96 max-w-full rounded bg-hover" />
      </div>
      <div className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="card h-28" />
        ))}
      </div>
      <div className="card h-80" />
    </div>
  );
}
