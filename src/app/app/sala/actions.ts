"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { randomToken, requireAccount } from "@/lib/auth";
import { autoAssign as planAssignments, tablesOf, zoneFor, type FloorBooking, type Spot } from "@/lib/floor";
import { loadPlan } from "@/lib/plan";
import { checkSpot } from "@/lib/spots";
import { fromMinutes, isDate, nowIn } from "@/lib/time";

export type FloorResult = { error?: string; ok?: string } | null;

const MAX_SIZE = 10_000; // 100 m
const int = z.number().int();
const box = { x: int.min(0), y: int.min(0), w: int.min(10).max(MAX_SIZE), h: int.min(10).max(MAX_SIZE) };
const rotation = int.min(0).max(359);

const tableSchema = z.object({
  id: z.uuid().optional(),
  label: z.string().trim().min(1, "Ogni tavolo ha bisogno di un nome.").max(12, "Il nome di un tavolo può avere al massimo 12 caratteri."),
  seats: int.min(1).max(50, "Un tavolo può avere al massimo 50 posti."),
  minCovers: int.min(1),
  bookableOnline: z.boolean(),
  shape: z.enum(["square", "round", "rect"]),
  rotation,
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
  rotation,
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

const comboSchema = z.object({
  id: z.uuid().optional(),
  // By table name: new tables have no id until they're saved.
  tables: z.array(z.string().trim().min(1)).min(2, "Per unire servono almeno due tavoli.").max(8, "Al massimo 8 tavoli uniti."),
  minCovers: int.min(1),
  maxCovers: int.min(1).max(200, "Al massimo 200 persone per tavoli uniti."),
  bookableOnline: z.boolean(),
});

const planSchema = z.object({
  floors: z.array(floorSchema).min(1, "Serve almeno un piano.").max(10, "Al massimo 10 piani."),
  combos: z.array(comboSchema).max(100),
});

export type FloorPlanInput = z.input<typeof planSchema>;

/**
 * Replaces the whole plan. Floors and tables keep their ids (bookings point at tables), zones and fixtures
 * are rewritten, and each table's zone is worked out from where it sits. Removed tables' bookings become unassigned.
 */
export async function saveFloorPlan(input: unknown): Promise<FloorResult> {
  const { restaurant } = await requireAccount();
  const parsed = planSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { floors: plan, combos } = parsed.data;

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
  const floorOfLabel = new Map(plan.flatMap((f, i) => f.tables.map((t) => [t.label, i] as const)));
  for (const c of combos) {
    const missing = c.tables.find((l) => !floorOfLabel.has(l));
    if (missing) return { error: `Tra i tavoli uniti c’è “${missing}”, che non esiste più.` };
    if (new Set(c.tables.map((l) => floorOfLabel.get(l))).size > 1) return { error: `${c.tables.join("+")}: si possono unire solo tavoli dello stesso piano.` };
    if (c.minCovers > c.maxCovers) return { error: `${c.tables.join("+")}: il minimo di persone è più alto del massimo.` };
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
    const idOfLabel = new Map<string, string>();
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
          idOfLabel.set(t.label, tableId);
        } else {
          const [{ id: newId }] = await tx
            .insert(schema.diningTables)
            .values({ ...row, restaurantId: restaurant.id })
            .returning({ id: schema.diningTables.id });
          idOfLabel.set(t.label, newId);
        }
      }
    }
    // Joined tables keep their ids, so bookings at them stay put; their member tables are rewritten.
    const oldCombos = own(
      await tx
        .select({ id: schema.tableCombinations.id })
        .from(schema.tableCombinations)
        .where(eq(schema.tableCombinations.restaurantId, restaurant.id)),
    );
    const keptCombos = new Set<string>();
    for (const { id: comboId, tables: members, ...c } of combos) {
      let id: string;
      if (comboId && oldCombos.has(comboId)) {
        await tx.update(schema.tableCombinations).set(c).where(eq(schema.tableCombinations.id, comboId));
        await tx.delete(schema.combinationTables).where(eq(schema.combinationTables.combinationId, comboId));
        id = comboId;
      } else {
        [{ id }] = await tx
          .insert(schema.tableCombinations)
          .values({ ...c, restaurantId: restaurant.id })
          .returning({ id: schema.tableCombinations.id });
      }
      keptCombos.add(id);
      await tx.insert(schema.combinationTables).values(members.map((l) => ({ combinationId: id, tableId: idOfLabel.get(l)! })));
    }
    const goneCombos = [...oldCombos].filter((id) => !keptCombos.has(id));
    if (goneCombos.length) await tx.delete(schema.tableCombinations).where(inArray(schema.tableCombinations.id, goneCombos));

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

const spotSchema = z.object({ tableId: z.uuid().nullable(), combinationId: z.uuid().nullable() });

/** Puts a booking on a table or joined tables (or takes it off with both null), refusing double bookings. */
export async function assignTable(reservationId: string, spot: Spot, seat = false): Promise<FloorResult> {
  const { restaurant } = await requireAccount();
  const where = spotSchema.parse(spot);
  const db = await getDb();
  const [booking] = await db
    .select()
    .from(schema.reservations)
    .where(and(eq(schema.reservations.id, z.uuid().parse(reservationId)), eq(schema.reservations.restaurantId, restaurant.id)));
  if (!booking) return { error: "Prenotazione non trovata." };

  if (where.tableId || where.combinationId) {
    const check = await checkSpot(restaurant.id, where, booking);
    if ("error" in check) return check;
  }
  await db
    .update(schema.reservations)
    .set({ ...where, ...(seat ? { status: "seated" as const } : {}), updatedAt: new Date() })
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
  const [day, { combos }] = await Promise.all([loadDay(restaurant.id, now.date), loadPlan(restaurant.id)]);
  // Only someone physically at the table blocks a walk-in; a later booking is the staff's call.
  const occupied = day.find((b) => b.status === "seated" && tablesOf(b, combos).includes(table.id));
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
  const [{ tables, combos }, day] = await Promise.all([loadPlan(restaurant.id), loadDay(restaurant.id, date)]);
  const plan = planAssignments(tables, day as FloorBooking[], combos);
  for (const [reservationId, spot] of plan) {
    await db
      .update(schema.reservations)
      .set({ ...spot, updatedAt: new Date() })
      .where(eq(schema.reservations.id, reservationId));
  }
  const waiting = day.filter((b) => !b.tableId && !b.combinationId && (b.status === "confirmed" || b.status === "seated")).length;
  const left = waiting - plan.size;
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

/** Closes an area to online booking for one day (the terrace when it rains), or opens it again. */
export async function setAreaClosed(area: string, date: string, closed: boolean): Promise<FloorResult> {
  const { restaurant } = await requireAccount();
  if (!isDate(date)) return { error: "Data non valida." };
  const name = z.string().trim().min(1).max(40).parse(area);
  const db = await getDb();
  if (closed) {
    await db.insert(schema.zoneClosures).values({ restaurantId: restaurant.id, zoneName: name, date }).onConflictDoNothing();
  } else {
    await db
      .delete(schema.zoneClosures)
      .where(
        and(eq(schema.zoneClosures.restaurantId, restaurant.id), eq(schema.zoneClosures.zoneName, name), eq(schema.zoneClosures.date, date)),
      );
  }
  revalidatePath("/app", "layout");
  return { ok: closed ? `${name} è chiusa alle prenotazioni online per questo giorno.` : `${name} è di nuovo prenotabile.` };
}
