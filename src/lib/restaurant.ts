import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
import { getDb, schema, type DB } from "@/db";
import type { Reservation, Restaurant } from "@/db/schema";
import { availableSlots, type Booking } from "./availability";
import { spotForOnline } from "./floor";
import { nowIn, toMinutes, weekdayOf } from "./time";
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

/** What a day's availability depends on besides its bookings: changes only when the owner edits hours or the room. */
async function fixedContext(db: DB | Tx, restaurantId: string, date: string) {
  const [services, closed, tables, zones, combos, links, closedAreas] = await Promise.all([
    db
      .select({ startTime: schema.serviceHours.startTime, endTime: schema.serviceHours.endTime })
      .from(schema.serviceHours)
      .where(and(eq(schema.serviceHours.restaurantId, restaurantId), eq(schema.serviceHours.weekday, weekdayOf(date)))),
    db
      .select({ id: schema.closures.id })
      .from(schema.closures)
      .where(and(eq(schema.closures.restaurantId, restaurantId), eq(schema.closures.date, date))),
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
    tables,
    zones: zones.map((z) => ({ ...z, bookableOnline: z.bookableOnline && !shut.has(z.name) })),
    combos: combos.map((c) => ({ ...c, tableIds: links.filter((l) => l.combinationId === c.id).map((l) => l.tableId) })),
  };
}

/** The day's active bookings, with the contact details needed to spot the same guest booking twice. */
function dayBookings(db: DB | Tx, restaurantId: string, date: string) {
  const res = schema.reservations;
  return db
    .select({
      id: res.id,
      time: res.time,
      partySize: res.partySize,
      durationMinutes: res.durationMinutes,
      tableId: res.tableId,
      combinationId: res.combinationId,
      status: res.status,
      guestEmail: res.guestEmail,
      guestPhone: res.guestPhone,
    })
    .from(res)
    .where(and(eq(res.restaurantId, restaurantId), eq(res.date, date), inArray(res.status, [...ACTIVE_STATUSES])));
}

async function dayContext(db: DB | Tx, restaurantId: string, date: string) {
  const [fixed, bookings] = await Promise.all([fixedContext(db, restaurantId, date), dayBookings(db, restaurantId, date)]);
  return { ...fixed, bookings: bookings satisfies Booking[] };
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
 * For the booking page: the free times, and the ones already full — times the party could have had on an
 * empty day, now taken — so a guest sees "pieno" instead of times silently missing.
 */
export async function getSlotsAndFull(r: Restaurant, date: string, partySize: number, area?: string | null) {
  const db = await getDb();
  const ctx = await dayContext(db, r.id, date);
  const slots = slotsFor(r, date, partySize, ctx, area);
  const free = new Set(slots);
  const full = slotsFor(r, date, partySize, { ...ctx, bookings: [] }, area).filter((t) => !free.has(t));
  return { slots, full };
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
  consent: { profile: boolean; marketing: boolean } = { profile: false, marketing: false },
): Promise<{ ok: true; reservation: Reservation } | { ok: false; duplicateAt?: string }> {
  const db = await getDb();
  // Read before taking the lock, all at once: on a database far from the server every round trip counts, and
  // only the day's bookings can change between here and the insert.
  // Without consent the guest lookup only reads (it never creates a profile), so it can go before the lock too.
  const [fixed, knownGuest] = await Promise.all([
    fixedContext(db, r.id, details.date),
    consent.profile ? undefined : guestFor(db, r, details),
  ]);
  return db.transaction(async (tx) => {
    // One booking at a time per restaurant, so two guests can't both take the last table.
    await tx.select({ id: schema.restaurants.id }).from(schema.restaurants).where(eq(schema.restaurants.id, r.id)).for("update");
    const bookings = await dayBookings(tx, r.id, details.date);
    // One guest, one table at a time: the same email or phone can't hold two bookings that overlap.
    const mine = bookings.find((b) => sameGuest(b, details) && overlaps(b, details.time, r.durationMinutes));
    if (mine) return { ok: false as const, duplicateAt: mine.time };
    const ctx = { ...fixed, bookings };
    if (!slotsFor(r, details.date, details.partySize, ctx, area).includes(details.time)) return { ok: false as const };
    // Restaurants that drew their room get the table (or joined tables) now, so the booking is on the plan straight away.
    const spot = ctx.tables.length > 0 ? spotFor(r, ctx, details.time, details.partySize, area) : null;
    const guestId = knownGuest !== undefined ? knownGuest : await guestFor(tx, r, details, { ...consent, source: "online" });
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

const phoneTail = (phone: string) => phone.replace(/\D/g, "").slice(-9);

/** The same person: same email (any case), or the same phone however it was typed (last nine digits). */
function sameGuest(b: { guestEmail: string; guestPhone: string }, d: { guestEmail: string; guestPhone: string }) {
  if (d.guestEmail && b.guestEmail.toLowerCase() === d.guestEmail.toLowerCase()) return true;
  const tail = phoneTail(d.guestPhone);
  return tail.length >= 6 && phoneTail(b.guestPhone) === tail;
}

const overlaps = (b: { time: string; durationMinutes: number }, time: string, duration: number) =>
  toMinutes(b.time) < toMinutes(time) + duration && toMinutes(time) < toMinutes(b.time) + b.durationMinutes;

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
