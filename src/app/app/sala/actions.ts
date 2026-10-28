"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { randomToken, requireAccount } from "@/lib/auth";
import { autoAssign as planAssignments, conflictOn, zoneFor, type FloorBooking } from "@/lib/floor";
import { fromMinutes, isDate, nowIn } from "@/lib/time";

export type FloorResult = { error?: string; ok?: string } | null;

const MAX_SIZE = 10_000; // 100 m
const int = z.number().int();
const box = { x: int.min(0), y: int.min(0), w: int.min(10).max(MAX_SIZE), h: int.min(10).max(MAX_SIZE) };

const tableSchema = z.object({
  id: z.uuid().optional(),
  label: z.string().trim().min(1, "Ogni tavolo ha bisogno di un nome.").max(12, "Il nome di un tavolo può avere al massimo 12 caratteri."),
  seats: int.min(1).max(50, "Un tavolo può avere al massimo 50 posti."),
  minCovers: int.min(1),
  bookableOnline: z.boolean(),
  shape: z.enum(["square", "round", "rect"]),
  ...box,
  w: int.min(30, "Un tavolo deve essere largo almeno 30 cm.").max(MAX_SIZE),
  h: int.min(30, "Un tavolo deve essere profondo almeno 30 cm.").max(MAX_SIZE),
});

const zoneSchema = z.object({
  name: z.string().trim().min(1, "Ogni sala ha bisogno di un nome.").max(40),
  bookableOnline: z.boolean(),
  ...box,
});

const fixtureSchema = z.object({
  kind: z.enum(schema.fixtureKind.enumValues),
  label: z.string().trim().max(40),
  ...box,
});

const floorSchema = z.object({
  id: z.uuid().optional(),
  name: z.string().trim().min(1, "Ogni piano ha bisogno di un nome.").max(40),
  level: int.min(-5).max(50),
  width: int.min(200, "Un piano deve essere largo almeno 2 m.").max(MAX_SIZE, "Un piano può essere largo al massimo 100 m."),
  height: int.min(200, "Un piano deve essere profondo almeno 2 m.").max(MAX_SIZE, "Un piano può essere profondo al massimo 100 m."),
  zones: z.array(zoneSchema).max(50),
  fixtures: z.array(fixtureSchema).max(500),
  tables: z.array(tableSchema).max(300),
});

const planSchema = z.array(floorSchema).min(1, "Serve almeno un piano.").max(10, "Al massimo 10 piani.");

export type FloorPlanInput = z.input<typeof planSchema>;

/**
 * Replaces the whole plan. Floors and tables keep their ids (bookings point at tables), zones and fixtures
 * are rewritten, and each table's zone is worked out from where it sits. Removed tables' bookings become unassigned.
 */
export async function saveFloorPlan(input: unknown): Promise<FloorResult> {
  const { restaurant } = await requireAccount();
  const parsed = planSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const plan = parsed.data;

  for (const f of plan) {
    const outside = [...f.zones, ...f.fixtures, ...f.tables].find((b) => b.x + b.w > f.width || b.y + b.h > f.height);
    if (outside) return { error: `Su “${f.name}” c’è qualcosa fuori dal piano: allarga il piano o spostalo dentro.` };
    const tight = f.tables.find((t) => t.minCovers > t.seats);
    if (tight) return { error: `Il tavolo ${tight.label} ha il minimo di persone più alto del massimo.` };
  }
  const labels = plan.flatMap((f) => f.tables.map((t) => t.label.toLowerCase()));
  const dupe = labels.find((l, i) => labels.indexOf(l) !== i);
  if (dupe) {
    const original = plan.flatMap((f) => f.tables).find((t) => t.label.toLowerCase() === dupe)!.label;
    return { error: `Ci sono due tavoli chiamati “${original}”.` };
  }

  const db = await getDb();
  await db.transaction(async (tx) => {
    const own = (rows: { id: string }[]) => new Set(rows.map((r) => r.id));
    const oldFloors = own(await tx.select({ id: schema.floors.id }).from(schema.floors).where(eq(schema.floors.restaurantId, restaurant.id)));
    const oldTables = own(
      await tx.select({ id: schema.diningTables.id }).from(schema.diningTables).where(eq(schema.diningTables.restaurantId, restaurant.id)),
    );
    await tx.delete(schema.zones).where(eq(schema.zones.restaurantId, restaurant.id));
    await tx.delete(schema.fixtures).where(eq(schema.fixtures.restaurantId, restaurant.id));

    const keptFloors = new Set<string>();
    const keptTables = new Set<string>();
    for (const [position, { id, zones, fixtures, tables, ...floor }] of plan.entries()) {
      let floorId: string;
      if (id && oldFloors.has(id)) {
        await tx.update(schema.floors).set({ ...floor, position }).where(eq(schema.floors.id, id));
        floorId = id;
      } else {
        [{ id: floorId }] = await tx
          .insert(schema.floors)
          .values({ ...floor, position, restaurantId: restaurant.id })
          .returning({ id: schema.floors.id });
      }
      keptFloors.add(floorId);

      const savedZones = zones.length
        ? await tx
            .insert(schema.zones)
            .values(zones.map((z) => ({ ...z, floorId, restaurantId: restaurant.id })))
            .returning()
        : [];
      if (fixtures.length) {
        await tx.insert(schema.fixtures).values(fixtures.map((f) => ({ ...f, floorId, restaurantId: restaurant.id })));
      }
      for (const { id: tableId, ...t } of tables) {
        const row = { ...t, floorId, zoneId: zoneFor({ ...t, floorId }, savedZones)?.id ?? null };
        if (tableId && oldTables.has(tableId)) {
          await tx.update(schema.diningTables).set(row).where(eq(schema.diningTables.id, tableId));
          keptTables.add(tableId);
        } else {
          await tx.insert(schema.diningTables).values({ ...row, restaurantId: restaurant.id });
        }
      }
    }
    const goneTables = [...oldTables].filter((id) => !keptTables.has(id));
    if (goneTables.length) await tx.delete(schema.diningTables).where(inArray(schema.diningTables.id, goneTables));
    const goneFloors = [...oldFloors].filter((id) => !keptFloors.has(id));
    if (goneFloors.length) await tx.delete(schema.floors).where(inArray(schema.floors.id, goneFloors));
  });
  revalidatePath("/app", "layout");
  revalidatePath("/p", "layout");
  return { ok: "Sala salvata." };
}

async function loadDay(restaurantId: string, date: string) {
  const db = await getDb();
  return db
    .select()
    .from(schema.reservations)
    .where(and(eq(schema.reservations.restaurantId, restaurantId), eq(schema.reservations.date, date)));
}

async function ownTable(restaurantId: string, tableId: string) {
  const db = await getDb();
  const [t] = await db
    .select()
    .from(schema.diningTables)
    .where(and(eq(schema.diningTables.id, tableId), eq(schema.diningTables.restaurantId, restaurantId)));
  return t ?? null;
}

/** Puts a booking on a table (or takes it off with tableId null), refusing double bookings. Optionally seats it too. */
export async function assignTable(reservationId: string, tableId: string | null, seat = false): Promise<FloorResult> {
  const { restaurant } = await requireAccount();
  const db = await getDb();
  const [booking] = await db
    .select()
    .from(schema.reservations)
    .where(and(eq(schema.reservations.id, z.uuid().parse(reservationId)), eq(schema.reservations.restaurantId, restaurant.id)));
  if (!booking) return { error: "Prenotazione non trovata." };

  if (tableId) {
    const table = await ownTable(restaurant.id, z.uuid().parse(tableId));
    if (!table) return { error: "Tavolo non trovato." };
    const clash = conflictOn(table.id, booking, await loadDay(restaurant.id, booking.date));
    if (clash) {
      return { error: `Il tavolo ${table.label} è già di ${clash.guestName} dalle ${clash.time}. Spostalo prima su un altro tavolo.` };
    }
  }
  await db
    .update(schema.reservations)
    .set({ tableId, ...(seat ? { status: "seated" as const } : {}), updatedAt: new Date() })
    .where(eq(schema.reservations.id, booking.id));
  revalidatePath("/app", "layout");
  return null;
}

/** Seats a party without a booking at a table, right now. */
export async function seatWalkIn(tableId: string, partySize: number, name: string): Promise<FloorResult> {
  const { restaurant } = await requireAccount();
  const table = await ownTable(restaurant.id, z.uuid().parse(tableId));
  if (!table) return { error: "Tavolo non trovato." };
  const party = z.number().int().min(1).max(200).safeParse(partySize);
  if (!party.success) return { error: "Quante persone?" };

  const now = nowIn(restaurant.timezone);
  const walkIn = {
    date: now.date,
    time: fromMinutes(now.minutes - (now.minutes % 5)),
    durationMinutes: restaurant.durationMinutes,
  };
  const day = await loadDay(restaurant.id, now.date);
  // Only someone physically at the table blocks a walk-in; a later booking is the staff's call.
  const occupied = day.find((b) => b.tableId === table.id && b.status === "seated");
  if (occupied) return { error: `Al tavolo ${table.label} è ancora seduto ${occupied.guestName}.` };

  const db = await getDb();
  await db.insert(schema.reservations).values({
    ...walkIn,
    restaurantId: restaurant.id,
    partySize: party.data,
    guestName: name.trim().slice(0, 120) || "Senza prenotazione",
    source: "walk_in",
    status: "seated",
    tableId: table.id,
    manageToken: randomToken(),
  });
  revalidatePath("/app", "layout");
  return null;
}

export async function autoAssign(date: string): Promise<FloorResult> {
  const { restaurant } = await requireAccount();
  if (!isDate(date)) return { error: "Data non valida." };
  const db = await getDb();
  const [tables, day] = await Promise.all([
    db.select().from(schema.diningTables).where(eq(schema.diningTables.restaurantId, restaurant.id)),
    loadDay(restaurant.id, date),
  ]);
  const plan = planAssignments(tables, day as FloorBooking[]);
  for (const [reservationId, tableId] of plan) {
    await db.update(schema.reservations).set({ tableId, updatedAt: new Date() }).where(eq(schema.reservations.id, reservationId));
  }
  const left = day.filter((b) => !b.tableId && (b.status === "confirmed" || b.status === "seated")).length - plan.size;
  revalidatePath("/app", "layout");
  if (plan.size === 0) return { error: "Nessun tavolo libero e abbastanza grande per le prenotazioni rimaste." };
  return {
    ok: `Assegnate ${plan.size} prenotazioni.${left > 0 ? ` ${left} non entrano in nessun tavolo libero: assegnale tu.` : ""}`,
  };
}

/** Status changes from the floor view (seated, left), scoped to this restaurant. */
export async function setFloorStatus(reservationId: string, status: "seated" | "completed" | "confirmed"): Promise<FloorResult> {
  const { restaurant } = await requireAccount();
  const db = await getDb();
  await db
    .update(schema.reservations)
    .set({ status: z.enum(["seated", "completed", "confirmed"]).parse(status), updatedAt: new Date() })
    .where(and(eq(schema.reservations.id, z.uuid().parse(reservationId)), eq(schema.reservations.restaurantId, restaurant.id)));
  revalidatePath("/app", "layout");
  return null;
}
