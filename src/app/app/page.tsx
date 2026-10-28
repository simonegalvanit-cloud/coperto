import Link from "next/link";
import { and, asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { Reservation } from "@/db/schema";
import { requireAccount } from "@/lib/auth";
import { loadPlan, optionsFromPlan } from "@/lib/plan";
import { tablesOf } from "@/lib/floor";
import { guestInfoFor, linkUnlinked } from "@/lib/guests";
import { getWaitlist } from "@/lib/waitlist";
import { ACTIVE_STATUSES } from "@/lib/restaurant";
import { addDays, capitalize, formatDate, isDate, nowIn, toMinutes, weekdayOf } from "@/lib/time";
import { LiveSync } from "@/components/LiveSync";
import { DayJump } from "@/components/DayJump";
import { changeStamp } from "@/lib/changes";
import { BookingRow } from "./BookingRow";

export default async function DayPage({ searchParams }: PageProps<"/app">) {
  const { restaurant } = await requireAccount();
  const today = nowIn(restaurant.timezone).date;
  const param = (await searchParams).data;
  const date = typeof param === "string" && isDate(param) ? param : today;

  const db = await getDb();
  await linkUnlinked(restaurant.id);
  const [bookings, services, [closure], plan, stamp, waitlist] = await Promise.all([
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
    loadPlan(restaurant.id),
    changeStamp(restaurant.id),
    getWaitlist(restaurant.id, date),
  ]);
  const waiting = waitlist.filter((w) => w.status === "waiting" || w.status === "notified");
  const guestInfo = await guestInfoFor(restaurant.id, bookings);
  const tables = optionsFromPlan(plan);
  const placeLabel = new Map(
    tables.map((t) => [t.value, `${t.combinationId ? "Tavoli" : "Tavolo"} ${t.label}${t.zone ? ` · ${t.zone}` : ""}`]),
  );

  const active = bookings.filter((b) => (ACTIVE_STATUSES as readonly string[]).includes(b.status) || b.status === "completed");
  const covers = (list: Reservation[]) => list.reduce((n, b) => n + b.partySize, 0);
  // Distinct tables in use today: joined tables count each of their tables once.
  const tablesInUse = new Set(active.flatMap((b) => tablesOf(b, plan.combos))).size;

  // Each booking goes under the service whose hours it falls in (from an hour before opening to half an hour
  // after the last arrival); anything else, like 23:30 after a 22:00 close, goes under "Fuori orario".
  const groups = services.map((s) => ({ name: s.name, hours: `${s.startTime}–${s.endTime}`, items: [] as Reservation[] }));
  const other = { name: "Fuori orario", hours: "", items: [] as Reservation[] };
  for (const b of bookings) {
    const t = toMinutes(b.time);
    const idx = services.findIndex((s) => t >= toMinutes(s.startTime) - 60 && t <= toMinutes(s.endTime) + 30);
    (idx >= 0 ? groups[idx] : other).items.push(b);
  }
  if (other.items.length) groups.push(other);

  const label = date === today ? "Oggi" : date === addDays(today, 1) ? "Domani" : date === addDays(today, -1) ? "Ieri" : null;

  return (
    <>
      <LiveSync stamp={stamp} />
      <div className="daybar">
        <h1>
          {label ? `${label}, ${formatDate(date)}` : capitalize(formatDate(date))}
        </h1>
        <div className="daynav">
          <Link className="btn btn-small" href={`/app?data=${addDays(date, -1)}`} prefetch aria-label="Giorno precedente">‹</Link>
          {date !== today && <Link className="btn btn-small" href="/app">Oggi</Link>}
          <Link className="btn btn-small" href={`/app?data=${addDays(date, 1)}`} prefetch aria-label="Giorno successivo">›</Link>
          <DayJump basePath="/app" date={date} />
        </div>
      </div>

      {closure && (
        <p className="panel">
          <strong>Chiuso</strong>
          {closure.note ? `: ${closure.note}` : ""}. Le prenotazioni online sono bloccate per questa data.
        </p>
      )}

      {waiting.length > 0 && (
        <div className="panel waiting-summary">
          <strong>In lista d’attesa ({waiting.length}):</strong>{" "}
          {waiting.map((w, i) => (
            <span key={w.id}>
              {i > 0 && ", "}
              {w.name} ({w.partySize}){w.source === "online" && " online"}
            </span>
          ))}
          . <Link href={`/app/sala?data=${date}`}>Gestisci dalla Sala</Link>
        </div>
      )}

      <div className="totals">
        <div><strong>{covers(active)}</strong><span>coperti</span></div>
        <div><strong>{active.length}</strong><span>prenotazioni</span></div>
        {plan.tables.length > 0 && (
          <div><strong>{tablesInUse}</strong><span>tavoli assegnati</span></div>
        )}
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
                  <BookingRow
                    key={b.id}
                    b={{
                      id: b.id,
                      time: b.time,
                      partySize: b.partySize,
                      guestName: b.guestName,
                      guestPhone: b.guestPhone,
                      guestEmail: b.guestEmail,
                      notes: b.notes,
                      status: b.status,
                      source: b.source,
                      guestConfirmedAt: b.guestConfirmedAt,
                    }}
                    guest={guestInfo.get(b.id)}
                    table={b.tableId ? placeLabel.get(`t:${b.tableId}`) : b.combinationId ? placeLabel.get(`c:${b.combinationId}`) : undefined}
                  />
                ))}
              </ul>
            </section>
          ))
      )}
    </>
  );
}
