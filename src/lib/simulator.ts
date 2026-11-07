import { IVA, PLANS, withIva } from "./billing";

export type SimInput = {
  restaurants: number;
  /** Share on Sala, 0–1 (the rest on Banco). */
  salaShare: number;
  /** Share paying yearly, 0–1 (the rest monthly). */
  yearlyShare: number;
  /** Coperto's own monthly costs (hosting, email, tools, people), in cents. */
  costsMonthly: number;
  /** Stripe's fee per charge: a percentage of the amount charged (IVA included) plus a fixed part in cents. */
  feePercent: number;
  feeFixed: number;
};

/** One restaurant's yearly numbers for a plan and interval, in cents. */
function perRestaurant(plan: keyof typeof PLANS, yearly: boolean, input: Pick<SimInput, "feePercent" | "feeFixed">) {
  const charge = yearly ? PLANS[plan].year : PLANS[plan].month;
  const charges = yearly ? 1 : 12;
  const fee = (withIva(charge) * input.feePercent) / 100 + input.feeFixed;
  return { revenue: charge * charges, iva: (charge * charges * IVA) / 100, fees: fee * charges };
}

/** What a restaurant brings on average with this mix of plans, per year (cents). */
export function averageRestaurant(input: Pick<SimInput, "salaShare" | "yearlyShare" | "feePercent" | "feeFixed">) {
  const mix = [
    { plan: "sala" as const, yearly: true, w: input.salaShare * input.yearlyShare },
    { plan: "sala" as const, yearly: false, w: input.salaShare * (1 - input.yearlyShare) },
    { plan: "banco" as const, yearly: true, w: (1 - input.salaShare) * input.yearlyShare },
    { plan: "banco" as const, yearly: false, w: (1 - input.salaShare) * (1 - input.yearlyShare) },
  ];
  return mix.reduce(
    (acc, m) => {
      const one = perRestaurant(m.plan, m.yearly, input);
      return { revenue: acc.revenue + one.revenue * m.w, iva: acc.iva + one.iva * m.w, fees: acc.fees + one.fees * m.w };
    },
    { revenue: 0, iva: 0, fees: 0 },
  );
}

/**
 * Yearly figures for a number of paying restaurants (cents): revenue before IVA, the IVA collected for the State
 * (not Coperto's money), Stripe's fees, Coperto's costs and what's left. Before income taxes.
 */
export function simulate(input: SimInput) {
  const avg = averageRestaurant(input);
  const revenue = avg.revenue * input.restaurants;
  const iva = avg.iva * input.restaurants;
  const fees = avg.fees * input.restaurants;
  const costs = input.costsMonthly * 12;
  const profit = revenue - fees - costs;
  const margin = avg.revenue - avg.fees;
  return {
    revenue,
    iva,
    fees,
    costs,
    profit,
    /** Paying restaurants needed to cover the costs. */
    breakEven: costs <= 0 ? 0 : margin > 0 ? Math.ceil(costs / margin) : Infinity,
  };
}

/**
 * Twelve months ahead: each month some restaurants leave (churn, a share of those paying) and new ones join.
 * Revenue is counted as it accrues (a yearly plan as a twelfth each month).
 */
export function project(input: SimInput & { newPerMonth: number; churnPercent: number }, months = 12) {
  const avg = averageRestaurant(input);
  let n = input.restaurants;
  let cumulative = 0;
  return Array.from({ length: months }, (_, i) => {
    n = n * (1 - input.churnPercent / 100) + input.newPerMonth;
    const revenue = (avg.revenue / 12) * n;
    const fees = (avg.fees / 12) * n;
    const profit = revenue - fees - input.costsMonthly;
    cumulative += profit;
    return { month: i + 1, restaurants: n, revenue, profit, cumulative };
  });
}
