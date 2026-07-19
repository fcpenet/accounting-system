/**
 * Validation rules for posting a journal entry.
 *
 * The invariant this file exists to protect: within a single entry, total
 * debits must equal total credits. If that ever fails, the trial balance
 * stops balancing and every downstream report is quietly wrong.
 */

import { type Account, type Direction, isDebitNormal } from "./accounts";
import { isValidISODate } from "./dates";
import { type Cents, ZERO, add, cents, formatAmount } from "./money";

export interface DraftLine {
  accountId: string;
  direction: Direction;
  /** Always a positive magnitude; the direction carries the sign. */
  amount: Cents;
  memo?: string;
}

export interface DraftEntry {
  /** ISO date (YYYY-MM-DD) the entry is effective on. */
  date: string;
  description: string;
  lines: readonly DraftLine[];
}

export interface ValidationError {
  /** Index into `lines`, or null for entry-level problems. */
  lineIndex: number | null;
  message: string;
}

export type ValidationResult =
  | { ok: true; totals: { debits: Cents; credits: Cents } }
  | { ok: false; errors: ValidationError[] };

/**
 * Validate a draft entry against the chart of accounts.
 *
 * `accounts` should already be scoped to the acting organization — this
 * function treats "not in the map" as "not yours", which doubles as the
 * tenant-isolation check for line accounts.
 */
export function validateEntry(
  draft: DraftEntry,
  accounts: ReadonlyMap<string, Account>,
): ValidationResult {
  const errors: ValidationError[] = [];

  if (!isValidISODate(draft.date)) {
    errors.push({
      lineIndex: null,
      message: `"${draft.date}" is not a valid date (expected YYYY-MM-DD)`,
    });
  }

  if (draft.description.trim() === "") {
    errors.push({ lineIndex: null, message: "Description is required" });
  }

  if (draft.lines.length < 2) {
    errors.push({
      lineIndex: null,
      message: "An entry needs at least two lines — one debit and one credit",
    });
  }

  let debits = ZERO;
  let credits = ZERO;

  draft.lines.forEach((line, index) => {
    const account = accounts.get(line.accountId);
    if (!account) {
      errors.push({ lineIndex: index, message: "Unknown account" });
    } else if (account.archived) {
      errors.push({
        lineIndex: index,
        message: `Account ${account.code} ${account.name} is archived and can't take new postings`,
      });
    }

    if (line.amount <= 0) {
      errors.push({
        lineIndex: index,
        message:
          "Amount must be greater than zero — use the debit/credit side to express direction, not a negative number",
      });
      return;
    }

    if (line.direction === "debit") debits = add(debits, line.amount);
    else credits = add(credits, line.amount);
  });

  if (debits !== credits) {
    const difference = cents(Math.abs(debits - credits));
    errors.push({
      lineIndex: null,
      message:
        `Entry is out of balance by ${formatAmount(difference)} ` +
        `(debits ${formatAmount(debits)}, credits ${formatAmount(credits)})`,
    });
  }

  if (debits === 0 && credits === 0 && draft.lines.length > 0) {
    errors.push({
      lineIndex: null,
      message: "An entry must move a non-zero amount",
    });
  }

  return errors.length > 0 ? { ok: false, errors } : { ok: true, totals: { debits, credits } };
}

/**
 * Convert a line into its effect on the account's balance, expressed in the
 * account's normal direction. A credit to a debit-normal account is negative.
 */
export function signedEffect(
  direction: Direction,
  amount: Cents,
  accountType: Parameters<typeof isDebitNormal>[0],
): Cents {
  const normal = isDebitNormal(accountType) ? "debit" : "credit";
  return cents(direction === normal ? amount : -amount);
}

/**
 * Build the reversing entry for a posted entry: same accounts and amounts,
 * every side flipped. Posted entries are never edited or deleted — this is
 * how a mistake gets corrected while leaving the audit trail intact.
 */
export function buildReversal(
  original: DraftEntry,
  options: { date: string; description?: string },
): DraftEntry {
  return {
    date: options.date,
    description:
      options.description ?? `Reversal of: ${original.description}`,
    lines: original.lines.map((line) => ({
      ...line,
      direction: line.direction === "debit" ? "credit" : "debit",
    })),
  };
}
