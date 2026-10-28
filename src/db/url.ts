/**
 * The Postgres connection string. DATABASE_URL when set by hand; POSTGRES_URL when added by
 * Vercel's Supabase or Neon integration.
 *
 * Integrations append hints like `supa=base-pooler.x` that postgres.js would send to the server
 * as session settings, which it rejects, so only `sslmode` is kept.
 */
export function databaseUrl(): string | undefined {
  const raw = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!raw) return undefined;
  const url = new URL(raw);
  for (const key of [...url.searchParams.keys()]) {
    if (key !== "sslmode") url.searchParams.delete(key);
  }
  return url.toString();
}
