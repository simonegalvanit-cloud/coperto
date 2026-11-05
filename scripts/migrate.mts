// Applies pending migrations to the production database. Runs before every production build;
// does nothing locally, where the embedded database migrates itself on startup.
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { databaseUrl } from "../src/db/url";

const url = databaseUrl();
if (!url) {
  // On Vercel a missing URL means the app would deploy against a database it can't reach or update: stop here
  // with a clear message rather than ship a site whose logins fail.
  if (process.env.VERCEL) {
    console.error(
      "DATABASE_URL is not set for this Vercel build. Add it in Vercel → Settings → Environment Variables, ticking " +
        "Production and Preview, then redeploy.",
    );
    process.exit(1);
  }
  console.log("No database URL set, skipping migrations.");
  process.exit(0);
}
// prepare: false works through Supabase's transaction pooler, which has no prepared statements.
const client = postgres(url, { max: 1, prepare: false, onnotice: () => {} });
await migrate(drizzle(client), { migrationsFolder: "drizzle" });
await client.end();
console.log("Migrations applied.");
