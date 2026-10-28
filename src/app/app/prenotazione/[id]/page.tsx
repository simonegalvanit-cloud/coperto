import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { requireAccount } from "@/lib/auth";
import { capitalize, formatDate } from "@/lib/time";
import { ReservationForm } from "../../ReservationForm";

export const metadata: Metadata = { title: "Modifica prenotazione" };

export default async function EditReservationPage({ params }: PageProps<"/app/prenotazione/[id]">) {
  const { restaurant } = await requireAccount();
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) notFound();
  const db = await getDb();
  const [booking] = await db
    .select()
    .from(schema.reservations)
    .where(and(eq(schema.reservations.id, id.data), eq(schema.reservations.restaurantId, restaurant.id)));
  if (!booking) notFound();
  return (
    <>
      <div>
        <Link href={`/app?data=${booking.date}`}>‹ {capitalize(formatDate(booking.date))}</Link>
        <h1 style={{ marginTop: 8 }}>{booking.guestName}</h1>
      </div>
      <div className="panel">
        <ReservationForm date={booking.date} initial={booking} />
      </div>
    </>
  );
}
