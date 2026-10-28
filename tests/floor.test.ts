import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { autoAssign, conflictOn, spotForOnline, tableStates, zoneFor, type FloorBooking, type PlanCombo, type PlanTable } from "../src/lib/floor";

const table = (id: string, seats: number, extra: Partial<PlanTable> = {}): PlanTable => ({
  id,
  label: id,
  seats,
  minCovers: 1,
  bookableOnline: true,
  floorId: "F",
  zoneId: null,
  shape: "square",
  rotation: 0,
  x: 0,
  y: 0,
  w: 80,
  h: 80,
  ...extra,
});
let n = 0;
const booking = (time: string, partySize: number, extra: Partial<FloorBooking> = {}): FloorBooking => ({
  id: `b${++n}`,
  tableId: null,
  combinationId: null,
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
    assert.equal(conflictOn(["T1"], b, [a, b]), a);
    assert.equal(conflictOn(["T2"], b, [a, b]), undefined);
    assert.equal(conflictOn(["T1"], booking("22:00", 2), [a]), undefined);
    assert.equal(conflictOn(["T1"], b, [{ ...a, status: "cancelled" }]), undefined);
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
    assert.equal(result.get(c.id)?.tableId, "big");
    assert.equal(result.get(a.id)?.tableId, "small");
    assert.equal(result.get(b.id)?.tableId, "mid");
    assert.equal(result.has(d.id), false);
  });

  it("reuses a table once the previous party has left", () => {
    const tables = [table("T1", 2)];
    const placed = booking("19:00", 2, { tableId: "T1" });
    const later = booking("21:00", 2);
    const tooEarly = booking("20:00", 2);
    const result = autoAssign(tables, [placed, later, tooEarly]);
    assert.equal(result.get(later.id)?.tableId, "T1");
    assert.equal(result.has(tooEarly.id), false);
  });
});

describe("autoAssign with minimum covers", () => {
  it("prefers tables meant for the party size, but still uses others when needed", () => {
    const tables = [table("eight", 8, { minCovers: 5 }), table("four", 4)];
    const a = booking("20:00", 2);
    const b = booking("20:00", 2);
    const result = autoAssign(tables, [a, b]);
    assert.equal(result.get(a.id)?.tableId, "four");
    assert.equal(result.get(b.id)?.tableId, "eight");
  });
});

describe("spotForOnline", () => {
  const zones = [
    { id: "in", bookableOnline: true },
    { id: "out", bookableOnline: true },
    { id: "vip", bookableOnline: false },
  ];
  const req = (time: string, partySize: number) => ({ id: "new", time, durationMinutes: 120, partySize });

  it("picks the smallest suitable table", () => {
    const tables = [table("T6", 6), table("T2", 2), table("T4", 4)];
    assert.equal(spotForOnline(tables, zones, [], req("20:00", 2))?.tableId ?? null, "T2");
    assert.equal(spotForOnline(tables, zones, [], req("20:00", 3))?.tableId ?? null, "T4");
    assert.equal(spotForOnline(tables, zones, [], req("20:00", 7))?.tableId ?? null, null);
  });

  it("respects minimum covers, online flags and closed zones", () => {
    assert.equal(spotForOnline([table("big", 8, { minCovers: 5 })], zones, [], req("20:00", 2))?.tableId ?? null, null);
    assert.equal(spotForOnline([table("kept", 4, { bookableOnline: false })], zones, [], req("20:00", 2))?.tableId ?? null, null);
    assert.equal(spotForOnline([table("v", 4, { zoneId: "vip" })], zones, [], req("20:00", 2))?.tableId ?? null, null);
  });

  it("filters by the zone the guest chose", () => {
    const tables = [table("in1", 4, { zoneId: "in" }), table("out1", 4, { zoneId: "out" })];
    assert.equal(spotForOnline(tables, zones, [], req("20:00", 2), { zoneIds: ["out"] })?.tableId, "out1");
    assert.equal(spotForOnline(tables, zones, [], req("20:00", 2), { zoneIds: ["in"] })?.tableId, "in1");
  });

  it("skips tables taken during the stay", () => {
    const tables = [table("T1", 4), table("T2", 4)];
    const taken = booking("19:00", 2, { tableId: "T1" });
    assert.equal(spotForOnline(tables, zones, [taken], req("20:00", 2))?.tableId ?? null, "T2");
    assert.equal(spotForOnline(tables, zones, [taken], req("21:00", 2))?.tableId ?? null, "T1");
  });

  it("leaves room for parties already booked without a table", () => {
    const tables = [table("T4", 4)];
    const phoned = booking("20:00", 4);
    assert.equal(spotForOnline(tables, zones, [phoned], req("20:30", 2))?.tableId ?? null, null);
    assert.equal(spotForOnline(tables, zones, [phoned], req("22:00", 2))?.tableId ?? null, "T4");
  });

  it("doesn't let staff overbooking block every later booking", () => {
    // Two unassigned parties of 4 and only one table: one already can't be seated.
    const tables = [table("T4", 4), table("T2", 2)];
    const over = [booking("20:00", 4), booking("20:00", 4)];
    assert.equal(spotForOnline(tables, zones, over, req("20:00", 2))?.tableId ?? null, "T2");
  });
});

describe("zoneFor", () => {
  it("picks the smallest zone containing the table's centre on the same floor", () => {
    const zones = [
      { id: "room", floorId: "F", x: 0, y: 0, w: 1000, h: 600 },
      { id: "corner", floorId: "F", x: 0, y: 0, w: 300, h: 300 },
      { id: "upstairs", floorId: "G", x: 0, y: 0, w: 1000, h: 600 },
    ];
    assert.equal(zoneFor(table("a", 2, { x: 100, y: 100, w: 70, h: 70 }), zones)?.id, "corner");
    assert.equal(zoneFor(table("b", 2, { x: 500, y: 100, w: 70, h: 70 }), zones)?.id, "room");
    assert.equal(zoneFor(table("c", 2, { x: 2000, y: 100, w: 70, h: 70 }), zones), undefined);
  });
});

describe("joined tables", () => {
  const tables = [table("T6", 6), table("T7", 8), table("T2", 2)];
  const combo: PlanCombo = { id: "C", tableIds: ["T6", "T7"], minCovers: 9, maxCovers: 14, bookableOnline: true };
  const zones: { id: string; bookableOnline: boolean }[] = [];
  const req = (time: string, partySize: number) => ({ id: "new", time, durationMinutes: 120, partySize });

  it("seats a big party at joined tables online", () => {
    assert.deepEqual(spotForOnline(tables, zones, [], req("20:00", 12), { combos: [combo] }), { tableId: null, combinationId: "C" });
    assert.equal(spotForOnline(tables, zones, [], req("20:00", 15), { combos: [combo] }), null);
  });

  it("prefers a single table when one fits", () => {
    assert.deepEqual(spotForOnline(tables, zones, [], req("20:00", 6), { combos: [combo] }), { tableId: "T6", combinationId: null });
  });

  it("joined tables need every table free, and block each table for others", () => {
    const onT7 = booking("20:00", 4, { tableId: "T7" });
    assert.equal(spotForOnline(tables, zones, [onT7], req("20:30", 12), { combos: [combo] }), null);
    const big = booking("20:00", 12, { combinationId: "C" });
    assert.equal(spotForOnline(tables, zones, [big], req("20:30", 5), { combos: [combo] }), null);
    assert.equal(conflictOn(["T6"], booking("21:00", 2), [big], [combo]), big);
  });

  it("shows a party at joined tables on each of them", () => {
    const big = booking("20:00", 12, { combinationId: "C", status: "seated" });
    const states = tableStates(tables, [big], 20 * 60 + 30, true, [combo]);
    assert.equal(states.get("T6")!.state, "seated");
    assert.equal(states.get("T7")!.state, "seated");
    assert.equal(states.get("T2")!.state, "free");
  });

  it("auto-assign uses joined tables only for parties no single table fits", () => {
    const party6 = booking("20:00", 6);
    const party12 = booking("21:00", 12);
    const result = autoAssign(tables, [party6, party12], [combo]);
    assert.equal(result.get(party6.id)?.tableId, "T6");
    // T6 is taken 20:00–22:00, so the 21:00 party of 12 can't have T6+T7.
    assert.equal(result.has(party12.id), false);
  });

  it("respects the group's own online switch and minimum", () => {
    assert.equal(spotForOnline(tables, zones, [], req("20:00", 12), { combos: [{ ...combo, bookableOnline: false }] }), null);
    assert.deepEqual(spotForOnline(tables, zones, [], req("20:00", 9), { combos: [combo] }), { tableId: null, combinationId: "C" });
  });
});

describe("areas", () => {
  const req = { id: "new", time: "20:00", durationMinutes: 120, partySize: 2 };

  it("an area closed today (sent as not bookable) offers nothing", () => {
    const tables = [table("D1", 2, { zoneId: "dehors" })];
    assert.equal(spotForOnline(tables, [{ id: "dehors", bookableOnline: false }], [], req), null);
    assert.equal(spotForOnline(tables, [{ id: "dehors", bookableOnline: true }], [], req)?.tableId, "D1");
  });

  it("a room made of several areas is chosen as one", () => {
    const tables = [table("A", 2, { zoneId: "sala-1" }), table("B", 2, { zoneId: "sala-2" }), table("C", 2, { zoneId: "dehors" })];
    const zones = ["sala-1", "sala-2", "dehors"].map((id) => ({ id, bookableOnline: true }));
    const taken = booking("20:00", 2, { tableId: "A" });
    assert.equal(spotForOnline(tables, zones, [taken], req, { zoneIds: ["sala-1", "sala-2"] })?.tableId, "B");
  });
});
