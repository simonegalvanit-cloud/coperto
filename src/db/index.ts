import "server-only";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "./schema";

export type DB = PostgresJsDatabase<typeof schema>;

// With DATABASE_URL set (production) we talk to a real Postgres server.
// Without it (local development) we run an embedded Postgres stored in .data/,
// so the app works with zero setup. Both expose the same Drizzle API.
async function connect(): Promise<DB> {
  const url = process.env.DATABASE_URL;
  if (url) {
    const { drizzle } = await import("drizzle-orm/postgres-js");
    const postgres = (await import("postgres")).default;
    // prepare: false keeps it compatible with Supabase's transaction pooler.
    return drizzle(postgres(url, { prepare: false }), { schema });
  }
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const dir = process.env.PGLITE_DIR ?? ".data/pglite";
  const { mkdirSync } = await import("node:fs");
  mkdirSync(dir, { recursive: true });
  const db = drizzle(new PGlite(dir), { schema });
  await migrate(db, { migrationsFolder: "drizzle" });
  return db as unknown as DB;
}

// Kept on globalThis so dev hot reloads reuse one connection instead of opening a new one per edit.
const g = globalThis as unknown as { __coperto_db?: Promise<DB> };

export function getDb(): Promise<DB> {
  // A failed connection is forgotten so the next request retries instead of failing forever.
  g.__coperto_db ??= connect().catch((err) => {
    g.__coperto_db = undefined;
    throw err;
  });
  return g.__coperto_db;
}

export { schema };
