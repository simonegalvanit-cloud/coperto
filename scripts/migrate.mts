// Applies pending migrations to DATABASE_URL. Runs before every production build;
// does nothing locally, where the embedded database migrates itself on startup.
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.log("DATABASE_URL not set, skipping migrations.");
  process.exit(0);
}
// prepare: false works through Supabase's transaction pooler, which has no prepared statements.
const client = postgres(url, { max: 1, prepare: false });
await migrate(drizzle(client), { migrationsFolder: "drizzle" });
await client.end();
console.log("Migrations applied.");
