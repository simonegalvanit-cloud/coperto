"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, inArray, isNull, ne } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { requireAccount } from "@/lib/auth";
import { isMonthDay, normalizeEmail, normalizePhone } from "@/lib/contact";
import type { ActionResult } from "@/components/ActionForm";
import { eraseGuest, recordStaffConsent, setMarketing } from "@/lib/consent";
import { nowIn } from "@/lib/time";

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
 * Forgets a guest on request (GDPR): the profile and its consent records go, past bookings keep only the
 * numbers, upcoming ones keep what's needed to welcome them.
 */
export async function deleteGuest(data: FormData) {
  const { restaurant } = await requireAccount();
  await eraseGuest(restaurant.id, z.uuid().parse(data.get("id")), nowIn(restaurant.timezone).date);
  revalidatePath("/app", "layout");
  redirect("/app/ospiti");
}

/** The guest agreed, in person or on the phone, to be remembered: staff record it (it's logged with today's date). */
export async function recordConsent(data: FormData) {
  const { restaurant } = await requireAccount();
  const id = z.uuid().parse(data.get("id"));
  await recordStaffConsent(restaurant, id);
  revalidatePath("/app", "layout");
}

export async function setGuestMarketing(data: FormData) {
  const { restaurant } = await requireAccount();
  const id = z.uuid().parse(data.get("id"));
  const db = await getDb();
  const [guest] = await db
    .select({ id: schema.guests.id })
    .from(schema.guests)
    .where(and(eq(schema.guests.id, id), eq(schema.guests.restaurantId, restaurant.id)));
  if (!guest) return;
  await setMarketing(id, data.get("on") === "1", "staff", restaurant.name);
  revalidatePath("/app", "layout");
}

/** Deletes the ticked profiles from the "Senza consenso" list, each the same way as a single deletion. */
export async function deleteUnconsented(data: FormData) {
  const { restaurant } = await requireAccount();
  const ids = z.array(z.uuid()).max(500).parse(data.getAll("id"));
  if (ids.length) {
    const db = await getDb();
    const g = schema.guests;
    const rows = await db
      .select({ id: g.id })
      .from(g)
      .where(and(eq(g.restaurantId, restaurant.id), inArray(g.id, ids), isNull(g.profileConsentAt)));
    const today = nowIn(restaurant.timezone).date;
    for (const r of rows) await eraseGuest(restaurant.id, r.id, today);
  }
  revalidatePath("/app", "layout");
  redirect("/app/ospiti/senza-consenso");
}
