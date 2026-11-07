import "server-only";
import type Stripe from "stripe";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { Restaurant } from "@/db/schema";
import { eur } from "./billing";
import { sendEmail } from "./email";
import { planFromLookupKey } from "./stripe";
import { appUrl } from "./url";

const date = (unix: number | null | undefined) => (unix ? new Date(unix * 1000) : null);
const idOf = (v: string | { id: string } | null | undefined) => (typeof v === "string" ? v : v?.id ?? null);

async function restaurantFor(customerId: string | null, restaurantId?: string | null) {
  const db = await getDb();
  const r = schema.restaurants;
  if (restaurantId) {
    const [byId] = await db.select().from(r).where(eq(r.id, restaurantId));
    if (byId) return byId;
  }
  if (!customerId) return null;
  const [byCustomer] = await db.select().from(r).where(eq(r.stripeCustomerId, customerId));
  return byCustomer ?? null;
}

async function ownerEmail(r: Restaurant) {
  const db = await getDb();
  const [u] = await db.select({ email: schema.users.email, name: schema.users.name }).from(schema.users).where(eq(schema.users.id, r.ownerId));
  return u ?? null;
}

/** Keeps the restaurant's plan and status in step with its Stripe subscription. */
async function syncSubscription(sub: Stripe.Subscription) {
  const r = await restaurantFor(idOf(sub.customer), sub.metadata?.restaurantId);
  if (!r) return;
  const item = sub.items?.data?.[0];
  const plan = planFromLookupKey(item?.price?.lookup_key);
  const db = await getDb();
  await db
    .update(schema.restaurants)
    .set({
      stripeCustomerId: r.stripeCustomerId ?? idOf(sub.customer),
      stripeSubscriptionId: sub.id,
      subscriptionStatus: sub.status,
      plan: plan?.plan ?? r.plan,
      billingInterval: plan?.interval ?? r.billingInterval,
      currentPeriodEnd: date(sub.current_period_end ?? (item as { current_period_end?: number } | undefined)?.current_period_end),
      cancelAtPeriodEnd: !!sub.cancel_at_period_end,
    })
    .where(eq(schema.restaurants.id, r.id));
}

/** Records an invoice (the revenue figures come from these) and tells the owner when a payment fails. */
async function recordInvoice(inv: Stripe.Invoice, status: "paid" | "failed") {
  // The €0 invoice that opens a trial isn't revenue.
  if (!inv.total) return;
  const r = await restaurantFor(idOf(inv.customer));
  const db = await getDb();
  const line = inv.lines?.data?.[0];
  const plan = planFromLookupKey(line?.price?.lookup_key);
  const tax = inv.tax ?? inv.total - inv.subtotal;
  const row = {
    restaurantId: r?.id ?? null,
    restaurantName: r?.name ?? inv.customer_name ?? "",
    stripeInvoiceId: inv.id!,
    number: inv.number ?? "",
    status,
    plan: plan?.plan ?? r?.plan ?? "",
    interval: plan?.interval ?? r?.billingInterval ?? "",
    amountNet: inv.subtotal,
    amountTax: tax,
    amountTotal: inv.total,
    currency: inv.currency,
    periodStart: date(line?.period?.start),
    periodEnd: date(line?.period?.end),
    invoiceUrl: inv.hosted_invoice_url ?? "",
    billingName: r?.billingName || r?.name || "",
    billingVat: r?.billingVat ?? "",
    billingTaxCode: r?.billingTaxCode ?? "",
    billingAddress: r?.billingAddress ?? "",
    billingSdi: r?.billingSdi ?? "",
    billingPec: r?.billingPec ?? "",
  };
  const [before] = await db.select({ status: schema.payments.status }).from(schema.payments).where(eq(schema.payments.stripeInvoiceId, inv.id!));
  await db.insert(schema.payments).values(row).onConflictDoUpdate({ target: schema.payments.stripeInvoiceId, set: row });
  // One email per failed invoice, not one per retry.
  if (status === "failed" && before?.status !== "failed" && r) {
    const owner = await ownerEmail(r);
    if (owner?.email) {
      await sendEmail({
        to: owner.email,
        subject: `Coperto: il pagamento di ${eur(inv.total)} non è andato a buon fine`,
        text: [
          `Ciao ${owner.name},`,
          ``,
          `non siamo riusciti ad addebitare ${eur(inv.total)} per l’abbonamento di ${r.name}.`,
          `Riproveremo nei prossimi giorni. Per non interrompere le prenotazioni online, aggiorna la carta qui:`,
          `${await appUrl()}/app/abbonamento`,
        ].join("\n"),
      });
    }
  }
}

/** Handles one verified Stripe event. Every step can run twice without harm: Stripe may resend events. */
export async function handleStripeEvent(event: Stripe.Event) {
  switch (event.type) {
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      return syncSubscription(event.data.object);
    case "checkout.session.completed": {
      const session = event.data.object;
      const r = await restaurantFor(idOf(session.customer), session.client_reference_id);
      if (r && session.subscription) {
        const db = await getDb();
        await db
          .update(schema.restaurants)
          .set({ stripeCustomerId: idOf(session.customer), stripeSubscriptionId: idOf(session.subscription) })
          .where(eq(schema.restaurants.id, r.id));
      }
      return;
    }
    case "invoice.paid":
      return recordInvoice(event.data.object, "paid");
    case "invoice.payment_failed":
      return recordInvoice(event.data.object, "failed");
  }
}
