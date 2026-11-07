import { test } from "node:test";
import assert from "node:assert/strict";
import { acceptsOnline, billingState, hasSalaFeatures, monthlyValue, withIva } from "../src/lib/billing";

const now = new Date("2026-11-07T12:00:00Z");
const day = 86_400_000;
const base = {
  trialEndsAt: new Date(now.getTime() + 5 * day),
  plan: null,
  billingInterval: null,
  subscriptionStatus: null,
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
  compUntil: null,
  bookingOpen: true,
};

test("on trial: days left, everything included, bookings open", () => {
  const s = billingState(base, now);
  assert.equal(s.kind, "trial");
  assert.equal(s.kind === "trial" && s.daysLeft, 5);
  assert.equal(acceptsOnline(base, now), true);
  assert.equal(hasSalaFeatures(base, now), true);
});

test("trial over without subscribing: expired, online bookings pause (soft block)", () => {
  const r = { ...base, trialEndsAt: new Date(now.getTime() - day) };
  assert.deepEqual(billingState(r, now), { kind: "expired", reason: "trial_over" });
  assert.equal(acceptsOnline(r, now), false);
});

test("paying on Banco: active, no Sala features; on Sala: all", () => {
  const banco = { ...base, trialEndsAt: new Date(now.getTime() - day), plan: "banco", billingInterval: "year", subscriptionStatus: "active" };
  assert.equal(billingState(banco, now).kind, "active");
  assert.equal(hasSalaFeatures(banco, now), false);
  assert.equal(acceptsOnline(banco, now), true);
  assert.equal(hasSalaFeatures({ ...banco, plan: "sala" }, now), true);
});

test("card failing: still works while Stripe retries; ended subscription: expired", () => {
  const r = { ...base, trialEndsAt: new Date(now.getTime() - 30 * day), plan: "sala", subscriptionStatus: "past_due" };
  assert.equal(billingState(r, now).kind, "past_due");
  assert.equal(acceptsOnline(r, now), true);
  assert.deepEqual(billingState({ ...r, subscriptionStatus: "canceled" }, now), { kind: "expired", reason: "canceled" });
});

test("free access from Coperto wins over everything until it ends", () => {
  const r = { ...base, trialEndsAt: new Date(now.getTime() - day), subscriptionStatus: "canceled", compUntil: new Date(now.getTime() + day) };
  assert.equal(billingState(r, now).kind, "comp");
  assert.equal(acceptsOnline(r, now), true);
  assert.equal(billingState({ ...r, compUntil: new Date(now.getTime() - 1) }, now).kind, "expired");
});

test("bookings switched off by the restaurant stay off", () => {
  assert.equal(acceptsOnline({ ...base, bookingOpen: false }, now), false);
});

test("money: monthly value of yearly plans, IVA on top", () => {
  assert.equal(monthlyValue("sala", "month"), 3999);
  assert.equal(monthlyValue("sala", "year"), 3333);
  assert.equal(monthlyValue("banco", "year"), 1666);
  assert.equal(monthlyValue(null, null), 0);
  assert.equal(withIva(1999), 2439);
  assert.equal(withIva(39990), 48788);
});
