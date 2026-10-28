import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getDb } from "@/db";

/**
 * Where the server runs and how far the database is: the time of a few trivial queries. Every page makes
 * several, so a slow round trip here explains a slow app. Reveals nothing about anyone's data.
 */
export async function GET() {
  const db = await getDb();
  await db.execute(sql`select 1`); // open the connection first, so it isn't counted
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
      serverRegion: process.env.VERCEL_REGION ?? "local",
      databaseRoundTripMs: roundTrip,
      verdict:
        roundTrip < 10
          ? "Ottimo: server e database sono vicini."
          : roundTrip < 40
            ? "Buono."
            : "Lento: server e database sono lontani. Metti il server nella stessa regione del database (vercel.json, regions).",
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
