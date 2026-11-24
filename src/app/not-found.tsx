import Link from "next/link";

export default function NotFound() {
  return (
    <div className="max-w-xl py-6">
      <h1 className="text-2xl font-semibold tracking-[-0.03em] text-ink md:text-[2rem]">Pagina non trovata</h1>
      <p className="mt-3 text-[15px] leading-6 text-muted">La pagina che cerchi non esiste o è stata spostata.</p>
      <Link className="btn btn-primary mt-6" href="/">
        Torna alla pagina di oggi
      </Link>
    </div>
  );
}
