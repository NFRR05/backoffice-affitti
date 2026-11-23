import Link from "next/link";
import { SearchX } from "lucide-react";

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-16 text-center">
      <span className="grid size-12 place-items-center rounded-full bg-slate-100 text-slate-500">
        <SearchX className="size-6" aria-hidden />
      </span>
      <h1 className="text-xl font-semibold text-slate-900">Pagina non trovata</h1>
      <p className="text-sm text-slate-600">La pagina che cerchi non esiste, o è stata spostata.</p>
      <Link className="btn btn-primary mt-2" href="/">
        Torna alla dashboard
      </Link>
    </div>
  );
}
