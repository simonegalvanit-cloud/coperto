"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import type { ActionResult } from "@/components/ActionForm";
import { requireAccount } from "@/lib/auth";
import { isInterval, isPlan } from "@/lib/billing";
import { checkoutUrl, ensureCustomer, paymentsEnabled, portalUrl, stripe } from "@/lib/stripe";
import { appUrl } from "@/lib/url";

const billingSchema = z
  .object({
    billingName: z.string().trim().min(2, "Scrivi la ragione sociale.").max(120),
    billingVat: z
      .string()
      .transform((v) => v.replace(/\s/g, "").replace(/^IT/i, ""))
      .refine((v) => /^\d{11}$/.test(v), "La partita IVA ha 11 cifre."),
    billingTaxCode: z
      .string()
      .transform((v) => v.replace(/\s/g, "").toUpperCase())
      .refine((v) => v === "" || /^[A-Z0-9]{11,16}$/.test(v), "Controlla il codice fiscale."),
    billingAddress: z.string().trim().min(5, "Scrivi l’indirizzo della sede (via, CAP, città).").max(200),
    billingSdi: z
      .string()
      .transform((v) => v.replace(/\s/g, "").toUpperCase())
      .refine((v) => v === "" || /^[A-Z0-9]{7}$/.test(v), "Il codice destinatario ha 7 caratteri."),
    billingPec: z.union([z.literal(""), z.email("Controlla la PEC.").trim().toLowerCase()]),
  })
  .refine((b) => b.billingSdi || b.billingPec, { message: "Serve il codice destinatario SDI o la PEC, per la fattura elettronica.", path: ["billingSdi"] });

const fields = (data: FormData) =>
  Object.fromEntries(["billingName", "billingVat", "billingTaxCode", "billingAddress", "billingSdi", "billingPec"].map((k) => [k, String(data.get(k) ?? "")]));

async function saveBillingDetails(restaurantId: string, data: FormData) {
  const parsed = billingSchema.safeParse(fields(data));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const db = await getDb();
  const [r] = await db.update(schema.restaurants).set(parsed.data).where(eq(schema.restaurants.id, restaurantId)).returning();
  return { restaurant: r };
}

/** Saves the invoice details and sends the owner to Stripe to enter the card for the chosen plan. */
export async function startCheckout(_: ActionResult, data: FormData): Promise<ActionResult> {
  const { restaurant, user } = await requireAccount("account");
  const [plan, interval] = String(data.get("choice") ?? "").split("_");
  if (!isPlan(plan) || !isInterval(interval)) return { error: "Scegli un piano." };
  const saved = await saveBillingDetails(restaurant.id, data);
  if ("error" in saved) return { error: saved.error };
  if (!paymentsEnabled()) return { error: "I pagamenti online non sono ancora attivi: ti contattiamo noi per attivare l’abbonamento." };
  const url = await checkoutUrl(saved.restaurant, user.email!, plan, interval, await appUrl());
  redirect(url);
}

/** Updates the invoice details, here and on Stripe's next invoices. */
export async function updateBilling(_: ActionResult, data: FormData): Promise<ActionResult> {
  const { restaurant, user } = await requireAccount("account");
  const saved = await saveBillingDetails(restaurant.id, data);
  if ("error" in saved) return { error: saved.error };
  const s = stripe();
  if (s && saved.restaurant.stripeCustomerId) await ensureCustomer(s, saved.restaurant, user.email!);
  revalidatePath("/app/abbonamento");
  return { ok: "Dati di fatturazione salvati." };
}

/** Stripe's page to change card, switch plan, cancel or download invoices. */
export async function openPortal() {
  const { restaurant } = await requireAccount("account");
  redirect(await portalUrl(restaurant, await appUrl()));
}
