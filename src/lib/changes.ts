import "server-only";
import { eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";

/**
 * A short fingerprint of a restaurant's live data: it changes whenever a booking is added or edited
 * (on any device, or online by a guest) or an area is closed or reopened. Cheap enough to check every
 * few seconds, so screens refresh only when something actually changed.
 */
export async function changeStamp(restaurantId: string): Promise<string> {
  const db = await getDb();
  const [row] = await db
    .select({
      bookings: sql<string>`count(*)`,
      latest: sql<string | null>`max(${schema.reservations.updatedAt})`,
      closures: sql<string>`(select count(*) from ${schema.zoneClosures} where ${schema.zoneClosures.restaurantId} = ${restaurantId})`,
    })
    .from(schema.reservations)
    .where(eq(schema.reservations.restaurantId, restaurantId));
  return `${row.bookings}:${row.latest ?? ""}:${row.closures}`;
}
