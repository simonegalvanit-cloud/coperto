"use server";

import { after } from "next/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { createOnlineReservation, getRestaurantBySlug, getReservationByToken, type Unavailable } from "@/lib/restaurant";
import type { Restaurant } from "@/db/schema";
import { acceptsOnline, hasSalaFeatures } from "@/lib/billing";
import { emailCancellation, emailGuestConfirmation, emailRestaurantNewBooking } from "@/lib/notifications";
import { notifyWaitlist } from "@/lib/waitlist";
import { daysBetween, formatDate, isDate, isTime, nowIn, toMinutes } from "@/lib/time";

export type BookingResult = { error?: string; unavailable?: boolean } | null;

const bookingSchema = z.object({
  date: z.string().refine(isDate, "Scegli un giorno."),
  time: z.string().refine(isTime, "Scegli un orario."),
  partySize: z.coerce.number("Quante persone?").int("Quante persone?").min(1, "Quante persone?"),
  guestName: z.string().trim().min(2, "Scrivi nome e cognome.").max(120),
  guestPhone: z.string().trim().min(6, "Scrivi un numero di telefono, serve se il ristorante deve contattarti.").max(40),
  guestEmail: z.email("Controlla l’email: ti mandiamo lì la conferma.").trim().toLowerCase(),
  notes: z.string().trim().max(500, "Le note possono avere al massimo 500 caratteri."),
  area: z.string().trim().max(40).optional(),
  remember: z.literal("on").optional(),
  marketing: z.literal("on").optional(),
});

export async function createBooking(slug: string, embed: boolean, _: BookingResult, data: FormData): Promise<BookingResult> {
  // Bots fill every field, people never see this one.
  if (data.get("website")) return { error: "Qualcosa è andato storto. Riprova." };
  const parsed = bookingSchema.safeParse(Object.fromEntries(data));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const restaurant = await getRestaurantBySlug(slug);
  if (!restaurant) return { error: "Ristorante non trovato." };
  if (parsed.data.partySize > restaurant.maxPartySize) {
    return { error: `Online si prenota fino a ${restaurant.maxPartySize} persone: per gruppi più grandi chiama il ristorante.` };
  }
  const { area, remember, marketing, ...details } = parsed.data;
  // Offers only together with "remember me": they need the profile to be kept.
  // Guest profiles are a Sala feature: on Banco nobody is remembered.
  const profiles = hasSalaFeatures(restaurant);
  const result = await createOnlineReservation(restaurant, details, area || null, {
    profile: profiles && remember === "on",
    marketing: profiles && remember === "on" && marketing === "on",
  });
  if (!result.ok) {
    const why = result.why;
    // Only a time someone else took sends the guest back to pick again with fresh times.
    return { unavailable: why.reason === "taken" || why.reason === "no_table", error: unavailableMessage(restaurant, parsed.data, why) };
  }

  // Emails go out after the guest already sees the confirmation page.
  after(async () => {
    await emailGuestConfirmation(restaurant, result.reservation);
    await emailRestaurantNewBooking(restaurant, result.reservation);
  });
  revalidatePath(`/p/${slug}`, "layout");
  redirect(`/p/${slug}/prenotazione/${result.reservation.manageToken}${embed ? "?embed=1" : ""}`);
}

const call = (r: Restaurant) => (r.phone ? `, oppure chiama il ristorante al ${r.phone}` : "");

/** A notice period in words: 60 → "1 ora", 90 → "1 ora e 30 minuti", 2880 → "2 giorni". */
function duration(minutes: number) {
  const d = Math.floor(minutes / 1440);
  const h = Math.floor((minutes % 1440) / 60);
  const m = minutes % 60;
  const parts = [
    d ? (d === 1 ? "1 giorno" : `${d} giorni`) : "",
    h ? (h === 1 ? "1 ora" : `${h} ore`) : "",
    m ? `${m} minuti` : "",
  ].filter(Boolean);
  return parts.length ? parts.join(" e ") : "0 minuti";
}

/** What to tell a guest whose booking couldn't be made, in their terms. */
function unavailableMessage(r: Restaurant, d: { date: string; time: string; partySize: number }, why: Unavailable): string {
  switch (why.reason) {
    case "duplicate":
      return `Con questa email o questo telefono c’è già una prenotazione alle ${why.time} di quel giorno. Per cambiarla o cancellarla usa il link nell’email di conferma.`;
    case "suspended":
      return `${r.name} in questo momento non accetta prenotazioni online${call(r)}.`;
    case "closed":
      return `${r.name} è chiuso ${formatDate(d.date)}. Scegli un altro giorno.`;
    case "past":
      return "Quest’orario è già passato. Scegline un altro.";
    case "too_soon":
      return `Online si prenota con almeno ${duration(r.minNoticeMinutes)} di anticipo: scegli un orario più avanti${call(r)}.`;
    case "too_far":
      return `Si prenota al massimo ${r.maxDaysAhead} giorni prima. Scegli una data più vicina.`;
    case "outside_hours":
      return `Alle ${d.time} non si prenota. Orari di arrivo quel giorno: ${why.services.map((s) => `${s.name.toLowerCase()} ${s.startTime}–${s.endTime}`).join(", ")}.`;
    case "no_table":
      return `Online non c’è un tavolo per ${d.partySize === 1 ? "1 persona" : `${d.partySize} persone`} a quell’ora. Prova un altro orario${call(r)}.`;
    case "taken":
      return "Quell’orario è appena stato preso da qualcun altro. Scegline un altro.";
  }
}

export type WaitResult = { error?: string; ok?: string } | null;

const waitSchema = z.object({
  date: z.string().refine(isDate),
  partySize: z.coerce.number().int().min(1),
  name: z.string().trim().min(2, "Scrivi nome e cognome.").max(120),
  email: z.email("Controlla l’email: ti scriviamo lì se si libera un tavolo.").trim().toLowerCase(),
  phone: z.string().trim().max(40),
});

/** A guest who found a day full asks to be emailed if a table frees up. */
export async function joinWaitlist(slug: string, _: WaitResult, data: FormData): Promise<WaitResult> {
  if (data.get("website")) return { error: "Qualcosa è andato storto. Riprova." };
  const parsed = waitSchema.safeParse(Object.fromEntries(data));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const restaurant = await getRestaurantBySlug(slug);
  if (!restaurant || !acceptsOnline(restaurant)) return { error: "Il ristorante non accetta prenotazioni online." };
  const { date, partySize, ...contact } = parsed.data;
  const now = nowIn(restaurant.timezone);
  const ahead = daysBetween(now.date, date);
  if (ahead < 0 || ahead > restaurant.maxDaysAhead || partySize > restaurant.maxPartySize) return { error: "Data o numero di persone non validi." };

  const db = await getDb();
  const w = schema.waitlist;
  // Asking twice for the same day just keeps the first request.
  const [already] = await db
    .select({ id: w.id })
    .from(w)
    .where(and(eq(w.restaurantId, restaurant.id), eq(w.date, date), eq(w.email, contact.email), eq(w.status, "waiting")));
  if (!already) await db.insert(w).values({ ...contact, date, partySize, restaurantId: restaurant.id, source: "online" });
  return { ok: `Fatto. Se si libera un tavolo per ${formatDate(date)} ti scriviamo a ${contact.email}.` };
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
    if (cancelled) {
      after(async () => {
        await emailCancellation(r, cancelled, "guest");
        await notifyWaitlist(r, cancelled.date);
      });
    }
  }
  // Drop the browser's saved copy of the guest pages, so they see the cancellation and the freed time.
  revalidatePath(`/p/${r.slug}`, "layout");
  redirect(`/p/${r.slug}/prenotazione/${token}${data.get("embed") ? "?embed=1" : ""}`);
}

/** The guest taps "Ci sarò" in their reminder: staff see the booking as confirmed by the guest. */
export async function confirmPresence(data: FormData) {
  const token = String(data.get("token") ?? "");
  const row = await getReservationByToken(token);
  if (!row) redirect("/");
  const { reservation: b, restaurant: r } = row;
  if (b.status === "confirmed" && !b.guestConfirmedAt) {
    const db = await getDb();
    await db
      .update(schema.reservations)
      .set({ guestConfirmedAt: new Date(), updatedAt: new Date() })
      .where(eq(schema.reservations.id, b.id));
  }
  revalidatePath(`/p/${r.slug}`, "layout");
  redirect(`/p/${r.slug}/prenotazione/${token}${data.get("embed") ? "?embed=1" : ""}`);
}
