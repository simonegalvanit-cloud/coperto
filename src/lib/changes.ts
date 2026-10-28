import "server-only";
import { eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";

/**
 * A short fingerprint of a restaurant's live data: it changes whenever a booking is added or edited
 * (on any device, or online by a guest), an area is closed or reopened, or the waitlist changes. Cheap enough to check every
 * few seconds, so screens refresh only when something actually changed.
 */
export async function changeStamp(restaurantId: string): Promise<string> {
  const db = await getDb();
  const [row] = await db
    .select({
      bookings: sql<string>`count(*)`,
      latest: sql<string | null>`max(${schema.reservations.updatedAt})`,
      closures: sql<string>`(select count(*) from ${schema.zoneClosures} where ${schema.zoneClosures.restaurantId} = ${restaurantId})`,
      // One number per waitlist status, so joining, being notified, seated or leaving all count as a change.
      waitlist: sql<string>`(select concat_ws('.', count(*) filter (where ${schema.waitlist.status} = 'waiting'), count(*) filter (where ${schema.waitlist.status} = 'notified'), count(*) filter (where ${schema.waitlist.status} = 'seated'), count(*) filter (where ${schema.waitlist.status} = 'left')) from ${schema.waitlist} where ${schema.waitlist.restaurantId} = ${restaurantId})`,
    })
    .from(schema.reservations)
    .where(eq(schema.reservations.restaurantId, restaurantId));
  return `${row.bookings}:${row.latest ?? ""}:${row.closures}:${row.waitlist}`;
}
