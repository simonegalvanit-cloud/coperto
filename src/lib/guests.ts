import "server-only";
import { and, eq, inArray, isNotNull, lt, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { isSameDay } from "./contact";

const VISIT = sql`${schema.reservations.status} in ('seated', 'completed')`;

/** Visits, no-shows and cancellations per guest, counting only bookings before `before` if given. */
export async function guestCounts(restaurantId: string, guestIds: string[], before?: string) {
  if (!guestIds.length) return new Map<string, { visits: number; noShows: number; cancellations: number; lastVisit: string | null }>();
  const db = await getDb();
  const r = schema.reservations;
  const rows = await db
    .select({
      guestId: r.guestId,
      visits: sql<number>`count(*) filter (where ${VISIT})`.mapWith(Number),
      noShows: sql<number>`count(*) filter (where ${r.status} = 'no_show')`.mapWith(Number),
      cancellations: sql<number>`count(*) filter (where ${r.status} = 'cancelled')`.mapWith(Number),
      lastVisit: sql<string | null>`max(${r.date}) filter (where ${VISIT})`,
    })
    .from(r)
    .where(and(eq(r.restaurantId, restaurantId), inArray(r.guestId, guestIds), before ? lt(r.date, before) : undefined))
    .groupBy(r.guestId);
  return new Map(rows.map(({ guestId, ...c }) => [guestId!, c]));
}

export type GuestInfo = {
  guestId: string;
  /** Short markers for staff: "Nuovo" or "5ª visita", "2 no-show", "VIP", "Compleanno", "Anniversario". */
  badges: { text: string; tone?: "alert" | "ok" }[];
  allergies: string;
  note: string;
};

/** What staff should know about the guest behind each booking of a day, by booking id. */
export async function guestInfoFor(
  restaurantId: string,
  bookings: { id: string; guestId: string | null; date: string; status: string }[],
): Promise<Map<string, GuestInfo>> {
  const ids = [...new Set(bookings.map((b) => b.guestId).filter((id): id is string => !!id))];
  if (!ids.length) return new Map();
  const db = await getDb();
  const date = bookings[0].date;
  const [profiles, counts] = await Promise.all([
    // Only profiles the guest agreed to: one without consent is never shown to staff.
    db
      .select()
      .from(schema.guests)
      .where(and(eq(schema.guests.restaurantId, restaurantId), inArray(schema.guests.id, ids), isNotNull(schema.guests.profileConsentAt))),
    guestCounts(restaurantId, ids, date),
  ]);
  const byId = new Map(profiles.map((g) => [g.id, g]));
  const result = new Map<string, GuestInfo>();
  for (const b of bookings) {
    const g = b.guestId ? byId.get(b.guestId) : undefined;
    if (!g) continue;
    const c = counts.get(g.id) ?? { visits: 0, noShows: 0, cancellations: 0, lastVisit: null };
    const badges: GuestInfo["badges"] = [];
    badges.push(c.visits === 0 ? { text: "Nuovo" } : { text: `${c.visits + 1}ª visita`, tone: "ok" });
    if (c.noShows > 0) badges.push({ text: c.noShows === 1 ? "1 no-show" : `${c.noShows} no-show`, tone: "alert" });
    if (g.vip) badges.push({ text: "VIP", tone: "ok" });
    if (isSameDay(g.birthday, b.date)) badges.push({ text: "Compleanno", tone: "ok" });
    if (isSameDay(g.anniversary, b.date)) badges.push({ text: "Anniversario", tone: "ok" });
    result.set(b.id, { guestId: g.id, badges, allergies: g.allergies, note: g.notes });
  }
  return result;
}

export { guestFor } from "./consent";
