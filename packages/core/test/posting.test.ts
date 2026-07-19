import { describe, expect, it } from "vitest";
import type { Account } from "../src/accounts";
import { cents } from "../src/money";
import { type DraftEntry, buildReversal, validateEntry } from "../src/posting";

const accounts: Account[] = [
  { id: "cash", code: "1000", name: "Cash", type: "asset" },
  { id: "ar", code: "1200", name: "Accounts Receivable", type: "asset" },
  { id: "revenue", code: "4000", name: "Sales Revenue", type: "income" },
  { id: "rent", code: "5100", name: "Rent", type: "expense" },
  { id: "old", code: "5999", name: "Retired", type: "expense", archived: true },
];

const chart = new Map(accounts.map((a) => [a.id, a]));

function draft(overrides: Partial<DraftEntry> = {}): DraftEntry {
  return {
    date: "2026-07-19",
    description: "Cash sale",
    lines: [
      { accountId: "cash", direction: "debit", amount: cents(10_000) },
      { accountId: "revenue", direction: "credit", amount: cents(10_000) },
    ],
    ...overrides,
  };
}

const errorText = (result: ReturnType<typeof validateEntry>) =>
  result.ok ? "" : result.errors.map((e) => e.message).join(" | ");

describe("validateEntry", () => {
  it("accepts a balanced two-line entry", () => {
    const result = validateEntry(draft(), chart);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.totals.debits).toBe(10_000);
      expect(result.totals.credits).toBe(10_000);
    }
  });

  it("accepts a balanced multi-line (compound) entry", () => {
    const result = validateEntry(
      draft({
        description: "Split payment",
        lines: [
          { accountId: "cash", direction: "debit", amount: cents(6_000) },
          { accountId: "ar", direction: "debit", amount: cents(4_000) },
          { accountId: "revenue", direction: "credit", amount: cents(10_000) },
        ],
      }),
      chart,
    );
    expect(result.ok).toBe(true);
  });

  it("rejects an unbalanced entry and reports the difference", () => {
    const result = validateEntry(
      draft({
        lines: [
          { accountId: "cash", direction: "debit", amount: cents(10_000) },
          { accountId: "revenue", direction: "credit", amount: cents(9_999) },
        ],
      }),
      chart,
    );
    expect(result.ok).toBe(false);
    expect(errorText(result)).toContain("out of balance by 0.01");
  });

  it("rejects a single-line entry", () => {
    const result = validateEntry(
      draft({
        lines: [{ accountId: "cash", direction: "debit", amount: cents(100) }],
      }),
      chart,
    );
    expect(result.ok).toBe(false);
    expect(errorText(result)).toContain("at least two lines");
  });

  it("rejects negative and zero amounts", () => {
    for (const amount of [cents(0), cents(-500)]) {
      const result = validateEntry(
        draft({
          lines: [
            { accountId: "cash", direction: "debit", amount },
            { accountId: "revenue", direction: "credit", amount },
          ],
        }),
        chart,
      );
      expect(result.ok, `amount ${amount}`).toBe(false);
    }
  });

  it("rejects an account outside the supplied chart (tenant isolation)", () => {
    const result = validateEntry(
      draft({
        lines: [
          { accountId: "someone-elses-account", direction: "debit", amount: cents(100) },
          { accountId: "revenue", direction: "credit", amount: cents(100) },
        ],
      }),
      chart,
    );
    expect(result.ok).toBe(false);
    expect(errorText(result)).toContain("Unknown account");
  });

  it("rejects postings to an archived account", () => {
    const result = validateEntry(
      draft({
        lines: [
          { accountId: "old", direction: "debit", amount: cents(100) },
          { accountId: "cash", direction: "credit", amount: cents(100) },
        ],
      }),
      chart,
    );
    expect(result.ok).toBe(false);
    expect(errorText(result)).toContain("archived");
  });

  it("requires a description and a valid date", () => {
    expect(validateEntry(draft({ description: "   " }), chart).ok).toBe(false);
    expect(validateEntry(draft({ date: "19-07-2026" }), chart).ok).toBe(false);
    expect(validateEntry(draft({ date: "2026-13-45" }), chart).ok).toBe(false);
  });

  it("reports the offending line index", () => {
    const result = validateEntry(
      draft({
        lines: [
          { accountId: "cash", direction: "debit", amount: cents(100) },
          { accountId: "nope", direction: "credit", amount: cents(100) },
        ],
      }),
      chart,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.find((e) => e.message === "Unknown account")?.lineIndex).toBe(1);
    }
  });
});

describe("buildReversal", () => {
  it("flips every side and stays balanced", () => {
    const original = draft();
    const reversal = buildReversal(original, { date: "2026-07-20" });

    expect(reversal.lines.map((l) => l.direction)).toEqual(["credit", "debit"]);
    expect(reversal.lines.map((l) => l.amount)).toEqual([10_000, 10_000]);
    expect(reversal.description).toBe("Reversal of: Cash sale");
    expect(validateEntry(reversal, chart).ok).toBe(true);
  });

  it("nets to zero against the original", () => {
    const original = draft();
    const reversal = buildReversal(original, { date: "2026-07-20" });
    const net = new Map<string, number>();
    for (const entry of [original, reversal]) {
      for (const line of entry.lines) {
        const delta = line.direction === "debit" ? line.amount : -line.amount;
        net.set(line.accountId, (net.get(line.accountId) ?? 0) + delta);
      }
    }
    expect([...net.values()].every((v) => v === 0)).toBe(true);
  });
});
