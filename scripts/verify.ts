/**
 * Integrity check across every organization in the database.
 *
 *   pnpm db:verify
 *
 * Reads the ledger back out and re-derives the reports, asserting the two
 * invariants that must hold in any set of double-entry books:
 *
 *   1. total debits == total credits (trial balance)
 *   2. assets == liabilities + equity (balance sheet)
 *
 * Entry validation is supposed to make violations impossible, so a failure
 * here means something wrote to the tables directly. Worth running after a
 * migration or a bulk import.
 */
import { balanceSheet, cents, formatAmount, incomeStatement, trialBalance } from "@acct/core";
import {
  accounts as accountsTable,
  db,
  eq,
  journalEntries,
  journalLines,
  organizations,
} from "@acct/db";

async function main() {
  const orgs = await db.select().from(organizations);

  if (orgs.length === 0) {
    console.log("No organizations found. Run `pnpm db:seed` first.");
    return;
  }

  let failures = 0;

  for (const org of orgs) {
    const chart = await db
      .select({
        id: accountsTable.id,
        code: accountsTable.code,
        name: accountsTable.name,
        type: accountsTable.type,
        archived: accountsTable.archived,
      })
      .from(accountsTable)
      .where(eq(accountsTable.orgId, org.id));

    const rows = await db
      .select({
        accountId: journalLines.accountId,
        date: journalEntries.date,
        direction: journalLines.direction,
        amount: journalLines.amount,
      })
      .from(journalLines)
      .innerJoin(journalEntries, eq(journalLines.entryId, journalEntries.id))
      .where(eq(journalLines.orgId, org.id));

    const lines = rows.map((row) => ({ ...row, amount: cents(row.amount) }));

    const tb = trialBalance(lines, chart);
    const pl = incomeStatement(lines, chart);
    const bs = balanceSheet(lines, chart);

    console.log(`\n${org.name}`);
    console.log(`${"─".repeat(Math.max(org.name.length, 40))}`);
    console.log(`  accounts ${chart.length}   posted lines ${lines.length}`);

    console.log(`\n  Trial balance`);
    console.log(`    debits            ${formatAmount(tb.totalDebits).padStart(14)}`);
    console.log(`    credits           ${formatAmount(tb.totalCredits).padStart(14)}`);
    console.log(`    balanced          ${tb.balanced ? "yes" : "NO — FAIL"}`);

    console.log(`\n  Income statement`);
    console.log(`    income            ${formatAmount(pl.totalIncome).padStart(14)}`);
    console.log(`    expenses          ${formatAmount(pl.totalExpenses).padStart(14)}`);
    console.log(`    net income        ${formatAmount(pl.netIncome).padStart(14)}`);

    console.log(`\n  Balance sheet`);
    console.log(`    assets            ${formatAmount(bs.totalAssets).padStart(14)}`);
    console.log(`    liabilities       ${formatAmount(bs.totalLiabilities).padStart(14)}`);
    console.log(`    equity accounts   ${formatAmount(bs.totalEquityAccounts).padStart(14)}`);
    console.log(`    retained earnings ${formatAmount(bs.retainedEarnings).padStart(14)}`);
    console.log(`    total equity      ${formatAmount(bs.totalEquity).padStart(14)}`);
    console.log(
      `    liabilities+equity${formatAmount(cents(bs.totalLiabilities + bs.totalEquity)).padStart(14)}`,
    );
    console.log(`    balanced          ${bs.balanced ? "yes" : "NO — FAIL"}`);

    if (!tb.balanced || !bs.balanced) failures += 1;
  }

  console.log("");
  if (failures > 0) {
    console.error(`✗ ${failures} organization(s) failed the integrity check.`);
    process.exit(1);
  }
  console.log(`✓ All ${orgs.length} organization(s) balance.`);
}

main().catch((error) => {
  console.error("\nVerification failed:", error);
  process.exit(1);
});
