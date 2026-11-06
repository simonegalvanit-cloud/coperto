import { test } from "node:test";
import assert from "node:assert/strict";
import { isDate } from "../src/lib/time";

test("isDate accepts real days only, and never throws", () => {
  for (const ok of ["2026-11-07", "2028-02-29", "2026-12-31"]) assert.equal(isDate(ok), true, ok);
  for (const bad of ["2026-13-45", "2026-02-30", "2027-02-29", "2026-00-10", "2026-11-00", "9999-99-99", "2026-1-1", "26-11-07", "", "oggi", "2026-11-07T00:00", null, undefined, 20261107]) {
    assert.equal(isDate(bad), false, String(bad));
  }
});
