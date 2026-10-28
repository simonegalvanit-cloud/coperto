import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { formatPhone, isMonthDay, isSameDay, normalizeEmail, normalizePhone } from "../src/lib/contact";

describe("normalizePhone", () => {
  it("makes every way of typing an Italian mobile the same", () => {
    for (const typed of ["333 123 4567", "3331234567", "+39 333-1234567", "0039 333 1234567", "393331234567", "+39 (333) 123.45.67"]) {
      assert.equal(normalizePhone(typed), "+393331234567", typed);
    }
  });

  it("handles landlines and foreign numbers", () => {
    assert.equal(normalizePhone("051 123456"), "+39051123456");
    assert.equal(normalizePhone("+44 20 7946 0958"), "+442079460958");
    assert.equal(normalizePhone("0049 30 1234567"), "+49301234567");
  });

  it("returns nothing for junk", () => {
    assert.equal(normalizePhone(""), "");
    assert.equal(normalizePhone("123"), "");
    assert.equal(normalizePhone("n/a"), "");
  });
});

describe("contact helpers", () => {
  it("normalises email", () => assert.equal(normalizeEmail("  Giulia.R@Example.COM "), "giulia.r@example.com"));
  it("formats Italian mobiles", () => {
    assert.equal(formatPhone("+393331234567"), "+39 333 123 4567");
    assert.equal(formatPhone("+442079460958"), "+442079460958");
  });
  it("matches birthdays on the day", () => {
    assert.equal(isSameDay("10-30", "2026-10-30"), true);
    assert.equal(isSameDay("10-30", "2026-10-31"), false);
    assert.equal(isSameDay("", "2026-10-30"), false);
  });
  it("validates MM-DD", () => {
    assert.equal(isMonthDay("02-29"), true);
    assert.equal(isMonthDay("02-30"), false);
    assert.equal(isMonthDay("13-01"), false);
    assert.equal(isMonthDay("1-5"), false);
  });
});
