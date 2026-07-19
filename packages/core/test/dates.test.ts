import { describe, expect, it } from "vitest";
import { isValidISODate } from "../src/dates";

describe("isValidISODate", () => {
  it("accepts real dates", () => {
    for (const d of ["2026-07-19", "2026-01-01", "2026-12-31", "2024-02-29"]) {
      expect(isValidISODate(d), d).toBe(true);
    }
  });

  it("rejects days that don't exist in the month", () => {
    // The bug this function exists for: Date.parse("2026-02-30") succeeds and
    // yields 2 March, so an entry dated 30 February would post to the wrong
    // month and land in the wrong period on every report.
    for (const d of ["2026-02-30", "2026-02-31", "2026-04-31", "2026-06-31", "2026-09-31"]) {
      expect(isValidISODate(d), d).toBe(false);
    }
  });

  it("knows which years are leap years", () => {
    expect(isValidISODate("2024-02-29")).toBe(true); // divisible by 4
    expect(isValidISODate("2026-02-29")).toBe(false); // not
    expect(isValidISODate("2000-02-29")).toBe(true); // divisible by 400
    expect(isValidISODate("1900-02-29")).toBe(false); // divisible by 100, not 400
  });

  it("rejects impossible months and days", () => {
    for (const d of ["2026-13-01", "2026-00-10", "2026-01-00", "2026-01-32"]) {
      expect(isValidISODate(d), d).toBe(false);
    }
  });

  it("rejects anything not in YYYY-MM-DD form", () => {
    for (const d of ["19-07-2026", "2026-7-9", "2026/07/19", "", "today", "2026-07-19T10:00:00Z"]) {
      expect(isValidISODate(d), d).toBe(false);
    }
  });
});
