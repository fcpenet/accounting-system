import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { balanceSheet, cents, trialBalance } from "@acct/core";
import {
  type Database,
  accounts,
  eq,
  journalEntries,
  journalLines,
  organizations,
} from "@acct/db";
import { postEntry, reverseEntry } from "../src/post-entry";

/**
 * These run against a real libSQL file, not a mock. The whole point is to
 * exercise the transaction boundary and the constraints — a fake would
 * happily accept writes the real database rejects.
 */

let db: Database;
let dir: string;

const ORG = "org-under-test";
const OTHER_ORG = "someone-elses-org";
const USER = "user-1";

const CASH = "acct-cash";
const REVENUE = "acct-revenue";
const RENT = "acct-rent";
const ARCHIVED = "acct-archived";
const FOREIGN = "acct-foreign";

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "ledger-test-"));
  const client = createClient({ url: `file:${join(dir, "test.db")}` });
  db = drizzle(client, { casing: "snake_case" }) as unknown as Database;

  // Mirror of the Drizzle schema. Kept explicit so the test fails loudly if
  // the real schema drifts away from what these tests assume.
  await client.executeMultiple(`
    CREATE TABLE organizations (
      id TEXT PRIMARY KEY, name TEXT NOT NULL,
      currency TEXT NOT NULL DEFAULT 'USD',
      fiscal_year_start_month INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    );
    CREATE TABLE accounts (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      code TEXT NOT NULL, name TEXT NOT NULL, type TEXT NOT NULL,
      description TEXT, archived INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    );
    CREATE UNIQUE INDEX accounts_org_code_unique ON accounts (org_id, code);
    CREATE TABLE journal_entries (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      date TEXT NOT NULL, description TEXT NOT NULL, reference TEXT,
      status TEXT NOT NULL DEFAULT 'posted',
      reversed_by_entry_id TEXT, reverses_entry_id TEXT,
      created_by_user_id TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    );
    CREATE TABLE journal_lines (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      entry_id TEXT NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
      account_id TEXT NOT NULL REFERENCES accounts(id),
      direction TEXT NOT NULL, amount INTEGER NOT NULL, memo TEXT,
      position INTEGER NOT NULL DEFAULT 0
    );
  `);

  await db.insert(organizations).values([
    { id: ORG, name: "Test Co" },
    { id: OTHER_ORG, name: "Other Co" },
  ]);

  await db.insert(accounts).values([
    { id: CASH, orgId: ORG, code: "1000", name: "Cash", type: "asset" },
    { id: REVENUE, orgId: ORG, code: "4000", name: "Revenue", type: "income" },
    { id: RENT, orgId: ORG, code: "5100", name: "Rent", type: "expense" },
    { id: ARCHIVED, orgId: ORG, code: "5999", name: "Old", type: "expense", archived: true },
    { id: FOREIGN, orgId: OTHER_ORG, code: "1000", name: "Their Cash", type: "asset" },
  ]);
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

beforeEach(async () => {
  await db.delete(journalLines);
  await db.delete(journalEntries);
});

const entry = (overrides: Record<string, unknown> = {}) => ({
  date: "2026-04-01",
  description: "Cash sale",
  lines: [
    { accountId: CASH, direction: "debit" as const, amount: cents(50_000) },
    { accountId: REVENUE, direction: "credit" as const, amount: cents(50_000) },
  ],
  ...overrides,
});

async function currentLines() {
  const rows = await db
    .select({
      accountId: journalLines.accountId,
      date: journalEntries.date,
      direction: journalLines.direction,
      amount: journalLines.amount,
    })
    .from(journalLines)
    .innerJoin(journalEntries, eq(journalLines.entryId, journalEntries.id));
  return rows.map((r) => ({ ...r, amount: cents(r.amount) }));
}

const chart = [
  { id: CASH, code: "1000", name: "Cash", type: "asset" as const },
  { id: REVENUE, code: "4000", name: "Revenue", type: "income" as const },
  { id: RENT, code: "5100", name: "Rent", type: "expense" as const },
];

describe("postEntry", () => {
  it("writes a balanced entry with its lines", async () => {
    const result = await postEntry(ORG, USER, entry(), db);
    expect(result.ok).toBe(true);

    const lines = await db.select().from(journalLines);
    expect(lines).toHaveLength(2);
    expect(lines.every((l) => l.orgId === ORG)).toBe(true);

    const [saved] = await db.select().from(journalEntries);
    expect(saved?.status).toBe("posted");
    expect(saved?.createdByUserId).toBe(USER);
  });

  it("preserves line order via position", async () => {
    await postEntry(
      ORG,
      USER,
      entry({
        lines: [
          { accountId: RENT, direction: "debit", amount: cents(30_000) },
          { accountId: REVENUE, direction: "debit", amount: cents(20_000) },
          { accountId: CASH, direction: "credit", amount: cents(50_000) },
        ],
      }),
      db,
    );

    const lines = await db.select().from(journalLines);
    const ordered = lines.sort((a, b) => a.position - b.position);
    expect(ordered.map((l) => l.accountId)).toEqual([RENT, REVENUE, CASH]);
  });

  it("rejects an unbalanced entry and writes nothing", async () => {
    const result = await postEntry(
      ORG,
      USER,
      entry({
        lines: [
          { accountId: CASH, direction: "debit", amount: cents(50_000) },
          { accountId: REVENUE, direction: "credit", amount: cents(49_999) },
        ],
      }),
      db,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => /out of balance/.test(e.message))).toBe(true);
    }
    // The critical part: a rejected entry leaves no partial rows behind.
    expect(await db.select().from(journalEntries)).toHaveLength(0);
    expect(await db.select().from(journalLines)).toHaveLength(0);
  });

  it("refuses to post against another organization's account", async () => {
    const result = await postEntry(
      ORG,
      USER,
      entry({
        lines: [
          { accountId: FOREIGN, direction: "debit", amount: cents(50_000) },
          { accountId: REVENUE, direction: "credit", amount: cents(50_000) },
        ],
      }),
      db,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.message === "Unknown account")).toBe(true);
    }
    expect(await db.select().from(journalLines)).toHaveLength(0);
  });

  it("refuses to post to an archived account", async () => {
    const result = await postEntry(
      ORG,
      USER,
      entry({
        lines: [
          { accountId: ARCHIVED, direction: "debit", amount: cents(1_000) },
          { accountId: CASH, direction: "credit", amount: cents(1_000) },
        ],
      }),
      db,
    );
    expect(result.ok).toBe(false);
  });

  it("keeps the books balanced across many entries", async () => {
    await postEntry(ORG, USER, entry(), db);
    await postEntry(
      ORG,
      USER,
      entry({
        date: "2026-04-02",
        description: "Rent",
        lines: [
          { accountId: RENT, direction: "debit", amount: cents(12_345) },
          { accountId: CASH, direction: "credit", amount: cents(12_345) },
        ],
      }),
      db,
    );

    const lines = await currentLines();
    expect(trialBalance(lines, chart).balanced).toBe(true);
    expect(balanceSheet(lines, chart).balanced).toBe(true);
  });
});

describe("reverseEntry", () => {
  it("writes a mirror entry and links both sides", async () => {
    const posted = await postEntry(ORG, USER, entry(), db);
    if (!posted.ok) throw new Error("setup failed");

    const result = await reverseEntry(ORG, USER, posted.value.entryId, {
      date: "2026-04-05",
    }, db);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const [original] = await db
      .select()
      .from(journalEntries)
      .where(eq(journalEntries.id, posted.value.entryId));
    const [reversal] = await db
      .select()
      .from(journalEntries)
      .where(eq(journalEntries.id, result.value.reversalId));

    expect(original?.status).toBe("reversed");
    expect(original?.reversedByEntryId).toBe(result.value.reversalId);
    expect(reversal?.reversesEntryId).toBe(posted.value.entryId);
    expect(reversal?.date).toBe("2026-04-05");
  });

  it("nets the account balances back to zero", async () => {
    const posted = await postEntry(ORG, USER, entry(), db);
    if (!posted.ok) throw new Error("setup failed");
    await reverseEntry(ORG, USER, posted.value.entryId, {}, db);

    const lines = await currentLines();
    const net = new Map<string, number>();
    for (const line of lines) {
      const delta = line.direction === "debit" ? line.amount : -line.amount;
      net.set(line.accountId, (net.get(line.accountId) ?? 0) + delta);
    }
    expect([...net.values()].every((v) => v === 0)).toBe(true);
    expect(trialBalance(lines, chart).balanced).toBe(true);
  });

  it("won't reverse the same entry twice", async () => {
    const posted = await postEntry(ORG, USER, entry(), db);
    if (!posted.ok) throw new Error("setup failed");

    await reverseEntry(ORG, USER, posted.value.entryId, {}, db);
    const second = await reverseEntry(ORG, USER, posted.value.entryId, {}, db);

    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.errors[0]?.message).toMatch(/already been reversed/);
  });

  it("won't reverse a reversal", async () => {
    const posted = await postEntry(ORG, USER, entry(), db);
    if (!posted.ok) throw new Error("setup failed");
    const reversal = await reverseEntry(ORG, USER, posted.value.entryId, {}, db);
    if (!reversal.ok) throw new Error("setup failed");

    const result = await reverseEntry(ORG, USER, reversal.value.reversalId, {}, db);
    expect(result.ok).toBe(false);
  });

  it("won't reverse another organization's entry", async () => {
    const posted = await postEntry(ORG, USER, entry(), db);
    if (!posted.ok) throw new Error("setup failed");

    const result = await reverseEntry(OTHER_ORG, "intruder", posted.value.entryId, {}, db);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]?.message).toMatch(/doesn't exist/);

    // And the original must be untouched.
    const [original] = await db
      .select()
      .from(journalEntries)
      .where(eq(journalEntries.id, posted.value.entryId));
    expect(original?.status).toBe("posted");
  });
});
