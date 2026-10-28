import Link from "next/link";
import { and, asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { Reservation, ReservationStatus } from "@/db/schema";
import { requireAccount } from "@/lib/auth";
import { ACTIVE_STATUSES } from "@/lib/restaurant";
import { addDays, capitalize, formatDate, isDate, nowIn, toMinutes, weekdayOf } from "@/lib/time";
import { ConfirmButton } from "@/components/ConfirmButton";
import { setStatus } from "./actions";

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

export default async function DayPage({ searchParams }: PageProps<"/app">) {
  const { restaurant } = await requireAccount();
  const today = nowIn(restaurant.timezone).date;
  const param = (await searchParams).data;
  const date = typeof param === "string" && isDate(param) ? param : today;

  const db = await getDb();
  const [bookings, services, [closure]] = await Promise.all([
    db
      .select()
      .from(schema.reservations)
      .where(and(eq(schema.reservations.restaurantId, restaurant.id), eq(schema.reservations.date, date)))
      .orderBy(asc(schema.reservations.time), asc(schema.reservations.createdAt)),
    db
      .select()
      .from(schema.serviceHours)
      .where(and(eq(schema.serviceHours.restaurantId, restaurant.id), eq(schema.serviceHours.weekday, weekdayOf(date))))
      .orderBy(asc(schema.serviceHours.startTime)),
    db
      .select()
      .from(schema.closures)
      .where(and(eq(schema.closures.restaurantId, restaurant.id), eq(schema.closures.date, date))),
  ]);

  const active = bookings.filter((b) => (ACTIVE_STATUSES as readonly string[]).includes(b.status) || b.status === "completed");
  const covers = (list: Reservation[]) => list.reduce((n, b) => n + b.partySize, 0);

  // Each booking goes under the service it falls in; anything outside the hours goes under "Fuori orario".
  const groups = services.map((s) => ({ name: s.name, hours: `${s.startTime}–${s.endTime}`, items: [] as Reservation[] }));
  const other = { name: "Fuori orario", hours: "", items: [] as Reservation[] };
  for (const b of bookings) {
    const t = toMinutes(b.time);
    const idx = services.findIndex((s, i) => {
      const nextStart = services[i + 1] ? toMinutes(services[i + 1].startTime) : Infinity;
      return t >= toMinutes(s.startTime) - 60 && t < nextStart - 60;
    });
    (idx >= 0 ? groups[idx] : other).items.push(b);
  }
  if (other.items.length) groups.push(other);

  const label = date === today ? "Oggi" : date === addDays(today, 1) ? "Domani" : date === addDays(today, -1) ? "Ieri" : null;

  return (
    <>
      <div className="daybar">
        <h1>
          {label ? `${label}, ${formatDate(date)}` : capitalize(formatDate(date))}
        </h1>
        <form className="daynav" action="/app">
          <Link className="btn btn-small" href={`/app?data=${addDays(date, -1)}`} aria-label="Giorno precedente">‹</Link>
          {date !== today && <Link className="btn btn-small" href="/app">Oggi</Link>}
          <Link className="btn btn-small" href={`/app?data=${addDays(date, 1)}`} aria-label="Giorno successivo">›</Link>
          <input className="input btn-small" type="date" name="data" defaultValue={date} aria-label="Vai alla data" />
          <button className="btn btn-small" type="submit">Vai</button>
        </form>
      </div>

      {closure && (
        <p className="panel">
          <strong>Chiuso</strong>
          {closure.note ? `: ${closure.note}` : ""}. Le prenotazioni online sono bloccate per questa data.
        </p>
      )}

      <div className="totals">
        <div><strong>{covers(active)}</strong><span>coperti</span></div>
        <div><strong>{active.length}</strong><span>tavoli prenotati</span></div>
        <div><strong>{covers(bookings.filter((b) => b.status === "seated"))}</strong><span>a tavola ora</span></div>
        <div><strong>{bookings.filter((b) => b.status === "no_show").length}</strong><span>no-show</span></div>
      </div>

      {bookings.length === 0 ? (
        <div className="empty stack">
          <p>Nessuna prenotazione per {label ? label.toLowerCase() : formatDate(date)}.</p>
          <p>
            <Link className="btn" href={`/app/nuova?data=${date}`}>Aggiungi una prenotazione</Link>
          </p>
        </div>
      ) : (
        groups
          .filter((g) => g.items.length > 0)
          .map((g) => (
            <section className="service" key={g.name}>
              <h2>
                {g.name} <small>{g.hours && `${g.hours} · `}{covers(g.items.filter((b) => active.includes(b)))} coperti</small>
              </h2>
              <ul className="bookings">
                {g.items.map((b) => (
                  <BookingRow key={b.id} b={b} />
                ))}
              </ul>
            </section>
          ))
      )}
    </>
  );
}

function BookingRow({ b }: { b: Reservation }) {
  const stateClass =
    b.status === "seated" ? "is-seated" : b.status === "completed" ? "is-done" : b.status === "cancelled" || b.status === "no_show" ? "is-cancelled" : "";
  return (
    <li className={`booking ${stateClass}`}>
      <time>{b.time}</time>
      <div className="who">
        <div>
          <span className="name">{b.guestName}</span>
          <span className="party" title={`${b.partySize} persone`}>{b.partySize}</span>
        </div>
        <div className="meta muted">
          {b.guestPhone && <a href={`tel:${b.guestPhone.replace(/\s/g, "")}`}>{b.guestPhone}</a>}
          <span>{SOURCE[b.source]}</span>
          {b.status === "cancelled" && <span className="tag tag-alert">Cancellata</span>}
          {b.status === "no_show" && <span className="tag tag-alert">No-show</span>}
          {b.status === "completed" && <span className="tag">Andati via</span>}
        </div>
        {b.notes && <p className="note">{b.notes}</p>}
      </div>
      <div className="actions">
        {NEXT[b.status].map((a) => (
          <form key={a.status} action={setStatus}>
            <input type="hidden" name="id" value={b.id} />
            <input type="hidden" name="status" value={a.status} />
            {a.danger ? (
              <ConfirmButton className="btn btn-small btn-danger" question={`Cancellare la prenotazione di ${b.guestName}?${b.guestEmail ? " L’ospite riceverà un’email." : ""}`}>
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
