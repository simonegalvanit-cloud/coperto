import "server-only";
import { and, asc, eq, ne, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { Restaurant } from "@/db/schema";
import { sendEmail } from "./email";
import { getAvailableSlots } from "./restaurant";
import { formatDate } from "./time";
import { appUrl } from "./url";

export async function getWaitlist(restaurantId: string, date: string) {
  const db = await getDb();
  const w = schema.waitlist;
  return db
    .select({
      id: w.id,
      name: w.name,
      phone: w.phone,
      email: w.email,
      partySize: w.partySize,
      notes: w.notes,
      status: w.status,
      source: w.source,
      waitedMinutes: sql<number>`floor(extract(epoch from now() - ${w.createdAt}) / 60)`.mapWith(Number),
    })
    .from(w)
    .where(and(eq(w.restaurantId, restaurantId), eq(w.date, date), ne(w.status, "left")))
    .orderBy(asc(w.createdAt));
}

/** The booking link that opens on this day and party size. */
async function bookingLink(r: Restaurant, date: string, partySize: number) {
  return `${await appUrl()}/p/${r.slug}?data=${date}&persone=${partySize}`;
}

export async function emailWaitlistGuest(r: Restaurant, entry: { email: string; name: string; date: string; partySize: number }, times: string[]) {
  if (!entry.email) return;
  await sendEmail({
    to: entry.email,
    replyTo: r.notifyEmail,
    subject: `Si è liberato un tavolo da ${r.name}, ${formatDate(entry.date)}`,
    text: [
      `Ciao ${entry.name},`,
      ``,
      `si è liberato un tavolo da ${r.name} per ${formatDate(entry.date, { year: true })}${times.length ? ` (per esempio alle ${times.slice(0, 3).join(", ")})` : ""}.`,
      `Prenota subito: i tavoli vanno a chi prenota per primo.`,
      ``,
      await bookingLink(r, entry.date, entry.partySize),
    ].join("\n"),
  });
}

/**
 * After a cancellation: emails the guests waiting online for that day whose party now fits, in the order they
 * joined, and marks them notified. Never throws: it runs after the response, a failure here must not surface.
 */
export async function notifyWaitlist(r: Restaurant, date: string) {
  try {
    const db = await getDb();
    const w = schema.waitlist;
    const waiting = await db
      .select()
      .from(w)
      .where(and(eq(w.restaurantId, r.id), eq(w.date, date), eq(w.source, "online"), eq(w.status, "waiting")))
      .orderBy(asc(w.createdAt));
    for (const entry of waiting) {
      const times = await getAvailableSlots(r, date, entry.partySize);
      if (!times.length) continue;
      await emailWaitlistGuest(r, entry, times);
      await db.update(w).set({ status: "notified", notifiedAt: new Date() }).where(eq(w.id, entry.id));
    }
  } catch (err) {
    console.error("[waitlist] notify failed", err);
  }
}
