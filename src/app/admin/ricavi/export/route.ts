import { isAdmin, logAdmin, paymentsForYear } from "@/lib/admin";
import { getCurrentUser } from "@/lib/auth";

const cell = (v: string | number | null) => `"${String(v ?? "").replace(/"/g, '""').replace(/^[=@+\-\t\r]/, "'$&")}"`;
const money = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");
const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");

/** A year's payments with the customer's invoice details, for the accountant and the e-invoicing service. */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user || user.onTablet || !isAdmin(user.email)) return new Response("Non trovato", { status: 404 });
  const year = Number(new URL(req.url).searchParams.get("anno")) || new Date().getFullYear();
  const rows = await paymentsForYear(year);
  await logAdmin({ id: user.id, email: user.email! }, "Ha scaricato i pagamenti per il commercialista", String(year));
  const header = ["Data", "Numero fattura Stripe", "Stato", "Ristorante", "Ragione sociale", "P.IVA", "Codice fiscale", "Sede", "Codice SDI", "PEC", "Piano", "Periodo dal", "al", "Imponibile", "IVA", "Totale"];
  const lines = rows.map((p) => [
    day(p.createdAt), p.number, p.status === "paid" ? "pagata" : "non riuscita", p.restaurantName, p.billingName, p.billingVat, p.billingTaxCode,
    p.billingAddress, p.billingSdi, p.billingPec, `${p.plan} ${p.interval}`, day(p.periodStart), day(p.periodEnd), money(p.amountNet), money(p.amountTax), money(p.amountTotal),
  ]);
  const csv = "﻿" + [header, ...lines].map((l) => l.map(cell).join(";")).join("\r\n");
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="coperto-pagamenti-${year}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
