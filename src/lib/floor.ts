import { toMinutes } from "./time";

// Shared by the server (validation) and the browser (live floor view), so no server-only imports.

export const PLAN_W = 1000;
export const PLAN_H = 625;

export type Shape = "square" | "round" | "rect";

export type PlanTable = { id: string; label: string; seats: number; shape: Shape; x: number; y: number; w: number; h: number };

export type FloorBooking = {
  id: string;
  tableId: string | null;
  time: string;
  durationMinutes: number;
  partySize: number;
  guestName: string;
  notes: string;
  status: "confirmed" | "seated" | "completed" | "cancelled" | "no_show";
};

export type TableState = {
  state: "free" | "seated" | "arriving" | "late";
  /** Who is at the table, or about to be. */
  booking?: FloorBooking;
  /** The next booking after the current one. */
  next?: FloorBooking;
};

/** How far ahead an arrival is shown on the table. */
export const ARRIVING_WINDOW = 30;
/** How long a no-show-yet booking stays flagged as late before we stop holding the table in the view. */
export const LATE_WINDOW = 60;

const start = (b: FloorBooking) => toMinutes(b.time);
const end = (b: FloorBooking) => start(b) + b.durationMinutes;
const isActive = (b: { status: string }) => b.status === "confirmed" || b.status === "seated";

export function overlaps(a: { time: string; durationMinutes: number }, b: { time: string; durationMinutes: number }) {
  const as = toMinutes(a.time);
  const bs = toMinutes(b.time);
  return as < bs + b.durationMinutes && bs < as + a.durationMinutes;
}

/** Another active booking on the same table during this booking's stay, if any. */
type Stay = { id: string; time: string; durationMinutes: number };

export function conflictOn<T extends Stay & { tableId: string | null; status: string }>(
  tableId: string,
  booking: Stay,
  all: T[],
): T | undefined {
  return all.find((o) => o.id !== booking.id && o.tableId === tableId && isActive(o) && overlaps(o, booking));
}

/**
 * The state of every table at minute `t` of the day.
 * `live` means t is right now: then what staff actually did (seated or not) wins over the schedule.
 * Otherwise it's a forecast from the bookings' times.
 */
export function tableStates(tables: PlanTable[], bookings: FloorBooking[], t: number, live: boolean): Map<string, TableState> {
  const result = new Map<string, TableState>();
  for (const table of tables) {
    const mine = bookings.filter((b) => b.tableId === table.id && isActive(b)).sort((a, b) => start(a) - start(b));
    let current: TableState = { state: "free" };

    if (live) {
      const seated = mine.find((b) => b.status === "seated");
      const due = mine.find((b) => b.status === "confirmed" && start(b) >= t - LATE_WINDOW && start(b) <= t + ARRIVING_WINDOW);
      if (seated) current = { state: "seated", booking: seated };
      else if (due) current = { state: start(due) < t ? "late" : "arriving", booking: due };
    } else {
      const sitting = mine.find((b) => start(b) <= t && t < end(b));
      const coming = mine.find((b) => start(b) > t && start(b) <= t + ARRIVING_WINDOW);
      if (sitting) current = { state: "seated", booking: sitting };
      else if (coming) current = { state: "arriving", booking: coming };
    }

    const after = current.booking ? start(current.booking) : t;
    current.next = mine.find((b) => b !== current.booking && b.status === "confirmed" && start(b) > after);
    result.set(table.id, current);
  }
  return result;
}

/**
 * Seats every unassigned booking at the smallest free table that fits it, earliest bookings first
 * and bigger parties first within a time. Bookings nothing fits stay unassigned.
 */
export function autoAssign(tables: PlanTable[], bookings: FloorBooking[]): Map<string, string> {
  const assigned = new Map<string, string>();
  const placed = bookings.filter((b) => b.tableId && isActive(b));
  const todo = bookings
    .filter((b) => !b.tableId && isActive(b))
    .sort((a, b) => start(a) - start(b) || b.partySize - a.partySize);
  const bySize = [...tables].sort((a, b) => a.seats - b.seats);

  for (const b of todo) {
    const table = bySize.find((t) => t.seats >= b.partySize && !conflictOn(t.id, b, placed));
    if (!table) continue;
    assigned.set(b.id, table.id);
    placed.push({ ...b, tableId: table.id });
  }
  return assigned;
}

/** Default footprint for a new table, in plan units. */
export function sizeFor(shape: Shape, seats: number): { w: number; h: number } {
  if (shape === "round") {
    const d = seats <= 2 ? 60 : seats <= 4 ? 80 : seats <= 6 ? 100 : 120;
    return { w: d, h: d };
  }
  if (shape === "square") {
    const s = seats <= 2 ? 60 : 80;
    return { w: s, h: s };
  }
  return { w: Math.max(120, Math.ceil(seats / 2) * 45), h: 80 };
}
