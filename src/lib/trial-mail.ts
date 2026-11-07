import "server-only";
import { and, eq, gt, isNull, lt, notInArray, or, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { eur, PLANS } from "./billing";
import { sendEmail } from "./email";
import { appUrl } from "./url";

const day = (d: Date) => new Intl.DateTimeFormat("it-IT", { dateStyle: "long", timeZone: "Europe/Rome" }).format(d);

/**
 * Tells owners on trial that it's ending (three days before) and that it has ended (once). Restaurants already
 * subscribed or given free access get nothing. Each email goes out once.
 */
export async function sendTrialEmails() {
  const db = await getDb();
  const r = schema.restaurants;
  const now = new Date();
  const notSubscribed = and(
    or(isNull(r.subscriptionStatus), notInArray(r.subscriptionStatus, ["active", "trialing", "past_due"])),
    or(isNull(r.compUntil), lt(r.compUntil, now)),
  );
  const pick = (when: ReturnType<typeof and>) =>
    db
      .select({ id: r.id, name: r.name, trialEndsAt: r.trialEndsAt, email: schema.users.email, owner: schema.users.name })
      .from(r)
      .innerJoin(schema.users, eq(schema.users.id, r.ownerId))
      .where(and(notSubscribed, when));
  const [ending, ended] = await Promise.all([
    pick(and(isNull(r.trialReminderSentAt), gt(r.trialEndsAt, now), lt(r.trialEndsAt, sql`now() + interval '3 days'`))),
    pick(and(isNull(r.trialEndedNoticeAt), lt(r.trialEndsAt, now))),
  ]);
  const link = `${await appUrl()}/app/abbonamento`;
  const prices = `Banco ${eur(PLANS.banco.month)} o Sala ${eur(PLANS.sala.month)} al mese + IVA, oppure all’anno con due mesi gratis`;
  for (const x of ending) {
    if (x.email) {
      await sendEmail({
        to: x.email,
        subject: `La prova di Coperto per ${x.name} finisce il ${day(x.trialEndsAt)}`,
        text: [
          `Ciao ${x.owner},`,
          ``,
          `la prova gratuita di ${x.name} finisce il ${day(x.trialEndsAt)}. Per continuare a ricevere prenotazioni online scegli un piano: ${prices}.`,
          `L’addebito parte solo alla fine della prova:`,
          link,
        ].join("\n"),
      });
    }
    await db.update(r).set({ trialReminderSentAt: now }).where(eq(r.id, x.id));
  }
  for (const x of ended) {
    if (x.email) {
      await sendEmail({
        to: x.email,
        subject: `La prova di Coperto per ${x.name} è finita`,
        text: [
          `Ciao ${x.owner},`,
          ``,
          `la prova gratuita di ${x.name} è finita e le prenotazioni online sono in pausa. Le prenotazioni già fatte e tutti i tuoi dati sono al sicuro.`,
          `Scegli un piano per ripartire subito (${prices}):`,
          link,
        ].join("\n"),
      });
    }
    await db.update(r).set({ trialEndedNoticeAt: now }).where(eq(r.id, x.id));
  }
  return { trialReminders: ending.length, trialEnded: ended.length };
}
