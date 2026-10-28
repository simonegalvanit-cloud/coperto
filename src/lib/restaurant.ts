import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
import { getDb, schema, type DB } from "@/db";
import type { Reservation, Restaurant } from "@/db/schema";
import { availableSlots, type Booking } from "./availability";
import { spotForOnline } from "./floor";
import { nowIn, weekdayOf } from "./time";
import { randomToken } from "./auth";
import { guestFor } from "./guests";

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
  const [services, closed, bookings, tables, zones, combos, links, closedAreas] = await Promise.all([
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
        combinationId: schema.reservations.combinationId,
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
      .select({ id: schema.zones.id, name: schema.zones.name, bookableOnline: schema.zones.bookableOnline })
      .from(schema.zones)
      .where(eq(schema.zones.restaurantId, restaurantId)),
    db.select().from(schema.tableCombinations).where(eq(schema.tableCombinations.restaurantId, restaurantId)),
    db
      .select({ combinationId: schema.combinationTables.combinationId, tableId: schema.combinationTables.tableId })
      .from(schema.combinationTables)
      .innerJoin(schema.tableCombinations, eq(schema.tableCombinations.id, schema.combinationTables.combinationId))
      .where(eq(schema.tableCombinations.restaurantId, restaurantId)),
    db
      .select({ name: schema.zoneClosures.zoneName })
      .from(schema.zoneClosures)
      .where(and(eq(schema.zoneClosures.restaurantId, restaurantId), eq(schema.zoneClosures.date, date))),
  ]);
  // An area closed for the day counts as not bookable online, for every part drawn with that name.
  const shut = new Set(closedAreas.map((c) => c.name));
  return {
    services,
    closed: closed.length > 0,
    bookings: bookings satisfies Booking[],
    tables,
    zones: zones.map((z) => ({ ...z, bookableOnline: z.bookableOnline && !shut.has(z.name) })),
    combos: combos.map((c) => ({ ...c, tableIds: links.filter((l) => l.combinationId === c.id).map((l) => l.tableId) })),
  };
}

type DayContext = Awaited<ReturnType<typeof dayContext>>;

/**
 * Bookable times for a party. Restaurants that drew their room are booked by table (a suitable table must be
 * free for the whole stay); the others by the total seat count from settings.
 */
function slotsFor(r: Restaurant, date: string, partySize: number, ctx: DayContext, area?: string | null) {
  if (!r.bookingOpen) return [];
  const byTable = ctx.tables.length > 0;
  const rules = byTable ? { ...r, capacity: Number.MAX_SAFE_INTEGER } : r;
  const slots = availableSlots({ date, partySize, rules, now: nowIn(r.timezone), ...ctx });
  if (!byTable) return slots;
  return slots.filter((time) => spotFor(r, ctx, time, partySize, area) !== null);
}

/** Where the guest would sit; `area` is a zone name, covering every part of a room drawn as several zones. */
function spotFor(r: Restaurant, ctx: DayContext, time: string, partySize: number, area?: string | null) {
  const zoneIds = area ? ctx.zones.filter((z) => z.name === area).map((z) => z.id) : null;
  return spotForOnline(
    ctx.tables,
    ctx.zones,
    ctx.bookings,
    { id: "new", time, durationMinutes: r.durationMinutes, partySize },
    { zoneIds, combos: ctx.combos },
  );
}

export async function getAvailableSlots(r: Restaurant, date: string, partySize: number, area?: string | null) {
  const db = await getDb();
  return slotsFor(r, date, partySize, await dayContext(db, r.id, date), area);
}

/**
 * Areas a guest can choose between online, by name: open to online booking and with at least one online
 * table. Zones sharing a name (an L-shaped room drawn as two) are one choice.
 */
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
  return [...new Set(zones.filter((z) => used.has(z.id)).map((z) => z.name))];
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
  area?: string | null,
): Promise<{ ok: true; reservation: Reservation } | { ok: false }> {
  const db = await getDb();
  return db.transaction(async (tx) => {
    await tx.select({ id: schema.restaurants.id }).from(schema.restaurants).where(eq(schema.restaurants.id, r.id)).for("update");
    const ctx = await dayContext(tx, r.id, details.date);
    if (!slotsFor(r, details.date, details.partySize, ctx, area).includes(details.time)) return { ok: false as const };
    // Restaurants that drew their room get the table (or joined tables) now, so the booking is on the plan straight away.
    const spot = ctx.tables.length > 0 ? spotFor(r, ctx, details.time, details.partySize, area) : null;
    const guestId = await guestFor(tx, r.id, details);
    const [reservation] = await tx
      .insert(schema.reservations)
      .values({
        ...details,
        restaurantId: r.id,
        durationMinutes: r.durationMinutes,
        source: "online",
        tableId: spot?.tableId ?? null,
        combinationId: spot?.combinationId ?? null,
        guestId,
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
