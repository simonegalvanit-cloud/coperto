"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { requireAccount } from "@/lib/auth";
import { isMonthDay, normalizeEmail, normalizePhone } from "@/lib/contact";
import type { ActionResult } from "@/components/ActionForm";

const monthDay = z.union([z.literal(""), z.string().refine(isMonthDay, "Scrivi le date come giorno e mese.")]);

const guestSchema = z.object({
  id: z.uuid(),
  name: z.string().trim().min(1, "Scrivi il nome.").max(120),
  phone: z.string().trim().max(40),
  email: z.union([z.literal(""), z.email("Controlla l’email.")]),
  allergies: z.string().trim().max(300),
  notes: z.string().trim().max(1000),
  vip: z.literal("on").optional(),
  birthday: monthDay,
  anniversary: monthDay,
});

/** Day and month dropdowns → "MM-DD" ("" if either is unset); the year doesn't matter for a birthday. */
const toMonthDay = (data: FormData, field: string) => {
  const month = String(data.get(`${field}Month`) ?? "");
  const day = String(data.get(`${field}Day`) ?? "");
  return month && day ? `${month.padStart(2, "0")}-${day.padStart(2, "0")}` : "";
};

export async function saveGuest(_: ActionResult, data: FormData): Promise<ActionResult> {
  const { restaurant } = await requireAccount();
  const parsed = guestSchema.safeParse({
    ...Object.fromEntries(data),
    email: String(data.get("email") ?? "").trim(),
    birthday: toMonthDay(data, "birthday"),
    anniversary: toMonthDay(data, "anniversary"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { id, vip, ...fields } = parsed.data;
  const phone = normalizePhone(fields.phone);
  const email = normalizeEmail(fields.email);
  if (fields.phone && !phone) return { error: "Controlla il numero di telefono." };

  const db = await getDb();
  const g = schema.guests;
  // Phone and email identify a guest, so two profiles can't share them.
  for (const [col, value, label] of [[g.phone, phone, "telefono"], [g.email, email, "email"]] as const) {
    if (!value) continue;
    const [other] = await db
      .select({ name: g.name })
      .from(g)
      .where(and(eq(g.restaurantId, restaurant.id), eq(col, value), ne(g.id, id)));
    if (other) return { error: `${other.name} ha già questo ${label}.` };
  }
  const [updated] = await db
    .update(g)
    .set({ ...fields, phone, email, vip: vip === "on", updatedAt: new Date() })
    .where(and(eq(g.id, id), eq(g.restaurantId, restaurant.id)))
    .returning({ id: g.id });
  if (!updated) return { error: "Ospite non trovato." };
  revalidatePath("/app", "layout");
  return { ok: "Salvato." };
}

/**
 * Forgets a guest on request (GDPR): deletes the profile and blanks the name, phone, email and notes on their
 * bookings, which stay only as anonymous numbers for the restaurant's statistics.
 */
export async function deleteGuest(data: FormData) {
  const { restaurant } = await requireAccount();
  const id = z.uuid().parse(data.get("id"));
  const db = await getDb();
  await db.transaction(async (tx) => {
    await tx
      .update(schema.reservations)
      .set({ guestName: "Ospite cancellato", guestPhone: "", guestEmail: "", notes: "", guestId: null, updatedAt: new Date() })
      .where(and(eq(schema.reservations.guestId, id), eq(schema.reservations.restaurantId, restaurant.id)));
    await tx.delete(schema.guests).where(and(eq(schema.guests.id, id), eq(schema.guests.restaurantId, restaurant.id)));
  });
  revalidatePath("/app", "layout");
  redirect("/app/ospiti");
}
