import { afterEach, describe, expect, it, vi } from "vitest";
import {
  formatDate,
  formatMonth,
  isValidISODate,
  monthEnd,
  monthStart,
  todayISO,
  yearStart,
} from "@/lib/dates";

afterEach(() => {
  vi.useRealTimers();
});

describe("todayISO", () => {
  it("returns a YYYY-MM-DD string", () => {
    expect(todayISO()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("reports the local calendar date, not the UTC one", () => {
    // 2026-03-15 21:00 UTC is already the 16th in Tokyo and still the 15th
    // in New York. An entry dated "today" must match the user's calendar.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-15T21:00:00Z"));

    expect(todayISO("Asia/Tokyo")).toBe("2026-03-16");
    expect(todayISO("America/New_York")).toBe("2026-03-15");
    expect(todayISO("UTC")).toBe("2026-03-15");
  });
});

describe("monthStart / monthEnd", () => {
  it("brackets a 31-day month", () => {
    expect(monthStart("2026-07-19")).toBe("2026-07-01");
    expect(monthEnd("2026-07-19")).toBe("2026-07-31");
  });

  it("brackets a 30-day month", () => {
    expect(monthEnd("2026-04-10")).toBe("2026-04-30");
  });

  it("handles February in a common year", () => {
    expect(monthEnd("2026-02-05")).toBe("2026-02-28");
  });

  it("handles February in a leap year", () => {
    expect(monthEnd("2024-02-05")).toBe("2024-02-29");
    // 2000 is a leap year; 1900 was not.
    expect(monthEnd("2000-02-01")).toBe("2000-02-29");
    expect(monthEnd("1900-02-01")).toBe("1900-02-28");
  });

  it("handles December without rolling into the next year", () => {
    expect(monthEnd("2026-12-09")).toBe("2026-12-31");
    expect(monthStart("2026-12-09")).toBe("2026-12-01");
  });
});

describe("yearStart", () => {
  it("returns 1 January of the same year", () => {
    expect(yearStart("2026-07-19")).toBe("2026-01-01");
    expect(yearStart("2026-01-01")).toBe("2026-01-01");
  });
});

describe("formatDate", () => {
  it("formats without shifting the day", () => {
    // Parsed as UTC, so a negative-offset test runner can't turn the 1st
    // into the 31st of the previous month.
    expect(formatDate("2026-07-19")).toBe("19 Jul 2026");
    expect(formatDate("2026-01-01")).toBe("1 Jan 2026");
    expect(formatDate("2026-12-31")).toBe("31 Dec 2026");
  });

  it("returns the input unchanged when it isn't a date", () => {
    expect(formatDate("not-a-date")).toBe("not-a-date");
  });
});

describe("formatMonth", () => {
  it("renders month and year", () => {
    expect(formatMonth("2026-07-19")).toBe("July 2026");
    expect(formatMonth("2026-01-31")).toBe("January 2026");
  });
});

describe("isValidISODate", () => {
  it("accepts well-formed dates", () => {
    for (const d of ["2026-07-19", "2000-02-29", "1999-12-31"]) {
      expect(isValidISODate(d), d).toBe(true);
    }
  });

  it("rejects malformed or impossible dates", () => {
    for (const d of ["19-07-2026", "2026-13-01", "2026-02-30", "", "2026-7-9", "abc"]) {
      expect(isValidISODate(d), d).toBe(false);
    }
  });
});

describe("date ordering", () => {
  it("sorts lexicographically, which is why dates are stored as strings", () => {
    const dates = ["2026-12-01", "2026-01-15", "2025-06-30", "2026-01-02"];
    expect([...dates].sort()).toEqual([
      "2025-06-30",
      "2026-01-02",
      "2026-01-15",
      "2026-12-01",
    ]);
  });

  it("compares range boundaries correctly", () => {
    expect("2026-01-31" < "2026-02-01").toBe(true);
    expect("2026-09-01" > "2026-10-01").toBe(false);
  });
});
