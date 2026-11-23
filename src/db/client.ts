import path from "node:path";
import fs from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import { migrate as migratePostgres } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import * as schema from "./schema";
import { env } from "@/lib/env";

// Due modalità con lo stesso schema e le stesse query:
// - senza DATABASE_URL: PGlite, un PostgreSQL che gira dentro l'app, dati in ./data/pglite
// - con DATABASE_URL: PostgreSQL vero (Supabase, regione Francoforte)

export type DB = ReturnType<typeof drizzlePglite<typeof schema>>;

interface DbState {
  db: DB;
  ready: Promise<void>;
  mode: "locale" | "postgres";
}

const globalForDb = globalThis as unknown as { __backofficeDb?: DbState };

export const DATA_DIR = path.join(process.cwd(), "data");
const MIGRATIONS_DIR = path.join(process.cwd(), "drizzle");

function create(): DbState {
  const url = env.databaseUrl;
  if (url) {
    const client = postgres(url, { prepare: false, max: 5 });
    const db = drizzlePostgres(client, { schema }) as unknown as DB;
    // In produzione le migrazioni si lanciano con "npm run db:migrate".
    return { db, ready: Promise.resolve(), mode: "postgres" };
  }
  const dir = path.join(DATA_DIR, "pglite");
  fs.mkdirSync(dir, { recursive: true });
  const client = new PGlite(dir);
  const db = drizzlePglite(client, { schema });
  const ready = migratePglite(db, { migrationsFolder: MIGRATIONS_DIR });
  return { db, ready, mode: "locale" };
}

function state(): DbState {
  if (!globalForDb.__backofficeDb) globalForDb.__backofficeDb = create();
  return globalForDb.__backofficeDb;
}

/** Database pronto all'uso (in locale applica le migrazioni al primo accesso). */
export async function getDb(): Promise<DB> {
  const s = state();
  await s.ready;
  return s.db;
}

export function dbMode(): "locale" | "postgres" {
  return state().mode;
}

/** Usato da scripts/migrate.ts per Supabase/PostgreSQL. */
export async function migratePostgresDatabase(url: string): Promise<void> {
  const client = postgres(url, { prepare: false, max: 1 });
  try {
    await migratePostgres(drizzlePostgres(client), { migrationsFolder: MIGRATIONS_DIR });
  } finally {
    await client.end();
  }
}

export { schema };
