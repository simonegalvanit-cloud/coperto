import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
import { getDb, schema, type DB } from "@/db";
import type { Reservation, Restaurant } from "@/db/schema";
import { availableSlots, type Booking } from "./availability";
import { tableForOnline } from "./floor";
import { nowIn, weekdayOf } from "./time";
import { randomToken } from "./auth";

type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];

export const ACTIVE_STATUSES = ["confirmed", "seated"] as const;

export async function getRestaurantBySlug(slug: string) {
  const db = await getDb();
  const [r] = await db.select().from(schema.restaurants).where(eq(schema.restaurants.slug, slug));
  return r ?? null;
}

export async function getServiceHours(restaurantId: string) {
  const db = await getDb();
  return db
    .select()
    .from(schema.serviceHours)
    .where(eq(schema.serviceHours.restaurantId, restaurantId))
    .orderBy(asc(schema.serviceHours.weekday), asc(schema.serviceHours.startTime));
}

export async function getClosures(restaurantId: string) {
  const db = await getDb();
  return db
    .select()
    .from(schema.closures)
    .where(eq(schema.closures.restaurantId, restaurantId))
    .orderBy(asc(schema.closures.date));
}

async function dayContext(db: DB | Tx, restaurantId: string, date: string) {
  const [services, closed, bookings, tables, zones] = await Promise.all([
    db
      .select({ startTime: schema.serviceHours.startTime, endTime: schema.serviceHours.endTime })
      .from(schema.serviceHours)
      .where(and(eq(schema.serviceHours.restaurantId, restaurantId), eq(schema.serviceHours.weekday, weekdayOf(date)))),
    db
      .select({ id: schema.closures.id })
      .from(schema.closures)
      .where(and(eq(schema.closures.restaurantId, restaurantId), eq(schema.closures.date, date))),
    db
      .select({
        id: schema.reservations.id,
        time: schema.reservations.time,
        partySize: schema.reservations.partySize,
        durationMinutes: schema.reservations.durationMinutes,
        tableId: schema.reservations.tableId,
        status: schema.reservations.status,
      })
      .from(schema.reservations)
      .where(
        and(
          eq(schema.reservations.restaurantId, restaurantId),
          eq(schema.reservations.date, date),
          inArray(schema.reservations.status, [...ACTIVE_STATUSES]),
        ),
      ),
    db.select().from(schema.diningTables).where(eq(schema.diningTables.restaurantId, restaurantId)),
    db
      .select({ id: schema.zones.id, bookableOnline: schema.zones.bookableOnline })
      .from(schema.zones)
      .where(eq(schema.zones.restaurantId, restaurantId)),
  ]);
  return { services, closed: closed.length > 0, bookings: bookings satisfies Booking[], tables, zones };
}

type DayContext = Awaited<ReturnType<typeof dayContext>>;

/**
 * Bookable times for a party. Restaurants that drew their room are booked by table (a suitable table must be
 * free for the whole stay); the others by the total seat count from settings.
 */
function slotsFor(r: Restaurant, date: string, partySize: number, ctx: DayContext, zoneId?: string | null) {
  if (!r.bookingOpen) return [];
  const byTable = ctx.tables.length > 0;
  const rules = byTable ? { ...r, capacity: Number.MAX_SAFE_INTEGER } : r;
  const slots = availableSlots({ date, partySize, rules, now: nowIn(r.timezone), ...ctx });
  if (!byTable) return slots;
  return slots.filter((time) => tableFor(r, ctx, time, partySize, zoneId) !== null);
}

function tableFor(r: Restaurant, ctx: DayContext, time: string, partySize: number, zoneId?: string | null) {
  return tableForOnline(ctx.tables, ctx.zones, ctx.bookings, { id: "new", time, durationMinutes: r.durationMinutes, partySize }, zoneId);
}

export async function getAvailableSlots(r: Restaurant, date: string, partySize: number, zoneId?: string | null) {
  const db = await getDb();
  return slotsFor(r, date, partySize, await dayContext(db, r.id, date), zoneId);
}

/** Zones a guest can choose between online: open to online booking and with at least one online table. */
export async function getOnlineZones(restaurantId: string) {
  const db = await getDb();
  const [zones, tables] = await Promise.all([
    db
      .select({ id: schema.zones.id, name: schema.zones.name })
      .from(schema.zones)
      .where(and(eq(schema.zones.restaurantId, restaurantId), eq(schema.zones.bookableOnline, true)))
      .orderBy(asc(schema.zones.name)),
    db
      .select({ zoneId: schema.diningTables.zoneId })
      .from(schema.diningTables)
      .where(and(eq(schema.diningTables.restaurantId, restaurantId), eq(schema.diningTables.bookableOnline, true))),
  ]);
  const used = new Set(tables.map((t) => t.zoneId));
  return zones.filter((z) => used.has(z.id));
}

export type GuestDetails = {
  date: string;
  time: string;
  partySize: number;
  guestName: string;
  guestPhone: string;
  guestEmail: string;
  notes: string;
};

/**
 * Books online only if the slot is still free. The restaurant row is locked for the
 * duration of the check, so two guests can't both take the last seats at once.
 */
export async function createOnlineReservation(
  r: Restaurant,
  details: GuestDetails,
  zoneId?: string | null,
): Promise<{ ok: true; reservation: Reservation } | { ok: false }> {
  const db = await getDb();
  return db.transaction(async (tx) => {
    await tx.select({ id: schema.restaurants.id }).from(schema.restaurants).where(eq(schema.restaurants.id, r.id)).for("update");
    const ctx = await dayContext(tx, r.id, details.date);
    if (!slotsFor(r, details.date, details.partySize, ctx, zoneId).includes(details.time)) return { ok: false as const };
    // Restaurants that drew their room get the table assigned now, so the booking is on the plan straight away.
    const tableId = ctx.tables.length > 0 ? tableFor(r, ctx, details.time, details.partySize, zoneId) : null;
    const [reservation] = await tx
      .insert(schema.reservations)
      .values({
        ...details,
        restaurantId: r.id,
        durationMinutes: r.durationMinutes,
        source: "online",
        tableId,
        manageToken: randomToken(),
      })
      .returning();
    return { ok: true as const, reservation };
  });
}

export async function getReservationByToken(token: string) {
  const db = await getDb();
  const [row] = await db
    .select({ reservation: schema.reservations, restaurant: schema.restaurants })
    .from(schema.reservations)
    .innerJoin(schema.restaurants, eq(schema.restaurants.id, schema.reservations.restaurantId))
    .where(eq(schema.reservations.manageToken, token));
  return row ?? null;
}

/** "Trattoria da Mario!" → "trattoria-da-mario" */
export function slugify(name: string): string {
  return (
    name
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "ristorante"
  );
}

export async function uniqueSlug(name: string): Promise<string> {
  const db = await getDb();
  const base = slugify(name);
  for (let i = 1; ; i++) {
    const candidate = i === 1 ? base : `${base}-${i}`;
    const [taken] = await db
      .select({ id: schema.restaurants.id })
      .from(schema.restaurants)
      .where(eq(schema.restaurants.slug, candidate));
    if (!taken) return candidate;
  }
}
