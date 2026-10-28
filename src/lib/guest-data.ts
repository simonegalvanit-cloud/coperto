import "server-only";
import { asc, desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";

/** Everything a restaurant keeps about one guest: the profile, its bookings and the consent history (GDPR art. 15). */
export async function guestData(guestId: string) {
  const db = await getDb();
  const [[guest], bookings, consents] = await Promise.all([
    db.select().from(schema.guests).where(eq(schema.guests.id, guestId)),
    db
      .select({
        date: schema.reservations.date,
        time: schema.reservations.time,
        partySize: schema.reservations.partySize,
        status: schema.reservations.status,
        notes: schema.reservations.notes,
      })
      .from(schema.reservations)
      .where(eq(schema.reservations.guestId, guestId))
      .orderBy(desc(schema.reservations.date), desc(schema.reservations.time)),
    db.select().from(schema.consentLog).where(eq(schema.consentLog.guestId, guestId)).orderBy(asc(schema.consentLog.createdAt)),
  ]);
  return { guest, bookings, consents };
}
