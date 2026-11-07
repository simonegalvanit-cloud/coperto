import "server-only";
import Stripe from "stripe";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { Restaurant } from "@/db/schema";
import { IVA, PLANS, type Interval, type PlanId } from "./billing";

let client: Stripe | null | undefined;

/** The Stripe client, or null while STRIPE_SECRET_KEY isn't set (payments not switched on yet). */
export function stripe(): Stripe | null {
  if (client !== undefined) return client;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return (client = null);
  // STRIPE_API_HOST points at a stand-in Stripe during automated tests; never set it in production.
  const host = process.env.STRIPE_API_HOST;
  client = new Stripe(key, host ? { host, port: Number(process.env.STRIPE_API_PORT ?? 80), protocol: "http" } : {});
  return client;
}

export const paymentsEnabled = () => !!process.env.STRIPE_SECRET_KEY;

const lookupKey = (plan: PlanId, interval: Interval) => `coperto_${plan}_${interval}`;

/** The plan's price for a lookup key ("coperto_sala_year" → Sala, yearly), for reading Stripe's events back. */
export function planFromLookupKey(key: string | null | undefined): { plan: PlanId; interval: Interval } | null {
  const m = /^coperto_(banco|sala)_(month|year)$/.exec(key ?? "");
  return m ? { plan: m[1] as PlanId, interval: m[2] as Interval } : null;
}

const priceCache = new Map<string, string>();

/**
 * The Stripe price for a plan, created the first time it's needed (so nothing has to be set up by hand in
 * Stripe), with IVA added on top.
 */
async function priceId(s: Stripe, plan: PlanId, interval: Interval) {
  const key = lookupKey(plan, interval);
  const cached = priceCache.get(key);
  if (cached) return cached;
  const found = await s.prices.list({ lookup_keys: [key], active: true, limit: 1 });
  const price =
    found.data[0] ??
    (await s.prices.create({
      currency: "eur",
      unit_amount: PLANS[plan][interval],
      recurring: { interval },
      lookup_key: key,
      tax_behavior: "exclusive",
      product_data: { name: `Coperto ${PLANS[plan].name} (${interval === "year" ? "annuale" : "mensile"})` },
    }));
  priceCache.set(key, price.id);
  return price.id;
}

let ivaRate: string | undefined;

/** Italian IVA at 22%, added to every invoice; created in Stripe the first time it's needed. */
async function ivaRateId(s: Stripe) {
  if (ivaRate) return ivaRate;
  const rates = await s.taxRates.list({ active: true, limit: 100 });
  const found = rates.data.find((t) => t.metadata?.coperto === `iva${IVA}`);
  ivaRate = (
    found ??
    (await s.taxRates.create({
      display_name: "IVA",
      percentage: IVA,
      inclusive: false,
      country: "IT",
      jurisdiction: "IT",
      metadata: { coperto: `iva${IVA}` },
    }))
  ).id;
  return ivaRate;
}

/** The fields an Italian invoice shows, as Stripe custom fields (Stripe allows four). */
function invoiceFields(r: Restaurant) {
  const fields = [
    r.billingVat && { name: "P.IVA", value: r.billingVat },
    r.billingTaxCode && { name: "Codice fiscale", value: r.billingTaxCode },
    r.billingSdi && { name: "Codice destinatario SDI", value: r.billingSdi },
    r.billingPec && { name: "PEC", value: r.billingPec },
  ].filter(Boolean) as { name: string; value: string }[];
  return fields.slice(0, 4);
}

/** The restaurant's Stripe customer, created or updated with its current billing details. */
export async function ensureCustomer(s: Stripe, r: Restaurant, ownerEmail: string) {
  const details = {
    email: ownerEmail,
    name: r.billingName || r.name,
    address: { line1: r.billingAddress || r.address || r.name, city: r.city || undefined, country: "IT" },
    preferred_locales: ["it"],
    invoice_settings: { custom_fields: invoiceFields(r) },
    metadata: { restaurantId: r.id },
  };
  if (r.stripeCustomerId) {
    await s.customers.update(r.stripeCustomerId, details);
    return r.stripeCustomerId;
  }
  const customer = await s.customers.create(details);
  const db = await getDb();
  await db.update(schema.restaurants).set({ stripeCustomerId: customer.id }).where(eq(schema.restaurants.id, r.id));
  return customer.id;
}

/**
 * A Stripe Checkout page for the chosen plan. During the free trial the card is saved now but the first charge
 * waits until the trial ends.
 */
export async function checkoutUrl(r: Restaurant, ownerEmail: string, plan: PlanId, interval: Interval, base: string) {
  const s = stripe();
  if (!s) throw new Error("Payments not configured");
  const [customer, price, tax] = await Promise.all([ensureCustomer(s, r, ownerEmail), priceId(s, plan, interval), ivaRateId(s)]);
  // Stripe wants a trial end at least two days away; closer than that, billing just starts now.
  const trialEnd = r.trialEndsAt.getTime() - Date.now() > 2 * 86_400_000 ? Math.floor(r.trialEndsAt.getTime() / 1000) : undefined;
  const session = await s.checkout.sessions.create({
    mode: "subscription",
    customer,
    client_reference_id: r.id,
    line_items: [{ price, quantity: 1 }],
    subscription_data: { default_tax_rates: [tax], metadata: { restaurantId: r.id }, ...(trialEnd ? { trial_end: trialEnd } : {}) },
    locale: "it",
    success_url: `${base}/app/abbonamento?attivato=1`,
    cancel_url: `${base}/app/abbonamento`,
  });
  return session.url!;
}

/** Stripe's own page to change card, switch plan, cancel and download invoices. */
export async function portalUrl(r: Restaurant, base: string) {
  const s = stripe();
  if (!s || !r.stripeCustomerId) throw new Error("No Stripe customer");
  const session = await s.billingPortal.sessions.create({ customer: r.stripeCustomerId, return_url: `${base}/app/abbonamento`, locale: "it" });
  return session.url;
}
