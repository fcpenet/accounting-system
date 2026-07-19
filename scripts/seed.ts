/**
 * Seed a demo organization with a realistic first quarter of books.
 *
 * Lives at the root rather than inside packages/db because it needs the auth
 * package to hash a password, and db must not depend on auth (auth already
 * depends on db).
 *
 *   pnpm db:seed
 */
import { parseAmount } from "@acct/core";
import { registerUser } from "@acct/auth";
import {
  accounts as accountsTable,
  db,
  eq,
  journalEntries,
  journalLines,
  users,
} from "@acct/db";

const DEMO_EMAIL = "demo@example.com";
const DEMO_PASSWORD = "demo-password-123";

interface SeedLine {
  code: string;
  direction: "debit" | "credit";
  amount: string;
}

interface SeedEntry {
  date: string;
  description: string;
  reference?: string;
  lines: SeedLine[];
}

const ENTRIES: SeedEntry[] = [
  {
    date: "2026-01-02",
    description: "Owner's opening investment",
    lines: [
      { code: "1010", direction: "debit", amount: "50000.00" },
      { code: "3000", direction: "credit", amount: "50000.00" },
    ],
  },
  {
    date: "2026-01-05",
    description: "Purchase of laptop and monitor",
    reference: "REC-0012",
    lines: [
      { code: "1500", direction: "debit", amount: "3200.00" },
      { code: "1010", direction: "credit", amount: "3200.00" },
    ],
  },
  {
    date: "2026-01-06",
    description: "January office rent",
    lines: [
      { code: "5100", direction: "debit", amount: "2400.00" },
      { code: "1010", direction: "credit", amount: "2400.00" },
    ],
  },
  {
    date: "2026-01-15",
    description: "Invoice #1001 — Northwind Traders",
    reference: "INV-1001",
    lines: [
      { code: "1200", direction: "debit", amount: "12500.00" },
      { code: "4100", direction: "credit", amount: "12500.00" },
    ],
  },
  {
    date: "2026-01-20",
    description: "Annual software subscriptions",
    lines: [
      { code: "5400", direction: "debit", amount: "1188.00" },
      { code: "2100", direction: "credit", amount: "1188.00" },
    ],
  },
  {
    date: "2026-02-03",
    description: "Payment received — Invoice #1001",
    reference: "INV-1001",
    lines: [
      { code: "1010", direction: "debit", amount: "12500.00" },
      { code: "1200", direction: "credit", amount: "12500.00" },
    ],
  },
  {
    date: "2026-02-06",
    description: "February office rent",
    lines: [
      { code: "5100", direction: "debit", amount: "2400.00" },
      { code: "1010", direction: "credit", amount: "2400.00" },
    ],
  },
  {
    date: "2026-02-14",
    description: "Contractor payment — design work",
    lines: [
      { code: "5500", direction: "debit", amount: "4750.00" },
      { code: "1010", direction: "credit", amount: "4750.00" },
    ],
  },
  {
    // A compound entry: one payment split across three expense accounts.
    date: "2026-02-28",
    description: "Business trip — client visit",
    reference: "EXP-0044",
    lines: [
      { code: "5600", direction: "debit", amount: "1840.50" },
      { code: "5700", direction: "debit", amount: "312.75" },
      { code: "5900", direction: "debit", amount: "45.00" },
      { code: "2100", direction: "credit", amount: "2198.25" },
    ],
  },
  {
    date: "2026-03-02",
    description: "Invoice #1002 — Contoso Ltd",
    reference: "INV-1002",
    lines: [
      { code: "1200", direction: "debit", amount: "18750.00" },
      { code: "4100", direction: "credit", amount: "18750.00" },
    ],
  },
  {
    date: "2026-03-06",
    description: "March office rent",
    lines: [
      { code: "5100", direction: "debit", amount: "2400.00" },
      { code: "1010", direction: "credit", amount: "2400.00" },
    ],
  },
  {
    date: "2026-03-10",
    description: "Credit card payment",
    lines: [
      { code: "2100", direction: "debit", amount: "3386.25" },
      { code: "1010", direction: "credit", amount: "3386.25" },
    ],
  },
  {
    date: "2026-03-25",
    description: "Quarterly utilities",
    lines: [
      { code: "5200", direction: "debit", amount: "687.40" },
      { code: "1010", direction: "credit", amount: "687.40" },
    ],
  },
];

async function main() {
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, DEMO_EMAIL))
    .limit(1);

  if (existing.length > 0) {
    console.log(`✓ ${DEMO_EMAIL} already exists — nothing to do.`);
    console.log("  Delete the user (or the database) to reseed.");
    return;
  }

  console.log("Creating demo organization…");
  const { orgId, userId } = await registerUser({
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD,
    name: "Demo User",
    organizationName: "Northwind Consulting",
  });

  // registerUser installs the default chart; map codes to the new ids.
  const chart = await db
    .select({ id: accountsTable.id, code: accountsTable.code })
    .from(accountsTable)
    .where(eq(accountsTable.orgId, orgId));

  const idByCode = new Map(chart.map((row) => [row.code, row.id]));

  console.log(`Posting ${ENTRIES.length} journal entries…`);

  for (const entry of ENTRIES) {
    const entryId = crypto.randomUUID();

    const lines = entry.lines.map((line, position) => {
      const accountId = idByCode.get(line.code);
      if (!accountId) throw new Error(`Seed references unknown account ${line.code}`);
      return {
        orgId,
        entryId,
        accountId,
        direction: line.direction,
        amount: parseAmount(line.amount),
        position,
      };
    });

    // Guard the seed data itself — a typo here would create books that
    // don't balance, which is exactly what this app claims is impossible.
    const debits = lines
      .filter((l) => l.direction === "debit")
      .reduce((sum, l) => sum + l.amount, 0);
    const credits = lines
      .filter((l) => l.direction === "credit")
      .reduce((sum, l) => sum + l.amount, 0);
    if (debits !== credits) {
      throw new Error(
        `Seed entry "${entry.description}" is out of balance: ${debits} vs ${credits}`,
      );
    }

    await db.transaction(async (tx) => {
      await tx.insert(journalEntries).values({
        id: entryId,
        orgId,
        date: entry.date,
        description: entry.description,
        reference: entry.reference ?? null,
        status: "posted",
        createdByUserId: userId,
      });
      await tx.insert(journalLines).values(lines);
    });
  }

  console.log("\n✓ Seeded.");
  console.log(`  Email:    ${DEMO_EMAIL}`);
  console.log(`  Password: ${DEMO_PASSWORD}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\nSeed failed:", error);
    process.exit(1);
  });
