/**
 * Report builders. All of them take flat posted lines plus the chart of
 * accounts and return plain data — no database access, no formatting — so
 * the arithmetic can be tested in isolation.
 */

import {
  type Account,
  type AccountType,
  type Direction,
  isDebitNormal,
} from "./accounts";
import { type Cents, ZERO, add, cents, subtract } from "./money";

/** One posted journal line, flattened for reporting. */
export interface LedgerLine {
  accountId: string;
  /** ISO date (YYYY-MM-DD). */
  date: string;
  direction: Direction;
  amount: Cents;
}

export interface DateRange {
  /** Inclusive ISO date. Omit for "since the beginning of time". */
  from?: string;
  /** Inclusive ISO date. */
  to?: string;
}

function withinRange(date: string, range: DateRange): boolean {
  if (range.from !== undefined && date < range.from) return false;
  if (range.to !== undefined && date > range.to) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Account balances
// ---------------------------------------------------------------------------

export interface AccountBalance {
  account: Account;
  debits: Cents;
  credits: Cents;
  /** Balance in the account's normal direction (positive = normal side). */
  balance: Cents;
}

export function accountBalances(
  lines: readonly LedgerLine[],
  accounts: readonly Account[],
  range: DateRange = {},
): AccountBalance[] {
  const totals = new Map<string, { debits: Cents; credits: Cents }>();
  for (const account of accounts) {
    totals.set(account.id, { debits: ZERO, credits: ZERO });
  }

  for (const line of lines) {
    if (!withinRange(line.date, range)) continue;
    const bucket = totals.get(line.accountId);
    // Lines for accounts outside the supplied chart are ignored rather than
    // thrown on: callers scope both by org, so a miss means a filtered account.
    if (!bucket) continue;
    if (line.direction === "debit") bucket.debits = add(bucket.debits, line.amount);
    else bucket.credits = add(bucket.credits, line.amount);
  }

  return accounts.map((account) => {
    const { debits, credits } = totals.get(account.id) ?? {
      debits: ZERO,
      credits: ZERO,
    };
    const balance = isDebitNormal(account.type)
      ? subtract(debits, credits)
      : subtract(credits, debits);
    return { account, debits, credits, balance };
  });
}

// ---------------------------------------------------------------------------
// Trial balance
// ---------------------------------------------------------------------------

export interface TrialBalance {
  rows: AccountBalance[];
  totalDebits: Cents;
  totalCredits: Cents;
  /** If this is ever false, something bypassed entry validation. */
  balanced: boolean;
}

export function trialBalance(
  lines: readonly LedgerLine[],
  accounts: readonly Account[],
  range: DateRange = {},
): TrialBalance {
  const rows = accountBalances(lines, accounts, range).filter(
    (row) => row.debits !== 0 || row.credits !== 0,
  );

  let totalDebits = ZERO;
  let totalCredits = ZERO;
  for (const row of rows) {
    totalDebits = add(totalDebits, row.debits);
    totalCredits = add(totalCredits, row.credits);
  }

  return {
    rows,
    totalDebits,
    totalCredits,
    balanced: totalDebits === totalCredits,
  };
}

// ---------------------------------------------------------------------------
// Income statement (profit & loss)
// ---------------------------------------------------------------------------

export interface IncomeStatement {
  range: DateRange;
  income: AccountBalance[];
  expenses: AccountBalance[];
  totalIncome: Cents;
  totalExpenses: Cents;
  netIncome: Cents;
}

export function incomeStatement(
  lines: readonly LedgerLine[],
  accounts: readonly Account[],
  range: DateRange = {},
): IncomeStatement {
  const balances = accountBalances(lines, accounts, range);
  const pick = (type: AccountType) =>
    balances.filter((b) => b.account.type === type && b.balance !== 0);

  const income = pick("income");
  const expenses = pick("expense");

  const totalIncome = income.reduce<Cents>((acc, b) => add(acc, b.balance), ZERO);
  const totalExpenses = expenses.reduce<Cents>((acc, b) => add(acc, b.balance), ZERO);

  return {
    range,
    income,
    expenses,
    totalIncome,
    totalExpenses,
    netIncome: subtract(totalIncome, totalExpenses),
  };
}

// ---------------------------------------------------------------------------
// Balance sheet
// ---------------------------------------------------------------------------

export interface BalanceSheet {
  asOf: string | undefined;
  assets: AccountBalance[];
  liabilities: AccountBalance[];
  equity: AccountBalance[];
  totalAssets: Cents;
  totalLiabilities: Cents;
  /** Equity accounts only, excluding earnings. */
  totalEquityAccounts: Cents;
  /** Cumulative net income to `asOf`, which is what closes the equation. */
  retainedEarnings: Cents;
  /** Equity accounts + retained earnings. */
  totalEquity: Cents;
  balanced: boolean;
}

/**
 * A balance sheet is cumulative: everything up to and including `asOf`.
 *
 * Income and expense accounts don't appear as line items — their net effect
 * to date rolls into equity as retained earnings. Skipping that roll-up is
 * the classic reason a balance sheet refuses to balance.
 */
export function balanceSheet(
  lines: readonly LedgerLine[],
  accounts: readonly Account[],
  asOf?: string,
): BalanceSheet {
  const range: DateRange = asOf === undefined ? {} : { to: asOf };
  const balances = accountBalances(lines, accounts, range);
  const pick = (type: AccountType) =>
    balances.filter((b) => b.account.type === type && b.balance !== 0);

  const assets = pick("asset");
  const liabilities = pick("liability");
  const equity = pick("equity");

  const total = (rows: AccountBalance[]) =>
    rows.reduce<Cents>((acc, b) => add(acc, b.balance), ZERO);

  const totalAssets = total(assets);
  const totalLiabilities = total(liabilities);
  const totalEquityAccounts = total(equity);

  const { netIncome } = incomeStatement(lines, accounts, range);
  const totalEquity = add(totalEquityAccounts, netIncome);

  return {
    asOf,
    assets,
    liabilities,
    equity,
    totalAssets,
    totalLiabilities,
    totalEquityAccounts,
    retainedEarnings: netIncome,
    totalEquity,
    balanced: totalAssets === add(totalLiabilities, totalEquity),
  };
}

// ---------------------------------------------------------------------------
// General ledger (per-account running balance)
// ---------------------------------------------------------------------------

export interface LedgerRow extends LedgerLine {
  entryId: string;
  description: string;
  runningBalance: Cents;
}

/**
 * Running balance for a single account, oldest first. Expects `lines` to
 * already be filtered to one account and sorted by date then entry id.
 */
export function runningBalance(
  lines: readonly (LedgerLine & { entryId: string; description: string })[],
  accountType: AccountType,
  opening: Cents = ZERO,
): LedgerRow[] {
  const debitNormal = isDebitNormal(accountType);
  let balance = opening;

  return lines.map((line) => {
    const delta =
      line.direction === (debitNormal ? "debit" : "credit")
        ? line.amount
        : cents(-line.amount);
    balance = add(balance, delta);
    return { ...line, runningBalance: balance };
  });
}
