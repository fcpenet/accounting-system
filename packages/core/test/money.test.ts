import { describe, expect, it } from "vitest";
import {
  MoneyError,
  cents,
  formatAmount,
  formatMoney,
  parseAmount,
  sum,
} from "../src/money";

describe("parseAmount", () => {
  it("parses plain and decimal values", () => {
    expect(parseAmount("1234.56")).toBe(123456);
    expect(parseAmount("1234")).toBe(123400);
    expect(parseAmount("0.05")).toBe(5);
    expect(parseAmount(".5")).toBe(50);
    expect(parseAmount("1234.5")).toBe(123450);
  });

  it("strips currency symbols, commas and whitespace", () => {
    expect(parseAmount("  $1,234.56 ")).toBe(123456);
    expect(parseAmount("$0.99")).toBe(99);
  });

  it("treats parentheses as negative, per accounting convention", () => {
    expect(parseAmount("(1,234.56)")).toBe(-123456);
    expect(parseAmount("-12.30")).toBe(-1230);
  });

  it("does not lose a cent to floating point", () => {
    // Sub-cent input is rejected rather than silently rounded: 1.005 is
    // genuinely ambiguous, and guessing is how ledgers drift.
    expect(() => parseAmount("1.005")).toThrow(MoneyError);
    // The values that *are* representable must be exact.
    expect(parseAmount("0.07")).toBe(7);
    expect(parseAmount("1.10")).toBe(110);
    expect(parseAmount("8.20")).toBe(820);
  });

  it("rejects malformed input", () => {
    for (const bad of ["", "abc", "1.2.3", "1e5", "--5", "1.234"]) {
      expect(() => parseAmount(bad), bad).toThrow(MoneyError);
    }
  });
});

describe("formatting", () => {
  it("round-trips through parse", () => {
    for (const input of ["0.00", "0.07", "1,234.56", "999,999.99"]) {
      expect(formatAmount(parseAmount(input))).toBe(input);
    }
  });

  it("pads the cents", () => {
    expect(formatAmount(cents(5))).toBe("0.05");
    expect(formatAmount(cents(50))).toBe("0.50");
    expect(formatAmount(cents(-1230))).toBe("-12.30");
  });

  it("renders currency", () => {
    expect(formatMoney(cents(-500))).toBe("-$5.00");
  });
});

describe("arithmetic", () => {
  it("sums without drift", () => {
    // 0.1 + 0.2 !== 0.3 in floats; in cents it is exact.
    expect(sum([cents(10), cents(20)])).toBe(30);
    const manyPennies = Array.from({ length: 1000 }, () => cents(1));
    expect(sum(manyPennies)).toBe(1000);
  });

  it("refuses fractional cents", () => {
    expect(() => cents(1.5)).toThrow(MoneyError);
  });
});
