import { defineConfig } from "drizzle-kit";

// Genera le migrazioni SQL in ./drizzle a partire da src/db/schema.ts.
// Le stesse migrazioni valgono per il database locale (PGlite) e per Supabase.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
});
