import type { Metadata } from "next";
import { requireAccount } from "@/lib/auth";
import { isDate, nowIn } from "@/lib/time";
import { ReservationForm } from "../ReservationForm";

export const metadata: Metadata = { title: "Nuova prenotazione" };

export default async function NewReservationPage({ searchParams }: PageProps<"/app/nuova">) {
  const { restaurant } = await requireAccount();
  const param = (await searchParams).data;
  const date = typeof param === "string" && isDate(param) ? param : nowIn(restaurant.timezone).date;
  return (
    <>
      <h1>Nuova prenotazione</h1>
      <div className="panel">
        <ReservationForm date={date} />
      </div>
    </>
  );
}
