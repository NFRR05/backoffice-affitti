// Cancella il database locale e carica i dati demo (8 appartamenti inventati).
// Da lanciare con l'app FERMA: il database locale può essere aperto da un solo processo.
//
//   npm run demo

import { getDb } from "@/db/client";
import { loadDemo } from "@/services/demo";

getDb()
  .then((db) => loadDemo(db))
  .then(() => {
    console.log("Dati demo caricati. Ora avvia l'app con: npm run dev");
    process.exit(0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
