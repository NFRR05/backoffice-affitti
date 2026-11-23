import Link from "next/link";

export default function NotFound() {
  return (
    <div className="max-w-xl py-6">
      <h1 className="font-serif text-[2.125rem] leading-[1.1] text-ink md:text-[2.5rem]">Pagina non trovata</h1>
      <p className="mt-3 text-[15px] leading-6 text-muted">La pagina che cerchi non esiste o è stata spostata.</p>
      <Link className="btn btn-primary mt-6" href="/">
        Torna alla pagina di oggi
      </Link>
    </div>
  );
}
