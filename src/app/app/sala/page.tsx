import type { Metadata } from "next";
import Link from "next/link";
import { and, asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { LiveSync } from "@/components/LiveSync";
import { DayJump } from "@/components/DayJump";
import { changeStamp } from "@/lib/changes";
import { requireAccount } from "@/lib/auth";
import { closedAreas, loadPlan } from "@/lib/plan";
import { guestInfoFor } from "@/lib/guests";
import { getWaitlist } from "@/lib/waitlist";
import type { FloorBooking } from "@/lib/floor";
import { addDays, capitalize, formatDate, isDate, nowIn, toMinutes, weekdayOf } from "@/lib/time";
import { FloorLive } from "./FloorLive";

export const metadata: Metadata = { title: "Sala" };

export default async function FloorPage({ searchParams }: PageProps<"/app/sala">) {
  const { restaurant } = await requireAccount();
  const now = nowIn(restaurant.timezone);
  const param = (await searchParams).data;
  const date = typeof param === "string" && isDate(param) ? param : now.date;
  const isToday = date === now.date;

  const db = await getDb();
  const [plan, rows, services, closed, stamp] = await Promise.all([
    loadPlan(restaurant.id),
    db
      .select()
      .from(schema.reservations)
      .where(and(eq(schema.reservations.restaurantId, restaurant.id), eq(schema.reservations.date, date))),
    db
      .select()
      .from(schema.serviceHours)
      .where(and(eq(schema.serviceHours.restaurantId, restaurant.id), eq(schema.serviceHours.weekday, weekdayOf(date))))
      .orderBy(asc(schema.serviceHours.startTime)),
    closedAreas(restaurant.id, date),
    changeStamp(restaurant.id),
  ]);

  if (plan.tables.length === 0) {
    return (
      <div className="panel drawing stack" style={{ maxWidth: 640 }}>
        <h1>Il tuo locale</h1>
        <p>
          Disegna piani, sale, cucina, bar e tavoli come sono davvero: poi qui vedi chi è seduto, chi sta arrivando e quale tavolo si libera, per tutto il
          servizio.
        </p>
        <p>
          <Link className="btn btn-fill" href="/app/sala/modifica">Disegna il locale</Link>
        </p>
      </div>
    );
  }

  // The slider spans the day's services, from half an hour before opening until the last table leaves.
  let from = services.length ? toMinutes(services[0].startTime) - 30 : 11 * 60;
  let to = services.length ? Math.max(...services.map((s) => toMinutes(s.endTime))) + restaurant.durationMinutes : 23 * 60 + 30;
  if (isToday) {
    from = Math.min(from, now.minutes);
    to = Math.max(to, now.minutes);
  }
  from = Math.max(0, from - (from % 15));
  to = Math.min(24 * 60 - 15, to);
  const lastService = services.at(-1);
  const startAt = lastService ? toMinutes(lastService.startTime) + 60 : from;

  const [guestInfo, waitlist] = await Promise.all([
    guestInfoFor(restaurant.id, rows).then((m) => Object.fromEntries(m)),
    getWaitlist(restaurant.id, date),
  ]);
  const bookings: FloorBooking[] = rows.map((r) => ({
    id: r.id,
    tableId: r.tableId,
    combinationId: r.combinationId,
    time: r.time,
    durationMinutes: r.durationMinutes,
    partySize: r.partySize,
    guestName: r.guestName,
    notes: r.notes,
    status: r.status,
  }));

  const label = isToday ? "Oggi" : date === addDays(now.date, 1) ? "Domani" : null;
  return (
    <>
      <LiveSync stamp={stamp} />
      <div className="daybar">
        <h1>Sala · {label ? `${label}, ${formatDate(date)}` : capitalize(formatDate(date))}</h1>
        <div className="daynav">
          <Link className="btn btn-small" href={`/app/sala?data=${addDays(date, -1)}`} prefetch aria-label="Giorno precedente">‹</Link>
          {!isToday && <Link className="btn btn-small" href="/app/sala">Oggi</Link>}
          <Link className="btn btn-small" href={`/app/sala?data=${addDays(date, 1)}`} prefetch aria-label="Giorno successivo">›</Link>
          <DayJump basePath="/app/sala" date={date} />
        </div>
      </div>
      <FloorLive
        key={date}
        date={date}
        isToday={isToday}
        nowMinutes={now.minutes}
        range={{ from, to }}
        startAt={Math.min(to, Math.max(from, startAt))}
        durationMinutes={restaurant.durationMinutes}
        floors={plan.floors}
        zones={plan.zones}
        fixtures={plan.fixtures}
        tables={plan.tables}
        combos={plan.combos}
        closedAreas={closed}
        guestInfo={guestInfo}
        waitlist={waitlist}
        bookings={bookings}
      />
    </>
  );
}
