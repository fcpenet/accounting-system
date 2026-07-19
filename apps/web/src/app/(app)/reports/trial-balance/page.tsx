import type { Metadata } from "next";
import Link from "next/link";
import { trialBalance } from "@acct/core";
import { DateRangeForm } from "@/components/date-range-form";
import { Money } from "@/components/money";
import { Alert, Card, EmptyState, PageHeader } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { formatDate, isValidISODate, todayISO } from "@/lib/dates";
import { listAccounts, listLedgerLines } from "@/lib/queries";

export const metadata: Metadata = { title: "Trial balance" };

export default async function TrialBalancePage({
  searchParams,
}: {
  searchParams: Promise<{ to?: string }>;
}) {
  const { user } = await requireSession();
  const params = await searchParams;

  const today = todayISO();
  const to = params.to && isValidISODate(params.to) ? params.to : today;

  const [accounts, lines] = await Promise.all([
    listAccounts(user.orgId, { includeArchived: true }),
    listLedgerLines(user.orgId, { to }),
  ]);

  const report = trialBalance(lines, accounts, { to });

  return (
    <>
      <PageHeader
        title="Trial balance"
        description={`As of ${formatDate(to)}`}
        action={
          <Link href="/reports" className="text-accent text-sm font-medium hover:underline">
            ← Reports
          </Link>
        }
      />

      <DateRangeForm action="/reports/trial-balance" to={to} mode="asOf" />

      {!report.balanced ? (
        <div className="mb-4">
          <Alert>
            <strong className="font-semibold">Out of balance.</strong> Debits and
            credits don&rsquo;t agree, which means something was written without
            passing entry validation.
          </Alert>
        </div>
      ) : null}

      <Card>
        {report.rows.length === 0 ? (
          <EmptyState
            title="Nothing to report"
            description="No postings on or before this date."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[32rem] text-sm">
              <thead>
                <tr className="text-ink-muted border-line border-b text-xs">
                  <th scope="col" className="px-4 py-2 text-left font-medium">
                    Account
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    Debit
                  </th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">
                    Credit
                  </th>
                </tr>
              </thead>

              <tbody className="divide-line divide-y">
                {report.rows.map((row) => (
                  <tr key={row.account.id} className="hover:bg-canvas">
                    <td className="px-4 py-2.5">
                      <Link
                        href={`/accounts/${row.account.id}`}
                        className="hover:text-accent"
                      >
                        <span className="tnum text-ink-subtle text-xs">
                          {row.account.code}
                        </span>{" "}
                        {row.account.name}
                      </Link>
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <Money value={row.debits} />
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <Money value={row.credits} />
                    </td>
                  </tr>
                ))}
              </tbody>

              <tfoot>
                <tr className="border-line border-t-2 font-semibold">
                  <td className="px-4 py-3">Total</td>
                  <td className="px-3 py-3 text-right">
                    <Money value={report.totalDebits} showZero />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Money value={report.totalCredits} showZero />
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Card>

      {report.balanced && report.rows.length > 0 ? (
        <p className="text-positive mt-3 text-xs font-medium">
          ✓ Debits equal credits — the ledger is internally consistent.
        </p>
      ) : null}
    </>
  );
}
