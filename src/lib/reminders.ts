import "server-only";
import { and, eq, gte, isNull, lte, ne } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { Reservation, Restaurant } from "@/db/schema";
import { sendEmail } from "./email";
import { addDays, formatDate, nowIn } from "./time";
import { appUrl } from "./url";

/** Bookings made less than this long ago already have a fresh confirmation email; no reminder needed. */
const FRESH_MS = 2 * 60 * 60 * 1000;

async function emailReminder(r: Restaurant, b: Reservation) {
  const link = `${await appUrl()}/p/${r.slug}/prenotazione/${b.manageToken}`;
  await sendEmail({
    to: b.guestEmail,
    replyTo: r.notifyEmail,
    subject: `Domani da ${r.name} alle ${b.time}: ci sarai?`,
    text: [
      `Ciao ${b.guestName},`,
      ``,
      `ti ricordiamo la prenotazione da ${r.name} per domani, ${formatDate(b.date)}, alle ${b.time} (${b.partySize === 1 ? "1 persona" : `${b.partySize} persone`}).`,
      ``,
      `Conferma che ci sarai, oppure cancella se hai cambiato programma, così il tavolo torna libero:`,
      link,
      ``,
      r.phone ? `Per qualsiasi cosa: ${r.phone}` : "",
    ]
      .filter((line, i, all) => line !== "" || all[i - 1] !== "")
      .join("\n"),
  });
}

/**
 * Emails a reminder for every confirmed booking tomorrow (in each restaurant's own timezone) that has an email,
 * hasn't had one yet and wasn't made in the last couple of hours. Safe to run any number of times: each booking
 * gets one reminder at most. Pass a restaurant to send only its reminders.
 */
export async function sendDueReminders(only?: Restaurant): Promise<number> {
  const db = await getDb();
  const r = schema.reservations;
  const today = nowIn("UTC").date;
  const rows = await db
    .select({ reservation: r, restaurant: schema.restaurants })
    .from(r)
    .innerJoin(schema.restaurants, eq(schema.restaurants.id, r.restaurantId))
    .where(
      and(
        // Tomorrow somewhere in the world is between today and the day after, in UTC terms.
        gte(r.date, today),
        lte(r.date, addDays(today, 2)),
        eq(r.status, "confirmed"),
        isNull(r.reminderSentAt),
        ne(r.guestEmail, ""),
        eq(schema.restaurants.remindersEnabled, true),
        only ? eq(r.restaurantId, only.id) : undefined,
      ),
    )
    .limit(1000);

  let sent = 0;
  const now = Date.now();
  for (const { reservation: b, restaurant } of rows) {
    if (b.date !== addDays(nowIn(restaurant.timezone).date, 1)) continue;
    if (now - b.createdAt.getTime() < FRESH_MS) continue;
    // Claim it first, so two overlapping runs can't both send.
    const [claimed] = await db
      .update(r)
      .set({ reminderSentAt: new Date() })
      .where(and(eq(r.id, b.id), isNull(r.reminderSentAt)))
      .returning({ id: r.id });
    if (!claimed) continue;
    await emailReminder(restaurant, b);
    sent++;
  }
  return sent;
}
