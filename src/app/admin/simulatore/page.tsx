import type { Metadata } from "next";
import { requireAdmin, revenue } from "@/lib/admin";
import { Simulator } from "./Simulator";

export const metadata: Metadata = { title: "Simulatore" };

export default async function AdminSimulator() {
  await requireAdmin();
  const r = await revenue();
  const paying = r.byState.active + r.byState.past_due;
  return (
    <>
      <div>
        <h1>Simulatore</h1>
        <p className="muted">Quanto rende Coperto con un certo numero di ristoranti abbonati. Cambia i numeri: i risultati si aggiornano subito.</p>
      </div>
      <Simulator
        today={{
          restaurants: paying,
          salaShare: paying ? r.byPlan.sala.count / paying : 0.6,
          yearlyShare: paying ? r.yearly / paying : 0.3,
        }}
      />
    </>
  );
}
