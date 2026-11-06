import "server-only";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { databaseUrl } from "@/db/url";

/** How many migrations the code expects, from drizzle/meta/_journal.json. */
function expectedMigrations(): number | null {
  try {
    const journal = JSON.parse(readFileSync(join(process.cwd(), "drizzle/meta/_journal.json"), "utf8"));
    return journal.entries.length;
  } catch {
    return null;
  }
}

/**
 * Whether the database is set, reachable and up to date, in plain words. Used by the diagnostic page and to
 * explain a failed login. Reveals no data and no connection details.
 */
export async function databaseHealth() {
  const configured = !!databaseUrl() || !process.env.VERCEL;
  if (!configured) {
    return { ok: false, problem: "no-url" as const, message: "DATABASE_URL non è impostato su Vercel (Settings → Environment Variables), per questo ambiente." };
  }
  let db;
  try {
    db = await getDb();
    await db.execute(sql`select 1`);
  } catch (err) {
    return { ok: false, problem: "unreachable" as const, message: `Il database non risponde: ${short(err)}` };
  }
  const expected = expectedMigrations();
  let applied: number | null = null;
  try {
    const rows = await db.execute<{ n: number }>(sql`select count(*)::int as n from drizzle.__drizzle_migrations`);
    applied = Number(rows[0]?.n ?? 0);
  } catch {
    // Local embedded database: migrations run on startup, and the table may live elsewhere.
  }
  if (applied !== null && expected !== null && applied < expected) {
    return {
      ok: false,
      problem: "outdated" as const,
      message: `Il database non è aggiornato: ${applied} aggiornamenti su ${expected}. Rifai il deploy su Vercel con DATABASE_URL disponibile anche durante la build.`,
    };
  }
  return { ok: true, problem: null, message: "Database raggiungibile e aggiornato.", applied, expected };
}

/** The first line of an error, without anything that looks like a connection string. */
function short(err: unknown) {
  const text = err instanceof Error ? err.message : String(err);
  return text.split("\n")[0].replace(/postgres(ql)?:\/\/\S+/gi, "[connessione]").slice(0, 200);
}
