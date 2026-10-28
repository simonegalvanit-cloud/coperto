import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { availableSlots, fits, slotTimes, type BookingRules } from "../src/lib/availability";
import { addDays, nowIn, weekdayOf } from "../src/lib/time";

const rules: BookingRules = {
  capacity: 10,
  maxCoversPerSlot: null,
  slotMinutes: 30,
  durationMinutes: 120,
  maxPartySize: 8,
  minNoticeMinutes: 60,
  maxDaysAhead: 30,
};
const dinner = [{ startTime: "19:00", endTime: "21:00" }];
const tomorrow = { date: "2026-10-30", minutes: 12 * 60 };

describe("slotTimes", () => {
  it("includes the last arrival time and merges services", () => {
    assert.deepEqual(slotTimes(dinner, 30), ["19:00", "19:30", "20:00", "20:30", "21:00"]);
    assert.deepEqual(
      slotTimes([{ startTime: "12:00", endTime: "12:30" }, ...dinner], 60),
      ["12:00", "19:00", "20:00", "21:00"],
    );
  });
});

describe("fits", () => {
  it("rejects when the room would go over capacity", () => {
    const b = [{ time: "19:00", partySize: 8, durationMinutes: 120 }];
    assert.equal(fits(b, "19:30", 120, 2, rules), true);
    assert.equal(fits(b, "19:30", 120, 3, rules), false);
    // The 19:00 table has left by 21:00.
    assert.equal(fits(b, "21:00", 120, 10, rules), true);
  });

  it("checks bookings that start during the stay", () => {
    const b = [{ time: "20:00", partySize: 8, durationMinutes: 120 }];
    assert.equal(fits(b, "19:00", 120, 3, rules), false);
    assert.equal(fits(b, "19:00", 60, 10, rules), true);
  });

  it("applies arrival pacing", () => {
    const b = [{ time: "19:00", partySize: 4, durationMinutes: 120 }];
    assert.equal(fits(b, "19:00", 120, 3, { ...rules, maxCoversPerSlot: 6 }), false);
    assert.equal(fits(b, "19:30", 120, 3, { ...rules, maxCoversPerSlot: 6 }), true);
  });
});

describe("availableSlots", () => {
  const base = { date: "2026-10-31", partySize: 2, rules, services: dinner, closed: false, bookings: [], now: tomorrow };

  it("offers every slot on an empty night", () => {
    assert.equal(availableSlots(base).length, 5);
  });

  it("returns nothing when closed, too big, in the past or too far ahead", () => {
    assert.deepEqual(availableSlots({ ...base, closed: true }), []);
    assert.deepEqual(availableSlots({ ...base, partySize: 9 }), []);
    assert.deepEqual(availableSlots({ ...base, date: "2026-10-29" }), []);
    assert.deepEqual(availableSlots({ ...base, date: addDays(tomorrow.date, 31) }), []);
  });

  it("respects minimum notice, including across midnight", () => {
    assert.deepEqual(availableSlots({ ...base, date: tomorrow.date, now: { ...tomorrow, minutes: 19 * 60 + 10 } }), [
      "20:30",
      "21:00",
    ]);
    const lateNight = { date: "2026-10-30", minutes: 23 * 60 + 50 };
    const early = [{ startTime: "00:30", endTime: "01:00" }];
    assert.deepEqual(availableSlots({ ...base, date: "2026-10-31", services: early, now: lateNight }), ["01:00"]);
  });
});

describe("time", () => {
  it("numbers weekdays from Monday", () => {
    assert.equal(weekdayOf("2026-10-26"), 0);
    assert.equal(weekdayOf("2026-11-01"), 6);
  });

  it("reads the local date in a timezone", () => {
    // 23:30 UTC on 31 Dec is already 1 Jan in Rome.
    assert.deepEqual(nowIn("Europe/Rome", new Date("2026-12-31T23:30:00Z")), { date: "2027-01-01", minutes: 30 });
  });
});
