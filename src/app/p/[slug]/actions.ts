"use server";

import { after } from "next/server";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { createOnlineReservation, getRestaurantBySlug, getReservationByToken } from "@/lib/restaurant";
import { emailCancellation, emailGuestConfirmation, emailRestaurantNewBooking } from "@/lib/notifications";
import { isDate, isTime, nowIn, toMinutes, daysBetween } from "@/lib/time";

export type BookingResult = { error?: string; unavailable?: boolean } | null;

const bookingSchema = z.object({
  date: z.string().refine(isDate),
  time: z.string().refine(isTime),
  partySize: z.coerce.number().int().min(1),
  guestName: z.string().trim().min(2, "Scrivi nome e cognome.").max(120),
  guestPhone: z.string().trim().min(6, "Scrivi un numero di telefono, serve se il ristorante deve contattarti.").max(40),
  guestEmail: z.email("Controlla l’email: ti mandiamo lì la conferma.").trim().toLowerCase(),
  notes: z.string().trim().max(500, "Le note possono avere al massimo 500 caratteri."),
  zoneId: z.union([z.literal(""), z.uuid()]).optional(),
});

export async function createBooking(slug: string, embed: boolean, _: BookingResult, data: FormData): Promise<BookingResult> {
  // Bots fill every field, people never see this one.
  if (data.get("website")) return { error: "Qualcosa è andato storto. Riprova." };
  const parsed = bookingSchema.safeParse(Object.fromEntries(data));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const restaurant = await getRestaurantBySlug(slug);
  if (!restaurant) return { error: "Ristorante non trovato." };
  const { zoneId, ...details } = parsed.data;
  const result = await createOnlineReservation(restaurant, details, zoneId || null);
  if (!result.ok) {
    return { unavailable: true, error: "Quell’orario è appena stato preso. Scegline un altro." };
  }

  // Emails go out after the guest already sees the confirmation page.
  after(async () => {
    await emailGuestConfirmation(restaurant, result.reservation);
    await emailRestaurantNewBooking(restaurant, result.reservation);
  });
  redirect(`/p/${slug}/prenotazione/${result.reservation.manageToken}${embed ? "?embed=1" : ""}`);
}

export async function cancelBooking(data: FormData) {
  const token = String(data.get("token") ?? "");
  const row = await getReservationByToken(token);
  if (!row) redirect("/");
  const { reservation: b, restaurant: r } = row;
  const now = nowIn(r.timezone);
  const started = daysBetween(now.date, b.date) * 1440 + toMinutes(b.time) <= now.minutes;
  if (b.status === "confirmed" && !started) {
    const db = await getDb();
    const [cancelled] = await db
      .update(schema.reservations)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(and(eq(schema.reservations.id, b.id), eq(schema.reservations.status, "confirmed")))
      .returning();
    if (cancelled) after(() => emailCancellation(r, cancelled, "guest"));
  }
  redirect(`/p/${r.slug}/prenotazione/${token}${data.get("embed") ? "?embed=1" : ""}`);
}
