"use client";

import { useOptimistic } from "react";
import Link from "next/link";
import type { Reservation, ReservationStatus } from "@/db/schema";
import { ConfirmButton } from "@/components/ConfirmButton";
import { setStatus } from "./actions";

export type RowBooking = Pick<
  Reservation,
  "id" | "time" | "partySize" | "guestName" | "guestPhone" | "guestEmail" | "notes" | "status" | "source"
>;

const SOURCE: Record<Reservation["source"], string> = { online: "Online", phone: "Telefono", walk_in: "Senza prenotazione" };

// What staff can do next from each state, most likely action first.
const NEXT: Record<ReservationStatus, { status: ReservationStatus; label: string; danger?: boolean }[]> = {
  confirmed: [
    { status: "seated", label: "Seduti" },
    { status: "no_show", label: "No-show" },
    { status: "cancelled", label: "Cancella", danger: true },
  ],
  seated: [
    { status: "completed", label: "Andati via" },
    { status: "confirmed", label: "Annulla" },
  ],
  completed: [{ status: "seated", label: "Ancora seduti" }],
  cancelled: [{ status: "confirmed", label: "Ripristina" }],
  no_show: [{ status: "confirmed", label: "Ripristina" }],
};

const STATE_CLASS: Partial<Record<ReservationStatus, string>> = {
  seated: "is-seated",
  completed: "is-done",
  cancelled: "is-cancelled",
  no_show: "is-cancelled",
};

/** One booking in the day list. A status tap shows the new status at once; the server confirms in the background. */
export function BookingRow({ b, table }: { b: RowBooking; table?: string }) {
  const [status, showStatus] = useOptimistic(b.status);
  const change = (next: ReservationStatus) => async (data: FormData) => {
    showStatus(next);
    await setStatus(data);
  };

  return (
    <li className={`booking ${STATE_CLASS[status] ?? ""}`}>
      <time>{b.time}</time>
      <div className="who">
        <div>
          <span className="name">{b.guestName}</span>
          <span className="party" title={`${b.partySize} persone`}>{b.partySize}</span>
        </div>
        <div className="meta muted">
          {table && <span className="table-tag">{table}</span>}
          {b.guestPhone && <a href={`tel:${b.guestPhone.replace(/\s/g, "")}`}>{b.guestPhone}</a>}
          <span>{SOURCE[b.source]}</span>
          {status === "cancelled" && <span className="tag tag-alert">Cancellata</span>}
          {status === "no_show" && <span className="tag tag-alert">No-show</span>}
          {status === "completed" && <span className="tag">Andati via</span>}
        </div>
        {b.notes && <p className="note">{b.notes}</p>}
      </div>
      <div className="actions">
        {NEXT[status].map((a) => (
          <form key={a.status} action={change(a.status)}>
            <input type="hidden" name="id" value={b.id} />
            <input type="hidden" name="status" value={a.status} />
            {a.danger ? (
              <ConfirmButton
                className="btn btn-small btn-danger"
                question={`Cancellare la prenotazione di ${b.guestName}?${b.guestEmail ? " L’ospite riceverà un’email." : ""}`}
              >
                {a.label}
              </ConfirmButton>
            ) : (
              <button className={`btn btn-small${a.status === "seated" ? " btn-fill" : ""}`} type="submit">
                {a.label}
              </button>
            )}
          </form>
        ))}
        <Link className="btn btn-small btn-quiet" href={`/app/prenotazione/${b.id}`}>Modifica</Link>
      </div>
    </li>
  );
}
