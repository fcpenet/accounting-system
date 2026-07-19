import "server-only";

import {
  type Account,
  type DateRange,
  type LedgerLine,
  cents,
} from "@acct/core";
import {
  accounts,
  and,
  asc,
  db,
  desc,
  eq,
  gte,
  journalEntries,
  journalLines,
  lte,
} from "@acct/db";

/**
 * Every function here takes `orgId` as its first argument and filters on it.
 * That is the whole tenant-isolation story: there is no unscoped read path,
 * so a page cannot accidentally render another organization's books.
 */

export async function listAccounts(
  orgId: string,
  options: { includeArchived?: boolean } = {},
): Promise<Account[]> {
  const where = options.includeArchived
    ? eq(accounts.orgId, orgId)
    : and(eq(accounts.orgId, orgId), eq(accounts.archived, false));

  const rows = await db
    .select({
      id: accounts.id,
      code: accounts.code,
      name: accounts.name,
      type: accounts.type,
      archived: accounts.archived,
    })
    .from(accounts)
    .where(where)
    .orderBy(asc(accounts.code));

  return rows.map((row) => ({ ...row, archived: row.archived }));
}

/** Chart of accounts keyed by id — the shape `validateEntry` expects. */
export async function accountsById(
  orgId: string,
): Promise<Map<string, Account>> {
  const list = await listAccounts(orgId, { includeArchived: true });
  return new Map(list.map((account) => [account.id, account]));
}

/**
 * Flat posted lines for the reporting engine.
 *
 * Reversed entries are excluded along with their reversals, so a reversed
 * mistake nets out of the reports while both halves stay visible in the
 * journal for audit.
 */
export async function listLedgerLines(
  orgId: string,
  range: DateRange = {},
): Promise<LedgerLine[]> {
  const conditions = [
    eq(journalLines.orgId, orgId),
    eq(journalEntries.status, "posted"),
  ];
  if (range.from !== undefined) conditions.push(gte(journalEntries.date, range.from));
  if (range.to !== undefined) conditions.push(lte(journalEntries.date, range.to));

  const rows = await db
    .select({
      accountId: journalLines.accountId,
      date: journalEntries.date,
      direction: journalLines.direction,
      amount: journalLines.amount,
    })
    .from(journalLines)
    .innerJoin(journalEntries, eq(journalLines.entryId, journalEntries.id))
    .where(and(...conditions));

  return rows.map((row) => ({ ...row, amount: cents(row.amount) }));
}

export interface EntryWithLines {
  id: string;
  date: string;
  description: string;
  reference: string | null;
  status: "posted" | "reversed";
  reversedByEntryId: string | null;
  reversesEntryId: string | null;
  createdAt: Date;
  lines: {
    id: string;
    accountId: string;
    accountCode: string;
    accountName: string;
    direction: "debit" | "credit";
    amount: number;
    memo: string | null;
  }[];
}

/**
 * Journal entries, newest first, with their lines attached.
 *
 * Two queries rather than a join-and-regroup: the join would multiply the
 * entry columns across every line, and paginating a joined result set means
 * paginating lines, not entries.
 */
export async function listEntries(
  orgId: string,
  options: { limit?: number; offset?: number } = {},
): Promise<EntryWithLines[]> {
  const limit = options.limit ?? 50;

  const entries = await db
    .select()
    .from(journalEntries)
    .where(eq(journalEntries.orgId, orgId))
    .orderBy(desc(journalEntries.date), desc(journalEntries.createdAt))
    .limit(limit)
    .offset(options.offset ?? 0);

  if (entries.length === 0) return [];

  const lines = await linesForEntries(
    orgId,
    entries.map((entry) => entry.id),
  );

  return entries.map((entry) => ({
    id: entry.id,
    date: entry.date,
    description: entry.description,
    reference: entry.reference,
    status: entry.status,
    reversedByEntryId: entry.reversedByEntryId,
    reversesEntryId: entry.reversesEntryId,
    createdAt: entry.createdAt,
    lines: lines.get(entry.id) ?? [],
  }));
}

export async function getEntry(
  orgId: string,
  entryId: string,
): Promise<EntryWithLines | null> {
  const rows = await db
    .select()
    .from(journalEntries)
    .where(and(eq(journalEntries.orgId, orgId), eq(journalEntries.id, entryId)))
    .limit(1);

  const entry = rows[0];
  if (!entry) return null;

  const lines = await linesForEntries(orgId, [entry.id]);

  return {
    id: entry.id,
    date: entry.date,
    description: entry.description,
    reference: entry.reference,
    status: entry.status,
    reversedByEntryId: entry.reversedByEntryId,
    reversesEntryId: entry.reversesEntryId,
    createdAt: entry.createdAt,
    lines: lines.get(entry.id) ?? [],
  };
}

async function linesForEntries(
  orgId: string,
  entryIds: string[],
): Promise<Map<string, EntryWithLines["lines"]>> {
  if (entryIds.length === 0) return new Map();

  const rows = await db
    .select({
      id: journalLines.id,
      entryId: journalLines.entryId,
      accountId: journalLines.accountId,
      accountCode: accounts.code,
      accountName: accounts.name,
      direction: journalLines.direction,
      amount: journalLines.amount,
      memo: journalLines.memo,
      position: journalLines.position,
    })
    .from(journalLines)
    .innerJoin(accounts, eq(journalLines.accountId, accounts.id))
    .where(eq(journalLines.orgId, orgId))
    .orderBy(asc(journalLines.position));

  const wanted = new Set(entryIds);
  const grouped = new Map<string, EntryWithLines["lines"]>();

  for (const row of rows) {
    if (!wanted.has(row.entryId)) continue;
    const bucket = grouped.get(row.entryId) ?? [];
    bucket.push({
      id: row.id,
      accountId: row.accountId,
      accountCode: row.accountCode,
      accountName: row.accountName,
      direction: row.direction,
      amount: row.amount,
      memo: row.memo,
    });
    grouped.set(row.entryId, bucket);
  }

  return grouped;
}

/** Posted lines for one account, oldest first — the account's ledger view. */
export async function accountLedger(
  orgId: string,
  accountId: string,
): Promise<(LedgerLine & { entryId: string; description: string })[]> {
  const rows = await db
    .select({
      accountId: journalLines.accountId,
      entryId: journalLines.entryId,
      date: journalEntries.date,
      description: journalEntries.description,
      direction: journalLines.direction,
      amount: journalLines.amount,
    })
    .from(journalLines)
    .innerJoin(journalEntries, eq(journalLines.entryId, journalEntries.id))
    .where(
      and(
        eq(journalLines.orgId, orgId),
        eq(journalLines.accountId, accountId),
        eq(journalEntries.status, "posted"),
      ),
    )
    .orderBy(asc(journalEntries.date), asc(journalEntries.createdAt));

  return rows.map((row) => ({ ...row, amount: cents(row.amount) }));
}

export async function getAccount(
  orgId: string,
  accountId: string,
): Promise<Account | null> {
  const rows = await db
    .select({
      id: accounts.id,
      code: accounts.code,
      name: accounts.name,
      type: accounts.type,
      archived: accounts.archived,
    })
    .from(accounts)
    .where(and(eq(accounts.orgId, orgId), eq(accounts.id, accountId)))
    .limit(1);

  return rows[0] ?? null;
}
