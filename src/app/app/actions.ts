"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { randomToken, requireAccount } from "@/lib/auth";
import { emailCancellation, emailGuestConfirmation } from "@/lib/notifications";
import { conflictOn } from "@/lib/floor";
import { isDate, isTime } from "@/lib/time";
import type { ActionResult } from "@/components/ActionForm";

const STATUSES = ["confirmed", "seated", "completed", "cancelled", "no_show"] as const;

export async function setStatus(data: FormData) {
  const { restaurant } = await requireAccount();
  const id = z.uuid().parse(data.get("id"));
  const status = z.enum(STATUSES).parse(data.get("status"));
  const db = await getDb();
  // Scoped to the logged-in restaurant: an id from another restaurant matches nothing.
  const [updated] = await db
    .update(schema.reservations)
    .set({ status, updatedAt: new Date() })
    .where(and(eq(schema.reservations.id, id), eq(schema.reservations.restaurantId, restaurant.id)))
    .returning();
  if (updated && status === "cancelled") await emailCancellation(restaurant, updated, "restaurant");
  revalidatePath("/app");
}

const reservationSchema = z.object({
  id: z.uuid().optional(),
  date: z.string().refine(isDate, "Scegli una data."),
  time: z.string().refine(isTime, "Scegli un orario."),
  partySize: z.coerce.number().int().min(1, "Almeno una persona.").max(200),
  guestName: z.string().trim().min(1, "Scrivi il nome dell’ospite.").max(120),
  guestPhone: z.string().trim().max(40),
  guestEmail: z.union([z.literal(""), z.email("Controlla l’email.")]),
  notes: z.string().trim().max(1000),
  source: z.enum(["phone", "walk_in", "online"]),
  tableId: z.union([z.literal(""), z.uuid()]).optional(),
  sendEmail: z.literal("on").optional(),
});

/** Bookings entered by staff: no capacity check, the staff decides. */
export async function saveReservation(_: ActionResult, data: FormData): Promise<ActionResult> {
  const { restaurant } = await requireAccount();
  const raw = Object.fromEntries(data);
  const parsed = reservationSchema.safeParse({ ...raw, id: raw.id || undefined, guestEmail: String(raw.guestEmail ?? "").trim() });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { id, sendEmail, tableId: rawTable, ...rest } = parsed.data;
  const fields = { ...rest, tableId: rawTable || null };
  const db = await getDb();

  if (fields.tableId) {
    const [table] = await db
      .select()
      .from(schema.diningTables)
      .where(and(eq(schema.diningTables.id, fields.tableId), eq(schema.diningTables.restaurantId, restaurant.id)));
    if (!table) return { error: "Tavolo non trovato." };
    const sameDay = await db
      .select()
      .from(schema.reservations)
      .where(and(eq(schema.reservations.restaurantId, restaurant.id), eq(schema.reservations.date, fields.date)));
    const existing = id ? sameDay.find((b) => b.id === id) : undefined;
    const stay = { id: id ?? "", time: fields.time, durationMinutes: existing?.durationMinutes ?? restaurant.durationMinutes };
    const clash = conflictOn(table.id, stay, sameDay);
    if (clash) return { error: `Il tavolo ${table.label} è già di ${clash.guestName} dalle ${clash.time}. Scegli un altro tavolo.` };
  }

  if (id) {
    const [updated] = await db
      .update(schema.reservations)
      .set({ ...fields, updatedAt: new Date() })
      .where(and(eq(schema.reservations.id, id), eq(schema.reservations.restaurantId, restaurant.id)))
      .returning();
    if (!updated) return { error: "Prenotazione non trovata." };
  } else {
    const [created] = await db
      .insert(schema.reservations)
      .values({ ...fields, restaurantId: restaurant.id, durationMinutes: restaurant.durationMinutes, manageToken: randomToken() })
      .returning();
    if (sendEmail) await emailGuestConfirmation(restaurant, created);
  }
  revalidatePath("/app");
  redirect(`/app?data=${fields.date}`);
}
