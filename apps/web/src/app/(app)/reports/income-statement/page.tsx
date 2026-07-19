import type { Metadata } from "next";
import Link from "next/link";
import { type AccountBalance, incomeStatement } from "@acct/core";
import { DateRangeForm } from "@/components/date-range-form";
import { Money } from "@/components/money";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { formatDate, isValidISODate, todayISO, yearStart } from "@/lib/dates";
import { listAccounts, listLedgerLines } from "@/lib/queries";

export const metadata: Metadata = { title: "Income statement" };

function Section({
  title,
  rows,
  total,
}: {
  title: string;
  rows: AccountBalance[];
  total: number;
}) {
  return (
    <>
      <tr className="bg-canvas">
        <th
          scope="colgroup"
          colSpan={2}
          className="text-ink px-4 py-2 text-left text-xs font-semibold tracking-wide uppercase"
        >
          {title}
        </th>
      </tr>

      {rows.length === 0 ? (
        <tr>
          <td colSpan={2} className="text-ink-subtle px-4 py-2.5 text-xs">
            None in this period
          </td>
        </tr>
      ) : (
        rows.map((row) => (
          <tr key={row.account.id} className="hover:bg-canvas">
            <td className="px-4 py-2.5">
              <Link href={`/accounts/${row.account.id}`} className="hover:text-accent">
                <span className="tnum text-ink-subtle text-xs">{row.account.code}</span>{" "}
                {row.account.name}
              </Link>
            </td>
            <td className="px-4 py-2.5 text-right">
              <Money value={row.balance} />
            </td>
          </tr>
        ))
      )}

      <tr className="border-line border-t font-medium">
        <td className="px-4 py-2.5">Total {title.toLowerCase()}</td>
        <td className="px-4 py-2.5 text-right">
          <Money value={total} showZero />
        </td>
      </tr>
    </>
  );
}

export default async function IncomeStatementPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { user } = await requireSession();
  const params = await searchParams;

  const today = todayISO();
  const to = params.to && isValidISODate(params.to) ? params.to : today;
  const from = params.from && isValidISODate(params.from) ? params.from : yearStart(to);

  const [accounts, lines] = await Promise.all([
    listAccounts(user.orgId, { includeArchived: true }),
    listLedgerLines(user.orgId, { from, to }),
  ]);

  const report = incomeStatement(lines, accounts, { from, to });
  const empty = report.income.length === 0 && report.expenses.length === 0;

  return (
    <>
      <PageHeader
        title="Income statement"
        description={`${formatDate(from)} – ${formatDate(to)}`}
        action={
          <Link href="/reports" className="text-accent text-sm font-medium hover:underline">
            ← Reports
          </Link>
        }
      />

      <DateRangeForm action="/reports/income-statement" from={from} to={to} />

      <Card>
        {empty ? (
          <EmptyState
            title="Nothing to report"
            description="No income or expense postings in this period."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[26rem] text-sm">
              <tbody className="divide-line divide-y">
                <Section title="Income" rows={report.income} total={report.totalIncome} />
                <Section
                  title="Expenses"
                  rows={report.expenses}
                  total={report.totalExpenses}
                />
              </tbody>

              <tfoot>
                <tr className="border-line border-t-2 text-base font-semibold">
                  <td className="px-4 py-3">Net income</td>
                  <td className="px-4 py-3 text-right">
                    <Money value={report.netIncome} showZero colour />
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Card>

      <p className="text-ink-subtle mt-3 text-xs">
        Income less expenses for the period. A figure in parentheses is a loss.
      </p>
    </>
  );
}
