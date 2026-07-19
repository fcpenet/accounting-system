/**
 * Account taxonomy and the normal-balance rules that drive every report.
 */

export const ACCOUNT_TYPES = [
  "asset",
  "liability",
  "equity",
  "income",
  "expense",
] as const;

export type AccountType = (typeof ACCOUNT_TYPES)[number];

export type Direction = "debit" | "credit";

/**
 * Which side increases each account type.
 *
 *   Assets and Expenses increase on the DEBIT side.
 *   Liabilities, Equity and Income increase on the CREDIT side.
 *
 * This single table is what lets us turn raw debits/credits into signed
 * balances that read naturally on a report (a healthy bank account shows
 * positive, not negative).
 */
export const NORMAL_BALANCE: Record<AccountType, Direction> = {
  asset: "debit",
  expense: "debit",
  liability: "credit",
  equity: "credit",
  income: "credit",
};

/** Accounts that live on the balance sheet (permanent / real accounts). */
export const BALANCE_SHEET_TYPES: readonly AccountType[] = [
  "asset",
  "liability",
  "equity",
];

/** Accounts that live on the income statement (temporary / nominal accounts). */
export const INCOME_STATEMENT_TYPES: readonly AccountType[] = [
  "income",
  "expense",
];

export function isBalanceSheetType(type: AccountType): boolean {
  return BALANCE_SHEET_TYPES.includes(type);
}

export function isIncomeStatementType(type: AccountType): boolean {
  return INCOME_STATEMENT_TYPES.includes(type);
}

export function isDebitNormal(type: AccountType): boolean {
  return NORMAL_BALANCE[type] === "debit";
}

export interface Account {
  id: string;
  code: string;
  name: string;
  type: AccountType;
  /** Archived accounts stay in history but can't take new postings. */
  archived?: boolean;
}

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  asset: "Asset",
  liability: "Liability",
  equity: "Equity",
  income: "Income",
  expense: "Expense",
};
