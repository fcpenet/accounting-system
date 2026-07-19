import type { Metadata } from "next";
import Link from "next/link";
import {
  type Cents,
  accountBalances,
  balanceSheet,
  incomeStatement,
  trialBalance,
} from "@acct/core";
import { Money } from "@/components/money";
import { Alert, Button, Card, CardHeader, EmptyState, PageHeader } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { formatDate, formatMonth, monthStart, todayISO, yearStart } from "@/lib/dates";
import { listAccounts, listEntries, listLedgerLines } from "@/lib/queries";

export const metadata: Metadata = { title: "Overview" };

function Stat({
  label,
  value,
  caption,
  colour = false,
}: {
  label: string;
  value: Cents;
  caption: string;
  colour?: boolean;
}) {
  return (
    <Card className="p-4">
      <p className="text-ink-muted text-xs font-medium">{label}</p>
      <p className="mt-1.5 text-xl font-semibold sm:text-2xl">
        <Money value={value} colour={colour} />
      </p>
      <p className="text-ink-subtle mt-0.5 text-xs">{caption}</p>
    </Card>
  );
}

export default async function DashboardPage() {
  const { user } = await requireSession();

  const today = todayISO();
  const [accounts, lines, recentEntries] = await Promise.all([
    listAccounts(user.orgId),
    listLedgerLines(user.orgId),
    listEntries(user.orgId, { limit: 6 }),
  ]);

  const monthToDate = incomeStatement(lines, accounts, {
    from: monthStart(today),
    to: today,
  });
  const yearToDate = incomeStatement(lines, accounts, {
    from: yearStart(today),
    to: today,
  });
  const sheet = balanceSheet(lines, accounts, today);
  const tb = trialBalance(lines, accounts);

  // Cash-like assets: the accounts most people actually want at a glance.
  const cash = accountBalances(lines, accounts, { to: today })
    .filter((row) => row.account.type === "asset" && /^10/.test(row.account.code))
    .reduce<Cents>((total, row) => (total + row.balance) as Cents, 0 as Cents);

  return (
    <>
      <PageHeader
        title="Overview"
        description={formatMonth(today)}
        action={
          <Link href="/journal/new">
            <Button variant="primary">New entry</Button>
          </Link>
        }
      />

      {/*
        A failed trial balance means something wrote to the database without
        going through entry validation. Surfaced loudly rather than buried in
        a report nobody opens.
      */}
      {!tb.balanced ? (
        <div className="mb-4">
          <Alert>
            <strong className="font-semibold">Books are out of balance.</strong>{" "}
            Total debits ({<Money value={tb.totalDebits} />}) don&rsquo;t match total
            credits ({<Money value={tb.totalCredits} />}). Check the{" "}
            <Link href="/reports/trial-balance" className="underline">
              trial balance
            </Link>
            .
          </Alert>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Cash on hand" value={cash} caption={`As of ${formatDate(today)}`} />
        <Stat
          label="Net income"
          value={monthToDate.netIncome}
          caption="This month"
          colour
        />
        <Stat label="Net income" value={yearToDate.netIncome} caption="Year to date" colour />
        <Stat label="Total assets" value={sheet.totalAssets} caption="Balance sheet" />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="This month"
            subtitle={`${formatDate(monthStart(today))} – ${formatDate(today)}`}
          />
          <dl className="divide-line divide-y text-sm">
            <div className="flex items-center justify-between px-4 py-2.5">
              <dt className="text-ink-muted">Income</dt>
              <dd>
                <Money value={monthToDate.totalIncome} />
              </dd>
            </div>
            <div className="flex items-center justify-between px-4 py-2.5">
              <dt className="text-ink-muted">Expenses</dt>
              <dd>
                <Money value={monthToDate.totalExpenses} />
              </dd>
            </div>
            <div className="flex items-center justify-between px-4 py-2.5 font-semibold">
              <dt>Net</dt>
              <dd>
                <Money value={monthToDate.netIncome} colour />
              </dd>
            </div>
          </dl>
        </Card>

        <Card>
          <CardHeader
            title="Recent entries"
            action={
              <Link href="/journal" className="text-accent text-xs font-medium hover:underline">
                View all
              </Link>
            }
          />
          {recentEntries.length === 0 ? (
            <EmptyState
              title="No entries yet"
              description="Post your first journal entry to start building the ledger."
              action={
                <Link href="/journal/new">
                  <Button variant="primary" size="sm">
                    New entry
                  </Button>
                </Link>
              }
            />
          ) : (
            <ul className="divide-line divide-y">
              {recentEntries.map((entry) => {
                const total = entry.lines
                  .filter((line) => line.direction === "debit")
                  .reduce((sum, line) => sum + line.amount, 0);

                return (
                  <li key={entry.id}>
                    <Link
                      href={`/journal/${entry.id}`}
                      className="hover:bg-canvas flex items-center justify-between gap-3 px-4 py-3 transition-colors"
                    >
                      <div className="min-w-0">
                        <p className="text-ink truncate text-sm font-medium">
                          {entry.description}
                        </p>
                        <p className="text-ink-subtle text-xs">
                          {formatDate(entry.date)}
                          {entry.status === "reversed" ? " · reversed" : ""}
                        </p>
                      </div>
                      <Money
                        value={total}
                        className={`shrink-0 text-sm ${
                          entry.status === "reversed" ? "text-ink-subtle line-through" : ""
                        }`}
                      />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
