import type { FixtureKind } from "@/db/schema";
import { toMinutes } from "./time";

// Shared by the server (validation, online availability) and the browser (editor, live view), so no server-only imports.
// All plan measurements are in centimetres.

export type Shape = "square" | "round" | "rect";

export type { FixtureKind };

type Box = { x: number; y: number; w: number; h: number };

export type PlanFloor = { id: string; name: string; level: number; width: number; height: number };
export type PlanZone = Box & { id: string; floorId: string; name: string; bookableOnline: boolean };
export type PlanFixture = Box & { id: string; floorId: string; kind: FixtureKind; label: string; rotation: number };
export type PlanTable = Box & {
  id: string;
  floorId: string;
  zoneId: string | null;
  label: string;
  seats: number;
  minCovers: number;
  bookableOnline: boolean;
  shape: Shape;
  /** Degrees clockwise around the centre. */
  rotation: number;
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

/** Tables that can be pushed together for a bigger party. */
export type PlanCombo = { id: string; tableIds: string[]; minCovers: number; maxCovers: number; bookableOnline: boolean };

/** Where a booking sits: one table, or a group of joined tables. */
export type Spot = { tableId: string | null; combinationId: string | null };

export type FloorBooking = {
  id: string;
  tableId: string | null;
  combinationId: string | null;
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

const start = (b: { time: string }) => toMinutes(b.time);
const end = (b: { time: string; durationMinutes: number }) => start(b) + b.durationMinutes;
const isActive = (b: { status: string }) => b.status === "confirmed" || b.status === "seated";

export function overlaps(a: { time: string; durationMinutes: number }, b: { time: string; durationMinutes: number }) {
  return start(a) < end(b) && start(b) < end(a);
}

type Stay = { id: string; time: string; durationMinutes: number };
type Placed = Stay & { tableId: string | null; combinationId?: string | null; status: string };
type Combos = PlanCombo[] | Map<string, PlanCombo>;

const comboMap = (combos: Combos) => (combos instanceof Map ? combos : new Map(combos.map((c) => [c.id, c])));

/** The tables a booking occupies: its table, or every table of its group. */
export function tablesOf(b: { tableId: string | null; combinationId?: string | null }, combos: Combos): string[] {
  if (b.tableId) return [b.tableId];
  if (b.combinationId) return comboMap(combos).get(b.combinationId)?.tableIds ?? [];
  return [];
}

export function isPlaced(b: { tableId: string | null; combinationId?: string | null }) {
  return !!(b.tableId || b.combinationId);
}

/** Another active booking using any of these tables during this booking's stay, if any. */
export function conflictOn<T extends Placed>(tableIds: string[], booking: Stay, all: T[], combos: Combos = []): T | undefined {
  const map = comboMap(combos);
  return all.find(
    (o) => o.id !== booking.id && isActive(o) && overlaps(o, booking) && tablesOf(o, map).some((id) => tableIds.includes(id)),
  );
}

/**
 * The state of every table at minute `t` of the day.
 * `live` means t is right now: then what staff actually did (seated or not) wins over the schedule.
 * Otherwise it's a forecast from the bookings' times. A party at joined tables shows on each of them.
 */
export function tableStates(
  tables: PlanTable[],
  bookings: FloorBooking[],
  t: number,
  live: boolean,
  combos: Combos = [],
): Map<string, TableState> {
  const map = comboMap(combos);
  const result = new Map<string, TableState>();
  for (const table of tables) {
    const mine = bookings.filter((b) => isActive(b) && tablesOf(b, map).includes(table.id)).sort((a, b) => start(a) - start(b));
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

/** A place a party can sit: a single table or a group of joined tables, with what it takes. */
type Candidate = Spot & {
  tableIds: string[];
  seats: number;
  minCovers: number;
  bookableOnline: boolean;
  zoneIds: (string | null)[];
};

function candidates(tables: PlanTable[], combos: PlanCombo[]): Candidate[] {
  const byId = new Map(tables.map((t) => [t.id, t]));
  const singles = tables.map((t) => ({
    tableId: t.id,
    combinationId: null,
    tableIds: [t.id],
    seats: t.seats,
    minCovers: t.minCovers,
    bookableOnline: t.bookableOnline,
    zoneIds: [t.zoneId],
  }));
  const groups = combos
    .filter((c) => c.tableIds.length > 1 && c.tableIds.every((id) => byId.has(id)))
    .map((c) => ({
      tableId: null,
      combinationId: c.id,
      tableIds: c.tableIds,
      seats: c.maxCovers,
      minCovers: c.minCovers,
      bookableOnline: c.bookableOnline,
      zoneIds: c.tableIds.map((id) => byId.get(id)!.zoneId),
    }));
  return [...singles, ...groups];
}

type Seatable = Placed & { partySize: number };

/**
 * Greedy seating: bookings in time order (bigger parties first within a time) each take the first place
 * from `choose(booking)` whose tables are all free for their whole stay. Already-placed bookings are fixed.
 */
function seatAll<B extends Seatable>(fixed: B[], todo: B[], choose: (b: B) => Candidate[], combos: Map<string, PlanCombo>) {
  const busy = new Map<string, Stay[]>();
  const occupy = (ids: string[], b: Stay) => ids.forEach((id) => busy.set(id, [...(busy.get(id) ?? []), b]));
  for (const b of fixed) if (isActive(b)) occupy(tablesOf(b, combos), b);
  const placed = new Map<string, Spot>();
  const failed: B[] = [];
  const queue = [...todo].sort((a, b) => start(a) - start(b) || b.partySize - a.partySize);
  for (const b of queue) {
    const spot = choose(b).find((c) => c.tableIds.every((id) => !(busy.get(id) ?? []).some((o) => overlaps(o, b))));
    if (!spot) {
      failed.push(b);
      continue;
    }
    placed.set(b.id, { tableId: spot.tableId, combinationId: spot.combinationId });
    occupy(spot.tableIds, b);
  }
  return { placed, failed };
}

/**
 * Staff preference: big enough; places meant for this party size first; a single table before joining
 * tables; then the smallest.
 */
function staffChoice(all: Candidate[]) {
  return (b: { partySize: number }) =>
    all
      .filter((c) => c.seats >= b.partySize)
      .sort(
        (a, c) =>
          Number(a.minCovers > b.partySize) - Number(c.minCovers > b.partySize) ||
          Number(!!a.combinationId) - Number(!!c.combinationId) ||
          a.seats - c.seats,
      );
}

/**
 * Places every unassigned booking at the smallest free table (or group of joined tables) that fits it,
 * earliest bookings first and bigger parties first within a time. Bookings nothing fits stay unassigned.
 */
export function autoAssign(tables: PlanTable[], bookings: FloorBooking[], combos: PlanCombo[] = []): Map<string, Spot> {
  const map = comboMap(combos);
  const active = bookings.filter(isActive);
  return seatAll(
    active.filter(isPlaced),
    active.filter((b) => !isPlaced(b)),
    staffChoice(candidates(tables, combos)),
    map,
  ).placed;
}

/**
 * Where an online guest would sit, or null if nowhere. A table (or group of joined tables) qualifies if it's
 * open to online booking, every table of it is in an area open online today, it's in the area the guest chose
 * (if any), and it suits the party size. The new booking must fit without leaving any already-booked party
 * without a place that would otherwise have had one.
 */
export function spotForOnline<B extends Seatable>(
  tables: PlanTable[],
  zones: { id: string; bookableOnline: boolean }[],
  bookings: B[],
  request: Stay & { partySize: number },
  opts: { zoneIds?: string[] | null; combos?: PlanCombo[] } = {},
): Spot | null {
  const combos = opts.combos ?? [];
  const map = comboMap(combos);
  const zoneOpen = new Map(zones.map((z) => [z.id, z.bookableOnline]));
  const all = candidates(tables, combos);
  const eligible = all
    .filter(
      (c) =>
        c.bookableOnline &&
        c.zoneIds.every((z) => (z ? zoneOpen.get(z) !== false : true)) &&
        (!opts.zoneIds || c.zoneIds.every((z) => z !== null && opts.zoneIds!.includes(z))) &&
        c.minCovers <= request.partySize &&
        request.partySize <= c.seats,
    )
    .sort((a, b) => Number(!!a.combinationId) - Number(!!b.combinationId) || a.seats - b.seats);
  if (eligible.length === 0) return null;

  const active = bookings.filter(isActive);
  const fixed = active.filter(isPlaced);
  const waiting = active.filter((b) => !isPlaced(b));
  const staff = staffChoice(all);
  const before = seatAll(fixed, waiting, staff, map).failed.length;

  const newcomer = { ...request, tableId: null, combinationId: null, status: "confirmed" } as unknown as B;
  const after = seatAll(fixed, [...waiting, newcomer], (b) => (b === newcomer ? eligible : staff(b)), map);
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
