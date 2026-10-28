import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { autoAssign, conflictOn, tableStates, type FloorBooking, type PlanTable } from "../src/lib/floor";

const table = (id: string, seats: number): PlanTable => ({ id, label: id, seats, shape: "square", x: 0, y: 0, w: 80, h: 80 });
let n = 0;
const booking = (time: string, partySize: number, extra: Partial<FloorBooking> = {}): FloorBooking => ({
  id: `b${++n}`,
  tableId: null,
  time,
  durationMinutes: 120,
  partySize,
  guestName: "Ospite",
  notes: "",
  status: "confirmed",
  ...extra,
});
const at = (h: number, m = 0) => h * 60 + m;

describe("tableStates", () => {
  const tables = [table("T1", 4)];

  it("forecasts from booking times", () => {
    const b = booking("20:00", 4, { tableId: "T1" });
    assert.equal(tableStates(tables, [b], at(19, 0), false).get("T1")!.state, "free");
    assert.equal(tableStates(tables, [b], at(19, 45), false).get("T1")!.state, "arriving");
    assert.equal(tableStates(tables, [b], at(21, 0), false).get("T1")!.state, "seated");
    assert.equal(tableStates(tables, [b], at(22, 0), false).get("T1")!.state, "free");
  });

  it("live, trusts what staff did", () => {
    const late = booking("20:00", 2, { tableId: "T1" });
    assert.equal(tableStates(tables, [late], at(20, 20), true).get("T1")!.state, "late");
    const seated = booking("20:00", 2, { tableId: "T1", status: "seated" });
    // Seated guests who overstay still hold the table.
    assert.equal(tableStates(tables, [seated], at(23, 0), true).get("T1")!.state, "seated");
    const left = booking("20:00", 2, { tableId: "T1", status: "completed" });
    assert.equal(tableStates(tables, [left], at(20, 30), true).get("T1")!.state, "free");
  });

  it("shows the next booking", () => {
    const first = booking("19:00", 2, { tableId: "T1" });
    const second = booking("21:30", 2, { tableId: "T1" });
    const s = tableStates(tables, [first, second], at(19, 30), false).get("T1")!;
    assert.equal(s.booking, first);
    assert.equal(s.next, second);
  });
});

describe("conflictOn", () => {
  it("finds overlapping bookings on the same table only", () => {
    const a = booking("20:00", 2, { tableId: "T1" });
    const b = booking("21:00", 2);
    assert.equal(conflictOn("T1", b, [a, b]), a);
    assert.equal(conflictOn("T2", b, [a, b]), undefined);
    assert.equal(conflictOn("T1", booking("22:00", 2), [a]), undefined);
    assert.equal(conflictOn("T1", b, [{ ...a, status: "cancelled" }]), undefined);
  });
});

describe("autoAssign", () => {
  it("uses the smallest table that fits and avoids double booking", () => {
    const tables = [table("big", 6), table("small", 2), table("mid", 4)];
    const a = booking("20:00", 2);
    const b = booking("20:00", 2);
    const c = booking("20:00", 5);
    const d = booking("20:00", 8);
    const result = autoAssign(tables, [a, b, c, d]);
    assert.equal(result.get(c.id), "big");
    assert.equal(result.get(a.id), "small");
    assert.equal(result.get(b.id), "mid");
    assert.equal(result.has(d.id), false);
  });

  it("reuses a table once the previous party has left", () => {
    const tables = [table("T1", 2)];
    const placed = booking("19:00", 2, { tableId: "T1" });
    const later = booking("21:00", 2);
    const tooEarly = booking("20:00", 2);
    const result = autoAssign(tables, [placed, later, tooEarly]);
    assert.equal(result.get(later.id), "T1");
    assert.equal(result.has(tooEarly.id), false);
  });
});
