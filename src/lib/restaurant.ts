import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
import { getDb, schema, type DB } from "@/db";
import type { Reservation, Restaurant } from "@/db/schema";
import { availableSlots, type Booking } from "./availability";
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
  const [services, closed, bookings] = await Promise.all([
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
        time: schema.reservations.time,
        partySize: schema.reservations.partySize,
        durationMinutes: schema.reservations.durationMinutes,
      })
      .from(schema.reservations)
      .where(
        and(
          eq(schema.reservations.restaurantId, restaurantId),
          eq(schema.reservations.date, date),
          inArray(schema.reservations.status, [...ACTIVE_STATUSES]),
        ),
      ),
  ]);
  return { services, closed: closed.length > 0, bookings: bookings satisfies Booking[] };
}

function slotsFor(r: Restaurant, date: string, partySize: number, ctx: Awaited<ReturnType<typeof dayContext>>) {
  if (!r.bookingOpen) return [];
  return availableSlots({ date, partySize, rules: r, now: nowIn(r.timezone), ...ctx });
}

export async function getAvailableSlots(r: Restaurant, date: string, partySize: number) {
  const db = await getDb();
  return slotsFor(r, date, partySize, await dayContext(db, r.id, date));
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
): Promise<{ ok: true; reservation: Reservation } | { ok: false }> {
  const db = await getDb();
  return db.transaction(async (tx) => {
    await tx.select({ id: schema.restaurants.id }).from(schema.restaurants).where(eq(schema.restaurants.id, r.id)).for("update");
    const slots = slotsFor(r, details.date, details.partySize, await dayContext(tx, r.id, details.date));
    if (!slots.includes(details.time)) return { ok: false as const };
    const [reservation] = await tx
      .insert(schema.reservations)
      .values({
        ...details,
        restaurantId: r.id,
        durationMinutes: r.durationMinutes,
        source: "online",
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
