import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { requireAccount } from "@/lib/auth";
import { hasSalaFeatures } from "@/lib/billing";
import { tableOptions } from "@/lib/plan";
import { capitalize, formatDate } from "@/lib/time";
import { ReservationForm } from "../../ReservationForm";

export const metadata: Metadata = { title: "Modifica prenotazione" };

export default async function EditReservationPage({ params }: PageProps<"/app/prenotazione/[id]">) {
  const { restaurant } = await requireAccount();
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) notFound();
  const db = await getDb();
  const [row] = await db
    .select({ booking: schema.reservations, by: schema.users.name })
    .from(schema.reservations)
    .leftJoin(schema.users, eq(schema.users.id, schema.reservations.createdBy))
    .where(and(eq(schema.reservations.id, id.data), eq(schema.reservations.restaurantId, restaurant.id)));
  if (!row) notFound();
  const { booking, by } = row;
  const when = new Intl.DateTimeFormat("it-IT", { dateStyle: "medium", timeStyle: "short", timeZone: restaurant.timezone }).format(booking.createdAt);
  const tables = await tableOptions(restaurant.id);
  return (
    <>
      <div>
        <Link href={`/app?data=${booking.date}`}>‹ {capitalize(formatDate(booking.date))}</Link>
        <h1 style={{ marginTop: 8 }}>{booking.guestName}</h1>
        <p className="small muted">
          {booking.source === "online" ? "Prenotata online" : by ? `Inserita da ${by}` : "Inserita dal ristorante"} il {when}
        </p>
      </div>
      <div className="panel">
        <ReservationForm date={booking.date} initial={booking} tables={tables} profiles={hasSalaFeatures(restaurant)} />
      </div>
    </>
  );
}
