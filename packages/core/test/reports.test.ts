import { describe, expect, it } from "vitest";
import type { Account } from "../src/accounts";
import { type Cents, cents } from "../src/money";
import {
  type LedgerLine,
  accountBalances,
  balanceSheet,
  incomeStatement,
  runningBalance,
  trialBalance,
} from "../src/reports";

const accounts: Account[] = [
  { id: "cash", code: "1000", name: "Cash", type: "asset" },
  { id: "ar", code: "1200", name: "Accounts Receivable", type: "asset" },
  { id: "ap", code: "2000", name: "Accounts Payable", type: "liability" },
  { id: "capital", code: "3000", name: "Owner's Capital", type: "equity" },
  { id: "revenue", code: "4000", name: "Service Revenue", type: "income" },
  { id: "rent", code: "5100", name: "Rent", type: "expense" },
];

const d = (accountId: string, date: string, amount: number): LedgerLine => ({
  accountId,
  date,
  direction: "debit",
  amount: cents(amount),
});
const c = (accountId: string, date: string, amount: number): LedgerLine => ({
  accountId,
  date,
  direction: "credit",
  amount: cents(amount),
});

/**
 * A small but complete set of books:
 *   Jan 05  owner invests $50,000 cash
 *   Jan 10  bills a client $12,000 on account
 *   Feb 03  collects $8,000 of it
 *   Feb 15  pays $3,000 rent in cash
 */
const lines: LedgerLine[] = [
  d("cash", "2026-01-05", 5_000_000),
  c("capital", "2026-01-05", 5_000_000),

  d("ar", "2026-01-10", 1_200_000),
  c("revenue", "2026-01-10", 1_200_000),

  d("cash", "2026-02-03", 800_000),
  c("ar", "2026-02-03", 800_000),

  d("rent", "2026-02-15", 300_000),
  c("cash", "2026-02-15", 300_000),
];

const balanceOf = (id: string, asOf?: string): Cents => {
  const rows = accountBalances(lines, accounts, asOf ? { to: asOf } : {});
  const row = rows.find((r) => r.account.id === id);
  if (!row) throw new Error(`no account ${id}`);
  return row.balance;
};

describe("accountBalances", () => {
  it("reports each account in its normal direction as a positive number", () => {
    expect(balanceOf("cash")).toBe(5_500_000); // 50,000 + 8,000 - 3,000
    expect(balanceOf("ar")).toBe(400_000); // 12,000 - 8,000
    expect(balanceOf("capital")).toBe(5_000_000); // credit-normal, positive
    expect(balanceOf("revenue")).toBe(1_200_000); // credit-normal, positive
    expect(balanceOf("rent")).toBe(300_000); // debit-normal, positive
  });

  it("respects an as-of cutoff", () => {
    expect(balanceOf("cash", "2026-01-31")).toBe(5_000_000);
    expect(balanceOf("ar", "2026-01-31")).toBe(1_200_000);
  });
});

describe("trialBalance", () => {
  it("balances, and omits untouched accounts", () => {
    const tb = trialBalance(lines, accounts);
    expect(tb.balanced).toBe(true);
    expect(tb.totalDebits).toBe(tb.totalCredits);
    expect(tb.totalDebits).toBe(7_300_000);
    expect(tb.rows.map((r) => r.account.id)).not.toContain("ap");
  });

  it("still balances for a partial period", () => {
    const tb = trialBalance(lines, accounts, { to: "2026-01-31" });
    expect(tb.balanced).toBe(true);
  });
});

describe("incomeStatement", () => {
  it("nets income against expenses for the full period", () => {
    const pl = incomeStatement(lines, accounts);
    expect(pl.totalIncome).toBe(1_200_000);
    expect(pl.totalExpenses).toBe(300_000);
    expect(pl.netIncome).toBe(900_000);
  });

  it("filters to the requested range", () => {
    const jan = incomeStatement(lines, accounts, {
      from: "2026-01-01",
      to: "2026-01-31",
    });
    expect(jan.totalIncome).toBe(1_200_000);
    expect(jan.totalExpenses).toBe(0); // rent was paid in February
    expect(jan.netIncome).toBe(1_200_000);

    const feb = incomeStatement(lines, accounts, {
      from: "2026-02-01",
      to: "2026-02-28",
    });
    expect(feb.totalIncome).toBe(0);
    expect(feb.netIncome).toBe(-300_000);
  });

  it("includes range boundaries", () => {
    const oneDay = incomeStatement(lines, accounts, {
      from: "2026-01-10",
      to: "2026-01-10",
    });
    expect(oneDay.totalIncome).toBe(1_200_000);
  });
});

describe("balanceSheet", () => {
  it("balances: assets = liabilities + equity", () => {
    const bs = balanceSheet(lines, accounts);
    expect(bs.totalAssets).toBe(5_900_000); // cash 55,000 + AR 4,000
    expect(bs.totalLiabilities).toBe(0);
    expect(bs.totalEquityAccounts).toBe(5_000_000);
    expect(bs.retainedEarnings).toBe(900_000);
    expect(bs.totalEquity).toBe(5_900_000);
    expect(bs.balanced).toBe(true);
  });

  it("balances at an interim date, rolling earnings into equity", () => {
    const bs = balanceSheet(lines, accounts, "2026-01-31");
    expect(bs.totalAssets).toBe(6_200_000); // cash 50,000 + AR 12,000
    expect(bs.retainedEarnings).toBe(1_200_000);
    expect(bs.totalEquity).toBe(6_200_000);
    expect(bs.balanced).toBe(true);
  });

  it("keeps income and expense accounts off the statement", () => {
    const bs = balanceSheet(lines, accounts);
    const ids = [...bs.assets, ...bs.liabilities, ...bs.equity].map(
      (r) => r.account.id,
    );
    expect(ids).not.toContain("revenue");
    expect(ids).not.toContain("rent");
  });

  it("balances on empty books", () => {
    const bs = balanceSheet([], accounts);
    expect(bs.balanced).toBe(true);
    expect(bs.totalAssets).toBe(0);
  });
});

describe("runningBalance", () => {
  it("accumulates in the account's normal direction", () => {
    const cashLines = lines
      .filter((l) => l.accountId === "cash")
      .map((l, i) => ({ ...l, entryId: `e${i}`, description: "" }));

    const rows = runningBalance(cashLines, "asset");
    expect(rows.map((r) => r.runningBalance)).toEqual([
      5_000_000, // +50,000 debit
      5_800_000, // +8,000 debit
      5_500_000, // -3,000 credit
    ]);
  });
});
