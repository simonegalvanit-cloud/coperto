import { test } from "node:test";
import assert from "node:assert/strict";
import { project, simulate } from "../src/lib/simulator";

const noFees = { feePercent: 0, feeFixed: 0, costsMonthly: 0 };

test("100 restaurants all on Sala monthly: 3.999 € a month before IVA", () => {
  const s = simulate({ restaurants: 100, salaShare: 1, yearlyShare: 0, ...noFees });
  assert.equal(s.revenue, 3999 * 12 * 100);
  assert.equal(Math.round(s.iva), Math.round(3999 * 12 * 100 * 0.22));
  assert.equal(s.profit, s.revenue);
});

test("yearly plans cost ten months", () => {
  const s = simulate({ restaurants: 10, salaShare: 0, yearlyShare: 1, ...noFees });
  assert.equal(s.revenue, 19990 * 10);
});

test("Stripe fees: 1,5% of the amount with IVA plus 25 cents, per charge", () => {
  const monthly = simulate({ restaurants: 1, salaShare: 1, yearlyShare: 0, feePercent: 1.5, feeFixed: 25, costsMonthly: 0 });
  // 48,79 € charged 12 times: 12 × (0,73185 + 0,25) €
  assert.equal(Math.round(monthly.fees), Math.round(12 * (4879 * 0.015 + 25)));
  const yearly = simulate({ restaurants: 1, salaShare: 1, yearlyShare: 1, feePercent: 1.5, feeFixed: 25, costsMonthly: 0 });
  // One charge of 487,88 € (7,57 € in fees) against twelve of 48,79 € (11,78 €).
  assert.equal(Math.round(yearly.fees), Math.round(48788 * 0.015 + 25));
  assert.ok(yearly.fees < monthly.fees, "one charge a year costs less in fees");
});

test("break-even: costs covered by enough restaurants", () => {
  const s = simulate({ restaurants: 0, salaShare: 1, yearlyShare: 0, feePercent: 0, feeFixed: 0, costsMonthly: 40000 });
  // 400 € a month of costs ÷ 39,99 € per restaurant → 11 restaurants
  assert.equal(s.breakEven, 11);
  assert.equal(s.profit, -40000 * 12);
});

test("projection: growth and churn month by month", () => {
  const rows = project({ restaurants: 10, salaShare: 1, yearlyShare: 0, ...noFees, newPerMonth: 5, churnPercent: 10 });
  assert.equal(rows.length, 12);
  assert.equal(rows[0].restaurants, 10 * 0.9 + 5);
  assert.ok(rows[11].restaurants > rows[0].restaurants);
  assert.equal(Math.round(rows[0].revenue), Math.round(3999 * 14));
  assert.equal(Math.round(rows[11].cumulative), Math.round(rows.reduce((t, r) => t + r.profit, 0)));
});
