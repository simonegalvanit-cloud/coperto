import type { Metadata } from "next";
import { asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireAccount } from "@/lib/auth";
import { isDate, nowIn } from "@/lib/time";
import { ReservationForm } from "../ReservationForm";

export const metadata: Metadata = { title: "Nuova prenotazione" };

export default async function NewReservationPage({ searchParams }: PageProps<"/app/nuova">) {
  const { restaurant } = await requireAccount();
  const param = (await searchParams).data;
  const date = typeof param === "string" && isDate(param) ? param : nowIn(restaurant.timezone).date;
  const db = await getDb();
  const tables = await db
    .select({ id: schema.diningTables.id, label: schema.diningTables.label, seats: schema.diningTables.seats })
    .from(schema.diningTables)
    .where(eq(schema.diningTables.restaurantId, restaurant.id))
    .orderBy(asc(schema.diningTables.label));
  return (
    <>
      <h1>Nuova prenotazione</h1>
      <div className="panel">
        <ReservationForm date={date} tables={tables} />
      </div>
    </>
  );
}
