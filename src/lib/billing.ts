import type { Restaurant } from "@/db/schema";

export type PlanId = "banco" | "sala";
export type Interval = "month" | "year";

/** Prices before IVA, in cents. A year costs ten months: two are free. */
export const PLANS: Record<PlanId, { name: string; month: number; year: number; blurb: string }> = {
  banco: { name: "Banco", month: 1999, year: 19990, blurb: "Prenotazioni online, lista d’attesa, promemoria" },
  sala: { name: "Sala", month: 3999, year: 39990, blurb: "Tutto Banco, più pianta della sala e schede ospite" },
};
export const IVA = 22;
export const TRIAL_DAYS = 14;

export const isPlan = (v: unknown): v is PlanId => v === "banco" || v === "sala";
export const isInterval = (v: unknown): v is Interval => v === "month" || v === "year";

const euros = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });
export const eur = (cents: number) => euros.format(cents / 100);
export const withIva = (cents: number) => Math.round((cents * (100 + IVA)) / 100);

/** What a plan brings in per month, before IVA: a yearly plan counts a twelfth of the year. */
export const monthlyValue = (plan: string | null, interval: string | null) => {
  if (!isPlan(plan)) return 0;
  return interval === "year" ? Math.round(PLANS[plan].year / 12) : PLANS[plan].month;
};

export type BillingState =
  | { kind: "trial"; daysLeft: number; endsAt: Date }
  | { kind: "comp"; until: Date }
  | { kind: "active"; plan: PlanId; interval: Interval; renewsAt: Date | null; cancelling: boolean }
  | { kind: "past_due"; plan: PlanId; interval: Interval }
  | { kind: "expired"; reason: "trial_over" | "canceled" };

type BillingFields = Pick<
  Restaurant,
  "trialEndsAt" | "plan" | "billingInterval" | "subscriptionStatus" | "currentPeriodEnd" | "cancelAtPeriodEnd" | "compUntil"
>;

/**
 * Where a restaurant stands: on trial, given free access by Coperto, paying, behind on a payment (still working
 * while Stripe retries the card), or expired (trial over without subscribing, or subscription ended).
 */
export function billingState(r: BillingFields, now = new Date()): BillingState {
  if (r.compUntil && r.compUntil > now) return { kind: "comp", until: r.compUntil };
  const plan = isPlan(r.plan) ? r.plan : "sala";
  const interval = isInterval(r.billingInterval) ? r.billingInterval : "month";
  if (r.subscriptionStatus === "active" || r.subscriptionStatus === "trialing") {
    return { kind: "active", plan, interval, renewsAt: r.currentPeriodEnd, cancelling: r.cancelAtPeriodEnd };
  }
  if (r.subscriptionStatus === "past_due") return { kind: "past_due", plan, interval };
  if (r.trialEndsAt > now) {
    return { kind: "trial", daysLeft: Math.ceil((r.trialEndsAt.getTime() - now.getTime()) / 86_400_000), endsAt: r.trialEndsAt };
  }
  return { kind: "expired", reason: r.subscriptionStatus ? "canceled" : "trial_over" };
}

/** Whether guests can book online: not after the trial or the subscription has ended (the soft block). */
export const acceptsOnline = (r: BillingFields & Pick<Restaurant, "bookingOpen">, now = new Date()) =>
  r.bookingOpen && billingState(r, now).kind !== "expired";

/**
 * Which features the restaurant has: everything on trial and with free access; on Banco, no floor plan and no
 * guest profiles (those are Sala).
 */
export function hasSalaFeatures(r: BillingFields, now = new Date()) {
  const s = billingState(r, now);
  return !((s.kind === "active" || s.kind === "past_due") && s.plan === "banco");
}
