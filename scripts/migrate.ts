// Applica le migrazioni a un PostgreSQL vero (es. Supabase).
// In locale (PGlite) non serve: l'app le applica da sola all'avvio.
//
//   DATABASE_URL=postgresql://... npm run db:migrate

import { migratePostgresDatabase } from "@/db/client";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("Imposta DATABASE_URL (stringa di connessione di Supabase) prima di lanciare le migrazioni.");
  process.exit(1);
}

migratePostgresDatabase(url)
  .then(() => console.log("Migrazioni applicate."))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
