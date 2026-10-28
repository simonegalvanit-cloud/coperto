"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { randomToken, requireAccount } from "@/lib/auth";
import { emailCancellation, emailGuestConfirmation } from "@/lib/notifications";
import { after } from "next/server";
import { checkSpot } from "@/lib/spots";
import { notifyWaitlist } from "@/lib/waitlist";
import { guestFor } from "@/lib/guests";
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
  // After the response, so the tap feels instant: tell the guest, then offer the freed table to the waitlist.
  if (updated && (status === "cancelled" || status === "no_show")) {
    after(async () => {
      if (status === "cancelled") await emailCancellation(restaurant, updated, "restaurant");
      await notifyWaitlist(restaurant, updated.date);
    });
  }
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
  // "t:<id>" for a table, "c:<id>" for joined tables, "" for none.
  place: z.union([z.literal(""), z.string().regex(/^[tc]:[0-9a-f-]{36}$/)]).optional(),
  sendEmail: z.literal("on").optional(),
});

/** Bookings entered by staff: no capacity check, the staff decides. */
export async function saveReservation(_: ActionResult, data: FormData): Promise<ActionResult> {
  const { restaurant } = await requireAccount();
  const raw = Object.fromEntries(data);
  const parsed = reservationSchema.safeParse({ ...raw, id: raw.id || undefined, guestEmail: String(raw.guestEmail ?? "").trim() });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { id, sendEmail, place, ...rest } = parsed.data;
  const db = await getDb();
  const fields = {
    ...rest,
    tableId: place?.startsWith("t:") ? place.slice(2) : null,
    combinationId: place?.startsWith("c:") ? place.slice(2) : null,
    // Re-matched on every save, so adding a phone number links the booking to the guest's profile.
    guestId: await guestFor(db, restaurant.id, rest),
  };

  if (fields.tableId || fields.combinationId) {
    const [existing] = id
      ? await db
          .select({ durationMinutes: schema.reservations.durationMinutes })
          .from(schema.reservations)
          .where(and(eq(schema.reservations.id, id), eq(schema.reservations.restaurantId, restaurant.id)))
      : [];
    const stay = { id: id ?? "", date: fields.date, time: fields.time, durationMinutes: existing?.durationMinutes ?? restaurant.durationMinutes };
    const check = await checkSpot(restaurant.id, fields, stay);
    if ("error" in check) return check;
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
