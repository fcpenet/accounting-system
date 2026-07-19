import type { AccountType } from "./accounts";

/**
 * A conventional starter chart of accounts, created for every new
 * organization. Numbering follows the usual convention so it reads as
 * familiar to anyone who has used accounting software before:
 *
 *   1000-1999 Assets      2000-2999 Liabilities    3000-3999 Equity
 *   4000-4999 Income      5000-5999 Expenses
 */
export interface SeedAccount {
  code: string;
  name: string;
  type: AccountType;
}

export const DEFAULT_CHART_OF_ACCOUNTS: readonly SeedAccount[] = [
  { code: "1000", name: "Cash", type: "asset" },
  { code: "1010", name: "Business Checking", type: "asset" },
  { code: "1200", name: "Accounts Receivable", type: "asset" },
  { code: "1400", name: "Prepaid Expenses", type: "asset" },
  { code: "1500", name: "Equipment", type: "asset" },

  { code: "2000", name: "Accounts Payable", type: "liability" },
  { code: "2100", name: "Credit Card", type: "liability" },
  { code: "2200", name: "Sales Tax Payable", type: "liability" },
  { code: "2500", name: "Loans Payable", type: "liability" },

  { code: "3000", name: "Owner's Capital", type: "equity" },
  { code: "3100", name: "Owner's Draw", type: "equity" },

  { code: "4000", name: "Sales Revenue", type: "income" },
  { code: "4100", name: "Service Revenue", type: "income" },
  { code: "4900", name: "Other Income", type: "income" },

  { code: "5000", name: "Cost of Goods Sold", type: "expense" },
  { code: "5100", name: "Rent", type: "expense" },
  { code: "5200", name: "Utilities", type: "expense" },
  { code: "5300", name: "Salaries & Wages", type: "expense" },
  { code: "5400", name: "Software & Subscriptions", type: "expense" },
  { code: "5500", name: "Professional Fees", type: "expense" },
  { code: "5600", name: "Travel", type: "expense" },
  { code: "5700", name: "Meals & Entertainment", type: "expense" },
  { code: "5900", name: "Bank Fees", type: "expense" },
];
