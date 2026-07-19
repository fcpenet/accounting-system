import {
  type DraftEntry,
  type ValidationError,
  buildReversal,
  cents,
  validateEntry,
} from "@acct/core";
import {
  type Database,
  accounts as accountsTable,
  and,
  db as defaultDb,
  eq,
  journalEntries,
  journalLines,
} from "@acct/db";

/**
 * The service layer: everything that happens between "a user asked for this"
 * and "the database changed".
 *
 * Deliberately free of HTTP, FormData and sessions so the write path can be
 * tested against a real database without a browser. The server actions in
 * apps/web are thin adapters over these functions.
 */

export type LedgerResult<T> =
  | { ok: true; value: T }
  | { ok: false; errors: ValidationError[] };

function failure(message: string, lineIndex: number | null = null): LedgerResult<never> {
  return { ok: false, errors: [{ lineIndex, message }] };
}

/** Chart of accounts for one org, keyed by id — the tenant boundary. */
export async function chartOfAccounts(orgId: string, db: Database = defaultDb) {
  const rows = await db
    .select({
      id: accountsTable.id,
      code: accountsTable.code,
      name: accountsTable.name,
      type: accountsTable.type,
      archived: accountsTable.archived,
    })
    .from(accountsTable)
    .where(eq(accountsTable.orgId, orgId));

  return new Map(rows.map((row) => [row.id, row]));
}

export interface PostEntryInput extends DraftEntry {
  reference?: string | null;
}

/**
 * Validate and post a journal entry.
 *
 * Validation runs against accounts re-read for `orgId`, so an entry can
 * never reference another organization's accounts regardless of what the
 * caller passed in.
 */
export async function postEntry(
  orgId: string,
  userId: string | null,
  input: PostEntryInput,
  db: Database = defaultDb,
): Promise<LedgerResult<{ entryId: string }>> {
  const chart = await chartOfAccounts(orgId, db);

  const validation = validateEntry(input, chart);
  if (!validation.ok) return { ok: false, errors: validation.errors };

  const entryId = crypto.randomUUID();

  await db.transaction(async (tx) => {
    await tx.insert(journalEntries).values({
      id: entryId,
      orgId,
      date: input.date,
      description: input.description,
      reference: input.reference ?? null,
      status: "posted",
      createdByUserId: userId,
    });

    await tx.insert(journalLines).values(
      input.lines.map((line, position) => ({
        orgId,
        entryId,
        accountId: line.accountId,
        direction: line.direction,
        amount: line.amount,
        memo: line.memo ?? null,
        position,
      })),
    );
  });

  return { ok: true, value: { entryId } };
}

/**
 * Reverse a posted entry by writing its mirror image and linking the two.
 *
 * Posted entries are never edited or deleted, so a correction leaves both
 * the mistake and its undo on the record.
 */
export async function reverseEntry(
  orgId: string,
  userId: string | null,
  entryId: string,
  options: { date?: string } = {},
  db: Database = defaultDb,
): Promise<LedgerResult<{ reversalId: string }>> {
  const [original] = await db
    .select()
    .from(journalEntries)
    .where(and(eq(journalEntries.orgId, orgId), eq(journalEntries.id, entryId)))
    .limit(1);

  if (!original) return failure("That entry doesn't exist");
  if (original.status === "reversed") return failure("That entry has already been reversed");
  if (original.reversesEntryId !== null) {
    return failure("A reversing entry can't itself be reversed");
  }

  const lines = await db
    .select({
      accountId: journalLines.accountId,
      direction: journalLines.direction,
      amount: journalLines.amount,
      memo: journalLines.memo,
      position: journalLines.position,
    })
    .from(journalLines)
    .where(and(eq(journalLines.orgId, orgId), eq(journalLines.entryId, entryId)));

  if (lines.length === 0) return failure("That entry has no lines to reverse");

  const draft = buildReversal(
    {
      date: original.date,
      description: original.description,
      lines: lines
        .sort((a, b) => a.position - b.position)
        .map((line) => ({
          accountId: line.accountId,
          direction: line.direction,
          amount: cents(line.amount),
          ...(line.memo ? { memo: line.memo } : {}),
        })),
    },
    { date: options.date ?? original.date },
  );

  const chart = await chartOfAccounts(orgId, db);
  const validation = validateEntry(draft, chart);
  // An archived account can block a reversal; surface that rather than
  // silently writing an entry that wouldn't validate.
  if (!validation.ok) return { ok: false, errors: validation.errors };

  const reversalId = crypto.randomUUID();

  await db.transaction(async (tx) => {
    await tx.insert(journalEntries).values({
      id: reversalId,
      orgId,
      date: draft.date,
      description: draft.description,
      status: "posted",
      reversesEntryId: original.id,
      createdByUserId: userId,
    });

    await tx.insert(journalLines).values(
      draft.lines.map((line, position) => ({
        orgId,
        entryId: reversalId,
        accountId: line.accountId,
        direction: line.direction,
        amount: line.amount,
        memo: line.memo ?? null,
        position,
      })),
    );

    await tx
      .update(journalEntries)
      .set({ status: "reversed", reversedByEntryId: reversalId })
      .where(and(eq(journalEntries.id, original.id), eq(journalEntries.orgId, orgId)));
  });

  return { ok: true, value: { reversalId } };
}
