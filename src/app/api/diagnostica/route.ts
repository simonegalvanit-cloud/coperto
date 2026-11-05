import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { databaseHealth } from "@/lib/health";

/**
 * Whether the database is set, reachable and up to date, where the server runs and how far the database is
 * (the time of a few trivial queries: every page makes several, so a slow round trip explains a slow app).
 * Reveals nothing about anyone's data, nor connection details.
 */
export async function GET() {
  const headers = { "Cache-Control": "no-store" };
  const health = await databaseHealth();
  const serverRegion = process.env.VERCEL_REGION ?? "local";
  if (!health.ok) return NextResponse.json({ serverRegion, database: health.message }, { status: 503, headers });

  const db = await getDb();
  const times: number[] = [];
  for (let i = 0; i < 5; i++) {
    const t = performance.now();
    await db.execute(sql`select 1`);
    times.push(Math.round(performance.now() - t));
  }
  times.sort((a, b) => a - b);
  const roundTrip = times[2];
  return NextResponse.json(
    {
      serverRegion,
      database: health.message,
      migrations: health.expected ? `${health.applied ?? "?"}/${health.expected}` : undefined,
      databaseRoundTripMs: roundTrip,
      verdict:
        roundTrip < 10
          ? "Ottimo: server e database sono vicini."
          : roundTrip < 40
            ? "Buono."
            : "Lento: server e database sono lontani. Metti il server nella stessa regione del database (vercel.json, regions).",
    },
    { headers },
  );
}
