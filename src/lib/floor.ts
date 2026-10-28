import type { FixtureKind } from "@/db/schema";
import { toMinutes } from "./time";

// Shared by the server (validation, online availability) and the browser (editor, live view), so no server-only imports.
// All plan measurements are in centimetres.

export type Shape = "square" | "round" | "rect";

export type { FixtureKind };

type Box = { x: number; y: number; w: number; h: number };

export type PlanFloor = { id: string; name: string; level: number; width: number; height: number };
export type PlanZone = Box & { id: string; floorId: string; name: string; bookableOnline: boolean };
export type PlanFixture = Box & { id: string; floorId: string; kind: FixtureKind; label: string };
export type PlanTable = Box & {
  id: string;
  floorId: string;
  zoneId: string | null;
  label: string;
  seats: number;
  minCovers: number;
  bookableOnline: boolean;
  shape: Shape;
};

/** Default label and size (cm) of each kind of fixture, in the order the editor offers them. */
export const FIXTURES: Record<FixtureKind, { label: string; w: number; h: number }> = {
  wall: { label: "Muro", w: 300, h: 15 },
  door: { label: "Porta", w: 90, h: 15 },
  window: { label: "Finestra", w: 120, h: 12 },
  entrance: { label: "Ingresso", w: 150, h: 20 },
  kitchen: { label: "Cucina", w: 400, h: 300 },
  bar: { label: "Bar", w: 300, h: 70 },
  cash: { label: "Cassa", w: 120, h: 60 },
  station: { label: "Stazione", w: 100, h: 60 },
  stairs: { label: "Scale", w: 120, h: 300 },
  toilets: { label: "Bagni", w: 250, h: 200 },
  column: { label: "", w: 40, h: 40 },
  plant: { label: "", w: 50, h: 50 },
  other: { label: "Altro", w: 100, h: 100 },
};

export const FLOOR_NAMES: Record<number, string> = {
  [-1]: "Seminterrato",
  0: "Piano terra",
  1: "Primo piano",
  2: "Secondo piano",
  3: "Terzo piano",
};

/** The zone a table belongs to: the smallest zone on its floor that contains the table's centre. */
export function zoneFor<Z extends Box & { floorId: string }>(t: Box & { floorId: string }, zones: Z[]): Z | undefined {
  const cx = t.x + t.w / 2;
  const cy = t.y + t.h / 2;
  return zones
    .filter((z) => z.floorId === t.floorId && cx >= z.x && cx <= z.x + z.w && cy >= z.y && cy <= z.y + z.h)
    .sort((a, b) => a.w * a.h - b.w * b.h)[0];
}

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

type Seatable = Stay & { partySize: number; tableId: string | null; status: string };

/**
 * Greedy seating: bookings in time order (bigger parties first within a time) each take the first table
 * from `choose(booking)` that's free for their whole stay. Already-seated tables are fixed.
 */
function seatAll<B extends Seatable>(fixed: B[], todo: B[], choose: (b: B) => PlanTable[]) {
  const busy = new Map<string, Stay[]>();
  for (const b of fixed) if (b.tableId && isActive(b)) busy.set(b.tableId, [...(busy.get(b.tableId) ?? []), b]);
  const placed = new Map<string, string>();
  const failed: B[] = [];
  const queue = [...todo].sort((a, b) => toMinutes(a.time) - toMinutes(b.time) || b.partySize - a.partySize);
  for (const b of queue) {
    const table = choose(b).find((t) => !(busy.get(t.id) ?? []).some((o) => overlaps(o, b)));
    if (!table) {
      failed.push(b);
      continue;
    }
    placed.set(b.id, table.id);
    busy.set(table.id, [...(busy.get(table.id) ?? []), b]);
  }
  return { placed, failed };
}

/** Staff seating preference: big enough, tables meant for this party size first, then the smallest. */
function staffChoice(tables: PlanTable[]) {
  return (b: { partySize: number }) =>
    tables
      .filter((t) => t.seats >= b.partySize)
      .sort((a, c) => Number(a.minCovers > b.partySize) - Number(c.minCovers > b.partySize) || a.seats - c.seats);
}

/**
 * Seats every unassigned booking at the smallest free table that fits it, earliest bookings first
 * and bigger parties first within a time. Bookings nothing fits stay unassigned.
 */
export function autoAssign(tables: PlanTable[], bookings: FloorBooking[]): Map<string, string> {
  const active = bookings.filter(isActive);
  return seatAll(
    active.filter((b) => b.tableId),
    active.filter((b) => !b.tableId),
    staffChoice(tables),
  ).placed;
}

/**
 * The table an online guest would get, or null if there's none. A table qualifies if it's open to online
 * booking (and so is its zone), suits the party size, and is in the chosen zone if any. The new booking
 * must fit without leaving any already-booked party without a table that would otherwise have had one.
 */
export function tableForOnline<B extends Seatable>(
  tables: PlanTable[],
  zones: { id: string; bookableOnline: boolean }[],
  bookings: B[],
  request: Stay & { partySize: number },
  zoneId?: string | null,
): string | null {
  const zoneOpen = new Map(zones.map((z) => [z.id, z.bookableOnline]));
  const eligible = tables
    .filter(
      (t) =>
        t.bookableOnline &&
        (t.zoneId ? zoneOpen.get(t.zoneId) !== false : true) &&
        (!zoneId || t.zoneId === zoneId) &&
        t.minCovers <= request.partySize &&
        request.partySize <= t.seats,
    )
    .sort((a, b) => a.seats - b.seats);
  if (eligible.length === 0) return null;

  const active = bookings.filter(isActive);
  const fixed = active.filter((b) => b.tableId);
  const waiting = active.filter((b) => !b.tableId);
  const staff = staffChoice(tables);
  const before = seatAll(fixed, waiting, staff).failed.length;

  const newcomer = { ...request, tableId: null, status: "confirmed" } as unknown as B;
  const after = seatAll(fixed, [...waiting, newcomer], (b) => (b === newcomer ? eligible : staff(b)));
  if (after.failed.includes(newcomer) || after.failed.length > before) return null;
  return after.placed.get(request.id) ?? null;
}

/** Default size (cm) for a new table. */
export function sizeFor(shape: Shape, seats: number): { w: number; h: number } {
  if (shape === "round") {
    const d = seats <= 2 ? 70 : seats <= 4 ? 90 : seats <= 6 ? 120 : 150;
    return { w: d, h: d };
  }
  if (shape === "square") {
    const s = seats <= 2 ? 70 : seats <= 4 ? 80 : 100;
    return { w: s, h: s };
  }
  return { w: Math.max(120, Math.ceil(seats / 2) * 60), h: 80 };
}
