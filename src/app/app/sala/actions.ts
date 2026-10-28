"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { randomToken, requireAccount } from "@/lib/auth";
import { autoAssign as planAssignments, conflictOn, PLAN_H, PLAN_W, type FloorBooking } from "@/lib/floor";
import { fromMinutes, isDate, nowIn } from "@/lib/time";

export type FloorResult = { error?: string; ok?: string } | null;

const tableSchema = z
  .object({
    id: z.uuid().optional(),
    label: z.string().trim().min(1, "Ogni tavolo ha bisogno di un nome.").max(12, "Il nome di un tavolo può avere al massimo 12 caratteri."),
    seats: z.number().int().min(1).max(50, "Un tavolo può avere al massimo 50 posti."),
    shape: z.enum(["square", "round", "rect"]),
    x: z.number().int().min(0),
    y: z.number().int().min(0),
    w: z.number().int().min(30).max(PLAN_W),
    h: z.number().int().min(30).max(PLAN_H),
  })
  .refine((t) => t.x + t.w <= PLAN_W && t.y + t.h <= PLAN_H, "Un tavolo è fuori dalla sala.");

/** Replaces the whole plan: updates kept tables, adds new ones, deletes removed ones (their bookings become unassigned). */
export async function saveFloorPlan(input: unknown): Promise<FloorResult> {
  const { restaurant } = await requireAccount();
  const parsed = z.array(tableSchema).max(200, "Al massimo 200 tavoli.").safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const labels = parsed.data.map((t) => t.label.toLowerCase());
  const dupe = labels.find((l, i) => labels.indexOf(l) !== i);
  if (dupe) return { error: `Ci sono due tavoli chiamati “${parsed.data[labels.indexOf(dupe)].label}”.` };

  const db = await getDb();
  await db.transaction(async (tx) => {
    const existing = new Set(
      (await tx.select({ id: schema.diningTables.id }).from(schema.diningTables).where(eq(schema.diningTables.restaurantId, restaurant.id))).map((r) => r.id),
    );
    const keep = new Set<string>();
    for (const { id, ...t } of parsed.data) {
      if (id && existing.has(id)) {
        keep.add(id);
        await tx.update(schema.diningTables).set(t).where(eq(schema.diningTables.id, id));
      } else {
        await tx.insert(schema.diningTables).values({ ...t, restaurantId: restaurant.id });
      }
    }
    const removed = [...existing].filter((id) => !keep.has(id));
    if (removed.length) await tx.delete(schema.diningTables).where(inArray(schema.diningTables.id, removed));
  });
  revalidatePath("/app", "layout");
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
